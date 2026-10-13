import { expect, it, vi } from "vitest";
import { createLayoutMetrics, type MindmapLayoutMetricsContext } from "../layoutMetrics.js";

/** Structural fixture for dimension and ordering tests. */
function node(
  id: string,
  height: number,
  customData: Record<string, unknown> = {},
): ExcalidrawElement {
  return {
    id,
    type: "rectangle",
    x: 0,
    y: 0,
    width: 60,
    height,
    fontSize: 20,
    customData,
  } as unknown as ExcalidrawElement;
}

it("uses current gap settings and excludes pinned descendants from subtree height", () => {
  const root = node("root", 20);
  const a = node("a", 30);
  const b = node("b", 20);
  const pinned = node("pinned", 1000, { isPinned: true });
  const elements = [root, a, b, pinned];
  let settings = { GAP_MULTIPLIER: 0.6, GAP_Y: 25 };
  const context = {
    ea: { getElementsInTheSameGroupWithElement: vi.fn(), getBoundingBox: vi.fn() },
    getBranchElementIds: () => [],
    getChildrenNodes: (id: string) => (id === "root" ? [a, b, pinned] : []),
    get layoutSettings() {
      return settings;
    },
    LAYOUT_METADATA: {},
  } satisfies MindmapLayoutMetricsContext;
  const metrics = createLayoutMetrics(context);
  expect(metrics.getSubtreeHeight("root", elements)).toBe(62);
  settings = { GAP_MULTIPLIER: 1, GAP_Y: 25 };
  expect(metrics.getSubtreeHeight("root", elements)).toBe(70);
});

it("uses a folded node's own dimensions without visiting hidden descendants", () => {
  const root = node("root", 20, { isFolded: true });
  const context = {
    ea: { getElementsInTheSameGroupWithElement: vi.fn(), getBoundingBox: vi.fn() },
    getBranchElementIds: vi.fn(() => []),
    getChildrenNodes: vi.fn(() => []),
    layoutSettings: {},
    LAYOUT_METADATA: {},
  } satisfies MindmapLayoutMetricsContext;
  const metrics = createLayoutMetrics(context);
  const cache = new Map<string, number>();
  expect(metrics.getSubtreeHeight("root", [root], undefined, cache)).toBe(20);
  expect(metrics.getSubtreeWidth("root", [root])).toBe(60);
  expect(cache.get("root")).toBe(20);
  expect(context.getChildrenNodes).not.toHaveBeenCalled();
});

it("orders siblings by persisted order, visual position, and then ID", () => {
  const children = [node("z", 20), node("a", 20), node("later", 20, { mindmapOrder: 1 })];
  const context = {
    ea: { getElementsInTheSameGroupWithElement: vi.fn(), getBoundingBox: vi.fn() },
    getBranchElementIds: () => [],
    getChildrenNodes: () => [],
    layoutSettings: {},
    LAYOUT_METADATA: {},
  } satisfies MindmapLayoutMetricsContext;
  createLayoutMetrics(context).sortChildrenStable(children);
  expect(children.map((child) => child.id)).toEqual(["a", "z", "later"]);
});
