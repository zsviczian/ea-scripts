import { expect, it } from "vitest";
import { getTextModelRequest } from "../requests";

it("inherits OpenAI reasoning effort without copying any credentials", () => {
  const profile = { provider: "openai", apiKey: "must-not-leak", apiKeySecret: "shared-secret" };
  expect(getTextModelRequest("My visual model", { reasoningEffort: "low" }, profile)).toEqual({
    textModelId: "My visual model",
    reasoningEffort: "low",
  });
});
it("leaves API defaults unset and never forwards OpenAI-only fields to other providers", () => {
  expect(getTextModelRequest("default", {}, { provider: "openai" })).toEqual({
    textModelId: "default",
  });
  for (const provider of ["anthropic", "google", "xai", "openai-compatible"])
    expect(getTextModelRequest("custom", { reasoningEffort: "high" }, { provider })).toEqual({
      textModelId: "custom",
    });
});
