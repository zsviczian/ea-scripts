/**
 * @file layout.js
 * @overview Scene-wide layout transactions and refresh coordination.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createLayout(runtimeContext) {
  /**
   * Main layout execution function.
   * Calculates positions for a tree rooted at rootId and moves elements.
   *
   * @param {string} rootId - ID of the root node.
   * @param {boolean} forceUngroup - Force ungrouping of branches before layout.
   * @param {boolean} mustHonorMindmapOrder - If true, enforces the current mindmapOrder over visual position.
   */
  const triggerGlobalLayout = async (
    rootId,
    forceUngroup = false,
    mustHonorMindmapOrder = false,
  ) => {
    if (!runtimeContext.isViewSet()) return;
    const selectedElement = runtimeContext.getMindmapNodeFromSelection();
    if (!selectedElement) return;
    const run = async (
      allElements,
      mindmapIds,
      root,
      doVisualSort,
      sharedSets,
      mustHonorMindmapOrder = false,
    ) => {
      return runtimeContext.withRootLayoutContext(root, () => {
        const oldMode = root.customData?.growthMode;
        const newMode = root.customData?.growthMode || runtimeContext.currentModalGrowthMode;
        // Track if any meaningful changes occur
        let orderChanged = false;
        let modeChanged = false;
        let visualChange = false;
        // Snapshot positions
        const originalPositions = new Map();
        allElements.forEach((el) => {
          originalPositions.set(el.id, {
            x: el.x,
            y: el.y,
          });
        });
        const elementById = runtimeContext.buildElementMap(allElements);
        const parentMap = runtimeContext.buildParentMap(allElements, elementById);
        const childrenByParent = runtimeContext.buildChildrenMap(allElements, elementById);
        const heightCache = new Map();
        const widthCache = new Map();
        const branchIds = new Set(mindmapIds);
        const groupToNodes = runtimeContext.buildGroupToNodes(branchIds, allElements);
        const hasGlobalFolds = allElements.some((el) => el.customData?.isFolded === true);
        const l1Nodes = runtimeContext.getChildrenNodes(rootId, allElements);
        if (l1Nodes.length === 0)
          return {
            structuralChange: false,
            visualChange: false,
          };
        if (runtimeContext.groupBranches || forceUngroup) {
          mindmapIds.forEach((id) => {
            const el = runtimeContext.ea.getElement(id);
            if (el && el.groupIds) {
              el.groupIds = el.groupIds.filter(
                (gid) => !runtimeContext.isMindmapGroup(gid, allElements),
              );
            }
          });
        }
        const rootBox = runtimeContext.getNodeBox(root, allElements);
        const rootCenter = {
          x: rootBox.minX + rootBox.width / 2,
          y: rootBox.minY + rootBox.height / 2,
        };
        const layoutContext = {
          allElements,
          rootId,
          rootBox,
          rootCenter,
          hasGlobalFolds,
          mode: newMode,
          childrenByParent,
          heightCache,
          widthCache,
          elementById,
          parentMap,
        };
        const isModeSwitch = mustHonorMindmapOrder || (oldMode && oldMode !== newMode);
        if (!isModeSwitch && doVisualSort && !mustHonorMindmapOrder) {
          orderChanged = runtimeContext.sortL1NodesBasedOnVisualSequence(
            l1Nodes,
            newMode,
            rootCenter,
          );
        } else if (!mustHonorMindmapOrder) {
          if (oldMode !== newMode) {
            runtimeContext.ea.addAppendUpdateCustomData(rootId, {
              growthMode: newMode,
            });
            modeChanged = true;
          }
        }
        if (newMode === "Radial") {
          runtimeContext.layoutL1Nodes(
            l1Nodes,
            {
              sortMethod: "radial",
              centerAngle: null,
              gapMultiplier: runtimeContext.layoutSettings.GAP_MULTIPLIER_RADIAL,
              fillSweep: root.customData?.fillSweep ?? runtimeContext.fillSweep,
            },
            layoutContext,
            mustHonorMindmapOrder,
          );
        } else if (["Right-facing", "Left-facing", "Right-Left"].includes(newMode)) {
          const leftNodes = [];
          const rightNodes = [];
          if (newMode === "Right-Left") {
            if (isModeSwitch && !mustHonorMindmapOrder) {
              const splitIdx = Math.ceil(l1Nodes.length / 2);
              l1Nodes.forEach((node, i) => {
                if (i < splitIdx) rightNodes.push(node);
                else leftNodes.push(node);
              });
            } else {
              l1Nodes.forEach((node) => {
                const nodeCX = node.x + node.width / 2;
                if (nodeCX > rootCenter.x) rightNodes.push(node);
                else leftNodes.push(node);
              });
            }
          } else if (newMode === "Left-facing") {
            l1Nodes.forEach((node) => leftNodes.push(node));
          } else {
            l1Nodes.forEach((node) => rightNodes.push(node));
          }
          if (rightNodes.length > 0) {
            runtimeContext.layoutL1Nodes(
              rightNodes,
              {
                sortMethod: "vertical",
                centerAngle: 90,
                gapMultiplier: runtimeContext.layoutSettings.GAP_MULTIPLIER_DIRECTIONAL,
              },
              layoutContext,
              mustHonorMindmapOrder,
            );
          }
          if (leftNodes.length > 0) {
            runtimeContext.layoutL1Nodes(
              leftNodes,
              {
                sortMethod: "vertical",
                centerAngle: 270,
                gapMultiplier: runtimeContext.layoutSettings.GAP_MULTIPLIER_DIRECTIONAL,
              },
              layoutContext,
              mustHonorMindmapOrder,
            );
          }
        } else if (["Up-facing", "Down-facing", "Up-Down"].includes(newMode)) {
          const upNodes = [];
          const downNodes = [];
          if (newMode === "Up-Down") {
            if (isModeSwitch && !mustHonorMindmapOrder) {
              const splitIdx = Math.ceil(l1Nodes.length / 2);
              l1Nodes.forEach((node, i) => {
                if (i < splitIdx) downNodes.push(node);
                else upNodes.push(node);
              });
            } else {
              l1Nodes.forEach((node) => {
                const nodeCY = node.y + node.height / 2;
                if (nodeCY > rootCenter.y) downNodes.push(node);
                else upNodes.push(node);
              });
            }
          } else if (newMode === "Up-facing") {
            l1Nodes.forEach((node) => upNodes.push(node));
          } else {
            l1Nodes.forEach((node) => downNodes.push(node));
          }
          // Initialize cache required for vertical mode width tracking
          layoutContext.widthCache = new Map();
          if (downNodes.length > 0) {
            runtimeContext.layoutL1Nodes(
              downNodes,
              {
                sortMethod: "horizontal",
                centerAngle: 90,
                gapMultiplier: runtimeContext.layoutSettings.GAP_MULTIPLIER_DIRECTIONAL,
              },
              layoutContext,
              mustHonorMindmapOrder,
            );
          }
          if (upNodes.length > 0) {
            runtimeContext.layoutL1Nodes(
              upNodes,
              {
                sortMethod: "horizontal",
                centerAngle: 270,
                gapMultiplier: runtimeContext.layoutSettings.GAP_MULTIPLIER_DIRECTIONAL,
              },
              layoutContext,
              mustHonorMindmapOrder,
            );
          }
        }
        const { mindmapIdsSet, crosslinkIdSet, decorationIdSet } = sharedSets;
        runtimeContext.moveCrossLinks(runtimeContext.ea.getElements(), originalPositions);
        runtimeContext.moveDecorations(
          runtimeContext.ea.getElements(),
          originalPositions,
          groupToNodes,
          rootId,
          elementById,
          parentMap,
        );
        runtimeContext.ea
          .getElements()
          .filter(
            (el) =>
              !mindmapIdsSet.has(el.id) &&
              !crosslinkIdSet.has(el.id) &&
              !decorationIdSet.has(el.id),
          )
          .forEach((el) => {
            delete runtimeContext.ea.elementsDict[el.id];
          });
        // Detect Visual Changes
        for (const el of runtimeContext.ea.getElements()) {
          const oldPos = originalPositions.get(el.id);
          if (oldPos) {
            if (Math.abs(el.x - oldPos.x) > 0.01 || Math.abs(el.y - oldPos.y) > 0.01) {
              visualChange = true;
              break;
            }
          }
        }
        return {
          structuralChange: orderChanged || modeChanged,
          visualChange,
        };
      });
    };
    const viewElements = runtimeContext.ea.getViewElements();
    const projectElements = runtimeContext.getMindmapProjectElements(rootId, viewElements);
    runtimeContext.ea.copyViewElementsToEAforEditing(projectElements);
    let allElements = runtimeContext.ea.getElements();
    let root = allElements.find((el) => el.id === rootId);
    if (!root) return;
    if (root.customData?.autoLayoutDisabled) return;
    const mindmapIds = runtimeContext.getBranchElementIds(rootId, allElements);
    const { structuralGroupId, groupedElementIds } = runtimeContext.getStructuralGroupForNode(
      mindmapIds,
      allElements,
      rootId,
    );
    if (structuralGroupId) {
      runtimeContext.removeGroupFromElements(structuralGroupId, allElements);
    }
    const expandedMindmapIds = [...mindmapIds];
    mindmapIds.forEach((id) => {
      const el = allElements.find((e) => e.id === id);
      if (el && el.boundElements) {
        el.boundElements.forEach((be) => expandedMindmapIds.push(be.id));
      }
    });
    const mindmapIdsSet = new Set(expandedMindmapIds);
    const crosslinkIdSet = runtimeContext.collectCrosslinkIds(allElements);
    const decorationIdSet = runtimeContext.collectDecorationIds(allElements, rootId);
    const sharedSets = {
      mindmapIdsSet,
      crosslinkIdSet,
      decorationIdSet,
    };
    // --- Snapshot boundary nodes before Run 1 ---
    // We check for nodes that have a boundaryId defined
    const boundaryNodeSnapshot = new Map();
    allElements.forEach((el) => {
      if (typeof el.customData?.mindmapOrder !== "undefined" && el.customData?.boundaryId) {
        boundaryNodeSnapshot.set(el.id, {
          x: el.x,
          y: el.y,
          width: el.width,
          height: el.height,
        });
      }
    });
    const result1 = await run(
      allElements,
      mindmapIds,
      root,
      true,
      sharedSets,
      mustHonorMindmapOrder,
    );
    // --- Check if any boundary node moved ---
    let boundaryMoved = false;
    if (boundaryNodeSnapshot.size > 0) {
      for (const [id, oldSnapshot] of boundaryNodeSnapshot) {
        const newEl = runtimeContext.ea.getElement(id);
        if (newEl) {
          if (
            Math.abs(newEl.x - oldSnapshot.x) > 0.01 ||
            Math.abs(newEl.y - oldSnapshot.y) > 0.01 ||
            Math.abs(newEl.width - oldSnapshot.width) > 0.01 ||
            Math.abs(newEl.height - oldSnapshot.height) > 0.01
          ) {
            boundaryMoved = true;
            break;
          }
        }
      }
    }
    if (result1.structuralChange || forceUngroup || boundaryMoved) {
      await runtimeContext.addElementsToView({
        captureUpdate: "EVENTUALLY",
      });
      // Isolate subset again for the second pass
      const viewElementsRun2 = runtimeContext.ea.getViewElements();
      const projectElementsRun2 = runtimeContext.getMindmapProjectElements(
        rootId,
        viewElementsRun2,
      );
      runtimeContext.ea.copyViewElementsToEAforEditing(projectElementsRun2);
      allElements = runtimeContext.ea.getElements();
      root = allElements.find((el) => el.id === rootId);
      await run(allElements, mindmapIds, root, false, sharedSets, mustHonorMindmapOrder);
      if (structuralGroupId && !forceUngroup) {
        // Restore the exact same group ID instead of creating a new one
        // This prevents Excalidraw's editingGroupId from pointing to a deleted group,
        // which causes the 0x0 rendering artifact at the origin.
        groupedElementIds.forEach((id) => {
          const el = runtimeContext.ea.getElement(id);
          if (el && (!el.groupIds || !el.groupIds.includes(structuralGroupId))) {
            el.groupIds = [...(el.groupIds || []), structuralGroupId];
          }
        });
      }
      await runtimeContext.addElementsToView({
        captureUpdate: "IMMEDIATELY",
      });
    } else {
      // If only visual change (no struct change, no boundary move), commit Run 1
      if (result1.visualChange) {
        if (structuralGroupId && !forceUngroup) {
          // Restore the exact same group ID instead of creating a new one
          groupedElementIds.forEach((id) => {
            const el = runtimeContext.ea.getElement(id);
            if (el && (!el.groupIds || !el.groupIds.includes(structuralGroupId))) {
              el.groupIds = [...(el.groupIds || []), structuralGroupId];
            }
          });
        }
        await runtimeContext.addElementsToView({
          captureUpdate: "IMMEDIATELY",
        });
      } else {
        runtimeContext.ea.clear();
      }
    }
    runtimeContext.selectNodeInView(selectedElement);
  };

  /**
   * Triggers a layout refresh for the tree containing the selected element.
   */
  const refreshMapLayout = async (sel) => {
    if (!runtimeContext.isViewSet()) return;
    if (!sel) sel = runtimeContext.getMindmapNodeFromSelection();
    if (sel) {
      const allElements = runtimeContext.ea.getViewElements();
      const settingsRoot = runtimeContext.getSettingsRootNode(sel, allElements);
      if (!settingsRoot) return;
      if (settingsRoot.customData?.autoLayoutDisabled === true) return;
      await triggerGlobalLayout(settingsRoot.id);
    }
  };
  return { triggerGlobalLayout, refreshMapLayout };
}
