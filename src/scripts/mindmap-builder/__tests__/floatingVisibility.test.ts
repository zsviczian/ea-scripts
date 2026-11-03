import { expect, it, vi } from "vitest";
import { updateFloatingVisibility, watchFloatingVisibility } from "../floatingVisibility.js";

it("hides and restores an undocked toolbar on live view-mode changes, retaining the preference", () => {
  const view = {getViewType: () => "excalidraw"};
  let changed: (elements: readonly unknown[], state: {viewModeEnabled: boolean}) => void = () => {};
  const unsubscribe = vi.fn();
  const workspace = {activeLeaf: {view}};
  const context = {isUndocked: true, floatingInputModal: {modalEl: {style: {display: ""}}},
    isExcaliBrainView: () => false,
    ea: {targetView: view, plugin: {app: {workspace}}, isExcalidrawView: (candidate: unknown) => candidate === view,
      getExcalidrawAPI: () => ({getAppState: () => ({viewModeEnabled: true}),
        onChange: (callback: typeof changed) => { changed = callback; return unsubscribe; }})}};
  const dispose = watchFloatingVisibility(context, view);
  expect(context.floatingInputModal.modalEl.style.display).toBe("none");
  changed([], {viewModeEnabled: false});
  expect(context.floatingInputModal.modalEl.style.display).toBe("");
  changed([], {viewModeEnabled: true});
  expect(context.floatingInputModal.modalEl.style.display).toBe("none");
  expect(context.isUndocked).toBe(true);
  workspace.activeLeaf = {view: {getViewType: () => "markdown"}};
  changed([], {viewModeEnabled: false});
  expect(context.floatingInputModal.modalEl.style.display).toBe("none");
  workspace.activeLeaf = {view};
  updateFloatingVisibility(context, view, {viewModeEnabled: false});
  expect(context.floatingInputModal.modalEl.style.display).toBe("");
  dispose(); expect(unsubscribe).toHaveBeenCalledOnce();
});

it("keeps floating input visible for the sidepanel's embedded Markdown-image editor only", () => {
  const view = { getViewType: () => "excalidraw" };
  const editorContainer = {
    matches: (selector: string): boolean => selector === ".excalidraw-markdown-fragment-view",
  };
  const unrelatedContainer = { matches: () => false };
  const workspace = {
    activeLeaf: { view: { getViewType: () => "markdown", containerEl: editorContainer } },
  };
  const context = {
    isUndocked: true,
    floatingInputModal: { modalEl: { style: { display: "none" } } },
    isExcaliBrainView: () => false,
    ea: {
      targetView: view,
      plugin: { app: { workspace } },
      isExcalidrawView: (candidate: unknown) => candidate === view,
      getSidepanelLeaf: () => ({
        view: { containerEl: { contains: (el: unknown) => el === editorContainer } },
      }),
      getExcalidrawAPI: () => ({
        getAppState: () => ({ viewModeEnabled: false }),
        onChange: () => vi.fn(),
      }),
    },
  };
  updateFloatingVisibility(context);
  expect(context.floatingInputModal.modalEl.style.display).toBe("");
  updateFloatingVisibility(context, view, { viewModeEnabled: true });
  expect(context.floatingInputModal.modalEl.style.display).toBe("none");
  workspace.activeLeaf.view.containerEl = unrelatedContainer;
  updateFloatingVisibility(context);
  expect(context.floatingInputModal.modalEl.style.display).toBe("none");
  workspace.activeLeaf.view.containerEl = editorContainer;
  context.ea.getSidepanelLeaf = () => ({ view: { containerEl: { contains: () => false } } });
  updateFloatingVisibility(context);
  expect(context.floatingInputModal.modalEl.style.display).toBe("none");
});
