/**
 * @file SlidePreviewService.ts
 * @overview Generates cached scene SVGs, then crops clones for sorter and presenter previews.
 */

import {
  getNavigationRect,
  translateNavigationRect,
  type SceneBounds,
} from "../../sharedUtils/presentationGeometry";
import { resolveAnimationTargetElementIds } from "./AnimationRuntime";
import type { FrameDeckSlide, SlideDeckSlide } from "./SlideDeck";
import type { SlideshowConfig } from "./types";

const EXPORT_PADDING = 10;
const FALLBACK_BACKGROUND = "#ffffff";
const MAX_CACHE_ENTRIES = 12;

interface CachedSceneSvg {
  fingerprint: string;
  svgMarkup: string;
  sceneBounds: SceneBounds;
  backgroundColor: string;
}

export interface SlidePreviewState {
  /** Number of frame build steps that should already be visible. Omit for final state. */
  completedAnimationSteps?: number;
  /** Restores animation-time opacity overrides before applying the requested preview build. */
  originalOpacities?: ReadonlyMap<string, number>;
}

const EA_EXPORT_QUEUES = new WeakMap<object, Promise<void>>();

async function withEaExportLock<T>(ea: ExcalidrawAutomate, task: () => Promise<T>): Promise<T> {
  const key = ea as unknown as object;
  const previous = EA_EXPORT_QUEUES.get(key) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  EA_EXPORT_QUEUES.set(key, previous.catch(() => undefined).then(() => gate));
  await previous.catch(() => undefined);
  try {
    return await task();
  } finally {
    release?.();
  }
}

/** Calculates sorter crops using the configured presentation/print viewport. */
export function getPreviewNavigationRect(
  slide: SlideDeckSlide,
  maxZoom: number,
  printSlideWidth = 1920,
  printSlideHeight = 1080,
): ReturnType<typeof getNavigationRect> {
  return getNavigationRect(
    slide.rect,
    { width: printSlideWidth, height: printSlideHeight },
    maxZoom,
  );
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

function readBackgroundColor(appState: ReturnType<ExcalidrawAPI["getAppState"]>): string {
  return typeof appState.viewBackgroundColor === "string"
    ? appState.viewBackgroundColor
    : FALLBACK_BACKGROUND;
}

export function getHiddenBuildElementIds(
  slide: FrameDeckSlide,
  completedAnimationSteps: number | undefined,
  elements: readonly ExcalidrawElement[],
): string[] {
  if (completedAnimationSteps === undefined) return [];
  const completed = Math.min(Math.max(Math.trunc(completedAnimationSteps), 0), slide.animationSteps.length);
  const ids = new Set<string>();
  for (const step of slide.animationSteps.slice(completed)) {
    for (const id of resolveAnimationTargetElementIds(slide.frameId, step.targets, elements)) {
      ids.add(id);
    }
  }
  return [...ids].sort();
}

/** Owns the expensive whole-scene SVG exports used by slide thumbnails and presenter builds. */
export class SlidePreviewService {
  private readonly cached = new Map<string, CachedSceneSvg>();
  private readonly pending = new Map<string, Promise<CachedSceneSvg>>();

  public constructor(
    private readonly ea: ExcalidrawAutomate,
    private readonly api: ExcalidrawAPI,
    private readonly config: SlideshowConfig,
  ) {}

  /** Returns the drawing background used behind crop areas outside exported scene bounds. */
  public getBackgroundColor(): string {
    return readBackgroundColor(this.api.getAppState());
  }

  /** Returns the configured presentation aspect ratio used by sorter previews. */
  public getAspectRatio(): string {
    return `${this.config.printSlideWidth} / ${this.config.printSlideHeight}`;
  }

  /** Drops all cached SVG state, for example after switching drawings. */
  public clear(): void {
    this.cached.clear();
    this.pending.clear();
  }

  private remember(cached: CachedSceneSvg): CachedSceneSvg {
    this.cached.delete(cached.fingerprint);
    this.cached.set(cached.fingerprint, cached);
    while (this.cached.size > MAX_CACHE_ENTRIES) {
      const oldest = this.cached.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cached.delete(oldest);
    }
    return cached;
  }

  private async ensureSceneSvg(
    elements: readonly ExcalidrawElement[],
    hiddenPathId?: string,
    hiddenElementIds: readonly string[] = [],
    originalOpacities: ReadonlyMap<string, number> | undefined = undefined,
  ): Promise<CachedSceneSvg> {
    const appState = this.api.getAppState();
    const backgroundColor = readBackgroundColor(appState);
    const hiddenKey = hiddenElementIds.length > 0 ? hiddenElementIds.join(",") : "none";
    const opacityKey = originalOpacities
      ? [...originalOpacities.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([id, opacity]) => `${id}:${opacity}`)
          .join(",")
      : "none";
    const fingerprint = `${appState.theme}|${backgroundColor}|hiddenPath:${hiddenPathId ?? "none"}|hiddenElements:${hiddenKey}|originalOpacity:${opacityKey}|${getSceneVisualFingerprint(elements)}`;
    const existing = this.cached.get(fingerprint);
    if (existing) return existing;
    const pending = this.pending.get(fingerprint);
    if (pending) return pending;

    const exportPromise = withEaExportLock(this.ea, async () => {
      const afterWait = this.cached.get(fingerprint);
      if (afterWait) return afterWait;
      const bounds = this.ea.getBoundingBox(elements);
      // Frame outlines are intentionally omitted from thumbnails. createViewSVG can therefore
      // calculate a tighter export origin from visible child content than getBoundingBox() does.
      // Anchor the export to the complete scene bounds with an invisible rectangle so cropping
      // and scene-coordinate translation share the same origin.
      this.ea.clear();
      try {
        this.ea.copyViewElementsToEAforEditing(elements);
        const hiddenPath = hiddenPathId ? this.ea.getElement(hiddenPathId) : undefined;
        if (hiddenPath) hiddenPath.opacity = 0;
        for (const [id, opacity] of originalOpacities ?? []) {
          const element = this.ea.getElement(id);
          if (element) element.opacity = opacity;
        }
        for (const id of hiddenElementIds) {
          const element = this.ea.getElement(id);
          if (element) element.opacity = 0;
        }

        const anchorId = this.ea.addRect(bounds.topX, bounds.topY, bounds.width, bounds.height);
        const anchor = this.ea.getElement(anchorId);
        if (anchor) {
          anchor.opacity = 0;
          anchor.strokeWidth = 0.01;
          anchor.roughness = 0;
        }
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
          elementsOverride: this.ea.getElements(),
        });
        return this.remember({
          fingerprint,
          svgMarkup: svg.outerHTML,
          sceneBounds: { topX: bounds.topX, topY: bounds.topY },
          backgroundColor,
        });
      } finally {
        this.ea.clear();
      }
    });
    this.pending.set(fingerprint, exportPromise);
    try {
      return await exportPromise;
    } finally {
      if (this.pending.get(fingerprint) === exportPromise) this.pending.delete(fingerprint);
    }
  }

  /** Creates a cropped SVG preview in the caller's current owner document. */
  public async createPreview(
    slide: SlideDeckSlide,
    ownerDocument: Document,
    state: SlidePreviewState = {},
  ): Promise<SVGSVGElement | null> {
    const elements = this.ea.getViewElements();
    if (elements.length === 0) return null;
    const hiddenElementIds =
      slide.kind === "frame"
        ? getHiddenBuildElementIds(slide, state.completedAnimationSteps, elements)
        : [];
    const cached = await this.ensureSceneSvg(
      elements,
      slide.kind === "path" ? slide.pathId : undefined,
      hiddenElementIds,
      state.originalOpacities,
    );
    const host = ownerDocument.createElement("div");
    host.innerHTML = cached.svgMarkup;
    const clone = host.firstElementChild as SVGSVGElement | null;
    if (!clone || clone.tagName.toLowerCase() !== "svg") return null;

    const rect = translateNavigationRect(
      getPreviewNavigationRect(
        slide,
        this.config.maxZoom,
        this.config.printSlideWidth,
        this.config.printSlideHeight,
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
    clone.style.backgroundColor = cached.backgroundColor;
    return clone;
  }
}
