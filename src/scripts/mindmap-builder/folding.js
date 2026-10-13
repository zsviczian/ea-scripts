/**
 * @file folding.js
 * @overview folding implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createFolding(runtimeContext) {
  // ---------------------------------------------------------------------------
  // Folding Logic
  // ---------------------------------------------------------------------------
  /**
   * Manages the "..." fold indicator text element.
   * Creates it if missing and show=true, hides it if show=false.
   * Updates its position relative to the parent node.
   *
   * @param {ExcalidrawElement} node - The parent node.
   * @param {boolean} show - Whether to show the fold indicator.
   * @param {ExcalidrawElement[]} allElements - All elements in the scene.
   */
  const manageFoldIndicator = (node, show, allElements) => {
    if (show) {
      const children = runtimeContext.getChildrenNodes(node.id, allElements);
      if (children.length === 0) show = false;
    }
    const existingId = node.customData?.foldIndicatorId;
    let side = 1;
    const parent = runtimeContext.getParentNode(node.id, allElements);
    if (parent) {
      const parentCenter = parent.x + parent.width / 2;
      const nodeCenter = node.x + node.width / 2;
      side = nodeCenter < parentCenter ? -1 : 1;
    }
    if (show) {
      let ind;
      if (existingId) {
        ind = allElements.find((el) => el.id === existingId);
        if (ind) {
          ind.isDeleted = false;
          ind.strokeColor = node.strokeColor;
          ind.opacity = runtimeContext.layoutSettings.INDICATOR_OPACITY;
        }
      }
      // Create new indicator if none exists or wasn't found
      if (!ind) {
        const fontSize = runtimeContext.ea.getBoundTextElement(node).eaElement?.fontSize || 20;
        const id = runtimeContext.ea.addText(0, 0, "...");
        ind = runtimeContext.ea.getElement(id);
        ind.fontSize = fontSize;
        ind.strokeColor = node.strokeColor;
        ind.opacity = runtimeContext.layoutSettings.INDICATOR_OPACITY;
        ind.textVerticalAlign = "middle";
        if (node.groupIds && node.groupIds.length > 0) {
          ind.groupIds = [node.groupIds[0]];
        } else {
          runtimeContext.ea.addToGroup([node.id, id]);
        }
        runtimeContext.ea.addAppendUpdateCustomData(node.id, {
          foldIndicatorId: id,
        });
      }
      if (side === 1) {
        ind.x = node.x + node.width + runtimeContext.layoutSettings.INDICATOR_OFFSET;
        ind.textAlign = "left";
      } else {
        ind.x = node.x - runtimeContext.layoutSettings.INDICATOR_OFFSET - ind.width;
        ind.textAlign = "right";
      }
      ind.y = node.y + node.height - ind.fontSize;
    } else {
      // Hide/Delete indicator
      if (existingId) {
        const ind = allElements.find((el) => el.id === existingId);
        if (ind) ind.isDeleted = true;
        runtimeContext.ea.addAppendUpdateCustomData(node.id, {
          foldIndicatorId: undefined,
        });
      }
    }
  };

  /**
   * Toggles visibility of an element by manipulating opacity and locked state.
   * Saves the original state to customData for restoration.
   *
   * @param {ExcalidrawElement} el - The element to update.
   * @param {boolean} hide - Whether to hide the element.
   */
  const setElementVisibility = (el, hide) => {
    if (hide) {
      // Only save state if not already saved to avoid overwriting original state with hidden state
      if (!el.customData?.foldState) {
        // Safety: If for some reason opacity is already 0, assume 100 to avoid locking it invisible forever
        const safeOpacity = el.opacity === 0 ? 100 : el.opacity;
        runtimeContext.ea.addAppendUpdateCustomData(el.id, {
          foldState: {
            opacity: safeOpacity,
            locked: el.locked,
          },
        });
      }
      el.opacity = 0;
      el.locked = true;
    } else {
      // Restore original state
      if (el.customData?.foldState) {
        el.opacity = el.customData.foldState.opacity;
        el.locked = el.customData.foldState.locked;
        runtimeContext.ea.addAppendUpdateCustomData(el.id, {
          foldState: undefined,
        });
      } else {
        // Default fallback if no state was saved but we need to show
        if (el.opacity === 0) el.opacity = 100;
        el.locked = false;
      }
    }
    const boundTextElement = runtimeContext.ea.getBoundTextElement(el);
    if (boundTextElement.eaElement && boundTextElement.eaElement !== el) {
      setElementVisibility(boundTextElement?.eaElement, hide);
    }
  };

  /**
   * Recursively updates the visibility of a branch based on fold state.
   * Handles nodes, connectors, grouped decorations, cross-links, and boundaries.
   *
   * @param {string} nodeId - The ID of the current node.
   * @param {boolean} parentHidden - Whether the parent is hidden (inherited visibility).
   * @param {ExcalidrawElement[]} allElements - All elements in the scene.
   * @param {boolean} isRootOfFold - Whether this node is the root of the fold operation (always visible itself).
   */
  const updateBranchVisibility = (nodeId, parentHidden, allElements, isRootOfFold, rootId) => {
    const node = allElements.find((el) => el.id === nodeId);
    if (!node) return;
    const isFolded = node.customData?.isFolded === true;
    // The root of the fold operation stays visible unless its parent was already hidden
    const shouldHideThis = parentHidden && !isRootOfFold;
    setElementVisibility(node, shouldHideThis);
    // Set to track the ID of the main node AND any decorations grouped with it
    // This allows us to detect crosslinks attached to decorations, not just the main node
    const localNodeIds = new Set([node.id]);
    // Handle Decorations (Grouped elements like boxes, icons, stickers)
    if (node.groupIds && node.groupIds.length > 0) {
      const groupElements = runtimeContext.ea.getElementsInTheSameGroupWithElement(
        node,
        allElements,
      );
      const childrenIds = runtimeContext.getChildrenNodes(nodeId, allElements).map((c) => c.id);
      groupElements.forEach((el) => {
        if (el.id === node.id) return;
        if (el.customData?.isBranch) return;
        if (el.customData?.isBoundary) return;
        if (el.id === node.customData?.foldIndicatorId) return;
        if (childrenIds.includes(el.id)) return;
        // Skip other structural elements (like parents or siblings in the same group).
        // This prevents a hidden child node from hiding its visible parent/siblings
        // when "Group Branches" is active.
        if (runtimeContext.isStructuralElement(el, allElements, rootId)) return;
        setElementVisibility(el, shouldHideThis);
        localNodeIds.add(el.id);
      });
    }
    // Handle Crosslinks (Non-structural arrows connected to this node OR its decorations)
    const crossLinks = allElements.filter(
      (el) =>
        el.type === "arrow" &&
        !el.customData?.isBranch &&
        ((el.startBinding && localNodeIds.has(el.startBinding.elementId)) ||
          (el.endBinding && localNodeIds.has(el.endBinding.elementId))),
    );
    crossLinks.forEach((arrow) => {
      if (shouldHideThis) {
        setElementVisibility(arrow, true);
      } else {
        // Determine which end is the "other" node
        const isStartLocal = arrow.startBinding && localNodeIds.has(arrow.startBinding.elementId);
        const otherId = isStartLocal ? arrow.endBinding?.elementId : arrow.startBinding?.elementId;
        const otherNode = allElements.find((e) => e.id === otherId);
        if (otherNode && !otherNode.isDeleted && otherNode.opacity > 0) {
          setElementVisibility(arrow, false);
        }
      }
    });
    // Handle Boundary Visibility
    if (node.customData?.boundaryId) {
      const boundEl = allElements.find((el) => el.id === node.customData.boundaryId);
      if (boundEl) {
        if (shouldHideThis || isFolded) {
          boundEl.opacity = 0;
          boundEl.locked = true;
        } else {
          boundEl.opacity = 30;
          boundEl.locked = false;
        }
      }
    }
    // Manage Indicator
    const showIndicator = !shouldHideThis && isFolded;
    manageFoldIndicator(node, showIndicator, allElements);
    // Process Children
    const childrenHidden = shouldHideThis || isFolded;
    const children = runtimeContext.getChildrenNodes(nodeId, allElements);
    children.forEach((child) => {
      // Handle the connector arrow
      const arrow = allElements.find(
        (a) =>
          a.type === "arrow" &&
          a.customData?.isBranch &&
          a.startBinding?.elementId === nodeId &&
          a.endBinding?.elementId === child.id,
      );
      if (arrow) {
        setElementVisibility(arrow, childrenHidden);
      }
      // Recurse
      updateBranchVisibility(child.id, childrenHidden, allElements, false, rootId);
    });
  };

  /**
   * Toggles the folded state of the selected node's branch.
   * Supports different modes: L0 (direct children), L1 (grandchildren), ALL (recursive).
   *
   * @param {string} mode - "L0" | "L1" | "ALL"
   */
  const toggleFold = async (mode = "L0") => {
    if (!runtimeContext.isViewSet()) return;
    const sel = runtimeContext.getMindmapNodeFromSelection();
    if (!sel) return;
    const allViewElements = runtimeContext.ea.getViewElements();
    const info = runtimeContext.getHierarchy(sel, allViewElements);
    // Only target elements in the specific mindmap tree to avoid massive array loops
    const projectElements = runtimeContext.getMindmapProjectElements(info.rootId, allViewElements);
    runtimeContext.ea.copyViewElementsToEAforEditing(projectElements);
    const wbElements = runtimeContext.ea.getElements();
    const targetNode = wbElements.find((el) => el.id === sel.id);
    if (!targetNode) return;
    const children = runtimeContext.getChildrenNodes(targetNode.id, wbElements);
    if (children.length === 0) return;
    if (mode === "L1") {
      const hasGrandChildren = children.some(
        (child) => runtimeContext.getChildrenNodes(child.id, wbElements).length > 0,
      );
      if (!hasGrandChildren) return;
    }
    let isFoldAction = false;
    if (mode === "L0") {
      const isCurrentlyFolded = targetNode.customData?.isFolded === true;
      isFoldAction = !isCurrentlyFolded;
      runtimeContext.ea.addAppendUpdateCustomData(targetNode.id, {
        isFolded: isFoldAction,
      });
    } else if (mode === "L1") {
      runtimeContext.ea.addAppendUpdateCustomData(targetNode.id, {
        isFolded: false,
      });
      const anyChildFolded = children.some((child) => child.customData?.isFolded === true);
      isFoldAction = !anyChildFolded;
      children.forEach((child) => {
        runtimeContext.ea.addAppendUpdateCustomData(child.id, {
          isFolded: isFoldAction,
        });
      });
    } else if (mode === "ALL") {
      runtimeContext.ea.addAppendUpdateCustomData(targetNode.id, {
        isFolded: false,
      });
      const nonLeafDescendants = [];
      const stack = [...children];
      while (stack.length) {
        const node = stack.pop();
        const nodeChildren = runtimeContext.getChildrenNodes(node.id, wbElements);
        if (nodeChildren.length > 0) {
          nonLeafDescendants.push(node);
          nodeChildren.forEach((child) => stack.push(child));
        }
      }
      const anyDescendantFolded = nonLeafDescendants.some(
        (node) => node.customData?.isFolded === true,
      );
      isFoldAction = !anyDescendantFolded;
      nonLeafDescendants.forEach((node) => {
        runtimeContext.ea.addAppendUpdateCustomData(node.id, {
          isFolded: isFoldAction,
        });
      });
    }
    updateBranchVisibility(targetNode.id, false, wbElements, true, info.rootId);
    await runtimeContext.addElementsToView({
      captureUpdate: runtimeContext.autoLayoutDisabled ? "IMMEDIATELY" : "EVENTUALLY",
    });
    if (!runtimeContext.autoLayoutDisabled) {
      await runtimeContext.triggerGlobalLayout(info.rootId);
    }
    runtimeContext.ea.viewUpdateScene({
      appState: {
        selectedGroupIds: {},
      },
    });
    runtimeContext.focusSelected();
  };
  return { manageFoldIndicator, setElementVisibility, updateBranchVisibility, toggleFold };
}
