/**
 * @file logoRenderer.ts
 * @overview Animates Logo operations through ExcalidrawAutomate and finishes with a titled metadata frame.
 */

import type {
  LogoMoveOperation,
  LogoOperation,
  LogoPoint,
  LogoProgramResult,
  LogoRunSummary,
  LogoStoredScript,
} from "./types";

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface RenderContext {
  ea: ExcalidrawAutomate;
  origin: LogoPoint;
  turtleId: string | null;
  turtleAnchor: LogoPoint | null;
  turtleElementOrigin: LogoPoint | null;
  generatedIds: string[];
  delayMs: number;
  signal: AbortSignal;
}

const COLOR_NAMES: Readonly<Record<string, string>> = {
  black: "#1e1e1e",
  white: "#ffffff",
  red: "#e03131",
  orange: "#f08c00",
  yellow: "#f9c74f",
  green: "#2f9e44",
  blue: "#1971c2",
  purple: "#7048e8",
  violet: "#7048e8",
  pink: "#d6336c",
  gray: "#868e96",
  grey: "#868e96",
  brown: "#8d5524",
  cyan: "#1098ad",
  magenta: "#c2255c",
};

const TURTLE_COLOR = "#2f9e44";
const TURTLE_FILL = "#b2f2bb";
const FRAME_PADDING = 28;
const TITLE_HEIGHT = 42;

function normalizeColor(color: string): string {
  return COLOR_NAMES[color.toLowerCase()] ?? color;
}

function toScene(point: LogoPoint, origin: LogoPoint): LogoPoint {
  return { x: origin.x + point.x, y: origin.y - point.y };
}

function includePoint(bounds: Bounds, point: LogoPoint): void {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

function getProgramBounds(operations: readonly LogoOperation[]): Bounds {
  const bounds: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const operation of operations) {
    if (operation.type === "move" && operation.draw) {
      includePoint(bounds, operation.from);
      includePoint(bounds, operation.to);
    } else if (operation.type === "fill") {
      operation.points.forEach((point) => includePoint(bounds, point));
    } else if (operation.type === "label") {
      includePoint(bounds, operation.at);
      includePoint(bounds, {
        x: operation.at.x + Math.max(40, operation.text.length * operation.fontSize * 0.55),
        y: operation.at.y + operation.fontSize,
      });
    }
  }
  if (!Number.isFinite(bounds.minX)) return { minX: -80, minY: -50, maxX: 80, maxY: 50 };
  return bounds;
}

function getViewportCenter(ea: ExcalidrawAutomate): LogoPoint {
  const api = ea.getExcalidrawAPI();
  const view = ea.targetView;
  const state = api?.getAppState();
  if (!state || !view) return { x: 0, y: 0 };
  const zoom = state.zoom.value || 1;
  const width = state.width || view.contentEl.innerWidth || 800;
  const height = state.height || view.contentEl.innerHeight || 600;
  const offsetLeft = state.offsetLeft ?? 0;
  const offsetTop = state.offsetTop ?? 0;
  return {
    x: (width / 2 - offsetLeft) / zoom - state.scrollX,
    y: (height / 2 - offsetTop) / zoom - state.scrollY,
  };
}

function getOrigin(ea: ExcalidrawAutomate, bounds: Bounds): LogoPoint {
  const center = getViewportCenter(ea);
  return {
    x: center.x - (bounds.minX + bounds.maxX) / 2,
    y: center.y + (bounds.minY + bounds.maxY) / 2,
  };
}

function sleep(win: Window, milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = win.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      win.clearTimeout(timer);
      reject(new DOMException("Logo drawing cancelled", "AbortError"));
    }, { once: true });
  });
}

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("Logo drawing cancelled", "AbortError");
}

function stageTurtle(ea: ExcalidrawAutomate, point: LogoPoint): string {
  ea.style.strokeColor = TURTLE_COLOR;
  ea.style.backgroundColor = TURTLE_FILL;
  ea.style.fillStyle = "solid";
  ea.style.strokeWidth = 2;
  ea.style.roughness = 0;
  ea.style.opacity = 100;
  return ea.addLine([
    [point.x, point.y - 12],
    [point.x - 8, point.y + 8],
    [point.x + 8, point.y + 8],
    [point.x, point.y - 12],
  ]);
}

async function createTurtle(context: RenderContext): Promise<void> {
  const point = toScene({ x: 0, y: 0 }, context.origin);
  context.ea.clear();
  const id = stageTurtle(context.ea, point);
  await context.ea.addElementsToView(false, false, true, false, "NEVER");
  const live = context.ea.getViewElements().find((element) => element.id === id);
  if (!live) return;
  context.turtleId = id;
  context.turtleAnchor = point;
  context.turtleElementOrigin = { x: live.x, y: live.y };
}

function updateStagedTurtle(context: RenderContext, point: LogoPoint, heading: number, visible = true): void {
  if (!context.turtleId || !context.turtleAnchor || !context.turtleElementOrigin) return;
  const live = context.ea.getViewElements().find((element) => element.id === context.turtleId);
  if (!live) return;
  context.ea.copyViewElementsToEAforEditing([live]);
  const turtle = context.ea.getElement(context.turtleId);
  if (!turtle) return;
  const scenePoint = toScene(point, context.origin);
  turtle.x = context.turtleElementOrigin.x + scenePoint.x - context.turtleAnchor.x;
  turtle.y = context.turtleElementOrigin.y + scenePoint.y - context.turtleAnchor.y;
  turtle.angle = (heading * Math.PI) / 180;
  turtle.opacity = visible ? 100 : 0;
}

function stageLineSegment(context: RenderContext, from: LogoPoint, to: LogoPoint, operation: LogoMoveOperation): string {
  const start = toScene(from, context.origin);
  const end = toScene(to, context.origin);
  context.ea.style.strokeColor = normalizeColor(operation.style.color);
  context.ea.style.backgroundColor = "transparent";
  context.ea.style.strokeWidth = operation.style.width;
  context.ea.style.fillStyle = "solid";
  context.ea.style.roughness = 0;
  context.ea.style.opacity = 100;
  return context.ea.addLine([[start.x, start.y], [end.x, end.y]]);
}

function lerpPoint(from: LogoPoint, to: LogoPoint, progress: number): LogoPoint {
  return { x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
}

async function commitAnimationFrame(context: RenderContext): Promise<void> {
  await context.ea.addElementsToView(false, false, true, false, "NEVER");
  await sleep(context.ea.targetView?.ownerWindow ?? window, context.delayMs, context.signal);
}

async function renderMove(operation: LogoMoveOperation, context: RenderContext, visible: boolean): Promise<void> {
  const distance = Math.hypot(operation.to.x - operation.from.x, operation.to.y - operation.from.y);
  const frames = context.delayMs === 0 ? 1 : Math.min(12, Math.max(1, Math.ceil(distance / 22)));
  let previous = operation.from;
  for (let index = 1; index <= frames; index += 1) {
    assertNotAborted(context.signal);
    const current = lerpPoint(operation.from, operation.to, index / frames);
    context.ea.clear();
    updateStagedTurtle(context, current, operation.heading, visible);
    if (operation.draw) context.generatedIds.push(stageLineSegment(context, previous, current, operation));
    await commitAnimationFrame(context);
    previous = current;
  }
}

async function renderTurn(operation: Extract<LogoOperation, { type: "turn" }>, context: RenderContext): Promise<void> {
  const frames = context.delayMs === 0 ? 1 : 4;
  let delta = operation.toHeading - operation.fromHeading;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  for (let index = 1; index <= frames; index += 1) {
    assertNotAborted(context.signal);
    context.ea.clear();
    updateStagedTurtle(context, operation.at, operation.fromHeading + delta * (index / frames), operation.visible);
    await commitAnimationFrame(context);
  }
}

async function renderVisibility(operation: Extract<LogoOperation, { type: "visibility" }>, context: RenderContext): Promise<void> {
  context.ea.clear();
  updateStagedTurtle(context, operation.at, operation.heading, operation.visible);
  await commitAnimationFrame(context);
}

async function renderFill(operation: Extract<LogoOperation, { type: "fill" }>, context: RenderContext): Promise<void> {
  if (operation.points.length < 3) return;
  context.ea.clear();
  const points = [...operation.points, operation.points[0] as LogoPoint].map((point) => toScene(point, context.origin));
  context.ea.style.strokeColor = normalizeColor(operation.style.color);
  context.ea.style.backgroundColor = normalizeColor(operation.style.fillColor);
  context.ea.style.strokeWidth = operation.style.width;
  context.ea.style.fillStyle = "solid";
  context.ea.style.roughness = 0;
  context.ea.style.opacity = 100;
  const id = context.ea.addLine(points.map((point) => [point.x, point.y]));
  context.generatedIds.push(id);
  await commitAnimationFrame(context);
}

async function renderLabel(operation: Extract<LogoOperation, { type: "label" }>, context: RenderContext): Promise<void> {
  context.ea.clear();
  const point = toScene(operation.at, context.origin);
  context.ea.style.strokeColor = normalizeColor(operation.color);
  context.ea.style.fontSize = operation.fontSize;
  context.ea.style.fontFamily = 1;
  context.ea.style.textAlign = "left";
  context.ea.style.opacity = 100;
  const id = context.ea.addText(point.x, point.y, operation.text);
  context.generatedIds.push(id);
  await commitAnimationFrame(context);
}

async function renderOperations(result: LogoProgramResult, context: RenderContext): Promise<void> {
  let visible = true;
  for (const operation of result.operations) {
    assertNotAborted(context.signal);
    if (operation.type === "move") await renderMove(operation, context, visible);
    else if (operation.type === "turn") await renderTurn(operation, context);
    else if (operation.type === "visibility") {
      visible = operation.visible;
      await renderVisibility(operation, context);
    } else if (operation.type === "fill") await renderFill(operation, context);
    else if (operation.type === "label") await renderLabel(operation, context);
    else if (operation.type === "wait") await sleep(context.ea.targetView?.ownerWindow ?? window, operation.milliseconds, context.signal);
  }
}

function sceneFrameBounds(bounds: Bounds, origin: LogoPoint): { x: number; y: number; width: number; height: number } {
  const left = origin.x + bounds.minX - FRAME_PADDING;
  const right = origin.x + bounds.maxX + FRAME_PADDING;
  const top = origin.y - bounds.maxY - FRAME_PADDING - TITLE_HEIGHT;
  const bottom = origin.y - bounds.minY + FRAME_PADDING;
  return { x: left, y: top, width: Math.max(180, right - left), height: Math.max(120, bottom - top) };
}

async function finalizeDrawing(context: RenderContext, bounds: Bounds, name: string, source: string): Promise<LogoRunSummary> {
  context.ea.clear();
  const drawingIds = [...context.generatedIds];
  const viewElements = context.ea.getViewElements();
  const drawingElements = viewElements.filter((element) => drawingIds.includes(element.id) && !element.isDeleted);
  const turtle = context.turtleId
    ? viewElements.find((element) => element.id === context.turtleId)
    : undefined;
  const elementsToEdit = turtle ? [...drawingElements, turtle] : drawingElements;
  if (elementsToEdit.length > 0) context.ea.copyViewElementsToEAforEditing(elementsToEdit);
  if (context.turtleId) {
    const staged = context.ea.getElement(context.turtleId);
    if (staged) staged.isDeleted = true;
  }
  const frameBounds = sceneFrameBounds(bounds, context.origin);
  context.ea.style.strokeColor = "#868e96";
  context.ea.style.backgroundColor = "transparent";
  context.ea.style.strokeWidth = 1;
  context.ea.style.roughness = 0;
  context.ea.style.opacity = 100;
  const frameId = context.ea.addRect(frameBounds.x, frameBounds.y, frameBounds.width, frameBounds.height);
  const metadata: LogoStoredScript = { version: 1, name, source, createdAt: new Date().toISOString() };
  context.ea.addAppendUpdateCustomData(frameId, { excalidrawLogoTurtle: metadata });
  context.ea.style.strokeColor = "#868e96";
  context.ea.style.fontSize = 20;
  context.ea.style.fontFamily = 1;
  context.ea.style.textAlign = "center";
  context.ea.style.opacity = 100;
  const titleId = context.ea.addText(frameBounds.x + 12, frameBounds.y + 10, name, {
    width: frameBounds.width - 24,
    textAlign: "center",
  });
  context.generatedIds.push(frameId, titleId);

  // Build nested groups: drawing -> frame + title -> complete Logo result.
  if (drawingIds.length > 1) context.ea.addToGroup(drawingIds);
  context.ea.addToGroup([frameId, titleId]);
  context.ea.addToGroup([...drawingIds, frameId, titleId]);

  await context.ea.addElementsToView(false, true, true, false, "IMMEDIATELY");
  const frame = context.ea.getViewElements().find((element) => element.id === frameId);
  if (frame) context.ea.selectElementsInView([frame]);
  return { frameId, elementIds: context.generatedIds, bounds: frameBounds };
}


async function rollbackDrawing(context: RenderContext): Promise<void> {
  const ids = new Set(context.generatedIds);
  if (context.turtleId) ids.add(context.turtleId);
  const live = context.ea.getViewElements().filter((element) => ids.has(element.id) && !element.isDeleted);
  if (live.length === 0) return;
  context.ea.clear();
  context.ea.copyViewElementsToEAforEditing(live);
  for (const element of live) {
    const staged = context.ea.getElement(element.id);
    if (staged) staged.isDeleted = true;
  }
  await context.ea.addElementsToView(false, true, true, false, "IMMEDIATELY");
}

/** Animates a Logo program on the active canvas and wraps the result in a titled metadata rectangle. */
export async function renderLogoProgram(
  ea: ExcalidrawAutomate,
  result: LogoProgramResult,
  name: string,
  source: string,
  animationDelayMs: number,
  signal: AbortSignal,
): Promise<LogoRunSummary> {
  if (!ea.targetView || !ea.getExcalidrawAPI()) throw new Error("Open an Excalidraw drawing before running Logo Turtle.");
  const bounds = getProgramBounds(result.operations);
  const context: RenderContext = {
    ea,
    origin: getOrigin(ea, bounds),
    turtleId: null,
    turtleAnchor: null,
    turtleElementOrigin: null,
    generatedIds: [],
    delayMs: Math.max(0, animationDelayMs),
    signal,
  };
  try {
    await createTurtle(context);
    await renderOperations(result, context);
    return await finalizeDrawing(context, bounds, name, source);
  } catch (error) {
    try {
      await rollbackDrawing(context);
    } catch (cleanupError) {
      console.warn("Logo Turtle could not fully roll back the interrupted drawing", cleanupError);
    }
    throw error;
  }
}
