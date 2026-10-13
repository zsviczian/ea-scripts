/** Typed surface for extracted layout metrics; the implementation remains JavaScript. */
export interface MindmapLayoutMetricsContext {
  ea: Pick<ExcalidrawAutomate, "getElementsInTheSameGroupWithElement" | "getBoundingBox">;
  getBranchElementIds: (id: string, elements: ExcalidrawElement[]) => string[];
  getChildrenNodes: (id: string, elements: ExcalidrawElement[]) => ExcalidrawElement[];
  layoutSettings: Record<string, number>;
  LAYOUT_METADATA: Record<string, { def: number }>;
}

export interface MindmapLayoutMetrics {
  getMindmapOrder: (node: ExcalidrawElement) => number;
  sortChildrenStable: (children: ExcalidrawElement[], elements?: ExcalidrawElement[]) => void;
  getSubtreeHeight: MindmapSubtreeMetric;
  getSubtreeWidth: MindmapSubtreeMetric;
}

/** Preserves the existing positional metric API, including optional traversal caches. */
export type MindmapSubtreeMetric = (
  ...args: [
    id: string,
    elements: ExcalidrawElement[],
    children?: Map<string, ExcalidrawElement[]>,
    cache?: Map<string, number>,
    byId?: Map<string, ExcalidrawElement>,
  ]
) => number;

/** Creates fold-aware layout helpers against live settings and scene callbacks. */
export function createLayoutMetrics(context: MindmapLayoutMetricsContext): MindmapLayoutMetrics;
