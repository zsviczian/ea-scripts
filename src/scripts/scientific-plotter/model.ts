/** Serializable plot specifications and deliberately bounded settings recovery. */
import { distributionNames, type DistributionName } from "./distributions";
import { PlotError } from "./expression";

export type PlotMode = "functions" | "parametric" | "polar" | "distribution";
export type Point = [number, number];
export interface PlotState {
  version: 1;
  mode: PlotMode;
  formulas: string;
  xFormula: string;
  yFormula: string;
  tMin: number;
  tMax: number;
  a: number;
  b: number;
  c: number;
  distribution: DistributionName;
  p: number;
  q: number;
  cumulative: boolean;
  shade: boolean;
  lower: number;
  upper: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  width: number;
  height: number;
  title: string;
  xLabel: string;
  yLabel: string;
  grid: boolean;
  legend: boolean;
  piTicks: boolean;
}
export const defaultState: PlotState = {
  version: 1,
  mode: "functions",
  formulas: "a*sin(x)\ncos(x)",
  xFormula: "cos(a*t)",
  yFormula: "sin(b*t)",
  tMin: 0,
  tMax: 2 * Math.PI,
  a: 1,
  b: 2,
  c: 0,
  distribution: "normal",
  p: 0,
  q: 1,
  cumulative: false,
  shade: true,
  lower: -1,
  upper: 1,
  xMin: -2 * Math.PI,
  xMax: 2 * Math.PI,
  yMin: -1.5,
  yMax: 1.5,
  width: 720,
  height: 460,
  title: "",
  xLabel: "x",
  yLabel: "y",
  grid: true,
  legend: true,
  piTicks: true,
};

/** Narrows untrusted settings or drawing metadata without casting arbitrary input into a plot. */
export function readPlotState(value: unknown): PlotState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1) return null;
  const state = { ...defaultState };
  for (const key of Object.keys(defaultState) as (keyof PlotState)[]) {
    const item = record[key];
    if (typeof item !== typeof defaultState[key]) return null;
    if (typeof item === "number" && !Number.isFinite(item)) return null;
    if (typeof item === "string" && item.length > 4000) return null;
    Object.assign(state, { [key]: item });
  }
  if (
    !["functions", "parametric", "polar", "distribution"].includes(state.mode) ||
    !distributionNames.includes(state.distribution)
  )
    return null;
  return state;
}

/** Validates drawing dimensions, finite parameters and ordered, representable bounds. */
export function validateState(state: PlotState): void {
  for (const [min, max] of [
    [state.xMin, state.xMax],
    [state.yMin, state.yMax],
    [state.tMin, state.tMax],
  ] as const) {
    const span = max - min;
    if (
      !Number.isFinite(min) ||
      !Number.isFinite(max) ||
      span < 1e-10 ||
      span > 1e10 ||
      Math.max(Math.abs(min), Math.abs(max)) > 1e12
    )
      throw new PlotError("invalidRange");
  }
  if (![state.a, state.b, state.c].every(Number.isFinite)) throw new PlotError("invalidParameters");
  if (
    !Number.isFinite(state.width) ||
    !Number.isFinite(state.height) ||
    state.width < 320 ||
    state.width > 1600 ||
    state.height < 240 ||
    state.height > 1200
  )
    throw new PlotError("invalidRange");
}

/** Applies a named starter while preserving diagram appearance. */
export function applyPreset(state: PlotState, preset: string): PlotState {
  const base = {
    ...state,
    ...defaultState,
    title: state.title,
    width: state.width,
    height: state.height,
    grid: state.grid,
    legend: state.legend,
  };
  switch (preset) {
    case "polynomial":
      return {
        ...base,
        formulas: "a*x^3 + b*x + c",
        xMin: -3,
        xMax: 3,
        yMin: -5,
        yMax: 5,
        b: -2,
        piTicks: false,
      };
    case "damped":
      return {
        ...base,
        formulas: "exp(-a*x)*sin(b*x)",
        a: 0.3,
        b: 3,
        xMin: 0,
        xMax: 12,
        piTicks: false,
      };
    case "piecewise":
      return {
        ...base,
        formulas: "if(x<0, -x, x^2)",
        xMin: -3,
        xMax: 3,
        yMin: -1,
        yMax: 9,
        piTicks: false,
      };
    case "lissajous":
      return { ...base, mode: "parametric", a: 3, b: 2, xMin: -1.5, xMax: 1.5, piTicks: false };
    case "rose":
      return {
        ...base,
        mode: "polar",
        yFormula: "cos(a*t)",
        a: 3,
        xMin: -1.5,
        xMax: 1.5,
        piTicks: false,
      };
    case "normal":
      return {
        ...base,
        mode: "distribution",
        xMin: -4,
        xMax: 4,
        yMin: 0,
        yMax: 0.5,
        piTicks: false,
      };
    case "binomial":
      return {
        ...base,
        mode: "distribution",
        distribution: "binomial",
        p: 20,
        q: 0.5,
        xMin: -1,
        xMax: 21,
        yMin: 0,
        yMax: 0.22,
        lower: 8,
        upper: 12,
        piTicks: false,
      };
    default:
      return base;
  }
}
