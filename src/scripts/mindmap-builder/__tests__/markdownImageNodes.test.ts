import { afterEach, expect, it, vi } from "vitest";
import { addLocalMarkdownImage } from "../markdownImageNodes.js";

class ImageHost {
  next = 0;
  elements = new Map<
    string,
    { id: string; fileId: string; width: number; height: number; crop?: null; customData?: object }
  >();
  sources = new Map<string, { markdown: string }>();
  defaults = {
    width: 400,
    border: { enabled: false },
    transclusion: { border: { enabled: false } },
  };
  render = vi.fn(async () => ({
    dataURL: "data:image/svg+xml;base64,AA==",
    size: { width: 400, height: 200 },
    hasSVGwithBitmap: false,
  }));
  api = { isDestroyed: false };
  view = {
    file: { path: "Target.excalidraw.md" },
    isClosingOrMigrating: () => false,
    excalidrawData: {
      setMarkdownImage: (id: string, source: { markdown: string }) => this.sources.set(id, source),
    },
  };
  ea = {
    targetView: this.view,
    plugin: { settings: { markdownImageSettings: { defaults: this.defaults } } },
    getExcalidrawAPI: () => this.api,
    getEmbeddedFilesLoader: () => ({ renderMarkdownToSVG: this.render }),
    generateElementId: () => `file-${++this.next}`,
    addImage: vi.fn(async () => {
      const id = `element-${++this.next}`;
      this.elements.set(id, { id, fileId: "rendered-hash", width: 400, height: 200 });
      return id;
    }),
    getElement: (id: string) => this.elements.get(id)!,
    getElements: () => [...this.elements.values()],
    imagesDict: {} as Record<string, unknown>,
  };
}
afterEach(() => vi.restoreAllMocks());

it("renders independent editable images at their exported size with exact source and appearance", async () => {
  const h = new ImageHost();
  const source = {
    markdown: "# Title\n\n- child\n",
    width: 240,
    render: { width: 400, border: { enabled: true } },
  };
  const first = await addLocalMarkdownImage(h.ea, source, 10, 20);
  const second = await addLocalMarkdownImage(h.ea, source, 10, 20);
  expect(h.elements.get(first)).toMatchObject({
    width: 240,
    height: 120,
    customData: {
      markdownImage: { source: "local", schemaVersion: 1, render: { border: { enabled: true } } },
    },
  });
  const firstFile = h.elements.get(first)!.fileId;
  const secondFile = h.elements.get(second)!.fileId;
  expect(firstFile).not.toBe(secondFile);
  expect(h.sources.get(firstFile)).toEqual({ markdown: source.markdown });
  expect(h.sources.get(secondFile)).toEqual({ markdown: source.markdown });
  h.sources.set(firstFile, { markdown: "Edited" });
  expect(h.sources.get(secondFile)?.markdown).toBe(source.markdown);
  expect(h.ea.imagesDict[firstFile]).toMatchObject({ mimeType: "image/svg+xml" });
  expect(h.render).toHaveBeenCalledWith(
    h.ea.targetView.file,
    source.markdown,
    expect.objectContaining({ width: 400 }),
  );
});

it("abandons a rendered image if its destination retires while rendering", async () => {
  const h = new ImageHost();
  h.render.mockImplementationOnce(async () => {
    h.api.isDestroyed = true;
    return {
      dataURL: "data:image/svg+xml;base64,AA==",
      size: { width: 400, height: 200 },
      hasSVGwithBitmap: false,
    };
  });
  await expect(addLocalMarkdownImage(h.ea, { markdown: "Body" }, 0, 0)).rejects.toThrow();
  expect(h.ea.addImage).not.toHaveBeenCalled();
  expect(h.sources.size).toBe(0);
});
