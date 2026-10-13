import { expect, it } from "vitest";
import { createGraph } from "../graph.js";

/** Small structural fixtures intentionally contain only fields read by traversal. */
function node(id: string, customData: Record<string, unknown> = {}): ExcalidrawElement {
  return { id, type: "rectangle", customData } as unknown as ExcalidrawElement;
}

/** Constructs a branch or annotation without involving executable script globals. */
function arrow(id: string, start: string, end: string, isBranch = true): ExcalidrawElement {
  return {
    id,
    type: "arrow",
    customData: { isBranch },
    startBinding: { elementId: start },
    endBinding: { elementId: end },
  } as unknown as ExcalidrawElement;
}

/** Builds an isolated traversal subsystem with a replaceable scene read callback. */
function graph(elements: ExcalidrawElement[]): ReturnType<typeof createGraph> {
  return createGraph({
    ea: { getViewElements: () => elements },
    getBoundaryHost: () => undefined,
    getDecorationAndCrossLinkIdsForBranches: () => [],
  });
}

it("uses structural branches for ancestry and stops at the nearest submap settings root", () => {
  const root = node("root");
  const branch = node("branch", { isAdditionalRoot: true });
  const leaf = node("leaf");
  const elements = [
    root,
    branch,
    leaf,
    arrow("r-b", "root", "branch"),
    arrow("b-l", "branch", "leaf"),
  ];
  const helpers = graph(elements);
  expect(helpers.getHierarchy(leaf, elements)).toEqual({
    depth: 2,
    l1AncestorId: "branch",
    rootId: "root",
  });
  expect(helpers.getSettingsRootNode(leaf, elements)).toBe(branch);
  expect(helpers.getDepthFromAncestor("leaf", "branch", elements)).toBe(1);
  const parents = helpers.buildParentMap(elements, helpers.buildElementMap(elements));
  expect(helpers.getHierarchy(leaf, elements, helpers.buildElementMap(elements), parents)).toEqual(
    helpers.getHierarchy(leaf, elements),
  );
});

it("includes boundaries and internal crosslinks while excluding links outside a branch", () => {
  const elements = [
    node("root"),
    node("branch", { boundaryId: "boundary" }),
    node("leaf"),
    node("outside"),
    node("boundary"),
    arrow("r-b", "root", "branch"),
    arrow("b-l", "branch", "leaf"),
    arrow("internal", "branch", "leaf", false),
    arrow("external", "leaf", "outside", false),
  ];
  expect(graph(elements).getBranchElementIds("branch", elements)).toEqual([
    "branch",
    "boundary",
    "leaf",
    "b-l",
    "internal",
  ]);
});

it("terminates ancestry and branch traversal when persisted arrows contain a cycle", () => {
  const a = node("a");
  const b = node("b");
  const elements = [a, b, arrow("a-b", "a", "b"), arrow("b-a", "b", "a")];
  const helpers = graph(elements);
  expect(helpers.getHierarchy(a, elements).depth).toBe(1);
  expect(helpers.getBranchElementIds("a", elements)).toEqual(["a", "b", "a-b", "b-a"]);
});

it("includes a container's bound text and fold indicator in the project export set", () => {
  const root = {
    ...node("root"),
    boundElements: [{ id: "label", type: "text" }],
    customData: { foldIndicatorId: "fold" },
  } as ExcalidrawElement;
  const label = { ...node("label"), type: "text", containerId: "root" } as ExcalidrawElement;
  const elements = [root, label, node("fold"), node("unrelated")];
  expect(
    graph(elements)
      .getMindmapProjectElements("root", elements)
      .map((element) => element.id),
  ).toEqual(["root", "label", "fold"]);
});
