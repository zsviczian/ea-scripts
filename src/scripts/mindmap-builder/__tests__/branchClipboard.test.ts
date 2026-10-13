import { expect, it } from "vitest";
import {
  analyzeBranchClipboard,
  markBranchClipboard,
  parseBranchClipboard,
  remapBranchMetadata,
  type BranchClipboard,
  type BranchElement,
} from "../branchClipboard";

const node = (id: string, data: Record<string, unknown> = {}): BranchElement => ({
  id,
  type: "rectangle",
  customData: { mindmapOrder: 0, ...data },
});
const arrow = (id: string, start: string, end: string): BranchElement => ({
  id,
  type: "arrow",
  customData: { isBranch: true },
  startBinding: { elementId: start },
  endBinding: { elementId: end },
});
const clipboard = (...elements: BranchElement[]): BranchClipboard => ({
  type: "excalidraw/clipboard",
  elements,
});

it("recognizes pretty-printed clipboard JSON but leaves Markdown and unrelated JSON alone", () => {
  expect(
    parseBranchClipboard(JSON.stringify(clipboard(node("root")), null, 2))?.elements,
  ).toHaveLength(1);
  expect(parseBranchClipboard("- idea\n  - child")).toBeNull();
  expect(parseBranchClipboard('{"type":"other","elements":[]}')).toBeNull();
  expect(parseBranchClipboard('{"type":"excalidraw/clipboard","elements":[null]}')).toBeNull();
  expect(analyzeBranchClipboard(clipboard({ id: "plain", type: "text" }))).toEqual({
    kind: "none",
  });
});

it("finds forest roots while excluding labels and associated notes from hierarchy", () => {
  const root = node("root");
  const child = node("child");
  const label = { id: "label", type: "text", containerId: "root", customData: { mindmapOrder: 0 } };
  const result = analyzeBranchClipboard(
    clipboard(
      root,
      child,
      label,
      { id: "note", type: "text", groupIds: ["node-group"] },
      arrow("edge", "label", "child"),
      node("second"),
    ),
  );
  expect(result.kind === "branch" && result.rootIds).toEqual(["root", "second"]);
  expect(result.kind === "branch" && result.elements).toHaveLength(6);
});

it("removes uncopied-parent connectors and their labels without touching source data", () => {
  const incoming = {
    ...arrow("incoming", "uncopied", "root"),
    boundElements: [{ id: "ontology", type: "text" }],
  };
  const payload = clipboard(node("root"), incoming, {
    id: "ontology",
    type: "text",
    containerId: "incoming",
  });
  const result = analyzeBranchClipboard(payload);
  expect(result.kind === "branch" && result.elements.map((e) => e.id)).toEqual(["root"]);
  expect(payload.elements).toHaveLength(3);
});

it("rejects disconnected cycles, multiple parents and duplicate IDs before native paste", () => {
  expect(
    analyzeBranchClipboard(
      clipboard(node("ok"), node("a"), node("b"), arrow("ab", "a", "b"), arrow("ba", "b", "a")),
    ).kind,
  ).toBe("invalid");
  expect(
    analyzeBranchClipboard(
      clipboard(node("a"), node("b"), node("c"), arrow("ac", "a", "c"), arrow("bc", "b", "c")),
    ).kind,
  ).toBe("invalid");
  expect(analyzeBranchClipboard(clipboard(node("a"), node("a"))).kind).toBe("invalid");
});

it("keeps image files and user metadata while repairing copied boundary/fold references", () => {
  const source = node("root", {
    boundaryId: "boundary",
    foldIndicatorId: "missing",
    user: { keep: true },
  });
  source.boundElements = [{ id: "absent", type: "arrow" }];
  const payload = {
    ...clipboard(source),
    files: { image: { dataURL: "data:image/png;base64,AA==" } },
  };
  const marked = markBranchClipboard(payload, payload.elements, "transport");
  expect(marked.files).toEqual(payload.files);
  expect(marked.elements[0]?.boundElements).toEqual([]);
  expect(source.customData?.transport).toBeUndefined();
  const data = remapBranchMetadata(
    marked.elements[0]!,
    source,
    new Map([["boundary", "pasted-boundary"]]),
    "transport",
  );
  expect(data).toEqual({ mindmapOrder: 0, boundaryId: "pasted-boundary", user: { keep: true } });
});
