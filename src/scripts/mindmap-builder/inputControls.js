/**
 * @file inputControls.js
 * @overview input Controls implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createInputControls(runtimeContext) {
  // ---------------------------------------------------------------------------
  // 10. Render Functions
  // ---------------------------------------------------------------------------
  const renderInput = (container, isFloating = false) => {
    // Release the old input's scope before removing DOM or replacing its only handle.
    runtimeContext.linkSuggester?.close();
    runtimeContext.linkSuggester = null;
    runtimeContext.ignoreFocusChanges = true;
    setTimeout(() => {
      runtimeContext.ignoreFocusChanges = false;
      if (runtimeContext.lastFocusedInput) runtimeContext.lastFocusedInput.focus();
    }, 200);
    container.empty();
    runtimeContext.pinBtn =
      runtimeContext.submapRootBtn =
      runtimeContext.refreshBtn =
      runtimeContext.dockBtn =
      runtimeContext.inputEl =
      runtimeContext.ontologyEl =
        null;
    runtimeContext.foldBtnL0 = runtimeContext.foldBtnL1 = runtimeContext.foldBtnAll = null;
    runtimeContext.boundaryBtn = runtimeContext.panelExpandBtn = null;
    runtimeContext.floatingGroupBtn =
      runtimeContext.floatingBoxBtn =
      runtimeContext.floatingZoomBtn =
        null;
    runtimeContext.importOutlineBtn = runtimeContext.toggleCheckboxBtn = null;
    runtimeContext.calendarBtn = null;
    runtimeContext.inputRow = new runtimeContext.ea.obsidian.Setting(container);
    let secondaryButtonContainer = null;
    if (!isFloating) {
      runtimeContext.inputRow.settingEl.style.display = "block";
      runtimeContext.inputRow.controlEl.style.display = "block";
      runtimeContext.inputRow.controlEl.style.width = "100%";
      runtimeContext.inputRow.controlEl.style.marginTop = "8px";
    } else {
      container.style.width = "85vw";
      container.style.maxWidth = "calc((var(--icon-size) + 2 * var(--size-2-3)) * 18)";
      runtimeContext.inputRow.settingEl.style.border = "none";
      runtimeContext.inputRow.settingEl.style.padding = "0";
      runtimeContext.inputRow.infoEl.style.display = "none";
      // Expandable container for floating mode
      secondaryButtonContainer = container.createDiv();
      secondaryButtonContainer.style.display = runtimeContext.isFloatingPanelExpanded
        ? "flex"
        : "none";
      secondaryButtonContainer.style.justifyContent = "flex-end";
      secondaryButtonContainer.style.flexWrap = "wrap";
      secondaryButtonContainer.style.gap = "0px";
      secondaryButtonContainer.style.marginTop = "6px";
    }
    // Clear default control element to build custom two-input layout
    runtimeContext.inputRow.controlEl.empty();
    const wrapper = runtimeContext.inputRow.controlEl.createDiv("mindmap-input-wrapper");
    runtimeContext.ontologyEl = wrapper.createEl("input", {
      type: "text",
      cls: "mindmap-input-ontology",
      placeholder: runtimeContext.t("ONTOLOGY_PLACEHOLDER"),
    });
    runtimeContext.inputEl = wrapper.createEl("input", {
      type: "text",
      cls: "mindmap-input-main",
      placeholder: runtimeContext.t("INPUT_PLACEHOLDER"),
    });
    runtimeContext.inputEl.addEventListener("input", () => runtimeContext.updateUI());
    runtimeContext.ontologyEl.addEventListener("input", () => runtimeContext.updateUI());
    const updateFocusState = (focusedElement) => {
      if (runtimeContext.ignoreFocusChanges) return;
      runtimeContext.isOntologyFocused = focusedElement === runtimeContext.ontologyEl;
      runtimeContext.lastFocusedInput = focusedElement;
      if (runtimeContext.isOntologyFocused) {
        runtimeContext.ontologyEl.addClass("is-focused");
        runtimeContext.inputEl.addClass("is-shrunk");
      } else {
        runtimeContext.ontologyEl.removeClass("is-focused");
        runtimeContext.inputEl.removeClass("is-shrunk");
      }
    };
    const onFocus = (el) => {
      if (runtimeContext.ignoreFocusChanges) return;
      updateFocusState(el);
      runtimeContext.registerObsidianHotkeyOverrides();
      runtimeContext.ensureNodeSelected();
      runtimeContext.updateUI();
    };
    // --- Restore State to New DOM Elements ---
    // Apply the tracked focus state to the newly created elements immediately.
    // This ensures that when focusInputEl() runs (via setTimeout in toggleDock),
    // lastFocusedInput points to a valid, live DOM element.
    if (runtimeContext.isOntologyFocused) {
      runtimeContext.ontologyEl.addClass("is-focused");
      runtimeContext.inputEl.addClass("is-shrunk");
      runtimeContext.lastFocusedInput = runtimeContext.ontologyEl;
    } else {
      runtimeContext.ontologyEl.removeClass("is-focused");
      runtimeContext.inputEl.removeClass("is-shrunk");
      runtimeContext.lastFocusedInput = runtimeContext.inputEl;
    }
    runtimeContext.ontologyEl.addEventListener("focus", () => onFocus(runtimeContext.ontologyEl));
    runtimeContext.inputEl.addEventListener("focus", () => onFocus(runtimeContext.inputEl));
    const onBlur = () => {
      if (runtimeContext.ignoreFocusChanges) return;
      runtimeContext.removeObsidianHotkeyOverrides();
      runtimeContext.saveSettings();
    };
    runtimeContext.ontologyEl.addEventListener("blur", onBlur);
    runtimeContext.inputEl.addEventListener("blur", onBlur);
    // Initialize Link Suggester on Main Input
    runtimeContext.linkSuggester = runtimeContext.ea.attachInlineLinkSuggester(
      runtimeContext.inputEl,
      runtimeContext.inputRow.settingEl,
    );
    // Override modifyInput to replace dots with spaces, allowing fuzzy matcher to locate files correctly.
    if (runtimeContext.linkSuggester) {
      runtimeContext.linkSuggester.modifyInput = (input) => input.replace(/\./g, " ");
    }
    const ariaHelp = [
      `${runtimeContext.getActionLabel(runtimeContext.ACTION_ADD)} (Enter)`,
      `${runtimeContext.getActionLabel(runtimeContext.ACTION_ADD_FOLLOW)} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_ADD_FOLLOW)}`,
      `${runtimeContext.getActionLabel(runtimeContext.ACTION_ADD_FOLLOW_FOCUS)} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_ADD_FOLLOW_FOCUS)}`,
      `${runtimeContext.getActionLabel(runtimeContext.ACTION_ADD_FOLLOW_ZOOM)} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_ADD_FOLLOW_ZOOM)}`,
    ].join("\n");
    runtimeContext.inputEl.ariaLabel = ariaHelp;
    let dockedButtonContainer;
    if (!isFloating) {
      dockedButtonContainer = runtimeContext.inputRow.controlEl.createDiv();
      dockedButtonContainer.style.display = "flex";
      dockedButtonContainer.style.justifyContent = "flex-end";
      dockedButtonContainer.style.flexWrap = "wrap";
      dockedButtonContainer.style.gap = "2px";
      dockedButtonContainer.style.marginTop = "6px";
    }
    const addButton = (cb, moveToSecondary = false) => {
      runtimeContext.inputRow.addExtraButton((btn) => {
        cb(btn);
        if (btn.buttonEl) btn.buttonEl.tabIndex = 0;
        if (btn.extraSettingsEl) btn.extraSettingsEl.tabIndex = 0;
        const el = btn.extraSettingsEl;
        if (!el) return;
        if (!isFloating && dockedButtonContainer) {
          dockedButtonContainer.appendChild(el);
        } else if (isFloating && moveToSecondary && secondaryButtonContainer) {
          secondaryButtonContainer.appendChild(el);
        }
      });
    };
    addButton((btn) => {
      runtimeContext.editBtn = btn;
      btn.setIcon("pencil");
      btn.setTooltip(
        `${runtimeContext.t("TOOLTIP_EDIT_NODE")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_EDIT)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_EDIT);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_EDIT));
    }, false);
    addButton((btn) => {
      runtimeContext.pinBtn = btn;
      btn.setTooltip(
        `${runtimeContext.t("TOOLTIP_PIN_INIT")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_PIN)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_PIN);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_PIN));
    }, false);
    addButton((btn) => {
      runtimeContext.toggleCheckboxBtn = btn;
      btn.setIcon("square-check-big");
      btn.setTooltip(
        `${runtimeContext.t("TOOLTIP_TOGGLE_CHECKBOX")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_TOGGLE_CHECKBOX)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_TOGGLE_CHECKBOX);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_TOGGLE_CHECKBOX));
    }, true);
    addButton((btn) => {
      runtimeContext.calendarBtn = btn;
      btn.setIcon("calendar");
      btn.setTooltip(
        `${runtimeContext.t("TOOLTIP_CALENDAR")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_CALENDAR)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_CALENDAR);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_CALENDAR));
    }, true);
    addButton((btn) => {
      runtimeContext.toggleEmbedBtn = btn;
      btn.setIcon("file-sliders");
      btn.setTooltip(
        `${runtimeContext.t("TOOLTIP_TOGGLE_EMBED")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_TOGGLE_EMBED)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_TOGGLE_EMBED);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_TOGGLE_EMBED));
    }, true);
    runtimeContext.toggleFloatingExtras = null;
    if (isFloating) {
      runtimeContext.toggleFloatingExtras = () => {
        runtimeContext.isFloatingPanelExpanded = !runtimeContext.isFloatingPanelExpanded;
        runtimeContext.panelExpandBtn.setIcon(
          runtimeContext.isFloatingPanelExpanded ? "panel-bottom-open" : "panel-top-open",
        );
        if (secondaryButtonContainer) {
          secondaryButtonContainer.style.display = runtimeContext.isFloatingPanelExpanded
            ? "flex"
            : "none";
          if (runtimeContext.floatingInputModal && runtimeContext.floatingInputModal.modalEl) {
            runtimeContext.floatingInputModal.modalEl.style.maxHeight =
              runtimeContext.isFloatingPanelExpanded
                ? "unset"
                : runtimeContext.FLOAT_MODAL_MAX_HEIGHT;
          }
        }
      };
      addButton((btn) => {
        runtimeContext.panelExpandBtn = btn;
        btn.setIcon(
          runtimeContext.isFloatingPanelExpanded ? "panel-bottom-open" : "panel-top-open",
        );
        btn.setTooltip(runtimeContext.t("TOOLTIP_TOGGLE_FLOATING_EXTRAS"));
        btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_TOGGLE_FLOATING_EXTRAS);
        btn.onClick(() =>
          runtimeContext.performAction(runtimeContext.ACTION_TOGGLE_FLOATING_EXTRAS),
        );
      }, false);
      addButton((btn) => {
        runtimeContext.floatingGroupBtn = btn;
        btn.setIcon("group");
        btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_TOGGLE_GROUP);
        btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_TOGGLE_GROUP));
      }, true);
      addButton((btn) => {
        runtimeContext.floatingBoxBtn = btn;
        btn.setIcon("rectangle-horizontal");
        btn.setTooltip(
          `${runtimeContext.t("TOOLTIP_TOGGLE_BOX")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_BOX)}`,
        );
        btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_BOX);
        btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_BOX));
      }, true);
      addButton((btn) => {
        runtimeContext.floatingZoomBtn = btn;
        btn.setIcon("scan-search");
        btn.setTooltip(
          `${runtimeContext.t("TOOLTIP_ZOOM_CYCLE")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_ZOOM)}`,
        );
        btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_ZOOM);
        btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_ZOOM));
      }, true);
    }
    addButton((btn) => {
      runtimeContext.focusBtn = btn;
      btn.setIcon("scan-eye");
      btn.setTooltip(
        `${runtimeContext.t("ACTION_LABEL_FOCUS")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_FOCUS)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_FOCUS);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_FOCUS));
    }, true);
    addButton((btn) => {
      runtimeContext.boundaryBtn = btn;
      btn.setIcon("cloud");
      btn.setTooltip(
        `${runtimeContext.t("TOOLTIP_TOGGLE_BOUNDARY")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_TOGGLE_BOUNDARY)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_TOGGLE_BOUNDARY);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_TOGGLE_BOUNDARY));
    }, true);
    addButton((btn) => {
      runtimeContext.submapRootBtn = btn;
      btn.setIcon("map-pin-plus-inside");
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_TOGGLE_SUBMAP_ROOT);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_TOGGLE_SUBMAP_ROOT));
    }, true);
    addButton((btn) => {
      runtimeContext.foldBtnL0 = btn;
      btn.setIcon("wifi-low");
      btn.setTooltip(
        `${runtimeContext.t("TOOLTIP_FOLD_BRANCH")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_FOLD)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_FOLD);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_FOLD));
    }, true);
    addButton((btn) => {
      runtimeContext.foldBtnL1 = btn;
      btn.setIcon("wifi-high");
      btn.setTooltip(
        `${runtimeContext.t("TOOLTIP_FOLD_L1_BRANCH")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_FOLD_L1)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_FOLD_L1);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_FOLD_L1));
    }, true);
    addButton((btn) => {
      runtimeContext.foldBtnAll = btn;
      btn.setIcon("wifi");
      btn.setTooltip(
        `${runtimeContext.t("TOOLTIP_FOLD_ALL")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_FOLD_ALL)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_FOLD_ALL);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_FOLD_ALL));
    }, true);
    addButton((btn) => {
      runtimeContext.refreshBtn = btn;
      btn.setIcon("refresh-ccw");
      btn.setTooltip(
        `${runtimeContext.t("TOOLTIP_REFRESH")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_REARRANGE)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_REARRANGE);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_REARRANGE));
    }, true);
    addButton((btn) => {
      runtimeContext.copyBtn = btn;
      btn.setIcon("copy");
      btn.setTooltip(
        `${runtimeContext.t("ACTION_LABEL_COPY")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_COPY)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_COPY);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_COPY));
    }, true);
    addButton((btn) => {
      runtimeContext.cutBtn = btn;
      btn.setIcon("scissors");
      btn.setTooltip(
        `${runtimeContext.t("ACTION_LABEL_CUT")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_CUT)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_CUT);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_CUT));
    }, true);
    addButton((btn) => {
      btn.setIcon("clipboard");
      btn.setTooltip(
        `${runtimeContext.t("ACTION_LABEL_PASTE")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_PASTE)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_PASTE);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_PASTE));
    }, true);
    addButton((btn) => {
      runtimeContext.importOutlineBtn = btn;
      btn.setIcon("list-tree");
      btn.setTooltip(
        `${runtimeContext.t("TOOLTIP_IMPORT_OUTLINE")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_IMPORT_OUTLINE)}`,
      );
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_IMPORT_OUTLINE);
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_IMPORT_OUTLINE));
    }, true);
    addButton((btn) => {
      runtimeContext.dockBtn = btn;
      btn.setIcon(isFloating ? "dock" : "external-link");
      btn.extraSettingsEl.setAttr("action", runtimeContext.ACTION_DOCK_UNDOCK);
      btn.setTooltip(
        `${isFloating ? runtimeContext.t("TOOLTIP_DOCK") : runtimeContext.t("TOOLTIP_UNDOCK")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_DOCK_UNDOCK)}`,
      );
      btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_DOCK_UNDOCK));
    }, true);
    runtimeContext.updateUI();
  };
  return { renderInput };
}
