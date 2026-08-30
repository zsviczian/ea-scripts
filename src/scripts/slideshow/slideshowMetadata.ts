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
const animationEffects = new Set<AnimationEffect>(["appear", "fade", "slide", "zoom"]);
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
    return { type: value.type, id: value.id };
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

/** Returns the raw slideshow namespace without trusting its shape. */
export function getRawSlideshowMetadata(customData: unknown): unknown {
  return isRecord(customData) ? customData.slideshow : undefined;
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
  const animation = readAnimation(value.animation);
  if (animation === null) {
    return null;
  }
  const result: FrameSlideshowData = {
    schemaVersion: FRAME_SCHEMA_VERSION,
    kind: "frame",
    order: value.order,
  };
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
  const result: LineSlideMetadataRecord = { id: value.id };
  const notes = normalizeNotes(value.notes);
  if (notes !== undefined) result.notes = notes;
  return result;
}

/** Validates and copies schema-v2 line slideshow metadata. */
export function readLineSlideshowDataV2(customData: unknown): LineSlideshowData | null {
  const value = getRawSlideshowMetadata(customData);
  if (!isRecord(value) || value.schemaVersion !== LINE_SCHEMA_VERSION || value.kind !== "path") {
    return null;
  }
  const originalProps = readOriginalPathProperties(value.originalProps);
  if (typeof value.hidden !== "boolean" || !originalProps || !Array.isArray(value.slides)) {
    return null;
  }
  const slides = value.slides.map(readLineSlideRecord);
  if (slides.some((slide) => slide === null)) {
    return null;
  }
  return {
    schemaVersion: LINE_SCHEMA_VERSION,
    kind: "path",
    hidden: value.hidden,
    originalProps,
    slides: slides as LineSlideMetadataRecord[],
  };
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

/**
 * Reconciles path slide records with the current point-pair count without writing.
 * Existing records keep their IDs/notes by index; missing/duplicate IDs are regenerated.
 */
export function reconcileLineSlideRecords(
  records: readonly LineSlideMetadataRecord[],
  pairCount: number,
  pathId: string,
): LineSlideMetadataRecord[] {
  const count = Math.max(0, Math.floor(pairCount));
  const result: LineSlideMetadataRecord[] = [];
  const usedIds = new Set<string>();
  for (let index = 0; index < count; index += 1) {
    const existing = records[index];
    const id =
      existing && isNonEmptyString(existing.id) && !usedIds.has(existing.id)
        ? existing.id
        : makeGeneratedLineSlideId(pathId, index, usedIds);
    usedIds.add(id);
    const record: LineSlideMetadataRecord = { id };
    const notes = normalizeNotes(existing?.notes);
    if (notes !== undefined) record.notes = notes;
    result.push(record);
  }
  return result;
}

/** Reorders reconciled line-slide records so IDs and notes travel with their point pair. */
export function reorderLineSlideRecords(
  records: readonly LineSlideMetadataRecord[],
  pairCount: number,
  pathId: string,
  fromPairIndex: number,
  toPairIndex: number,
): LineSlideMetadataRecord[] {
  const reconciled = reconcileLineSlideRecords(records, pairCount, pathId);
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
): ReadLineSlideshowData | null {
  const v2 = readLineSlideshowDataV2(customData);
  if (v2) {
    return {
      source: "v2",
      data: { ...v2, slides: reconcileLineSlideRecords(v2.slides, pairCount, pathId) },
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
      slides: reconcileLineSlideRecords([], pairCount, pathId),
    },
  };
}

/** Builds v2 line metadata for the first metadata-changing edit. */
export function upgradeLineSlideshowData(
  customData: unknown,
  pathId: string,
  pairCount: number,
  fallbackOriginalProps: OriginalPathProperties,
): LineSlideshowData {
  const existing = readLineSlideshowData(customData, pathId, pairCount);
  if (existing) {
    return existing.data;
  }
  return {
    schemaVersion: LINE_SCHEMA_VERSION,
    kind: "path",
    hidden: false,
    originalProps: fallbackOriginalProps,
    slides: reconcileLineSlideRecords([], pairCount, pathId),
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
