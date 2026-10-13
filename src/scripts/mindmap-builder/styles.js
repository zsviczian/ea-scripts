/**
 * @file styles.js
 * @overview styles implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createStyles(runtimeContext) {
  const registerStyles = () => {
    // Remove existing styles first to ensure updates are applied immediately
    const existing = document.getElementById(runtimeContext.MINDMAP_FOCUS_STYLE_ID);
    if (existing) existing.remove();
    const styleEl = document.createElement("style");
    styleEl.id = runtimeContext.MINDMAP_FOCUS_STYLE_ID;
    styleEl.textContent = [
      ".modal.excalidraw-mindmap-ui {",
      " overflow: hidden;",
      " scrollbar-width: none;",
      "}",
      ".excalidraw-mindmap-ui .modal-header-button {display: none;}",
      // Focus styles
      ".excalidraw-mindmap-ui button:focus,",
      ".excalidraw-mindmap-ui .clickable-icon:focus,",
      ".excalidraw-mindmap-ui [tabindex]:focus,",
      ".excalidraw-mindmap-ui button:focus-visible,",
      ".excalidraw-mindmap-ui .clickable-icon:focus-visible,",
      ".excalidraw-mindmap-ui [tabindex]:focus-visible {",
      "  outline: 2px solid var(--interactive-accent) !important;",
      "  outline-offset: 2px;",
      "}",
      ...(runtimeContext.ea.DEVICE.isDesktop
        ? [".excalidraw-mindmap-ui hr {margin: 5px;}"]
        : [".excalidraw-mindmap-ui hr {margin: 15px 5px;}"]),
      ".excalidraw-mindmap-ui .clickable-icon:focus svg,",
      ".excalidraw-mindmap-ui .clickable-icon:focus-visible svg {",
      "  color: inherit;",
      "}",
      // New Flex Input Styles
      ".mindmap-input-wrapper { display: flex; gap: 8px; width: 100%; transition: all 0.3s ease; }",
      ".mindmap-input-ontology { flex: 1; transition: flex-grow 0.3s ease; min-width: 0; }",
      ".mindmap-input-main { flex: 17; transition: flex-grow 0.3s ease; min-width: 0; }",
      ".mindmap-input-ontology.is-focused { flex: 17; }",
      ".mindmap-input-main.is-shrunk { flex: 1; }",
      // Drag Handle Styles
      ".excalidraw-mindmap-ui .mindmap-drag-handle {",
      "  position: absolute;",
      "  right: 0;",
      "  top: 0;",
      "  bottom: 0;",
      "  width: 20px;",
      "  cursor: grab;",
      "  display: flex;",
      "  align-items: center;",
      "  justify-content: center;",
      "  opacity: 0.4;",
      "  color: var(--text-muted);",
      "  transition: opacity 0.2s ease, color 0.2s ease;",
      "  background: var(--background-secondary);",
      "  border-left: 1px solid var(--background-modifier-border);",
      "  border-top-right-radius: 6px;",
      "  border-bottom-right-radius: 6px;",
      "}",
      ".excalidraw-mindmap-ui:focus-within .mindmap-drag-handle,",
      ".excalidraw-mindmap-ui .mindmap-drag-handle:hover,",
      ".excalidraw-mindmap-ui .mindmap-drag-handle:active {",
      "  opacity: 1;",
      "  color: var(--text-normal);",
      "}",
      ".excalidraw-mindmap-ui.is-dragging .mindmap-drag-handle {",
      "  cursor: grabbing;",
      "}",
    ].join("\n");
    document.head.appendChild(styleEl);
  };

  const removeStyles = () => {
    const styleEl = document.getElementById(runtimeContext.MINDMAP_FOCUS_STYLE_ID);
    if (styleEl) styleEl.remove();
  };
  return { registerStyles, removeStyles };
}
