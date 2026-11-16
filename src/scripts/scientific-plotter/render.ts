/** Scene transactions and a preview renderer that consume identical diagram geometry. */
import type { Diagram } from "./diagram";
import { readPlotState, type PlotState, type Point } from "./model";

export interface StoredPlot {
  plotId: string;
  state: PlotState;
  origin: Point;
}

/** Reads metadata from the selected plot's anchor, preserving the current moved position. */
export function findStoredPlot(
  elements: readonly ExcalidrawElement[],
  selected: readonly ExcalidrawElement[],
): StoredPlot | null {
  const ids = new Set(
    selected
      .map((e) => e.customData?.scientificPlotId)
      .filter((id): id is string => typeof id === "string"),
  );
  if (ids.size !== 1) return null;
  const plotId = [...ids][0]!;
  const anchor = elements.find(
    (e) =>
      !e.isDeleted &&
      e.customData?.scientificPlotId === plotId &&
      e.customData?.scientificPlotState,
  );
  const state = readPlotState(anchor?.customData?.scientificPlotState);
  return anchor && state ? { plotId, state, origin: [anchor.x, anchor.y] } : null;
}

/** Renders only into the supplied owning-document SVG; formulas are inserted as text nodes. */
export function renderPreview(svg: SVGSVGElement, diagram: Diagram): void {
  svg.replaceChildren();
  svg.setAttribute("viewBox", `-10 -10 ${diagram.width + 20} ${diagram.height + 20}`);
  for (const line of diagram.strokes) {
    svg.createSvg("polyline", {
      attr: {
        points: line.points.map((p) => p.join(",")).join(" "),
        stroke: line.color,
        "stroke-width": line.width,
        fill: line.fill ? line.color : "none",
        opacity: line.opacity / 100,
        "stroke-linejoin": "round",
        "stroke-linecap": "round",
      },
    });
  }
  for (const label of diagram.captions) {
    const text = svg.createSvg("text", {
      attr: {
        x: label.x,
        y: label.y + label.size,
        fill: label.color,
        "font-size": label.size,
        "font-family": "Arial, sans-serif",
      },
    });
    label.text.split("\n").forEach((line, index) => {
      text.createSvg("tspan", {
        attr: { x: label.x, dy: index ? label.size * 1.35 : 0 },
      }).textContent = line;
    });
  }
}

/** Adds or replaces one grouped native-vector diagram in a single awaited save/undo transaction. */
export async function commitDiagram(
  ea: ExcalidrawAutomate,
  diagram: Diagram,
  state: PlotState,
  previous: StoredPlot | null,
): Promise<boolean> {
  const view = ea.targetView;
  if (!view || !ea.getExcalidrawAPI()) return false;
  const center = ea.getViewCenterPosition();
  const origin: Point = previous?.origin ?? [
    center.x - diagram.width / 2,
    center.y - diagram.height / 2,
  ];
  const plotId = previous?.plotId ?? ea.generateElementId();
  ea.clear();
  try {
    if (previous) {
      const old = ea
        .getViewElements()
        .filter((e) => !e.isDeleted && e.customData?.scientificPlotId === previous.plotId);
      if (!old.length) return false;
      ea.copyViewElementsToEAforEditing(old);
      old.forEach((e) => {
        ea.getElement(e.id).isDeleted = true;
      });
    }
    ea.style.roughness = 0;
    ea.style.strokeStyle = "solid";
    ea.style.fillStyle = "solid";
    ea.style.fontFamily = 2;
    ea.style.roundness = null;
    const ids: string[] = [];
    for (const stroke of diagram.strokes) {
      ea.style.strokeColor = stroke.color;
      ea.style.backgroundColor = stroke.fill ? stroke.color : "transparent";
      ea.style.strokeWidth = stroke.width;
      ea.style.opacity = stroke.opacity;
      ids.push(ea.addLine(stroke.points.map(([x, y]) => [origin[0] + x, origin[1] + y])));
    }
    ea.style.opacity = 100;
    ea.style.backgroundColor = "transparent";
    for (const label of diagram.captions) {
      ea.style.strokeColor = label.color;
      ea.style.fontSize = label.size;
      ids.push(
        ea.addText(origin[0] + label.x, origin[1] + label.y, label.text, { autoResize: true }),
      );
    }
    ids.forEach((id) => ea.addAppendUpdateCustomData(id, { scientificPlotId: plotId }));
    const anchorIndex = diagram.strokes.length;
    ea.addAppendUpdateCustomData(ids[anchorIndex]!, { scientificPlotState: { ...state } });
    ea.addToGroup(ids);
    return await ea.addElementsToView(false, true, true);
  } finally {
    ea.clear();
  }
}
