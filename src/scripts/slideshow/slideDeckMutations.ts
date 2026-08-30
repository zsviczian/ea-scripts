/**
 * @file slideDeckMutations.ts
 * @overview Undoable scene mutations for sorter order, inclusion, and presenter notes.
 */

import { buildFrameSlideDeck, reorderLinePointPairs } from "./SlideDeck";
import {
  readFrameSlideshowData,
  reorderLineSlideRecords,
  upgradeLineSlideshowData,
  withNormalizedFrameOrder,
  writeSlideshowMetadata,
} from "./slideshowMetadata";
import { isFrameElement, isLinearPathElement, type EditableLinearElement } from "./types";

function normalizeNotes(notes: string): string | undefined {
  return notes.trim().length === 0 ? undefined : notes;
}

function getFrameElements(ea: ExcalidrawAutomate): ExcalidrawFrameElement[] {
  return ea.getViewElements().filter(isFrameElement);
}

function moveId(ids: string[], fromIndex: number, toIndex: number): void {
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= ids.length ||
    toIndex >= ids.length
  ) {
    throw new RangeError("Frame-slide index is outside the deck.");
  }
  const [id] = ids.splice(fromIndex, 1);
  if (!id) throw new RangeError("The source frame slide does not exist.");
  ids.splice(toIndex, 0, id);
}

async function commitWorkbench(ea: ExcalidrawAutomate, forceSave = false): Promise<void> {
  await ea.addElementsToView(false, true, false, false, "IMMEDIATELY");
  if (forceSave && ea.targetView) {
    await ea.targetView.forceSave(true);
  }
}

async function writeFrameMetadataSet(
  ea: ExcalidrawAutomate,
  orderedIds: readonly string[],
  targetId: string | null,
  mutateTarget?: (data: ReturnType<typeof withNormalizedFrameOrder>) => void,
  forceSave = false,
): Promise<void> {
  const frames = getFrameElements(ea);
  const byId = new Map(frames.map((frame) => [frame.id, frame]));
  if (orderedIds.length !== frames.length || orderedIds.some((id) => !byId.has(id))) {
    throw new Error("The frame deck changed before the slideshow metadata could be saved.");
  }

  ea.clear();
  ea.copyViewElementsToEAforEditing(frames);
  orderedIds.forEach((frameId, order) => {
    const source = byId.get(frameId);
    if (!source) return;
    const data = withNormalizedFrameOrder(source.customData, order);
    if (frameId === targetId) mutateTarget?.(data);
    writeSlideshowMetadata(ea, frameId, data);
  });
  await commitWorkbench(ea, forceSave);
}

/** Reorders frame slides and writes normalized 0..n-1 order metadata in one scene transaction. */
export async function reorderFrameSlides(
  ea: ExcalidrawAutomate,
  fromIndex: number,
  toIndex: number,
): Promise<void> {
  const frames = getFrameElements(ea);
  const orderedIds = buildFrameSlideDeck(frames).slides.map((slide) => slide.id);
  moveId(orderedIds, fromIndex, toIndex);
  await writeFrameMetadataSet(ea, orderedIds, null);
}

/** Toggles one frame's inclusion while normalizing the entire frame order atomically. */
export async function setFrameExcluded(
  ea: ExcalidrawAutomate,
  frameId: string,
  excluded: boolean,
): Promise<void> {
  const frames = getFrameElements(ea);
  const orderedIds = buildFrameSlideDeck(frames).slides.map((slide) => slide.id);
  await writeFrameMetadataSet(ea, orderedIds, frameId, (data) => {
    if (excluded) data.excluded = true;
    else delete data.excluded;
  });
}

/** Saves frame presenter notes while preserving order, exclusion, and animation metadata. */
export async function saveFrameNotes(
  ea: ExcalidrawAutomate,
  frameId: string,
  notes: string,
): Promise<void> {
  const frames = getFrameElements(ea);
  const orderedIds = buildFrameSlideDeck(frames).slides.map((slide) => slide.id);
  await writeFrameMetadataSet(
    ea,
    orderedIds,
    frameId,
    (data) => {
      const normalized = normalizeNotes(notes);
      if (normalized === undefined) delete data.notes;
      else data.notes = normalized;
    },
    true,
  );
}

/** Returns whether line-slide reordering must be disabled for endpoint binding safety. */
export function hasBoundLineEndpoint(path: ExcalidrawLinearElement): boolean {
  const bindingPath = path as ExcalidrawLinearElement & {
    startBinding?: unknown;
    endBinding?: unknown;
  };
  return bindingPath.startBinding != null || bindingPath.endBinding != null;
}

function fallbackPathProperties(path: ExcalidrawLinearElement): {
  strokeColor: string;
  backgroundColor: string;
  locked: boolean;
} {
  return {
    strokeColor: path.strokeColor,
    backgroundColor: path.backgroundColor,
    locked: path.locked,
  };
}

/** Reorders a consecutive line point-pair and its stable metadata record in one scene transaction. */
export async function reorderLineSlides(
  ea: ExcalidrawAutomate,
  pathId: string,
  fromPairIndex: number,
  toPairIndex: number,
): Promise<void> {
  const source = ea.getViewElements().find((element) => element.id === pathId);
  if (!isLinearPathElement(source)) throw new Error("The presentation path no longer exists.");
  if (hasBoundLineEndpoint(source)) {
    throw new Error("BOUND_PRESENTATION_PATH");
  }

  ea.clear();
  ea.copyViewElementsToEAforEditing([source]);
  const element = ea.getElement<ExcalidrawLinearElement>(pathId) as EditableLinearElement | null;
  if (!element) throw new Error("The presentation path could not be edited.");

  const pairCount = Math.floor(element.points.length / 2);
  const reordered = reorderLinePointPairs(
    element.x,
    element.y,
    element.points,
    fromPairIndex,
    toPairIndex,
  );
  const metadata = upgradeLineSlideshowData(
    element.customData,
    element.id,
    pairCount,
    fallbackPathProperties(source),
  );
  metadata.slides = reorderLineSlideRecords(
    metadata.slides,
    pairCount,
    element.id,
    fromPairIndex,
    toPairIndex,
  );

  element.x = reordered.x;
  element.y = reordered.y;
  element.points = reordered.points as unknown as typeof element.points;
  writeSlideshowMetadata(ea, element.id, metadata);
  await commitWorkbench(ea);
}

/** Saves presenter notes on the stable record associated with one line slide. */
export async function saveLineNotes(
  ea: ExcalidrawAutomate,
  pathId: string,
  slideId: string,
  notes: string,
): Promise<void> {
  const source = ea.getViewElements().find((element) => element.id === pathId);
  if (!isLinearPathElement(source)) throw new Error("The presentation path no longer exists.");

  ea.clear();
  ea.copyViewElementsToEAforEditing([source]);
  const element = ea.getElement<ExcalidrawLinearElement>(pathId) as EditableLinearElement | null;
  if (!element) throw new Error("The presentation path could not be edited.");

  const metadata = upgradeLineSlideshowData(
    element.customData,
    element.id,
    Math.floor(element.points.length / 2),
    fallbackPathProperties(source),
  );
  const record = metadata.slides.find((candidate) => candidate.id === slideId);
  if (!record) throw new Error("The selected line slide no longer exists.");
  const normalized = normalizeNotes(notes);
  if (normalized === undefined) delete record.notes;
  else record.notes = normalized;
  writeSlideshowMetadata(ea, element.id, metadata);
  await commitWorkbench(ea, true);
}

/** Shows or hides a remembered line presentation path while preserving its original styling. */
export async function setLinePresentationPathHidden(
  ea: ExcalidrawAutomate,
  pathId: string,
  hidden: boolean,
): Promise<void> {
  const source = ea.getViewElements().find((element) => element.id === pathId);
  if (!isLinearPathElement(source)) throw new Error("The presentation path no longer exists.");

  ea.clear();
  ea.copyViewElementsToEAforEditing([source]);
  const element = ea.getElement<ExcalidrawLinearElement>(pathId) as EditableLinearElement | null;
  if (!element) throw new Error("The presentation path could not be edited.");

  const metadata = upgradeLineSlideshowData(
    element.customData,
    element.id,
    Math.floor(element.points.length / 2),
    fallbackPathProperties(source),
  );
  metadata.hidden = hidden;
  if (hidden) {
    element.strokeColor = "transparent";
    element.backgroundColor = "transparent";
    element.locked = true;
  } else {
    element.strokeColor = metadata.originalProps.strokeColor;
    element.backgroundColor = metadata.originalProps.backgroundColor;
    element.locked = metadata.originalProps.locked;
  }
  writeSlideshowMetadata(ea, element.id, metadata);
  await commitWorkbench(ea, true);
}

/** Reads whether a frame is currently excluded without treating invalid metadata as authoritative. */
export function isFrameExcluded(frame: ExcalidrawFrameElement): boolean {
  return readFrameSlideshowData(frame.customData)?.excluded ?? false;
}
