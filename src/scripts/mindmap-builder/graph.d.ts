/** Narrow typed surface for import-safe traversal tests and future typed callers. */
export interface MindmapGraphContext {
  ea: Pick<ExcalidrawAutomate, "getViewElements">;
  getBoundaryHost: (elements: ExcalidrawElement[]) => ExcalidrawElement | undefined;
  getDecorationAndCrossLinkIdsForBranches: (
    ids: string[],
    elements: ExcalidrawElement[],
    rootId: string,
  ) => string[];
}

export interface MindmapGraph {
  buildElementMap: (elements: ExcalidrawElement[]) => Map<string, ExcalidrawElement>;
  buildParentMap: (
    elements: ExcalidrawElement[],
    byId?: Map<string, ExcalidrawElement>,
  ) => Map<string, ExcalidrawElement>;
  buildChildrenMap: (
    elements: ExcalidrawElement[],
    byId?: Map<string, ExcalidrawElement>,
  ) => Map<string, ExcalidrawElement[]>;
  getChildrenNodes: (id: string, elements: ExcalidrawElement[]) => ExcalidrawElement[];
  getParentNode: (
    id: string,
    elements: ExcalidrawElement[],
    parents?: Map<string, ExcalidrawElement> | null,
  ) => ExcalidrawElement | null | undefined;
  getHierarchy: (
    element: ExcalidrawElement,
    elements: ExcalidrawElement[],
    byId?: Map<string, ExcalidrawElement> | null,
    parents?: Map<string, ExcalidrawElement> | null,
  ) => { depth: number; l1AncestorId: string; rootId: string };
  getSettingsRootNode: (
    element: ExcalidrawElement,
    elements: ExcalidrawElement[],
    byId?: Map<string, ExcalidrawElement> | null,
    parents?: Map<string, ExcalidrawElement> | null,
  ) => ExcalidrawElement | null;
  getDepthFromAncestor: (
    id: string,
    ancestorId: string,
    elements: ExcalidrawElement[],
    parents?: Map<string, ExcalidrawElement> | null,
  ) => number;
  getBranchElementIds: (id: string, elements: ExcalidrawElement[]) => string[];
  getMindmapProjectElements: (rootId: string, elements: ExcalidrawElement[]) => ExcalidrawElement[];
}

/** Creates traversal helpers using live invocation-owned dependencies. */
export function createGraph(context: MindmapGraphContext): MindmapGraph;
