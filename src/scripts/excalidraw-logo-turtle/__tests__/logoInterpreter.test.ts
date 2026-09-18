/**
 * @file logoInterpreter.test.ts
 * @overview Behavioral coverage for the Turtle Logo interpreter.
 */

import { describe, expect, it } from "vitest";

import { LOGO_EXAMPLES } from "../examples";
import { interpretLogo, LogoRuntimeError } from "../logoInterpreter";

describe("Logo Turtle interpreter", () => {
  it("draws a square with common aliases", () => {
    const result = interpretLogo("repeat 4 [fd 100 rt 90]");
    const moves = result.operations.filter((operation) => operation.type === "move");
    expect(moves).toHaveLength(4);
    expect(moves[3]?.to.x).toBeCloseTo(0, 8);
    expect(moves[3]?.to.y).toBeCloseTo(0, 8);
  });

  it("supports procedures, parameters, variables, recursion, and stop", () => {
    const result = interpretLogo(`
      make "scale 2
      to branch :size
        if :size < 4 [stop]
        fd :size * :scale
        branch :size / 2
      end
      branch 8
    `);
    expect(result.operations.filter((operation) => operation.type === "move")).toHaveLength(2);
  });

  it("supports for and while loops with local variables", () => {
    const result = interpretLogo(`
      make "x 0
      for [i 1 3] [fd :i]
      while [:x < 3] [make "x :x + 1 rt 10]
    `);
    expect(result.operations.filter((operation) => operation.type === "move")).toHaveLength(3);
    expect(result.operations.filter((operation) => operation.type === "turn")).toHaveLength(3);
  });

  it("emits fill and label operations", () => {
    const result = interpretLogo(`
      setfillcolor "red
      beginfill
      repeat 3 [fd 50 rt 120]
      endfill
      label [Hello turtle]
    `);
    expect(result.operations.some((operation) => operation.type === "fill")).toBe(true);
    expect(result.operations.some((operation) => operation.type === "label" && operation.text === "Hello turtle")).toBe(true);
  });

  it("supports user procedures as reporters via output", () => {
    const result = interpretLogo(`
      to twice :n
        output :n * 2
      end
      fd twice 25
    `);
    const move = result.operations.find((operation) => operation.type === "move");
    expect(move?.type === "move" ? move.to.y : 0).toBeCloseTo(50, 8);
  });

  it("supports coordinate-list reporters and common pen aliases", () => {
    const result = interpretLogo(`
      setpos [10 20]
      setcolor "purple
      setwidth 4
      fd distance [13 24]
      seth towards [20 20]
      print pos
    `);
    const move = result.operations.filter((operation) => operation.type === "move").at(-1);
    expect(move?.type === "move" ? move.style.color : "").toBe("purple");
    expect(move?.type === "move" ? move.style.width : 0).toBe(4);
    expect(result.output.at(-1)).toBe("10 25");
  });

  it("parses every built-in example", () => {
    for (const example of LOGO_EXAMPLES) {
      expect(() => interpretLogo(example.source), example.id).not.toThrow();
    }
  });

  it("reports source locations for invalid Logo", () => {
    expect(() => interpretLogo("fd 10\nboing 20")).toThrow(LogoRuntimeError);
    expect(() => interpretLogo("fd 10\nboing 20")).toThrow(/line 2/);
  });
});
