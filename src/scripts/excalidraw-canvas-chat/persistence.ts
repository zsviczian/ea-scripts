/**
 * @file persistence.ts
 * @overview Local-storage chat persistence and script-settings normalization.
 */

import type {
  CanvasChatSettings,
  ChatHistoryStore,
  ChatMessage,
  ChatThread,
} from "./types";

const STORAGE_KEY = "excalidraw-canvas-chat.history.v1";

function scopedStorageKey(namespace: string): string {
  const safe = namespace.trim().replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80) || "default";
  return `${STORAGE_KEY}:${safe}`;
}
const SETTINGS_KEY = "excalidrawCanvasChat";
const MAX_THREADS = 40;
const MAX_MESSAGES_PER_THREAD = 120;

export const DEFAULT_CHAT_SETTINGS: CanvasChatSettings = {
  version: 1,
  textModelId: "auto",
  imageModelId: "auto",
  maxResponseTokens: 3072,
  debugLogging: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultResponseTokens(ea: ExcalidrawAutomate): number {
  const configured = ea.getAISettings()?.defaultMaxResponseTokens;
  return typeof configured === "number" && Number.isFinite(configured)
    ? Math.max(256, Math.min(8000, Math.round(configured)))
    : DEFAULT_CHAT_SETTINGS.maxResponseTokens;
}

function normalizeMessage(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  if (value.role !== "user" && value.role !== "assistant") return null;
  if (typeof value.content !== "string" || typeof value.id !== "string") return null;
  return {
    id: value.id,
    role: value.role,
    content: value.content,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

function normalizeThread(value: unknown): ChatThread | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizeMessage).filter((item): item is ChatMessage => item !== null)
    : [];
  return {
    id: value.id,
    title: typeof value.title === "string" && value.title.trim() ? value.title : "Canvas chat",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    messages: messages.slice(-MAX_MESSAGES_PER_THREAD),
  };
}

function emptyStore(): ChatHistoryStore {
  return { version: 1, activeThreadId: null, threads: [] };
}

/** Loads persisted chats from the owning window's localStorage. */
export function loadChatStore(storage: Storage | null, namespace = "default"): ChatHistoryStore {
  if (!storage) return emptyStore();
  try {
    const raw = storage.getItem(scopedStorageKey(namespace));
    if (!raw) return emptyStore();
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.threads)) return emptyStore();
    const threads = parsed.threads
      .map(normalizeThread)
      .filter((item): item is ChatThread => item !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, MAX_THREADS);
    const activeThreadId = typeof parsed.activeThreadId === "string" && threads.some((t) => t.id === parsed.activeThreadId)
      ? parsed.activeThreadId
      : threads[0]?.id ?? null;
    return { version: 1, activeThreadId, threads };
  } catch {
    return emptyStore();
  }
}

/** Saves a bounded chat history to localStorage. */
export function saveChatStore(storage: Storage | null, store: ChatHistoryStore, namespace = "default"): void {
  if (!storage) return;
  try {
    const bounded: ChatHistoryStore = {
      version: 1,
      activeThreadId: store.activeThreadId,
      threads: store.threads
        .map((thread) => ({ ...thread, messages: thread.messages.slice(-MAX_MESSAGES_PER_THREAD) }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, MAX_THREADS),
    };
    storage.setItem(scopedStorageKey(namespace), JSON.stringify(bounded));
  } catch {
    // Local storage may be unavailable or full. The in-memory chat remains usable.
  }
}

/** Normalizes the script-owned model preferences. */
export function loadChatSettings(ea: ExcalidrawAutomate): CanvasChatSettings {
  const all = ea.getScriptSettings();
  const value = all[SETTINGS_KEY];
  const fallbackMaxResponseTokens = defaultResponseTokens(ea);
  if (!isRecord(value)) return { ...DEFAULT_CHAT_SETTINGS, maxResponseTokens: fallbackMaxResponseTokens };
  const maxResponseTokens = typeof value.maxResponseTokens === "number" && Number.isFinite(value.maxResponseTokens)
    ? Math.max(256, Math.min(8000, Math.round(value.maxResponseTokens)))
    : fallbackMaxResponseTokens;
  return {
    version: 1,
    textModelId: typeof value.textModelId === "string" ? value.textModelId : "auto",
    imageModelId: typeof value.imageModelId === "string" ? value.imageModelId : "auto",
    maxResponseTokens,
    debugLogging: value.debugLogging === true,
  };
}

/** Persists model preferences without disturbing unrelated script settings. */
export async function saveChatSettings(ea: ExcalidrawAutomate, settings: CanvasChatSettings): Promise<void> {
  const current = ea.getScriptSettings();
  await ea.setScriptSettings({ ...current, [SETTINGS_KEY]: settings });
}

/** Creates a fresh thread and makes it active. */
export function createThread(store: ChatHistoryStore, now = new Date()): ChatThread {
  const stamp = now.toISOString();
  const thread: ChatThread = {
    id: `chat-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    title: "New canvas chat",
    createdAt: stamp,
    updatedAt: stamp,
    messages: [],
  };
  store.threads.unshift(thread);
  store.activeThreadId = thread.id;
  return thread;
}

/** Adds a user or assistant message and derives a useful title from the first user prompt. */
export function appendMessage(thread: ChatThread, role: ChatRole, content: string, now = new Date()): ChatMessage {
  const stamp = now.toISOString();
  const message: ChatMessage = {
    id: `msg-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    createdAt: stamp,
  };
  thread.messages.push(message);
  thread.updatedAt = stamp;
  if (role === "user" && thread.messages.filter((item) => item.role === "user").length === 1) {
    const compact = content.replace(/\s+/g, " ").trim();
    thread.title = compact.length > 42 ? `${compact.slice(0, 39)}…` : compact || "Canvas chat";
  }
  if (thread.messages.length > MAX_MESSAGES_PER_THREAD) {
    thread.messages.splice(0, thread.messages.length - MAX_MESSAGES_PER_THREAD);
  }
  return message;
}

type ChatRole = ChatMessage["role"];
