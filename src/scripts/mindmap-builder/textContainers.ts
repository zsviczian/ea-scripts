/** @file Text-first sizing for Builder's rectangle, ellipse and diamond nodes. */
import type {
  ExcalidrawTextContainer,
  ExcalidrawTextElement,
} from "@zsviczian/excalidraw/element/types";

type Writable<T> = { -readonly [K in keyof T]: T[K] };
export type MindmapTextContainer = Writable<
  Extract<ExcalidrawTextContainer, { type: "rectangle" | "ellipse" | "diamond" }>
>;

interface TextContainerLayout {
  container: MindmapTextContainer;
  textElement: Writable<ExcalidrawTextElement>;
  renderedText: string;
  maxWidth: number;
  padding: number;
  preserveCenter?: boolean;
  lib: Pick<
    typeof window.ExcalidrawLib,
    "getBoundTextMaxWidth" | "getFontString" | "wrapText" | "measureText"
  >;
}

/** Mirrors the inscribed text rectangle in the fork's element/src/textElement.ts. */
function getTextAreaScale(container: MindmapTextContainer): number {
  if (container.customData?.legacyTextWrap) return 1;
  if (container.type === "ellipse") return Math.SQRT2;
  return container.type === "diamond" ? 2 : 1;
}

/** Sizes a workbench container before wrapping, then positions its label as the editor does. */
export function fitTextContainer(options: TextContainerLayout): void {
  const { container, textElement, lib } = options;
  const scale = getTextAreaScale(container);
  // Read the runtime's native inset rather than duplicating BOUND_TEXT_PADDING.
  const nativePadding =
    (container.width - lib.getBoundTextMaxWidth({ ...container, type: "rectangle" })) / 2;
  const padding = Math.max(nativePadding, options.padding);
  const center = { x: container.x + container.width / 2, y: container.y + container.height / 2 };
  const font = lib.getFontString(textElement);
  const naturalWidth = lib.measureText(options.renderedText, font, textElement.lineHeight).width;
  const textWidth = Math.min(
    options.maxWidth,
    Math.ceil(naturalWidth) + 2 * (padding - nativePadding),
  );
  container.width = Math.ceil((textWidth + 2 * nativePadding) * scale);
  const availableWidth = lib.getBoundTextMaxWidth(container);
  const wrappedText = lib.wrapText(options.renderedText, font, availableWidth);
  const metrics = lib.measureText(wrappedText, font, textElement.lineHeight);
  container.height = Math.ceil((Math.ceil(metrics.height) + 2 * padding) * scale);
  if (options.preserveCenter) {
    container.x = center.x - container.width / 2;
    container.y = center.y - container.height / 2;
  }
  textElement.originalText = options.renderedText;
  textElement.text = wrappedText;
  textElement.width = metrics.width;
  textElement.height = metrics.height;
  // Bound labels always auto-size within their container, even when they wrap.
  textElement.autoResize = true;
  positionBoundText(container, textElement, { scale, nativePadding, availableWidth });
}

/** Matches native bound-text alignment, including its integer rounding and rotated containers. */
function positionBoundText(
  container: MindmapTextContainer,
  text: Writable<ExcalidrawTextElement>,
  area: { scale: number; nativePadding: number; availableWidth: number },
): void {
  const insetX = (container.width * (1 - 1 / area.scale)) / 2 + area.nativePadding;
  const insetY = (container.height * (1 - 1 / area.scale)) / 2 + area.nativePadding;
  const availableHeight = Math.round(container.height / area.scale) - 2 * area.nativePadding;
  const align = text.textAlign === "left" ? 0 : text.textAlign === "right" ? 1 : 0.5;
  const verticalAlign =
    text.verticalAlign === "top" ? 0 : text.verticalAlign === "bottom" ? 1 : 0.5;
  const x = container.x + insetX + align * (area.availableWidth - text.width);
  const y = container.y + insetY + verticalAlign * (availableHeight - text.height);
  const cx = container.x + insetX + area.availableWidth / 2;
  const cy = container.y + insetY + availableHeight / 2;
  const dx = x + text.width / 2 - cx;
  const dy = y + text.height / 2 - cy;
  text.x = cx + dx * Math.cos(container.angle) - dy * Math.sin(container.angle) - text.width / 2;
  text.y = cy + dx * Math.sin(container.angle) + dy * Math.cos(container.angle) - text.height / 2;
  text.angle = container.angle;
}
