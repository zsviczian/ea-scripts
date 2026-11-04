import { getFrames, type PageFrame } from "./frames";
import { selectPages } from "./pageRanges";

/** Canonical frame numbering and empty-page classification for preview and PDF export. */
export interface PrintPages {
  frames: PageFrame[];
  emptyIds: ReadonlySet<string>;
}

/** Reads page eligibility once per scene change; range keystrokes reuse this classification. */
export function describePrintPages(
  ea: Pick<ExcalidrawAutomate, "getElementsInArea">,
  scene: readonly ExcalidrawElement[],
  markersOnly: boolean,
): PrintPages {
  const frames = getFrames(scene, markersOnly);
  const content = scene.filter((el) => el.type !== "frame");
  const emptyIds = new Set(
    frames
      .filter((frame) => ea.getElementsInArea(content, frame).length === 0)
      .map((frame) => frame.id),
  );
  return { frames, emptyIds };
}

/** Applies ranges before skipping empty pages, preserving the preview's displayed numbers. */
export function selectPrintablePages(
  pages: PrintPages,
  ranges: string,
  printEmpty: boolean,
): PageFrame[] {
  return selectPages(pages.frames, ranges).filter(
    (frame) => printEmpty || !pages.emptyIds.has(frame.id),
  );
}
