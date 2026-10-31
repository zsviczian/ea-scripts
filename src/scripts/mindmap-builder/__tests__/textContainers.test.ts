import { afterEach, expect, it, vi } from "vitest";
import { nodeHost, lib, nativeTextWidth, type FixtureElement } from "./textContainerFixture";
import { fitTextContainer, type MindmapTextContainer } from "../textContainers";
import type { ExcalidrawTextElement } from "@zsviczian/excalidraw/element/types";

afterEach(() => vi.unstubAllGlobals());

/** Checks the usable inscribed text rectangle, rather than only the outer shape bounds. */
function expectFittingLabel(box: FixtureElement, text: FixtureElement): void {
  expect(text.width).toBeLessThanOrEqual(nativeTextWidth(box));
  const scale = box.type === "diamond" ? 2 : box.type === "ellipse" ? Math.SQRT2 : 1;
  expect(text.height).toBeLessThanOrEqual(Math.round(box.height / scale) - 10);
  expect(text.text).toBe(
    lib.wrapText(
      String(text.originalText),
      lib.getFontString(text as unknown as ExcalidrawTextElement),
      nativeTextWidth(box),
    ),
  );
  expect(String(text.text)).not.toMatch(/^\n/);
  expect(Math.abs(text.x + text.width / 2 - (box.x + box.width / 2))).toBeLessThan(0.5);
  expect(Math.abs(text.y + text.height / 2 - (box.y + box.height / 2))).toBeLessThan(0.5);
}

it.each(["rectangle", "ellipse", "diamond"])(
  "sizes a new %s root from its unwrapped label",
  async (shape) => {
    const { ea, nodes } = nodeHost();
    const node = await nodes.addNode("Project Launch", true, true, [], null, null, null, shape);
    const box = ea.getElement(node!.id);
    const text = ea.getElement(box.boundElements[0]!.id);
    expect(text.text).toBe("Project Launch");
    expectFittingLabel(box, text);
    const scale = shape === "diamond" ? 2 : shape === "ellipse" ? Math.SQRT2 : 1;
    expect(box.height).toBe(Math.ceil((text.height + 20) * scale));
  },
);

it.each(["rectangle", "ellipse", "diamond"])(
  "sizes a new %s child before creating its branch arrow",
  async (shape) => {
    const { ea, nodes } = nodeHost();
    const parent = ea.element("rectangle", {
      customData: { growthMode: "Right-facing" },
      strokeColor: "#000000",
    });
    const node = await nodes.addNode(
      "Social Media",
      false,
      true,
      [parent],
      parent,
      null,
      null,
      shape,
    );
    const box = ea.getElement(node!.id);
    const text = ea.getElement(box.boundElements[0]!.id);
    expect(text.text).toBe("Social Media");
    expectFittingLabel(box, text);
    expect(ea.getElements().find((el) => el.type === "arrow")?.endBinding).toEqual({
      elementId: box.id,
    });
  },
);

it("uses Builder's padding for ordinary boxed children as well as Mermaid nodes", async () => {
  const { ea, nodes } = nodeHost({ padding: 16, boxChildren: true });
  const parent = ea.element("rectangle", { customData: { growthMode: "Right-facing" } });
  const node = await nodes.addNode("Competitors", false, true, [parent], parent);
  const box = ea.getElement(node!.id);
  const text = ea.getElement(box.boundElements[0]!.id);
  expectFittingLabel(box, text);
  expect(box.height).toBe(text.height + 32);
});

it.each(["rectangle", "ellipse", "diamond"])(
  "wraps a long %s label within the allowed text width",
  async (shape) => {
    const { ea, nodes } = nodeHost();
    const label =
      "A long project label that should wrap at the configured text width rather than inside a smaller shape";
    const node = await nodes.addNode(label, true, true, [], null, null, null, shape);
    const box = ea.getElement(node!.id);
    const text = ea.getElement(box.boundElements[0]!.id);
    expect(text.text).toContain("\n");
    expect(text.originalText).toBe(label);
    expect(text.rawText).toBe(label);
    expect(nativeTextWidth(box)).toBeGreaterThanOrEqual(450);
    expect(nativeTextWidth(box)).toBeLessThan(451);
    expectFittingLabel(box, text);
  },
);

it("retains explicit label line breaks and the native minimum padding", async () => {
  const { ea, nodes } = nodeHost({ padding: 0 });
  const node = await nodes.addNode("Project\nLaunch", true, true, [], null, null, null, "diamond");
  const box = ea.getElement(node!.id);
  const text = ea.getElement(box.boundElements[0]!.id);
  expect(text.text).toBe("Project\nLaunch");
  expect(box.height).toBe(2 * (text.height + 10));
  expectFittingLabel(box, text);
});

it("fits an edited rotated diamond without moving its center or losing its raw link", async () => {
  const { ea, nodes } = nodeHost();
  const node = await nodes.addNode("Old", true, true, [], null, null, null, "diamond");
  const box = ea.getElement(node!.id);
  const text = ea.getElement(box.boundElements[0]!.id);
  box.angle = Math.PI / 6;
  const center = [box.x + box.width / 2, box.y + box.height / 2];
  text.rawText = "[[Project Launch|Project]]";
  fitTextContainer({
    container: box as unknown as MindmapTextContainer,
    textElement: text as unknown as ExcalidrawTextElement,
    renderedText: "Project",
    maxWidth: 450,
    padding: 10,
    preserveCenter: true,
    lib,
  });
  expect([box.x + box.width / 2, box.y + box.height / 2]).toEqual(center);
  expect(text.rawText).toBe("[[Project Launch|Project]]");
  expect(text.angle).toBe(box.angle);
  expectFittingLabel(box, text);
});

it("honors the existing legacy rectangular wrapping flag", async () => {
  const { ea, nodes } = nodeHost();
  const node = await nodes.addNode("Legacy", true, true, [], null, null, null, "ellipse");
  const box = ea.getElement(node!.id);
  const text = ea.getElement(box.boundElements[0]!.id);
  box.customData.legacyTextWrap = true;
  fitTextContainer({
    container: box as unknown as MindmapTextContainer,
    textElement: text as unknown as ExcalidrawTextElement,
    renderedText: "Legacy",
    maxWidth: 450,
    padding: 10,
    lib,
  });
  expect(box.width).toBe(text.width + 20);
  expect(box.height).toBe(text.height + 20);
});
