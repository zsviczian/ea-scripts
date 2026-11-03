import { afterEach, expect, it, vi } from "vitest";
import { openMindmapSidepanel } from "../sidepanelLifecycle.js";

afterEach(() => vi.unstubAllGlobals());

it("does not hide floating controls a second time when the embedded Markdown leaf activates", async () => {
  const containerEl = { matches: () => true };
  const view = { ownerWindow: { addEventListener: vi.fn() }, getViewType: () => "excalidraw" };
  const leaf = { view: { containerEl, getViewType: () => "markdown" } };
  let leafChanged = (_leaf: typeof leaf): void => {};
  const workspace = {
    activeLeaf: leaf,
    on: (_event: string, callback: typeof leafChanged) => {
      leafChanged = callback;
    },
  };
  const tab = { open: vi.fn() };
  const context = {
    isUndocked: true,
    floatingInputModal: { modalEl: { style: { display: "" } } },
    isExcaliBrainView: () => false,
    registerStyles: vi.fn(),
    updateKeyHandlerLocation: vi.fn(),
    registerObsidianHotkeyOverrides: vi.fn(),
    t: (key: string) => key,
    ea: {
      targetView: view,
      createSidepanelTab: async () => tab,
      plugin: { app: { workspace } },
      isExcalidrawView: (candidate: unknown) => candidate === view,
      getSidepanelLeaf: () => ({
        view: { containerEl: { contains: (el: unknown) => el === containerEl } },
      }),
      getExcalidrawAPI: () => ({
        getAppState: () => ({ viewModeEnabled: false }),
        onChange: () => vi.fn(),
      }),
    },
  };
  vi.stubGlobal("window", { MindmapBuilder: {} });
  vi.stubGlobal("app", { workspace });
  await openMindmapSidepanel(context);
  leafChanged(leaf);
  expect(context.floatingInputModal.modalEl.style.display).toBe("");
});
