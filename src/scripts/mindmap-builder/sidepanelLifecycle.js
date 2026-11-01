import { updateFloatingVisibility, watchFloatingVisibility } from "./floatingVisibility.js";

/**
 * @file sidepanelLifecycle.js
 * @overview sidepanel Lifecycle implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export async function openMindmapSidepanel(runtimeContext) {
  /* --- Initialization Logic --- */
  /* --- Initialization Logic --- */
  return runtimeContext.ea
    .createSidepanelTab(runtimeContext.t("DOCK_TITLE"), true, true)
    .then((tab) => {
      if (!tab) return;
      runtimeContext.registerStyles();
      tab.onWindowMigrated = (newWin) => {
        runtimeContext.cancelBranchPaste?.();
        runtimeContext.cancelHotkeyRecording?.();
        runtimeContext.linkSuggester?.close();
        runtimeContext.sidepanelWindow = newWin;
        // If we are docked, re-attach to the new window immediately
        if (!runtimeContext.isUndocked && runtimeContext.sidepanelWindow) {
          runtimeContext.registerKeydownHandler(
            runtimeContext.sidepanelWindow,
            runtimeContext.handleKeydown,
          );
        }
      };
      // When the view closes, ensure we dock the input back so it's not lost in floating limbo
      tab.onExcalidrawViewClosed = () => {
        if (runtimeContext.isUndocked) {
          runtimeContext.toggleDock({
            silent: true,
            forceDock: true,
            saveSetting: false,
          });
        }
      };
      tab.onOpen = () => {
        const contentEl = tab.contentEl;
        contentEl.classList.add("excalidraw-mindmap-ui");
        if (!contentEl.hasChildNodes()) {
          runtimeContext.renderHelp(contentEl);
          runtimeContext.inputContainer = contentEl.createDiv();
          runtimeContext.renderBody(contentEl);
          runtimeContext.sidepanelWindow = contentEl.ownerDocument.defaultView;
          if (runtimeContext.isUndocked) {
            runtimeContext.toggleDock({
              silent: true,
              forceDock: true,
              saveSetting: false,
            });
          } else {
            runtimeContext.renderInput(runtimeContext.inputContainer, false);
          }
        }
        runtimeContext.ensureNodeSelected();
        runtimeContext.updateUI();
        runtimeContext.focusInputEl();
        if (runtimeContext.ea.activateMindmap) {
          runtimeContext.ea.activateMindmap = false;
          const undockPreference = runtimeContext.getVal(runtimeContext.K_UNDOCKED, false);
          if (undockPreference && !runtimeContext.isUndocked) {
            setTimeout(() =>
              runtimeContext.toggleDock({
                saveSetting: false,
              }),
            );
          } else if (!undockPreference && runtimeContext.isUndocked) {
            setTimeout(() =>
              runtimeContext.toggleDock({
                saveSetting: false,
              }),
            );
            tab.reveal();
          } else if (!undockPreference) {
            tab.reveal();
          }
        } else {
          setupEventListeners(runtimeContext.ea.targetView);
          if (!window.MindmapBuilder?.popObsidianHotkeyScope)
            runtimeContext.registerObsidianHotkeyOverrides();
        }
      };
      const setupEventListeners = (view) => {
        if (!view || !view.ownerWindow) return;
        window.MindmapBuilder?.removeFloatingVisibilityListener?.();
        window.MindmapBuilder.removeFloatingVisibilityListener = watchFloatingVisibility(runtimeContext, view);
        window.MindmapBuilder?.removePointerDownHandler?.();
        const win = view.ownerWindow;
        win.addEventListener("pointerdown", runtimeContext.handleCanvasPointerDown);
        window.MindmapBuilder.removePointerDownHandler = () => {
          if (win) win.removeEventListener("pointerdown", runtimeContext.handleCanvasPointerDown);
          delete window.MindmapBuilder.removePointerDownHandler;
        };
        runtimeContext.updateKeyHandlerLocation();
        if (!window.MindmapBuilder?.removeActiveLeafListener) {
          const leafChangeRef = app.workspace.on("active-leaf-change", onActiveLeafChange);
          window.MindmapBuilder.removeActiveLeafListener = () => {
            app.workspace.offref(leafChangeRef);
            delete window.MindmapBuilder.removeActiveLeafListener;
          };
        }
      };
      const onFocus = (view) => {
        if (!view) return;
        if (runtimeContext.ea.targetView !== view) {
          runtimeContext.mostRecentlySelectedNodeID = null;
          if (runtimeContext.ea.targetView)
            runtimeContext.removeEventListeners(runtimeContext.ea.targetView);
          runtimeContext.ea.setView(view);
          runtimeContext.ea.clear();
        }
        setupEventListeners(view);
        runtimeContext.watchPasteMetadata?.();
        runtimeContext.ensureNodeSelected();
        runtimeContext.updateUI();
      };
      tab.onFocus = (view) => onFocus(view);
      const onActiveLeafChange = (leaf) => {
        if (runtimeContext.cancelHotkeyRecording) runtimeContext.cancelHotkeyRecording();
        if (
          runtimeContext.ea.targetView !== leaf?.view &&
          runtimeContext.ea.isExcalidrawView(leaf?.view)
        ) {
          runtimeContext.mostRecentlySelectedNodeID = null;
          if (runtimeContext.ea.targetView)
            runtimeContext.removeEventListeners(runtimeContext.ea.targetView);
          runtimeContext.ea.setView(leaf.view);
          runtimeContext.ea.clear();
          setupEventListeners(leaf.view);
        }
        runtimeContext.registerObsidianHotkeyOverrides();
        updateFloatingVisibility(runtimeContext);
        if (!runtimeContext.isUndocked || !runtimeContext.floatingInputModal || !leaf) {
          return;
        }
        if (runtimeContext.ea.isExcalidrawView(leaf.view)) {
          runtimeContext.ensureNodeSelected();
          runtimeContext.updateUI();
          const { modalEl } = runtimeContext.floatingInputModal;
          if (runtimeContext.isExcaliBrainView() || runtimeContext.ea.getExcalidrawAPI()?.getAppState()?.viewModeEnabled) {
            modalEl.style.display = "none";
          } else {
            if (modalEl.style.display === "none") {
              modalEl.style.display = "";
            }
          }
          if (
            runtimeContext.ea.targetView &&
            modalEl.ownerDocument !== runtimeContext.ea.targetView.ownerDocument
          ) {
            runtimeContext.ea.targetView.ownerDocument.body.appendChild(modalEl);
            runtimeContext.linkSuggester?.close();
            runtimeContext.linkSuggester = runtimeContext.ea.attachInlineLinkSuggester(
              runtimeContext.inputEl,
              runtimeContext.inputRow?.settingEl,
            );
          }
          const { x, y } = runtimeContext.ea.targetView.contentEl.getBoundingClientRect();
          modalEl.style.top = `${y + 5}px`;
          modalEl.style.left = `${x + 5}px`;
        } else {
          if (leaf.view?.getViewType() === "excalidraw-sidepanel") return;
          const { modalEl } = runtimeContext.floatingInputModal;
          if (modalEl.style.display !== "none") {
            modalEl.style.display = "none";
          }
        }
      };
      tab.onClose = async () => {
        runtimeContext.disposeBranchPaste?.();
        runtimeContext.cancelHotkeyRecording?.();
        runtimeContext.linkSuggester?.close();
        runtimeContext.disposeKeyboard();
        runtimeContext.removeEventListeners();
        delete window.MindmapBuilder;
        delete window.MindMapBuilderAPI;
        runtimeContext.removeStyles();
        if (runtimeContext.floatingInputModal) {
          if (
            runtimeContext.floatingInputModal.modalEl &&
            runtimeContext.floatingInputModal.modalEl.parentElement
          ) {
            runtimeContext.floatingInputModal.modalEl.remove();
          }
          runtimeContext.floatingInputModal.close();
          runtimeContext.floatingInputModal = null;
        }
        await runtimeContext.saveSettings();
      };
      // Initial setup if a view is already active
      if (runtimeContext.ea.targetView) {
        setupEventListeners(runtimeContext.ea.targetView);
      }
      tab.open();
    });
}
