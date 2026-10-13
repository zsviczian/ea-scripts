/**
 * @file sidepanelControls.js
 * @overview sidepanel Controls implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
import { HotkeyRecorder } from "./HotkeyRecorder";

export function createSidepanelControls(runtimeContext) {
  const hotkeyRecorder = new HotkeyRecorder(
    app.keymap,
    () => new runtimeContext.ea.obsidian.Scope(),
  );
  runtimeContext.ea.registerCleanup?.(() => hotkeyRecorder.cancel());
  /**
   * Renders the main settings body and UI actions for the sidepanel.
   * Includes the preset dropdown block for saving, deleting, applying, and creating named configurations.
   *
   * @param {HTMLElement} contentEl - The parent DOM element to render into.
   */
  const renderBody = (contentEl) => {
    runtimeContext.bodyContainer = contentEl.createDiv();
    runtimeContext.bodyContainer.style.width = "100%";
    runtimeContext.bodyContainer.createEl("hr");
    // --- Map Preset Manager UI ---
    const presetSetting = new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("PRESET_LABEL"))
      .addDropdown((d) => {
        runtimeContext.presetDropdown = d;
        runtimeContext.refreshPresetDropdown();
        d.onChange(async (v) => {
          runtimeContext.activePresetName = v;
          runtimeContext.setVal(runtimeContext.K_ACTIVE_PRESET, v);
          const sel = runtimeContext.getMindmapNodeFromSelection();
          if (sel) {
            await runtimeContext.applyPresetToMap(v, sel);
            new runtimeContext.Notice(runtimeContext.t("NOTICE_PRESET_APPLIED"));
          } else {
            runtimeContext.applyPresetToGlobals(v);
            runtimeContext.updateUI();
          }
        });
      });
    presetSetting.addExtraButton((btn) => {
      runtimeContext.presetSaveBtn = btn;
      btn
        .setIcon("save")
        .setTooltip(runtimeContext.t("PRESET_BTN_SAVE"))
        .onClick(async () => {
          if (!runtimeContext.activePresetName) return;
          runtimeContext.mapPresets[runtimeContext.activePresetName] =
            runtimeContext.extractConfigFromGlobals();
          runtimeContext.setVal(runtimeContext.K_PRESETS, runtimeContext.mapPresets, true);
          new runtimeContext.Notice(runtimeContext.t("NOTICE_PRESET_SAVED"));
          runtimeContext.updateUI();
        });
    });
    presetSetting.addExtraButton((btn) => {
      runtimeContext.presetTrashBtn = btn;
      btn
        .setIcon("trash-2")
        .setTooltip(runtimeContext.t("PRESET_BTN_DELETE"))
        .onClick(async () => {
          if (!runtimeContext.activePresetName || runtimeContext.activePresetName === "Default")
            return;
          delete runtimeContext.mapPresets[runtimeContext.activePresetName];
          runtimeContext.activePresetName = "Default";
          runtimeContext.setVal(runtimeContext.K_PRESETS, runtimeContext.mapPresets, true);
          runtimeContext.setVal(runtimeContext.K_ACTIVE_PRESET, runtimeContext.activePresetName);
          new runtimeContext.Notice(runtimeContext.t("NOTICE_PRESET_DELETED"));
          runtimeContext.refreshPresetDropdown();
          runtimeContext.updateUI();
        });
    });
    presetSetting.addExtraButton((btn) => {
      runtimeContext.presetPlusBtn = btn;
      btn
        .setIcon("plus")
        .setTooltip(runtimeContext.t("PRESET_BTN_NEW"))
        .onClick(async () => {
          const name = await runtimeContext.utils.inputPrompt(
            runtimeContext.t("PROMPT_NEW_PRESET_NAME"),
          );
          if (name && name.trim()) {
            const trimmed = name.trim();
            runtimeContext.mapPresets[trimmed] = runtimeContext.extractConfigFromGlobals();
            runtimeContext.activePresetName = trimmed;
            runtimeContext.setVal(runtimeContext.K_PRESETS, runtimeContext.mapPresets, true);
            runtimeContext.setVal(runtimeContext.K_ACTIVE_PRESET, runtimeContext.activePresetName);
            runtimeContext.refreshPresetDropdown();
            const sel = runtimeContext.getMindmapNodeFromSelection();
            if (sel) {
              await runtimeContext.updateRootNodeCustomData(
                { presetName: runtimeContext.activePresetName },
                sel,
              );
            }
            new runtimeContext.Notice(runtimeContext.t("NOTICE_PRESET_SAVED"));
            runtimeContext.updateUI();
          }
        });
    });
    presetSetting.addExtraButton((btn) => {
      runtimeContext.presetApplyBtn = btn;
      btn
        .setIcon("refresh-cw")
        .setTooltip(runtimeContext.t("PRESET_BTN_APPLY"))
        .onClick(async () => {
          const sel = runtimeContext.getMindmapNodeFromSelection();
          if (sel && runtimeContext.activePresetName) {
            await runtimeContext.applyPresetToMap(runtimeContext.activePresetName, sel);
            new runtimeContext.Notice(runtimeContext.t("NOTICE_PRESET_APPLIED"));
          }
        });
    });
    runtimeContext.presetWarningEl = runtimeContext.bodyContainer.createEl("div", {
      text: runtimeContext.t("PRESET_WARNING_MODIFIED"),
      cls: "mod-warning",
      attr: {
        style:
          "font-size: 0.85em; margin-top: -10px; margin-bottom: 10px; display: none; text-align: right;",
      },
    });
    runtimeContext.bodyContainer.createEl("hr");
    // --- End Map Preset Manager UI ---
    const zoomSetting = new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer);
    zoomSetting.setName(runtimeContext.t("LABEL_ZOOM_LEVEL")).addDropdown((d) => {
      runtimeContext.ZOOM_TYPES.forEach((key) => d.addOption(key, key));
      d.setValue(runtimeContext.zoomLevel);
      d.onChange((v) => {
        runtimeContext.zoomLevel = v;
        if (runtimeContext.disableTabEvents) return;
        runtimeContext.setVal(runtimeContext.K_ZOOM, v);
        runtimeContext.zoomToFit();
      });
    });
    zoomSetting.addExtraButton((btn) => {
      runtimeContext.zoomBtn = btn;
      btn
        .setIcon("scan-search")
        .setTooltip(
          `${runtimeContext.t("TOOLTIP_ZOOM_CYCLE")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_ZOOM)}`,
        )
        .onClick(() => runtimeContext.performAction(runtimeContext.ACTION_ZOOM));
    });
    new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_GROWTH_STRATEGY"))
      .addDropdown((d) => {
        runtimeContext.strategyDropdown = d;
        runtimeContext.GROWTH_TYPES.forEach((key) => d.addOption(key, key));
        d.setValue(runtimeContext.currentModalGrowthMode);
        d.onChange(async (v) => {
          runtimeContext.currentModalGrowthMode = v;
          if (runtimeContext.disableTabEvents) return;
          runtimeContext.setVal(runtimeContext.K_GROWTH, v);
          if (runtimeContext.fillSweepToggleSetting) {
            runtimeContext.fillSweepToggleSetting.settingEl.style.display =
              v === "Radial" ? "" : "none";
          }
          if (!runtimeContext.isViewSet()) return;
          const sel = runtimeContext.getMindmapNodeFromSelection();
          if (!sel) return;
          await runtimeContext.updateRootNodeCustomData(
            {
              growthMode: v,
            },
            sel,
          );
          await runtimeContext.refreshMapLayout(sel);
        });
      });
    runtimeContext.fillSweepToggleSetting = new runtimeContext.ea.obsidian.Setting(
      runtimeContext.bodyContainer,
    )
      .setName(runtimeContext.t("LABEL_FILL_SWEEP"))
      .setDesc(runtimeContext.t("DESC_FILL_SWEEP"))
      .addToggle((t) => {
        runtimeContext.fillSweepToggle = t;
        t.setValue(runtimeContext.fillSweep).onChange(async (v) => {
          runtimeContext.fillSweep = v;
          if (runtimeContext.disableTabEvents) return;
          runtimeContext.setVal(runtimeContext.K_FILL_SWEEP, v);
          if (!runtimeContext.isViewSet()) return;
          const sel = runtimeContext.getMindmapNodeFromSelection();
          if (!sel) return;
          await runtimeContext.updateRootNodeCustomData(
            {
              fillSweep: v,
            },
            sel,
          );
          await runtimeContext.refreshMapLayout(sel);
        });
      });
    if (runtimeContext.currentModalGrowthMode !== "Radial") {
      runtimeContext.fillSweepToggleSetting.settingEl.style.display = "none";
    }
    new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_AUTO_LAYOUT"))
      .addToggle((t) => {
        runtimeContext.autoLayoutToggle = t;
        t.setValue(!runtimeContext.autoLayoutDisabled).onChange(async (v) => {
          const sel = runtimeContext.getMindmapNodeFromSelection();
          if (!sel) return;
          runtimeContext.autoLayoutDisabled = !v;
          if (runtimeContext.disableTabEvents) return;
          await runtimeContext.updateRootNodeCustomData(
            {
              autoLayoutDisabled: runtimeContext.autoLayoutDisabled,
            },
            sel,
          );
          await runtimeContext.refreshMapLayout(sel);
        });
      })
      .addExtraButton((btn) =>
        btn
          .setIcon("pencil-ruler")
          .setTooltip(runtimeContext.t("TOOLTIP_CONFIGURE_LAYOUT"))
          .onClick(() => {
            const modal = new runtimeContext.LayoutConfigModal(
              app,
              runtimeContext.layoutSettings,
              async (newSettings) => {
                runtimeContext.layoutSettings = newSettings;
                runtimeContext.setVal(runtimeContext.K_LAYOUT, runtimeContext.layoutSettings, true);
                const sel = runtimeContext.getMindmapNodeFromSelection();
                if (!sel) return;
                await runtimeContext.updateRootNodeCustomData(
                  {
                    layoutSettings: newSettings,
                  },
                  sel,
                );
                const allElements = runtimeContext.ea.getViewElements();
                const hierarchy = runtimeContext.getHierarchy(sel, allElements);
                const masterRoot = allElements.find((el) => el.id === hierarchy.rootId) ?? sel;
                await runtimeContext.refreshMapLayout(masterRoot);
              },
            );
            modal.open();
          }),
      );
    new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_GROUP_BRANCHES"))
      .addToggle((t) =>
        t.setValue(runtimeContext.groupBranches).onChange(async (v) => {
          if (!runtimeContext.isViewSet()) return;
          runtimeContext.groupBranches = v;
          if (runtimeContext.disableTabEvents) return;
          runtimeContext.setVal(runtimeContext.K_GROUP, v);
          await runtimeContext.refreshMapLayout();
          runtimeContext.updateUI();
        }),
      )
      .addExtraButton((btn) => {
        runtimeContext.toggleGroupBtn = btn;
        btn.setIcon("group");
        btn.setTooltip(
          `${runtimeContext.t("TOOLTIP_TOGGLE_GROUP_BTN")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_TOGGLE_GROUP)}`,
        );
        btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_TOGGLE_GROUP));
      });
    runtimeContext.bodyContainer.createEl("hr");
    new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_BOX_CHILD_NODES"))
      .addToggle((t) => {
        runtimeContext.boxToggle = t;
        t.setValue(runtimeContext.boxChildren).onChange(async (v) => {
          runtimeContext.boxChildren = v;
          if (runtimeContext.disableTabEvents) return;
          runtimeContext.setVal(runtimeContext.K_BOX, v);
          await runtimeContext.updateRootNodeCustomData({
            boxChildren: v,
          });
        });
      })
      .addExtraButton((btn) => {
        runtimeContext.boxBtn = btn;
        btn.setIcon("rectangle-horizontal");
        btn.setTooltip(
          `${runtimeContext.t("TOOLTIP_TOGGLE_BOX")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_BOX)}`,
        );
        btn.onClick(() => runtimeContext.performAction(runtimeContext.ACTION_BOX));
      });
    new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_ROUNDED_CORNERS"))
      .addToggle((t) => {
        runtimeContext.roundToggle = t;
        t.setValue(runtimeContext.roundedCorners).onChange(async (v) => {
          runtimeContext.roundedCorners = v;
          if (runtimeContext.disableTabEvents) return;
          runtimeContext.setVal(runtimeContext.K_ROUND, v);
          await runtimeContext.updateRootNodeCustomData({
            roundedCorners: v,
          });
        });
      });
    runtimeContext.bodyContainer.createEl("hr");
    new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_ARROW_TYPE"))
      .addToggle((t) => {
        runtimeContext.arrowTypeToggle = t;
        t.setValue(runtimeContext.arrowType === "curved").onChange(async (v) => {
          runtimeContext.arrowType = v ? "curved" : "straight";
          if (runtimeContext.disableTabEvents) return;
          runtimeContext.setVal(runtimeContext.K_ARROW_TYPE, runtimeContext.arrowType);
          if (!runtimeContext.isViewSet()) return;
          const sel = runtimeContext.getMindmapNodeFromSelection();
          if (!sel) return;
          await runtimeContext.updateRootNodeCustomData(
            {
              arrowType: runtimeContext.arrowType,
            },
            sel,
          );
          await runtimeContext.refreshMapLayout(sel);
        });
      });
    new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_USE_SCENE_STROKE"))
      .setDesc(runtimeContext.t("DESC_USE_SCENE_STROKE"))
      .addToggle((t) => {
        runtimeContext.strokeToggle = t;
        t.setValue(!runtimeContext.isSolidArrow).onChange(async (v) => {
          runtimeContext.isSolidArrow = !v;
          if (runtimeContext.disableTabEvents) return;
          runtimeContext.setVal(runtimeContext.K_ARROWSTROKE, !v);
          await runtimeContext.updateRootNodeCustomData({
            isSolidArrow: !v,
          });
        });
      });
    new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_BRANCH_SCALE"))
      .addDropdown((d) => {
        runtimeContext.branchScaleDropdown = d;
        runtimeContext.BRANCH_SCALE_TYPES.forEach((key) => d.addOption(key, key));
        d.setValue(runtimeContext.branchScale);
        d.onChange(async (v) => {
          const oldScale = runtimeContext.branchScale;
          runtimeContext.branchScale = v;
          if (runtimeContext.disableTabEvents) return;
          runtimeContext.setVal(runtimeContext.K_BRANCH_SCALE, v);
          const info = await runtimeContext.updateRootNodeCustomData({
            branchScale: v,
          });
          if (info) {
            await runtimeContext.updateBranchStrokes(
              info.rootId,
              runtimeContext.baseStrokeWidth,
              oldScale,
              runtimeContext.baseStrokeWidth,
              runtimeContext.branchScale,
            );
          }
        });
      });
    let baseWidthDisplay;
    let baseWidthUpdateTimer = null;
    let baseWidthSnapshot = null;
    const baseWidthSetting = new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_BASE_WIDTH"))
      .addSlider((s) => {
        runtimeContext.baseWidthSlider = s;
        s.setLimits(0.2, 16, 0.1)
          .setValue(runtimeContext.baseStrokeWidth)
          .onChange((v) => {
            if (baseWidthUpdateTimer) clearTimeout(baseWidthUpdateTimer);
            if (!runtimeContext.disableTabEvents && baseWidthSnapshot === null)
              baseWidthSnapshot = runtimeContext.baseStrokeWidth;
            runtimeContext.baseStrokeWidth = v;
            baseWidthDisplay.setText(`${v}`);
            if (runtimeContext.disableTabEvents) return;
            runtimeContext.setVal(runtimeContext.K_BASE_WIDTH, v);
            baseWidthUpdateTimer = setTimeout(async () => {
              const info = await runtimeContext.updateRootNodeCustomData({
                baseStrokeWidth: v,
              });
              if (info) {
                await runtimeContext.updateBranchStrokes(
                  info.rootId,
                  baseWidthSnapshot,
                  runtimeContext.branchScale,
                  runtimeContext.baseStrokeWidth,
                  runtimeContext.branchScale,
                );
              }
              baseWidthSnapshot = null;
              baseWidthUpdateTimer = null;
            }, 500);
          });
      });
    baseWidthDisplay = baseWidthSetting.descEl.createSpan({
      text: `${runtimeContext.baseStrokeWidth}`,
      attr: {
        style: "margin-left:10px; font-weight:bold;",
      },
    });
    if (runtimeContext.baseWidthSlider)
      runtimeContext.baseWidthSlider.valLabelEl = baseWidthDisplay;
    new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_MULTICOLOR_BRANCHES"))
      .addToggle((t) => {
        runtimeContext.colorToggle = t;
        t.setValue(runtimeContext.multicolor).onChange(async (v) => {
          runtimeContext.multicolor = v;
          if (runtimeContext.disableTabEvents) return;
          runtimeContext.setVal(runtimeContext.K_MULTICOLOR, v);
          await runtimeContext.updateRootNodeCustomData({
            multicolor: v,
          });
        });
      })
      .addExtraButton((btn) =>
        btn
          .setIcon("palette")
          .setTooltip(runtimeContext.t("TOOLTIP_CONFIGURE_PALETTE"))
          .onClick(() => {
            const modal = new runtimeContext.PaletteManagerModal(
              app,
              runtimeContext.customPalette,
              (newSettings) => {
                runtimeContext.customPalette = newSettings;
                runtimeContext.setVal(runtimeContext.K_PALETTE, runtimeContext.customPalette, true);
              },
            );
            modal.open();
          }),
      );
    runtimeContext.bodyContainer.createEl("hr");
    let sliderValDisplay;
    const sliderSetting = new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_MAX_WRAP_WIDTH"))
      .addSlider((s) => {
        runtimeContext.widthSlider = s;
        s.setLimits(
          runtimeContext.WRAP_WIDTH_MIN,
          runtimeContext.WRAP_WIDTH_MAX,
          runtimeContext.WRAP_WIDTH_STEP,
        )
          .setValue(runtimeContext.maxWidth)
          .onChange(async (v) => {
            runtimeContext.maxWidth = v;
            sliderValDisplay.setText(`${v}px`);
            if (runtimeContext.disableTabEvents) return;
            runtimeContext.setVal(runtimeContext.K_WIDTH, v);
            await runtimeContext.updateRootNodeCustomData({
              maxWrapWidth: v,
            });
          });
      });
    sliderValDisplay = sliderSetting.descEl.createSpan({
      text: `${runtimeContext.maxWidth}px`,
      attr: {
        style: "margin-left:10px; font-weight:bold;",
      },
    });
    if (runtimeContext.widthSlider) runtimeContext.widthSlider.valLabelEl = sliderValDisplay;
    new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_CENTER_TEXT"))
      .setDesc(runtimeContext.t("DESC_CENTER_TEXT"))
      .addToggle((t) => {
        runtimeContext.centerToggle = t;
        t.setValue(runtimeContext.centerText).onChange(async (v) => {
          runtimeContext.centerText = v;
          if (runtimeContext.disableTabEvents) return;
          runtimeContext.setVal(runtimeContext.K_CENTERTEXT, v);
          await runtimeContext.updateRootNodeCustomData({
            centerText: v,
          });
        });
      });
    new runtimeContext.ea.obsidian.Setting(runtimeContext.bodyContainer)
      .setName(runtimeContext.t("LABEL_FONT_SIZES"))
      .addDropdown((d) => {
        runtimeContext.fontSizeDropdown = d;
        runtimeContext.FONT_SCALE_TYPES.forEach((key) => d.addOption(key, key));
        d.setValue(runtimeContext.fontsizeScale);
        d.onChange(async (v) => {
          runtimeContext.fontsizeScale = v;
          if (runtimeContext.disableTabEvents) return;
          runtimeContext.setVal(runtimeContext.K_FONTSIZE, v);
          await runtimeContext.updateRootNodeCustomData({
            fontsizeScale: v,
          });
        });
      });
    // ------------------------------------
    // Hotkey Configuration Section
    // ------------------------------------
    runtimeContext.bodyContainer.createEl("hr");
    const hkDetails = runtimeContext.bodyContainer.createEl("details", {
      attr: {
        style: "margin-right: 5px; margin-left: 5px;",
      },
    });
    hkDetails.createEl("summary", {
      text: runtimeContext.t("HOTKEY_SECTION_TITLE"),
      attr: {
        style: "cursor: pointer; font-weight: bold;",
      },
    });
    const hkContainer = hkDetails.createDiv();
    const hint = hkContainer.createEl("p", {
      text: runtimeContext.t("HOTKEY_HINT"),
      attr: {
        style: "color: var(--text-muted); font-size: 0.85em; margin-bottom: 10px;",
      },
    });
    const refreshHotkeys = () => {
      runtimeContext.RUNTIME_HOTKEYS = runtimeContext.generateRuntimeHotkeys();
      // Re-register scope if currently active
      runtimeContext.registerObsidianHotkeyOverrides();
      // Ensure event listeners are attached to the correct window
      runtimeContext.updateKeyHandlerLocation();
    };
    const saveHotkeys = () => {
      // Strip out structural keys before saving to settings to maintain a single source of truth
      const hotkeysToSave = runtimeContext.userHotkeys.map((h) => {
        const { isInputOnly, requiresNode, isNavigation, hidden, ...configurableProps } = h;
        return configurableProps;
      });
      runtimeContext.setVal(runtimeContext.K_HOTKEYS, hotkeysToSave, true);
      refreshHotkeys();
    };
    const isModified = (current) => {
      const def = runtimeContext.DEFAULT_HOTKEYS.find((d) => d.action === current.action);
      if (!def) return false;
      const k1 = current.code || current.key;
      const k2 = def.code || def.key;
      if (k1 !== k2) return true;
      if (current.modifiers.length !== def.modifiers.length) return true;
      // Check if every modifier in current exists in def
      return !current.modifiers.every((m) => def.modifiers.includes(m));
    };
    const recordHotkey = (btn, hIndex, onUpdate) => {
      hotkeyRecorder.cancel();
      const originalText = btn.innerHTML;
      const label = btn.parentElement.querySelector(".setting-hotkey");
      btn.innerHTML = runtimeContext.t("RECORD_HOTKEY_PROMPT");
      btn.addClass("is-recording");
      runtimeContext.isRecordingHotkey = true;
      const cancel = () => hotkeyRecorder.cancel();
      const cleanup = () => {
        btn.innerHTML = originalText;
        btn.removeClass("is-recording");
        if (runtimeContext.cancelHotkeyRecording === cancel) {
          runtimeContext.isRecordingHotkey = false;
          runtimeContext.cancelHotkeyRecording = null;
        }
      };
      runtimeContext.cancelHotkeyRecording = cancel;
      const handler = (e) => {
        if (e.key === "Escape") {
          return false;
        }
        // Ignore modifier-only presses (but return false to block them from bubbling)
        if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return false;
        const mods = [];
        if (e.ctrlKey) mods.push("Ctrl");
        if (e.metaKey) mods.push("Meta");
        if (e.altKey) mods.push("Alt");
        if (e.shiftKey) mods.push("Shift");
        let key = e.key;
        let code = e.code;
        if (key === " ") key = "Space";
        const targetConfig = runtimeContext.userHotkeys[hIndex];
        const isNav = targetConfig.isNavigation;
        // Validation
        if (isNav && !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) {
          new runtimeContext.Notice(runtimeContext.t("NOTICE_ACTION_REQUIRES_ARROWS"));
          return false;
        }
        // Check conflicts
        const conflict = runtimeContext.userHotkeys.find((h, i) => {
          if (i === hIndex) return false;
          const sameMods =
            h.modifiers.length === mods.length && h.modifiers.every((m) => mods.includes(m));
          if (!sameMods) return false;
          if (h.isNavigation && isNav) return true;
          if (h.isNavigation && key.startsWith("Arrow")) return true;
          const hKey = h.code ? h.code.replace("Key", "").replace("Digit", "") : h.key;
          const eKey = code ? code.replace("Key", "").replace("Digit", "") : key;
          return hKey.toLowerCase() === eKey.toLowerCase();
        });
        if (conflict) {
          label.style.color = "var(--text-error)";
          new runtimeContext.Notice(
            runtimeContext.t("NOTICE_CONFLICT_WITH_ACTION", {
              action: runtimeContext.getActionLabel(conflict.action),
            }),
            runtimeContext.NOTICE_DURATION_CONFLICT,
          );
          setTimeout(() => (label.style.color = ""), 4000);
        } else {
          if (isNav) {
            targetConfig.modifiers = mods.map((m) => (m === "Ctrl" || m === "Meta" ? "Mod" : m));
          } else {
            targetConfig.modifiers = mods.map((m) => (m === "Ctrl" || m === "Meta" ? "Mod" : m));
            if (code && (code.startsWith("Key") || code.startsWith("Digit"))) {
              targetConfig.code = code;
              delete targetConfig.key;
            } else {
              targetConfig.key = key;
              delete targetConfig.code;
            }
          }
          saveHotkeys();
          if (targetConfig.scope === runtimeContext.SCOPE.global) {
            const obsConflict = runtimeContext.getObsidianConflict(targetConfig);
            if (obsConflict) {
              new runtimeContext.Notice(
                runtimeContext.t("NOTICE_OBSIDIAN_HOTKEY_CONFLICT", {
                  command: obsConflict,
                }),
                runtimeContext.NOTICE_DURATION_GLOBAL_CONFLICT,
              );
            }
          }
          if (onUpdate) onUpdate();
        }
        // Return false to preventDefault and stop propagation within Obsidian's keymap
        return false;
      };
      hotkeyRecorder.start(handler, cleanup);
    };
    runtimeContext.userHotkeys.forEach((h, index) => {
      if (h.hidden) return;
      const setting = new runtimeContext.ea.obsidian.Setting(hkContainer).setName(
        runtimeContext.getActionLabel(h.action),
      );
      setting.settingEl.style.paddingRight = "0";
      setting.settingEl.style.paddingLeft = "0";
      const controlDiv = setting.controlEl;
      controlDiv.addClass("setting-item-control");
      let scopeBtn = null;
      let updateScopeUI = null;
      const hotkeyDisplay = controlDiv.createDiv("setting-command-hotkeys");
      const span = hotkeyDisplay.createSpan("setting-hotkey");
      const restoreBtn = controlDiv.createSpan("clickable-icon setting-restore-hotkey-button");
      const updateRowUI = () => {
        span.textContent = runtimeContext.getHotkeyDisplayString(runtimeContext.userHotkeys[index]);
        restoreBtn.style.display = isModified(runtimeContext.userHotkeys[index]) ? "" : "none";
        if (updateScopeUI) updateScopeUI();
        const existingAlert = hotkeyDisplay.querySelector(".hotkey-conflict-icon");
        if (existingAlert) existingAlert.remove();
        span.removeClass("has-conflict");
        span.style.color = "";
        if (runtimeContext.userHotkeys[index].scope === runtimeContext.SCOPE.global) {
          const conflict = runtimeContext.getObsidianConflict(runtimeContext.userHotkeys[index]);
          if (conflict) {
            span.addClass("has-conflict");
            const alert = hotkeyDisplay.createSpan("hotkey-conflict-icon");
            alert.innerHTML = runtimeContext.ea.obsidian.getIcon("octagon-alert").outerHTML;
            alert.style.color = "var(--text-error)";
            alert.style.marginRight = "calc(-1 * var(--size-2-2))";
            alert.style.display = "inline-flex"; // Ensure it sits nicely next to text
            alert.style.cursor = "pointer";
            alert.ariaLabel = runtimeContext.t("ARIA_OVERRIDE_COMMAND", {
              command: conflict,
            });
            alert.onclick = (e) => {
              e.preventDefault();
              e.stopPropagation();
              new runtimeContext.Notice(
                runtimeContext.t("NOTICE_GLOBAL_HOTKEY_CONFLICT", {
                  command: conflict,
                }),
                runtimeContext.NOTICE_DURATION_GLOBAL_CONFLICT,
              );
            };
          }
        }
      };
      if (!h.isInputOnly) {
        scopeBtn = controlDiv.createSpan("clickable-icon setting-global-hotkey-button");
        scopeBtn.style.marginRight = "calc(-1 * var(--size-2-2))";
        updateScopeUI = () => {
          const scope = runtimeContext.userHotkeys[index].scope;
          switch (scope) {
            case runtimeContext.SCOPE.input:
              scopeBtn.innerHTML = runtimeContext.ea.obsidian.getIcon("keyboard").outerHTML;
              scopeBtn.ariaLabel = runtimeContext.t("ARIA_SCOPE_INPUT");
              scopeBtn.style.color = "var(--text-muted)";
              break;
            case runtimeContext.SCOPE.excalidraw:
              scopeBtn.innerHTML = runtimeContext.ea.obsidian.getIcon("excalidraw-icon").outerHTML;
              scopeBtn.ariaLabel = runtimeContext.t("ARIA_SCOPE_EXCALIDRAW");
              scopeBtn.style.color = "var(--interactive-accent)";
              break;
            case runtimeContext.SCOPE.global:
              scopeBtn.innerHTML = runtimeContext.ea.obsidian.getIcon("globe").outerHTML;
              scopeBtn.ariaLabel = runtimeContext.t("ARIA_SCOPE_GLOBAL");
              scopeBtn.style.color = "var(--text-error)";
              break;
          }
        };
        scopeBtn.onclick = () => {
          const current = runtimeContext.userHotkeys[index].scope;
          let next = runtimeContext.SCOPE.input;
          if (current === runtimeContext.SCOPE.input) next = runtimeContext.SCOPE.excalidraw;
          else if (current === runtimeContext.SCOPE.excalidraw) next = runtimeContext.SCOPE.global;
          else if (current === runtimeContext.SCOPE.global) next = runtimeContext.SCOPE.input;
          runtimeContext.userHotkeys[index].scope = next;
          saveHotkeys();
          if (next === runtimeContext.SCOPE.global) {
            const conflict = runtimeContext.getObsidianConflict(runtimeContext.userHotkeys[index]);
            if (conflict) {
              new runtimeContext.Notice(
                runtimeContext.t("NOTICE_GLOBAL_HOTKEY_CONFLICT", {
                  command: conflict,
                }),
                runtimeContext.NOTICE_DURATION_GLOBAL_CONFLICT,
              );
            }
          }
          updateRowUI();
        };
        updateScopeUI();
      }
      restoreBtn.innerHTML = runtimeContext.ea.obsidian.getIcon("rotate-ccw").outerHTML;
      restoreBtn.ariaLabel = runtimeContext.t("ARIA_RESTORE_DEFAULT");
      restoreBtn.onclick = () => {
        const def = runtimeContext.DEFAULT_HOTKEYS.find(
          (d) => d.action === runtimeContext.userHotkeys[index].action,
        );
        if (def) {
          runtimeContext.userHotkeys[index] = JSON.parse(JSON.stringify(def));
          saveHotkeys();
          updateRowUI();
        }
      };
      updateRowUI();
      const addBtn = controlDiv.createSpan("clickable-icon setting-add-hotkey-button");
      addBtn.innerHTML = runtimeContext.ea.obsidian.getIcon("plus-circle").outerHTML;
      if (h.key === "Escape") {
        addBtn.style.opacity = 0;
        return;
      }
      addBtn.ariaLabel = runtimeContext.t("ARIA_CUSTOMIZE_HOTKEY");
      addBtn.onclick = () => recordHotkey(addBtn, index, updateRowUI);
    });
    // Spacer to avoid overlap with Obsidian's status bar
    runtimeContext.bodyContainer.createDiv({
      attr: {
        style: "height: 40px;",
      },
    });
  };
  return { renderBody };
}
