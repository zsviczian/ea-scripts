/** Floating controls follow the active drawing's live editing mode without changing docking preferences. */
export function updateFloatingVisibility(context, view = context.ea.targetView, state) {
  const modal = context.floatingInputModal?.modalEl;
  if (!context.isUndocked || !modal) return;
  const active = context.ea.plugin.app.workspace.activeLeaf?.view;
  // Focusing the resident sidepanel keeps the last drawing's mode authoritative.
  const drawingActive = active === view || active?.getViewType() === "excalidraw-sidepanel";
  const viewMode = state?.viewModeEnabled ?? context.ea.getExcalidrawAPI()?.getAppState()?.viewModeEnabled;
  const visible = drawingActive && context.ea.isExcalidrawView(view) && !viewMode && !context.isExcaliBrainView();
  modal.style.display = visible ? "" : "none";
}

/** Subscribe to the exact drawing API; the caller retires the subscription on rebinding or close. */
export function watchFloatingVisibility(context, view) {
  const api = context.ea.getExcalidrawAPI();
  updateFloatingVisibility(context, view, api?.getAppState());
  return api?.onChange((_elements, state) => {
    if (context.ea.targetView === view) updateFloatingVisibility(context, view, state);
  }) ?? (() => {});
}
