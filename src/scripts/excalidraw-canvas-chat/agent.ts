/**
 * @file agent.ts
 * @overview Bounded tool-using AI loop for Excalidraw Canvas Chat.
 */

import type { AIRequestMessage } from "../../../.template/types/support/types/AIUtilTypes";
import { buildMessages, compactHistory, estimateMessageTokens, parseAgentEnvelope } from "./agentProtocol";
import { summarizeCurrentContext } from "./context";
import { debugError, debugLog } from "./debug";
import { captureVisualReview, executeTool } from "./tools";
import type { AgentEnvelope, AgentRunResult, CanvasChatSettings, ChatMessage, ToolResult } from "./types";

const MAX_TOOL_ROUNDS = 8;
const MAX_TOOL_RESULT_CHARS = 12000;
const RETRY_MIN_RESPONSE_TOKENS = 4096;

const OBSERVATION_TOOLS = new Set([
  "inspect_scene",
  "inspect_layout",
  "inspect_elements",
  "canvas_bitmap",
  "read_active_note",
  "search_vault",
  "read_file",
  "lookup_ea_docs",
  "read_ea_doc",
  "find_ea_capabilities",
  "execute_ea_script",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function resolveTextModel(ea: ExcalidrawAutomate, settings: CanvasChatSettings, needsVision: boolean): string {
  const ai = ea.getAISettings();
  if (!ai) return "";
  const ready = Object.keys(ai.textModels).filter((id) => ai.providerProfiles[ai.textModels[id]?.providerId ?? ""]?.hasApiKey);
  const readyVision = ready.filter((id) => ai.textModels[id]?.multimodalSupport);
  if (settings.textModelId !== "auto") {
    if (!needsVision || ai.textModels[settings.textModelId]?.multimodalSupport) return settings.textModelId;
    if (readyVision.includes(ai.defaultMultimodalTextModel)) return ai.defaultMultimodalTextModel;
    return readyVision[0] ?? settings.textModelId;
  }
  if (needsVision) {
    if (readyVision.includes(ai.defaultMultimodalTextModel)) return ai.defaultMultimodalTextModel;
    return readyVision[0] ?? "";
  }
  if (ready.includes(ai.defaultTextModel)) return ai.defaultTextModel;
  if (ready.includes(ai.defaultMultimodalTextModel)) return ai.defaultMultimodalTextModel;
  return ready[0] ?? "";
}

function hasReadyVisionModel(ea: ExcalidrawAutomate): boolean {
  const ai = ea.getAISettings();
  if (!ai) return false;
  return Object.keys(ai.textModels).some((id) => {
    const model = ai.textModels[id];
    return Boolean(model?.multimodalSupport && ai.providerProfiles[model.providerId]?.hasApiKey);
  });
}

function minimumResponseTokensForModel(textModelId: string): number {
  const lower = textModelId.toLowerCase();
  if (/^(?:gpt-5|o3|o4)/.test(lower) || lower.includes("reasoning")) return 4096;
  return 0;
}

function effectiveResponseTokens(textModelId: string, requested: number, retry: boolean): number {
  const modelMinimum = minimumResponseTokensForModel(textModelId);
  const base = Math.max(requested, modelMinimum);
  const retryMinimum = retry ? Math.max(RETRY_MIN_RESPONSE_TOKENS, Math.ceil(base * 1.5)) : 0;
  return Math.min(8000, Math.max(base, retryMinimum));
}

function providerFinishReason(json: Record<string, unknown>): string {
  if (Array.isArray(json.choices)) {
    const first = json.choices[0];
    if (isRecord(first) && typeof first.finish_reason === "string") return first.finish_reason;
  }
  if (Array.isArray(json.candidates)) {
    const first = json.candidates[0];
    if (isRecord(first) && typeof first.finishReason === "string") return first.finishReason;
  }
  if (typeof json.stop_reason === "string") return json.stop_reason;
  return "";
}

function providerUsageSummary(json: Record<string, unknown>): Record<string, unknown> | undefined {
  if (isRecord(json.usage)) {
    const usage = json.usage;
    const completionDetails = isRecord(usage.completion_tokens_details) ? usage.completion_tokens_details : undefined;
    return {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      reasoningTokens: completionDetails?.reasoning_tokens,
      totalTokens: usage.total_tokens,
    };
  }
  if (isRecord(json.usageMetadata)) return json.usageMetadata;
  return undefined;
}

function toolResultMessage(result: ToolResult): AIRequestMessage {
  const text = `TOOL RESULT ${result.tool} ${result.ok ? "OK" : "ERROR"}\n${result.summary.slice(0, MAX_TOOL_RESULT_CHARS)}`;
  if (!result.imageDataURL) return { role: "user", content: text };
  return {
    role: "user",
    content: [
      { type: "text", text },
      { type: "image", image: { dataURL: result.imageDataURL, detail: result.imageDetail ?? "low" } },
    ],
  };
}

function hasImageMessage(messages: AIRequestMessage[]): boolean {
  return messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === "image"));
}

function debugMessageView(messages: AIRequestMessage[]): unknown[] {
  return messages.map((message) => ({
    role: message.role,
    content: typeof message.content === "string"
      ? message.content
      : message.content.map((part) => {
          if (part.type !== "image") return part;
          const image = typeof part.image === "string" ? part.image : "dataURL" in part.image ? part.image.dataURL : part.image.url;
          return { type: "image", image: `[image ${image.length} chars]` };
        }),
  }));
}

function textFromParts(value: unknown): string {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value.map((part) => {
    if (typeof part === "string") return part;
    if (!isRecord(part)) return "";
    if (typeof part.text === "string") return part.text;
    if (typeof part.content === "string") return part.content;
    return "";
  }).filter(Boolean).join("\n");
}

/** Recovers provider text from the normalized raw payload if the convenience content field is unexpectedly empty. */
function recoverProviderText(json: Record<string, unknown>): string {
  if (typeof json.output_text === "string" && json.output_text.trim()) return json.output_text;

  const direct = textFromParts(json.content);
  if (direct.trim()) return direct;

  if (Array.isArray(json.choices)) {
    const first = json.choices[0];
    if (isRecord(first) && isRecord(first.message)) {
      const text = textFromParts(first.message.content);
      if (text.trim()) return text;
    }
  }

  if (Array.isArray(json.candidates)) {
    const first = json.candidates[0];
    if (isRecord(first) && isRecord(first.content)) {
      const text = textFromParts(first.content.parts);
      if (text.trim()) return text;
    }
  }

  if (Array.isArray(json.output)) {
    for (const item of json.output) {
      if (!isRecord(item)) continue;
      const text = textFromParts(item.content);
      if (text.trim()) return text;
    }
  }
  return "";
}

function resultContent(result: Awaited<ReturnType<ExcalidrawAutomate["generateAIText"]>>): string {
  if (result.content.trim()) return result.content;
  return recoverProviderText(result.json);
}

async function requestEnvelope(
  ea: ExcalidrawAutomate,
  settings: CanvasChatSettings,
  messages: AIRequestMessage[],
  textModelId: string,
  round: number,
): Promise<AgentEnvelope> {
  let lastError: unknown = null;
  let lastInvalidContent = "";
  let lastFailureReason = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const retryInstruction = lastInvalidContent
      ? `PROTOCOL REPAIR: Your previous response was invalid JSON, but it contained intended work. Re-emit the SAME semantic reply and actions as one valid JSON envelope. Preserve mutation actions; do not abandon them or replace them with a completion-only response. No prose or code fence. Parse error: ${lastFailureReason}. Previous response:
${lastInvalidContent.slice(0, 6000)}`
      : `PROTOCOL RETRY: Return exactly one complete JSON object matching the required envelope. Complete the same intended next step; do not skip required actions merely because the previous response exhausted its token budget. No prose or code fence. Keep it compact. ${lastFailureReason}`;
    const requestMessages = attempt === 0
      ? messages
      : [
          ...messages,
          {
            role: "user" as const,
            content: retryInstruction,
          },
        ];
    const maxTokens = effectiveResponseTokens(textModelId, settings.maxResponseTokens, attempt > 0);
    const started = Date.now();

    debugLog(settings.debugLogging, `round ${round + 1} request${attempt ? " retry" : ""}`, {
      textModelId,
      requestedMaxTokens: settings.maxResponseTokens,
      effectiveMaxTokens: maxTokens,
      estimatedContextTokens: estimateMessageTokens(requestMessages),
      messageCount: requestMessages.length,
      messages: debugMessageView(requestMessages),
    });

    const result = await ea.generateAIText({
      textModelId,
      messages: requestMessages,
      maxTokens,
    });
    const content = resultContent(result);
    const finishReason = providerFinishReason(result.json);
    debugLog(settings.debugLogging, `round ${round + 1} response${attempt ? " retry" : ""}`, {
      latencyMs: Date.now() - started,
      finishReason,
      usage: providerUsageSummary(result.json),
      content,
      normalizedContent: result.content,
      raw: result.json,
      rateLimit: result.rateLimit,
      rateLimitRemaining: result.rateLimitRemaining,
    });

    if (!content.trim() && finishReason.toLowerCase() === "length" && attempt === 0) {
      lastError = new Error("AI exhausted its response budget before producing protocol JSON.");
      lastFailureReason = "The previous response exhausted its response budget before emitting protocol JSON.";
      lastInvalidContent = content;
      debugLog(settings.debugLogging, `round ${round + 1} response budget exhausted; retrying`, {
        finishReason,
        effectiveMaxTokens: maxTokens,
        usage: providerUsageSummary(result.json),
      });
      continue;
    }

    try {
      const envelope = parseAgentEnvelope(content);
      debugLog(settings.debugLogging, `round ${round + 1} parsed envelope`, envelope);
      return envelope;
    } catch (error) {
      lastError = error;
      lastInvalidContent = content;
      lastFailureReason = error instanceof Error ? error.message : String(error);
      if (attempt === 0) {
        debugLog(settings.debugLogging, `round ${round + 1} protocol parse failed; retrying`, {
          error: error instanceof Error ? error.message : String(error),
          finishReason,
          content,
        });
      } else {
        debugError(settings.debugLogging, `round ${round + 1} protocol parse failed after retry`, error, {
          content,
          raw: result.json,
        });
      }
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`${detail} Canvas Chat retried the model with a larger response budget. Enable Debug logging in Canvas Chat settings to inspect the raw response.`);
}

/** Runs one user turn, allowing the model to inspect and mutate state over a few compact tool rounds. */
export async function runAgentTurn(
  ea: ExcalidrawAutomate,
  settings: CanvasChatSettings,
  history: ChatMessage[],
  onProgress?: (message: string) => void,
): Promise<AgentRunResult> {
  const aiSettings = ea.getAISettings();
  if (!aiSettings?.enabled) throw new Error("Excalidraw AI is disabled. Enable and configure it in Excalidraw settings first.");
  const context = summarizeCurrentContext(ea).text;
  const toolMessages: AIRequestMessage[] = [];
  let lastReply = "";
  let estimatedContextTokens = 0;
  let pendingQualityIssues = 0;
  let qualityGateReminders = 0;
  const turnStarted = Date.now();
  const turnId = `${turnStarted.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  debugLog(settings.debugLogging, "turn started", {
    turnId,
    context,
    historyMessages: history.length,
    historyMessagesSent: compactHistory(history).length,
    historyMessagesDropped: Math.max(0, history.length - compactHistory(history).length),
    settings: {
      textModelId: settings.textModelId,
      imageModelId: settings.imageModelId,
      maxResponseTokens: settings.maxResponseTokens,
    },
  });

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const messages = buildMessages(history, context, toolMessages);
      estimatedContextTokens = estimateMessageTokens(messages);
      const textModelId = resolveTextModel(ea, settings, hasImageMessage(messages));
      if (!textModelId) throw new Error("No Excalidraw AI text model is configured.");
      onProgress?.(round === 0 ? "Thinking about the canvas…" : "Working with the canvas…");
      const envelope = await requestEnvelope(ea, settings, messages, textModelId, round);
      lastReply = envelope.reply || lastReply;
      if (envelope.actions.length === 0) {
        if (pendingQualityIssues > 0 && qualityGateReminders < 2) {
          qualityGateReminders += 1;
          const gateMessage = `QUALITY GATE BLOCKED: ${pendingQualityIssues} unresolved layout collision${pendingQualityIssues === 1 ? " remains" : "s remain"}. Inspect the latest review, fix those collisions with tools, then review again. Do not claim completion yet.`;
          toolMessages.push({ role: "user", content: gateMessage });
          debugLog(settings.debugLogging, "quality gate prevented completion", { pendingQualityIssues, qualityGateReminders });
          continue;
        }
        const reply = lastReply || "Done.";
        debugLog(settings.debugLogging, "turn completed", { turnId, reply, estimatedContextTokens, pendingQualityIssues, durationMs: Date.now() - turnStarted });
        return { reply, estimatedContextTokens };
      }

      let toolFailed = false;
      let needsFollowup = false;
      for (const action of envelope.actions) {
        needsFollowup ||= OBSERVATION_TOOLS.has(action.tool);
        onProgress?.(`Using ${action.tool.replaceAll("_", " ")}…`);
        debugLog(settings.debugLogging, `tool ${action.tool} call`, action.args);
        const toolStarted = Date.now();
        const toolResult = await executeTool(ea, settings, action);
        toolFailed ||= !toolResult.ok;
        debugLog(settings.debugLogging, `tool ${action.tool} result`, {
          durationMs: Date.now() - toolStarted,
          ok: toolResult.ok,
          summary: toolResult.summary,
          changedIds: toolResult.changedIds,
          visualReviewSuggested: toolResult.visualReviewSuggested,
          imageDataURL: toolResult.imageDataURL ? `[data URL ${toolResult.imageDataURL.length} chars]` : undefined,
        });
        toolMessages.push(toolResultMessage(toolResult));

        if (toolResult.ok && toolResult.visualReviewSuggested && (toolResult.changedIds?.length ?? 0) > 0) {
          onProgress?.("Working with the canvas…");
          const reviewStarted = Date.now();
          const review = hasReadyVisionModel(ea)
            ? await captureVisualReview(ea, toolResult.changedIds ?? [])
            : await executeTool(ea, settings, {
                tool: "inspect_layout",
                args: { scope: "ids", ids: toolResult.changedIds ?? [], maxElements: 80 },
              });
          if (typeof review.qualityIssueCount === "number") pendingQualityIssues = review.qualityIssueCount;
          else {
            try {
              const parsed = JSON.parse(review.summary) as { collisions?: unknown[] };
              if (Array.isArray(parsed.collisions)) pendingQualityIssues = parsed.collisions.length;
            } catch {
              // Non-layout tool results do not carry a quality gate.
            }
          }
          if (pendingQualityIssues === 0) qualityGateReminders = 0;
          debugLog(settings.debugLogging, hasReadyVisionModel(ea) ? "automatic visual review" : "automatic layout review (no vision model)", {
            durationMs: Date.now() - reviewStarted,
            ok: review.ok,
            qualityIssueCount: pendingQualityIssues,
            summary: review.summary,
            imageDataURL: review.imageDataURL ? `[data URL ${review.imageDataURL.length} chars]` : undefined,
          });
          toolMessages.push(toolResultMessage(review));
          needsFollowup = true;
        }
      }

      // A model may mark a response done while also returning actions. The actions must
      // still run. Only accept the claimed completion after every action succeeded.
      if (envelope.done && !toolFailed && !needsFollowup) {
        const reply = lastReply || "Done.";
        debugLog(settings.debugLogging, "turn completed after tools", { turnId, reply, estimatedContextTokens, durationMs: Date.now() - turnStarted });
        return { reply, estimatedContextTokens };
      }
    }
    const reply = lastReply || "I reached the tool-round limit. The canvas changes already completed are saved; send a follow-up to continue.";
    debugLog(settings.debugLogging, "turn stopped at tool-round limit", { turnId, reply, estimatedContextTokens, durationMs: Date.now() - turnStarted });
    return { reply, estimatedContextTokens };
  } catch (error) {
    debugError(settings.debugLogging, "turn failed", error, { turnId, durationMs: Date.now() - turnStarted, context, toolMessages });
    throw error;
  }
}
