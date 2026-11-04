import { AsyncTaskQueue } from "../../sharedUtils/AsyncTaskQueue";
import { ByteBudgetLruCache } from "../../sharedUtils/ByteBudgetLruCache";
import { exportAreaPreviewPNG, getSceneVisualFingerprint } from "../../sharedUtils/previewUtils";
import type { PageFrame } from "./frames";

/** A raster owned by this wizard's bounded cache. */
export interface PagePreview {
  objectUrl: string;
  backgroundColor: string;
}

/** Uses the sorter's local fingerprints, bounded PNGs, concurrency and byte-budgeted URL cache. */
export class PagePreviewService {
  private readonly queue = new AsyncTaskQueue<string>(2);
  private readonly cache = new ByteBudgetLruCache<string, PagePreview>(
    32 * 1024 * 1024,
    (preview) => URL.revokeObjectURL(preview.objectUrl),
  );
  private generation = 0;

  public constructor(
    private readonly ea: ExcalidrawAutomate,
    private readonly api: ExcalidrawAPI,
  ) {}

  /** Invalidates pending work without losing reusable thumbnails. */
  public cancelPending(): void {
    this.generation++;
    this.queue.clear();
  }

  /** Releases URLs and makes in-flight exports unable to publish after close. */
  public clear(): void {
    this.cancelPending();
    this.cache.clear();
  }

  /** Exports just the frame's crop; overlapping/outside scene edits do not invalidate other pages. */
  public async get(frame: PageFrame): Promise<PagePreview | undefined> {
    const area = { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
    const elements = this.ea.getElementsIntersectionArea(this.ea.getViewElements(), area, {
      includeBoundElements: true,
    });
    const state = this.api.getAppState();
    const backgroundColor = state.viewBackgroundColor ?? "#ffffff";
    const key = [
      state.theme,
      backgroundColor,
      area.x,
      area.y,
      area.width,
      area.height,
      getSceneVisualFingerprint(elements),
    ].join("|");
    const cached = this.cache.get(key);
    if (cached) return cached;
    const generation = this.generation;
    return this.queue.enqueue(
      key,
      async () => {
        if (generation !== this.generation) return undefined;
        const blob = await exportAreaPreviewPNG(this.ea, {
          elements,
          area,
          targetWidth: 360,
          theme: state.theme,
        });
        if (generation !== this.generation) return undefined;
        const preview = { objectUrl: URL.createObjectURL(blob), backgroundColor };
        this.cache.set(key, preview, blob.size);
        return preview;
      },
      () => generation === this.generation,
    );
  }
}
