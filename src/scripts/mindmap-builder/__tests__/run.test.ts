import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMindmapTranslator } from "../lang";
import { runMindmapBuilder } from "../run";
import { initializeMindmapBuilder } from "../runtime.js";

vi.mock("../runtime.js", () => ({ initializeMindmapBuilder: vi.fn() }));

/** Minimal launcher boundary; the full implementation is validated in Obsidian. */
function createEA(): ExcalidrawAutomate {
  return {
    obsidian: { Notice: vi.fn() },
    DEVICE: { isMacOS: false, isIOS: false },
    verifyMinimumPluginVersion: vi.fn(() => true),
    skipSidepanelScriptRestore: vi.fn(),
    checkForActiveSidepanelTabForScript: vi.fn(() => null),
    setView: vi.fn(),
    targetView: null,
  } as unknown as ExcalidrawAutomate;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("localStorage", { getItem: () => "en" });
});

it("rejects an older plugin before registering or initializing anything", async () => {
  const ea = createEA();
  vi.mocked(ea.verifyMinimumPluginVersion).mockReturnValue(false);
  await runMindmapBuilder(ea, {} as ScriptUtils, "test");
  expect(ea.obsidian.Notice).toHaveBeenCalledWith(
    "Please update the Excalidraw plugin to version 2.23.4 or higher.",
  );
  expect(ea.skipSidepanelScriptRestore).not.toHaveBeenCalled();
  expect(initializeMindmapBuilder).not.toHaveBeenCalled();
});

it("rebinds the resident host on repeated activation without initializing the runtime", async () => {
  const ea = createEA();
  const hostEA = createEA();
  const existingTab = { getHostEA: () => hostEA, open: vi.fn() };
  vi.mocked(ea.checkForActiveSidepanelTabForScript).mockReturnValue(
    existingTab as unknown as ReturnType<ExcalidrawAutomate["checkForActiveSidepanelTabForScript"]>,
  );
  await runMindmapBuilder(ea, {} as ScriptUtils, "test");
  expect(ea.skipSidepanelScriptRestore).toHaveBeenCalledOnce();
  expect(hostEA.setView).toHaveBeenCalledWith(ea.targetView);
  expect(hostEA).toHaveProperty("activateMindmap", true);
  expect(existingTab.open).toHaveBeenCalledWith(false);
  expect(initializeMindmapBuilder).not.toHaveBeenCalled();
});

it.each(["missing", "same-host", "orphan"])(
  "initializes a fresh runtime for a %s tab rather than assuming it can be reused",
  async (mode) => {
    const ea = createEA();
    const scriptUtils = {} as ScriptUtils;
    if (mode !== "missing") {
      vi.mocked(ea.checkForActiveSidepanelTabForScript).mockReturnValue({
        getHostEA: () => (mode === "same-host" ? ea : null),
      } as ReturnType<ExcalidrawAutomate["checkForActiveSidepanelTabForScript"]>);
    }
    await runMindmapBuilder(ea, scriptUtils, "test");
    expect(initializeMindmapBuilder).toHaveBeenCalledWith(
      ea,
      scriptUtils,
      "test",
      expect.any(Function),
    );
  },
);

it("waits for sidepanel initialization and propagates a rejected launch", async () => {
  const ea = createEA();
  vi.mocked(initializeMindmapBuilder).mockRejectedValueOnce(new Error("panel failed"));
  await expect(runMindmapBuilder(ea, {} as ScriptUtils, "test")).rejects.toThrow("panel failed");
});

describe("Mindmap Builder localization", () => {
  it("preserves Chinese aliases and traditional Chinese independently", () => {
    expect(createMindmapTranslator("zh")("NOTICE_SELECT_NODE_TO_COPY")).toBe(
      "请选择要复制的节点。",
    );
    expect(createMindmapTranslator("zh-CN")("NOTICE_SELECT_NODE_TO_COPY")).toBe(
      "请选择要复制的节点。",
    );
    expect(createMindmapTranslator("zh-tw")("NOTICE_SELECT_NODE_TO_COPY")).toBe(
      "請選擇要複製的節點。",
    );
  });

  it.each(["de", "es", "fr", "ru", "unknown"])("falls back to English for %s", (locale) => {
    expect(createMindmapTranslator(locale)("NOTICE_SELECT_NODE_TO_COPY")).toBe(
      "Select a node to copy.",
    );
  });

  it("interpolates named values literally", () => {
    expect(createMindmapTranslator("en")("NOTICE_CONFLICT_WITH_ACTION", { action: "$&" })).toBe(
      'Conflict with "$&"',
    );
  });

  it("uses the current invocation's device modifier without runtime globals in catalogs", () => {
    expect(createMindmapTranslator("en", true)("TITLE_ADD_SIBLING")).toBe(
      "Add sibling with OPT+Enter",
    );
    expect(createMindmapTranslator("en", false)("TITLE_ADD_SIBLING")).toBe(
      "Add sibling with ALT+Enter",
    );
  });
});
