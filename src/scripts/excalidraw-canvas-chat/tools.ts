/**
 * @file tools.ts
 * @overview Executes the constrained Excalidraw, AI, navigation, and vault tools available to the chat agent.
 */

import {
  inspectElements,
  inspectLayout,
  inspectScene,
  readActiveNote,
  readVaultFile,
  searchVault,
} from "./context";
import { lookupEADocs, readEADoc } from "./eaKnowledge";
import { executeEAScript } from "./eaScriptExecutor";
import type { CanvasChatSettings, AgentToolCall, ToolResult } from "./types";

interface MutationOutcome {
  summary: string;
  changedIds: string[];
  visualReviewSuggested?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asPointArray(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is [number, number] => Array.isArray(item) && item.length >= 2 && typeof item[0] === "number" && typeof item[1] === "number")
    .map((item) => [item[0], item[1]]);
}

function asArea(value: unknown): { x: number; y: number; width: number; height: number } | undefined {
  if (!isRecord(value)) return undefined;
  if (![value.x, value.y, value.width, value.height].every((item) => typeof item === "number" && Number.isFinite(item))) return undefined;
  return {
    x: value.x as number,
    y: value.y as number,
    width: Math.max(1, value.width as number),
    height: Math.max(1, value.height as number),
  };
}

async function blobToDataURL(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index] ?? 0);
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

function requireCanvas(ea: ExcalidrawAutomate): void {
  if (!ea.targetView) throw new Error("No Excalidraw canvas is currently bound. Focus a drawing and try again.");
}

function resolvePlacement(ea: ExcalidrawAutomate, args: Record<string, unknown>): { x: number; y: number } {
  const selected = ea.targetView ? ea.getViewSelectedElements(false) : [];
  const all = ea.targetView ? ea.getViewElements().filter((element) => !element.isDeleted) : [];
  const bounds = selected.length > 0 ? ea.getBoundingBox(selected) : all.length > 0 ? ea.getBoundingBox(all) : null;
  const defaultX = bounds ? bounds.topX + bounds.width + 80 : 0;
  const defaultY = bounds ? bounds.topY : 0;
  return { x: asNumber(args.x, defaultX), y: asNumber(args.y, defaultY) };
}

function applyStyle(element: Record<string, unknown>, style: unknown): void {
  if (!isRecord(style)) return;
  const stringKeys = ["strokeColor", "backgroundColor", "fillStyle", "strokeStyle"] as const;
  const numberKeys = ["strokeWidth", "roughness", "opacity", "fontSize", "fontFamily", "angle"] as const;
  for (const key of stringKeys) if (typeof style[key] === "string") element[key] = style[key];
  for (const key of numberKeys) if (typeof style[key] === "number" && Number.isFinite(style[key])) element[key] = style[key];
}

function mutateElement(element: Record<string, unknown>, update: Record<string, unknown>): void {
  const numericKeys = ["x", "y", "width", "height", "angle", "strokeWidth", "roughness", "opacity", "fontSize"] as const;
  const stringKeys = ["strokeColor", "backgroundColor", "link"] as const;
  for (const key of numericKeys) if (typeof update[key] === "number" && Number.isFinite(update[key])) element[key] = update[key];
  for (const key of stringKeys) if (typeof update[key] === "string") element[key] = update[key];
  if (typeof update.text === "string" && element.type === "text") {
    element.text = update.text;
    element.originalText = update.text;
  }
}

function createOneElement(ea: ExcalidrawAutomate, spec: Record<string, unknown>): string {
  const type = asString(spec.type);
  const x = asNumber(spec.x);
  const y = asNumber(spec.y);
  const width = Math.max(10, asNumber(spec.width, 180));
  const height = Math.max(10, asNumber(spec.height, 100));
  let id = "";
  if (type === "rectangle") id = ea.addRect(x, y, width, height);
  else if (type === "ellipse") id = ea.addEllipse(x, y, width, height);
  else if (type === "diamond") id = ea.addDiamond(x, y, width, height);
  else if (type === "blob") id = ea.addBlob(x, y, width, height);
  else if (type === "sticky") id = ea.addStickyNote(x, y, asString(spec.text), { width, height });
  else if (type === "text") id = ea.addText(x, y, asString(spec.text), { width, textAlign: "left", textVerticalAlign: "top" });
  else if (type === "frame") id = ea.addFrame(x, y, width, height, asString(spec.name, asString(spec.text)));
  else if (type === "line" || type === "arrow") {
    const points = asPointArray(spec.points);
    const resolved = points.length >= 2 ? points : [[x, y], [x + width, y + height]] as [number, number][];
    id = type === "line" ? ea.addLine(resolved) : ea.addArrow(resolved);
  } else {
    throw new Error(`Unsupported element type: ${type}`);
  }
  const element = ea.getElement(id) as unknown as Record<string, unknown>;
  applyStyle(element, spec.style);
  return id;
}

async function createElements(ea: ExcalidrawAutomate, args: Record<string, unknown>): Promise<MutationOutcome> {
  requireCanvas(ea);
  const specs = Array.isArray(args.elements) ? args.elements.filter(isRecord).slice(0, 40) : [];
  if (specs.length === 0) throw new Error("No elements were provided.");
  ea.clear();
  const ids = specs.map((spec) => createOneElement(ea, spec));
  await ea.addElementsToView(false, true, true, true);
  ea.clear();
  return {
    summary: `Created ${ids.length} elements. ids=${ids.join(",")}`,
    changedIds: ids,
    visualReviewSuggested: ids.length >= 4,
  };
}

interface TemplatePalette {
  accent: string;
  accentDark: string;
  border: string;
  soft: string;
  softAlt: string;
  guide: string;
  text: string;
  muted: string;
}

const TEMPLATE_PALETTES: Record<string, TemplatePalette> = {
  blue: {
    accent: "#228be6", accentDark: "#1864ab", border: "#74c0fc", soft: "#e7f5ff", softAlt: "#f1f8ff",
    guide: "#a5d8ff", text: "#1f2937", muted: "#495057",
  },
  green: {
    accent: "#2f9e44", accentDark: "#2b8a3e", border: "#8ce99a", soft: "#ebfbee", softAlt: "#f4fcf5",
    guide: "#b2f2bb", text: "#1f2937", muted: "#495057",
  },
  purple: {
    accent: "#7950f2", accentDark: "#6741d9", border: "#b197fc", soft: "#f3f0ff", softAlt: "#f8f7ff",
    guide: "#d0bfff", text: "#1f2937", muted: "#495057",
  },
  orange: {
    accent: "#f76707", accentDark: "#d9480f", border: "#ffc078", soft: "#fff4e6", softAlt: "#fff9f2",
    guide: "#ffd8a8", text: "#1f2937", muted: "#495057",
  },
  mono: {
    accent: "#495057", accentDark: "#343a40", border: "#adb5bd", soft: "#f1f3f5", softAlt: "#f8f9fa",
    guide: "#ced4da", text: "#212529", muted: "#495057",
  },
};

function templatePalette(value: unknown): TemplatePalette {
  const key = asString(value, "blue").toLowerCase();
  return TEMPLATE_PALETTES[key] ?? TEMPLATE_PALETTES.blue!;
}

function styleWorkbenchElement(ea: ExcalidrawAutomate, id: string, style: Record<string, unknown>): void {
  const element = ea.getElement(id) as unknown as Record<string, unknown>;
  applyStyle(element, style);
}

function addTemplateText(
  ea: ExcalidrawAutomate,
  ids: string[],
  x: number,
  y: number,
  text: string,
  fontSize: number,
  color: string,
  maxWidth?: number,
): string {
  const wrapAt = typeof maxWidth === "number"
    ? Math.max(8, Math.floor(maxWidth / Math.max(7, fontSize * 0.58)))
    : undefined;
  const id = ea.addText(x, y, text, {
    textAlign: "left",
    textVerticalAlign: "top",
    ...(typeof wrapAt === "number" ? { wrapAt } : {}),
  });
  ids.push(id);
  styleWorkbenchElement(ea, id, { fontSize, strokeColor: color, roughness: 0.4 });
  return id;
}

function addTemplateLine(
  ea: ExcalidrawAutomate,
  ids: string[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  strokeWidth = 1.2,
): string {
  const id = ea.addLine([[x1, y1], [x2, y2]]);
  ids.push(id);
  styleWorkbenchElement(ea, id, { strokeColor: color, strokeWidth, roughness: 0.45 });
  return id;
}

function addTemplatePanel(
  ea: ExcalidrawAutomate,
  ids: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  palette: TemplatePalette,
  alt: boolean,
): string {
  const id = ea.addRect(x, y, width, height);
  ids.push(id);
  styleWorkbenchElement(ea, id, {
    backgroundColor: alt ? palette.softAlt : palette.soft,
    strokeColor: palette.border,
    fillStyle: "solid",
    strokeWidth: 1.4,
    roughness: 0.55,
  });
  return id;
}

function templatePlacement(ea: ExcalidrawAutomate, args: Record<string, unknown>, width: number): { x: number; y: number } {
  const requestedX = typeof args.x === "number" && Number.isFinite(args.x) ? args.x : null;
  const requestedY = typeof args.y === "number" && Number.isFinite(args.y) ? args.y : null;
  if (requestedX !== null && requestedY !== null) return { x: requestedX, y: requestedY };
  const scene = ea.getViewElements().filter((element) => !element.isDeleted);
  if (scene.length > 0) {
    const bounds = ea.getBoundingBox(scene);
    return { x: requestedX ?? bounds.topX + bounds.width + 80, y: requestedY ?? bounds.topY };
  }
  try {
    const state = ea.getExcalidrawAPI().getAppState();
    const zoom = Math.max(0.01, state.zoom?.value ?? 1);
    const viewportX = -state.scrollX;
    const viewportY = -state.scrollY;
    const viewportWidth = state.width / zoom;
    return {
      x: requestedX ?? viewportX + Math.max(24, (viewportWidth - width) / 2),
      y: requestedY ?? viewportY + 60,
    };
  } catch {
    return { x: requestedX ?? 0, y: requestedY ?? 0 };
  }
}

function templateSpan(value: unknown, max: number): number {
  const numeric = Math.round(asNumber(value, 1));
  return Math.max(1, Math.min(max, numeric));
}

async function createVisualTemplate(ea: ExcalidrawAutomate, args: Record<string, unknown>): Promise<MutationOutcome> {
  requireCanvas(ea);
  const title = asString(args.title).trim();
  if (!title) throw new Error("Visual template requires a title.");
  const sections = Array.isArray(args.sections) ? args.sections.filter(isRecord).slice(0, 12) : [];
  if (sections.length === 0) throw new Error("Visual template requires at least one section.");

  const width = Math.max(760, Math.min(1400, asNumber(args.width, 1040)));
  const palette = templatePalette(args.theme);
  const origin = templatePlacement(ea, args, width);
  const padding = 48;
  const columnGap = 28;
  const sectionGap = 28;
  const contentWidth = width - padding * 2;
  const sectionColumnWidth = (contentWidth - columnGap) / 2;
  const ids: string[] = [];

  ea.clear();
  const frameId = ea.addFrame(origin.x, origin.y, width, 200, title);
  ids.push(frameId);
  styleWorkbenchElement(ea, frameId, { strokeColor: palette.border, strokeWidth: 2, roughness: 0.45 });

  let cursorY = origin.y + 34;
  addTemplateText(ea, ids, origin.x + padding, cursorY, title, 32, palette.accentDark);
  cursorY += 46;
  const subtitle = asString(args.subtitle).trim();
  if (subtitle) {
    addTemplateText(ea, ids, origin.x + padding, cursorY, subtitle, 14, palette.muted);
    cursorY += 28;
  }
  addTemplateLine(ea, ids, origin.x + padding, cursorY, origin.x + width - padding, cursorY, palette.accent, 2.2);
  cursorY += 28;

  const fields = Array.isArray(args.fields) ? args.fields.filter(isRecord).slice(0, 12) : [];
  if (fields.length > 0) {
    const requestedColumns = Math.round(asNumber(args.fieldColumns, fields.length >= 3 ? 3 : 2));
    const columns = requestedColumns >= 3 ? 3 : 2;
    const gap = 28;
    const cellWidth = (contentWidth - gap * (columns - 1)) / columns;
    let column = 0;
    let rowY = cursorY;
    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
      const field = fields[fieldIndex]!;
      const implicitFullLastRow = typeof field.span !== "number" && fieldIndex === fields.length - 1 && column === 0 && fields.length > columns;
      const span = implicitFullLastRow ? columns : templateSpan(field.span, columns);
      if (column + span > columns) {
        rowY += 56;
        column = 0;
      }
      const fieldX = origin.x + padding + column * (cellWidth + gap);
      const fieldWidth = cellWidth * span + gap * (span - 1);
      const label = asString(field.label, "Field").trim();
      addTemplateText(ea, ids, fieldX, rowY, label, 14, palette.text);
      const labelWidth = Math.min(fieldWidth * 0.46, Math.max(54, label.length * 8.2));
      const lineY = rowY + 22;
      addTemplateLine(ea, ids, fieldX + labelWidth + 10, lineY, fieldX + fieldWidth, lineY, palette.guide, 1.4);
      column += span;
      if (column >= columns) {
        rowY += 56;
        column = 0;
      }
    }
    if (column > 0) rowY += 56;
    cursorY = rowY + 8;
  }

  let sectionColumn = 0;
  let rowHeight = 0;
  let rowY = cursorY;
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index]!;
    const span = templateSpan(section.span, 2);
    const kind = ["notes", "list", "checklist", "blank"].includes(asString(section.kind)) ? asString(section.kind) : "blank";
    const items = Array.isArray(section.items) ? section.items.filter((item): item is string => typeof item === "string").slice(0, 8) : [];
    const defaultHeight = kind === "notes" ? 220 : kind === "checklist" ? Math.max(150, 72 + items.length * 34) : kind === "list" ? Math.max(140, 68 + items.length * 30) : 150;
    const height = Math.max(120, Math.min(420, asNumber(section.height, defaultHeight)));

    if (span === 2 && sectionColumn !== 0) {
      rowY += rowHeight + sectionGap;
      sectionColumn = 0;
      rowHeight = 0;
    }
    const panelX = origin.x + padding + (sectionColumn === 1 ? sectionColumnWidth + columnGap : 0);
    const panelWidth = span === 2 ? contentWidth : sectionColumnWidth;
    addTemplatePanel(ea, ids, panelX, rowY, panelWidth, height, palette, index % 2 === 1);
    const titleText = asString(section.title, "Section").trim();
    addTemplateText(ea, ids, panelX + 18, rowY + 16, titleText, 17, palette.accentDark, panelWidth - 36);
    addTemplateLine(ea, ids, panelX + 18, rowY + 44, panelX + panelWidth - 18, rowY + 44, palette.guide, 1);

    if (kind === "notes") {
      for (let lineY = rowY + 78; lineY <= rowY + height - 22; lineY += 34) {
        addTemplateLine(ea, ids, panelX + 22, lineY, panelX + panelWidth - 22, lineY, palette.guide, 0.9);
      }
    } else if (kind === "checklist") {
      const rows = items.length > 0 ? items : ["Action item", "Action item", "Action item"];
      rows.forEach((item, itemIndex) => {
        const itemY = rowY + 62 + itemIndex * 34;
        const boxId = ea.addRect(panelX + 22, itemY, 14, 14);
        ids.push(boxId);
        styleWorkbenchElement(ea, boxId, { backgroundColor: "transparent", strokeColor: palette.accent, strokeWidth: 1.4, roughness: 0.4 });
        addTemplateText(ea, ids, panelX + 48, itemY - 3, item, 14, palette.text, panelWidth - 70);
      });
    } else if (kind === "list") {
      const rows = items.length > 0 ? items : ["Item", "Item", "Item"];
      rows.forEach((item, itemIndex) => {
        const itemY = rowY + 62 + itemIndex * 30;
        const bulletId = ea.addEllipse(panelX + 24, itemY + 5, 7, 7);
        ids.push(bulletId);
        styleWorkbenchElement(ea, bulletId, { backgroundColor: palette.accent, strokeColor: palette.accent, fillStyle: "solid", roughness: 0.35 });
        addTemplateText(ea, ids, panelX + 44, itemY, item, 14, palette.text, panelWidth - 66);
      });
    }

    rowHeight = Math.max(rowHeight, height);
    if (span === 2) {
      rowY += height + sectionGap;
      sectionColumn = 0;
      rowHeight = 0;
    } else if (sectionColumn === 0) {
      sectionColumn = 1;
    } else {
      rowY += rowHeight + sectionGap;
      sectionColumn = 0;
      rowHeight = 0;
    }
  }
  if (sectionColumn !== 0) rowY += rowHeight + sectionGap;
  cursorY = rowY;

  const footerFields = Array.isArray(args.footerFields) ? args.footerFields.filter(isRecord).slice(0, 6) : [];
  if (footerFields.length > 0) {
    const columns = 2;
    const gap = 32;
    const cellWidth = (contentWidth - gap) / 2;
    let column = 0;
    for (const field of footerFields) {
      const span = templateSpan(field.span, columns);
      if (column + span > columns) {
        cursorY += 48;
        column = 0;
      }
      const fieldX = origin.x + padding + column * (cellWidth + gap);
      const fieldWidth = cellWidth * span + gap * (span - 1);
      const label = asString(field.label, "Field").trim();
      addTemplateText(ea, ids, fieldX, cursorY, label, 14, palette.text);
      const labelWidth = Math.min(fieldWidth * 0.46, Math.max(54, label.length * 8.2));
      addTemplateLine(ea, ids, fieldX + labelWidth + 10, cursorY + 22, fieldX + fieldWidth, cursorY + 22, palette.guide, 1.4);
      column += span;
      if (column >= columns) {
        cursorY += 48;
        column = 0;
      }
    }
    if (column > 0) cursorY += 48;
  }

  const finalHeight = Math.max(360, cursorY - origin.y + padding - 6);
  const frame = ea.getElement(frameId) as unknown as Record<string, unknown>;
  frame.height = finalHeight;
  ea.addElementsToFrame(frameId, ids.filter((id) => id !== frameId));
  const committed = await ea.addElementsToView(false, true, true, true);
  ea.clear();
  if (!committed) throw new Error("Excalidraw rejected the visual template update.");
  return {
    summary: `Created visual template "${title}" with ${sections.length} section(s), ${fields.length} field(s), theme=${asString(args.theme, "blue")}. ids=${ids.join(",")}`,
    changedIds: ids,
    visualReviewSuggested: true,
  };
}

async function updateElements(ea: ExcalidrawAutomate, args: Record<string, unknown>): Promise<MutationOutcome> {
  requireCanvas(ea);
  const updates = Array.isArray(args.updates) ? args.updates.filter(isRecord).slice(0, 50) : [];
  const byId = new Map(updates.map((update) => [asString(update.id), update]));
  const source = ea.getViewElements().filter((element) => byId.has(element.id));
  if (source.length === 0) throw new Error("None of the requested element IDs exist.");
  ea.clear();
  ea.copyViewElementsToEAforEditing(source, true);
  for (const original of source) {
    const editable = ea.getElement(original.id) as unknown as Record<string, unknown>;
    const update = byId.get(original.id);
    if (update) mutateElement(editable, update);
    if (update && typeof update.text === "string" && original.type === "text") ea.refreshTextElementSize(original.id);
  }
  await ea.addElementsToView(false, true, true, true);
  ea.clear();
  const geometryEdits = updates.filter((update) => ["x", "y", "width", "height", "angle"].some((key) => typeof update[key] === "number")).length;
  return {
    summary: `Updated ${source.length} elements: ${source.map((element) => element.id).join(",")}`,
    changedIds: source.map((element) => element.id),
    visualReviewSuggested: geometryEdits >= 1 || updates.length >= 4,
  };
}

async function deleteElements(ea: ExcalidrawAutomate, ids: string[]): Promise<string> {
  requireCanvas(ea);
  const wanted = new Set(ids);
  const elements = ea.getViewElements().filter((element) => wanted.has(element.id));
  if (elements.length === 0) throw new Error("None of the requested element IDs exist.");
  ea.clear();
  ea.copyViewElementsToEAforEditing(elements, true);
  for (const element of elements) ea.getElement(element.id).isDeleted = true;
  await ea.addElementsToView(false, true, true, true);
  ea.clear();
  return `Deleted ${elements.length} elements.`;
}

function convertMutable(element: Record<string, unknown>, to: string): void {
  const from = asString(element.type);
  if (!(["line", "arrow", "freedraw"].includes(from)) || !(["line", "arrow", "freedraw"].includes(to))) {
    throw new Error(`Conversion ${from} -> ${to} is not supported.`);
  }
  if (from === to) return;
  element.type = to;
  if (to === "arrow") {
    element.startArrowhead = null;
    element.endArrowhead = "arrow";
    element.startBinding = null;
    element.endBinding = null;
    delete element.pressures;
    delete element.simulatePressure;
    element.lastCommittedPoint = null;
    element.elbowed = false;
  } else if (to === "line") {
    element.startBinding = null;
    element.endBinding = null;
    element.startArrowhead = null;
    element.endArrowhead = null;
    delete element.pressures;
    delete element.simulatePressure;
    element.lastCommittedPoint = null;
    element.elbowed = false;
  } else {
    const points = Array.isArray(element.points) ? element.points : [];
    element.pressures = points.map(() => 0.5);
    element.simulatePressure = true;
    element.lastCommittedPoint = null;
    delete element.startBinding;
    delete element.endBinding;
    delete element.startArrowhead;
    delete element.endArrowhead;
    delete element.elbowed;
  }
}

async function convertElements(ea: ExcalidrawAutomate, args: Record<string, unknown>): Promise<string> {
  requireCanvas(ea);
  const ids = asStringArray(args.ids).slice(0, 50);
  const to = asString(args.to);
  const wanted = new Set(ids);
  const source = ea.getViewElements().filter((element) => wanted.has(element.id));
  if (source.length === 0) throw new Error("No matching elements to convert.");
  ea.clear();
  ea.copyViewElementsToEAforEditing(source, true);
  for (const original of source) convertMutable(ea.getElement(original.id) as unknown as Record<string, unknown>, to);
  await ea.addElementsToView(false, true, true, true);
  ea.clear();
  return `Converted ${source.length} elements to ${to}.`;
}

async function groupElements(ea: ExcalidrawAutomate, ids: string[]): Promise<string> {
  requireCanvas(ea);
  const valid = ea.getViewElements().filter((element) => ids.includes(element.id)).map((element) => element.id);
  if (valid.length < 2) throw new Error("At least two valid element IDs are required to group.");
  ea.clear();
  ea.copyViewElementsToEAforEditing(ea.getViewElements().filter((element) => valid.includes(element.id)), true);
  const groupId = ea.addToGroup(valid);
  await ea.addElementsToView(false, true, true, true);
  ea.clear();
  return `Grouped ${valid.length} elements. groupId=${groupId}`;
}

async function connectElements(ea: ExcalidrawAutomate, args: Record<string, unknown>): Promise<string> {
  requireCanvas(ea);
  const from = asString(args.from);
  const to = asString(args.to);
  const ids = new Set([from, to]);
  const existing = ea.getViewElements().filter((element) => ids.has(element.id));
  if (existing.length !== 2) throw new Error("Both connector endpoints must exist.");
  ea.clear();
  const arrowId = ea.connectObjects(from, null, to, null, { endArrowHead: "arrow", numberOfPoints: 0 });
  const label = asString(args.label);
  const labelId = label ? ea.addLabelToLine(arrowId, label) : "";
  await ea.addElementsToView(false, true, true, true);
  ea.clear();
  return `Connected ${from} -> ${to}. arrowId=${arrowId}${labelId ? ` labelId=${labelId}` : ""}`;
}

async function addMermaid(ea: ExcalidrawAutomate, args: Record<string, unknown>): Promise<MutationOutcome> {
  requireCanvas(ea);
  const diagram = asString(args.diagram).replace(/^```(?:mermaid)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!diagram) throw new Error("Mermaid source is empty.");
  ea.clear();
  const result = await ea.addMermaid(diagram, true);
  if (typeof result === "string") throw new Error(result);
  const elements = ea.getElements();
  const placement = resolvePlacement(ea, args);
  if (elements.length > 0) {
    const bounds = ea.getBoundingBox(elements as unknown as ExcalidrawElement[]);
    for (const element of elements) {
      element.x += placement.x - bounds.topX;
      element.y += placement.y - bounds.topY;
    }
  }
  const ids = elements.map((element) => element.id);
  await ea.addElementsToView(false, true, true, true);
  ea.clear();
  return {
    summary: `Added Mermaid diagram with ${ids.length} elements. ids=${ids.join(",")}`,
    changedIds: ids,
    visualReviewSuggested: true,
  };
}

async function addLatex(ea: ExcalidrawAutomate, args: Record<string, unknown>): Promise<string> {
  requireCanvas(ea);
  const tex = asString(args.tex).trim();
  if (!tex) throw new Error("LaTeX source is empty.");
  const placement = resolvePlacement(ea, args);
  ea.clear();
  const id = await ea.addLaTex(placement.x, placement.y, tex, 1, 1, { throwOnError: true });
  await ea.addElementsToView(false, true, true, true);
  ea.clear();
  return `Added LaTeX formula. id=${id}`;
}

function getGeneratedImageSource(result: Awaited<ReturnType<ExcalidrawAutomate["generateAIImage"]>>): string {
  const image = result.firstImage;
  if (!image) return "";
  if (image.dataURL) return image.dataURL;
  if (image.url) return image.url;
  if (image.b64_json) return `data:${image.mimeType ?? "image/png"};base64,${image.b64_json}`;
  return "";
}


async function addSvg(ea: ExcalidrawAutomate, args: Record<string, unknown>): Promise<MutationOutcome> {
  requireCanvas(ea);
  const svg = asString(args.svg).replace(/^```(?:html|svg)?\s*/i, "").replace(/\s*```$/, "").trim();
  if (!svg) throw new Error("SVG source is empty.");
  ea.clear();
  if (!ea.importSVG(svg)) throw new Error("Excalidraw could not import the SVG.");
  const elements = ea.getElements();
  const placement = resolvePlacement(ea, args);
  if (elements.length > 0) {
    const bounds = ea.getBoundingBox(elements as unknown as ExcalidrawElement[]);
    for (const element of elements) {
      element.x += placement.x - bounds.topX;
      element.y += placement.y - bounds.topY;
    }
    ea.addToGroup(elements.map((element) => element.id));
  }
  const ids = elements.map((element) => element.id);
  await ea.addElementsToView(false, true, true, true);
  ea.clear();
  return {
    summary: `Imported SVG as ${ids.length} editable Excalidraw elements. ids=${ids.join(",")}`,
    changedIds: ids,
    visualReviewSuggested: ids.length >= 3,
  };
}

async function selectionBitmap(ea: ExcalidrawAutomate): Promise<string> {
  requireCanvas(ea);
  const selected = ea.getViewSelectedElements(false);
  if (selected.length === 0) throw new Error("Select one or more canvas elements first.");
  const blob = await ea.createViewPNG({ elementsOverride: selected, padding: 16, scale: 0.7, withBackground: true });
  return blobToDataURL(blob);
}

function resolveImageModel(ea: ExcalidrawAutomate, settings: CanvasChatSettings): string {
  const ai = ea.getAISettings();
  if (!ai) return "";
  if (settings.imageModelId !== "auto") return settings.imageModelId;
  const ready = Object.keys(ai.imageModels).filter((id) => ai.providerProfiles[ai.imageModels[id]?.providerId ?? ""]?.hasApiKey);
  return ready.includes(ai.defaultImageModel) ? ai.defaultImageModel : ready[0] ?? "";
}

async function generateImage(ea: ExcalidrawAutomate, settings: CanvasChatSettings, args: Record<string, unknown>): Promise<MutationOutcome> {
  requireCanvas(ea);
  const prompt = asString(args.prompt).trim();
  if (!prompt) throw new Error("Image prompt is empty.");
  const imageModelId = resolveImageModel(ea, settings);
  if (!imageModelId) throw new Error("No Excalidraw AI image model is configured.");
  const mode = asString(args.mode, "generate");
  const result = mode === "transform-selection"
    ? await ea.transformAIImage({ imageModelId, image: { dataURL: await selectionBitmap(ea) }, text: prompt })
    : await ea.generateAIImage({ imageModelId, text: prompt, imageGenerationProperties: { n: 1 } });
  const source = getGeneratedImageSource(result);
  if (!source) throw new Error("The image model did not return an image.");
  const placement = resolvePlacement(ea, args);
  ea.clear();
  const id = await ea.addImage(placement.x, placement.y, source);
  await ea.addElementsToView(false, true, true, true);
  ea.clear();
  return { summary: `Generated and inserted image. id=${id}`, changedIds: [id], visualReviewSuggested: true };
}

async function canvasBitmap(ea: ExcalidrawAutomate, args: Record<string, unknown>): Promise<ToolResult> {
  requireCanvas(ea);
  const scope = asString(args.scope, "selection");
  const selectedOnly = scope === "selection";
  if (selectedOnly && ea.getViewSelectedElements(false).length === 0) throw new Error("Nothing is selected for bitmap inspection.");
  const ids = scope === "ids" ? asStringArray(args.ids).slice(0, 100) : [];
  const idElements = ids.length > 0 ? ea.getViewElements().filter((element) => !element.isDeleted && ids.includes(element.id)) : [];
  if (scope === "ids" && idElements.length === 0) throw new Error("No matching elements for bitmap inspection.");
  const area = asArea(args.area);
  const exportArea = scope === "area" && area
    ? {
        x: area.x,
        y: area.y,
        width: area.width,
        height: area.height,
        margin: 12,
      }
    : undefined;
  if (scope === "area" && !exportArea) throw new Error("Area bitmap requires x, y, width, and height.");
  const blob = await ea.createViewPNG({
    selectedOnly,
    ...(scope === "ids" ? { elementsOverride: idElements } : {}),
    ...(exportArea ? { exportArea } : {}),
    padding: 20,
    scale: 0.55,
    withBackground: true,
  });
  return {
    tool: "canvas_bitmap",
    ok: true,
    summary: `Canvas bitmap captured (${scope}).`,
    imageDataURL: await blobToDataURL(blob),
    imageDetail: asString(args.detail) === "high" ? "high" : "low",
  };
}

/** Captures a post-mutation neighborhood so the model can visually critique a complex layout before claiming completion. */
export async function captureVisualReview(ea: ExcalidrawAutomate, ids: string[]): Promise<ToolResult> {
  requireCanvas(ea);
  const idSet = new Set(ids.slice(0, 100));
  const changed = ea.getViewElements().filter((element) => !element.isDeleted && idSet.has(element.id));
  if (changed.length === 0) return { tool: "canvas_bitmap", ok: false, summary: "Post-mutation visual review skipped because the changed elements were not found." };
  const bounds = ea.getBoundingBox(changed);
  const padding = Math.max(80, Math.min(280, Math.max(bounds.width, bounds.height) * 0.12));
  const area = {
    x: bounds.topX - padding,
    y: bounds.topY - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
    margin: 0,
  };
  const maxDimension = Math.max(area.width, area.height);
  const scale = Math.max(0.18, Math.min(0.65, 1200 / Math.max(1, maxDimension)));
  const blob = await ea.createViewPNG({ exportArea: area, padding: 0, scale, withBackground: true });
  const layout = inspectLayout(ea, "area", [], 80, area);
  let qualityIssueCount = 0;
  let textAntiPatternCount = 0;
  let lowColorHierarchy = false;
  try {
    const parsed = JSON.parse(layout) as {
      collisions?: unknown[];
      textAntiPatterns?: unknown[];
      visualHierarchy?: { lowColorHierarchy?: boolean };
    };
    qualityIssueCount = Array.isArray(parsed.collisions) ? parsed.collisions.length : 0;
    textAntiPatternCount = Array.isArray(parsed.textAntiPatterns) ? parsed.textAntiPatterns.length : 0;
    lowColorHierarchy = parsed.visualHierarchy?.lowColorHierarchy === true;
  } catch {
    // Keep the bitmap useful if inspectLayout stops returning JSON in a future plugin version.
  }
  const qualityGate = qualityIssueCount === 0 ? "PASS" : `FAIL (${qualityIssueCount} collision${qualityIssueCount === 1 ? "" : "s"})`;
  const designNotes = [
    textAntiPatternCount > 0 ? `${textAntiPatternCount} text-as-graphics anti-pattern(s) detected` : "",
    lowColorHierarchy ? "low color hierarchy detected" : "",
  ].filter(Boolean).join("; ");
  return {
    tool: "canvas_bitmap",
    ok: true,
    summary: `POST-MUTATION VISUAL REVIEW. QUALITY GATE: ${qualityGate}. Changed ids=${changed.map((element) => element.id).join(",")}
${layout}
${designNotes ? `DESIGN NOTES: ${designNotes}.
` : ""}Inspect the bitmap for overlap, clipping, excessive whitespace, weak hierarchy, poor reading order, text used as faux graphics, color hierarchy, and collisions with nearby canvas content. If QUALITY GATE is FAIL, fix the listed collisions and review again before finishing.`,
    imageDataURL: await blobToDataURL(blob),
    imageDetail: "high",
    qualityIssueCount,
  };
}

async function openFile(ea: ExcalidrawAutomate, path: string): Promise<string> {
  const file = ea.plugin.app.vault.getAbstractFileByPath(path);
  if (!file || !(file instanceof ea.obsidian.TFile)) throw new Error(`File not found: ${path}`);
  ea.openFileInNewOrAdjacentLeaf(file);
  return `Opened ${file.path}`;
}


async function frameElements(ea: ExcalidrawAutomate, args: Record<string, unknown>): Promise<string> {
  requireCanvas(ea);
  const ids = asStringArray(args.ids).slice(0, 80);
  const scope = asString(args.scope);
  const role = asString(args.role, "normal") === "marker" ? "marker" : "normal";
  const scene = ea.getViewElements().filter((element) => !element.isDeleted && element.type !== "frame");
  const elements = ids.length > 0
    ? scene.filter((element) => ids.includes(element.id))
    : scope === "selection"
      ? ea.getViewSelectedElements(false).filter((element) => !element.isDeleted && element.type !== "frame")
      : scope === "all"
        ? scene
        : [];
  if (elements.length === 0) throw new Error("No matching elements to frame. Provide ids or scope=selection/all.");
  const padding = Math.max(0, Math.min(400, asNumber(args.padding, 40)));
  const bounds = ea.getBoundingBox(elements);
  ea.clear();
  if (role === "normal") ea.copyViewElementsToEAforEditing(elements, true);
  const frameId = ea.addFrame(
    bounds.topX - padding,
    bounds.topY - padding,
    bounds.width + padding * 2,
    bounds.height + padding * 2,
    asString(args.name, "Slide"),
  );
  const frame = ea.getElement(frameId) as unknown as Record<string, unknown>;
  if (role === "marker") frame.frameRole = "marker";
  else ea.addElementsToFrame(frameId, elements.map((element) => element.id));
  const committed = await ea.addElementsToView(false, true, true, true);
  ea.clear();
  if (!committed) throw new Error("Excalidraw rejected the frame update.");
  const createdFrame = ea.getViewElements().find((element) => !element.isDeleted && element.id === frameId && element.type === "frame");
  if (!createdFrame) throw new Error("The frame update completed without a frame appearing in the scene.");
  return `Created ${role} frame ${frameId} around ${elements.length} elements.`;
}

async function setFrameRole(ea: ExcalidrawAutomate, args: Record<string, unknown>): Promise<string> {
  requireCanvas(ea);
  const ids = asStringArray(args.ids).slice(0, 40);
  const role = asString(args.role);
  if (role !== "marker" && role !== "normal") throw new Error("Frame role must be marker or normal.");
  const idSet = new Set(ids);
  const scene = ea.getViewElements().filter((element) => !element.isDeleted);
  const frames = scene.filter((element) => idSet.has(element.id) && element.type === "frame");
  if (frames.length === 0) throw new Error("No matching frame IDs exist.");
  const frameIds = new Set(frames.map((frame) => frame.id));
  const members = role === "marker" ? scene.filter((element) => element.frameId && frameIds.has(element.frameId)) : [];
  ea.clear();
  ea.copyViewElementsToEAforEditing([...frames, ...members], true);
  for (const frame of frames) {
    const editable = ea.getElement(frame.id) as unknown as Record<string, unknown>;
    if (role === "marker") editable.frameRole = "marker";
    else delete editable.frameRole;
  }
  if (role === "marker") {
    for (const member of members) {
      const editable = ea.getElement(member.id) as unknown as Record<string, unknown>;
      editable.frameId = null;
    }
  }
  const committed = await ea.addElementsToView(false, true, true, true);
  ea.clear();
  if (!committed) throw new Error("Excalidraw rejected the frame role update.");
  return `Set ${frames.length} frame(s) to ${role}${members.length > 0 ? ` and released ${members.length} owned element(s)` : ""}. ids=${frames.map((frame) => frame.id).join(",")}`;
}

function objectMethodNames(value: unknown): string[] {
  if ((typeof value !== "object" && typeof value !== "function") || value === null) return [];
  const names = new Set<string>();
  let cursor: object | null = value as object;
  let depth = 0;
  while (cursor && cursor !== Object.prototype && depth++ < 8) {
    for (const name of Object.getOwnPropertyNames(cursor)) {
      if (name !== "constructor") names.add(name);
    }
    cursor = Object.getPrototypeOf(cursor) as object | null;
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function findEACapabilities(ea: ExcalidrawAutomate, args: Record<string, unknown>): string {
  const query = asString(args.query).trim().toLowerCase();
  const scope = asString(args.scope, "all");
  const limit = Math.max(5, Math.min(200, asNumber(args.maxResults, 80)));
  const matches = (names: string[]) => names.filter((name) => !query || name.toLowerCase().includes(query)).slice(0, limit);
  const result: Record<string, string[]> = {};
  if (scope === "ea" || scope === "all") result.ea = matches(objectMethodNames(ea));
  if ((scope === "api" || scope === "all") && ea.targetView) result.api = matches(objectMethodNames(ea.getExcalidrawAPI()));
  if (scope === "lib" || scope === "all") {
    const target = ea.targetView as unknown as { containerEl?: HTMLElement } | null;
    const viewWindow = target?.containerEl?.ownerDocument.defaultView as (Window & { ExcalidrawLib?: unknown }) | null | undefined;
    const fallback = globalThis as unknown as { ExcalidrawLib?: unknown };
    result.lib = matches(objectMethodNames(viewWindow?.ExcalidrawLib ?? fallback.ExcalidrawLib));
  }
  return JSON.stringify({ query: query || undefined, scope, capabilities: result });
}


function selectElements(ea: ExcalidrawAutomate, ids: string[]): string {
  requireCanvas(ea);
  const valid = ea.getViewElements().filter((element) => ids.includes(element.id));
  ea.selectElementsInView(valid);
  return `Selected ${valid.length} elements.`;
}

function zoomToElements(ea: ExcalidrawAutomate, ids: string[]): string {
  requireCanvas(ea);
  const valid = ea.getViewElements().filter((element) => ids.includes(element.id));
  if (valid.length === 0) throw new Error("No matching elements to zoom to.");
  ea.viewZoomToElements(false, valid, 0.15);
  return `Zoomed to ${valid.length} elements.`;
}

/** Executes one agent tool call and returns a compact observation for the next reasoning step. */
export async function executeTool(ea: ExcalidrawAutomate, settings: CanvasChatSettings, call: AgentToolCall): Promise<ToolResult> {
  try {
    const args = call.args;
    let summary = "";
    if (call.tool === "inspect_scene") summary = inspectScene(
      ea,
      asString(args.scope, "selection"),
      asNumber(args.maxElements, 80),
      asString(args.query),
      asStringArray(args.types),
      asBoolean(args.includePoints),
      asArea(args.area),
    );
    else if (call.tool === "inspect_layout") {
      summary = inspectLayout(
        ea,
        asString(args.scope, "viewport"),
        asStringArray(args.ids),
        asNumber(args.maxElements, 60),
        asArea(args.area),
      );
      try {
        const parsed = JSON.parse(summary) as { collisions?: unknown[] };
        return {
          tool: call.tool,
          ok: true,
          summary,
          qualityIssueCount: Array.isArray(parsed.collisions) ? parsed.collisions.length : 0,
        };
      } catch {
        return { tool: call.tool, ok: true, summary };
      }
    }
    else if (call.tool === "inspect_elements") summary = inspectElements(ea, asStringArray(args.ids));
    else if (call.tool === "canvas_bitmap") return await canvasBitmap(ea, args);
    else if (call.tool === "read_active_note") summary = await readActiveNote(ea, asNumber(args.maxChars, 12000));
    else if (call.tool === "search_vault") summary = await searchVault(ea, asString(args.query), asNumber(args.maxResults, 8));
    else if (call.tool === "read_file") summary = await readVaultFile(ea, asString(args.path), asNumber(args.maxChars, 12000));
    else if (call.tool === "open_file") summary = await openFile(ea, asString(args.path));
    else if (call.tool === "create_elements") {
      const result = await createElements(ea, args);
      return { tool: call.tool, ok: true, ...result };
    }
    else if (call.tool === "create_visual_template") {
      const result = await createVisualTemplate(ea, args);
      return { tool: call.tool, ok: true, ...result };
    }
    else if (call.tool === "update_elements") {
      const result = await updateElements(ea, args);
      return { tool: call.tool, ok: true, ...result };
    }
    else if (call.tool === "delete_elements") summary = await deleteElements(ea, asStringArray(args.ids));
    else if (call.tool === "convert_elements") summary = await convertElements(ea, args);
    else if (call.tool === "group_elements") summary = await groupElements(ea, asStringArray(args.ids));
    else if (call.tool === "connect_elements") summary = await connectElements(ea, args);
    else if (call.tool === "add_mermaid") {
      const result = await addMermaid(ea, args);
      return { tool: call.tool, ok: true, ...result };
    }
    else if (call.tool === "add_latex") summary = await addLatex(ea, args);
    else if (call.tool === "add_svg") {
      const result = await addSvg(ea, args);
      return { tool: call.tool, ok: true, ...result };
    }
    else if (call.tool === "generate_image") {
      const result = await generateImage(ea, settings, args);
      return { tool: call.tool, ok: true, ...result };
    }
    else if (call.tool === "frame_elements") summary = await frameElements(ea, args);
    else if (call.tool === "select_elements") summary = selectElements(ea, asStringArray(args.ids));
    else if (call.tool === "zoom_to_elements") summary = zoomToElements(ea, asStringArray(args.ids));
    else if (call.tool === "set_frame_role") summary = await setFrameRole(ea, args);
    else if (call.tool === "lookup_ea_docs") summary = await lookupEADocs(ea, asString(args.query), args.sources, asNumber(args.maxChars, 7000));
    else if (call.tool === "read_ea_doc") summary = await readEADoc(ea, asString(args.path), asString(args.query), asNumber(args.maxChars, 9000));
    else if (call.tool === "find_ea_capabilities") summary = findEACapabilities(ea, args);
    else if (call.tool === "execute_ea_script") {
      summary = await executeEAScript(ea, asString(args.code));
      try {
        const parsed = JSON.parse(summary) as { added?: unknown; changed?: unknown };
        const changedIds = [...asStringArray(parsed.added), ...asStringArray(parsed.changed)];
        return {
          tool: call.tool,
          ok: true,
          summary,
          changedIds,
          visualReviewSuggested: changedIds.length >= 3,
        };
      } catch {
        // Fall back to the normal compact result below.
      }
    }
    return { tool: call.tool, ok: true, summary };
  } catch (error) {
    return { tool: call.tool, ok: false, summary: error instanceof Error ? error.message : String(error) };
  }
}
