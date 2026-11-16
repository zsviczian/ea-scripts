/** A bounded mathematical expression interpreter. User input is never evaluated as JavaScript. */
export type Variables = Readonly<Record<string, number>>;
type Evaluate = (variables: Variables) => number;

/** Carries a localized error key and the offending token, if present. */
export class PlotError extends Error {
  public constructor(
    public readonly key:
      | "expressionError"
      | "unknownSymbol"
      | "invalidRange"
      | "invalidParameters"
      | "noData"
      | "tooComplex",
    public readonly detail = "",
  ) {
    super(key);
  }
}

const functions: Record<string, { arity: number; run: (...args: number[]) => number }> = {
  sin: { arity: 1, run: Math.sin },
  cos: { arity: 1, run: Math.cos },
  tan: { arity: 1, run: Math.tan },
  asin: { arity: 1, run: Math.asin },
  acos: { arity: 1, run: Math.acos },
  atan: { arity: 1, run: Math.atan },
  sinh: { arity: 1, run: Math.sinh },
  cosh: { arity: 1, run: Math.cosh },
  tanh: { arity: 1, run: Math.tanh },
  sqrt: { arity: 1, run: Math.sqrt },
  cbrt: { arity: 1, run: Math.cbrt },
  abs: { arity: 1, run: Math.abs },
  exp: { arity: 1, run: Math.exp },
  ln: { arity: 1, run: Math.log },
  log: { arity: 1, run: Math.log10 },
  floor: { arity: 1, run: Math.floor },
  ceil: { arity: 1, run: Math.ceil },
  round: { arity: 1, run: Math.round },
  sign: { arity: 1, run: Math.sign },
  min: { arity: 2, run: Math.min },
  max: { arity: 2, run: Math.max },
  atan2: { arity: 2, run: Math.atan2 },
  pow: { arity: 2, run: Math.pow },
  if: { arity: 3, run: (condition, yes, no) => (condition ? yes : no) },
};

/** Compiles arithmetic, functions, comparisons, and implicit multiplication into a safe closure. */
export function compileExpression(source: string, allowed = ["x", "t", "a", "b", "c"]): Evaluate {
  if (source.length > 600) throw new PlotError("tooComplex");
  const normalized = source
    .replaceAll("π", "pi")
    .replaceAll("−", "-")
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .trim();
  const tokens =
    normalized.match(
      /(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?|[a-zA-Z]+\d*|<=|>=|==|!=|[+\-*/%^(),<>]|\S/g,
    ) ?? [];
  if (tokens.length > 250) throw new PlotError("tooComplex");
  let index = 0;
  let depth = 0;
  /** Consumes one operand, including prefix operators and function calls. */
  function operand(): Evaluate {
    const token = tokens[index++];
    if (!token) throw new PlotError("expressionError", "∅");
    if (token === "+" || token === "-") {
      const value = expression(4);
      return token === "-" ? (v) => -value(v) : value;
    }
    if (token === "(") {
      const value = expression(0);
      if (tokens[index++] !== ")") throw new PlotError("expressionError", ")");
      return value;
    }
    if (/^(?:\d|\.)/.test(token) && Number.isFinite(Number(token))) return () => Number(token);
    const name = token.toLowerCase();
    if (name === "pi") return () => Math.PI;
    if (name === "e") return () => Math.E;
    if (Object.hasOwn(functions, name)) {
      const fn = functions[name]!;
      if (tokens[index++] !== "(") throw new PlotError("expressionError", `${name}(`);
      const args: Evaluate[] = [];
      for (let i = 0; i < fn.arity; i++) {
        if (i && tokens[index++] !== ",") throw new PlotError("expressionError", ",");
        args.push(expression(0));
      }
      if (tokens[index++] !== ")") throw new PlotError("expressionError", ")");
      return (v) => fn.run(...args.map((arg) => arg(v)));
    }
    if (allowed.includes(name)) return (v) => v[name] ?? NaN;
    throw new PlotError("unknownSymbol", token);
  }
  /** Pratt parser: powers associate right and bind more tightly than unary minus. */
  function expression(minimum: number): Evaluate {
    if (++depth > 40) throw new PlotError("tooComplex");
    let left = operand();
    for (;;) {
      const token = tokens[index];
      const implicit = token !== undefined && /^(?:[a-zA-Z\d.(])/.test(token);
      const op = implicit ? "*" : token;
      const precedence =
        op && ["<", ">", "<=", ">=", "==", "!="].includes(op)
          ? 1
          : op === "+" || op === "-"
            ? 2
            : op === "*" || op === "/" || op === "%"
              ? 3
              : op === "^"
                ? 5
                : 0;
      if (!precedence || precedence < minimum) break;
      if (!implicit) index++;
      const right = expression(op === "^" ? precedence : precedence + 1);
      const previous = left;
      left = (v) => operate(op!, previous(v), right(v));
    }
    depth--;
    return left;
  }
  const result = expression(0);
  if (index !== tokens.length) throw new PlotError("expressionError", tokens[index]);
  return result;
}

/** Applies only whitelisted scalar operators. */
function operate(op: string, a: number, b: number): number {
  switch (op) {
    case "+":
      return a + b;
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return a / b;
    case "%":
      return a % b;
    case "^":
      return a ** b;
    case "<":
      return Number(a < b);
    case ">":
      return Number(a > b);
    case "<=":
      return Number(a <= b);
    case ">=":
      return Number(a >= b);
    case "==":
      return Number(a === b);
    case "!=":
      return Number(a !== b);
    default:
      return NaN;
  }
}
