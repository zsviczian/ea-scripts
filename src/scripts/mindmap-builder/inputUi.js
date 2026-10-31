/**
 * @file inputUi.js
 * @overview input Ui implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */
import { resolvePresetName } from "./settings.js";

/** Creates this subsystem against the invocation-owned context. */
export function createInputUi(runtimeContext) {
  const revealInputEl = () => {
    const undockPreference = runtimeContext.getVal(runtimeContext.K_UNDOCKED, false);
    if (undockPreference && !runtimeContext.isUndocked) {
      runtimeContext.toggleDock({
        saveSetting: false,
      });
      return true;
    } else if (
      !undockPreference &&
      !runtimeContext.isUndocked &&
      runtimeContext.ea.sidepanelTab &&
      !runtimeContext.ea.sidepanelTab.isVisible()
    ) {
      runtimeContext.ea.sidepanelTab.reveal();
    }
    return false;
  };

  const focusInputEl = () => {
    revealInputEl();
    setTimeout(() => {
      if (runtimeContext.isRecordingHotkey) return;
      const target = runtimeContext.isOntologyFocused
        ? runtimeContext.ontologyEl.style.display === "none"
          ? runtimeContext.inputEl
          : runtimeContext.ontologyEl
        : runtimeContext.inputEl;
      if (!target || target.disabled) {
        return;
      }
      target.focus();
      if (!window.MindmapBuilder?.popObsidianHotkeyScope)
        runtimeContext.registerObsidianHotkeyOverrides();
    }, 200);
  };

  const setButtonDisabled = (btn, disabled) => {
    if (!btn) return;
    btn.disabled = disabled;
    const btnEl = btn.extraSettingsEl ?? btn.buttonEl ?? btn.toggleEl;
    if (!btnEl) return;
    btnEl.tabIndex = disabled ? -1 : 0;
    btnEl.style.opacity = disabled ? "0.5" : "";
    btnEl.style.cursor = disabled ? "not-allowed" : "";
    if (disabled && btn.buttonEl) {
      btn.buttonEl.style.pointerEvents = "auto";
      btn.buttonEl.style.cursor = "not-allowed";
    }
  };

  const disableUI = () => {
    if (runtimeContext.pinBtn) runtimeContext.pinBtn.setIcon("pin-off");
    setButtonDisabled(runtimeContext.pinBtn, true);
    setButtonDisabled(runtimeContext.refreshBtn, true);
    setButtonDisabled(runtimeContext.copyBtn, true);
    runtimeContext.copyMermaidBtn?.setDisabled(true);
    setButtonDisabled(runtimeContext.cutBtn, true);
    setButtonDisabled(runtimeContext.importOutlineBtn, true);
    setButtonDisabled(runtimeContext.boxBtn, true);
    setButtonDisabled(runtimeContext.foldBtnL0, true);
    setButtonDisabled(runtimeContext.foldBtnL1, true);
    setButtonDisabled(runtimeContext.foldBtnAll, true);
    setButtonDisabled(runtimeContext.editBtn, true);
    setButtonDisabled(runtimeContext.toggleGroupBtn, true);
    setButtonDisabled(runtimeContext.zoomBtn, true);
    setButtonDisabled(runtimeContext.focusBtn, true);
    setButtonDisabled(runtimeContext.boundaryBtn, true);
    setButtonDisabled(runtimeContext.submapRootBtn, true);
    setButtonDisabled(runtimeContext.toggleCheckboxBtn, true);
    setButtonDisabled(runtimeContext.calendarBtn, true); // Added calendarBtn to default disabled state
    setButtonDisabled(runtimeContext.toggleEmbedBtn, true);
    setButtonDisabled(runtimeContext.floatingGroupBtn, true);
    setButtonDisabled(runtimeContext.floatingBoxBtn, true);
    setButtonDisabled(runtimeContext.floatingZoomBtn, true);
    setButtonDisabled(runtimeContext.autoLayoutToggle, true);
    runtimeContext.editingNodeId = null;
    if (runtimeContext.editBtn) runtimeContext.editBtn.extraSettingsEl.style.color = "";
  };

  /**
   * Synchronizes the sidepanel UI elements with the state of the currently selected map node,
   * or the active global variables if no node is selected.
   *
   * Unconditionally sets the values on the Obsidian UI components to ensure that preset
   * applications and external script changes are immediately and accurately reflected in the panel.
   *
   * @param {ExcalidrawElement} [sel] - The currently selected node element. If omitted, attempts to find the active mindmap node from the current canvas selection.
   */
  const updateUI = (sel) => {
    if (!runtimeContext.isViewSet()) {
      if (runtimeContext.inputEl) {
        runtimeContext.inputEl.disabled = true;
      }
      if (runtimeContext.ontologyEl) {
        runtimeContext.ontologyEl.style.display = "none";
      }
      disableUI();
      return;
    }
    if (runtimeContext.inputEl) {
      runtimeContext.inputEl.disabled = false;
    }
    const all = runtimeContext.ea.getViewElements();
    sel = sel ?? runtimeContext.getMindmapNodeFromSelection();
    if (runtimeContext.ontologyEl) {
      runtimeContext.ontologyEl.style.display = sel ? "" : "none";
    }
    let cd = {};
    const isMapSelected = !!sel;
    // Track structural hierarchies and map logic if a node is selected
    if (isMapSelected) {
      runtimeContext.disableTabEvents = true;
      const info = runtimeContext.getHierarchy(sel, all);
      const isMasterRootSelected = info.rootId === sel.id;
      const root =
        runtimeContext.getSettingsRootNode(sel, all) || all.find((e) => e.id === info.rootId);
      const isPinned = sel.customData?.isPinned === true;
      const isAdditionalRoot = sel.customData?.isAdditionalRoot === true;
      const isMasterRoot = !runtimeContext.getParentNode(sel.id, all);
      const isEditing = runtimeContext.editingNodeId && runtimeContext.editingNodeId === sel.id;
      const branchIds = runtimeContext.getBranchElementIds(sel.id, all);
      const children = runtimeContext.getChildrenNodes(sel.id, all);
      const hasChildren = children.length > 0;
      const hasGrandChildren =
        hasChildren &&
        children.some((child) => runtimeContext.getChildrenNodes(child.id, all).length > 0);
      const nodeText = runtimeContext.getTextFromNode(all, sel, true, false);
      const isLinkedFile = !!runtimeContext.getNodeMarkdownFile(nodeText);
      cd = root?.customData ?? {};
      // --- Node-Specific UI Controls ---
      if (runtimeContext.toggleCheckboxBtn) {
        const isTextNode =
          sel.type === "text" ||
          (sel.boundElements && sel.boundElements.some((be) => be.type === "text"));
        const canEditTask =
          (isTextNode && !isMasterRootSelected) ||
          (runtimeContext.inputEl && runtimeContext.inputEl.value.trim() !== "");
        setButtonDisabled(runtimeContext.toggleCheckboxBtn, !canEditTask);
      }
      if (runtimeContext.calendarBtn) {
        const isTextNode =
          sel.type === "text" ||
          (sel.boundElements && sel.boundElements.some((be) => be.type === "text"));
        const canEditTask =
          (isTextNode && !isMasterRootSelected) ||
          (runtimeContext.inputEl && runtimeContext.inputEl.value.trim() !== "");
        setButtonDisabled(runtimeContext.calendarBtn, !canEditTask);
      }
      if (runtimeContext.toggleEmbedBtn) {
        const visualNode = sel.containerId ? all.find((el) => el.id === sel.containerId) : sel;
        const nodeTextForEmbed = runtimeContext.getTextFromNode(all, visualNode, true, true).trim();
        // Regex matches only exact format: [[NoteName#SectionName]] or ![[NoteName#SectionName]] with optional alias
        const linkRegex = /^!?\[\[([^\]]+?#[^\]|]+)(?:\|[^\]]*)?\]\]$/;
        setButtonDisabled(runtimeContext.toggleEmbedBtn, !linkRegex.test(nodeTextForEmbed));
      }
      if (runtimeContext.pinBtn) {
        runtimeContext.pinBtn.setIcon(isPinned ? "pin" : "pin-off");
        runtimeContext.pinBtn.setTooltip(
          `${isPinned ? runtimeContext.t("PIN_TOOLTIP_PINNED") : runtimeContext.t("PIN_TOOLTIP_UNPINNED")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_PIN)}`,
        );
        setButtonDisabled(runtimeContext.pinBtn, false);
      }
      if (runtimeContext.submapRootBtn) {
        runtimeContext.submapRootBtn.setIcon(
          isAdditionalRoot ? "map-pin-minus-inside" : "map-pin-plus-inside",
        );
        runtimeContext.submapRootBtn.setTooltip(
          `${isAdditionalRoot ? runtimeContext.t("TOOLTIP_SUBMAP_ROOT_REMOVE") : runtimeContext.t("TOOLTIP_SUBMAP_ROOT_ADD")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_TOGGLE_SUBMAP_ROOT)}`,
        );
        setButtonDisabled(runtimeContext.submapRootBtn, isMasterRoot);
      }
      if (runtimeContext.editBtn) {
        setButtonDisabled(runtimeContext.editBtn, false);
        if (isEditing) {
          runtimeContext.editBtn.extraSettingsEl.style.color = "var(--interactive-accent)";
        } else {
          runtimeContext.editingNodeId = null;
          runtimeContext.editBtn.extraSettingsEl.style.color = "";
        }
      }
      const updateGroupBtn = (btn) => {
        if (!btn) {
          return;
        }
        const isGrouped =
          branchIds.length > 1 &&
          !!runtimeContext.getCommonGroupForElements(
            all.filter((el) => branchIds.includes(el.id)),
          )[0];
        btn.setIcon(isGrouped ? "ungroup" : "group");
        btn.setTooltip(
          `${isGrouped ? runtimeContext.t("TOGGLE_GROUP_TOOLTIP_UNGROUP") : runtimeContext.t("TOGGLE_GROUP_TOOLTIP_GROUP")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_TOGGLE_GROUP)}`,
        );
        setButtonDisabled(btn, runtimeContext.groupBranches || branchIds.length <= 1);
      };
      updateGroupBtn(runtimeContext.toggleGroupBtn);
      updateGroupBtn(runtimeContext.floatingGroupBtn);
      setButtonDisabled(runtimeContext.boxBtn, false);
      setButtonDisabled(runtimeContext.floatingBoxBtn, false);
      setButtonDisabled(runtimeContext.foldBtnL0, !hasChildren);
      setButtonDisabled(runtimeContext.foldBtnL1, !hasGrandChildren);
      setButtonDisabled(runtimeContext.foldBtnAll, !hasGrandChildren);
      setButtonDisabled(runtimeContext.zoomBtn, false);
      setButtonDisabled(runtimeContext.focusBtn, false);
      setButtonDisabled(runtimeContext.floatingZoomBtn, false);
      if (runtimeContext.boundaryBtn) {
        runtimeContext.boundaryBtn.setIcon(sel.customData?.boundaryId ? "cloud-off" : "cloud");
      }
      setButtonDisabled(runtimeContext.boundaryBtn, isMasterRootSelected);
      setButtonDisabled(runtimeContext.cutBtn, isMasterRootSelected);
      setButtonDisabled(runtimeContext.copyBtn, false);
      runtimeContext.copyMermaidBtn?.setDisabled(false);
      setButtonDisabled(runtimeContext.importOutlineBtn, !isLinkedFile);
      if (runtimeContext.refreshBtn) {
        setButtonDisabled(runtimeContext.refreshBtn, cd.autoLayoutDisabled === true);
        runtimeContext.refreshBtn.setTooltip(
          `${runtimeContext.t("TOOLTIP_REFRESH")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_REARRANGE)}`,
        );
      }
    } else {
      disableUI();
      if (runtimeContext.mostRecentlySelectedNodeID) {
        setButtonDisabled(runtimeContext.zoomBtn, false);
        setButtonDisabled(runtimeContext.focusBtn, false);
        setButtonDisabled(runtimeContext.floatingZoomBtn, false);
      }
      if (runtimeContext.inputEl && runtimeContext.inputEl.value.trim() !== "") {
        if (runtimeContext.toggleCheckboxBtn) {
          setButtonDisabled(runtimeContext.toggleCheckboxBtn, false);
        }
        if (runtimeContext.calendarBtn) {
          setButtonDisabled(runtimeContext.calendarBtn, false);
        }
      }
      // AutoLayoutToggle should be allowed to be configured for the NEXT map
      setButtonDisabled(runtimeContext.autoLayoutToggle, false);
    }
    // --- Preset Detection & UI Warning Logic ---
    const mapPresetName = cd?.presetName;
    if (isMapSelected) {
      runtimeContext.activePresetName = resolvePresetName(runtimeContext.mapPresets, mapPresetName);
      runtimeContext.setVal(runtimeContext.K_ACTIVE_PRESET, runtimeContext.activePresetName);
    } else {
      runtimeContext.activePresetName = resolvePresetName(
        runtimeContext.mapPresets,
        runtimeContext.getVal(runtimeContext.K_ACTIVE_PRESET, "Default"),
      );
    }
    if (runtimeContext.presetDropdown) {
      runtimeContext.presetDropdown.setValue(runtimeContext.activePresetName);
    }
    let showWarning = false;
    if (isMapSelected) {
      const presetConfig = runtimeContext.mapPresets[runtimeContext.activePresetName];
      const currentMapConfig = {
        growthMode: cd?.growthMode ?? runtimeContext.currentModalGrowthMode,
        arrowType: cd?.arrowType ?? runtimeContext.arrowType,
        fontsizeScale: cd?.fontsizeScale ?? runtimeContext.fontsizeScale,
        multicolor: typeof cd?.multicolor === "boolean" ? cd.multicolor : runtimeContext.multicolor,
        boxChildren:
          typeof cd?.boxChildren === "boolean" ? cd.boxChildren : runtimeContext.boxChildren,
        roundedCorners:
          typeof cd?.roundedCorners === "boolean"
            ? cd.roundedCorners
            : runtimeContext.roundedCorners,
        maxWrapWidth:
          typeof cd?.maxWrapWidth === "number" ? cd.maxWrapWidth : runtimeContext.maxWidth,
        isSolidArrow:
          typeof cd?.isSolidArrow === "boolean" ? cd.isSolidArrow : runtimeContext.isSolidArrow,
        centerText: typeof cd?.centerText === "boolean" ? cd.centerText : runtimeContext.centerText,
        fillSweep: typeof cd?.fillSweep === "boolean" ? cd.fillSweep : runtimeContext.fillSweep,
        branchScale: cd?.branchScale ?? runtimeContext.branchScale,
        baseStrokeWidth:
          typeof cd?.baseStrokeWidth === "number"
            ? cd.baseStrokeWidth
            : runtimeContext.baseStrokeWidth,
        customPalette: cd?.customPalette ?? runtimeContext.customPalette,
        layoutSettings: cd?.layoutSettings ?? runtimeContext.layoutSettings,
      };
      showWarning = runtimeContext.diffMapConfig(presetConfig, currentMapConfig);
    }
    if (runtimeContext.presetWarningEl) {
      runtimeContext.presetWarningEl.style.display = showWarning ? "block" : "none";
    }
    if (runtimeContext.presetApplyBtn) {
      setButtonDisabled(runtimeContext.presetApplyBtn, !isMapSelected);
    }
    if (runtimeContext.presetTrashBtn) {
      setButtonDisabled(
        runtimeContext.presetTrashBtn,
        runtimeContext.activePresetName === "Default",
      );
    }
    if (runtimeContext.presetSaveBtn) {
      setButtonDisabled(runtimeContext.presetSaveBtn, false);
    }
    // --- Sync Globals if Map Selected ---
    // Using explicit fallback to getVal() if property is missing prevents state leakage
    // from previously selected maps onto legacy maps lacking these properties.
    // The variables are committed to global storage to ensure continuity if user deselects to start a new map.
    if (isMapSelected) {
      runtimeContext.currentModalGrowthMode =
        typeof cd.growthMode === "string" && runtimeContext.GROWTH_TYPES.includes(cd.growthMode)
          ? cd.growthMode
          : runtimeContext.getVal(runtimeContext.K_GROWTH, "Right-Left");
      runtimeContext.setVal(runtimeContext.K_GROWTH, runtimeContext.currentModalGrowthMode);
      runtimeContext.autoLayoutDisabled = cd.autoLayoutDisabled === true;
      runtimeContext.arrowType =
        typeof cd.arrowType === "string" && runtimeContext.ARROW_TYPES.includes(cd.arrowType)
          ? cd.arrowType
          : runtimeContext.getVal(runtimeContext.K_ARROW_TYPE, "curved");
      runtimeContext.setVal(runtimeContext.K_ARROW_TYPE, runtimeContext.arrowType);
      runtimeContext.fontsizeScale =
        cd.fontsizeScale ?? runtimeContext.getVal(runtimeContext.K_FONTSIZE, "Normal Scale");
      runtimeContext.setVal(runtimeContext.K_FONTSIZE, runtimeContext.fontsizeScale);
      runtimeContext.multicolor =
        typeof cd.multicolor === "boolean"
          ? cd.multicolor
          : runtimeContext.getVal(runtimeContext.K_MULTICOLOR, true);
      runtimeContext.setVal(runtimeContext.K_MULTICOLOR, runtimeContext.multicolor);
      runtimeContext.boxChildren =
        typeof cd.boxChildren === "boolean"
          ? cd.boxChildren
          : runtimeContext.getVal(runtimeContext.K_BOX, false);
      runtimeContext.setVal(runtimeContext.K_BOX, runtimeContext.boxChildren);
      runtimeContext.roundedCorners =
        typeof cd.roundedCorners === "boolean"
          ? cd.roundedCorners
          : runtimeContext.getVal(runtimeContext.K_ROUND, false);
      runtimeContext.setVal(runtimeContext.K_ROUND, runtimeContext.roundedCorners);
      runtimeContext.maxWidth =
        typeof cd.maxWrapWidth === "number"
          ? cd.maxWrapWidth
          : parseInt(runtimeContext.getVal(runtimeContext.K_WIDTH, 450)) || 450;
      runtimeContext.setVal(runtimeContext.K_WIDTH, runtimeContext.maxWidth);
      runtimeContext.isSolidArrow =
        typeof cd.isSolidArrow === "boolean"
          ? cd.isSolidArrow
          : runtimeContext.getVal(runtimeContext.K_ARROWSTROKE, true);
      runtimeContext.setVal(runtimeContext.K_ARROWSTROKE, runtimeContext.isSolidArrow);
      runtimeContext.centerText =
        typeof cd.centerText === "boolean"
          ? cd.centerText
          : runtimeContext.getVal(runtimeContext.K_CENTERTEXT, true);
      runtimeContext.setVal(runtimeContext.K_CENTERTEXT, runtimeContext.centerText);
      runtimeContext.fillSweep =
        typeof cd.fillSweep === "boolean"
          ? cd.fillSweep
          : runtimeContext.getVal(runtimeContext.K_FILL_SWEEP, false);
      runtimeContext.setVal(runtimeContext.K_FILL_SWEEP, runtimeContext.fillSweep);
      runtimeContext.branchScale =
        cd.branchScale && runtimeContext.BRANCH_SCALE_TYPES.includes(cd.branchScale)
          ? cd.branchScale
          : runtimeContext.getVal(runtimeContext.K_BRANCH_SCALE, "Hierarchical");
      runtimeContext.setVal(runtimeContext.K_BRANCH_SCALE, runtimeContext.branchScale);
      runtimeContext.baseStrokeWidth =
        typeof cd.baseStrokeWidth === "number"
          ? cd.baseStrokeWidth
          : parseFloat(runtimeContext.getVal(runtimeContext.K_BASE_WIDTH, 6)) || 6;
      runtimeContext.setVal(runtimeContext.K_BASE_WIDTH, runtimeContext.baseStrokeWidth);
      if (cd.customPalette) {
        runtimeContext.customPalette = JSON.parse(JSON.stringify(cd.customPalette));
      } else {
        runtimeContext.customPalette = runtimeContext.getVal(runtimeContext.K_PALETTE, {
          enabled: false,
          random: false,
          colors: [],
        }) || { enabled: false, random: false, colors: [] };
      }
      runtimeContext.setVal(runtimeContext.K_PALETTE, runtimeContext.customPalette, true);
      if (cd.layoutSettings && typeof cd.layoutSettings === "object") {
        runtimeContext.layoutSettings = { ...runtimeContext.layoutSettings, ...cd.layoutSettings };
      } else {
        const globalDefaults = runtimeContext.getVal(runtimeContext.K_LAYOUT, {});
        Object.keys(runtimeContext.LAYOUT_METADATA).forEach((k) => {
          runtimeContext.layoutSettings[k] =
            globalDefaults[k] !== undefined
              ? globalDefaults[k]
              : runtimeContext.LAYOUT_METADATA[k].def;
        });
      }
      runtimeContext.setVal(runtimeContext.K_LAYOUT, runtimeContext.layoutSettings, true);
    }
    // --- Unconditionally Sync Visual UI Components to Current Globals ---
    if (runtimeContext.strategyDropdown) {
      runtimeContext.strategyDropdown.setValue(runtimeContext.currentModalGrowthMode);
    }
    if (runtimeContext.autoLayoutToggle) {
      runtimeContext.autoLayoutToggle.setValue(!runtimeContext.autoLayoutDisabled);
    }
    if (runtimeContext.arrowTypeToggle) {
      runtimeContext.arrowTypeToggle.setValue(runtimeContext.arrowType === "curved");
    }
    if (runtimeContext.fontSizeDropdown) {
      runtimeContext.fontSizeDropdown.setValue(runtimeContext.fontsizeScale);
    }
    if (runtimeContext.colorToggle) {
      runtimeContext.colorToggle.setValue(runtimeContext.multicolor);
    }
    if (runtimeContext.boxToggle) {
      runtimeContext.boxToggle.setValue(runtimeContext.boxChildren);
    }
    if (runtimeContext.roundToggle) {
      runtimeContext.roundToggle.setValue(runtimeContext.roundedCorners);
    }
    if (runtimeContext.widthSlider) {
      runtimeContext.widthSlider.setValue(runtimeContext.maxWidth);
      if (runtimeContext.widthSlider.valLabelEl) {
        runtimeContext.widthSlider.valLabelEl.setText(`${runtimeContext.maxWidth}px`);
      }
    }
    if (runtimeContext.strokeToggle) {
      runtimeContext.strokeToggle.setValue(!runtimeContext.isSolidArrow);
    }
    if (runtimeContext.centerToggle) {
      runtimeContext.centerToggle.setValue(runtimeContext.centerText);
    }
    if (runtimeContext.fillSweepToggle) {
      runtimeContext.fillSweepToggle.setValue(runtimeContext.fillSweep);
    }
    if (runtimeContext.branchScaleDropdown) {
      runtimeContext.branchScaleDropdown.setValue(runtimeContext.branchScale);
    }
    if (runtimeContext.baseWidthSlider) {
      runtimeContext.baseWidthSlider.setValue(runtimeContext.baseStrokeWidth);
      if (runtimeContext.baseWidthSlider.valLabelEl) {
        runtimeContext.baseWidthSlider.valLabelEl.setText(`${runtimeContext.baseStrokeWidth}`);
      }
    }
    if (runtimeContext.fillSweepToggleSetting && runtimeContext.fillSweepToggleSetting.settingEl) {
      runtimeContext.fillSweepToggleSetting.settingEl.style.display =
        runtimeContext.currentModalGrowthMode === "Radial" ? "" : "none";
    }
    runtimeContext.disableTabEvents = false;
  };
  return { revealInputEl, focusInputEl, setButtonDisabled, disableUI, updateUI };
}
