/** OpenAI-only reasoning override carried by the sanitized model snapshot. */
export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

/** Returns routing and reasoning preferences without copying keys or provider URLs. */
export function getTextModelRequest(
  modelId: string,
  config?: { reasoningEffort?: ReasoningEffort } | null,
  profile?: { provider: string } | null,
): { textModelId: string; reasoningEffort?: ReasoningEffort } {
  return {
    textModelId: modelId,
    ...(profile?.provider === "openai" && config?.reasoningEffort
      ? { reasoningEffort: config.reasoningEffort }
      : {}),
  };
}
