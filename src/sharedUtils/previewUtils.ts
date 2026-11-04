/** Shared, bounded scene-raster exports. Callers own visibility, queueing and cache lifetime. */
interface CachedElementFingerprint {
  version: unknown;
  versionNonce: unknown;
  value: string;
}

const elementFingerprintCache = new WeakMap<object, CachedElementFingerprint>();

function cloneWithoutMetadata(element: ExcalidrawElement): Record<string, unknown> {
  const copy = { ...(element as unknown as Record<string, unknown>) };
  const customData = copy.customData;
  if (typeof customData === "object" && customData !== null && !Array.isArray(customData)) {
    const visualCustomData = { ...(customData as Record<string, unknown>) };
    delete visualCustomData.slideshow;
    if (Object.keys(visualCustomData).length === 0) delete copy.customData;
    else copy.customData = visualCustomData;
  }
  delete copy.version;
  delete copy.versionNonce;
  delete copy.updated;
  // Frame names are rendered by Excalidraw's frame UI, but preview exports explicitly
  // disable them. Renaming a slide therefore cannot change the preview bitmap.
  if (copy.type === "frame") delete copy.name;
  return copy;
}

/** Creates a stable visual fingerprint that ignores slideshow-only metadata changes. */
export function getSceneVisualFingerprint(elements: readonly ExcalidrawElement[]): string {
  return `[${elements
    .map((element) => {
      const raw = element as unknown as Record<string, unknown>;
      const cacheKey = element as unknown as object;
      if (raw.version === undefined && raw.versionNonce === undefined) {
        return JSON.stringify(cloneWithoutMetadata(element));
      }
      const cached = elementFingerprintCache.get(cacheKey);
      if (cached && cached.version === raw.version && cached.versionNonce === raw.versionNonce) {
        return cached.value;
      }
      const value = JSON.stringify(cloneWithoutMetadata(element));
      elementFingerprintCache.set(cacheKey, {
        version: raw.version,
        versionNonce: raw.versionNonce,
        value,
      });
      return value;
    })
    .join(",")}]`;
}

/** Scene rectangle exported without expanding its aspect ratio. */
export interface PreviewArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Renders only the supplied area at bounded resolution, without touching EA's workbench. */
export function exportAreaPreviewPNG(
  ea: Pick<ExcalidrawAutomate, "createViewPNG">,
  options: {
    elements: readonly ExcalidrawElement[];
    area: PreviewArea;
    targetWidth: number;
    theme: "light" | "dark";
  },
): Promise<Blob> {
  const scale = Math.min(2, Math.max(options.targetWidth / Math.max(options.area.width, 1), 0.01));
  return ea.createViewPNG({
    withBackground: true,
    theme: options.theme,
    frameRendering: { enabled: true, name: false, outline: false, clip: false },
    padding: 0,
    selectedOnly: false,
    embedScene: false,
    elementsOverride: options.elements,
    exportArea: options.area,
    scale,
  });
}
