/**
 * @file types.ts
 * @overview Shared state and agent protocol types for Excalidraw Canvas Chat.
 */

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

export interface ChatHistoryStore {
  version: 1;
  activeThreadId: string | null;
  threads: ChatThread[];
}

export interface CanvasChatSettings {
  version: 1;
  textModelId: string;
  imageModelId: string;
  maxResponseTokens: number;
  debugLogging: boolean;
}

export type AgentToolName =
  | "inspect_scene"
  | "inspect_layout"
  | "inspect_elements"
  | "canvas_bitmap"
  | "read_active_note"
  | "search_vault"
  | "read_file"
  | "open_file"
  | "create_elements"
  | "create_visual_template"
  | "update_elements"
  | "delete_elements"
  | "convert_elements"
  | "group_elements"
  | "connect_elements"
  | "add_mermaid"
  | "add_latex"
  | "add_svg"
  | "generate_image"
  | "frame_elements"
  | "select_elements"
  | "zoom_to_elements"
  | "set_frame_role"
  | "lookup_ea_docs"
  | "read_ea_doc"
  | "find_ea_capabilities"
  | "execute_ea_script";

export interface AgentToolCall {
  tool: AgentToolName;
  args: Record<string, unknown>;
}

export interface AgentEnvelope {
  reply: string;
  actions: AgentToolCall[];
  done: boolean;
}

export interface ToolResult {
  tool: AgentToolName;
  ok: boolean;
  summary: string;
  imageDataURL?: string;
  imageDetail?: "low" | "high";
  changedIds?: string[];
  visualReviewSuggested?: boolean;
  qualityIssueCount?: number;
}

export interface AgentRunResult {
  reply: string;
  estimatedContextTokens: number;
}

export interface CanvasContextSummary {
  text: string;
  selectedIds: string[];
}
