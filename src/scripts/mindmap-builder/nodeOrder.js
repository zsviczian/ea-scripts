/**
 * @file nodeOrder.js
 * @overview node Order implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createNodeOrder(runtimeContext) {
  /**
   * Recursively updates the font size of a subtree based on the new depth level.
   * Only updates if the current font size matches the default for its *previous* depth,
   * preserving user customizations.
   * Also updates the ontology label (if present) on the incoming arrow to be half the node's new size.
   */
  const updateSubtreeFontSize = (
    nodeId,
    newDepth,
    oldDepth,
    allElements,
    newFontScaleType,
    oldFontScaleType,
  ) => {
    const newFontScale = runtimeContext.getFontScale(newFontScaleType);
    const oldFontScale = runtimeContext.getFontScale(oldFontScaleType);
    const node = allElements.find((el) => el.id === nodeId);
    if (!node) return;
    if (!runtimeContext.ea.getElement(nodeId)) {
      runtimeContext.ea.copyViewElementsToEAforEditing([node]);
    }
    // Calculate standard sizes based on the old and new contexts
    const oldStandardSize = oldFontScale[Math.min(oldDepth, oldFontScale.length - 1)];
    const newStandardSize = newFontScale[Math.min(newDepth, newFontScale.length - 1)];
    // Update only if the user hasn't customized the font size
    if (node.fontSize === oldStandardSize) {
      const eaNode = runtimeContext.ea.getElement(nodeId);
      eaNode.fontSize = newStandardSize;
      // Refresh dimensions to fit new font size
      if (
        eaNode.type === "text" ||
        (eaNode.boundElements && eaNode.boundElements.some((b) => b.type === "text"))
      ) {
        runtimeContext.ea.refreshTextElementSize(eaNode.id);
      }
    }
    // Update Ontology (Arrow Label) size
    // Find the arrow pointing TO this node
    const incomingArrow = allElements.find(
      (a) => a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === nodeId,
    );
    if (incomingArrow) {
      // Get the bound text element (ontology)
      const maybeTextElement = runtimeContext.ea.getBoundTextElement(incomingArrow, true);
      let eaOntologyEl = maybeTextElement.eaElement;
      // If it exists in the scene but not yet in EA workbench, copy it
      if (!eaOntologyEl && maybeTextElement.sceneElement) {
        runtimeContext.ea.copyViewElementsToEAforEditing([maybeTextElement.sceneElement]);
        eaOntologyEl = runtimeContext.ea.getElement(maybeTextElement.sceneElement.id);
      }
      // Apply half-size logic
      if (eaOntologyEl && eaOntologyEl.fontSize === Math.floor(oldStandardSize / 2)) {
        eaOntologyEl.fontSize = Math.floor(newStandardSize / 2);
        runtimeContext.ea.refreshTextElementSize(eaOntologyEl.id);
      }
    }
    // Stop recursion if this node is an additional root (submap).
    // Its own node size updates to match the parent, but its children scale relative to IT.
    if (node.customData?.isAdditionalRoot === true) {
      return;
    }
    // Recurse to children
    const children = runtimeContext.getChildrenNodes(nodeId, allElements);
    children.forEach((child) => {
      updateSubtreeFontSize(
        child.id,
        newDepth + 1,
        oldDepth + 1,
        allElements,
        newFontScaleType,
        oldFontScaleType,
      );
    });
  };

  /**
   * Recursively updates the stroke width of a subtree based on the new depth level.
   * Only updates if the current width matches the default for its *previous* depth.
   */
  const updateSubtreeStrokeWidth = (
    nodeId,
    newDepth,
    oldDepth,
    allElements,
    newBaseWidth,
    newBranchScale,
    oldBaseWidth,
    oldBranchScale,
  ) => {
    const node = allElements.find((el) => el.id === nodeId);
    if (!node) return;
    // Ensure mutable element exists
    if (!runtimeContext.ea.getElement(nodeId)) {
      runtimeContext.ea.copyViewElementsToEAforEditing([node]);
    }
    const oldStandardWidth = runtimeContext.calculateStrokeWidth(
      oldDepth,
      oldBaseWidth,
      oldBranchScale,
    );
    const newStandardWidth = runtimeContext.calculateStrokeWidth(
      newDepth,
      newBaseWidth,
      newBranchScale,
    );
    const tolerance = 0.05;
    // 1. Update the incoming arrow (the connector)
    const incomingArrow = allElements.find(
      (a) => a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === nodeId,
    );
    if (incomingArrow) {
      if (!runtimeContext.ea.getElement(incomingArrow.id))
        runtimeContext.ea.copyViewElementsToEAforEditing([incomingArrow]);
      const eaArrow = runtimeContext.ea.getElement(incomingArrow.id);
      // Update if it matches old standard
      if (Math.abs(eaArrow.strokeWidth - oldStandardWidth) < tolerance) {
        eaArrow.strokeWidth = newStandardWidth;
      }
    }
    // 2. Update the Node itself (e.g. if it is a box)
    // Text elements don't have stroke width, but containers do.
    if (node.type !== "text" && Math.abs(node.strokeWidth - oldStandardWidth) < tolerance) {
      const eaNode = runtimeContext.ea.getElement(nodeId);
      eaNode.strokeWidth = newStandardWidth;
    }
    // Stop recursion if this node is an additional root (submap).
    if (node.customData?.isAdditionalRoot === true) {
      return;
    }
    // Recurse to children
    const children = runtimeContext.getChildrenNodes(nodeId, allElements);
    children.forEach((child) => {
      updateSubtreeStrokeWidth(
        child.id,
        newDepth + 1,
        oldDepth + 1,
        allElements,
        newBaseWidth,
        newBranchScale,
        oldBaseWidth,
        oldBranchScale,
      );
    });
  };

  /**
   * Recursively updates the color of a subtree.
   * Acts as a flood-fill: only updates children that matched the old parent color.
   *
   * @param {string} nodeId - Current node ID
   * @param {string} oldColor - The color we are replacing (the color the branch used to be)
   * @param {string} newColor - The color we are applying
   * @param {ExcalidrawElement[]} allElements - Scene elements
   */
  const updateSubtreeColor = (nodeId, oldColor, newColor, allElements) => {
    const node = allElements.find((el) => el.id === nodeId);
    if (!node) return;
    // If the node's color doesn't match the old branch color,
    // it implies a manual override or a sub-branch with a different color. Stop recursion.
    if (node.strokeColor !== oldColor) return;
    if (!runtimeContext.ea.getElement(nodeId))
      runtimeContext.ea.copyViewElementsToEAforEditing([node]);
    const eaNode = runtimeContext.ea.getElement(nodeId);
    eaNode.strokeColor = newColor;
    // Update boundary color to match if the node has one
    if (node.customData?.boundaryId) {
      const boundaryEl = allElements.find((e) => e.id === node.customData.boundaryId);
      if (boundaryEl) {
        if (!runtimeContext.ea.getElement(boundaryEl.id))
          runtimeContext.ea.copyViewElementsToEAforEditing([boundaryEl]);
        const eaBoundary = runtimeContext.ea.getElement(boundaryEl.id);
        eaBoundary.strokeColor = newColor;
        eaBoundary.backgroundColor = newColor;
      }
    }
    // Update incoming arrow (Ontology/Connector)
    const incomingArrow = allElements.find(
      (a) => a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === nodeId,
    );
    if (incomingArrow && incomingArrow.strokeColor === oldColor) {
      if (!runtimeContext.ea.getElement(incomingArrow.id))
        runtimeContext.ea.copyViewElementsToEAforEditing([incomingArrow]);
      const eaArrow = runtimeContext.ea.getElement(incomingArrow.id);
      eaArrow.strokeColor = newColor;
      // Update the Ontology label (bound text element) of the arrow
      const maybeTextElement = runtimeContext.ea.getBoundTextElement(incomingArrow, true);
      let eaOntologyEl = maybeTextElement.eaElement;
      if (!eaOntologyEl && maybeTextElement.sceneElement) {
        runtimeContext.ea.copyViewElementsToEAforEditing([maybeTextElement.sceneElement]);
        eaOntologyEl = runtimeContext.ea.getElement(maybeTextElement.sceneElement.id);
      }
      if (eaOntologyEl) {
        eaOntologyEl.strokeColor = newColor;
      }
    }
    const children = runtimeContext.getChildrenNodes(nodeId, allElements);
    children.forEach((child) => {
      updateSubtreeColor(child.id, oldColor, newColor, allElements);
    });
  };

  /**
   * Toggles whether the selected node acts as an additional local root (submap root).
   * - Master root (no incoming isBranch connector) cannot be converted.
   * - Enabling submap root copies current map settings and assigns a directional growth mode
   *   inferred from the node position relative to its parent.
   * - Disabling submap root removes local layout metadata so descendants follow parent-root logic.
   */
  const toggleSubmapRoot = async () => {
    if (!runtimeContext.isViewSet()) return;
    const sel = runtimeContext.getMindmapNodeFromSelection();
    if (!sel) return;
    const allElements = runtimeContext.ea.getViewElements();
    const parent = runtimeContext.getParentNode(sel.id, allElements);
    // Master root is the unique no-parent root and must remain a root.
    if (!parent) {
      new runtimeContext.Notice(runtimeContext.t("NOTICE_CANNOT_CHANGE_MASTER_ROOT"));
      return;
    }
    const isAdditionalRoot = sel.customData?.isAdditionalRoot === true;
    runtimeContext.ea.copyViewElementsToEAforEditing([sel]);
    if (isAdditionalRoot) {
      const ok = await runtimeContext.utils.suggester(
        ["Yes", "No"],
        [true, false],
        runtimeContext.t("CONFIRM_REMOVE_SUBMAP_ROOT"),
      );
      if (!ok) {
        return;
      }
      const clearData = {};
      runtimeContext.MAP_ROOT_CUSTOMDATA_KEYS.forEach((key) => {
        clearData[key] = undefined;
      });
      clearData.presetName = undefined;
      runtimeContext.ea.addAppendUpdateCustomData(sel.id, clearData);
    } else {
      const sourceRoot = runtimeContext.getSettingsRootNode(parent, allElements) || parent;
      const sourceCfg = runtimeContext.getRootConfigForNode(sourceRoot);
      const inferredMode = runtimeContext.inferDirectionalGrowthMode(
        sel,
        parent,
        sourceRoot,
        sourceCfg.growthMode,
      );
      runtimeContext.ea.addAppendUpdateCustomData(sel.id, {
        isAdditionalRoot: true,
        presetName: sourceRoot.customData?.presetName || runtimeContext.activePresetName,
        growthMode: inferredMode,
        autoLayoutDisabled: sourceCfg.autoLayoutDisabled,
        arrowType: sourceCfg.arrowType,
        fontsizeScale: sourceCfg.fontsizeScale,
        multicolor: sourceCfg.multicolor,
        boxChildren: sourceCfg.boxChildren,
        roundedCorners: sourceCfg.roundedCorners,
        maxWrapWidth: sourceCfg.maxWrapWidth,
        isSolidArrow: sourceCfg.isSolidArrow,
        centerText: sourceCfg.centerText,
        fillSweep: sourceCfg.fillSweep,
        branchScale: sourceCfg.branchScale,
        baseStrokeWidth: sourceCfg.baseStrokeWidth,
        layoutSettings: JSON.parse(JSON.stringify(sourceCfg.layoutSettings)),
      });
    }
    await runtimeContext.addElementsToView({
      captureUpdate: "EVENTUALLY",
    });
    const info = runtimeContext.getHierarchy(sel, runtimeContext.ea.getViewElements());
    await runtimeContext.triggerGlobalLayout(info.rootId);
    new runtimeContext.Notice(
      runtimeContext.t(
        isAdditionalRoot ? "NOTICE_SUBMAP_ROOT_REMOVED" : "NOTICE_SUBMAP_ROOT_ADDED",
      ),
    );
    runtimeContext.updateUI();
  };

  const changeNodeOrder = async (key) => {
    if (!runtimeContext.isViewSet()) return;
    const allElements = runtimeContext.ea.getViewElements();
    const current = runtimeContext.getMindmapNodeFromSelection();
    if (!current) return;
    const parent = runtimeContext.getParentNode(current.id, allElements);
    if (!parent) {
      new runtimeContext.Notice(runtimeContext.t("NOTICE_CANNOT_MOVE_ROOT"));
      return;
    }
    const info = runtimeContext.getHierarchy(current, allElements);
    const currentSettingsRoot = runtimeContext.getSettingsRootNode(current, allElements);
    const root =
      current.customData?.isAdditionalRoot === true
        ? runtimeContext.getSettingsRootNode(parent, allElements) ||
          currentSettingsRoot ||
          allElements.find((e) => e.id === info.rootId)
        : currentSettingsRoot || allElements.find((e) => e.id === info.rootId);
    if (!root) return;
    if (current.id === root.id) {
      new runtimeContext.Notice(runtimeContext.t("NOTICE_CANNOT_MOVE_ROOT"));
      return; // cannot reorder root
    }
    if (root.customData?.autoLayoutDisabled) {
      new runtimeContext.Notice(runtimeContext.t("NOTICE_CANNOT_MOVE_AUTO_LAYOUT_DISABLED"));
      return; // cannot reorder in auto-layout disabled maps
    }
    if (current.customData?.isPinned) {
      new runtimeContext.Notice(runtimeContext.t("NOTICE_CANNOT_MOVE_PINNED"));
      return; // cannot reorder pinned nodes
    }
    const rootCenter = root.x + root.width / 2;
    const curCenter = current.x + current.width / 2;
    const rootCenterY = root.y + root.height / 2;
    const curCenterY = current.y + current.height / 2;
    const mapMode = root.customData?.growthMode || runtimeContext.currentModalGrowthMode;
    const isVerticalMode = ["Up-facing", "Down-facing", "Up-Down"].includes(mapMode);
    const isRadial = mapMode === "Radial";
    const isInPositive = isVerticalMode ? curCenterY > rootCenterY : curCenter > rootCenter;
    // --- GET OLD SETTINGS ROOT AND OLD DEPTH ---
    const oldSettingsRoot =
      runtimeContext.getSettingsRootNode(parent, allElements) ||
      allElements.find((e) => e.id === info.rootId);
    const oldDepth = runtimeContext.getDepthFromAncestor(
      current.id,
      oldSettingsRoot.id,
      allElements,
    );
    const oldRootCfg = runtimeContext.getRootConfigForNode(oldSettingsRoot);
    // ---------------------------------------------------------
    // Feature: L1 Node Side Swap
    // ---------------------------------------------------------
    if (
      parent.id === root.id &&
      ((!isVerticalMode && mapMode === "Right-Left") || (isVerticalMode && mapMode === "Up-Down"))
    ) {
      const movePos = isVerticalMode
        ? !isInPositive && key === "ArrowDown"
        : !isInPositive && key === "ArrowRight"; // Negative Side -> Positive Side
      const moveNeg = isVerticalMode
        ? isInPositive && key === "ArrowUp"
        : isInPositive && key === "ArrowLeft"; // Positive Side -> Negative Side
      if (movePos || moveNeg) {
        // Calculate Delta to mirror across root center
        const delta = isVerticalMode
          ? 2 * (rootCenterY - curCenterY)
          : 2 * (rootCenter - curCenter);
        // Gather all elements in branch + decorations
        const branchIds = runtimeContext.getBranchElementIds(current.id, allElements);
        // Use the specialized function to get decorations and crosslinks
        // to safely ignore structural groups that might encompass the entire map
        const decorationAndCrossLinkIds = runtimeContext.getDecorationAndCrossLinkIdsForBranches(
          branchIds,
          allElements,
          info.rootId,
        );
        const elementsToMove = new Set();
        branchIds.forEach((id) => {
          const el = allElements.find((x) => x.id === id);
          if (el) elementsToMove.add(el);
        });
        decorationAndCrossLinkIds.forEach((id) => {
          const el = allElements.find((x) => x.id === id);
          if (el) elementsToMove.add(el);
        });
        const arr = Array.from(elementsToMove);
        runtimeContext.ea.copyViewElementsToEAforEditing(arr);
        arr.forEach((el) => {
          const eaEl = runtimeContext.ea.getElement(el.id);
          if (isVerticalMode) eaEl.y += delta;
          else eaEl.x += delta;
        });
        await runtimeContext.addElementsToView({
          captureUpdate: "EVENTUALLY",
        });
        // Trigger layout. mustHonorMindmapOrder=false ensures the engine sorts based on the NEW visual position
        runtimeContext.triggerGlobalLayout(root.id, false, false);
        return;
      }
    }
    // 1. Structural Promotion / Demotion
    const isPromote = isVerticalMode
      ? (isInPositive && key === "ArrowUp") || (!isInPositive && key === "ArrowDown")
      : (isInPositive && key === "ArrowLeft") || (!isInPositive && key === "ArrowRight");
    const isDemote = isVerticalMode
      ? (isInPositive && key === "ArrowDown") || (!isInPositive && key === "ArrowUp")
      : (isInPositive && key === "ArrowRight") || (!isInPositive && key === "ArrowLeft");
    if (isPromote) {
      if (parent.id === root.id && root.customData?.isAdditionalRoot !== true) return; // Cannot promote L1 nodes under master map root
      const grandParent = runtimeContext.getParentNode(parent.id, allElements);
      if (!grandParent) return;
      // Find the arrow connecting Parent -> Current
      const arrow = allElements.find(
        (a) =>
          a.type === "arrow" &&
          a.customData?.isBranch &&
          a.startBinding?.elementId === parent.id &&
          a.endBinding?.elementId === current.id,
      );
      if (arrow) {
        // Find new settings root and depth relative to the target parent
        const newSettingsRoot =
          runtimeContext.getSettingsRootNode(grandParent, allElements) ||
          allElements.find((e) => e.id === info.rootId);
        const newRootCfg = runtimeContext.getRootConfigForNode(newSettingsRoot);
        const newDepth =
          runtimeContext.getDepthFromAncestor(grandParent.id, newSettingsRoot.id, allElements) + 1;
        runtimeContext.reconnectArrow(parent, grandParent, arrow, "start");
        const parentOrder = runtimeContext.getMindmapOrder(parent);
        const promoteTargetRoot =
          parent.customData?.isAdditionalRoot === true ? newSettingsRoot : root;
        runtimeContext.ea.copyViewElementsToEAforEditing([current]);
        runtimeContext.ea.addAppendUpdateCustomData(current.id, {
          mindmapOrder: isRadial && !isInPositive ? parentOrder - 0.5 : parentOrder + 0.5,
        });
        updateSubtreeFontSize(
          current.id,
          newDepth,
          oldDepth,
          allElements,
          newRootCfg.fontsizeScale,
          oldRootCfg.fontsizeScale,
        );
        updateSubtreeStrokeWidth(
          current.id,
          newDepth,
          oldDepth,
          allElements,
          newRootCfg.baseStrokeWidth,
          newRootCfg.branchScale,
          oldRootCfg.baseStrokeWidth,
          oldRootCfg.branchScale,
        );
        // --- Update Colors (Promotion) ---
        const isTargetL1 = grandParent.id === promoteTargetRoot.id;
        let targetColor;
        if (isTargetL1) {
          if (newRootCfg.multicolor) {
            targetColor = current.customData?.previousL1Color;
            if (!targetColor) {
              const existingL1Colors = runtimeContext
                .getChildrenNodes(promoteTargetRoot.id, allElements)
                .map((n) => n.strokeColor);
              targetColor = runtimeContext.getDynamicColor(existingL1Colors);
            }
          } else {
            targetColor = promoteTargetRoot.strokeColor;
          }
        } else {
          targetColor = grandParent.strokeColor;
        }
        updateSubtreeColor(current.id, current.strokeColor, targetColor, allElements);
        await runtimeContext.addElementsToView({
          captureUpdate: "EVENTUALLY",
        });
        runtimeContext.triggerGlobalLayout(promoteTargetRoot.id, false, true);
        return;
      }
    }
    if (isDemote) {
      // Demotion: Selected node becomes child of sibling of current parent
      const siblings = runtimeContext.getChildrenNodes(parent.id, allElements);
      // Sort siblings to ensure we pick the correct visual neighbor based on mindmapOrder
      siblings.sort(
        (a, b) => runtimeContext.getMindmapOrder(a) - runtimeContext.getMindmapOrder(b),
      );
      if (siblings.length < 2) {
        new runtimeContext.Notice(runtimeContext.t("NOTICE_CANNOT_DEMOTE_NO_SIBLING_TO_ACCEPT"));
        return;
      }
      const currentIndex = siblings.findIndex((s) => s.id === current.id);
      const mirrorBehavior = isRadial && !isInPositive;
      let targetIndex = mirrorBehavior ? currentIndex + 1 : currentIndex - 1;
      // Prevent out-of-bounds demotion
      if (targetIndex < 0 || targetIndex >= siblings.length) {
        new runtimeContext.Notice(runtimeContext.t("NOTICE_CANNOT_DEMOTE_NO_VALID_SIBLING"));
        return;
      }
      const newParent = siblings[targetIndex];
      // Prevent cross-side demotion for L1 nodes
      if (parent.id === root.id) {
        const targetIsPos = isVerticalMode
          ? newParent.y + newParent.height / 2 > rootCenterY
          : newParent.x + newParent.width / 2 > rootCenter;
        if (targetIsPos !== isInPositive) {
          new runtimeContext.Notice(
            runtimeContext.t("NOTICE_CANNOT_DEMOTE_CROSS_SIDE_NOT_ALLOWED"),
          );
          return;
        }
      }
      // Find the arrow to update structural binding
      const arrow = allElements.find(
        (a) =>
          a.type === "arrow" &&
          a.customData?.isBranch &&
          a.startBinding?.elementId === parent.id &&
          a.endBinding?.elementId === current.id,
      );
      if (arrow) {
        // Find new settings root and calculate depth using the demoted parent context
        const newSettingsRoot =
          runtimeContext.getSettingsRootNode(newParent, allElements) ||
          allElements.find((e) => e.id === info.rootId);
        const newRootCfg = runtimeContext.getRootConfigForNode(newSettingsRoot);
        const newDepth =
          runtimeContext.getDepthFromAncestor(newParent.id, newSettingsRoot.id, allElements) + 1;
        runtimeContext.reconnectArrow(parent, newParent, arrow, "start");
        // Determine new order: Append as last child of new parent
        const newParentChildren = runtimeContext.getChildrenNodes(newParent.id, allElements);
        const nextOrder =
          newParentChildren.length > 0
            ? Math.max(...newParentChildren.map(runtimeContext.getMindmapOrder)) + 1
            : 0;
        runtimeContext.ea.copyViewElementsToEAforEditing([current]);
        // Store previous L1 color if we are demoting from an L1 position
        if (parent.id === oldSettingsRoot.id) {
          runtimeContext.ea.addAppendUpdateCustomData(current.id, {
            mindmapOrder: nextOrder,
            previousL1Color: current.strokeColor,
          });
        } else {
          runtimeContext.ea.addAppendUpdateCustomData(current.id, {
            mindmapOrder: nextOrder,
          });
        }
        updateSubtreeFontSize(
          current.id,
          newDepth,
          oldDepth,
          allElements,
          newRootCfg.fontsizeScale,
          oldRootCfg.fontsizeScale,
        );
        updateSubtreeStrokeWidth(
          current.id,
          newDepth,
          oldDepth,
          allElements,
          newRootCfg.baseStrokeWidth,
          newRootCfg.branchScale,
          oldRootCfg.baseStrokeWidth,
          oldRootCfg.branchScale,
        );
        // --- Update Colors (Demotion) ---
        // If the node we are attaching to IS a settings root, we are becoming an L1 of a submap.
        const isTargetL1 = newParent.id === newSettingsRoot.id;
        let targetColor;
        if (isTargetL1) {
          if (newRootCfg.multicolor) {
            const existingL1Colors = runtimeContext
              .getChildrenNodes(newSettingsRoot.id, allElements)
              .map((n) => n.strokeColor);
            targetColor = runtimeContext.getDynamicColor(existingL1Colors);
          } else {
            targetColor = newSettingsRoot.strokeColor;
          }
        } else {
          targetColor = newParent.strokeColor;
        }
        updateSubtreeColor(current.id, current.strokeColor, targetColor, allElements);
        await runtimeContext.addElementsToView({
          captureUpdate: "EVENTUALLY",
        });
        runtimeContext.triggerGlobalLayout(root.id, false, true);
      }
      return;
    }
    // 2. Sibling Reordering (Up/Down/Left/Right Arrows)
    const isReorderPos = isVerticalMode ? key === "ArrowRight" : key === "ArrowDown";
    const isReorderNeg = isVerticalMode ? key === "ArrowLeft" : key === "ArrowUp";
    if (isReorderPos || isReorderNeg) {
      const siblings = runtimeContext.getChildrenNodes(parent.id, allElements);
      if (siblings.length < 2) return;
      // Ensure siblings are sorted by current order before swapping
      siblings.sort(
        (a, b) => runtimeContext.getMindmapOrder(a) - runtimeContext.getMindmapOrder(b),
      );
      const currentIndex = siblings.findIndex((s) => s.id === current.id);
      if (currentIndex === -1) return;
      let swapIndex = -1;
      if (isVerticalMode) {
        // Up/Down facing uses Left/Right keys for siblings
        if (key === "ArrowRight") swapIndex = currentIndex + 1;
        if (key === "ArrowLeft") swapIndex = currentIndex - 1;
      } else {
        // Radial Left flips the interpretation of Up/Down since it generates from Bottom to Top
        if (isRadial && !isInPositive) {
          if (key === "ArrowUp") swapIndex = currentIndex + 1;
          if (key === "ArrowDown") swapIndex = currentIndex - 1;
        } else {
          if (key === "ArrowDown") swapIndex = currentIndex + 1;
          if (key === "ArrowUp") swapIndex = currentIndex - 1;
        }
      }
      // Apply circular wrapping for Radial mode (Level 1 nodes only)
      if (isRadial && parent.id === root.id) {
        swapIndex = (swapIndex + siblings.length) % siblings.length;
      }
      // Boundary checks
      if (swapIndex >= 0 && swapIndex < siblings.length) {
        const swapNode = siblings[swapIndex];
        // Prevent cross-side swapping for L1 nodes (Except for Radial maps, where we just wrapped)
        if (parent.id === root.id && !isRadial) {
          const swapIsPos = isVerticalMode
            ? swapNode.y + swapNode.height / 2 > rootCenterY
            : swapNode.x + swapNode.width / 2 > rootCenter;
          if (swapIsPos !== isInPositive) {
            return; // Silently block cross-side reordering
          }
        }
        // Re-normalize all orders to clean integers to prevent drift
        runtimeContext.ea.copyViewElementsToEAforEditing(siblings);
        siblings.forEach((sib, idx) => {
          let newOrder = idx;
          if (idx === currentIndex) newOrder = swapIndex;
          if (idx === swapIndex) newOrder = currentIndex;
          runtimeContext.ea.addAppendUpdateCustomData(sib.id, {
            mindmapOrder: newOrder,
          });
        });
        await runtimeContext.addElementsToView({
          captureUpdate: "EVENTUALLY",
        });
        // Trigger layout specifically honoring the new sort order
        runtimeContext.triggerGlobalLayout(root.id, false, true);
      }
    }
  };
  return {
    updateSubtreeFontSize,
    updateSubtreeStrokeWidth,
    updateSubtreeColor,
    toggleSubmapRoot,
    changeNodeOrder,
  };
}
