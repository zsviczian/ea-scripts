/**
 * @file SlidePreviewService.ts
 * @overview Generates and caches one scene SVG, then crops clones for sorter previews.
 */

import {
  getNavigationRect,
  translateNavigationRect,
  type SceneBounds,
} from "../../sharedUtils/presentationGeometry";
import type { SlideDeckSlide } from "./SlideDeck";

const PREVIEW_WIDTH = 320;
const PREVIEW_HEIGHT = 180;
const EXPORT_PADDING = 10;

interface CachedSceneSvg {
  fingerprint: string;
  svgMarkup: string;
  sceneBounds: SceneBounds;
}

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
  return copy;
}

/** Creates a stable visual fingerprint that ignores slideshow-only metadata changes. */
export function getSceneVisualFingerprint(elements: readonly ExcalidrawElement[]): string {
  return JSON.stringify(elements.map(cloneWithoutMetadata));
}

/** Owns the expensive whole-scene SVG export used by slide thumbnails. */
export class SlidePreviewService {
  private cached: CachedSceneSvg | null = null;
  private pending: Promise<CachedSceneSvg> | null = null;
  private pendingFingerprint = "";

  public constructor(
    private readonly ea: ExcalidrawAutomate,
    private readonly api: ExcalidrawAPI,
    private readonly maxZoom: number,
  ) {}

  /** Drops all cached SVG state, for example after switching drawings. */
  public clear(): void {
    this.cached = null;
    this.pending = null;
    this.pendingFingerprint = "";
  }

  private async ensureSceneSvg(elements: readonly ExcalidrawElement[]): Promise<CachedSceneSvg> {
    const fingerprint = getSceneVisualFingerprint(elements);
    if (this.cached?.fingerprint === fingerprint) return this.cached;
    if (this.pending && this.pendingFingerprint === fingerprint) return this.pending;

    this.pendingFingerprint = fingerprint;
    this.pending = (async () => {
      const appState = this.api.getAppState();
      const svg = await this.ea.createViewSVG({
        withBackground: true,
        theme: appState.theme,
        frameRendering: {
          enabled: true,
          name: false,
          outline: false,
          clip: false,
        },
        padding: EXPORT_PADDING,
        selectedOnly: false,
        skipInliningFonts: false,
        embedScene: false,
      });
      const bounds = this.ea.getBoundingBox(elements);
      const cached = {
        fingerprint,
        svgMarkup: svg.outerHTML,
        sceneBounds: { topX: bounds.topX, topY: bounds.topY },
      };
      this.cached = cached;
      return cached;
    })();
    try {
      return await this.pending;
    } finally {
      if (this.pendingFingerprint === fingerprint) {
        this.pending = null;
        this.pendingFingerprint = "";
      }
    }
  }

  /** Creates a cropped SVG preview in the sidepanel's current owner document. */
  public async createPreview(
    slide: SlideDeckSlide,
    ownerDocument: Document,
  ): Promise<SVGSVGElement | null> {
    const elements = this.ea.getViewElements();
    if (elements.length === 0) return null;
    const cached = await this.ensureSceneSvg(elements);
    const host = ownerDocument.createElement("div");
    host.innerHTML = cached.svgMarkup;
    const clone = host.firstElementChild as SVGSVGElement | null;
    if (!clone || clone.tagName.toLowerCase() !== "svg") return null;

    const rect = translateNavigationRect(
      getNavigationRect(
        slide.rect,
        { width: PREVIEW_WIDTH, height: PREVIEW_HEIGHT },
        this.maxZoom,
      ),
      cached.sceneBounds,
      EXPORT_PADDING,
    );
    const width = Math.abs(rect.right - rect.left);
    const height = Math.abs(rect.bottom - rect.top);
    clone.setAttribute("viewBox", `${rect.left} ${rect.top} ${width} ${height}`);
    clone.setAttribute("width", "100%");
    clone.setAttribute("height", "100%");
    clone.setAttribute("preserveAspectRatio", "xMidYMid meet");
    clone.setAttribute("aria-hidden", "true");
    return clone;
  }
}
