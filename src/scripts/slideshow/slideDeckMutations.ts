/**
 * @file slideDeckMutations.ts
 * @overview Undoable scene mutations for sorter order, inclusion, and presenter notes.
 */

import { expandSlideRectToAspectRatio } from "../../sharedUtils/presentationGeometry";
import { buildFrameSlideDeck, buildLineSlideDeck, reorderLinePointPairs } from "./SlideDeck";
import {
  getAbsoluteLinePoints,
  readFrameSlideshowData,
  reorderLineSlideRecords,
  upgradeLineSlideshowData,
  withNormalizedFrameOrder,
  writeSlideshowMetadata,
} from "./slideshowMetadata";
import {
  isFrameElement,
  isLinearPathElement,
  type AnimationStep,
  type EditableLinearElement,
  type LineSlideshowData,
  type SlideshowConfig,
} from "./types";

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

async function commitWorkbench(ea: ExcalidrawAutomate): Promise<void> {
  const committed = await ea.addElementsToView(false, true, false, false, "IMMEDIATELY");
  if (!committed) throw new Error("The slideshow metadata could not be applied to the drawing.");
}

async function writeFrameMetadataSet(
  ea: ExcalidrawAutomate,
  orderedIds: readonly string[],
  targetId: string | null,
  mutateTarget?: (data: ReturnType<typeof withNormalizedFrameOrder>) => void,
): Promise<void> {
  const frames = getFrameElements(ea);
  const byId = new Map(frames.map((frame) => [frame.id, frame]));
  if (orderedIds.length !== frames.length || orderedIds.some((id) => !byId.has(id))) {
    throw new Error("The frame deck changed before the slideshow metadata could be saved.");
  }

  const deckName = frames
    .map((frame) => readFrameSlideshowData(frame.customData)?.deckName)
    .find((name): name is string => typeof name === "string" && name.trim().length > 0);
  ea.clear();
  ea.copyViewElementsToEAforEditing(frames);
  orderedIds.forEach((frameId, order) => {
    const source = byId.get(frameId);
    if (!source) return;
    const data = withNormalizedFrameOrder(source.customData, order);
    if (deckName && !data.deckName) data.deckName = deckName;
    if (frameId === targetId) mutateTarget?.(data);
    writeSlideshowMetadata(ea, frameId, data);
  });
  await commitWorkbench(ea);
}

/** Declares a frame slideshow without imposing explicit slide order until the first edit. */
export async function declareFrameSlideshow(
  ea: ExcalidrawAutomate,
  selectedFrameId: string,
): Promise<void> {
  const frame = getFrameElements(ea).find((candidate) => candidate.id === selectedFrameId);
  if (!frame) throw new Error("The selected frame no longer exists.");
  ea.clear();
  ea.copyViewElementsToEAforEditing([frame]);
  const updated = ea.addAppendUpdateCustomData(selectedFrameId, {
    slideshow: { schemaVersion: 2, kind: "frame" },
  });
  if (!updated) throw new Error("The selected frame could not be edited.");
  await commitWorkbench(ea);
}

/** Renames a frame slide by updating the underlying Excalidraw frame title. */
export async function renameFrameSlide(
  ea: ExcalidrawAutomate,
  frameId: string,
  name: string,
): Promise<void> {
  const source = ea.getViewElements().find((element) => element.id === frameId);
  if (!isFrameElement(source)) throw new Error("The selected frame no longer exists.");
  ea.clear();
  ea.copyViewElementsToEAforEditing([source]);
  const frame = ea.getElement<ExcalidrawFrameElement>(frameId) as
    | Mutable<ExcalidrawFrameElement>
    | null;
  if (!frame) throw new Error("The selected frame could not be edited.");
  frame.name = name.trim().length === 0 ? null : name;
  await commitWorkbench(ea);
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
  if (!orderedIds.includes(frameId)) {
    throw new Error("The selected frame slide no longer exists.");
  }
  const normalized = normalizeNotes(notes);
  await writeFrameMetadataSet(ea, orderedIds, frameId, (data) => {
    if (normalized === undefined) delete data.notes;
    else data.notes = normalized;
  });
}

/** Saves a frame animation sequence while preserving order, notes, and exclusion metadata. */
export async function saveFrameAnimationSteps(
  ea: ExcalidrawAutomate,
  frameId: string,
  steps: readonly AnimationStep[],
): Promise<void> {
  const frames = getFrameElements(ea);
  const orderedIds = buildFrameSlideDeck(frames).slides.map((slide) => slide.id);
  if (!orderedIds.includes(frameId)) {
    throw new Error("The selected frame slide no longer exists.");
  }
  await writeFrameMetadataSet(ea, orderedIds, frameId, (data) => {
    if (steps.length === 0) delete data.animation;
    else data.animation = { steps: steps.map((step) => structuredClone(step)) };
  });
}

/** Returns whether line-slide reordering must be disabled for endpoint binding safety. */
export function hasBoundLineEndpoint(path: ExcalidrawLinearElement): boolean {
  const bindingPath = path as ExcalidrawLinearElement & {
    startBinding?: unknown;
    endBinding?: unknown;
  };
  return (
    (bindingPath.startBinding !== null && bindingPath.startBinding !== undefined) ||
    (bindingPath.endBinding !== null && bindingPath.endBinding !== undefined)
  );
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


/** Creates slideshow metadata on an ordinary line/arrow without changing its geometry. */
export async function createLinePresentation(
  ea: ExcalidrawAutomate,
  pathId: string,
  name?: string,
): Promise<void> {
  const source = ea.getViewElements().find((element) => element.id === pathId);
  if (!isLinearPathElement(source)) throw new Error("The selected line no longer exists.");
  if (Math.floor(source.points.length / 2) <= 0) {
    throw new Error("The selected line does not contain a complete slide point pair.");
  }
  ea.clear();
  ea.copyViewElementsToEAforEditing([source]);
  const element = ea.getElement<ExcalidrawLinearElement>(pathId) as EditableLinearElement | null;
  if (!element) throw new Error("The selected line could not be edited.");
  const metadata = upgradeLineSlideshowData(
    element.customData,
    element.id,
    Math.floor(element.points.length / 2),
    fallbackPathProperties(source),
    getAbsoluteLinePoints(element.x, element.y, element.points),
  );
  const normalizedName = normalizeNotes(name ?? "");
  if (normalizedName === undefined) delete metadata.name;
  else metadata.name = normalizedName;
  writeSlideshowMetadata(ea, element.id, metadata);
  await commitWorkbench(ea);
}

/** Renames one persisted line presentation while retaining all slide metadata. */
export async function renameLinePresentation(
  ea: ExcalidrawAutomate,
  pathId: string,
  name: string,
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
    getAbsoluteLinePoints(element.x, element.y, element.points),
  );
  const normalizedName = normalizeNotes(name);
  if (normalizedName === undefined) delete metadata.name;
  else metadata.name = normalizedName;
  writeSlideshowMetadata(ea, element.id, metadata);
  await commitWorkbench(ea);
}

/** Removes only slideshow metadata from a line and restores hidden presentation styling first. */
export async function removeLinePresentation(
  ea: ExcalidrawAutomate,
  pathId: string,
): Promise<void> {
  const source = ea.getViewElements().find((element) => element.id === pathId);
  if (!isLinearPathElement(source)) throw new Error("The presentation path no longer exists.");
  ea.clear();
  ea.copyViewElementsToEAforEditing([source]);
  const element = ea.getElement<ExcalidrawLinearElement>(pathId) as EditableLinearElement | null;
  if (!element) throw new Error("The presentation path could not be edited.");
  const existing = upgradeLineSlideshowData(
    element.customData,
    element.id,
    Math.floor(element.points.length / 2),
    fallbackPathProperties(source),
    getAbsoluteLinePoints(element.x, element.y, element.points),
  );
  if (existing.hidden) {
    element.strokeColor = existing.originalProps.strokeColor;
    element.backgroundColor = existing.originalProps.backgroundColor;
    element.locked = existing.originalProps.locked;
  }
  writeSlideshowMetadata(ea, element.id, undefined);
  await commitWorkbench(ea);
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
    getAbsoluteLinePoints(element.x, element.y, element.points),
  );
  metadata.slides = reorderLineSlideRecords(
    metadata.slides,
    pairCount,
    element.id,
    fromPairIndex,
    toPairIndex,
    getAbsoluteLinePoints(element.x, element.y, element.points),
  );
  metadata.slides.forEach((record, index) => {
    const first = reordered.points[index * 2];
    const second = reordered.points[index * 2 + 1];
    if (first && second) {
      record.pair = [
        [reordered.x + first[0], reordered.y + first[1]],
        [reordered.x + second[0], reordered.y + second[1]],
      ];
    }
  });

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
    getAbsoluteLinePoints(element.x, element.y, element.points),
  );
  const record = metadata.slides.find((candidate) => candidate.id === slideId);
  if (!record) throw new Error("The selected line slide no longer exists.");
  const normalized = normalizeNotes(notes);
  if (normalized === undefined) delete record.notes;
  else record.notes = normalized;
  writeSlideshowMetadata(ea, element.id, metadata);
  await commitWorkbench(ea);
}

/** Toggles one line slide's inclusion using its stable metadata record. */
export async function setLineSlideExcluded(
  ea: ExcalidrawAutomate,
  pathId: string,
  slideId: string,
  excluded: boolean,
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
    getAbsoluteLinePoints(element.x, element.y, element.points),
  );
  const record = metadata.slides.find((candidate) => candidate.id === slideId);
  if (!record) throw new Error("The selected line slide no longer exists.");
  if (excluded) record.excluded = true;
  else delete record.excluded;
  writeSlideshowMetadata(ea, element.id, metadata);
  await commitWorkbench(ea);
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
    getAbsoluteLinePoints(element.x, element.y, element.points),
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
  await commitWorkbench(ea);
}


/** Renames one line slide using its stable metadata record. */
export async function renameLineSlide(
  ea: ExcalidrawAutomate,
  pathId: string,
  slideId: string,
  name: string,
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
    getAbsoluteLinePoints(element.x, element.y, element.points),
  );
  const record = metadata.slides.find((candidate) => candidate.id === slideId);
  if (!record) throw new Error("The selected line slide no longer exists.");
  const normalized = normalizeNotes(name);
  if (normalized === undefined) delete record.title;
  else record.title = normalized;
  writeSlideshowMetadata(ea, element.id, metadata);
  await commitWorkbench(ea);
}

/** Saves a line-slide animation sequence using the same stable record as its title and notes. */
export async function saveLineAnimationSteps(
  ea: ExcalidrawAutomate,
  pathId: string,
  slideId: string,
  steps: readonly AnimationStep[],
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
    getAbsoluteLinePoints(element.x, element.y, element.points),
  );
  const record = metadata.slides.find((candidate) => candidate.id === slideId);
  if (!record) throw new Error("The selected line slide no longer exists.");
  if (steps.length === 0) delete record.animation;
  else record.animation = { steps: steps.map((step) => structuredClone(step)) };
  writeSlideshowMetadata(ea, element.id, metadata);
  await commitWorkbench(ea);
}

/** Stores one title on every frame metadata record so it survives frame additions/reordering. */
export async function renameFramePresentation(ea: ExcalidrawAutomate, name: string): Promise<void> {
  const frames = getFrameElements(ea);
  const orderedIds = buildFrameSlideDeck(frames).slides.map((slide) => slide.id);
  const normalized = normalizeNotes(name);
  ea.clear();
  ea.copyViewElementsToEAforEditing(frames);
  orderedIds.forEach((frameId, order) => {
    const source = frames.find((frame) => frame.id === frameId);
    if (!source) return;
    const data = withNormalizedFrameOrder(source.customData, order);
    if (normalized === undefined) delete data.deckName;
    else data.deckName = normalized;
    writeSlideshowMetadata(ea, frameId, data);
  });
  await commitWorkbench(ea);
}

/** Expands a frame around its center to the configured presentation aspect ratio. */
export async function resizeFrameToPresentationAspect(
  ea: ExcalidrawAutomate,
  frameId: string,
  config: SlideshowConfig,
): Promise<void> {
  const source = ea.getViewElements().find((element) => element.id === frameId);
  if (!isFrameElement(source)) throw new Error("The selected frame no longer exists.");
  const rect = expandSlideRectToAspectRatio(
    { x1: source.x, y1: source.y, x2: source.x + source.width, y2: source.y + source.height },
    { width: config.printSlideWidth, height: config.printSlideHeight },
  );
  ea.clear();
  ea.copyViewElementsToEAforEditing([source]);
  const frame = ea.getElement<ExcalidrawFrameElement>(frameId) as Mutable<ExcalidrawFrameElement> | null;
  if (!frame) throw new Error("The selected frame could not be edited.");
  frame.x = Math.min(rect.x1, rect.x2);
  frame.y = Math.min(rect.y1, rect.y2);
  frame.width = Math.abs(rect.x2 - rect.x1);
  frame.height = Math.abs(rect.y2 - rect.y1);
  await commitWorkbench(ea);
}

export type ConvertedFrameKind = "marker" | "normal";

export interface ConvertLinePresentationToFramesOptions {
  correctAspectRatio: boolean;
  deleteLine?: boolean;
  frameKind?: ConvertedFrameKind;
}

export interface ConvertFramePresentationToLineOptions {
  deleteFrames?: boolean;
  visibleSlidesOnly?: boolean;
}

function convertedDeckName(
  name: string | null,
  sourceRetained: boolean,
  suffix: "line" | "frames",
): string | null {
  if (!name) return null;
  return sourceRetained ? `${name} (${suffix})` : name;
}

/** Creates a frame slideshow from a line slideshow, optionally deleting the source line. */
export async function convertLinePresentationToFrames(
  ea: ExcalidrawAutomate,
  pathId: string,
  config: SlideshowConfig,
  options: boolean | ConvertLinePresentationToFramesOptions,
): Promise<void> {
  if (getFrameElements(ea).length > 0) throw new Error("FRAME_SLIDESHOW_EXISTS");
  const source = ea.getViewElements().find((element) => element.id === pathId);
  if (!isLinearPathElement(source)) throw new Error("The presentation path no longer exists.");
  const deck = buildLineSlideDeck(source);
  if (deck.slides.length === 0) throw new Error("The line slideshow has no slides.");

  const normalizedOptions: Required<ConvertLinePresentationToFramesOptions> =
    typeof options === "boolean"
      ? { correctAspectRatio: options, deleteLine: false, frameKind: "marker" }
      : {
          correctAspectRatio: options.correctAspectRatio,
          deleteLine: options.deleteLine ?? false,
          frameKind: options.frameKind ?? "marker",
        };
  const sceneElements = ea.getViewElements();
  const frameSpecs = deck.slides.map((slide) => {
    const rect = normalizedOptions.correctAspectRatio
      ? expandSlideRectToAspectRatio(slide.rect, {
          width: config.printSlideWidth,
          height: config.printSlideHeight,
        })
      : slide.rect;
    return {
      slide,
      left: Math.min(rect.x1, rect.x2),
      top: Math.min(rect.y1, rect.y2),
      width: Math.abs(rect.x2 - rect.x1),
      height: Math.abs(rect.y2 - rect.y1),
    };
  });
  const memberIdsByFrame =
    normalizedOptions.frameKind === "normal"
      ? frameSpecs.map((spec) =>
          ea
            .getElementsInArea(
              sceneElements,
              { x: spec.left, y: spec.top, width: spec.width, height: spec.height },
              { includeMarkerFrames: false, includeBoundElements: true },
            )
            .filter(
              (element) =>
                element.id !== source.id &&
                !isFrameElement(element) &&
                !element.isDeleted &&
                element.frameId === null,
            )
            .map((element) => element.id),
        )
      : frameSpecs.map(() => [] as string[]);
  const memberIds = new Set(memberIdsByFrame.flat());
  const members = sceneElements.filter((element) => memberIds.has(element.id));

  ea.clear();
  if (members.length > 0 || normalizedOptions.deleteLine) {
    ea.copyViewElementsToEAforEditing(
      normalizedOptions.deleteLine ? [source, ...members] : members,
    );
  }
  const assignedIds = new Set<string>();
  const deckName = convertedDeckName(deck.name, !normalizedOptions.deleteLine, "frames");
  frameSpecs.forEach((spec, order) => {
    const id = ea.addFrame(spec.left, spec.top, spec.width, spec.height, spec.slide.title);
    const frame = ea.getElement<ExcalidrawFrameElement>(id) as
      | Mutable<ExcalidrawFrameElement>
      | null;
    if (!frame) throw new Error("The converted frame could not be created.");
    if (normalizedOptions.frameKind === "marker") frame.frameRole = "marker";
    else delete frame.frameRole;
    const data = withNormalizedFrameOrder(undefined, order);
    if (deckName) data.deckName = deckName;
    if (spec.slide.notes) data.notes = spec.slide.notes;
    if (spec.slide.excluded) data.excluded = true;
    if (spec.slide.animationSteps.length > 0) {
      data.animation = {
        steps: spec.slide.animationSteps.map((step) => structuredClone(step)),
      };
    }
    writeSlideshowMetadata(ea, id, data);
    if (normalizedOptions.frameKind === "normal") {
      for (const memberId of memberIdsByFrame[order] ?? []) {
        if (assignedIds.has(memberId)) continue;
        const member = ea.getElement<ExcalidrawElement>(memberId) as
          | Mutable<ExcalidrawElement>
          | null;
        if (!member || member.frameId !== null) continue;
        member.frameId = id;
        assignedIds.add(memberId);
      }
    }
  });
  if (normalizedOptions.deleteLine) {
    const path = ea.getElement<ExcalidrawLinearElement>(source.id) as
      | Mutable<ExcalidrawLinearElement>
      | null;
    if (path) path.isDeleted = true;
  }
  await commitWorkbench(ea);
}

/** Creates a line slideshow from the frame deck, optionally deleting source frames. */
export async function convertFramePresentationToLine(
  ea: ExcalidrawAutomate,
  options: ConvertFramePresentationToLineOptions = {},
): Promise<string> {
  const frames = getFrameElements(ea);
  const deck = buildFrameSlideDeck(frames);
  if (deck.slides.length === 0) throw new Error("The frame slideshow has no slides.");
  const slides = options.visibleSlidesOnly ? deck.visibleSlides : deck.slides;
  if (slides.length === 0) throw new Error("The frame slideshow has no visible slides.");
  const frameIds = new Set(deck.slides.map((slide) => slide.id));
  const framedElements = ea
    .getViewElements()
    .filter((element) => element.frameId !== null && frameIds.has(element.frameId));
  const points: [number, number][] = [];
  for (const slide of slides) {
    points.push(
      [Math.min(slide.rect.x1, slide.rect.x2), Math.min(slide.rect.y1, slide.rect.y2)],
      [Math.max(slide.rect.x1, slide.rect.x2), Math.max(slide.rect.y1, slide.rect.y2)],
    );
  }
  ea.clear();
  const editableSources = options.deleteFrames ? [...framedElements, ...frames] : framedElements;
  if (editableSources.length > 0) ea.copyViewElementsToEAforEditing(editableSources);
  for (const source of framedElements) {
    const element = ea.getElement<ExcalidrawElement>(source.id) as Mutable<ExcalidrawElement> | null;
    if (element) element.frameId = null;
  }
  if (options.deleteFrames) {
    for (const frame of frames) {
      const element = ea.getElement<ExcalidrawFrameElement>(frame.id) as
        | Mutable<ExcalidrawFrameElement>
        | null;
      if (element) element.isDeleted = true;
    }
  }
  const lineId = ea.addLine(points);
  const line = ea.getElement<ExcalidrawLinearElement>(lineId) as EditableLinearElement | null;
  if (!line) throw new Error("The line slideshow could not be created.");
  const metadata: LineSlideshowData = {
    schemaVersion: 2,
    kind: "path",
    hidden: false,
    originalProps: fallbackPathProperties(line),
    slides: slides.map((slide, index) => {
      const first = line.points[index * 2];
      const second = line.points[index * 2 + 1];
      return {
        id: `slideshow-${lineId}-${index + 1}`,
        title: slide.title,
        ...(slide.notes ? { notes: slide.notes } : {}),
        ...(!options.visibleSlidesOnly && slide.excluded ? { excluded: true } : {}),
        ...(slide.animationSteps.length > 0
          ? { animation: { steps: slide.animationSteps.map((step) => structuredClone(step)) } }
          : {}),
        ...(first && second
          ? {
              pair: [
                [line.x + first[0], line.y + first[1]],
                [line.x + second[0], line.y + second[1]],
              ] as [[number, number], [number, number]],
            }
          : {}),
      };
    }),
  };
  const name = convertedDeckName(deck.name, !options.deleteFrames, "line");
  if (name) metadata.name = name;
  writeSlideshowMetadata(ea, lineId, metadata);
  await commitWorkbench(ea);
  return lineId;
}

/** Reads whether a frame is currently excluded without treating invalid metadata as authoritative. */
export function isFrameExcluded(frame: ExcalidrawFrameElement): boolean {
  return readFrameSlideshowData(frame.customData)?.excluded ?? false;
}
