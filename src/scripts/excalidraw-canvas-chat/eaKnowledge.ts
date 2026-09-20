/**
 * @file eaKnowledge.ts
 * @overview Token-efficient retrieval of canonical ExcalidrawAutomate agent documentation from GitHub.
 */

const CANONICAL_ROOT =
  "https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/master/docs/AITrainingData/excalidraw-automate";

export const EA_AGENT_DOC_URLS = {
  skill: "https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/docs/AITrainingData/excalidraw-automate/SKILL.md",
  types: "https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/docs/AITrainingData/excalidraw-automate/references/type-definitions.md",
  api: "https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/docs/AITrainingData/excalidraw-automate/references/api-usage-index.md",
  lib: "https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/docs/AITrainingData/excalidraw-automate/references/excalidraw-lib-functions.md",
  startup: "https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/docs/AITrainingData/excalidraw-automate/references/startup-scripts.md",
  template: "https://github.com/zsviczian/ea-script-template/blob/main/.ai/excalidraw-automate/SKILL.md",
} as const;

const SOURCE_PATHS = {
  skill: "SKILL.md",
  types: "references/type-definitions.md",
  api: "references/api-usage-index.md",
  lib: "references/excalidraw-lib-functions.md",
  startup: "references/startup-scripts.md",
} as const;

type KnowledgeSource = keyof typeof SOURCE_PATHS;

const cache = new Map<string, string>();

function cleanQueryTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[^a-z0-9_.-]+/).filter((term) => term.length >= 2))].slice(0, 12);
}

/** Normalizes paths copied from the API usage index or canonical GitHub/raw URLs. */
export function normalizeKnowledgePath(value: string): string {
  let path = value.trim();
  const markers = [
    "/docs/AITrainingData/excalidraw-automate/",
    "/master/docs/AITrainingData/excalidraw-automate/",
  ];
  for (const marker of markers) {
    const index = path.indexOf(marker);
    if (index >= 0) {
      path = path.slice(index + marker.length);
      break;
    }
  }
  try { path = decodeURIComponent(path); } catch { /* keep original text */ }
  path = path.replace(/^\.\//, "").replace(/^\//, "");
  if (path.startsWith("scripts/")) path = `references/${path}`;
  return path;
}

/** Limits remote reads to the curated agent-training documentation tree. */
export function isAllowedKnowledgePath(path: string): boolean {
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("\\")) return false;
  return path === "SKILL.md"
    || path === "references/type-definitions.md"
    || path === "references/api-usage-index.md"
    || path === "references/excalidraw-lib-functions.md"
    || path === "references/startup-scripts.md"
    || /^references\/scripts\/[^/]+\.(?:js|md)$/.test(path);
}

async function fetchDoc(ea: ExcalidrawAutomate, pathValue: string): Promise<{ path: string; text: string }> {
  const path = normalizeKnowledgePath(pathValue);
  if (!isAllowedKnowledgePath(path)) throw new Error(`Unsupported EA documentation path: ${pathValue}`);
  const existing = cache.get(path);
  if (existing !== undefined) return { path, text: existing };
  const response = await ea.obsidian.requestUrl(`${CANONICAL_ROOT}/${path.split("/").map(encodeURIComponent).join("/")}`);
  if (response.status < 200 || response.status >= 300) throw new Error(`EA documentation request failed (${response.status}) for ${path}`);
  cache.set(path, response.text);
  return { path, text: response.text };
}

interface SnippetCandidate {
  start: number;
  end: number;
  score: number;
}

/** Extracts compact line-context matches without sending whole documentation files to the model. */
export function extractKnowledgeSnippets(text: string, query: string, maxChars = 7000): string {
  const lines = text.split(/\r?\n/);
  const terms = cleanQueryTerms(query);
  if (terms.length === 0) return text.slice(0, maxChars);
  const candidates: SnippetCandidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const lower = (lines[index] ?? "").toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lower.includes(term)) score += term.length >= 7 ? 4 : 2;
    }
    if (score === 0) continue;
    if (/^#{1,6}\s/.test(lines[index] ?? "")) score += 2;
    candidates.push({ start: Math.max(0, index - 3), end: Math.min(lines.length, index + 6), score });
  }
  candidates.sort((a, b) => b.score - a.score || a.start - b.start);
  const picked: SnippetCandidate[] = [];
  for (const candidate of candidates) {
    if (picked.some((item) => candidate.start <= item.end + 2 && candidate.end >= item.start - 2)) continue;
    picked.push(candidate);
    if (picked.length >= 8) break;
  }
  picked.sort((a, b) => a.start - b.start);
  let output = "";
  for (const item of picked) {
    const block = `lines ${item.start + 1}-${item.end}\n${lines.slice(item.start, item.end).join("\n")}`;
    if (output.length + block.length + 6 > maxChars) break;
    output += `${output ? "\n\n---\n\n" : ""}${block}`;
  }
  return output || `No exact documentation match for: ${query}`;
}

function normalizeSources(value: unknown): KnowledgeSource[] {
  if (!Array.isArray(value)) return ["skill", "types", "api"];
  const allowed = new Set<KnowledgeSource>(["skill", "types", "api", "lib", "startup"]);
  const result = value.filter((item): item is KnowledgeSource => typeof item === "string" && allowed.has(item as KnowledgeSource));
  return result.length > 0 ? [...new Set(result)] : ["skill", "types", "api"];
}

/** Searches the canonical skill, generated types, API usage index, and optional references. */
export async function lookupEADocs(
  ea: ExcalidrawAutomate,
  query: string,
  sourcesValue: unknown,
  maxCharsValue: number,
): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error("EA documentation query is empty.");
  const sources = normalizeSources(sourcesValue);
  const maxChars = Math.max(1200, Math.min(12000, maxCharsValue || 7000));
  const perSource = Math.max(900, Math.floor(maxChars / sources.length));
  const sections: string[] = [];
  for (const source of sources) {
    const path = SOURCE_PATHS[source];
    const fetched = await fetchDoc(ea, path);
    sections.push(`SOURCE ${fetched.path}\n${extractKnowledgeSnippets(fetched.text, trimmed, perSource)}`);
  }
  return sections.join("\n\n=====\n\n").slice(0, maxChars);
}

/** Reads one curated reference file or real example script, optionally narrowed to a query. */
export async function readEADoc(
  ea: ExcalidrawAutomate,
  path: string,
  query: string,
  maxCharsValue: number,
): Promise<string> {
  const fetched = await fetchDoc(ea, path);
  const maxChars = Math.max(1200, Math.min(14000, maxCharsValue || 9000));
  const body = query.trim() ? extractKnowledgeSnippets(fetched.text, query, maxChars) : fetched.text.slice(0, maxChars);
  return `SOURCE ${fetched.path}\n${body}${!query.trim() && fetched.text.length > maxChars ? "\n…[truncated]" : ""}`;
}
