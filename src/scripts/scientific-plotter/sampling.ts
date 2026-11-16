/** Bounded curve sampling and clipping shared by preview and native drawing output. */
import { compileExpression, PlotError } from "./expression";
import { createDistribution, intervalProbability } from "./distributions";
import { validateState, type PlotState, type Point } from "./model";

export interface Curve {
  label: string;
  paths: Point[][];
  bars: Point[];
  color: string;
}
export interface SampledPlot {
  curves: Curve[];
  probability: number | null;
}
export const curveColors = ["#1971c2", "#e8590c", "#2b8a3e", "#9c36b5", "#c2255c", "#087f8c"];

/** Clips a segment against a rectangular data viewport with Liang–Barsky. */
export function clipSegment(a: Point, b: Point, s: PlotState): [Point, Point] | null {
  let enter = 0;
  let exit = 1;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const edges: [number, number][] = [
    [-dx, a[0] - s.xMin],
    [dx, s.xMax - a[0]],
    [-dy, a[1] - s.yMin],
    [dy, s.yMax - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const r = q / p;
    if (p < 0) enter = Math.max(enter, r);
    else exit = Math.min(exit, r);
    if (enter > exit) return null;
  }
  return [
    [a[0] + enter * dx, a[1] + enter * dy],
    [a[0] + exit * dx, a[1] + exit * dy],
  ];
}

/** Samples and adaptively subdivides; unresolved curvature/discontinuities create gaps, never pole bridges. */
export function sampleCurve(
  evaluate: (t: number) => Point,
  start: number,
  end: number,
  state: PlotState,
): Point[][] {
  const paths: Point[][] = [];
  let current: Point[] = [];
  let evaluations = 0;
  const xScale = state.width / (state.xMax - state.xMin);
  const yScale = state.height / (state.yMax - state.yMin);
  /** Ends one connected path. */
  function flush(): void {
    if (current.length > 1) paths.push(current);
    current = [];
  }
  /** Rejects infinities and extreme values before interpolation can overflow. */
  function finite(p: Point): boolean {
    return p.every((v) => Number.isFinite(v) && Math.abs(v) < 1e100);
  }
  /** Subdivides one interval to subpixel curvature tolerance, with fixed work/depth limits. */
  function segment(t0: number, p0: Point, t1: number, p1: Point, depth: number): void {
    if (++evaluations > 16000) throw new PlotError("tooComplex");
    const mid = (t0 + t1) / 2;
    const pm = evaluate(mid);
    if (!finite(p0) || !finite(p1) || !finite(pm)) {
      flush();
      return;
    }
    const error = Math.hypot(
      (pm[0] - (p0[0] + p1[0]) / 2) * xScale,
      (pm[1] - (p0[1] + p1[1]) / 2) * yScale,
    );
    const jump = Math.hypot((p1[0] - p0[0]) * xScale, (p1[1] - p0[1]) * yScale);
    if (error > 0.7 || jump > 60) {
      if (depth >= 8) {
        flush();
        return;
      }
      segment(t0, p0, mid, pm, depth + 1);
      segment(mid, pm, t1, p1, depth + 1);
      return;
    }
    const clipped = clipSegment(p0, p1, state);
    if (!clipped) {
      flush();
      return;
    }
    const previous = current.at(-1);
    if (previous && Math.hypot(previous[0] - clipped[0][0], previous[1] - clipped[0][1]) > 1e-8)
      flush();
    if (!current.length) current.push(clipped[0]);
    current.push(clipped[1]);
  }
  let t0 = start;
  let p0 = evaluate(t0);
  for (let i = 1; i <= 320; i++) {
    const t1 = start + ((end - start) * i) / 320;
    const p1 = evaluate(t1);
    segment(t0, p0, t1, p1, 0);
    t0 = t1;
    p0 = p1;
  }
  flush();
  return paths;
}

/** Evaluates up to six formulas, a parametric/polar curve, or one probability model. */
export function samplePlot(state: PlotState): SampledPlot {
  validateState(state);
  const vars = { a: state.a, b: state.b, c: state.c };
  if (state.mode === "distribution") {
    const model = createDistribution(state.distribution, state.p, state.q);
    const value = state.cumulative ? model.cdf : model.density;
    const curve: Curve = { label: state.distribution, color: curveColors[0]!, paths: [], bars: [] };
    if (model.discrete) {
      if (state.xMax - state.xMin > 1100) throw new PlotError("tooComplex");
      if (state.cumulative) {
        // Right-continuous steps, evaluated on both sides of each integer.
        const path: Point[] = [[state.xMin, value(state.xMin)]];
        for (let k = Math.ceil(state.xMin); k <= state.xMax; k++)
          path.push([k, value(k - 1)], [k, value(k)]);
        path.push([state.xMax, value(state.xMax)]);
        for (let i = 1; i < path.length; i++) {
          const clipped = clipSegment(path[i - 1]!, path[i]!, state);
          if (clipped) curve.paths.push(clipped);
        }
      } else
        for (let k = Math.ceil(state.xMin); k <= state.xMax; k++) curve.bars.push([k, value(k)]);
    } else curve.paths = sampleCurve((x) => [x, value(x)], state.xMin, state.xMax, state);
    return {
      curves: [curve],
      probability: state.shade ? intervalProbability(model, state.lower, state.upper) : null,
    };
  }
  if (state.mode === "functions") {
    const sources = state.formulas
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (!sources.length) throw new PlotError("expressionError");
    if (sources.length > 6) throw new PlotError("tooComplex");
    return {
      curves: sources.map((source, i) => {
        const formula = compileExpression(source, ["x", "a", "b", "c"]);
        return {
          label: source,
          color: curveColors[i]!,
          bars: [],
          paths: sampleCurve((x) => [x, formula({ ...vars, x })], state.xMin, state.xMax, state),
        };
      }),
      probability: null,
    };
  }
  const y = compileExpression(state.yFormula, ["t", "a", "b", "c"]);
  const x =
    state.mode === "parametric" ? compileExpression(state.xFormula, ["t", "a", "b", "c"]) : null;
  const paths = sampleCurve(
    (t) => {
      const v = { ...vars, t };
      return x ? [x(v), y(v)] : [y(v) * Math.cos(t), y(v) * Math.sin(t)];
    },
    state.tMin,
    state.tMax,
    state,
  );
  return {
    curves: [
      {
        label:
          state.mode === "polar"
            ? `r(t) = ${state.yFormula}`
            : `(${state.xFormula}, ${state.yFormula})`,
        color: curveColors[0]!,
        paths,
        bars: [],
      },
    ],
    probability: null,
  };
}

/** Fits vertical bounds from finite samples; singularity outliers are trimmed for function plots. */
export function fitY(state: PlotState): PlotState {
  validateState(state);
  const values: number[] = [];
  const vars = { a: state.a, b: state.b, c: state.c };
  const formulas =
    state.mode === "functions"
      ? state.formulas
          .split("\n")
          .filter((x) => x.trim())
          .map((source) => compileExpression(source, ["x", "a", "b", "c"]))
      : [];
  const model =
    state.mode === "distribution" ? createDistribution(state.distribution, state.p, state.q) : null;
  const y =
    !model && state.mode !== "functions"
      ? compileExpression(state.yFormula, ["t", "a", "b", "c"])
      : null;
  if (formulas.length > 6) throw new PlotError("tooComplex");
  for (let i = 0; i <= 600; i++) {
    const x = state.xMin + ((state.xMax - state.xMin) * i) / 600;
    const t = state.tMin + ((state.tMax - state.tMin) * i) / 600;
    if (model)
      values.push(
        state.cumulative ? model.cdf(x) : model.density(model.discrete ? Math.round(x) : x),
      );
    else if (y) values.push(y({ ...vars, t }) * (state.mode === "polar" ? Math.sin(t) : 1));
    else formulas.forEach((f) => values.push(f({ ...vars, x })));
  }
  const finite = values
    .filter((v) => Number.isFinite(v) && Math.abs(v) < 1e9)
    .sort((a, b) => a - b);
  if (!finite.length) throw new PlotError("noData");
  const trim = state.mode === "functions" ? Math.floor(finite.length * 0.01) : 0;
  const min = model ? 0 : finite[trim]!;
  const max = finite[finite.length - 1 - trim]!;
  const pad = Math.max((max - min) * 0.1, 0.01, Math.abs(max) * 0.02);
  return { ...state, yMin: model ? 0 : min - pad, yMax: max + pad };
}
