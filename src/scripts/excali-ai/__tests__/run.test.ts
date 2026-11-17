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
it("rejects an old plugin before reading settings or exporting the selection", async () => {
  const notice = vi.fn(),
    settings = vi.fn();
  const fake = {
    targetView: { app: {}, containerEl: { ownerDocument: {} } },
    getExcalidrawAPI: () => ({}),
    verifyMinimumPluginVersion: () => false,
    getScriptSettings: settings,
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
  expect(settings).not.toHaveBeenCalled();
  expect(notice).toHaveBeenCalledWith(expect.stringContaining("2.29.2"));
});
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
