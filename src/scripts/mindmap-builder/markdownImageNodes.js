/** Render a portable local source into the current EA workbench, without committing it. */
export async function addLocalMarkdownImage(ea, image, x, y) {
  const view = ea.targetView;
  const api = ea.getExcalidrawAPI();
  const file = view.file;
  const alive = () => ea.targetView === view && view.file === file &&
    ea.getExcalidrawAPI() === api && !api.isDestroyed && !view.isClosingOrMigrating();
  const defaults = ea.plugin.settings.markdownImageSettings.defaults;
  const stored = image.render ?? {};
  const render = { ...defaults, ...stored,
    border: { ...defaults.border, ...stored.border },
    transclusion: { ...defaults.transclusion, ...stored.transclusion,
      border: { ...defaults.transclusion.border, ...stored.transclusion?.border } },
  };
  const rendered = await ea.getEmbeddedFilesLoader(false).renderMarkdownToSVG(file, image.markdown, render);
  if (!alive() || !rendered.dataURL || rendered.size.height <= 0) throw new Error("Markdown-image rendering unavailable");
  const id = await ea.addImage(x, y, rendered.dataURL, false, false);
  if (!id || !alive()) throw new Error("Markdown-image destination changed");
  const element = ea.getElement(id);
  const previousFileId = element.fileId;
  const fileId = ea.generateElementId();
  element.fileId = fileId;
  element.width = image.width ?? render.width;
  element.height = rendered.size.height * element.width / rendered.size.width;
  element.crop = null;
  element.customData = { ...element.customData, markdownImage: {
    schemaVersion: 1, version: 1, source: "local", render, renderedSize: { ...rendered.size },
  } };
  ea.imagesDict[fileId] = { id: fileId, dataURL: rendered.dataURL, mimeType: "image/svg+xml",
    created: Date.now(), size: rendered.size, hasSVGwithBitmap: rendered.hasSVGwithBitmap };
  if (!ea.getElements().some(e => e.fileId === previousFileId)) delete ea.imagesDict[previousFileId];
  view.excalidrawData.setMarkdownImage(fileId, { markdown: image.markdown });
  return id;
}
