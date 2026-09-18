/**
 * @file logoInterpreter.ts
 * @overview Tokenizes and executes a practical Turtle Logo dialect into canvas-neutral operations.
 */

import type {
  LogoFillOperation,
  LogoLabelOperation,
  LogoMoveOperation,
  LogoOperation,
  LogoPenStyle,
  LogoPoint,
  LogoProgramResult,
  LogoSourceLocation,
  LogoTurnOperation,
  LogoVisibilityOperation,
} from "./types";

interface Token extends LogoSourceLocation {
  value: string;
  kind: "word" | "number" | "symbol" | "newline";
}

interface ProcedureDefinition {
  name: string;
  parameters: string[];
  body: Token[];
}

type LogoValue = number | string | boolean | LogoValue[];

interface TurtleState {
  position: LogoPoint;
  heading: number;
  penDown: boolean;
  visible: boolean;
  pen: LogoPenStyle;
  fontSize: number;
  fillPoints: LogoPoint[] | null;
}

interface Scope {
  variables: Map<string, LogoValue>;
  parent: Scope | null;
}

interface ExecutionSignal {
  type: "stop" | "output";
  value?: LogoValue;
}

interface ExecutionContext {
  operations: LogoOperation[];
  output: string[];
  procedures: Map<string, ProcedureDefinition>;
  globals: Scope;
  scope: Scope;
  turtle: TurtleState;
  repcounts: number[];
  commandCount: number;
  recursionDepth: number;
  maxCommands: number;
}

const COMMAND_ALIASES: Readonly<Record<string, string>> = {
  fd: "forward",
  bk: "back",
  backward: "back",
  rt: "right",
  lt: "left",
  pu: "penup",
  pd: "pendown",
  st: "showturtle",
  ht: "hideturtle",
  seth: "setheading",
  setpc: "setpencolor",
  setcolor: "setpencolor",
  setpw: "setpensize",
  setwidth: "setpensize",
  setpenwidth: "setpensize",
  setposition: "setpos",
  cs: "clearscreen",
  pr: "print",
  op: "output",
};

const REPORTER_ARITY: Readonly<Record<string, number>> = {
  random: 1,
  sqrt: 1,
  abs: 1,
  round: 1,
  int: 1,
  sin: 1,
  cos: 1,
  tan: 1,
  arctan: 1,
  power: 2,
  modulo: 2,
  remainder: 2,
  min: 2,
  max: 2,
  sum: 2,
  difference: 2,
  product: 2,
  quotient: 2,
  word: 2,
  sentence: 2,
  se: 2,
  first: 1,
  last: 1,
  count: 1,
  thing: 1,
  ifelsevalue: 3,
  towards: 1,
  distance: 1,
};

const TWO_CHAR_SYMBOLS = new Set(["<=", ">=", "<>", "!=", "=="]);
const SINGLE_SYMBOLS = new Set(["[", "]", "(", ")", "+", "-", "*", "/", "%", "^", "=", "<", ">"]);
const MAX_RECURSION_DEPTH = 64;
const DEFAULT_MAX_COMMANDS = 25_000;

/** Error type carrying the closest Logo source location. */
export class LogoRuntimeError extends Error {
  public constructor(message: string, token?: Token) {
    super(token ? `${message} (line ${token.line}, column ${token.column})` : message);
    this.name = "LogoRuntimeError";
  }
}

function clonePoint(point: LogoPoint): LogoPoint {
  return { x: point.x, y: point.y };
}

function normalizeHeading(degrees: number): number {
  const value = degrees % 360;
  return value < 0 ? value + 360 : value;
}

function normalizeName(value: string): string {
  return value.toLowerCase();
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;
  while (index < source.length) {
    const char = source[index] ?? "";
    if (char === ";") {
      while (index < source.length && source[index] !== "\n") {
        index += 1;
        column += 1;
      }
      continue;
    }
    if (char === "\n") {
      tokens.push({ value: "\n", kind: "newline", line, column });
      index += 1;
      line += 1;
      column = 1;
      continue;
    }
    if (/\s/.test(char)) {
      index += 1;
      column += 1;
      continue;
    }
    const location = { line, column };
    const previous = index > 0 ? source[index - 1] ?? "" : "";
    const canStartSignedNumber =
      (char === "-" || char === "+") &&
      /[0-9.]/.test(source[index + 1] ?? "") &&
      (index === 0 || /\s|[([=<>+*/%^]/.test(previous));
    const numberMatch =
      (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(source[index + 1] ?? "")) || canStartSignedNumber)
        ? source.slice(index).match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i)
        : null;
    if (numberMatch) {
      const value = numberMatch[0];
      tokens.push({ value, kind: "number", ...location });
      index += value.length;
      column += value.length;
      continue;
    }
    const pair = source.slice(index, index + 2);
    if (TWO_CHAR_SYMBOLS.has(pair)) {
      tokens.push({ value: pair, kind: "symbol", ...location });
      index += 2;
      column += 2;
      continue;
    }
    if (SINGLE_SYMBOLS.has(char)) {
      tokens.push({ value: char, kind: "symbol", ...location });
      index += 1;
      column += 1;
      continue;
    }
    const start = index;
    while (index < source.length) {
      const current = source[index] ?? "";
      const currentPair = source.slice(index, index + 2);
      if (/\s/.test(current) || current === ";" || SINGLE_SYMBOLS.has(current) || TWO_CHAR_SYMBOLS.has(currentPair)) break;
      index += 1;
      column += 1;
    }
    const value = source.slice(start, index);
    tokens.push({ value, kind: "word", ...location });
  }
  return tokens;
}

function withoutNewlines(tokens: readonly Token[]): Token[] {
  return tokens.filter((token) => token.kind !== "newline");
}

function collectProcedures(tokens: Token[]): { procedures: Map<string, ProcedureDefinition>; executable: Token[] } {
  const procedures = new Map<string, ProcedureDefinition>();
  const executable: Token[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token || normalizeName(token.value) !== "to") {
      executable.push(token as Token);
      index += 1;
      continue;
    }
    const nameToken = nextSignificant(tokens, index + 1);
    if (!nameToken) throw new LogoRuntimeError("Expected a procedure name after TO", token);
    const parameters: string[] = [];
    let cursor = nameToken.index + 1;
    while (cursor < tokens.length && tokens[cursor]?.kind !== "newline") {
      const parameter = tokens[cursor];
      if (parameter?.value.startsWith(":")) parameters.push(normalizeName(parameter.value.slice(1)));
      else if (parameter) throw new LogoRuntimeError("Procedure parameters must begin with ':'", parameter);
      cursor += 1;
    }
    const body: Token[] = [];
    let foundEnd = false;
    let blockDepth = 0;
    cursor += 1;
    while (cursor < tokens.length) {
      const candidate = tokens[cursor];
      if (candidate?.value === "[") blockDepth += 1;
      if (candidate?.value === "]") blockDepth = Math.max(0, blockDepth - 1);
      if (candidate && blockDepth === 0 && normalizeName(candidate.value) === "end") {
        foundEnd = true;
        cursor += 1;
        break;
      }
      if (candidate) body.push(candidate);
      cursor += 1;
    }
    if (!foundEnd) throw new LogoRuntimeError(`Procedure '${nameToken.token.value}' is missing END`, nameToken.token);
    procedures.set(normalizeName(nameToken.token.value), {
      name: normalizeName(nameToken.token.value),
      parameters,
      body: withoutNewlines(body),
    });
    index = cursor;
  }
  return { procedures, executable: withoutNewlines(executable) };
}

function nextSignificant(tokens: readonly Token[], start: number): { token: Token; index: number } | null {
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token && token.kind !== "newline") return { token, index };
  }
  return null;
}

class TokenCursor {
  public index = 0;

  public constructor(public readonly tokens: Token[]) {}

  public peek(offset = 0): Token | undefined {
    return this.tokens[this.index + offset];
  }

  public take(): Token {
    const token = this.peek();
    if (!token) throw new LogoRuntimeError("Unexpected end of Logo program");
    this.index += 1;
    return token;
  }

  public done(): boolean {
    return this.index >= this.tokens.length;
  }
}

function asNumber(value: LogoValue, token?: Token): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) throw new LogoRuntimeError(`Expected a number, got '${stringifyValue(value)}'`, token);
  return number;
}

function asBoolean(value: LogoValue): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (Array.isArray(value)) return value.length > 0;
  return value.length > 0 && value.toLowerCase() !== "false";
}

function asWord(value: LogoValue): string {
  return Array.isArray(value) ? value.map(stringifyValue).join(" ") : stringifyValue(value);
}

function stringifyValue(value: LogoValue): string {
  if (Array.isArray(value)) return value.map(stringifyValue).join(" ");
  return String(value);
}

function getVariable(context: ExecutionContext, name: string, token?: Token): LogoValue {
  const normalized = normalizeName(name);
  let scope: Scope | null = context.scope;
  while (scope) {
    if (scope.variables.has(normalized)) return scope.variables.get(normalized) as LogoValue;
    scope = scope.parent;
  }
  throw new LogoRuntimeError(`Unknown variable ':${name}'`, token);
}

function setGlobalVariable(context: ExecutionContext, name: string, value: LogoValue): void {
  context.globals.variables.set(normalizeName(name), value);
}

function setVariable(context: ExecutionContext, name: string, value: LogoValue): void {
  const normalized = normalizeName(name);
  let scope: Scope | null = context.scope;
  while (scope) {
    if (scope.variables.has(normalized)) {
      scope.variables.set(normalized, value);
      return;
    }
    scope = scope.parent;
  }
  setGlobalVariable(context, normalized, value);
}

function setLocalVariable(context: ExecutionContext, name: string, value: LogoValue): void {
  context.scope.variables.set(normalizeName(name), value);
}

function resolveWordLiteral(token: Token): string {
  if (!token.value.startsWith('"')) throw new LogoRuntimeError("Expected a quoted Logo word", token);
  return token.value.slice(1);
}

function parseList(cursor: TokenCursor): LogoValue[] {
  const start = cursor.take();
  if (start.value !== "[") throw new LogoRuntimeError("Expected '['", start);
  const values: LogoValue[] = [];
  while (!cursor.done() && cursor.peek()?.value !== "]") {
    const token = cursor.take();
    if (token.value === "[") {
      cursor.index -= 1;
      values.push(parseList(cursor));
    } else if (token.kind === "number") values.push(Number(token.value));
    else if (token.value.startsWith('"')) values.push(token.value.slice(1));
    else values.push(token.value);
  }
  const end = cursor.take();
  if (end.value !== "]") throw new LogoRuntimeError("Expected ']'", end);
  return values;
}

function extractBlock(cursor: TokenCursor): Token[] {
  const start = cursor.take();
  if (start.value !== "[") throw new LogoRuntimeError("Expected '[' to begin a Logo block", start);
  const result: Token[] = [];
  let depth = 1;
  while (!cursor.done()) {
    const token = cursor.take();
    if (token.value === "[") depth += 1;
    if (token.value === "]") depth -= 1;
    if (depth === 0) return result;
    result.push(token);
  }
  throw new LogoRuntimeError("Unclosed '[' block", start);
}

function precedence(operator: string): number {
  if (operator === "or") return 1;
  if (operator === "and") return 2;
  if (["=", "==", "<>", "!=", "<", ">", "<=", ">="].includes(operator)) return 3;
  if (["+", "-"].includes(operator)) return 4;
  if (["*", "/", "%"].includes(operator)) return 5;
  if (operator === "^") return 6;
  return 0;
}

function applyBinary(operator: string, left: LogoValue, right: LogoValue, token: Token): LogoValue {
  switch (operator) {
    case "+": return asNumber(left, token) + asNumber(right, token);
    case "-": return asNumber(left, token) - asNumber(right, token);
    case "*": return asNumber(left, token) * asNumber(right, token);
    case "/": return asNumber(left, token) / asNumber(right, token);
    case "%": return asNumber(left, token) % asNumber(right, token);
    case "^": return asNumber(left, token) ** asNumber(right, token);
    case "=":
    case "==": return stringifyValue(left) === stringifyValue(right);
    case "<>":
    case "!=": return stringifyValue(left) !== stringifyValue(right);
    case "<": return asNumber(left, token) < asNumber(right, token);
    case ">": return asNumber(left, token) > asNumber(right, token);
    case "<=": return asNumber(left, token) <= asNumber(right, token);
    case ">=": return asNumber(left, token) >= asNumber(right, token);
    case "and": return asBoolean(left) && asBoolean(right);
    case "or": return asBoolean(left) || asBoolean(right);
    default: throw new LogoRuntimeError(`Unsupported operator '${operator}'`, token);
  }
}

function parseExpression(cursor: TokenCursor, context: ExecutionContext, minPrecedence = 1): LogoValue {
  let left = parsePrefix(cursor, context);
  while (!cursor.done()) {
    const token = cursor.peek();
    if (!token) break;
    const operator = normalizeName(token.value);
    const currentPrecedence = precedence(operator);
    if (currentPrecedence < minPrecedence) break;
    cursor.take();
    const right = parseExpression(cursor, context, currentPrecedence + (operator === "^" ? 0 : 1));
    left = applyBinary(operator, left, right, token);
  }
  return left;
}

function parsePrefix(cursor: TokenCursor, context: ExecutionContext): LogoValue {
  const token = cursor.take();
  const word = normalizeName(token.value);
  if (token.value === "(") {
    const value = parseExpression(cursor, context);
    const close = cursor.take();
    if (close.value !== ")") throw new LogoRuntimeError("Expected ')'", close);
    return value;
  }
  if (token.value === "-") return -asNumber(parsePrefix(cursor, context), token);
  if (word === "not") return !asBoolean(parsePrefix(cursor, context));
  if (token.kind === "number") return Number(token.value);
  if (token.value.startsWith(":")) return getVariable(context, token.value.slice(1), token);
  if (token.value.startsWith('"')) return token.value.slice(1);
  if (token.value === "[") {
    cursor.index -= 1;
    return parseList(cursor);
  }
  if (word === "true") return true;
  if (word === "false") return false;
  if (word === "pi") return Math.PI;
  if (word === "repcount") return context.repcounts.at(-1) ?? 0;
  if (word === "heading") return context.turtle.heading;
  if (word === "xcor") return context.turtle.position.x;
  if (word === "ycor") return context.turtle.position.y;
  if (word === "pos") return [context.turtle.position.x, context.turtle.position.y];
  if (word === "pencolor") return context.turtle.pen.color;
  if (word === "pensize") return context.turtle.pen.width;
  if (word === "shownp") return context.turtle.visible;
  if (word === "pendownp") return context.turtle.penDown;
  const reporterArity = REPORTER_ARITY[word];
  if (reporterArity !== undefined) return evaluateReporter(word, reporterArity, cursor, context, token);
  const procedure = context.procedures.get(word);
  if (procedure) return executeProcedure(procedure, cursor, context, token) ?? 0;
  throw new LogoRuntimeError(`Unknown reporter or value '${token.value}'`, token);
}

function evaluateReporter(name: string, arity: number, cursor: TokenCursor, context: ExecutionContext, token: Token): LogoValue {
  const args = Array.from({ length: arity }, () => parseExpression(cursor, context));
  switch (name) {
    case "random": return Math.floor(Math.random() * Math.max(0, asNumber(args[0] ?? 0, token)));
    case "sqrt": return Math.sqrt(asNumber(args[0] ?? 0, token));
    case "abs": return Math.abs(asNumber(args[0] ?? 0, token));
    case "round": return Math.round(asNumber(args[0] ?? 0, token));
    case "int": return Math.trunc(asNumber(args[0] ?? 0, token));
    case "sin": return Math.sin((asNumber(args[0] ?? 0, token) * Math.PI) / 180);
    case "cos": return Math.cos((asNumber(args[0] ?? 0, token) * Math.PI) / 180);
    case "tan": return Math.tan((asNumber(args[0] ?? 0, token) * Math.PI) / 180);
    case "arctan": return (Math.atan(asNumber(args[0] ?? 0, token)) * 180) / Math.PI;
    case "power": return asNumber(args[0] ?? 0, token) ** asNumber(args[1] ?? 0, token);
    case "modulo": return ((asNumber(args[0] ?? 0, token) % asNumber(args[1] ?? 1, token)) + asNumber(args[1] ?? 1, token)) % asNumber(args[1] ?? 1, token);
    case "remainder": return asNumber(args[0] ?? 0, token) % asNumber(args[1] ?? 1, token);
    case "min": return Math.min(asNumber(args[0] ?? 0, token), asNumber(args[1] ?? 0, token));
    case "max": return Math.max(asNumber(args[0] ?? 0, token), asNumber(args[1] ?? 0, token));
    case "sum": return asNumber(args[0] ?? 0, token) + asNumber(args[1] ?? 0, token);
    case "difference": return asNumber(args[0] ?? 0, token) - asNumber(args[1] ?? 0, token);
    case "product": return asNumber(args[0] ?? 0, token) * asNumber(args[1] ?? 0, token);
    case "quotient": return asNumber(args[0] ?? 0, token) / asNumber(args[1] ?? 1, token);
    case "word": return `${asWord(args[0] ?? "")}${asWord(args[1] ?? "")}`;
    case "sentence": return [...toList(args[0] ?? ""), ...toList(args[1] ?? "")];
    case "se": return [...toList(args[0] ?? ""), ...toList(args[1] ?? "")];
    case "first": return firstValue(args[0] ?? "");
    case "last": return lastValue(args[0] ?? "");
    case "count": return Array.isArray(args[0]) ? args[0].length : asWord(args[0] ?? "").length;
    case "thing": return getVariable(context, asWord(args[0] ?? ""), token);
    case "ifelsevalue": return asBoolean(args[0] ?? false) ? (args[1] ?? "") : (args[2] ?? "");
    case "towards": return headingTowards(context.turtle.position, pointFromValue(args[0] ?? [], token));
    case "distance": {
      const point = pointFromValue(args[0] ?? [], token);
      return Math.hypot(point.x - context.turtle.position.x, point.y - context.turtle.position.y);
    }
    default: throw new LogoRuntimeError(`Unsupported reporter '${name}'`, token);
  }
}

function pointFromValue(value: LogoValue, token?: Token): LogoPoint {
  if (!Array.isArray(value) || value.length < 2) {
    throw new LogoRuntimeError("Expected a two-item coordinate list such as [100 50]", token);
  }
  return { x: asNumber(value[0] ?? 0, token), y: asNumber(value[1] ?? 0, token) };
}

function headingTowards(from: LogoPoint, to: LogoPoint): number {
  const radians = Math.atan2(to.x - from.x, to.y - from.y);
  return normalizeHeading((radians * 180) / Math.PI);
}

function toList(value: LogoValue): LogoValue[] {
  return Array.isArray(value) ? value : [value];
}

function firstValue(value: LogoValue): LogoValue {
  if (Array.isArray(value)) return value[0] ?? "";
  return asWord(value).charAt(0);
}

function lastValue(value: LogoValue): LogoValue {
  if (Array.isArray(value)) return value.at(-1) ?? "";
  return asWord(value).slice(-1);
}

function emitMove(context: ExecutionContext, distance: number): void {
  const radians = ((90 - context.turtle.heading) * Math.PI) / 180;
  const from = clonePoint(context.turtle.position);
  const to = { x: from.x + Math.cos(radians) * distance, y: from.y + Math.sin(radians) * distance };
  const operation: LogoMoveOperation = {
    type: "move",
    from,
    to,
    heading: context.turtle.heading,
    draw: context.turtle.penDown,
    style: { ...context.turtle.pen },
  };
  context.operations.push(operation);
  context.turtle.position = to;
  if (context.turtle.fillPoints) context.turtle.fillPoints.push(clonePoint(to));
}

function emitPositionMove(context: ExecutionContext, to: LogoPoint): void {
  const from = clonePoint(context.turtle.position);
  context.operations.push({
    type: "move",
    from,
    to: clonePoint(to),
    heading: context.turtle.heading,
    draw: context.turtle.penDown,
    style: { ...context.turtle.pen },
  });
  context.turtle.position = clonePoint(to);
  if (context.turtle.fillPoints) context.turtle.fillPoints.push(clonePoint(to));
}

function emitTurn(context: ExecutionContext, heading: number): void {
  const operation: LogoTurnOperation = {
    type: "turn",
    at: clonePoint(context.turtle.position),
    fromHeading: context.turtle.heading,
    toHeading: normalizeHeading(heading),
    visible: context.turtle.visible,
  };
  context.operations.push(operation);
  context.turtle.heading = operation.toHeading;
}

function emitVisibility(context: ExecutionContext, visible: boolean): void {
  context.turtle.visible = visible;
  const operation: LogoVisibilityOperation = {
    type: "visibility",
    at: clonePoint(context.turtle.position),
    heading: context.turtle.heading,
    visible,
  };
  context.operations.push(operation);
}

function executeSequence(tokens: Token[], context: ExecutionContext): ExecutionSignal | null {
  const cursor = new TokenCursor(tokens);
  while (!cursor.done()) {
    const signal = executeCommand(cursor, context);
    if (signal) return signal;
  }
  return null;
}

function bumpCommand(context: ExecutionContext, token: Token): void {
  context.commandCount += 1;
  if (context.commandCount > context.maxCommands) {
    throw new LogoRuntimeError(`Program exceeded the ${context.maxCommands.toLocaleString()} command safety limit`, token);
  }
}

function executeCommand(cursor: TokenCursor, context: ExecutionContext): ExecutionSignal | null {
  const token = cursor.take();
  const rawName = normalizeName(token.value);
  const name = COMMAND_ALIASES[rawName] ?? rawName;
  bumpCommand(context, token);
  const procedure = context.procedures.get(name);
  if (procedure) {
    executeProcedure(procedure, cursor, context, token);
    return null;
  }
  if (["forward", "back", "right", "left", "setheading", "setx", "sety"].includes(name)) {
    executeSingleNumberCommand(name, parseExpression(cursor, context), context);
    return null;
  }
  switch (name) {
    case "setxy": executeSetXY(cursor, context); break;
    case "setpos": emitPositionMove(context, pointFromValue(parseExpression(cursor, context), token)); break;
    case "home": emitPositionMove(context, { x: 0, y: 0 }); emitTurn(context, 0); break;
    case "penup": context.turtle.penDown = false; break;
    case "pendown": context.turtle.penDown = true; break;
    case "showturtle": emitVisibility(context, true); break;
    case "hideturtle": emitVisibility(context, false); break;
    case "setpencolor": context.turtle.pen.color = asWord(parseExpression(cursor, context)); break;
    case "setfillcolor": context.turtle.pen.fillColor = asWord(parseExpression(cursor, context)); break;
    case "setpensize": context.turtle.pen.width = Math.max(0.5, asNumber(parseExpression(cursor, context), token)); break;
    case "setfontsize": context.turtle.fontSize = Math.max(8, asNumber(parseExpression(cursor, context), token)); break;
    case "repeat": return executeRepeat(cursor, context, token);
    case "for": return executeFor(cursor, context, token);
    case "while": return executeWhile(cursor, context, token);
    case "if": return executeIf(cursor, context);
    case "ifelse": return executeIfElse(cursor, context);
    case "run": return executeSequence(extractBlock(cursor), context);
    case "make": setVariable(context, resolveWordLiteral(cursor.take()), parseExpression(cursor, context)); break;
    case "localmake": setLocalVariable(context, resolveWordLiteral(cursor.take()), parseExpression(cursor, context)); break;
    case "print": context.output.push(stringifyValue(parseExpression(cursor, context))); break;
    case "show": context.output.push(stringifyValue(parseExpression(cursor, context))); break;
    case "label": emitLabel(context, parseExpression(cursor, context)); break;
    case "wait": context.operations.push({ type: "wait", milliseconds: Math.max(0, asNumber(parseExpression(cursor, context), token) * (1000 / 60)) }); break;
    case "beginfill": context.turtle.fillPoints = [clonePoint(context.turtle.position)]; break;
    case "endfill": finishFill(context); break;
    case "clean": context.operations.length = 0; break;
    case "clearscreen": resetCanvasState(context); break;
    case "stop": return { type: "stop" };
    case "output": return { type: "output", value: parseExpression(cursor, context) };
    default: throw new LogoRuntimeError(`Unknown command '${token.value}'`, token);
  }
  return null;
}

function executeSingleNumberCommand(name: string, rawValue: LogoValue, context: ExecutionContext): void {
  const value = asNumber(rawValue);
  switch (name) {
    case "forward": emitMove(context, value); break;
    case "back": emitMove(context, -value); break;
    case "right": emitTurn(context, context.turtle.heading + value); break;
    case "left": emitTurn(context, context.turtle.heading - value); break;
    case "setheading": emitTurn(context, value); break;
    case "setx": emitPositionMove(context, { x: value, y: context.turtle.position.y }); break;
    case "sety": emitPositionMove(context, { x: context.turtle.position.x, y: value }); break;
  }
}

function executeSetXY(cursor: TokenCursor, context: ExecutionContext): void {
  const x = asNumber(parseExpression(cursor, context));
  const y = asNumber(parseExpression(cursor, context));
  emitPositionMove(context, { x, y });
}

function executeRepeat(cursor: TokenCursor, context: ExecutionContext, token: Token): ExecutionSignal | null {
  const count = Math.max(0, Math.floor(asNumber(parseExpression(cursor, context), token)));
  const block = extractBlock(cursor);
  for (let index = 1; index <= count; index += 1) {
    context.repcounts.push(index);
    const signal = executeSequence(block, context);
    context.repcounts.pop();
    if (signal) return signal;
  }
  return null;
}

function executeFor(cursor: TokenCursor, context: ExecutionContext, token: Token): ExecutionSignal | null {
  const controlTokens = extractBlock(cursor);
  const control = new TokenCursor(controlTokens);
  const variableToken = control.take();
  const variable = variableToken.value.replace(/^"|^:/, "");
  const start = asNumber(parseExpression(control, context), token);
  const end = asNumber(parseExpression(control, context), token);
  const step = control.done() ? (end >= start ? 1 : -1) : asNumber(parseExpression(control, context), token);
  if (step === 0) throw new LogoRuntimeError("FOR step cannot be zero", token);
  const block = extractBlock(cursor);
  const condition = (value: number): boolean => step > 0 ? value <= end : value >= end;
  let iteration = 0;
  for (let value = start; condition(value); value += step) {
    iteration += 1;
    setLocalVariable(context, variable, value);
    context.repcounts.push(iteration);
    const signal = executeSequence(block, context);
    context.repcounts.pop();
    if (signal) return signal;
  }
  return null;
}

function evaluateExpressionBlock(tokens: Token[], context: ExecutionContext): LogoValue {
  const cursor = new TokenCursor(tokens);
  const value = parseExpression(cursor, context);
  if (!cursor.done()) throw new LogoRuntimeError(`Unexpected token '${cursor.peek()?.value ?? ""}' in condition`, cursor.peek());
  return value;
}

function executeWhile(cursor: TokenCursor, context: ExecutionContext, token: Token): ExecutionSignal | null {
  const conditionTokens = extractBlock(cursor);
  const block = extractBlock(cursor);
  let iteration = 0;
  while (asBoolean(evaluateExpressionBlock(conditionTokens, context))) {
    iteration += 1;
    if (iteration > context.maxCommands) throw new LogoRuntimeError("WHILE exceeded the loop safety limit", token);
    context.repcounts.push(iteration);
    const signal = executeSequence(block, context);
    context.repcounts.pop();
    if (signal) return signal;
  }
  return null;
}

function executeIf(cursor: TokenCursor, context: ExecutionContext): ExecutionSignal | null {
  const condition = asBoolean(parseExpression(cursor, context));
  const block = extractBlock(cursor);
  return condition ? executeSequence(block, context) : null;
}

function executeIfElse(cursor: TokenCursor, context: ExecutionContext): ExecutionSignal | null {
  const condition = asBoolean(parseExpression(cursor, context));
  const whenTrue = extractBlock(cursor);
  const whenFalse = extractBlock(cursor);
  return executeSequence(condition ? whenTrue : whenFalse, context);
}

function emitLabel(context: ExecutionContext, value: LogoValue): void {
  const operation: LogoLabelOperation = {
    type: "label",
    at: clonePoint(context.turtle.position),
    text: asWord(value),
    heading: context.turtle.heading,
    color: context.turtle.pen.color,
    fontSize: context.turtle.fontSize,
  };
  context.operations.push(operation);
}

function finishFill(context: ExecutionContext): void {
  const points = context.turtle.fillPoints;
  context.turtle.fillPoints = null;
  if (!points || points.length < 3) return;
  const operation: LogoFillOperation = { type: "fill", points, style: { ...context.turtle.pen } };
  context.operations.push(operation);
}

function resetCanvasState(context: ExecutionContext): void {
  context.operations.length = 0;
  context.turtle.position = { x: 0, y: 0 };
  context.turtle.heading = 0;
  context.turtle.penDown = true;
  context.turtle.fillPoints = null;
}

function executeProcedure(procedure: ProcedureDefinition, cursor: TokenCursor, context: ExecutionContext, token: Token): LogoValue | undefined {
  if (context.recursionDepth >= MAX_RECURSION_DEPTH) throw new LogoRuntimeError("Maximum procedure recursion depth exceeded", token);
  const values = procedure.parameters.map(() => parseExpression(cursor, context));
  const previousScope = context.scope;
  const localScope: Scope = { variables: new Map(), parent: previousScope };
  procedure.parameters.forEach((parameter, index) => localScope.variables.set(parameter, values[index] ?? 0));
  context.scope = localScope;
  context.recursionDepth += 1;
  try {
    const signal = executeSequence(procedure.body, context);
    return signal?.type === "output" ? signal.value : undefined;
  } finally {
    context.recursionDepth -= 1;
    context.scope = previousScope;
  }
}

/** Parses and executes Logo source into deterministic drawing operations. */
export function interpretLogo(source: string, maxCommands = DEFAULT_MAX_COMMANDS): LogoProgramResult {
  const { procedures, executable } = collectProcedures(tokenize(source));
  const globals: Scope = { variables: new Map(), parent: null };
  const context: ExecutionContext = {
    operations: [],
    output: [],
    procedures,
    globals,
    scope: globals,
    turtle: {
      position: { x: 0, y: 0 },
      heading: 0,
      penDown: true,
      visible: true,
      pen: { color: "#1e1e1e", width: 2, fillColor: "#a5d8ff" },
      fontSize: 18,
      fillPoints: null,
    },
    repcounts: [],
    commandCount: 0,
    recursionDepth: 0,
    maxCommands,
  };
  executeSequence(executable, context);
  finishFill(context);
  return { operations: context.operations, output: context.output, commandCount: context.commandCount };
}
