/**
 * @file context.ts
 * @overview Compact scene, note, and vault context helpers used by the chat agent.
 */

import type { TFile } from "obsidian";
import type { CanvasContextSummary } from "./types";

const MAX_TEXT_SNIPPET = 220;
const CLUSTER_GAP = 140;

interface SceneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface SpatialCluster extends SceneRect {
  count: number;
  types: Map<string, number>;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function compactText(value: string, max = MAX_TEXT_SNIPPET): string {
  const single = value.replace(/\s+/g, " ").trim();
  return single.length > max ? `${single.slice(0, max - 1)}…` : single;
}

function rectForElement(element: ExcalidrawElement): SceneRect {
  return { x: element.x, y: element.y, width: element.width, height: element.height };
}

function normalizeRect(value: SceneRect): SceneRect {
  const x1 = Math.min(value.x, value.x + value.width);
  const x2 = Math.max(value.x, value.x + value.width);
  const y1 = Math.min(value.y, value.y + value.height);
  const y2 = Math.max(value.y, value.y + value.height);
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function intersects(aValue: SceneRect, bValue: SceneRect, padding = 0): boolean {
  const a = normalizeRect(aValue);
  const b = normalizeRect(bValue);
  return a.x - padding <= b.x + b.width
    && a.x + a.width + padding >= b.x
    && a.y - padding <= b.y + b.height
    && a.y + a.height + padding >= b.y;
}

function unionRect(aValue: SceneRect, bValue: SceneRect): SceneRect {
  const a = normalizeRect(aValue);
  const b = normalizeRect(bValue);
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x, y, width: right - x, height: bottom - y };
}

function rectText(value: SceneRect): string {
  return `${round(value.x)},${round(value.y)},${round(value.width)}x${round(value.height)}`;
}

function visibleSceneRect(ea: ExcalidrawAutomate): SceneRect | null {
  if (!ea.targetView) return null;
  try {
    const appState = ea.getExcalidrawAPI().getAppState();
    const zoom = Math.max(0.01, appState.zoom?.value ?? 1);
    return {
      x: -appState.scrollX,
      y: -appState.scrollY,
      width: appState.width / zoom,
      height: appState.height / zoom,
    };
  } catch {
    return null;
  }
}

function typeMapFor(element: ExcalidrawElement): Map<string, number> {
  return new Map([[element.type, 1]]);
}

function mergeTypeMaps(target: Map<string, number>, source: Map<string, number>): void {
  for (const [type, count] of source) target.set(type, (target.get(type) ?? 0) + count);
}

/** Builds coarse occupied regions so a large canvas can be navigated without serializing every element. */
export function spatialClusters(elements: readonly ExcalidrawElement[], maxClusters = 8): Record<string, unknown>[] {
  const clusters: SpatialCluster[] = [];
  const ordered = [...elements]
    .filter((element) => !element.isDeleted && element.type !== "frame")
    .sort((a, b) => a.x - b.x || a.y - b.y);
  for (const element of ordered) {
    const rect = rectForElement(element);
    const matching = clusters.filter((cluster) => intersects(cluster, rect, CLUSTER_GAP));
    if (matching.length === 0) {
      clusters.push({ ...rect, count: 1, types: typeMapFor(element) });
      continue;
    }
    const primary = matching[0];
    if (!primary) continue;
    Object.assign(primary, unionRect(primary, rect));
    primary.count += 1;
    primary.types.set(element.type, (primary.types.get(element.type) ?? 0) + 1);
    for (const extra of matching.slice(1)) {
      Object.assign(primary, unionRect(primary, extra));
      primary.count += extra.count;
      mergeTypeMaps(primary.types, extra.types);
      clusters.splice(clusters.indexOf(extra), 1);
    }
  }
  return clusters
    .sort((a, b) => b.count - a.count || a.x - b.x)
    .slice(0, Math.max(1, maxClusters))
    .map((cluster, index) => ({
      id: `region-${index + 1}`,
      bounds: rectText(cluster),
      elements: cluster.count,
      types: [...cluster.types.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => `${type}:${count}`).join(","),
    }));
}

function elementText(element: ExcalidrawElement): string {
  if (element.type === "text") return compactText(element.text);
  if (element.type === "frame") return compactText(element.name ?? "");
  return "";
}

/** Returns only scene properties useful to an LLM; point arrays are opt-in because they are expensive. */
export function compactElement(element: ExcalidrawElement, includePoints = false): Record<string, unknown> {
  const record = element as unknown as Record<string, unknown>;
  const result: Record<string, unknown> = {
    id: element.id,
    type: element.type,
    x: round(element.x),
    y: round(element.y),
    w: round(element.width),
    h: round(element.height),
  };
  const text = elementText(element);
  if (text) result.text = text;
  if (element.type === "frame") result.frameRole = record.frameRole === "marker" ? "marker" : "normal";
  if (element.strokeColor !== "#1b1b1f") result.stroke = element.strokeColor;
  if (element.backgroundColor !== "transparent") result.fill = element.backgroundColor;
  if (element.frameId) result.frameId = element.frameId;
  if (typeof record.containerId === "string") result.containerId = record.containerId;
  if (element.groupIds.length > 0) result.groups = element.groupIds.slice(-2);
  if (includePoints && (element.type === "arrow" || element.type === "line" || element.type === "freedraw")) {
    result.points = element.points.slice(0, 24).map((point) => [round(point[0]), round(point[1])]);
    if (element.points.length > 24) result.pointCount = element.points.length;
  }
  if (element.type === "arrow") {
    result.startBinding = element.startBinding?.elementId ?? null;
    result.endBinding = element.endBinding?.elementId ?? null;
  }
  return result;
}

function countTypes(elements: readonly ExcalidrawElement[]): string {
  const counts = new Map<string, number>();
  for (const element of elements) counts.set(element.type, (counts.get(element.type) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([type, count]) => `${type}:${count}`).join(", ");
}

function targetFilePath(ea: ExcalidrawAutomate): string {
  const view = ea.targetView as ({ file?: TFile | null }) | null;
  return view?.file?.path ?? "none";
}

/** Builds the small context header sent with each user turn. */
export function summarizeCurrentContext(ea: ExcalidrawAutomate): CanvasContextSummary {
  const selected = ea.targetView ? ea.getViewSelectedElements(false) : [];
  const elements = ea.targetView ? ea.getViewElements().filter((element) => !element.isDeleted) : [];
  const selectedIds = selected.map((element) => element.id);
  const app = ea.plugin.app;
  const activeFile = app.workspace.getActiveFile();
  const sceneBounds = elements.length > 0 ? ea.getBoundingBox(elements) : null;
  const viewport = visibleSceneRect(ea);
  const selectedCompact = selected.slice(0, 12).map((element) => compactElement(element));
  const clusters = elements.length > 12 ? spatialClusters(elements, 6) : [];
  const lines = [
    `boundCanvas=${targetFilePath(ea)}`,
    `activeFile=${activeFile?.path ?? "none"}`,
    `scene=${elements.length} elements${elements.length > 0 ? ` (${countTypes(elements)})` : ""}`,
    sceneBounds ? `sceneBounds=${round(sceneBounds.topX)},${round(sceneBounds.topY)},${round(sceneBounds.width)}x${round(sceneBounds.height)}` : "sceneBounds=empty",
    viewport ? `viewportBounds=${rectText(viewport)}` : "viewportBounds=unknown",
    clusters.length > 0 ? `sceneRegions=${JSON.stringify(clusters)}` : "",
    `selection=${selectedIds.length}${selectedIds.length > 0 ? ` ${JSON.stringify(selectedCompact)}` : ""}`,
  ].filter(Boolean);
  return { text: lines.join("\n"), selectedIds };
}

function parseQueryFilters(query: string): { type?: string; id?: string; frameRole?: string; free: string[] } {
  const free: string[] = [];
  const result: { type?: string; id?: string; frameRole?: string; free: string[] } = { free };
  for (const token of query.trim().split(/\s+/).filter(Boolean)) {
    const match = token.match(/^(type|id|framerole):(.+)$/i);
    if (!match) free.push(token.toLowerCase());
    else if (match[2]) {
      if (match[1]?.toLowerCase() === "type") result.type = match[2].toLowerCase();
      else if (match[1]?.toLowerCase() === "id") result.id = match[2];
      else result.frameRole = match[2].toLowerCase();
    }
  }
  return result;
}

/** Returns a compact scene slice for explicit agent inspection with real structured type filters. */
export function inspectScene(
  ea: ExcalidrawAutomate,
  scope: string,
  maxElements: number,
  query = "",
  types: string[] = [],
  includePoints = false,
  area?: SceneRect,
): string {
  if (!ea.targetView) return "No Excalidraw canvas is currently bound.";
  const base = scope === "selection"
    ? ea.getViewSelectedElements(false)
    : ea.getViewElements().filter((element) => !element.isDeleted);
  const typeSet = new Set(types.map((type) => type.toLowerCase()));
  const filters = parseQueryFilters(query);
  const source = base.filter((element) => {
    if (area && !intersects(rectForElement(element), area)) return false;
    if (typeSet.size > 0 && !typeSet.has(element.type.toLowerCase())) return false;
    if (filters.type && element.type.toLowerCase() !== filters.type) return false;
    if (filters.id && element.id !== filters.id) return false;
    const compact = compactElement(element, includePoints);
    if (filters.frameRole && String(compact.frameRole ?? "").toLowerCase() !== filters.frameRole) return false;
    if (filters.free.length === 0) return true;
    const haystack = JSON.stringify(compact).toLowerCase();
    return filters.free.every((term) => haystack.includes(term));
  });
  const capped = source.slice(0, Math.max(1, Math.min(200, maxElements)));
  return JSON.stringify({
    scope,
    types: typeSet.size > 0 ? [...typeSet] : undefined,
    query: query.trim() || undefined,
    area: area ? rectText(area) : undefined,
    total: source.length,
    truncated: capped.length < source.length,
    elements: capped.map((element) => compactElement(element, includePoints)),
  });
}

function layoutElement(element: ExcalidrawElement): Record<string, unknown> {
  const record = element as unknown as Record<string, unknown>;
  const result: Record<string, unknown> = {
    id: element.id,
    type: element.type,
    x: round(element.x),
    y: round(element.y),
    w: round(element.width),
    h: round(element.height),
  };
  const text = elementText(element);
  if (text) result.text = compactText(text, 100);
  if (element.frameId) result.frameId = element.frameId;
  if (typeof record.containerId === "string") result.containerId = record.containerId;
  if (element.groupIds.length > 0) result.groups = element.groupIds.slice(-2);
  if (element.type === "frame") result.frameRole = record.frameRole === "marker" ? "marker" : "normal";
  if (element.strokeColor !== "#1b1b1f") result.stroke = element.strokeColor;
  if (element.backgroundColor !== "transparent") result.fill = element.backgroundColor;
  if (element.type === "arrow") {
    result.startBinding = element.startBinding?.elementId ?? null;
    result.endBinding = element.endBinding?.elementId ?? null;
  }
  return result;
}

function overlapRatio(aValue: SceneRect, bValue: SceneRect): number {
  const a = normalizeRect(aValue);
  const b = normalizeRect(bValue);
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = width * height;
  const smallest = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
  return intersection / smallest;
}

function containsRect(outerValue: SceneRect, innerValue: SceneRect, inset = 0): boolean {
  const outer = normalizeRect(outerValue);
  const inner = normalizeRect(innerValue);
  return inner.x >= outer.x + inset
    && inner.y >= outer.y + inset
    && inner.x + inner.width <= outer.x + outer.width - inset
    && inner.y + inner.height <= outer.y + outer.height - inset;
}

interface LayoutCollision {
  a: string;
  b: string;
  ratio: number;
  kind: "text-text" | "shape-shape" | "text-shape";
  severity: "medium" | "high";
}

interface LayoutContainment {
  container: string;
  child: string;
}

function layoutRelationships(elements: readonly ExcalidrawElement[]): {
  collisions: LayoutCollision[];
  containments: LayoutContainment[];
} {
  const candidates = elements.filter((element) => !["line", "arrow", "freedraw", "frame"].includes(element.type));
  const collisions: LayoutCollision[] = [];
  const containments: LayoutContainment[] = [];
  for (let left = 0; left < candidates.length; left += 1) {
    const a = candidates[left];
    if (!a) continue;
    const aRecord = a as unknown as Record<string, unknown>;
    for (let right = left + 1; right < candidates.length; right += 1) {
      const b = candidates[right];
      if (!b) continue;
      const bRecord = b as unknown as Record<string, unknown>;
      if (aRecord.containerId === b.id || bRecord.containerId === a.id) continue;

      const aIsText = a.type === "text";
      const bIsText = b.type === "text";
      if (aIsText !== bIsText) {
        const text = aIsText ? a : b;
        const shape = aIsText ? b : a;
        if (containsRect(rectForElement(shape), rectForElement(text), 0)) {
          containments.push({ container: shape.id, child: text.id });
          continue;
        }
      } else if (!aIsText && !bIsText) {
        const aArea = Math.max(1, Math.abs(a.width * a.height));
        const bArea = Math.max(1, Math.abs(b.width * b.height));
        if (aArea >= bArea && containsRect(rectForElement(a), rectForElement(b), 0) && bArea / aArea <= 0.25) {
          containments.push({ container: a.id, child: b.id });
          continue;
        }
        if (bArea > aArea && containsRect(rectForElement(b), rectForElement(a), 0) && aArea / bArea <= 0.25) {
          containments.push({ container: b.id, child: a.id });
          continue;
        }
      }

      const ratio = overlapRatio(rectForElement(a), rectForElement(b));
      const kind: LayoutCollision["kind"] = aIsText && bIsText
        ? "text-text"
        : !aIsText && !bIsText
          ? "shape-shape"
          : "text-shape";
      const threshold = kind === "text-text" ? 0.04 : kind === "shape-shape" ? 0.08 : 0.12;
      if (ratio < threshold) continue;
      collisions.push({
        a: a.id,
        b: b.id,
        ratio: round(ratio),
        kind,
        severity: ratio >= 0.3 ? "high" : "medium",
      });
      if (collisions.length >= 24) return { collisions, containments };
    }
  }
  return { collisions, containments: containments.slice(0, 30) };
}

function textAntiPatterns(elements: readonly ExcalidrawElement[]): Record<string, unknown>[] {
  const issues: Record<string, unknown>[] = [];
  for (const element of elements) {
    if (element.type !== "text") continue;
    const text = element.text;
    if (/_{3,}/.test(text)) issues.push({ id: element.id, issue: "underscore-placeholder", suggestion: "use a real line or box element for the field" });
    if (/\[\s*\]/.test(text) || /☐/.test(text)) issues.push({ id: element.id, issue: "text-checkbox", suggestion: "use a small rectangle checkbox shape plus separate label text" });
    if (/ {3,}/.test(text)) issues.push({ id: element.id, issue: "space-alignment", suggestion: "split aligned fields into separate elements and position them geometrically" });
    if (issues.length >= 20) break;
  }
  return issues;
}

function visualHierarchy(elements: readonly ExcalidrawElement[]): Record<string, unknown> {
  const panels = elements.filter((element) => ["rectangle", "ellipse", "diamond", "sticky"].includes(element.type));
  const fills = new Set(panels.map((element) => element.backgroundColor).filter((color) => color && color !== "transparent"));
  const strokes = new Set(panels.map((element) => element.strokeColor).filter(Boolean));
  return {
    panelCount: panels.length,
    distinctPanelFills: fills.size,
    distinctPanelStrokes: strokes.size,
    lowColorHierarchy: panels.length >= 3 && fills.size <= 1,
  };
}

/** Returns a spatially focused scene summary, including viewport, overlap warnings, and placement anchors. */
export function inspectLayout(
  ea: ExcalidrawAutomate,
  scope: string,
  ids: string[],
  maxElements: number,
  area?: SceneRect,
): string {
  if (!ea.targetView) return "No Excalidraw canvas is currently bound.";
  const scene = ea.getViewElements().filter((element) => !element.isDeleted);
  const viewport = visibleSceneRect(ea);
  const idSet = new Set(ids);
  let source: ExcalidrawElement[];
  if (scope === "selection") source = ea.getViewSelectedElements(false).filter((element) => !element.isDeleted);
  else if (scope === "ids") source = scene.filter((element) => idSet.has(element.id));
  else if (scope === "viewport" && viewport) source = scene.filter((element) => intersects(rectForElement(element), viewport));
  else if (scope === "area" && area) source = scene.filter((element) => intersects(rectForElement(element), area));
  else source = scene;

  const cap = Math.max(1, Math.min(100, maxElements));
  const shown = source.slice(0, cap);
  const bounds = source.length > 0 ? ea.getBoundingBox(source) : null;
  const sceneBounds = scene.length > 0 ? ea.getBoundingBox(scene) : null;
  const margin = 80;
  const anchors = sceneBounds ? {
    right: { x: round(sceneBounds.topX + sceneBounds.width + margin), y: round(sceneBounds.topY) },
    below: { x: round(sceneBounds.topX), y: round(sceneBounds.topY + sceneBounds.height + margin) },
    left: { x: round(sceneBounds.topX - margin), y: round(sceneBounds.topY) },
    above: { x: round(sceneBounds.topX), y: round(sceneBounds.topY - margin) },
  } : { right: { x: 0, y: 0 }, below: { x: 0, y: 0 }, left: { x: 0, y: 0 }, above: { x: 0, y: 0 } };
  const relationships = layoutRelationships(shown);
  return JSON.stringify({
    scope,
    area: area ? rectText(area) : undefined,
    viewport: viewport ? rectText(viewport) : undefined,
    sceneBounds: sceneBounds ? `${round(sceneBounds.topX)},${round(sceneBounds.topY)},${round(sceneBounds.width)}x${round(sceneBounds.height)}` : "empty",
    targetBounds: bounds ? `${round(bounds.topX)},${round(bounds.topY)},${round(bounds.width)}x${round(bounds.height)}` : "empty",
    total: source.length,
    truncated: shown.length < source.length,
    regions: spatialClusters(scene, 8),
    placementAnchors: anchors,
    qualityGate: relationships.collisions.length === 0 ? "pass" : "fail",
    collisions: relationships.collisions,
    potentialOverlaps: relationships.collisions,
    containments: relationships.containments,
    textAntiPatterns: textAntiPatterns(shown),
    visualHierarchy: visualHierarchy(shown),
    elements: shown.map(layoutElement),
  });
}

/** Looks up exact scene IDs; point geometry is included because the request is already targeted. */
export function inspectElements(ea: ExcalidrawAutomate, ids: string[]): string {
  if (!ea.targetView) return "No Excalidraw canvas is currently bound.";
  const wanted = new Set(ids.slice(0, 80));
  const elements = ea.getViewElements().filter((element) => wanted.has(element.id));
  return JSON.stringify(elements.map((element) => compactElement(element, true)));
}

/** Reads the active markdown note, bounded for context efficiency. */
export async function readActiveNote(ea: ExcalidrawAutomate, maxChars: number): Promise<string> {
  const app = ea.plugin.app;
  const file = app.workspace.getActiveFile();
  if (!file || file.extension !== "md") return "No active Markdown file.";
  const text = await app.vault.cachedRead(file);
  const limit = Math.max(500, Math.min(30000, maxChars));
  return `FILE ${file.path}\n${text.slice(0, limit)}${text.length > limit ? "\n…[truncated]" : ""}`;
}

/** Reads one vault text file by path with a strict size limit. */
export async function readVaultFile(ea: ExcalidrawAutomate, path: string, maxChars: number): Promise<string> {
  const file = ea.plugin.app.vault.getAbstractFileByPath(path);
  if (!file || !(file instanceof ea.obsidian.TFile)) return `File not found: ${path}`;
  const text = await ea.plugin.app.vault.cachedRead(file);
  const limit = Math.max(500, Math.min(30000, maxChars));
  return `FILE ${file.path}\n${text.slice(0, limit)}${text.length > limit ? "\n…[truncated]" : ""}`;
}

/** Searches vault paths first, then a bounded set of Markdown contents. */
export async function searchVault(ea: ExcalidrawAutomate, query: string, maxResults: number): Promise<string> {
  const needle = query.trim().toLowerCase();
  if (!needle) return "Search query is empty.";
  const app = ea.plugin.app;
  const files = app.vault.getFiles();
  const limit = Math.max(1, Math.min(20, maxResults));
  const results: string[] = [];
  for (const file of files) {
    if (file.path.toLowerCase().includes(needle)) results.push(`PATH ${file.path}`);
    if (results.length >= limit) return results.join("\n");
  }
  let scanned = 0;
  for (const file of files) {
    if (file.extension !== "md" || scanned++ >= 160) continue;
    const text = await app.vault.cachedRead(file);
    const lower = text.toLowerCase();
    const index = lower.indexOf(needle);
    if (index < 0) continue;
    const start = Math.max(0, index - 100);
    const end = Math.min(text.length, index + needle.length + 180);
    results.push(`CONTENT ${file.path}: ${compactText(text.slice(start, end), 320)}`);
    if (results.length >= limit) break;
  }
  return results.length > 0 ? results.join("\n") : `No vault matches for: ${query}`;
}
