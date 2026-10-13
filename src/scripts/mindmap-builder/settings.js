/**
 * @file settings.js
 * @overview settings implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createSettings(runtimeContext) {
  const getZoom = (level) => {
    const target =
      runtimeContext.ZOOM_LEVELS[level ?? runtimeContext.zoomLevel] ||
      runtimeContext.ZOOM_LEVELS.Medium;
    return runtimeContext.ea.DEVICE.isMobile ? target.mobile : target.desktop;
  };

  const fontScale = (type) => {
    switch (type) {
      case "Use scene fontsize":
        return Array(5).fill(runtimeContext.getAppState().currentItemFontSize);
      case "Fibonacci Scale":
        return [68, 42, 26, 16, 10];
      default: // "Normal Scale"
        return [36, 28, 20, 16, 12];
    }
  };

  const getFontScale = (type) => fontScale(type) ?? fontScale("Normal Scale");

  const getVal = (key, def) =>
    runtimeContext.ea.getScriptSettingValue(key, typeof def === "object" ? def : { value: def })
      .value;

  const saveSettings = async () => {
    if (runtimeContext.dirty) await runtimeContext.ea.saveScriptSettings();
    runtimeContext.dirty = false;
  };

  const setVal = (key, value, hidden = false) => {
    const def = runtimeContext.ea.getScriptSettingValue(key, { value, hidden });
    const isChanging = def.value !== value || def.hidden !== hidden;
    def.value = value;
    if (hidden) def.hidden = true;
    runtimeContext.ea.setScriptSettingValue(key, def);
    if (isChanging) {
      runtimeContext.dirty = true;
    }
  };

  const extractConfigFromGlobals = () => ({
    growthMode: runtimeContext.currentModalGrowthMode,
    arrowType: runtimeContext.arrowType,
    fontsizeScale: runtimeContext.fontsizeScale,
    multicolor: runtimeContext.multicolor,
    boxChildren: runtimeContext.boxChildren,
    roundedCorners: runtimeContext.roundedCorners,
    maxWrapWidth: runtimeContext.maxWidth,
    isSolidArrow: runtimeContext.isSolidArrow,
    centerText: runtimeContext.centerText,
    fillSweep: runtimeContext.fillSweep,
    branchScale: runtimeContext.branchScale,
    baseStrokeWidth: runtimeContext.baseStrokeWidth,
    customPalette: JSON.parse(
      JSON.stringify(runtimeContext.customPalette || { enabled: false, random: false, colors: [] }),
    ),
    layoutSettings: JSON.parse(JSON.stringify(runtimeContext.layoutSettings || {})),
  });

  /**
   * Normalizes a map configuration object, supplying standard defaults for any missing properties.
   * Ensures that legacy presets or maps lacking newer schema keys are safely comparable.
   *
   * @param {Object} c - The configuration object to normalize.
   * @returns {Object} A fully populated configuration object.
   */
  const normalizeMapConfig = (c) => {
    if (!c) {
      return {};
    }
    return {
      growthMode: c.growthMode ?? "Right-Left",
      arrowType: c.arrowType ?? "curved",
      fontsizeScale: c.fontsizeScale ?? "Normal Scale",
      multicolor: c.multicolor ?? true,
      boxChildren: c.boxChildren ?? false,
      roundedCorners: c.roundedCorners ?? false,
      maxWrapWidth: c.maxWrapWidth ?? 450,
      isSolidArrow: c.isSolidArrow ?? true,
      centerText: c.centerText ?? true,
      fillSweep: c.fillSweep ?? false,
      branchScale: c.branchScale ?? "Hierarchical",
      baseStrokeWidth: c.baseStrokeWidth ?? 6,
      customPalette: c.customPalette ?? { enabled: false, random: false, colors: [] },
      layoutSettings: { ...runtimeContext.LAYOUT_DEFAULTS, ...(c.layoutSettings || {}) },
    };
  };

  /**
   * Compares two map configuration objects to determine if their visual settings differ.
   * Accounts for missing legacy properties and floating point inaccuracies in layout metadata.
   *
   * @param {Object} c1 - The first configuration object (usually the preset).
   * @param {Object} c2 - The second configuration object (usually the map's current state).
   * @returns {boolean} True if the configurations differ, false otherwise.
   */
  const diffMapConfig = (c1, c2) => {
    if (!c1 || !c2) {
      return true;
    }
    const n1 = normalizeMapConfig(c1);
    const n2 = normalizeMapConfig(c2);
    const keys = [
      "growthMode",
      "arrowType",
      "fontsizeScale",
      "multicolor",
      "boxChildren",
      "roundedCorners",
      "maxWrapWidth",
      "isSolidArrow",
      "centerText",
      "fillSweep",
      "branchScale",
      "baseStrokeWidth",
    ];
    for (let k of keys) {
      if (n1[k] !== n2[k]) {
        return true;
      }
    }
    if (JSON.stringify(n1.customPalette) !== JSON.stringify(n2.customPalette)) {
      return true;
    }
    for (let k of Object.keys(runtimeContext.LAYOUT_DEFAULTS)) {
      const v1 = n1.layoutSettings[k];
      const v2 = n2.layoutSettings[k];
      if (typeof v1 === "number" && typeof v2 === "number") {
        if (Math.abs(v1 - v2) > 0.0001) {
          return true;
        }
      } else if (v1 !== v2) {
        return true;
      }
    }
    return false;
  };

  /**
   * Applies the specified preset's configuration to the active global variables.
   *
   * @param {string} presetName - The name of the preset to apply.
   */
  const applyPresetToGlobals = (presetName) => {
    const p = runtimeContext.mapPresets[presetName];
    if (!p) {
      return;
    }
    const n = normalizeMapConfig(p);
    runtimeContext.currentModalGrowthMode = n.growthMode;
    runtimeContext.arrowType = n.arrowType;
    runtimeContext.fontsizeScale = n.fontsizeScale;
    runtimeContext.multicolor = n.multicolor;
    runtimeContext.boxChildren = n.boxChildren;
    runtimeContext.roundedCorners = n.roundedCorners;
    runtimeContext.maxWidth = n.maxWrapWidth;
    runtimeContext.isSolidArrow = n.isSolidArrow;
    runtimeContext.centerText = n.centerText;
    runtimeContext.fillSweep = n.fillSweep;
    runtimeContext.branchScale = n.branchScale;
    runtimeContext.baseStrokeWidth = n.baseStrokeWidth;
    runtimeContext.customPalette = JSON.parse(
      JSON.stringify(n.customPalette || { enabled: false, random: false, colors: [] }),
    );
    runtimeContext.layoutSettings = JSON.parse(JSON.stringify(n.layoutSettings || {}));
    setVal(runtimeContext.K_GROWTH, runtimeContext.currentModalGrowthMode);
    setVal(runtimeContext.K_ARROW_TYPE, runtimeContext.arrowType);
    setVal(runtimeContext.K_FONTSIZE, runtimeContext.fontsizeScale);
    setVal(runtimeContext.K_MULTICOLOR, runtimeContext.multicolor);
    setVal(runtimeContext.K_BOX, runtimeContext.boxChildren);
    setVal(runtimeContext.K_ROUND, runtimeContext.roundedCorners);
    setVal(runtimeContext.K_WIDTH, runtimeContext.maxWidth);
    setVal(runtimeContext.K_ARROWSTROKE, runtimeContext.isSolidArrow);
    setVal(runtimeContext.K_CENTERTEXT, runtimeContext.centerText);
    setVal(runtimeContext.K_FILL_SWEEP, runtimeContext.fillSweep);
    setVal(runtimeContext.K_BRANCH_SCALE, runtimeContext.branchScale);
    setVal(runtimeContext.K_BASE_WIDTH, runtimeContext.baseStrokeWidth);
    setVal(runtimeContext.K_PALETTE, runtimeContext.customPalette, true);
    setVal(runtimeContext.K_LAYOUT, runtimeContext.layoutSettings, true);
  };

  const applyPresetToMap = async (presetName, sel) => {
    applyPresetToGlobals(presetName);
    await updateRootNodeCustomData(
      {
        presetName,
        growthMode: runtimeContext.currentModalGrowthMode,
        arrowType: runtimeContext.arrowType,
        fontsizeScale: runtimeContext.fontsizeScale,
        multicolor: runtimeContext.multicolor,
        boxChildren: runtimeContext.boxChildren,
        roundedCorners: runtimeContext.roundedCorners,
        maxWrapWidth: runtimeContext.maxWidth,
        isSolidArrow: runtimeContext.isSolidArrow,
        centerText: runtimeContext.centerText,
        fillSweep: runtimeContext.fillSweep,
        branchScale: runtimeContext.branchScale,
        baseStrokeWidth: runtimeContext.baseStrokeWidth,
        layoutSettings: JSON.parse(JSON.stringify(runtimeContext.layoutSettings)),
      },
      sel,
    );
    await runtimeContext.refreshMapLayout(sel);
    runtimeContext.updateUI();
  };

  /**
   * Refreshes the dropdown list of available map presets.
   * Exclusively populates valid preset names without an ambiguous empty state.
   */
  const refreshPresetDropdown = () => {
    if (!runtimeContext.presetDropdown) {
      return;
    }
    runtimeContext.presetDropdown.selectEl.innerHTML = "";
    Object.keys(runtimeContext.mapPresets).forEach((k) =>
      runtimeContext.presetDropdown.addOption(k, k),
    );
    runtimeContext.presetDropdown.setValue(runtimeContext.activePresetName);
  };

  /**
   * Pure calculation logic for stroke width.
   */
  const calculateStrokeWidth = (depth, baseWidth, scaleMode) => {
    const base = Number.isFinite(baseWidth) ? baseWidth : 6;
    const clampedDepth = Math.max(0, Math.min(depth ?? 0, 4));
    if (scaleMode === "Uniform") return base;
    const min = Math.max(0.1, base * 0.1);
    const slope = (min - base) / 4;
    const val = slope * clampedDepth + base;
    return Math.round(val * 100) / 100;
  };

  /**
   * Calculates the stroke width for a branch based on depth and style.
   * Uses global settings.
   */
  const getStrokeWidthForDepth = (depth) => {
    return calculateStrokeWidth(depth, runtimeContext.baseStrokeWidth, runtimeContext.branchScale);
  };

  const inferDirectionalGrowthMode = (node, parent, sourceRoot = null, sourceMode = null) => {
    if (!node || !parent) return "Right-facing";
    const mode =
      sourceMode || sourceRoot?.customData?.growthMode || runtimeContext.currentModalGrowthMode;
    const nodeCenter = {
      x: node.x + node.width / 2,
      y: node.y + node.height / 2,
    };
    const ref = sourceRoot
      ? {
          x: sourceRoot.x + sourceRoot.width / 2,
          y: sourceRoot.y + sourceRoot.height / 2,
        }
      : {
          x: parent.x + parent.width / 2,
          y: parent.y + parent.height / 2,
        };
    // Single-direction maps inherit their direction directly.
    if (mode === "Up-facing") return "Up-facing";
    if (mode === "Down-facing") return "Down-facing";
    if (mode === "Right-facing") return "Right-facing";
    if (mode === "Left-facing") return "Left-facing";
    // Dual-axis directional map: infer by vertical side relative to map root.
    if (mode === "Up-Down") {
      return nodeCenter.y < ref.y ? "Up-facing" : "Down-facing";
    }
    // Right-Left and Radial maps: infer by horizontal side relative to map root.
    if (mode === "Right-Left" || mode === "Radial") {
      return nodeCenter.x >= ref.x ? "Right-facing" : "Left-facing";
    }
    // Fallback to geometric heuristic.
    const dx = nodeCenter.x - ref.x;
    const dy = nodeCenter.y - ref.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
      return dx >= 0 ? "Right-facing" : "Left-facing";
    }
    return dy >= 0 ? "Down-facing" : "Up-facing";
  };

  const getRootConfigForNode = (rootNode) => {
    const cd = rootNode?.customData ?? {};
    const defaultLayout = runtimeContext.layoutSettings || {};
    return {
      growthMode: cd?.growthMode || runtimeContext.currentModalGrowthMode,
      autoLayoutDisabled: cd?.autoLayoutDisabled === true,
      arrowType: cd?.arrowType ?? runtimeContext.arrowType,
      fontsizeScale: cd?.fontsizeScale ?? runtimeContext.fontsizeScale,
      multicolor: typeof cd?.multicolor === "boolean" ? cd.multicolor : runtimeContext.multicolor,
      boxChildren:
        typeof cd?.boxChildren === "boolean" ? cd.boxChildren : runtimeContext.boxChildren,
      roundedCorners:
        typeof cd?.roundedCorners === "boolean" ? cd.roundedCorners : runtimeContext.roundedCorners,
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
      layoutSettings: JSON.parse(JSON.stringify(cd?.layoutSettings ?? defaultLayout)),
    };
  };

  /**
   * Temporarily applies map/root settings for layout calculations, then restores globals.
   * This allows nested additional roots to layout with their own strategy.
   */
  const withRootLayoutContext = (rootNode, fn) => {
    const previous = {
      growthMode: runtimeContext.currentModalGrowthMode,
      arrowType: runtimeContext.arrowType,
      centerText: runtimeContext.centerText,
      fillSweep: runtimeContext.fillSweep,
      layoutSettings: runtimeContext.layoutSettings,
    };
    const cfg = getRootConfigForNode(rootNode);
    runtimeContext.currentModalGrowthMode = cfg.growthMode;
    runtimeContext.arrowType = cfg.arrowType;
    runtimeContext.centerText = cfg.centerText;
    runtimeContext.fillSweep = cfg.fillSweep;
    runtimeContext.layoutSettings = JSON.parse(JSON.stringify(cfg.layoutSettings));
    try {
      return fn(cfg);
    } finally {
      runtimeContext.currentModalGrowthMode = previous.growthMode;
      runtimeContext.arrowType = previous.arrowType;
      runtimeContext.centerText = previous.centerText;
      runtimeContext.fillSweep = previous.fillSweep;
      runtimeContext.layoutSettings = previous.layoutSettings;
    }
  };

  const updateRootNodeCustomData = async (data, sel) => {
    if (!sel) sel = runtimeContext.getMindmapNodeFromSelection();
    if (sel) {
      const allElements = runtimeContext.ea.getViewElements();
      const settingsRoot = runtimeContext.getSettingsRootNode(sel, allElements);
      if (!settingsRoot) return null;
      runtimeContext.ea.copyViewElementsToEAforEditing(
        allElements.filter((e) => e.id === settingsRoot.id),
      );
      runtimeContext.ea.addAppendUpdateCustomData(settingsRoot.id, {
        ...data,
      });
      await runtimeContext.addElementsToView({
        captureUpdate: "NEVER",
      });
      runtimeContext.updateUI();
      const info = runtimeContext.getHierarchy(settingsRoot, runtimeContext.ea.getViewElements());
      return {
        ...info,
        rootId: settingsRoot.id,
        settingsRootId: settingsRoot.id,
      };
    }
    return null;
  };

  /**
   * Recursively updates the stroke width of a subtree.
   * Checks if the existing arrow matches the 'old' calculated width.
   * If it does, updates to 'new' width. If not, assumes manual override and skips.
   */
  const updateBranchStrokes = async (
    rootId,
    oldBaseWidth,
    oldScaleMode,
    newBaseWidth,
    newScaleMode,
  ) => {
    if (!runtimeContext.isViewSet()) return;
    const allElements = runtimeContext.ea.getViewElements();
    const root = allElements.find((el) => el.id === rootId);
    if (!root) return;
    const elementsToUpdate = [];
    let manualOverrideFound = false;
    const traverse = (nodeId, depth) => {
      const children = runtimeContext.getChildrenNodes(nodeId, allElements);
      children.forEach((child) => {
        // Find the arrow connecting parent (nodeId) to child
        const arrow = allElements.find(
          (a) =>
            a.type === "arrow" &&
            a.customData?.isBranch &&
            a.startBinding?.elementId === nodeId &&
            a.endBinding?.elementId === child.id,
        );
        if (arrow) {
          // Calculate what the width *should* have been under old settings
          // Note: 'depth' is parent depth. Arrow depth in addNode logic was 'depth' (where parent is depth-1).
          // In addNode:
          // if !parent (root), depth=0.
          // if parent, info=getHierarchy(parent), depth = info.depth + 1.
          // strokeWidth = getStrokeWidthForDepth(depth).
          // So the arrow leading TO the node at 'depth' uses 'depth' for calculation.
          // Here, 'child' is at depth + 1 relative to 'nodeId' (which is at 'depth').
          const childDepth = depth + 1;
          const expectedOldWidth = calculateStrokeWidth(childDepth, oldBaseWidth, oldScaleMode);
          // Allow a small floating point tolerance
          if (Math.abs(arrow.strokeWidth - expectedOldWidth) < 0.05) {
            const newWidth = calculateStrokeWidth(childDepth, newBaseWidth, newScaleMode);
            if (Math.abs(arrow.strokeWidth - newWidth) > 0.001) {
              elementsToUpdate.push({
                id: arrow.id,
                strokeWidth: newWidth,
              });
            }
          } else {
            // If it doesn't match old width, check if it matches new width (already updated?)
            const expectedNewWidth = calculateStrokeWidth(childDepth, newBaseWidth, newScaleMode);
            if (Math.abs(arrow.strokeWidth - expectedNewWidth) >= 0.05) {
              manualOverrideFound = true;
            }
          }
        }
        traverse(child.id, depth + 1);
      });
    };
    traverse(rootId, 0);
    if (elementsToUpdate.length > 0) {
      runtimeContext.ea.copyViewElementsToEAforEditing(
        elementsToUpdate.map((i) => allElements.find((e) => e.id === i.id)),
      );
      elementsToUpdate.forEach((item) => {
        const el = runtimeContext.ea.getElement(item.id);
        if (el) el.strokeWidth = item.strokeWidth;
      });
      await runtimeContext.addElementsToView({
        captureUpdate: "IMMEDIATELY",
      });
    }
    if (manualOverrideFound) {
      new runtimeContext.Notice(runtimeContext.t("NOTICE_BRANCH_WIDTH_MANUAL_OVERRIDE"));
    }
  };
  return {
    getZoom,
    fontScale,
    getFontScale,
    getVal,
    saveSettings,
    setVal,
    extractConfigFromGlobals,
    normalizeMapConfig,
    diffMapConfig,
    applyPresetToGlobals,
    applyPresetToMap,
    refreshPresetDropdown,
    calculateStrokeWidth,
    getStrokeWidthForDepth,
    inferDirectionalGrowthMode,
    getRootConfigForNode,
    withRootLayoutContext,
    updateRootNodeCustomData,
    updateBranchStrokes,
  };
}
