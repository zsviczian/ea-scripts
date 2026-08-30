import {
  buildFrameSlideDeck,
  buildLineSlideDeck,
  getNormalizedFrameOrderUpdates,
  reorderLinePointPairs,
  type FrameDeckSource,
} from "../src/scripts/slideshow/SlideDeck";
import {
  readFrameSlideshowData,
  readLegacyLineSlideshowData,
  readLineSlideshowData,
  reconcileLineSlideRecords,
  reorderLineSlideRecords,
  upgradeLineSlideshowData,
  writeSlideshowMetadata,
} from "../src/scripts/slideshow/slideshowMetadata";
import { resolvePresentationSetup } from "../src/scripts/slideshow/presentationPath";
import type { FrameSlideshowData, LineSlideshowData } from "../src/scripts/slideshow/types";

function fail(message: string): never {
  throw new Error(message);
}

function assert(condition: boolean, message: string): void {
  if (!condition) fail(message);
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) fail(`${message}: expected ${String(expected)}, received ${String(actual)}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) fail(`${message}: expected ${right}, received ${left}`);
}

function frame(
  id: string,
  name: string | null,
  slideshow?: FrameSlideshowData,
): FrameDeckSource {
  return {
    id,
    name,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    ...(slideshow ? { customData: { preserved: "yes", slideshow } } : {}),
  };
}

function testLegacyFrameOrdering(): void {
  const deck = buildFrameSlideDeck([frame("c", "Charlie"), frame("a", "Alpha"), frame("b", "Bravo")]);
  assertDeepEqual(deck.slides.map((slide) => slide.id), ["a", "b", "c"], "frames remain alphabetical without metadata");
  assertEqual(deck.hasExplicitFrameOrder, false, "legacy frame deck has no explicit order");
}

function testExplicitFrameOrderingAndExclusions(): void {
  const deck = buildFrameSlideDeck([
    frame("late", "Renamed Z", { schemaVersion: 2, kind: "frame", order: 10 }),
    frame("first", "Renamed A", { schemaVersion: 2, kind: "frame", order: 2, excluded: true }),
    frame("new-b", "Beta"),
    frame("new-a", "Alpha"),
  ]);
  assertDeepEqual(deck.slides.map((slide) => slide.id), ["first", "late", "new-a", "new-b"], "explicit frames precede unordered frames");
  assertDeepEqual(deck.visibleSlides.map((slide) => slide.id), ["late", "new-a", "new-b"], "excluded frames are omitted only from visible slides");
}

function testFrameOrderNormalization(): void {
  const animation = {
    steps: [
      {
        id: "step-1",
        targets: [{ type: "element" as const, id: "el-1" }],
        effect: "fade" as const,
        trigger: "advance" as const,
      },
    ],
  };
  const frames = [
    frame("a", "A", { schemaVersion: 2, kind: "frame", order: 8, excluded: true, notes: "Keep", animation }),
    frame("b", "B", { schemaVersion: 2, kind: "frame", order: 8 }),
    frame("c", "C"),
  ];
  const updates = getNormalizedFrameOrderUpdates(frames);
  assertDeepEqual(updates.map((update) => [update.frameId, update.data.order]), [["a", 0], ["b", 1], ["c", 2]], "gaps and duplicate frame orders normalize to 0..n-1");
  assertEqual(updates[0]?.data.excluded, true, "normalization preserves exclusion");
  assertEqual(updates[0]?.data.notes, "Keep", "normalization preserves notes");
  assertDeepEqual(updates[0]?.data.animation, animation, "normalization preserves animation metadata");
}

function testFrameValidation(): void {
  assertEqual(readFrameSlideshowData({ slideshow: { schemaVersion: 2, kind: "frame", order: -1 } }), null, "negative frame order is rejected");
  const valid = readFrameSlideshowData({ slideshow: { schemaVersion: 2, kind: "frame", order: 0, notes: "   " } });
  assert(valid !== null, "valid frame metadata is accepted");
  assertEqual(valid?.notes, undefined, "empty notes are removed when normalized");
}

function testLegacyLineMigration(): void {
  const customData = {
    untouched: 42,
    slideshow: {
      hidden: true,
      originalProps: { strokeColor: "red", backgroundColor: "blue", locked: false },
    },
  };
  assert(readLegacyLineSlideshowData(customData) !== null, "legacy path metadata is readable");
  const read = readLineSlideshowData(customData, "path", 2);
  assertEqual(read?.source, "legacy", "legacy metadata is identified without being written");
  assertDeepEqual(read?.data.slides.map((slide) => slide.id), ["slideshow-path-1", "slideshow-path-2"], "legacy migration creates deterministic slide IDs in memory");
  assertEqual((customData.slideshow as { schemaVersion?: number }).schemaVersion, undefined, "reading legacy metadata does not mutate it");
}

function testLineRecordReconciliation(): void {
  const records = reconcileLineSlideRecords(
    [
      { id: "one", notes: "First" },
      { id: "one", notes: "Second" },
      { id: "extra", notes: "Drop" },
    ],
    2,
    "path",
  );
  assertEqual(records.length, 2, "records are truncated to point-pair count");
  assertEqual(records[0]?.id, "one", "first stable ID is preserved");
  assertEqual(records[0]?.notes, "First", "notes remain attached to preserved record");
  assert(records[1]?.id !== "one", "duplicate IDs are reconciled");
  assertEqual(records[1]?.notes, "Second", "notes survive duplicate-ID repair");
  const extended = reconcileLineSlideRecords(records, 3, "path");
  assertEqual(extended[2]?.id, "slideshow-path-3", "new point pairs receive deterministic IDs");
}

function testLineRecordReorder(): void {
  const records = reorderLineSlideRecords(
    [
      { id: "one", notes: "First" },
      { id: "two", notes: "Second" },
      { id: "three", notes: "Third" },
    ],
    3,
    "path",
    2,
    0,
  );
  assertDeepEqual(
    records.map((record) => [record.id, record.notes]),
    [["three", "Third"], ["one", "First"], ["two", "Second"]],
    "line IDs and notes move with the reordered point pair",
  );
}

function testLineDeck(): void {
  const path: LineSlideshowData = {
    schemaVersion: 2,
    kind: "path",
    hidden: false,
    originalProps: { strokeColor: "red", backgroundColor: "blue", locked: false },
    slides: [{ id: "slide-a", notes: "Speaker note" }, { id: "slide-b" }],
  };
  const deck = buildLineSlideDeck({
    id: "path",
    x: 100,
    y: 200,
    points: [[0, 0], [20, 10], [30, 40], [50, 60]],
    customData: { slideshow: path },
  });
  assertEqual(deck.slides[0]?.id, "slide-a", "line deck uses persisted stable IDs");
  assertEqual(deck.slides[0]?.notes, "Speaker note", "line deck carries presenter notes");
  assertDeepEqual(deck.slides[1]?.rect, { x1: 130, y1: 240, x2: 150, y2: 260 }, "line deck converts relative points to scene rectangles");
}

function testPointPairReorderNormalization(): void {
  const result = reorderLinePointPairs(
    100,
    200,
    [[0, 0], [10, 10], [20, 20], [30, 30], [40, 40], [50, 50], [60, 60]],
    2,
    0,
  );
  assertDeepEqual([result.x, result.y], [140, 240], "line origin moves to first point of reordered first pair");
  assertDeepEqual(result.points, [[0, 0], [10, 10], [-40, -40], [-30, -30], [-20, -20], [-10, -10], [20, 20]], "relative points normalize while preserving absolute coordinates and odd trailing point");
}

function testLegacyPresentationPathCompatibility(): void {
  const legacyPath = {
    id: "legacy-path",
    type: "line",
    x: 10,
    y: 20,
    points: [[0, 0], [100, 50]],
    strokeColor: "transparent",
    backgroundColor: "transparent",
    locked: true,
    customData: {
      slideshow: {
        hidden: true,
        originalProps: { strokeColor: "#123", backgroundColor: "#456", locked: false },
      },
    },
  } as unknown as ExcalidrawLinearElement;
  const fakeEa = {
    getViewElements: () => [legacyPath],
    getViewSelectedElement: () => null,
    cloneElement: <T extends ExcalidrawElement>(element: T) => ({ ...element }),
  } as unknown as ExcalidrawAutomate;
  const fakeApi = {
    getAppState: () => ({ frameRendering: { enabled: false } }),
    setToast: () => undefined,
    updateScene: () => undefined,
  } as unknown as ExcalidrawAPI;
  const setup = resolvePresentationSetup(fakeEa, fakeApi);
  assert(setup !== null, "legacy hidden presentation path still resolves");
  assertEqual(setup?.isHidden, true, "legacy hidden state is preserved");
  assertEqual(setup?.originalPathProperties?.strokeColor, "#123", "legacy original path properties are preserved");
  assertDeepEqual(setup?.slides, [{ x1: 10, y1: 20, x2: 110, y2: 70 }], "legacy path still resolves the same slide rectangle");
}

function testUpgradeAndSafeWrite(): void {
  const customData = {
    slideshow: {
      hidden: true,
      originalProps: { strokeColor: "#111", backgroundColor: "#222", locked: true },
    },
  };
  const upgraded = upgradeLineSlideshowData(
    customData,
    "path",
    2,
    { strokeColor: "fallback", backgroundColor: "fallback", locked: false },
  );
  assertEqual(upgraded.hidden, true, "upgrade preserves hidden state");
  assertEqual(upgraded.originalProps.strokeColor, "#111", "upgrade preserves original path properties");
  let patch: Record<string, unknown | undefined> | null = null;
  const fakeEa = {
    addAppendUpdateCustomData: (_id: string, newData: Record<string, unknown | undefined>) => {
      patch = newData;
      return undefined;
    },
  } as unknown as ExcalidrawAutomate;
  writeSlideshowMetadata(fakeEa, "path", upgraded);
  assertDeepEqual(patch, { slideshow: upgraded }, "safe writer updates only the slideshow namespace");
}

const tests: Array<[string, () => void]> = [
  ["legacy frame ordering", testLegacyFrameOrdering],
  ["explicit frame ordering and exclusions", testExplicitFrameOrderingAndExclusions],
  ["frame order normalization", testFrameOrderNormalization],
  ["frame metadata validation", testFrameValidation],
  ["legacy line migration", testLegacyLineMigration],
  ["line metadata reconciliation", testLineRecordReconciliation],
  ["line metadata reorder", testLineRecordReorder],
  ["line deck construction", testLineDeck],
  ["line point-pair reorder normalization", testPointPairReorderNormalization],
  ["legacy presentation-path compatibility", testLegacyPresentationPathCompatibility],
  ["line upgrade and safe write", testUpgradeAndSafeWrite],
];

for (const [name, run] of tests) {
  run();
  console.log(`PASS ${name}`);
}
console.log(`PASS ${tests.length} checkpoint-1 slideshow tests`);
