/** Behavioral coverage for the MVP's math, discontinuities, bounds and persisted specifications. */
import { describe, expect, it } from "vitest";
import { compileExpression } from "../expression";
import { createDistribution, intervalProbability, distributionNames } from "../distributions";
import { defaultState, applyPreset, readPlotState } from "../model";
import { samplePlot, fitY } from "../sampling";
import { buildDiagram, axisTicks } from "../diagram";
import { createPlotTranslator } from "../lang";

const t = createPlotTranslator("en");
describe("formula interpreter", () => {
  it.each([
    ["2+3*4", 14],
    ["-2^2", -4],
    ["2^3^2", 512],
    ["2sin(pi/2)", 2],
    ["2(x+1)", 6],
    ["if(x<0,-x,x^2)", 4],
    ["ln(e)+log(100)", 3],
    ["a*x+b", 7],
    ["sqrt(-1)", NaN],
    ["2^-2", 0.25],
  ])("evaluates %s", (source, expected) => {
    const result = compileExpression(source)({ x: 2, a: 3, b: 1 });
    if (Number.isNaN(expected)) expect(result).toBeNaN();
    else expect(result).toBeCloseTo(expected, 10);
  });
  it.each([
    "window.alert(1)",
    "constructor(1)",
    "__proto__",
    "x;1",
    "sin()",
    "x=2",
    "sin(1,2)",
    "(",
    "x+y",
  ])("rejects %s", (source) => {
    expect(() => compileExpression(source)).toThrow();
  });
  it("bounds parser nesting and source length", () => {
    expect(() => compileExpression("(".repeat(100) + "1" + ")".repeat(100))).toThrow();
    expect(() => compileExpression("1".repeat(601))).toThrow();
  });
});
describe("probability models", () => {
  it("matches known normal probabilities", () => {
    const normal = createDistribution("normal", 0, 1);
    expect(normal.density(0)).toBeCloseTo(0.3989422804, 9);
    expect(intervalProbability(normal, -1, 1)).toBeCloseTo(0.682689492, 6);
  });
  it("matches Student t with one degree of freedom to Cauchy", () => {
    const student = createDistribution("student", 1, 1);
    for (const x of [-10, -1, 0, 1, 10]) {
      expect(student.cdf(x)).toBeCloseTo(0.5 + Math.atan(x) / Math.PI, 10);
      expect(student.density(x)).toBeCloseTo(1 / (Math.PI * (1 + x * x)), 10);
    }
  });
  it("preserves inclusive discrete interval endpoints and degenerate binomials", () => {
    const binomial = createDistribution("binomial", 2, 0.5);
    expect(intervalProbability(binomial, 1, 1)).toBeCloseTo(0.5, 10);
    expect(intervalProbability(binomial, 0.2, 1.9)).toBeCloseTo(0.5, 10);
    expect(createDistribution("binomial", 1000, 0).density(0)).toBe(1);
    expect(createDistribution("binomial", 1000, 1).cdf(999)).toBe(0);
    expect(createDistribution("poisson", 5, 1).density(0)).toBeCloseTo(Math.exp(-5), 10);
    expect(createDistribution("poisson", 1000, 1).cdf(1000)).toBeCloseTo(0.508409367, 7);
  });
  it.each(distributionNames)("has monotone bounded CDF for %s", (name) => {
    const p = name === "normal" || name === "lognormal" || name === "logistic" ? 0 : 5;
    const q = name === "uniform" ? 6 : name === "binomial" ? 0.4 : 1;
    const model = createDistribution(name, p, q);
    let last = 0;
    for (let x = -5; x <= 15; x += 0.5) {
      const cdf = model.cdf(x);
      expect(cdf).toBeGreaterThanOrEqual(last - 1e-12);
      expect(cdf).toBeLessThanOrEqual(1 + 1e-12);
      expect(model.density(x)).toBeGreaterThanOrEqual(0);
      last = cdf;
    }
  });
  it("rejects invalid parameters", () => {
    for (const [name, p, q] of [
      ["normal", 0, 0],
      ["uniform", 2, 1],
      ["exponential", -1, 1],
      ["binomial", 2.5, 0.5],
      ["binomial", 10, 1.1],
      ["poisson", 1001, 1],
      ["student", 0, 1],
    ] as const)
      expect(() => createDistribution(name, p, q)).toThrow();
  });
});
describe("diagram geometry", () => {
  it.each(["trig", "polynomial", "damped", "piecewise", "lissajous", "rose", "normal", "binomial"])(
    "renders finite bounded geometry for %s",
    (preset) => {
      const diagram = buildDiagram(applyPreset(defaultState, preset), t);
      expect(diagram.strokes.length).toBeGreaterThan(15);
      expect(diagram.strokes.every((s) => s.points.every((p) => p.every(Number.isFinite)))).toBe(
        true,
      );
      expect(diagram.captions[0]?.text).toBe("Scientific diagram");
    },
  );
  it("does not bridge across a reciprocal singularity", () => {
    const state = {
      ...defaultState,
      formulas: "1/(x-0.123)",
      xMin: -2,
      xMax: 2,
      yMin: -10,
      yMax: 10,
    };
    const paths = samplePlot(state).curves[0]!.paths;
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(paths.every((path) => !(path[0]![0] < 0.123 && path.at(-1)![0] > 0.123))).toBe(true);
  });
  it("fits constant functions and rejects undefined data", () => {
    const fitted = fitY({ ...defaultState, formulas: "2" });
    expect(fitted.yMin).toBeLessThan(2);
    expect(fitted.yMax).toBeGreaterThan(2);
    expect(() => fitY({ ...defaultState, formulas: "sqrt(-1)" })).toThrow();
    expect(() => buildDiagram({ ...defaultState, xMax: defaultState.xMin }, t)).toThrow();
    expect(axisTicks(-1e8, 1e8).length).toBeLessThan(30);
  });
  it("round trips specs and rejects corrupted settings", () => {
    expect(readPlotState(defaultState)).toEqual(defaultState);
    expect(readPlotState({ ...defaultState, a: NaN })).toBeNull();
    expect(readPlotState({ ...defaultState, mode: "unknown" })).toBeNull();
    expect(readPlotState(null)).toBeNull();
  });
});
