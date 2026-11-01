/**
 * @file lifecycle.js
 * @overview Keyboard/pointer/workspace listener cleanup and selection throttling.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createLifecycle(runtimeContext) {
  const removeKeydownHandlers = () => {
    if (!window.MindmapBuilder) return;
    window.MindmapBuilder.keydownHandlers.forEach((f) => {
      try {
        f();
      } catch (e) {
        console.error("Mindmap Builder: Error removing keydown handler:", e);
      }
    });
    window.MindmapBuilder.keydownHandlers = [];
  };

  /**
   * Removes all event listeners and specific hooks attached to the window or workspace.
   */
  const removeEventListeners = () => {
    removeKeydownHandlers();
    window.MindmapBuilder?.removeFloatingVisibilityListener?.();
    if (window.MindmapBuilder) delete window.MindmapBuilder.removeFloatingVisibilityListener;
    try {
      window.MindmapBuilder?.popObsidianHotkeyScope?.();
    } catch (e) {
      console.error("Mindmap Builder: Error popping hotkey scope:", e);
    }
    try {
      window.MindmapBuilder?.removePointerDownHandler?.();
    } catch (e) {
      console.error("Mindmap Builder: Error removing pointerdown handler:", e);
    }
    try {
      window.MindmapBuilder?.removeActiveLeafListener?.();
    } catch (e) {
      console.error("Mindmap Builder: Error removing active-leaf-change listener:", e);
    }
  };

  /**
   * Throttled handler for canvas clicks (pointer down).
   * Updates the UI to reflect the new selection.
   *
   * @param {PointerEvent} e
   */
  const handleCanvasPointerDown = (e) => {
    if (!runtimeContext.isViewSet()) return;
    if (
      runtimeContext.floatingInputModal &&
      runtimeContext.floatingInputModal.modalEl.contains(e.target)
    )
      return;
    if (runtimeContext.uiUpdateTimer) {
      clearTimeout(runtimeContext.uiUpdateTimer);
    }
    runtimeContext.uiUpdateTimer = setTimeout(() => {
      if (!runtimeContext.isViewSet()) return;
      const selection = runtimeContext.getMindmapNodeFromSelection();
      runtimeContext.updateUI(selection);
      runtimeContext.uiUpdateTimer = null;
    }, 50);
  };
  return { removeKeydownHandlers, removeEventListeners, handleCanvasPointerDown };
}
