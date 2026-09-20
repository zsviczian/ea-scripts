/**
 * @file eaScriptExecutor.ts
 * @overview Executes small AI-authored ExcalidrawAutomate snippets as the agent's general-purpose escape hatch.
 */

interface SceneSnapshotItem {
  id: string;
  type: string;
  version: number;
  deleted: boolean;
  frameRole?: unknown;
}

function snapshot(ea: ExcalidrawAutomate): Map<string, SceneSnapshotItem> {
  const result = new Map<string, SceneSnapshotItem>();
  if (!ea.targetView) return result;
  for (const element of ea.getViewElements()) {
    const record = element as unknown as Record<string, unknown>;
    result.set(element.id, {
      id: element.id,
      type: element.type,
      version: typeof record.version === "number" ? record.version : 0,
      deleted: element.isDeleted,
      frameRole: record.frameRole,
    });
  }
  return result;
}

function stripFence(code: string): string {
  return code.trim().replace(/^```(?:js|javascript|ts|typescript)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function validateCode(code: string): void {
  if (!code) throw new Error("Generated EA script is empty.");
  if (code.length > 20000) throw new Error("Generated EA script is too large; keep runtime snippets under 20,000 characters.");
  if (/^\s*(?:import|export)\b/m.test(code)) throw new Error("Generated EA scripts cannot use import/export; use the injected ea object.");
  if (/\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/.test(code)) throw new Error("Generated EA scripts cannot use browser dialogs.");
  if (/\b(?:globalThis|window|document|require|process|XMLHttpRequest|WebSocket)\b/.test(code)) throw new Error("Generated EA scripts must stay inside the injected EA/API environment.");
  if (/\b(?:eval|Function)\s*\(/.test(code)) throw new Error("Generated EA scripts cannot dynamically evaluate more code.");
  if (/\bfetch\s*\(|\brequestUrl\s*\(/.test(code)) throw new Error("Generated EA scripts cannot make network requests; use Canvas Chat documentation tools instead.");
  if (/\.vault\.(?:create|modify|delete|trash|rename|append|process)\s*\(/.test(code)) throw new Error("Generated EA scripts cannot modify vault files.");
}

function summarizeChanges(before: Map<string, SceneSnapshotItem>, after: Map<string, SceneSnapshotItem>): Record<string, unknown> {
  const added: string[] = [];
  const changed: string[] = [];
  const deleted: string[] = [];
  for (const [id, item] of after) {
    const previous = before.get(id);
    if (!previous) {
      if (!item.deleted) added.push(id);
      continue;
    }
    if (!previous.deleted && item.deleted) deleted.push(id);
    else if (previous.version !== item.version || previous.frameRole !== item.frameRole) changed.push(id);
  }
  return {
    added: added.slice(0, 40),
    changed: changed.slice(0, 40),
    deleted: deleted.slice(0, 40),
    sceneElements: [...after.values()].filter((item) => !item.deleted).length,
  };
}

/** Runs a self-contained drawing snippet with injected `ea`, `api`, and `ExcalidrawLib`; it must commit its own persistent mutations. */
export async function executeEAScript(ea: ExcalidrawAutomate, source: string): Promise<string> {
  if (!ea.targetView) throw new Error("No Excalidraw canvas is currently bound. Focus a drawing and try again.");
  const code = stripFence(source);
  validateCode(code);
  const before = snapshot(ea);
  ea.clear();
  const AsyncFunction = Object.getPrototypeOf(async function () { /* noop */ }).constructor as new (
    ...args: string[]
  ) => (...values: unknown[]) => Promise<unknown>;
  const target = ea.targetView as unknown as { containerEl?: HTMLElement } | null;
  const viewWindow = target?.containerEl?.ownerDocument.defaultView as (Window & { ExcalidrawLib?: unknown }) | null | undefined;
  const fallback = globalThis as unknown as { ExcalidrawLib?: unknown };
  const api = ea.getExcalidrawAPI();
  const ExcalidrawLib = viewWindow?.ExcalidrawLib ?? fallback.ExcalidrawLib;
  const runner = new AsyncFunction("ea", "api", "ExcalidrawLib", `"use strict";\n${code}`);
  let result: unknown;
  try {
    result = await runner(ea, api, ExcalidrawLib);
  } finally {
    ea.clear();
  }
  const after = snapshot(ea);
  const changes = summarizeChanges(before, after);
  return JSON.stringify({ result: result ?? null, ...changes });
}
