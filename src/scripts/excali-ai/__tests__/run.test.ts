import { expect, it, vi } from "vitest";
import { runExcaliAI } from "../run.js";

it("cancels without touching settings or providers when no drawing is open", async () => {
  const notice = vi.fn();
  const fake = {
    targetView: null,
    obsidian: {
      Notice: class {
        constructor(message: string) {
          notice(message);
        }
      },
      moment: { locale: () => "en" },
    },
  };
  await runExcaliAI(fake as unknown as ExcalidrawAutomate, {} as ScriptUtils);
  expect(notice).toHaveBeenCalledWith("Open an Excalidraw drawing first.");
});
it.each(["en", "de", "es", "fr", "ru", "zh-cn"])(
  "rejects an old plugin before reading settings or exporting the selection (%s)",
  async (locale) => {
    const notice = vi.fn(),
      settings = vi.fn(),
      verifyMinimumPluginVersion = vi.fn(() => false);
    const fake = {
      targetView: { app: {}, containerEl: { ownerDocument: {} } },
      getExcalidrawAPI: () => ({}),
      verifyMinimumPluginVersion,
      getScriptSettings: settings,
      obsidian: {
        Notice: class {
          constructor(message: string) {
            notice(message);
          }
        },
        moment: { locale: () => locale },
      },
    };
    await runExcaliAI(fake as unknown as ExcalidrawAutomate, {} as ScriptUtils);
    expect(verifyMinimumPluginVersion).toHaveBeenCalledWith("2.29.3");
    expect(settings).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(expect.stringContaining("2.29.3"));
  },
);
it("reports disabled AI without calling any generation API", async () => {
  const notice = vi.fn(),
    generate = vi.fn();
  const fake = {
    targetView: { app: {}, containerEl: { ownerDocument: {} } },
    getExcalidrawAPI: () => ({}),
    verifyMinimumPluginVersion: () => true,
    getScriptSettings: () => ({}),
    setScriptSettings: vi.fn(),
    getAISettings: () => ({ enabled: false }),
    generateAIText: generate,
    obsidian: {
      Notice: class {
        constructor(message: string) {
          notice(message);
        }
      },
      moment: { locale: () => "en" },
    },
  };
  await runExcaliAI(fake as unknown as ExcalidrawAutomate, {} as ScriptUtils);
  expect(generate).not.toHaveBeenCalled();
  expect(notice).toHaveBeenCalledWith(expect.stringContaining("disabled"));
});
