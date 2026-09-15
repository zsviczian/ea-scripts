/**
 * @file slideshowMetadata.ts
 * @overview Validation, migration, reconciliation, and safe slideshow metadata writes.
 */

/* eslint-disable complexity, max-lines-per-function -- Runtime validation is intentionally explicit at the customData boundary. */

import type {
  AnimationDirection,
  AnimationEffect,
  AnimationStep,
  AnimationTarget,
  AnimationTrigger,
  FrameSlideshowData,
  LegacyLineSlideshowData,
  LineSlideMetadataRecord,
  LineSlideshowData,
  OriginalPathProperties,
} from "./types";

const FRAME_SCHEMA_VERSION = 2 as const;
const LINE_SCHEMA_VERSION = 2 as const;
const animationEffects = new Set<AnimationEffect>([
  "appear",
  "fade",
  "slide",
  "zoom",
  "disappear",
  "fade-out",
  "slide-out",
  "zoom-out",
]);
const animationTriggers = new Set<AnimationTrigger>(["advance", "after-delay"]);
const animationDirections = new Set<AnimationDirection>(["left", "right", "up", "down"]);

export interface ReadLineSlideshowData {
  data: LineSlideshowData;
  source: "v2" | "legacy";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isOptionalNonNegativeNumber(value: unknown): value is number | undefined {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

function normalizeNotes(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }
  return value;
}

function readOriginalPathProperties(value: unknown): OriginalPathProperties | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.strokeColor !== "string" ||
    typeof value.backgroundColor !== "string" ||
    typeof value.locked !== "boolean"
  ) {
    return null;
  }
  return {
    strokeColor: value.strokeColor,
    backgroundColor: value.backgroundColor,
    locked: value.locked,
  };
}

function readAnimationTarget(value: unknown): AnimationTarget | null {
  if (!isRecord(value) || !isNonEmptyString(value.id)) {
    return null;
  }
  if (value.type === "element" || value.type === "group") {
    return {
      type: value.type,
      id: value.id,
      ...(value.scope === "viewport" ? { scope: "viewport" as const } : {}),
    };
  }
  return null;
}

function readAnimationStep(value: unknown): AnimationStep | null {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !Array.isArray(value.targets)) {
    return null;
  }
  if (!animationEffects.has(value.effect as AnimationEffect)) {
    return null;
  }
  if (!animationTriggers.has(value.trigger as AnimationTrigger)) {
    return null;
  }
  if (!isOptionalNonNegativeNumber(value.delayMs) || !isOptionalNonNegativeNumber(value.durationMs)) {
    return null;
  }
  if (value.direction !== undefined && !animationDirections.has(value.direction as AnimationDirection)) {
    return null;
  }
  const targets = value.targets.map(readAnimationTarget);
  if (targets.length === 0 || targets.some((target) => target === null)) {
    return null;
  }
  const result: AnimationStep = {
    id: value.id,
    targets: targets as AnimationTarget[],
    effect: value.effect as AnimationEffect,
    trigger: value.trigger as AnimationTrigger,
  };
  if (value.delayMs !== undefined) result.delayMs = value.delayMs as number;
  if (value.durationMs !== undefined) result.durationMs = value.durationMs as number;
  if (value.direction !== undefined) result.direction = value.direction as AnimationDirection;
  return result;
}

function readAnimation(value: unknown): FrameSlideshowData["animation"] | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value) || !Array.isArray(value.steps)) {
    return null;
  }
  const steps = value.steps.map(readAnimationStep);
  if (steps.some((step) => step === null)) {
    return null;
  }
  return { steps: steps as AnimationStep[] };
}

function readLineSlidePair(value: unknown): [[number, number], [number, number]] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length !== 2) return null;
  const points = value.map((point) => {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      typeof point[0] !== "number" ||
      !Number.isFinite(point[0]) ||
      typeof point[1] !== "number" ||
      !Number.isFinite(point[1])
    ) {
      return null;
    }
    return [point[0], point[1]] as [number, number];
  });
  return points.some((point) => point === null)
    ? null
    : (points as [[number, number], [number, number]]);
}

/** Returns the raw slideshow namespace without trusting its shape. */
export function getRawSlideshowMetadata(customData: unknown): unknown {
  return isRecord(customData) ? customData.slideshow : undefined;
}

/** Returns whether customData carries a valid frame slideshow or its minimal declaration marker. */
export function hasFrameSlideshowDeclaration(customData: unknown): boolean {
  const value = getRawSlideshowMetadata(customData);
  if (!isRecord(value) || value.schemaVersion !== FRAME_SCHEMA_VERSION || value.kind !== "frame") {
    return false;
  }
  if (value.order !== undefined) return readFrameSlideshowData(customData) !== null;
  return Object.keys(value).every((key) => key === "schemaVersion" || key === "kind");
}

/** Validates and copies frame slideshow metadata. */
export function readFrameSlideshowData(customData: unknown): FrameSlideshowData | null {
  const value = getRawSlideshowMetadata(customData);
  if (!isRecord(value) || value.schemaVersion !== FRAME_SCHEMA_VERSION || value.kind !== "frame") {
    return null;
  }
  if (typeof value.order !== "number" || !Number.isInteger(value.order) || value.order < 0) {
    return null;
  }
  if (value.excluded !== undefined && typeof value.excluded !== "boolean") {
    return null;
  }
  if (value.notes !== undefined && typeof value.notes !== "string") {
    return null;
  }
  if (value.deckName !== undefined && typeof value.deckName !== "string") {
    return null;
  }
  const animation = readAnimation(value.animation);
  if (animation === null) {
    return null;
  }
  const result: FrameSlideshowData = {
    schemaVersion: FRAME_SCHEMA_VERSION,
    kind: "frame",
    order: value.order,
  };
  const deckName = normalizeNotes(value.deckName);
  if (deckName !== undefined) result.deckName = deckName;
  if (value.excluded !== undefined) result.excluded = value.excluded;
  const notes = normalizeNotes(value.notes);
  if (notes !== undefined) result.notes = notes;
  if (animation !== undefined) result.animation = animation;
  return result;
}

/** Validates legacy path metadata without upgrading or writing it. */
export function readLegacyLineSlideshowData(customData: unknown): LegacyLineSlideshowData | null {
  const value = getRawSlideshowMetadata(customData);
  if (!isRecord(value) || value.schemaVersion !== undefined || value.kind !== undefined) {
    return null;
  }
  const originalProps = readOriginalPathProperties(value.originalProps);
  if (typeof value.hidden !== "boolean" || !originalProps) {
    return null;
  }
  return { hidden: value.hidden, originalProps };
}

function readLineSlideRecord(value: unknown): LineSlideMetadataRecord | null {
  if (!isRecord(value) || !isNonEmptyString(value.id)) {
    return null;
  }
  if (value.notes !== undefined && typeof value.notes !== "string") {
    return null;
  }
  if (value.excluded !== undefined && typeof value.excluded !== "boolean") {
    return null;
  }
  if (value.title !== undefined && typeof value.title !== "string") {
    return null;
  }
  const pair = readLineSlidePair(value.pair);
  if (pair === null) return null;
  const animation = readAnimation(value.animation);
  if (animation === null) return null;
  const result: LineSlideMetadataRecord = { id: value.id };
  const title = normalizeNotes(value.title);
  if (title !== undefined) result.title = title;
  const notes = normalizeNotes(value.notes);
  if (notes !== undefined) result.notes = notes;
  if (value.excluded !== undefined) result.excluded = value.excluded;
  if (pair !== undefined) result.pair = pair;
  if (animation !== undefined) result.animation = animation;
  return result;
}

/** Validates and copies schema-v2 line slideshow metadata. */
export function readLineSlideshowDataV2(customData: unknown): LineSlideshowData | null {
  const value = getRawSlideshowMetadata(customData);
  if (!isRecord(value) || value.schemaVersion !== LINE_SCHEMA_VERSION || value.kind !== "path") {
    return null;
  }
  const originalProps = readOriginalPathProperties(value.originalProps);
  if (
    typeof value.hidden !== "boolean" ||
    !originalProps ||
    !Array.isArray(value.slides) ||
    (value.name !== undefined && typeof value.name !== "string")
  ) {
    return null;
  }
  const slides = value.slides.map(readLineSlideRecord);
  if (slides.some((slide) => slide === null)) {
    return null;
  }
  const result: LineSlideshowData = {
    schemaVersion: LINE_SCHEMA_VERSION,
    kind: "path",
    hidden: value.hidden,
    originalProps,
    slides: slides as LineSlideMetadataRecord[],
  };
  const name = normalizeNotes(value.name);
  if (name !== undefined) result.name = name;
  return result;
}

function makeGeneratedLineSlideId(pathId: string, index: number, usedIds: Set<string>): string {
  const base = `slideshow-${pathId}-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}


/** Converts Excalidraw linear-element points to stable scene coordinates for slide identity matching. */
export function getAbsoluteLinePoints(
  x: number,
  y: number,
  points: readonly (readonly [number, number])[],
): [number, number][] {
  return points.map((point) => [x + point[0], y + point[1]]);
}

/**
 * Reconciles path slide records with the current point-pair count without writing.
 * Existing records keep their IDs, notes, and inclusion state by index; missing/duplicate IDs are regenerated.
 */
function samePoint(left: readonly [number, number], right: readonly [number, number]): boolean {
  return Math.abs(left[0] - right[0]) < 0.001 && Math.abs(left[1] - right[1]) < 0.001;
}

function samePair(
  left: readonly [readonly [number, number], readonly [number, number]],
  right: readonly [readonly [number, number], readonly [number, number]],
): boolean {
  return samePoint(left[0], right[0]) && samePoint(left[1], right[1]);
}

function getCurrentLinePairs(
  points: readonly (readonly [number, number])[] | undefined,
  pairCount: number,
): Array<[[number, number], [number, number]] | undefined> {
  return Array.from({ length: pairCount }, (_, index) => {
    const first = points?.[index * 2];
    const second = points?.[index * 2 + 1];
    return first && second
      ? [
          [first[0], first[1]],
          [second[0], second[1]],
        ]
      : undefined;
  });
}

function copyLineSlideRecord(
  existing: LineSlideMetadataRecord | undefined,
  id: string,
  pair: [[number, number], [number, number]] | undefined,
): LineSlideMetadataRecord {
  const record: LineSlideMetadataRecord = { id };
  const title = normalizeNotes(existing?.title);
  if (title !== undefined) record.title = title;
  const notes = normalizeNotes(existing?.notes);
  if (notes !== undefined) record.notes = notes;
  if (existing?.excluded === true) record.excluded = true;
  if (existing?.animation !== undefined) {
    record.animation = { steps: existing.animation.steps.map((step) => structuredClone(step)) };
  }
  if (pair) record.pair = pair;
  else if (existing?.pair) record.pair = structuredClone(existing.pair);
  return record;
}

export function reconcileLineSlideRecords(
  records: readonly LineSlideMetadataRecord[],
  pairCount: number,
  pathId: string,
  points?: readonly (readonly [number, number])[],
): LineSlideMetadataRecord[] {
  const count = Math.max(0, Math.floor(pairCount));
  const result: LineSlideMetadataRecord[] = [];
  const usedIds = new Set<string>();
  const usedRecordIndices = new Set<number>();
  const currentPairs = getCurrentLinePairs(points, count);
  const matchedRecordByPairIndex = new Map<number, number>();

  if (points) {
    currentPairs.forEach((pair, pairIndex) => {
      if (!pair) return;
      const recordIndex = records.findIndex(
        (record, index) =>
          !usedRecordIndices.has(index) && Boolean(record.pair && samePair(record.pair, pair)),
      );
      if (recordIndex >= 0) {
        matchedRecordByPairIndex.set(pairIndex, recordIndex);
        usedRecordIndices.add(recordIndex);
      }
    });
  }

  for (let index = 0; index < count; index += 1) {
    let recordIndex = matchedRecordByPairIndex.get(index);
    if (recordIndex === undefined) {
      const indexed = records[index];
      const canFallbackByIndex =
        Boolean(indexed) &&
        !usedRecordIndices.has(index) &&
        (!points || records.length === count || indexed?.pair === undefined);
      if (canFallbackByIndex) {
        recordIndex = index;
        usedRecordIndices.add(index);
      }
    }
    const existing = recordIndex === undefined ? undefined : records[recordIndex];
    const id =
      existing && isNonEmptyString(existing.id) && !usedIds.has(existing.id)
        ? existing.id
        : makeGeneratedLineSlideId(pathId, index, usedIds);
    usedIds.add(id);
    result.push(copyLineSlideRecord(existing, id, currentPairs[index]));
  }
  return result;
}

/** Reorders reconciled line-slide records so IDs, notes, and inclusion state travel with their point pair. */
export function reorderLineSlideRecords(
  records: readonly LineSlideMetadataRecord[],
  pairCount: number,
  pathId: string,
  fromPairIndex: number,
  toPairIndex: number,
  points?: readonly (readonly [number, number])[],
): LineSlideMetadataRecord[] {
  const reconciled = reconcileLineSlideRecords(records, pairCount, pathId, points);
  if (
    !Number.isInteger(fromPairIndex) ||
    !Number.isInteger(toPairIndex) ||
    fromPairIndex < 0 ||
    toPairIndex < 0 ||
    fromPairIndex >= reconciled.length ||
    toPairIndex >= reconciled.length
  ) {
    throw new RangeError("Line-slide metadata index is outside the presentation path.");
  }
  const [record] = reconciled.splice(fromPairIndex, 1);
  if (!record) {
    throw new RangeError("The source line-slide metadata record does not exist.");
  }
  reconciled.splice(toPairIndex, 0, record);
  return reconciled;
}

/** Reads either v2 or legacy path metadata and returns an in-memory v2 representation. */
export function readLineSlideshowData(
  customData: unknown,
  pathId: string,
  pairCount: number,
  points?: readonly (readonly [number, number])[],
): ReadLineSlideshowData | null {
  const v2 = readLineSlideshowDataV2(customData);
  if (v2) {
    return {
      source: "v2",
      data: { ...v2, slides: reconcileLineSlideRecords(v2.slides, pairCount, pathId, points) },
    };
  }
  const legacy = readLegacyLineSlideshowData(customData);
  if (!legacy) {
    return null;
  }
  return {
    source: "legacy",
    data: {
      schemaVersion: LINE_SCHEMA_VERSION,
      kind: "path",
      hidden: legacy.hidden,
      originalProps: legacy.originalProps,
      slides: reconcileLineSlideRecords([], pairCount, pathId, points),
    },
  };
}

/** Builds v2 line metadata for the first metadata-changing edit. */
export function upgradeLineSlideshowData(
  customData: unknown,
  pathId: string,
  pairCount: number,
  fallbackOriginalProps: OriginalPathProperties,
  points?: readonly (readonly [number, number])[],
): LineSlideshowData {
  const existing = readLineSlideshowData(customData, pathId, pairCount, points);
  if (existing) {
    return existing.data;
  }
  return {
    schemaVersion: LINE_SCHEMA_VERSION,
    kind: "path",
    hidden: false,
    originalProps: fallbackOriginalProps,
    slides: reconcileLineSlideRecords([], pairCount, pathId, points),
  };
}

/** Creates normalized v2 frame metadata while preserving valid optional fields. */
export function withNormalizedFrameOrder(customData: unknown, order: number): FrameSlideshowData {
  const existing = readFrameSlideshowData(customData);
  const result: FrameSlideshowData = {
    schemaVersion: FRAME_SCHEMA_VERSION,
    kind: "frame",
    order,
  };
  if (existing?.excluded !== undefined) result.excluded = existing.excluded;
  if (existing?.deckName !== undefined) result.deckName = existing.deckName;
  if (existing?.notes !== undefined) result.notes = existing.notes;
  if (existing?.animation !== undefined) result.animation = existing.animation;
  return result;
}

/** Safe write for an element already copied into EA's editing workbench. */
export function writeSlideshowMetadata(
  ea: ExcalidrawAutomate,
  elementId: string,
  data: FrameSlideshowData | LineSlideshowData | undefined,
): ExcalidrawElement | undefined {
  return ea.addAppendUpdateCustomData(elementId, { slideshow: data });
}
