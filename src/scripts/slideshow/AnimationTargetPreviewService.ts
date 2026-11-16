/** Bounded, session-owned thumbnails of animation elements/groups, without scene mutations. */
import { AsyncTaskQueue } from "../../sharedUtils/AsyncTaskQueue";
import { ByteBudgetLruCache } from "../../sharedUtils/ByteBudgetLruCache";
import { getSceneVisualFingerprint } from "../../sharedUtils/previewUtils";
import { resolveAnimationTargetElementIds, type AnimationSlideScope } from "./AnimationRuntime";
import type { AnimationTarget } from "./types";

/** Serializes target exports and owns all thumbnail URLs for one animation editor. */
export class AnimationTargetPreviewService {
  private readonly queue = new AsyncTaskQueue<string>(1);
  private readonly cache = new ByteBudgetLruCache<string, string>(
    4 * 1024 * 1024,
    (url) => URL.revokeObjectURL(url),
  );
  private destroyed = false;

  public constructor(
    private readonly ea: ExcalidrawAutomate,
    private readonly api: ExcalidrawAPI,
  ) {}

  /** Exports only the scoped visual targets, including bound text, at at most 160px per side. */
  public async createPreview(
    scope: AnimationSlideScope,
    targets: readonly AnimationTarget[],
    doc: Document,
    isRelevant: () => boolean,
    originalOpacities?: ReadonlyMap<string, number>,
  ): Promise<HTMLImageElement | null> {
    if (this.destroyed) return null;
    const elements = this.ea.getViewElements();
    const ids = new Set(resolveAnimationTargetElementIds(scope, targets, elements));
    const selected = elements.filter((element) => ids.has(element.id)).map((element) => {
      const opacity = originalOpacities?.get(element.id) ?? element.opacity;
      return opacity === element.opacity ? element : { ...element, opacity };
    });
    if (selected.length === 0) return null;
    const theme = this.api.getAppState().theme;
    const key = `${theme}|${getSceneVisualFingerprint(selected)}`;
    let url = this.cache.get(key);
    if (!url) {
      url = await this.queue.enqueue(key, async () => {
        const bounds = this.ea.getBoundingBox(selected);
        const blob = await this.ea.createViewPNG({
          withBackground: false,
          theme,
          frameRendering: { enabled: false, name: false, outline: false, clip: false },
          padding: 4,
          selectedOnly: false,
          embedScene: false,
          elementsOverride: selected,
          scale: Math.min(2, 160 / Math.max(bounds.width + 8, bounds.height + 8, 1)),
        });
        if (this.destroyed) return undefined;
        const objectUrl = URL.createObjectURL(blob);
        this.cache.set(key, objectUrl, blob.size);
        return objectUrl;
      // Rows are replaced when form choices change. Shared exports must remain
      // valid for the replacement row even if the original consumer detached.
      }, () => !this.destroyed);
    }
    // renderStep() requests its preview before mounting the row. Cache hits
    // must cross the same async boundary as fresh exports before checking it.
    await Promise.resolve();
    if (!url || this.destroyed || !isRelevant()) return null;
    const image = doc.createElement("img");
    image.src = url;
    image.alt = "";
    image.draggable = false;
    return image;
  }

  /** Invalidates queued exports and releases URLs, including when a running export finishes later. */
  public destroy(): void {
    this.destroyed = true;
    this.queue.clear();
    this.cache.clear();
  }
}
