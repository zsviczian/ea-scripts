/**
 * @file SlideDeck.ts
 * @overview Pure canonical deck construction and point-pair ordering helpers.
 */

import { getPresentationFrameName, type SlideRect } from "../../sharedUtils/presentationGeometry";
import {
  readFrameSlideshowData,
  readLineSlideshowData,
  withNormalizedFrameOrder,
} from "./slideshowMetadata";
import type { AnimationStep, FrameSlideshowData } from "./types";

export interface FrameDeckSource {
  id: string;
  name: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  customData?: unknown;
}

export interface LineDeckSource {
  id: string;
  x: number;
  y: number;
  points: readonly (readonly [number, number])[];
  customData?: unknown;
}

interface SlideDeckBaseSlide {
  id: string;
  title: string;
  rect: SlideRect;
  notes?: string;
  excluded: boolean;
}

export interface FrameDeckSlide extends SlideDeckBaseSlide {
  kind: "frame";
  frameId: string;
  order: number;
  animationSteps: readonly AnimationStep[];
}

export interface LineDeckSlide extends SlideDeckBaseSlide {
  kind: "path";
  pathId: string;
  pairIndex: number;
}

export type SlideDeckSlide = FrameDeckSlide | LineDeckSlide;

export interface SlideDeck {
  kind: "frame" | "path";
  slides: SlideDeckSlide[];
  visibleSlides: SlideDeckSlide[];
  hasExplicitFrameOrder: boolean;
}

interface IndexedFrame {
  source: FrameDeckSource;
  sourceIndex: number;
  title: string;
  metadata: FrameSlideshowData | null;
}

export interface FrameOrderMetadataUpdate {
  frameId: string;
  data: FrameSlideshowData;
}

export interface ReorderedLinePoints {
  x: number;
  y: number;
  points: [number, number][];
}

function compareAlphabetically(left: IndexedFrame, right: IndexedFrame): number {
  if (left.title === right.title) {
    return left.sourceIndex - right.sourceIndex;
  }
  return left.title > right.title ? 1 : -1;
}

function orderFrames(frames: IndexedFrame[]): { ordered: IndexedFrame[]; explicit: boolean } {
  const explicit = frames.some((frame) => frame.metadata !== null);
  if (!explicit) {
    return { ordered: [...frames].sort(compareAlphabetically), explicit: false };
  }
  const withOrder = frames.filter((frame) => frame.metadata !== null);
  const withoutOrder = frames.filter((frame) => frame.metadata === null).sort(compareAlphabetically);
  withOrder.sort((left, right) => {
    const orderDelta = (left.metadata?.order ?? 0) - (right.metadata?.order ?? 0);
    return orderDelta !== 0 ? orderDelta : left.sourceIndex - right.sourceIndex;
  });
  return { ordered: withOrder.concat(withoutOrder), explicit: true };
}

function toIndexedFrames(frames: readonly FrameDeckSource[]): IndexedFrame[] {
  return frames.map((source, sourceIndex) => ({
    source,
    sourceIndex,
    title: getPresentationFrameName(source.name, sourceIndex),
    metadata: readFrameSlideshowData(source.customData),
  }));
}

/** Builds the canonical frame deck without mutating scene metadata. */
export function buildFrameSlideDeck(frames: readonly FrameDeckSource[]): SlideDeck {
  const { ordered, explicit } = orderFrames(toIndexedFrames(frames));
  const slides: FrameDeckSlide[] = ordered.map((frame, index) => {
    const { source, metadata } = frame;
    const slide: FrameDeckSlide = {
      id: source.id,
      kind: "frame",
      frameId: source.id,
      title: frame.title,
      rect: { x1: source.x, y1: source.y, x2: source.x + source.width, y2: source.y + source.height },
      excluded: metadata?.excluded ?? false,
      order: index,
      animationSteps: metadata?.animation?.steps ?? [],
    };
    if (metadata?.notes !== undefined) slide.notes = metadata.notes;
    return slide;
  });
  return {
    kind: "frame",
    slides,
    visibleSlides: slides.filter((slide) => !slide.excluded),
    hasExplicitFrameOrder: explicit,
  };
}

/** Produces the normalized 0..n-1 metadata updates used by the first sorter mutation. */
export function getNormalizedFrameOrderUpdates(
  frames: readonly FrameDeckSource[],
): FrameOrderMetadataUpdate[] {
  const deck = buildFrameSlideDeck(frames);
  return deck.slides.map((slide, order) => {
    const frame = frames.find((candidate) => candidate.id === slide.id);
    if (!frame) {
      throw new Error(`Frame ${slide.id} is missing from the source deck.`);
    }
    return { frameId: slide.id, data: withNormalizedFrameOrder(frame.customData, order) };
  });
}

/** Builds the canonical line deck, reconciling slide IDs/notes in memory only. */
export function buildLineSlideDeck(path: LineDeckSource): SlideDeck {
  const pairCount = Math.floor(path.points.length / 2);
  const metadata = readLineSlideshowData(path.customData, path.id, pairCount);
  const records = metadata?.data.slides ?? [];
  const slides: LineDeckSlide[] = [];
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const pointA = path.points[pairIndex * 2];
    const pointB = path.points[pairIndex * 2 + 1];
    if (!pointA || !pointB) continue;
    const record = records[pairIndex];
    const slide: LineDeckSlide = {
      id: record?.id ?? `slideshow-${path.id}-${pairIndex + 1}`,
      kind: "path",
      pathId: path.id,
      pairIndex,
      title: `Slide ${pairIndex + 1}`,
      rect: {
        x1: path.x + pointA[0],
        y1: path.y + pointA[1],
        x2: path.x + pointB[0],
        y2: path.y + pointB[1],
      },
      excluded: false,
    };
    if (record?.notes !== undefined) slide.notes = record.notes;
    slides.push(slide);
  }
  return { kind: "path", slides, visibleSlides: [...slides], hasExplicitFrameOrder: false };
}

function movePair<T>(pairs: T[], fromPairIndex: number, toPairIndex: number): void {
  const [pair] = pairs.splice(fromPairIndex, 1);
  if (!pair) throw new RangeError("The source line-slide pair does not exist.");
  pairs.splice(toPairIndex, 0, pair);
}

/**
 * Reorders one consecutive line point-pair while preserving every point's absolute position.
 * The returned origin is the first reordered absolute point and points[0] is always [0, 0].
 */
export function reorderLinePointPairs(
  x: number,
  y: number,
  points: readonly (readonly [number, number])[],
  fromPairIndex: number,
  toPairIndex: number,
): ReorderedLinePoints {
  const pairCount = Math.floor(points.length / 2);
  if (
    !Number.isInteger(fromPairIndex) ||
    !Number.isInteger(toPairIndex) ||
    fromPairIndex < 0 ||
    toPairIndex < 0 ||
    fromPairIndex >= pairCount ||
    toPairIndex >= pairCount
  ) {
    throw new RangeError("Line-slide pair index is outside the presentation path.");
  }
  const absolute = points.map((point) => [x + point[0], y + point[1]] as [number, number]);
  const pairs: [number, number][][] = [];
  for (let index = 0; index < pairCount; index += 1) {
    const pointA = absolute[index * 2];
    const pointB = absolute[index * 2 + 1];
    if (pointA && pointB) pairs.push([pointA, pointB]);
  }
  movePair(pairs, fromPairIndex, toPairIndex);
  const reorderedAbsolute = pairs.flat();
  const trailingPoint = absolute[pairCount * 2];
  if (trailingPoint) reorderedAbsolute.push(trailingPoint);
  const origin = reorderedAbsolute[0];
  if (!origin) return { x, y, points: [] };
  return {
    x: origin[0],
    y: origin[1],
    points: reorderedAbsolute.map((point) => [point[0] - origin[0], point[1] - origin[1]]),
  };
}
