import { expect, it, vi } from "vitest";
import { createSettings, resolvePresetName } from "../settings.js";

interface PresetContext {
  [key: string]: unknown;
  mapPresets: Record<string, Record<string, unknown>>;
  activePresetName: string;
  currentModalGrowthMode: string;
  dirty: boolean;
  presetDropdown: {
    selectEl: { innerHTML: string };
    addOption: ReturnType<typeof vi.fn>;
    setValue: ReturnType<typeof vi.fn>;
  };
  ea: {
    getScriptSettings: () => Record<string, { value: unknown; hidden?: boolean }>;
    getScriptSettingValue: (key: string, fallback: { value: unknown }) => { value: unknown };
    setScriptSettingValue: ReturnType<typeof vi.fn>;
    saveScriptSettings: ReturnType<typeof vi.fn>;
    getViewElements: () => { id: string; customData: Record<string, unknown> }[];
    copyViewElementsToEAforEditing: ReturnType<typeof vi.fn>;
    addAppendUpdateCustomData: ReturnType<typeof vi.fn>;
  };
}

/** Models stale global settings loaded beside saved presets after a restart. */
function host(activePresetName = "Default"): {
  ctx: PresetContext;
  settings: ReturnType<typeof createSettings>;
  root: { id: string; customData: Record<string, unknown> };
} {
  const stored: Record<string, { value: unknown; hidden?: boolean }> = {};
  const root = { id: "root", customData: { keep: "scene metadata" } as Record<string, unknown> };
  const ctx: PresetContext = {
    mapPresets: {
      Default: { growthMode: "Down-facing", boxChildren: true, layoutSettings: { GAP_X: 80 } },
      Radial: {
        growthMode: "Radial",
        customPalette: { enabled: true, random: false, colors: ["#ff0000"] },
      },
    },
    activePresetName,
    currentModalGrowthMode: "Right-Left",
    dirty: false,
    LAYOUT_DEFAULTS: { GAP_X: 120, GAP_Y: 25 },
    K_PRESETS: "Map Presets",
    K_ACTIVE_PRESET: "Active Preset",
    K_GROWTH: "Growth Mode",
    ea: {
      getScriptSettings: () => stored,
      getScriptSettingValue: (key, fallback) => stored[key] ?? fallback,
      setScriptSettingValue: vi.fn((key: string, value: { value: unknown }) => {
        stored[key] = value;
      }),
      saveScriptSettings: vi.fn(),
      getViewElements: () => [root],
      copyViewElementsToEAforEditing: vi.fn(),
      addAppendUpdateCustomData: vi.fn((_id: string, data: object) =>
        Object.assign(root.customData, data),
      ),
    },
    getMindmapNodeFromSelection: () => root,
    getSettingsRootNode: () => root,
    getHierarchy: () => ({ rootId: root.id }),
    addElementsToView: vi.fn(),
    refreshMapLayout: vi.fn(),
    updateUI: vi.fn(),
    presetDropdown: { selectEl: { innerHTML: "" }, addOption: vi.fn(), setValue: vi.fn() },
  };
  // Only the key identities matter to the fake EA; all values are stored independently.
  for (const key of [
    "K_ARROW_TYPE",
    "K_FONTSIZE",
    "K_MULTICOLOR",
    "K_BOX",
    "K_ROUND",
    "K_WIDTH",
    "K_ARROWSTROKE",
    "K_CENTERTEXT",
    "K_FILL_SWEEP",
    "K_BRANCH_SCALE",
    "K_BASE_WIDTH",
    "K_PALETTE",
    "K_LAYOUT",
  ])
    ctx[key] = key;
  return { ctx, settings: createSettings(ctx), root };
}

it("restores Default before a new root can capture stale global growth settings", () => {
  const { ctx, settings } = host();
  settings.initializePresets();
  expect(ctx.activePresetName).toBe("Default");
  expect(ctx.currentModalGrowthMode).toBe("Down-facing");
  expect(ctx.boxChildren).toBe(true);
  expect(ctx.layoutSettings).toEqual({ GAP_X: 80, GAP_Y: 25 });
  settings.refreshPresetDropdown();
  expect(ctx.presetDropdown.setValue).toHaveBeenLastCalledWith("Default");
  expect(ctx.ea.addAppendUpdateCustomData).not.toHaveBeenCalled();
});

it("restores a saved named preset when it still exists", () => {
  const { ctx, settings } = host("Radial");
  settings.initializePresets();
  expect(ctx.currentModalGrowthMode).toBe("Radial");
  expect(ctx.activePresetName).toBe("Radial");
});

it.each(["", "Deleted preset", "toString"])(
  "falls back from an invalid saved preset name: %s",
  async (name) => {
    const { ctx, settings } = host(name);
    settings.initializePresets();
    expect(ctx.activePresetName).toBe("Default");
    expect(ctx.currentModalGrowthMode).toBe("Down-facing");
    expect(ctx.ea.getScriptSettings()["Active Preset"]?.value).toBe("Default");
    await settings.saveSettings();
    expect(ctx.ea.saveScriptSettings).toHaveBeenCalledOnce();
  },
);

it("seeds Default from existing user settings without discarding named presets", () => {
  const { ctx, settings } = host();
  delete ctx.mapPresets.Default;
  settings.initializePresets();
  expect(ctx.mapPresets).toHaveProperty("Default.growthMode", "Right-Left");
  expect(ctx.mapPresets.Radial).toBeDefined();
  expect(ctx.dirty).toBe(true);
});

it("applies a different preset on the first attempt, including its palette", async () => {
  const { ctx, settings, root } = host();
  settings.initializePresets();
  root.customData = {
    ...settings.extractConfigFromGlobals(),
    presetName: "Default",
    keep: "scene metadata",
  };
  await settings.applyPresetToMap("Radial", root);
  expect(root.customData.growthMode).toBe("Radial");
  expect(root.customData.presetName).toBe("Radial");
  expect(root.customData.customPalette).toEqual(ctx.mapPresets.Radial?.customPalette);
  expect(root.customData.keep).toBe("scene metadata");
  expect(settings.diffMapConfig(ctx.mapPresets.Radial!, root.customData)).toBe(false);
});

it("resolves missing or removed map references for display without rewriting the drawing", () => {
  const { ctx } = host();
  expect(resolvePresetName(ctx.mapPresets, undefined)).toBe("Default");
  expect(resolvePresetName(ctx.mapPresets, "Removed")).toBe("Default");
  expect(resolvePresetName(ctx.mapPresets, "Radial")).toBe("Radial");
});
