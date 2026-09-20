/**
 * @file chatExport.ts
 * @overview Markdown export for a persisted Canvas Chat thread.
 */

import type { ChatThread } from "./types";

function headingForRole(role: "user" | "assistant"): string {
  return role === "user" ? "You" : "Canvas Chat";
}

/** Converts the current chat thread to a compact, copy-friendly Markdown transcript. */
export function chatThreadToMarkdown(thread: ChatThread): string {
  const lines = [`# ${thread.title || "Excalidraw Canvas Chat"}`, ""];
  for (const message of thread.messages) {
    lines.push(`## ${headingForRole(message.role)}`, "", message.content.trim(), "");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
