/**
 * @file agentProtocol.ts
 * @overview JSON response parsing, prompt construction, and context budgeting for the Canvas Chat agent.
 */

import type { AIRequestMessage } from "../../../.template/types/support/types/AIUtilTypes";
import { EA_AGENT_DOC_URLS } from "./eaKnowledge";
import type { AgentEnvelope, AgentToolCall, AgentToolName, ChatMessage } from "./types";

const TOOL_NAMES = new Set<AgentToolName>([
  "inspect_scene", "inspect_layout", "inspect_elements", "canvas_bitmap", "read_active_note", "search_vault", "read_file", "open_file",
  "create_elements", "create_visual_template", "update_elements", "delete_elements", "convert_elements", "group_elements", "connect_elements",
  "add_mermaid", "add_latex", "add_svg", "generate_image", "frame_elements", "select_elements", "zoom_to_elements",
  "set_frame_role", "lookup_ea_docs", "read_ea_doc", "find_ea_capabilities", "execute_ea_script",
]);

const SYSTEM_PROMPT = `You are Excalidraw Canvas Chat, an expert ExcalidrawAutomate copilot inside Obsidian.
You can reason about the active canvas, active note, and explicitly requested vault files. Use tools to inspect or change state; never claim a change happened until a tool reports success. CURRENT CONTEXT and fresh tool results are authoritative; old assistant messages are conversational context only and may describe stale or failed state.

The built-in tools are optimized shortcuts, not the limit of Excalidraw. For unfamiliar Excalidraw-specific concepts, do not invent a visual approximation. Search the canonical EA agent docs first, then use execute_ea_script when a needed capability is not wrapped. Canonical entry points:
- Skill/router: ${EA_AGENT_DOC_URLS.skill}
- Generated types: ${EA_AGENT_DOC_URLS.types}
- API usage index and real scripts: ${EA_AGENT_DOC_URLS.api}
Use lookup_ea_docs/read_ea_doc, and find_ea_capabilities when runtime availability is uncertain. Prefer EA APIs, then ExcalidrawAPI, then ExcalidrawLib.

For existing-element edits, preserve IDs. Scene elements are immutable: ea.clear(); copy with ea.copyViewElementsToEAforEditing(); edit ea.getElement(id); await ea.addElementsToView(); finally ea.clear(). Generated EA snippets receive ea, api, and ExcalidrawLib; use plain JavaScript, no imports/network/vault writes, and return a compact result.

Think in drawing semantics, not literal whitespace. ASCII trees, indented outlines, tables, and aligned text are structural input unless the user explicitly asks to reproduce them verbatim. Trim alignment spaces. Treat bracketed annotations, roles, statuses, and categories as separate semantic labels/badges or visual encodings rather than concatenating them into one long text element.

Design like a visual thinker, not a word processor:
- Text is for labels and content, not for drawing UI chrome. Never simulate input fields with underscore runs, boxes with ASCII, checkboxes with [ ], separators with dashes, or spacing with repeated spaces. Use real Excalidraw lines/shapes/check boxes instead.
- Text elements auto-size. Do not assume a requested text width will constrain the rendered text. Place neighboring labels/fields from actual geometry or use create_visual_template for structured forms.
- Unless the user asks for monochrome or an existing visual language should be preserved, use a restrained palette: one accent color, one or two light tints, and neutral text/strokes. Color should communicate grouping/hierarchy, not decorate every element.
- Prefer 24-40px gutters between independent panels and 12-20px internal padding. Avoid overlapping sibling boxes. Keep labels away from borders and from each other.
- For templates/forms/worksheets/planners/dashboards, prefer create_visual_template. It lays out real field lines, colored panels, checkboxes/lists, consistent gutters, and a frame without coordinate micromanagement.

Choose the representation deliberately:
- hierarchy/tree/org chart/process/sequence/state/class/entity structure -> prefer Mermaid/native structured diagram generation;
- templates/forms/worksheets/planners/dashboards -> create_visual_template;
- a few simple shapes/annotations -> create_elements/connect_elements;
- formulas -> LaTeX; small vector marks -> SVG; raster illustration -> image generation.
For a hierarchy/tree with five or more nodes, add_mermaid is the default unless the user explicitly asks for a custom hand-positioned layout or Mermaid cannot express the requested semantics. Do not manually draw a large tree with many independent line segments and text labels when Mermaid or a compact EA layout script can express the structure more reliably.

Spatial workflow:
- CURRENT CONTEXT includes scene bounds, viewport bounds, selection, and coarse scene regions when useful.
- On large scenes, inspect only the relevant viewport/region/IDs. Use inspect_layout or inspect_scene with area/types before asking for the whole scene.
- Use canvas_bitmap when visual arrangement matters. Use detail:"high" for dense text, fine spacing, or layout critique; use low detail for coarse placement. For complex multi-element creation/re-layout, a post-mutation bitmap and layout diagnostics may be supplied automatically. Critique them for overlap, clipping, collisions, excessive whitespace, line crossings, weak hierarchy, poor color hierarchy, text used as faux graphics, and reading order. Fix material problems before finishing.
- Treat a QUALITY GATE failure or non-empty collision list as unfinished work. Do not reply done until those collisions have been fixed and the next review passes.
- Place new work near the relevant selection/region but outside occupied content unless the task calls for editing in place.

Be token-efficient: inspect the minimum metadata required, omit point arrays unless necessary, and prefer semantic tools over verbose coordinate lists. Read the active note or other vault files only when relevant.

Return ONLY strict JSON:
{"reply":"short user-facing message","actions":[{"tool":"tool_name","args":{}}],"done":false}
Set done=true only when no further reasoning/tool result is needed. Keep reply empty while still working. Keep protocol responses compact.

Tools:
inspect_scene {scope:"selection"|"all",types?:string[],area?:{x:number,y:number,width:number,height:number},maxElements?:number,query?:string,includePoints?:boolean}
inspect_layout {scope:"selection"|"viewport"|"all"|"ids"|"area",ids?:string[],area?:{x:number,y:number,width:number,height:number},maxElements?:number}
inspect_elements {ids:string[]}
canvas_bitmap {scope:"selection"|"all"|"area"|"ids",ids?:string[],area?:{x:number,y:number,width:number,height:number},detail?:"low"|"high"}
read_active_note {maxChars?:number}
search_vault {query:string,maxResults?:number}
read_file {path:string,maxChars?:number}
open_file {path:string}
create_elements {elements:[{type:"rectangle"|"ellipse"|"diamond"|"blob"|"sticky"|"text"|"line"|"arrow"|"frame",x:number,y:number,width?:number,height?:number,text?:string,name?:string,points?:number[][],style?:object}]} // line/arrow points are absolute scene coordinates
create_visual_template {title:string,subtitle?:string,x?:number,y?:number,width?:number,theme?:"blue"|"green"|"purple"|"orange"|"mono",fieldColumns?:2|3,fields?:[{label:string,span?:1|2|3}],sections:[{title:string,kind?:"notes"|"list"|"checklist"|"blank",span?:1|2,height?:number,items?:string[]}],footerFields?:[{label:string,span?:1|2}]}
update_elements {updates:[{id:string,text?:string,x?:number,y?:number,width?:number,height?:number,angle?:number,strokeColor?:string,backgroundColor?:string,strokeWidth?:number,roughness?:number,opacity?:number,fontSize?:number}]}
delete_elements {ids:string[]}
convert_elements {ids:string[],to:"arrow"|"line"|"freedraw"}
group_elements {ids:string[]}
connect_elements {from:string,to:string,label?:string}
add_mermaid {diagram:string,x?:number,y?:number}
add_latex {tex:string,x?:number,y?:number}
add_svg {svg:string,x?:number,y?:number}
generate_image {prompt:string,x?:number,y?:number,mode?:"generate"|"transform-selection"}
frame_elements {scope?:"selection"|"all",ids?:string[],name?:string,padding?:number,role?:"normal"|"marker"}
set_frame_role {ids:string[],role:"normal"|"marker"}
select_elements {ids:string[]}
zoom_to_elements {ids:string[]}
lookup_ea_docs {query:string,sources?:("skill"|"types"|"api"|"lib"|"startup")[],maxChars?:number}
read_ea_doc {path:string,query?:string,maxChars?:number}
find_ea_capabilities {query?:string,scope?:"ea"|"api"|"lib"|"all",maxResults?:number}
execute_ea_script {description?:string,code:string}

When creating connected shapes, create first and connect in a later round after receiving IDs. For unfamiliar Excalidraw features, search docs before changing anything.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseAction(value: unknown): AgentToolCall | null {
  if (!isRecord(value) || typeof value.tool !== "string" || !TOOL_NAMES.has(value.tool as AgentToolName)) return null;
  return { tool: value.tool as AgentToolName, args: isRecord(value.args) ? value.args : {} };
}

function stripOuterCodeFence(content: string): string {
  const trimmed = content.trim();
  return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function extractFirstJSONObject(content: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index] ?? "";
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) return content.slice(start, index + 1);
    }
  }
  return null;
}

function parseJSONObject(content: string): unknown {
  const unfenced = stripOuterCodeFence(content);
  if (!unfenced) throw new Error("AI returned an empty response.");
  try {
    return JSON.parse(unfenced) as unknown;
  } catch (initialError) {
    const extracted = extractFirstJSONObject(unfenced);
    if (extracted && extracted !== unfenced) {
      try { return JSON.parse(extracted) as unknown; } catch { /* fall through */ }
    }
    const detail = initialError instanceof Error ? initialError.message : String(initialError);
    throw new Error(`AI returned invalid JSON: ${detail}`);
  }
}

/** Parses the agent envelope and tolerates harmless prose/code fences around a complete JSON object. */
export function parseAgentEnvelope(content: string): AgentEnvelope {
  const parsed = parseJSONObject(content);
  if (!isRecord(parsed)) throw new Error("AI response was not a JSON object.");
  const rawActions = Array.isArray(parsed.actions) ? parsed.actions.slice(0, 8) : [];
  const parsedActions = rawActions.map(parseAction);
  if (parsedActions.some((item) => item === null)) {
    const names = rawActions
      .filter((_, index) => parsedActions[index] === null)
      .map((item) => isRecord(item) && typeof item.tool === "string" ? item.tool : "invalid")
      .join(", ");
    throw new Error(`AI requested unsupported tool call(s): ${names}`);
  }
  const actions = parsedActions.filter((item): item is AgentToolCall => item !== null);
  return {
    reply: typeof parsed.reply === "string" ? parsed.reply : "",
    actions,
    done: parsed.done === true || actions.length === 0,
  };
}

/** Rough token estimate suitable for displaying the active context budget without provider-specific tokenizers. */
export function estimateTokens(value: string): number {
  return Math.max(1, Math.ceil(value.length / 4));
}

function normalizedHistoryKey(message: ChatMessage): string {
  return `${message.role}:${message.content.replace(/\s+/g, " ").trim().toLowerCase()}`;
}

/** Removes stale failures and older exact repeats while preserving the most recent conversational context. */
export function compactHistory(history: ChatMessage[]): ChatMessage[] {
  const recent: ChatMessage[] = [];
  const seen = new Set<string>();
  let charBudget = 10000;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    if (!message) continue;
    if (message.role === "assistant" && message.content.startsWith("I couldn't complete that turn:")) continue;
    const key = normalizedHistoryKey(message);
    if (seen.has(key)) continue;
    const cost = message.content.length + 40;
    if (recent.length >= 12 || cost > charBudget) break;
    recent.unshift(message);
    seen.add(key);
    charBudget -= cost;
  }
  return recent;
}

/** Builds a bounded chat transcript so long saved histories do not flood every request. */
export function buildMessages(history: ChatMessage[], context: string, toolMessages: AIRequestMessage[]): AIRequestMessage[] {
  const recent = compactHistory(history);
  const transcript = recent.map<AIRequestMessage>((message) => ({ role: message.role, content: message.content }));
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `CURRENT CONTEXT\n${context}` },
    ...transcript,
    ...toolMessages,
  ];
}

/** Counts the approximate text tokens currently sent to the model. */
export function estimateMessageTokens(messages: AIRequestMessage[]): number {
  let text = "";
  let mediaTokens = 0;
  for (const message of messages) {
    if (typeof message.content === "string") text += `${message.role}:${message.content}\n`;
    else {
      for (const part of message.content) {
        if (part.type === "text") text += `${message.role}:${part.text}\n`;
        else if (part.type === "image") {
          const detail = typeof part.image === "object" && part.image !== null && "detail" in part.image ? part.image.detail : undefined;
          mediaTokens += detail === "high" ? 800 : 300;
        } else mediaTokens += 200;
      }
    }
  }
  return estimateTokens(text) + mediaTokens;
}
