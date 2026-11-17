import { describe, expect, it } from "vitest";
import { createTaskHelpers } from "../tasks";
import { createExcaliAITranslator } from "../lang";

const tasks = createTaskHelpers(createExcaliAITranslator("en"));
describe("ExcaliAI task migration", () => {
  it("keeps every shipped task mode, prompt and stable identity", () => {
    const defaults = tasks.createDefaultExcaliAISettings();
    expect(defaults.schemaVersion).toBe(1);
    expect(defaults.config.tasks.map((task) => task.id)).toContain("wireframe-to-code");
    expect(new Set(defaults.config.tasks.map((task) => task.id)).size).toBe(
      defaults.config.tasks.length,
    );
    expect(new Set(defaults.config.tasks.map((task) => task.execution.mode))).toEqual(
      new Set(["text-result", "image-prompt", "image-direct", "image-edit"]),
    );
    const wireframe = defaults.config.tasks.find((task) => task.id === "wireframe-to-code");
    expect(wireframe?.execution.resultType).toBe("html");
    expect(wireframe?.systemPrompt).toContain("single html file");
    expect(defaults.state.selectedTaskId).toBe("wireframe-to-code");
  });
  it("migrates legacy named preferences without losing custom input or false values", () => {
    const { settings } = tasks.loadExcaliAISettings({
      "Agent's Task": "Wireframe to Code",
      "User Prompt": "Keep my prompt",
      "Mask Edit": false,
      "Text Model": "local-text",
      "Image Model": "custom-image",
      "Max Tokens": "12345",
      "Image Size": "1536x1024",
    });
    expect(settings.state).toMatchObject({
      userPrompt: "Keep my prompt",
      maskEdit: false,
      textModel: "local-text",
      imageModel: "custom-image",
      maxTokens: "12345",
      imageSize: "1536x1024",
    });
  });
  it("retains custom tasks and state and is stable on subsequent executions", () => {
    const source = {
      schemaVersion: 1,
      config: {
        tasks: [
          {
            id: "private-task",
            name: "Private task",
            help: "My instructions",
            systemPrompt: "Do not change this",
            outputInstruction: "Only Mermaid",
            execution: {
              mode: "text-result",
              resultType: "mermaid",
              userPrompt: "required",
              imageInput: "disabled",
              maskMode: "disabled",
              requiresApi: "",
            },
          },
        ],
      },
      state: {
        selectedTaskId: "private-task",
        userPrompt: "custom",
        maskEdit: false,
        textModel: "Custom profile",
        imageModel: "Local image",
        maxTokens: "9000",
        imageSize: "1024x1024",
      },
    };
    const first = tasks.loadExcaliAISettings(source);
    expect(first.settings).toEqual(source);
    expect(first.needsSave).toBe(false);
    expect(tasks.loadExcaliAISettings(first.settings)).toEqual(first);
    first.settings.config.tasks[0]!.name = "Changed";
    expect(source.config.tasks[0]!.name).toBe("Private task");
  });
  it("normalizes duplicate IDs and invalid execution choices without inventing mask edits", () => {
    const normalized = tasks.normalizeTaskConfigs([
      { id: "same", name: "A", execution: { mode: "invalid", maskMode: "required" } },
      { id: "same", name: "B", execution: { mode: "image-edit" } },
    ]);
    expect(normalized.map((task) => task.id)).toEqual(["same", "same-2"]);
    expect(normalized[0]!.execution).toMatchObject({ mode: "text-result", maskMode: "disabled" });
    expect(normalized[1]!.execution).toMatchObject({
      mode: "image-edit",
      imageInput: "required",
      maskMode: "optional",
    });
    expect(tasks.normalizeTaskConfigs([], { fallbackToDefaults: true })).toEqual([]);
  });
  it("isolates defaults between executions and falls back to English for incomplete locales", () => {
    const first = tasks.createDefaultExcaliAISettings(),
      second = tasks.createDefaultExcaliAISettings();
    first.config.tasks[0]!.name = "Changed";
    expect(second.config.tasks[0]!.name).not.toBe("Changed");
    const translated = createTaskHelpers(createExcaliAITranslator("zz-ZZ"));
    expect(translated.createDefaultExcaliAISettings()).toEqual(second);
  });
});
