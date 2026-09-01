/**
 * @file SlidePreviewService.ts
 * @overview Generates bounded, cached PNG previews for sorter and presenter views.
 */

import { AsyncTaskQueue } from "../../sharedUtils/AsyncTaskQueue";
import { ByteBudgetLruCache } from "../../sharedUtils/ByteBudgetLruCache";
import { getNavigationRect } from "../../sharedUtils/presentationGeometry";
import { resolveAnimationTargetElementIds } from "./AnimationRuntime";
import type { FrameDeckSlide, SlideDeckSlide } from "./SlideDeck";
import type { SlideshowConfig } from "./types";

const FALLBACK_BACKGROUND = "#ffffff";
const PREVIEW_CACHE_BYTES = 64 * 1024 * 1024;
const DEFAULT_PREVIEW_WIDTH = 960;
const MAX_PREVIEW_SCALE = 2;

interface CachedPreview {
  objectUrl: string;
  backgroundColor: string;
}

export interface SlidePreviewState {
  /** Number of frame build steps that should already be visible. Omit for final state. */
  completedAnimationSteps?: number;
  /** Restores animation-time opacity overrides before applying the requested preview build. */
  originalOpacities?: ReadonlyMap<string, number>;
  /** Target raster width. Sorter thumbnails should use less than presenter previews. */
  targetWidth?: number;
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

/** Calculates preview bounds using the configured presentation/print viewport. */
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
  const completed = Math.min(
    Math.max(Math.trunc(completedAnimationSteps), 0),
    slide.animationSteps.length,
  );
  const ids = new Set<string>();
  for (const step of slide.animationSteps.slice(completed)) {
    for (const id of resolveAnimationTargetElementIds(slide.frameId, step.targets, elements)) {
      ids.add(id);
    }
  }
  return [...ids].sort();
}

/** Owns bounded slide preview exports and their size-aware object-URL cache. */
export class SlidePreviewService {
  private readonly queue = new AsyncTaskQueue<string>();
  private readonly cached = new ByteBudgetLruCache<string, CachedPreview>(
    PREVIEW_CACHE_BYTES,
    (preview) => URL.revokeObjectURL(preview.objectUrl),
  );
  private generation = 0;
  private lastElements: readonly ExcalidrawElement[] | null = null;
  private lastFingerprint = "";

  public constructor(
    private readonly ea: ExcalidrawAutomate,
    private readonly api: ExcalidrawAPI,
    private readonly config: SlideshowConfig,
  ) {}

  /** Returns the drawing background used behind previews. */
  public getBackgroundColor(): string {
    return readBackgroundColor(this.api.getAppState());
  }

  /** Returns the configured presentation aspect ratio used by sorter previews. */
  public getAspectRatio(): string {
    return `${this.config.printSlideWidth} / ${this.config.printSlideHeight}`;
  }

  /** Drops cached previews and invalidates queued work, for example after switching drawings. */
  public clear(): void {
    this.generation += 1;
    this.queue.clear();
    this.cached.clear();
    this.lastElements = null;
    this.lastFingerprint = "";
  }

  private getFingerprint(elements: readonly ExcalidrawElement[]): string {
    if (elements === this.lastElements) return this.lastFingerprint;
    this.lastElements = elements;
    this.lastFingerprint = getSceneVisualFingerprint(elements);
    return this.lastFingerprint;
  }

  private createPreviewElement(
    cached: CachedPreview,
    ownerDocument: Document,
  ): HTMLImageElement {
    const image = ownerDocument.createElement("img");
    image.src = cached.objectUrl;
    image.alt = "";
    image.decoding = "async";
    image.draggable = false;
    image.setAttribute("aria-hidden", "true");
    image.style.width = "100%";
    image.style.height = "100%";
    image.style.objectFit = "contain";
    image.style.backgroundColor = cached.backgroundColor;
    return image;
  }

  private async exportPreview(
    elements: readonly ExcalidrawElement[],
    slide: SlideDeckSlide,
    hiddenElementIds: readonly string[],
    originalOpacities: ReadonlyMap<string, number> | undefined,
    targetWidth: number,
    generation: number,
    cacheKey: string,
  ): Promise<CachedPreview | undefined> {
    const appState = this.api.getAppState();
    const rect = getPreviewNavigationRect(
      slide,
      this.config.maxZoom,
      this.config.printSlideWidth,
      this.config.printSlideHeight,
    );
    const exportArea = {
      x: Math.min(rect.left, rect.right),
      y: Math.min(rect.top, rect.bottom),
      width: Math.abs(rect.right - rect.left),
      height: Math.abs(rect.bottom - rect.top),
    };
    const localElements = this.ea.getElementsIntersectionArea(elements, exportArea, {
      includeBoundElements: true,
    });

    return await withEaExportLock(this.ea, async () => {
      if (generation !== this.generation) return undefined;
      this.ea.clear();
      try {
        this.ea.copyViewElementsToEAforEditing(localElements);
        if (slide.kind === "path") {
          const hiddenPath = this.ea.getElement(slide.pathId);
          if (hiddenPath) hiddenPath.opacity = 0;
        }
        for (const [id, opacity] of originalOpacities ?? []) {
          const element = this.ea.getElement(id);
          if (element) element.opacity = opacity;
        }
        for (const id of hiddenElementIds) {
          const element = this.ea.getElement(id);
          if (element) element.opacity = 0;
        }

        const scale = Math.min(
          MAX_PREVIEW_SCALE,
          Math.max(targetWidth / Math.max(exportArea.width, 1), 0.01),
        );
        const blob = await this.ea.createViewPNG({
          withBackground: true,
          theme: appState.theme,
          frameRendering: {
            enabled: true,
            name: false,
            outline: false,
            clip: false,
          },
          padding: 0,
          selectedOnly: false,
          embedScene: false,
          elementsOverride: this.ea.getElements(),
          exportArea,
          scale,
        });
        if (generation !== this.generation) return undefined;
        const cached = {
          objectUrl: URL.createObjectURL(blob),
          backgroundColor: readBackgroundColor(appState),
        };
        this.cached.set(cacheKey, cached, blob.size);
        return cached;
      } finally {
        this.ea.clear();
      }
    });
  }

  /** Creates a bounded raster preview in the caller's owner document. */
  public async createPreview(
    slide: SlideDeckSlide,
    ownerDocument: Document,
    state: SlidePreviewState = {},
  ): Promise<HTMLImageElement | null> {
    const elements = this.ea.getViewElements();
    if (elements.length === 0) return null;
    const hiddenElementIds =
      slide.kind === "frame"
        ? getHiddenBuildElementIds(slide, state.completedAnimationSteps, elements)
        : [];
    const appState = this.api.getAppState();
    const targetWidth = Math.max(Math.trunc(state.targetWidth ?? DEFAULT_PREVIEW_WIDTH), 1);
    const opacityKey = state.originalOpacities
      ? [...state.originalOpacities.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([id, opacity]) => `${id}:${opacity}`)
          .join(",")
      : "none";
    const rect = getPreviewNavigationRect(
      slide,
      this.config.maxZoom,
      this.config.printSlideWidth,
      this.config.printSlideHeight,
    );
    const cacheKey = [
      appState.theme,
      readBackgroundColor(appState),
      slide.kind === "path" ? `path:${slide.pathId}` : "frame",
      `hidden:${hiddenElementIds.join(",")}`,
      `opacity:${opacityKey}`,
      `area:${rect.left},${rect.top},${rect.right},${rect.bottom}`,
      `width:${targetWidth}`,
      this.getFingerprint(elements),
    ].join("|");
    const existing = this.cached.get(cacheKey);
    if (existing) return this.createPreviewElement(existing, ownerDocument);

    const generation = this.generation;
    const cached = await this.queue.enqueue(
      cacheKey,
      () =>
        this.exportPreview(
          elements,
          slide,
          hiddenElementIds,
          state.originalOpacities,
          targetWidth,
          generation,
          cacheKey,
        ),
      () => generation === this.generation,
    );
    return cached ? this.createPreviewElement(cached, ownerDocument) : null;
  }
}
