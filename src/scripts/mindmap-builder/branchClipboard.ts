/** @file branchClipboard.ts
 * @overview Read-only clipboard graph validation and Mindmap reference remapping.
 */

/** Structural fields used here; Excalidraw retains every other element property. */
export interface BranchElement {
  id: string;
  type: string;
  isDeleted?: boolean;
  containerId?: string | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  boundElements?: { id: string; type: string }[] | null;
  customData?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BranchClipboard {
  type: "excalidraw/clipboard";
  elements: BranchElement[];
  [key: string]: unknown;
}

export type BranchAnalysis =
  { kind: "none" | "invalid" } | { kind: "branch"; elements: BranchElement[]; rootIds: string[] };

const nodeTypes = new Set(["text", "rectangle", "ellipse", "diamond", "image", "embeddable"]);

/** Decorations have no Builder node metadata; bound text belongs to its container. */
function isTaggedNode(element: BranchElement): boolean {
  if (element.containerId || !nodeTypes.has(element.type)) return false;
  const data = element.customData;
  return (
    !!data &&
    (data.mindmapOrder !== undefined || !!data.growthMode || data.isAdditionalRoot === true)
  );
}

/** Checks every component, including cycles disconnected from otherwise valid roots. */
function hasParentCycle(nodes: Iterable<string>, incoming: ReadonlyMap<string, string>): boolean {
  const checked = new Set<string>();
  for (const id of nodes) {
    const path = new Set<string>();
    let current: string | undefined = id;
    while (current && !checked.has(current)) {
      if (path.has(current)) return true;
      path.add(current);
      current = incoming.get(current);
    }
    path.forEach((n) => checked.add(n));
  }
  return false;
}

/** Normalizes both endpoints before treating an arrow as a structural edge. */
function branchEndpoints(
  arrow: BranchElement,
  normalize: (id?: string) => BranchElement | undefined,
): { start: BranchElement; end: BranchElement } | null {
  const start = normalize(arrow.startBinding?.elementId);
  const end = normalize(arrow.endBinding?.elementId);
  return start && end ? { start, end } : null;
}

/** An omitted structural connector's label cannot survive without its container. */
function excludeConnector(element: BranchElement, excluded: Set<string>): void {
  excluded.add(element.id);
  for (const bound of element.boundElements ?? []) {
    if (bound.type === "text") excluded.add(bound.id);
  }
}

function supportsBranchEndpoints(start: BranchElement, end: BranchElement): boolean {
  return nodeTypes.has(start.type) && nodeTypes.has(end.type);
}

/** Parses the envelope without depending on JSON whitespace or property order. */
export function parseBranchClipboard(text: string): BranchClipboard | null {
  try {
    const data = JSON.parse(text) as BranchClipboard;
    if (data?.type !== "excalidraw/clipboard" || !Array.isArray(data.elements)) return null;
    if (!data.elements.every((e) => e && typeof e.id === "string" && typeof e.type === "string"))
      return null;
    return data;
  } catch {
    return null;
  }
}

/** Recognizes a forest using only Builder edges, keeping annotations out of ancestry. */
export function analyzeBranchClipboard(payload: BranchClipboard): BranchAnalysis {
  const elements = payload.elements.filter((e) => !e.isDeleted);
  const byId = new Map(elements.map((e) => [e.id, e]));
  if (byId.size !== elements.length) return { kind: "invalid" };
  const normalize = (id?: string): BranchElement | undefined => {
    const e = id ? byId.get(id) : undefined;
    return e?.containerId ? byId.get(e.containerId) : e;
  };
  const nodes = new Map<string, BranchElement>();
  elements.forEach((e) => {
    if (isTaggedNode(e)) nodes.set(e.id, e);
  });
  const incoming = new Map<string, string>();
  const excluded = new Set<string>();
  const branches = elements.filter((e) => e.type === "arrow" && e.customData?.isBranch);
  for (const e of branches) {
    const endpoints = branchEndpoints(e, normalize);
    if (!endpoints) {
      excludeConnector(e, excluded);
      continue;
    }
    const { start, end } = endpoints;
    if (!supportsBranchEndpoints(start, end) || incoming.has(end.id)) return { kind: "invalid" };
    nodes.set(start.id, start);
    nodes.set(end.id, end);
    incoming.set(end.id, start.id);
  }
  if (!nodes.size) return { kind: "none" };
  // Each node has at most one parent, so walking parent chains also detects disconnected cycles.
  if (hasParentCycle(nodes.keys(), incoming)) return { kind: "invalid" };
  const rootIds = [...nodes.keys()].filter((id) => !incoming.has(id));
  return { kind: "branch", elements: elements.filter((e) => !excluded.has(e.id)), rootIds };
}

/** Makes a transport-only copy; neither the clipboard nor source scene is mutated. */
export function markBranchClipboard(
  payload: BranchClipboard,
  elements: BranchElement[],
  marker: string,
): BranchClipboard {
  const copy = JSON.parse(JSON.stringify({ ...payload, elements })) as BranchClipboard;
  const kept = new Set(elements.map((e) => e.id));
  copy.elements.forEach((e) => {
    e.customData = { ...e.customData, [marker]: e.id };
    if (e.boundElements) e.boundElements = e.boundElements.filter((b) => kept.has(b.id));
  });
  return copy;
}

/** Removes the transport tag and remaps only known element-ID fields, retaining user metadata. */
export function remapBranchMetadata(
  element: BranchElement,
  source: BranchElement,
  idMap: ReadonlyMap<string, string>,
  marker: string,
): Record<string, unknown> {
  const customData = { ...element.customData };
  delete customData[marker];
  for (const key of ["boundaryId", "foldIndicatorId"]) {
    if (typeof source.customData?.[key] === "string") {
      const id = idMap.get(source.customData[key]);
      if (id) customData[key] = id;
      else delete customData[key];
    }
  }
  return customData;
}
