import { describe, it, expect, vi } from "vitest";
import { exportAreaPreviewPNG, getSceneVisualFingerprint } from "../previewUtils";

describe("shared preview export contract", () => {
  it.each([[100, 480, 2], [1920, 480, 0.25], [100000, 1, 0.01]])("bounds resolution for area %s and width %s", async (width, targetWidth, scale) => {
    const scene = [{id: "a", type: "rectangle", opacity: 80, customData: {visual: true}}] as unknown as ExcalidrawElement[];
    const before = structuredClone(scene);
    const createViewPNG = vi.fn(async () => new Blob(["png"]));
    const ea = {createViewPNG} as unknown as ExcalidrawAutomate;
    const area = {x: -300, y: 80, width, height: 400};
    await exportAreaPreviewPNG(ea, {elements: scene, area, theme: "dark", targetWidth});
    expect(createViewPNG).toHaveBeenCalledExactlyOnceWith({withBackground: true, theme: "dark", frameRendering: {enabled: true, name: false, outline: false, clip: false}, padding: 0, selectedOnly: false, embedScene: false, elementsOverride: scene, exportArea: area, scale});
    expect(scene).toEqual(before);
  });
  it("preserves fingerprints through frame titles/notes/order/version edits but detects visual changes", () => {
    const a = {id: "a", type: "frame", name: "A", version: 1, versionNonce: 1, updated: 1, customData: {slideshow: {order: 1}, visual: "a"}} as unknown as ExcalidrawElement;
    const b = {...a, name: "Renamed", version: 2, versionNonce: 2, customData: {slideshow: {order: 9, notes: "changed"}, visual: "a"}} as unknown as ExcalidrawElement;
    expect(getSceneVisualFingerprint([a])).toBe(getSceneVisualFingerprint([b]));
    expect(getSceneVisualFingerprint([a])).not.toBe(getSceneVisualFingerprint([{...b, customData: {visual: "b"}} as ExcalidrawElement]));
  });
});
