/** Device-independent diagram geometry used by both SVG preview and EA rendering. */
import { type PlotState, type Point } from "./model";
import { samplePlot, type SampledPlot } from "./sampling";
import { PlotError } from "./expression";
import type { PlotTranslator } from "./lang";

export interface Stroke {
  points: Point[];
  color: string;
  width: number;
  fill: boolean;
  opacity: number;
}
export interface Caption {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
}
export interface Diagram {
  strokes: Stroke[];
  captions: Caption[];
  width: number;
  height: number;
  sampled: SampledPlot;
}

/** Chooses readable decimal or π-based ticks, bounded independently of user range. */
export function axisTicks(min: number, max: number, pi = false): number[] {
  const unit = pi ? Math.PI : 1;
  const raw = (max - min) / unit / 7;
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power * unit;
  const result: number[] = [];
  for (let i = Math.ceil(min / step); i * step <= max + step * 1e-8 && result.length < 30; i++)
    result.push(i * step);
  return result;
}

/** Formats ticks without binary floating-point residue or negative zero. */
export function formatNumber(value: number): string {
  return Math.abs(value) < 1e-12 ? "0" : Number(value.toPrecision(5)).toString();
}

/** Formats simple rational multiples of π, with decimal fallback. */
export function formatPi(value: number): string {
  if (Math.abs(value) < 1e-12) return "0";
  const ratio = value / Math.PI;
  for (const denominator of [1, 2, 4, 5, 10]) {
    const numerator = Math.round(ratio * denominator);
    if (Math.abs(numerator / denominator - ratio) < 1e-7)
      return `${numerator === 1 ? "" : numerator === -1 ? "−" : numerator}π${denominator === 1 ? "" : `/${denominator}`}`;
  }
  return `${formatNumber(ratio)}π`;
}

/** Builds a framed plot with clipped curves, ticks, labels and optional interval highlighting. */
export function buildDiagram(state: PlotState, t: PlotTranslator): Diagram {
  const sampled = samplePlot(state);
  const strokes: Stroke[] = [];
  const captions: Caption[] = [];
  const left = 68;
  const top = 55;
  const w = state.width - 95;
  const h = state.height - 120;
  const map = ([x, y]: Point): Point => [
    left + ((x - state.xMin) / (state.xMax - state.xMin)) * w,
    top + ((state.yMax - y) / (state.yMax - state.yMin)) * h,
  ];
  const stroke = (
    points: Point[],
    color = "#343a40",
    width = 1,
    fill = false,
    opacity = 100,
  ): void => {
    strokes.push({ points, color, width, fill, opacity });
  };
  const caption = (x: number, y: number, text: string, size = 13, color = "#495057"): void => {
    captions.push({ x, y, text, size, color });
  };
  caption(0, 0, state.title.trim() || t("plotTitle"), 22, "#212529");
  for (const x of axisTicks(state.xMin, state.xMax, state.piTicks)) {
    const px = map([x, 0])[0];
    if (state.grid)
      stroke(
        [
          [px, top],
          [px, top + h],
        ],
        "#dee2e6",
        0.6,
      );
    stroke([
      [px, top + h],
      [px, top + h + 5],
    ]);
    caption(px - 10, top + h + 9, state.piTicks ? formatPi(x) : formatNumber(x));
  }
  for (const y of axisTicks(state.yMin, state.yMax)) {
    const py = map([0, y])[1];
    if (state.grid)
      stroke(
        [
          [left, py],
          [left + w, py],
        ],
        "#dee2e6",
        0.6,
      );
    caption(2, py - 7, formatNumber(y));
  }
  stroke([
    [left, top],
    [left + w, top],
    [left + w, top + h],
    [left, top + h],
    [left, top],
  ]);
  if (state.xMin < 0 && state.xMax > 0)
    stroke([map([0, state.yMin]), map([0, state.yMax])], "#868e96");
  if (state.yMin < 0 && state.yMax > 0)
    stroke([map([state.xMin, 0]), map([state.xMax, 0])], "#868e96");
  caption(left + w / 2 - 5, top + h + 32, state.xLabel, 15);
  caption(left, top - 23, state.yLabel, 15);
  let visible = false;
  for (const curve of sampled.curves) {
    for (const path of curve.paths) {
      visible = true;
      // Shading is clipped to the visible data viewport and split at each discontinuity.
      if (state.mode === "distribution" && state.shade && !state.cumulative) {
        const a = Math.max(state.xMin, state.lower);
        const b = Math.min(state.xMax, state.upper);
        const base = Math.max(state.yMin, Math.min(state.yMax, 0));
        const inside: Point[] = [];
        for (let i = 1; i < path.length; i++) {
          const p = path[i - 1]!;
          const q = path[i]!;
          if (q[0] < a || p[0] > b || p[0] === q[0]) continue;
          const x0 = Math.max(a, p[0]);
          const x1 = Math.min(b, q[0]);
          const at = (x: number): Point => [x, p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0])];
          if (!inside.length) inside.push(at(x0));
          inside.push(at(x1));
        }
        if (inside.length > 1) {
          const polygon: Point[] = [
            [inside[0]![0], base],
            ...inside,
            [inside.at(-1)![0], base],
            [inside[0]![0], base],
          ];
          stroke(polygon.map(map), curve.color, 0, true, 18);
        }
      }
      // Chunk only at shared vertices so large paths remain editable without creating thousands of elements.
      for (let offset = 0; offset < path.length - 1; offset += 200)
        stroke(path.slice(offset, offset + 201).map(map), curve.color, 2);
    }
    for (const [x, y] of curve.bars) {
      if (y < state.yMin || y === 0) continue;
      visible = true;
      const base = Math.max(state.yMin, Math.min(state.yMax, 0));
      const shade = state.shade && x >= state.lower && x <= state.upper;
      stroke(
        [map([x, base]), map([x, Math.min(y, state.yMax)])],
        curve.color,
        shade ? 5 : 2,
        false,
        shade ? 100 : 65,
      );
    }
  }
  if (!visible) throw new PlotError("noData");
  let row = state.height;
  if (state.legend)
    for (const curve of sampled.curves) {
      const label =
        state.mode === "distribution"
          ? `${t(state.distribution)} · ${t(state.cumulative ? "cumulative" : "density")}`
          : curve.label;
      stroke(
        [
          [left, row + 9],
          [left + 24, row + 9],
        ],
        curve.color,
        2,
      );
      // Wrap long expressions; preview and native text use the exact same lines.
      const maxCharacters = Math.max(20, Math.floor((state.width - 130) / 8));
      const lines = label.match(new RegExp(`.{1,${maxCharacters}}`, "g")) ?? [label];
      caption(left + 34, row, lines.join("\n"), 14, curve.color);
      row += lines.length * 19 + 7;
    }
  if (sampled.probability !== null) {
    caption(
      left,
      row + 5,
      t("probability", {
        lower: formatNumber(state.lower),
        upper: formatNumber(state.upper),
        value: sampled.probability.toFixed(6),
      }),
      14,
    );
    row += 35;
  }
  return { strokes, captions, width: state.width, height: row + 15, sampled };
}
