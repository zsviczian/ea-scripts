import { afterEach, expect, it, vi } from "vitest";
import { initializeMindmapBuilder } from "../runtime.js";
import { createMindmapTranslator } from "../lang";
import { FixtureEA, lib } from "./textContainerFixture";

interface StartupContext {
  activePresetName: string;
  currentModalGrowthMode: string;
  addNode: (...args: unknown[]) => Promise<ExcalidrawElement>;
  importTextToMap: (text: string) => Promise<void>;
  saveSettings: () => Promise<void>;
  updateUI: () => void;
  applyPresetToMap: (name: string, selected: object) => Promise<void>;
  selectNodeInView: (selected: object) => void;
  presetDropdown: { setValue: ReturnType<typeof vi.fn> };
  presetWarningEl: { style: { display: string } };
}
const { openPanel } = vi.hoisted(() => ({
  openPanel: vi.fn<(context: StartupContext) => Promise<void>>(),
}));
// Exercise real runtime initialization and node/import/UI code, stopping at the DOM and layout boundaries.
vi.mock("../sidepanelLifecycle.js", () => ({ openMindmapSidepanel: openPanel }));
vi.mock("../layout.js", () => ({
  createLayout: () => ({ triggerGlobalLayout: vi.fn(), refreshMapLayout: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  openPanel.mockClear();
});

/** Starts a fresh invocation with saved Default settings that disagree with stale globals. */
async function startup(): Promise<{
  ea: FixtureEA;
  context: StartupContext;
  save: ReturnType<typeof vi.fn>;
}> {
  vi.stubGlobal("window", {});
  vi.stubGlobal("app", { keymap: {} });
  vi.stubGlobal("ExcalidrawLib", lib);
  vi.stubGlobal("sleep", vi.fn());
  vi.spyOn(console, "log").mockImplementation(() => {});
  const stored: Record<string, { value: unknown }> = {
    "Map Presets": {
      value: { Default: { growthMode: "Down-facing", boxChildren: true, multicolor: false } },
    },
    "Growth Mode": { value: "Right-Left" },
    "Active Preset": { value: "Deleted preset" },
  };
  const save = vi.fn();
  const scene = new FixtureEA();
  let selected: string[] = [];
  const api = {
    onChange: () => vi.fn(),
    getSceneElementsIncludingDeleted: scene.getElements,
    getAppState: () => ({
      viewBackgroundColor: "#ffffff",
      currentItemFontFamily: 1,
      currentItemStrokeColor: "#000000",
    }),
  };
  const ea = Object.assign(scene, {
    obsidian: {
      Notice: class {
        setMessage = vi.fn();
        setAutoHide = vi.fn();
      },
    },
    DEVICE: {},
    FloatingModal: class {},
    targetView: { _loaded: true, file: { path: "test.md" } },
    getExcalidrawAPI: () => api,
    getScriptSettings: () => stored,
    getScriptSettingValue: (key: string, fallback: { value: unknown }) => stored[key] ?? fallback,
    setScriptSettingValue: (key: string, value: { value: unknown }) => {
      stored[key] = value;
    },
    saveScriptSettings: save,
    registerCleanup: vi.fn(),
    clear: vi.fn(),
    addElementsToView: vi.fn(),
    copyViewElementsToEAforEditing: vi.fn(),
    parseText: async (text: string) => text,
    getViewSelectedElements: () => scene.getElements().filter((el) => selected.includes(el.id)),
    selectElementsInView: (ids: string[]) => {
      selected = ids;
    },
  });
  await initializeMindmapBuilder(
    ea as unknown as ExcalidrawAutomate,
    {} as ScriptUtils,
    "test",
    createMindmapTranslator("en"),
  );
  return { ea: scene, context: openPanel.mock.calls.at(-1)![0], save };
}

it.each(["manual", "paste"])(
  "uses saved Default on the first %s map after restart",
  async (action) => {
    const { ea, context, save } = await startup();
    expect(context.currentModalGrowthMode).toBe("Down-facing");
    expect(context.activePresetName).toBe("Default");
    if (action === "manual") await context.addNode("Root", true, true, [], null);
    else await context.importTextToMap("mindmap\n  Root\n    Child");
    const root = ea.getElements().find((el) => el.customData.growthMode);
    expect(root?.customData.growthMode).toBe("Down-facing");
    expect(root?.customData.presetName).toBe("Default");
    context.presetDropdown = { setValue: vi.fn() };
    context.presetWarningEl = { style: { display: "" } };
    context.updateUI();
    expect(context.presetDropdown.setValue).toHaveBeenLastCalledWith("Default");
    expect(context.presetWarningEl.style.display).toBe("none");
    await context.saveSettings();
    expect(save).toHaveBeenCalledOnce();
  },
);

it("keeps the dropdown selected and hides the mismatch warning on the first preset change", async () => {
  const { ea, context } = await startup();
  const root = await context.addNode("Root", true, true, [], null);
  context.selectNodeInView(root);
  context.presetDropdown = { setValue: vi.fn() };
  context.presetWarningEl = { style: { display: "" } };
  // Reapply Default to a modified map with an old per-map palette, on the first selection.
  Object.assign(ea.getElement(root.id).customData, {
    growthMode: "Right-Left",
    customPalette: { enabled: true, random: false, colors: ["#ff0000"] },
  });
  await context.applyPresetToMap("Default", root);
  expect(ea.getElement(root.id).customData.growthMode).toBe("Down-facing");
  expect(context.presetDropdown.setValue).toHaveBeenLastCalledWith("Default");
  expect(context.presetWarningEl.style.display).toBe("none");
});
