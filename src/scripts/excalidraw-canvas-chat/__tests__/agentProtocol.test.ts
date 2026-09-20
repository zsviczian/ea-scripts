import { describe, expect, it } from "vitest";
import { compactHistory, estimateMessageTokens, estimateTokens, parseAgentEnvelope } from "../agentProtocol";
import type { ChatMessage } from "../types";

describe("Canvas Chat agent protocol", () => {
  it("parses a strict tool envelope", () => {
    const parsed = parseAgentEnvelope(JSON.stringify({
      reply: "",
      actions: [{ tool: "inspect_elements", args: { ids: ["a"] } }],
      done: false,
    }));
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]?.tool).toBe("inspect_elements");
    expect(parsed.done).toBe(false);
  });

  it("accepts EA documentation and runtime-script tools", () => {
    const parsed = parseAgentEnvelope(JSON.stringify({
      reply: "",
      actions: [
        { tool: "lookup_ea_docs", args: { query: "marker frame" } },
        { tool: "execute_ea_script", args: { code: "return { ok: true };" } },
      ],
      done: false,
    }));
    expect(parsed.actions.map((action) => action.tool)).toEqual(["lookup_ea_docs", "execute_ea_script"]);
  });

  it("accepts spatial inspection and visual-template tools", () => {
    const parsed = parseAgentEnvelope(JSON.stringify({
      reply: "",
      actions: [
        { tool: "inspect_layout", args: { scope: "viewport" } },
        { tool: "create_visual_template", args: { title: "Meeting Notes", sections: [{ title: "Notes" }] } },
      ],
      done: false,
    }));
    expect(parsed.actions.map((action) => action.tool)).toEqual(["inspect_layout", "create_visual_template"]);
  });

  it("accepts a fenced JSON response", () => {
    const parsed = parseAgentEnvelope("```json\n{\"reply\":\"Done\",\"actions\":[],\"done\":true}\n```");
    expect(parsed.reply).toBe("Done");
    expect(parsed.done).toBe(true);
  });


  it("recovers a complete JSON object wrapped in model prose", () => {
    const parsed = parseAgentEnvelope('Here is the result: {"reply":"Done","actions":[],"done":true} Thanks');
    expect(parsed.reply).toBe("Done");
    expect(parsed.done).toBe(true);
  });

  it("reports an empty model response clearly", () => {
    expect(() => parseAgentEnvelope("   ")).toThrow("AI returned an empty response.");
  });

  it("rejects unsupported tool calls instead of silently treating them as done", () => {
    expect(() => parseAgentEnvelope('{"reply":"","actions":[{"tool":"make_magic","args":{}}],"done":false}'))
      .toThrow("unsupported tool call");
  });


  it("uses a stable rough token estimate", () => {
    expect(estimateTokens("12345678")).toBe(2);
  });

  it("includes low-detail bitmap cost in the approximate context total", () => {
    expect(estimateMessageTokens([{ role: "user", content: [{ type: "image", image: { dataURL: "data:image/png;base64,abc", detail: "low" } }] }]))
      .toBeGreaterThanOrEqual(300);
  });

  it("drops stale failures and older exact repeats from live history", () => {
    const base = (role: "user" | "assistant", content: string, index: number): ChatMessage => ({
      id: String(index), role, content, createdAt: "2026-09-19T00:00:00Z",
    });
    const history = [
      base("user", "add a frame", 1),
      base("assistant", "I couldn't complete that turn: failed", 2),
      base("user", "add a frame", 3),
      base("assistant", "Added a frame.", 4),
      base("user", "make it a marker frame", 5),
    ];
    expect(compactHistory(history).map((message) => message.content)).toEqual([
      "add a frame",
      "Added a frame.",
      "make it a marker frame",
    ]);
  });
});
