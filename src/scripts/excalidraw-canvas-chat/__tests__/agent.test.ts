import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasChatSettings, ChatMessage } from "../types";

const mocks = vi.hoisted(() => ({
  executeTool: vi.fn(),
  captureVisualReview: vi.fn(),
}));

vi.mock("../context", () => ({
  summarizeCurrentContext: () => ({ text: "canvas context" }),
}));

vi.mock("../tools", () => ({
  executeTool: mocks.executeTool,
  captureVisualReview: mocks.captureVisualReview,
}));

import { runAgentTurn } from "../agent";

const settings: CanvasChatSettings = {
  version: 1,
  textModelId: "auto",
  imageModelId: "auto",
  maxResponseTokens: 1600,
  debugLogging: false,
};

const history: ChatMessage[] = [
  {
    id: "message-1",
    role: "user",
    content: "Add a frame around the scene.",
    createdAt: "2026-09-19T17:00:00Z",
  },
];

function createEA(envelope: Record<string, unknown>): ExcalidrawAutomate {
  return {
    getAISettings: () => ({
      enabled: true,
      textModels: {
        "gpt-test": { providerId: "provider", model: "gpt-test", multimodalSupport: true },
      },
      imageModels: {},
      providerProfiles: { provider: { hasApiKey: true } },
      defaultTextModel: "gpt-test",
      defaultMultimodalTextModel: "gpt-test",
    }),
    generateAIText: vi.fn().mockResolvedValue({
      content: JSON.stringify(envelope),
      json: {},
      rateLimit: null,
      rateLimitRemaining: null,
    }),
  } as unknown as ExcalidrawAutomate;
}

describe("Canvas Chat agent execution", () => {
  beforeEach(() => {
    mocks.executeTool.mockReset();
    mocks.captureVisualReview.mockReset();
  });

  it("executes actions even when the model marks the same envelope done", async () => {
    mocks.executeTool.mockResolvedValue({
      tool: "frame_elements",
      ok: true,
      summary: "Created frame frame-1 around 3 elements.",
    });
    const ea = createEA({
      reply: "Added a frame around the scene.",
      actions: [{ tool: "frame_elements", args: { scope: "all", name: "Frame", padding: 20 } }],
      done: true,
    });

    const result = await runAgentTurn(ea, settings, history);

    expect(mocks.executeTool).toHaveBeenCalledTimes(1);
    expect(mocks.executeTool).toHaveBeenCalledWith(
      ea,
      settings,
      expect.objectContaining({ tool: "frame_elements" }),
    );
    expect(result.reply).toBe("Added a frame around the scene.");
    expect(ea.generateAIText).toHaveBeenCalledTimes(1);
    expect(ea.generateAIText).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 4096 }));
  });
  it("continues after documentation lookup even if the model prematurely marks the action done", async () => {
    mocks.executeTool.mockResolvedValue({
      tool: "lookup_ea_docs",
      ok: true,
      summary: "frameRole?: null | marker",
    });
    const ai = {
      getAISettings: () => ({
        enabled: true,
        textModels: { "gpt-test": { providerId: "provider", model: "gpt-test", multimodalSupport: true } },
        imageModels: {},
        providerProfiles: { provider: { hasApiKey: true } },
        defaultTextModel: "gpt-test",
        defaultMultimodalTextModel: "gpt-test",
      }),
      generateAIText: vi.fn()
        .mockResolvedValueOnce({
          content: JSON.stringify({
            reply: "",
            actions: [{ tool: "lookup_ea_docs", args: { query: "marker frame" } }],
            done: true,
          }),
          json: {}, rateLimit: null, rateLimitRemaining: null,
        })
        .mockResolvedValueOnce({
          content: JSON.stringify({ reply: "Found the marker-frame semantics.", actions: [], done: true }),
          json: {}, rateLimit: null, rateLimitRemaining: null,
        }),
    } as unknown as ExcalidrawAutomate;

    const result = await runAgentTurn(ai, settings, history);

    expect(ai.generateAIText).toHaveBeenCalledTimes(2);
    expect(result.reply).toBe("Found the marker-frame semantics.");
  });

  it("automatically shows a complex mutation back to the model before accepting completion", async () => {
    mocks.executeTool.mockResolvedValue({
      tool: "create_elements",
      ok: true,
      summary: "Created 8 elements.",
      changedIds: ["a", "b", "c", "d"],
      visualReviewSuggested: true,
    });
    mocks.captureVisualReview.mockResolvedValue({
      tool: "canvas_bitmap",
      ok: true,
      summary: "POST-MUTATION VISUAL REVIEW",
      imageDataURL: "data:image/png;base64,abc",
    });
    const ea = createEA({
      reply: "Created the diagram.",
      actions: [{ tool: "create_elements", args: { elements: [] } }],
      done: true,
    });
    (ea.generateAIText as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        content: JSON.stringify({
          reply: "Created the diagram.",
          actions: [{ tool: "create_elements", args: { elements: [] } }],
          done: true,
        }),
        json: {}, rateLimit: null, rateLimitRemaining: null,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ reply: "Reviewed the diagram; the layout is clean.", actions: [], done: true }),
        json: {}, rateLimit: null, rateLimitRemaining: null,
      });

    const result = await runAgentTurn(ea, settings, history);

    expect(mocks.captureVisualReview).toHaveBeenCalledWith(ea, ["a", "b", "c", "d"]);
    expect(ea.generateAIText).toHaveBeenCalledTimes(2);
    const secondCall = (ea.generateAIText as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as { messages: { content: unknown }[] };
    expect(secondCall.messages.some((message) => Array.isArray(message.content))).toBe(true);
    expect(result.reply).toBe("Reviewed the diagram; the layout is clean.");
  });

  it("recovers quietly when a reasoning model exhausts a response before emitting JSON", async () => {
    const ea = createEA({ reply: "unused", actions: [], done: true });
    (ea.generateAIText as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        content: "",
        json: {
          choices: [{ message: { content: "" }, finish_reason: "length" }],
          usage: { prompt_tokens: 500, completion_tokens: 4096, total_tokens: 4596, completion_tokens_details: { reasoning_tokens: 4096 } },
        },
        rateLimit: null,
        rateLimitRemaining: null,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ reply: "Done.", actions: [], done: true }),
        json: { choices: [{ finish_reason: "stop" }] },
        rateLimit: null,
        rateLimitRemaining: null,
      });

    const result = await runAgentTurn(ea, settings, history);

    expect(ea.generateAIText).toHaveBeenCalledTimes(2);
    expect((ea.generateAIText as ReturnType<typeof vi.fn>).mock.calls.map((call) => call[0]?.maxTokens)).toEqual([4096, 6144]);
    expect(result.reply).toBe("Done.");
  });

  it("retries malformed protocol without abandoning the intended mutation", async () => {
    mocks.executeTool.mockResolvedValue({
      tool: "update_elements",
      ok: true,
      summary: "Updated 1 element.",
    });
    const ea = createEA({ reply: "unused", actions: [], done: true });
    (ea.generateAIText as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        content: '{"reply":"Fixing overlap","actions":[{"tool":"update_elements","args":{"updates":[{"id":"a","x":120}]}}],"done":true',
        json: { choices: [{ finish_reason: "stop" }] },
        rateLimit: null,
        rateLimitRemaining: null,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({
          reply: "Fixed the overlap.",
          actions: [{ tool: "update_elements", args: { updates: [{ id: "a", x: 120 }] } }],
          done: true,
        }),
        json: { choices: [{ finish_reason: "stop" }] },
        rateLimit: null,
        rateLimitRemaining: null,
      });

    const result = await runAgentTurn(ea, settings, history);

    expect(mocks.executeTool).toHaveBeenCalledWith(
      ea,
      settings,
      expect.objectContaining({ tool: "update_elements" }),
    );
    const retryCall = (ea.generateAIText as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as { messages: { content: unknown }[] };
    const retryMessage = retryCall.messages.at(-1)?.content;
    expect(typeof retryMessage).toBe("string");
    expect(String(retryMessage)).toContain("Preserve mutation actions");
    expect(String(retryMessage)).toContain("update_elements");
    expect(result.reply).toBe("Fixed the overlap.");
  });

  it("does not accept completion while automatic review reports unresolved collisions", async () => {
    mocks.executeTool
      .mockResolvedValueOnce({
        tool: "create_elements",
        ok: true,
        summary: "Created layout.",
        changedIds: ["a", "b", "c", "d"],
        visualReviewSuggested: true,
      })
      .mockResolvedValueOnce({
        tool: "update_elements",
        ok: true,
        summary: "Moved overlapping panels.",
        changedIds: ["a", "b"],
        visualReviewSuggested: true,
      });
    mocks.captureVisualReview
      .mockResolvedValueOnce({
        tool: "canvas_bitmap",
        ok: true,
        summary: "POST-MUTATION VISUAL REVIEW. QUALITY GATE: FAIL",
        imageDataURL: "data:image/png;base64,abc",
        imageDetail: "high",
        qualityIssueCount: 2,
      })
      .mockResolvedValueOnce({
        tool: "canvas_bitmap",
        ok: true,
        summary: "POST-MUTATION VISUAL REVIEW. QUALITY GATE: PASS",
        imageDataURL: "data:image/png;base64,def",
        imageDetail: "high",
        qualityIssueCount: 0,
      });
    const ea = createEA({ reply: "unused", actions: [], done: true });
    (ea.generateAIText as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        content: JSON.stringify({ reply: "Created it.", actions: [{ tool: "create_elements", args: { elements: [] } }], done: true }),
        json: {}, rateLimit: null, rateLimitRemaining: null,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ reply: "Looks good.", actions: [], done: true }),
        json: {}, rateLimit: null, rateLimitRemaining: null,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ reply: "Fixing remaining collisions.", actions: [{ tool: "update_elements", args: { updates: [{ id: "a", x: 10 }, { id: "b", x: 200 }] } }], done: true }),
        json: {}, rateLimit: null, rateLimitRemaining: null,
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ reply: "Layout is clean now.", actions: [], done: true }),
        json: {}, rateLimit: null, rateLimitRemaining: null,
      });

    const result = await runAgentTurn(ea, settings, history);

    expect(ea.generateAIText).toHaveBeenCalledTimes(4);
    const thirdCall = (ea.generateAIText as ReturnType<typeof vi.fn>).mock.calls[2]?.[0] as { messages: { content: unknown }[] };
    expect(thirdCall.messages.some((message) => typeof message.content === "string" && message.content.includes("QUALITY GATE BLOCKED"))).toBe(true);
    expect(mocks.captureVisualReview).toHaveBeenCalledTimes(2);
    expect(result.reply).toBe("Layout is clean now.");
  });

});
