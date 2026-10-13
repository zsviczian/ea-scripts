/**
 * @file floatingInput.js
 * @overview floating Input implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createFloatingInput(runtimeContext) {
  // ---------------------------------------------------------------------------
  // Docking & Floating Input Management
  // ---------------------------------------------------------------------------
  /**
   * silent === true: sidepanel is not revealed after docking
   * forceDock === true: if input is undocked, docking happens even if no ExcalidrawView is present
   * saveSetting === true: the dock/undock status is saved to settings. When input is docked because
   *   the ExcalidrawView was closed or when the user presses ESC to finish mindmapping, next time
   *   Mindmap Builder is started it should remember the user preference
   *
   **/
  const toggleDock = async ({ silent = false, forceDock = false, saveSetting = false } = {}) => {
    runtimeContext.editingNodeId = null;
    if (!runtimeContext.ea.targetView && !(forceDock && runtimeContext.isUndocked)) return;
    // Check visibility if not silent
    if (!silent) {
      const isSidepanelVisible = runtimeContext.ea.getSidepanelLeaf().isVisible();
      // Manage sidepanel visibility based on docking state
      if (runtimeContext.isUndocked && !isSidepanelVisible) {
        const leaf = runtimeContext.ea.getSidepanelLeaf();
        if (leaf) app.workspace.revealLeaf(leaf);
      } else if (isSidepanelVisible && !runtimeContext.isUndocked) {
        runtimeContext.ea.toggleSidepanelView();
      }
      if (runtimeContext.isUndocked) {
        // If we were undocked (now docking), focus the sidepanel
        app.workspace.setActiveLeaf(runtimeContext.ea.getSidepanelLeaf(), {
          focus: true,
        });
      } else {
        // If we were docked (now undocking), focus the main view
        app.workspace.setActiveLeaf(runtimeContext.ea.targetView.leaf, {
          focus: true,
        });
      }
    }
    runtimeContext.isUndocked = !runtimeContext.isUndocked;
    if (saveSetting) {
      runtimeContext.setVal(runtimeContext.K_UNDOCKED, runtimeContext.isUndocked);
    }
    // Update keyboard event routing
    runtimeContext.updateKeyHandlerLocation();
    if (runtimeContext.isUndocked) {
      // UNDOCK: Initialize floating modal
      runtimeContext.floatingInputModal = new runtimeContext.ea.FloatingModal(
        runtimeContext.ea.plugin.app,
      );
      const { contentEl, titleEl, modalEl, headerEl, bgEl } = runtimeContext.floatingInputModal;
      modalEl.classList.add("excalidraw-mindmap-ui");
      if (bgEl) {
        bgEl.style.display = "none";
      }
      runtimeContext.floatingInputModal.onOpen = () => {
        // Reparent modal to target view window
        if (
          runtimeContext.ea.targetView &&
          modalEl.ownerDocument !== runtimeContext.ea.targetView.ownerDocument
        ) {
          runtimeContext.ea.targetView.ownerDocument.body.appendChild(modalEl);
        }
        const { x, y } = runtimeContext.ea.targetView.contentEl.getBoundingClientRect();
        contentEl.empty();
        const closeEl = modalEl.querySelector(".modal-close-button");
        if (closeEl) closeEl.style.display = "none";
        titleEl.style.display = "none";
        headerEl.style.display = "none";
        modalEl.style.opacity = `${runtimeContext.FLOAT_MODAL_OPACITY}`;
        modalEl.style.padding = "6px";
        modalEl.style.paddingRight = "26px"; // Make room for the drag handle
        modalEl.style.minHeight = "0px";
        modalEl.style.width = "fit-content";
        modalEl.style.height = "auto";
        modalEl.style.maxHeight = runtimeContext.FLOAT_MODAL_MAX_HEIGHT;
        if (runtimeContext.isExcaliBrainView()) {
          modalEl.style.display = "none";
        }
        const container = runtimeContext.floatingInputModal.contentEl.createDiv();
        runtimeContext.renderInput(container, true);
        // Setup Drag Handle
        const dragHandle = modalEl.createDiv("mindmap-drag-handle");
        dragHandle.innerHTML = runtimeContext.ea.obsidian.getIcon("grip-vertical").outerHTML;
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;
        dragHandle.addEventListener("pointerdown", (e) => {
          isDragging = true;
          startX = e.clientX;
          startY = e.clientY;
          const rect = modalEl.getBoundingClientRect();
          initialLeft = rect.left;
          initialTop = rect.top;
          dragHandle.setPointerCapture(e.pointerId);
          modalEl.classList.add("is-dragging");
          e.preventDefault();
        });
        dragHandle.addEventListener("pointermove", (e) => {
          if (!isDragging) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          modalEl.style.left = `${initialLeft + dx}px`;
          modalEl.style.top = `${initialTop + dy}px`;
        });
        dragHandle.addEventListener("pointerup", (e) => {
          isDragging = false;
          dragHandle.releasePointerCapture(e.pointerId);
          modalEl.classList.remove("is-dragging");
        });
        dragHandle.addEventListener("dblclick", (e) => {
          const { x, y } = runtimeContext.ea.targetView.contentEl.getBoundingClientRect();
          const desktopShift = !!runtimeContext.ea.targetView.contentEl.querySelector(
            ".App-bottom-bar .App-toolbar",
          )
            ? 0
            : runtimeContext.ea.targetView.contentEl.clientWidth < 1200
              ? 36
              : 0;
          modalEl.style.top = `${y + runtimeContext.FLOAT_MODAL_OFFSET + desktopShift}px`;
          modalEl.style.left = `${x + runtimeContext.FLOAT_MODAL_OFFSET}px`;
        });
        setTimeout(
          () => {
            //the modalEl is repositioned after a delay
            //otherwise the event handlers in FloatingModal would override the move
            //leaving modalEl in the center of the view
            //modalEl.style.top and left must stay in the timeout call
            const { x, y } = runtimeContext.ea.targetView.contentEl.getBoundingClientRect();
            const desktopShift = !!runtimeContext.ea.targetView.contentEl.querySelector(
              ".App-bottom-bar .App-toolbar",
            )
              ? 0
              : runtimeContext.ea.targetView.contentEl.clientWidth < 1200
                ? 36
                : 0;
            modalEl.style.top = `${y + runtimeContext.FLOAT_MODAL_OFFSET + desktopShift}px`;
            modalEl.style.left = `${x + runtimeContext.FLOAT_MODAL_OFFSET}px`;
          },
          runtimeContext.ea.DEVICE.isMobile ? 400 : 150,
        );
      };
      runtimeContext.floatingInputModal.onClose = () => {
        runtimeContext.removeObsidianHotkeyOverrides();
        runtimeContext.floatingInputModal = null;
        if (runtimeContext.isUndocked) {
          // If closed manually (e.g. unexpected close), dock back silently
          runtimeContext.isUndocked = false;
          runtimeContext.setVal(runtimeContext.K_UNDOCKED, false);
          runtimeContext.updateKeyHandlerLocation(); // Restore listeners to sidepanel
          if (runtimeContext.ea.sidepanelTab && runtimeContext.inputContainer)
            runtimeContext.renderInput(runtimeContext.inputContainer, false);
        }
      };
      // Clear sidepanel input
      runtimeContext.linkSuggester?.close();
      runtimeContext.inputContainer.empty();
      runtimeContext.floatingInputModal.open();
    } else {
      if (runtimeContext.floatingInputModal) {
        runtimeContext.linkSuggester?.close();
        if (
          runtimeContext.floatingInputModal.modalEl &&
          runtimeContext.floatingInputModal.modalEl.parentElement
        ) {
          runtimeContext.floatingInputModal.modalEl.remove();
        }
        runtimeContext.floatingInputModal.close();
        runtimeContext.floatingInputModal = null;
      }
      runtimeContext.renderInput(runtimeContext.inputContainer, false);
      if (forceDock) return;
      if (!silent) {
        runtimeContext.focusInputEl();
      }
    }
  };
  return { toggleDock };
}
