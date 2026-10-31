import { vi } from "vitest";
import { createNodes } from "../nodes.js";
import type { MindmapTextContainer } from "../textContainers";

export interface FixtureElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  customData: Record<string, unknown>;
  boundElements: { id: string; type: string }[];
  groupIds: string[];
  [key: string]: unknown;
}

interface FixtureColor {
  invert: () => FixtureColor;
  stringHEX: () => string;
  stringRGB: () => string;
}

/** Native text-area contracts from the fork, independent of Builder's sizing calculation. */
export function nativeTextWidth(
  container: Pick<FixtureElement, "type" | "width" | "customData">,
): number {
  if (!container.customData?.legacyTextWrap) {
    if (container.type === "diamond") return Math.round(container.width / 2) - 10;
    if (container.type === "ellipse") return Math.round((container.width / 2) * Math.SQRT2) - 10;
  }
  return container.width - 10;
}

/** Deterministic font metrics keep tests independent of browser canvas/font loading. */
export function measure(text: string, font: string): { width: number; height: number } {
  const size = Number.parseFloat(font);
  const lines = text.split("\n");
  return {
    width: (Math.max(...lines.map((line) => line.length)) * size) / 2,
    height: lines.length * size * 1.25,
  };
}

/** Simulates native word wrapping, including breaking an oversized word. */
export function wrap(text: string, font: string, width: number): string {
  const limit = Math.max(1, Math.floor(width / (Number.parseFloat(font) / 2)));
  return text
    .split("\n")
    .map((line) => {
      const result: string[] = [];
      let current = "";
      for (const word of line.split(" ")) {
        if (current && current.length + word.length + 1 > limit) {
          result.push(current);
          current = "";
        }
        let rest = word;
        while (rest.length > limit) {
          result.push(rest.slice(0, limit));
          rest = rest.slice(limit);
        }
        current += `${current ? " " : ""}${rest}`;
      }
      return [...result, current].join("\n");
    })
    .join("\n");
}

export const lib = {
  getFontString: (text: { fontSize: number }) => `${text.fontSize}px fixture`,
  getFontFamilyString: () => "fixture",
  getBoundTextMaxWidth: nativeTextWidth,
  wrapText: wrap,
  measureText: measure,
} as unknown as typeof window.ExcalidrawLib;

/** Models EA's addText shortcut: it uses rectangular padding, then can shrink a shape after wrapping. */
export class FixtureEA {
  elementsDict: Record<string, FixtureElement> = {};
  style = {
    fontSize: 36,
    fontFamily: 1,
    strokeColor: "#000000",
    ["backgroundColor"]: "transparent",
  };
  private sequence = 0;
  generateElementId = (): string => `el-${this.sequence++}`;
  getElement = (id: string): FixtureElement => this.elementsDict[id]!;
  getElements = (): FixtureElement[] => Object.values(this.elementsDict);
  getViewElements = this.getElements;
  getCM = (): FixtureColor => ({
    invert: this.getCM,
    stringHEX: () => "#000000",
    stringRGB: () => "rgb(0,0,0)",
  });
  measureText = (text: string): { width: number; height: number } =>
    measure(text, `${this.style.fontSize}px`);
  addAppendUpdateCustomData = (id: string, data: object): void => {
    Object.assign(this.getElement(id).customData, data);
  };
  /** Creates structural fixtures without simulating unrelated EA operations. */
  element(type: string, props: object = {}): FixtureElement {
    const element = {
      id: this.generateElementId(),
      type,
      x: 0,
      y: 0,
      width: 100,
      height: 20,
      angle: 0,
      customData: {},
      groupIds: [],
      boundElements: [],
      ...props,
    };
    this.elementsDict[element.id] = element;
    return element;
  }
  /** Replicates the relevant addText behavior from ExcalidrawAutomate, not the fix under test. */
  addText(
    x: number,
    y: number,
    raw: string,
    formatting: Record<string, unknown>,
    id: string,
  ): string {
    const metrics = this.measureText(raw);
    const padding = Number(formatting.boxPadding ?? 30);
    const text = this.element("text", {
      id,
      x,
      y,
      ...metrics,
      text: raw,
      rawText: raw,
      originalText: raw,
      fontSize: this.style.fontSize,
      fontFamily: 1,
      lineHeight: 1.25,
      autoResize: true,
      textAlign: formatting.textAlign,
      verticalAlign: formatting.textVerticalAlign,
    });
    if (!formatting.box) return text.id;
    const box = this.element(String(formatting.box), {
      x: x - padding,
      y: y - padding,
      width: Number(formatting.width ?? metrics.width) + 2 * padding,
      height: Number(formatting.height ?? metrics.height) + 2 * padding,
      boundElements: [{ type: "text", id }],
    });
    text.containerId = box.id;
    if (!formatting.width) {
      text.text = wrap(raw, `${text.fontSize}px`, nativeTextWidth(box));
      Object.assign(text, this.measureText(String(text.text)));
      box.width = text.width + 2 * padding;
      box.height = text.height + 2 * padding;
    }
    return box.id;
  }
  addArrow = (_points: unknown, bindings: { startObjectId: string; endObjectId: string }): string =>
    this.element("arrow", {
      startBinding: { elementId: bindings.startObjectId },
      endBinding: { elementId: bindings.endObjectId },
    }).id;
}

/** Runs the real node factory in batch mode with a minimal, invocation-local scene host. */
export function nodeHost(options: { padding?: number; boxChildren?: boolean } = {}): {
  ea: FixtureEA;
  nodes: ReturnType<typeof createNodes>;
} {
  const ea = new FixtureEA();
  vi.stubGlobal("ExcalidrawLib", lib);
  const ctx = {
    ea,
    isViewSet: () => true,
    parseImageInput: () => null,
    parseEmbeddableInput: () => null,
    parseText: (text: string) => Promise.resolve(text),
    getAdjustedMaxWidth: async (text: string, maxWidth: number) => {
      const wrappedText = wrap(text, `${ea.style.fontSize}px`, maxWidth);
      const metrics = ea.measureText(wrappedText);
      return { width: Math.ceil(metrics.width), height: metrics.height, wrappedText };
    },
    getAppState: () => ({ viewBackgroundColor: "#ffffff", currentItemFontFamily: 1 }),
    getFontScale: () => [36, 28, 20, 16, 12],
    getStrokeWidthForDepth: () => 2,
    getChildrenNodes: () => [],
    getMindmapOrder: () => 0,
    getSettingsRootNode: (parent: unknown) => parent,
    getDepthFromAncestor: () => 0,
    getDynamicColor: () => "#000000",
    calculateStrokeWidth: () => 2,
    getRootConfigForNode: () => ({ layoutSettings: { CONTAINER_PADDING: options.padding ?? 10 } }),
    getNodeBox: (node: MindmapTextContainer) => ({ minX: node.x, minY: node.y, ...node }),
    currentModalGrowthMode: "Right-facing",
    maxWidth: 450,
    centerText: true,
    boxChildren: options.boxChildren ?? false,
    layoutSettings: { CONTAINER_PADDING: options.padding ?? 10 },
  };
  return { ea, nodes: createNodes(ctx) };
}
