/**
 * @file horizontalLayout.js
 * @overview Horizontal subtree placement, including nested submap roots.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createHorizontalLayout(runtimeContext) {
  /**
   * Layout entrypoint for nodes marked as additional roots.
   * The node position itself is controlled by the parent/root layout pass.
   * Only its descendants are laid out using this node's local root settings.
   */
  const layoutChildrenAsAdditionalRoot = (
    nodeId,
    allElements,
    hasGlobalFolds,
    childrenByParent,
    heightCache,
    widthCache,
    elementById,
    mustHonorMindmapOrder = false,
    parentMap = null,
  ) => {
    const node = elementById?.get(nodeId) ?? allElements.find((el) => el.id === nodeId);
    if (!node || node.customData?.isAdditionalRoot !== true) return false;
    const l1Nodes = runtimeContext.getChildrenNodes(nodeId, allElements);
    if (l1Nodes.length === 0) return false;
    // Apply local submap settings for this subtree only.
    runtimeContext.withRootLayoutContext(node, (cfg) => {
      const localHeightCache = heightCache ?? new Map();
      const localWidthCache = widthCache ?? new Map();
      const eaNode = runtimeContext.ea.getElement(nodeId);
      if (!eaNode) return;
      const rootBox = runtimeContext.getNodeBox(eaNode, allElements);
      const rootCenter = {
        x: rootBox.minX + rootBox.width / 2,
        y: rootBox.minY + rootBox.height / 2,
      };
      const mode = cfg.growthMode;
      const layoutContext = {
        allElements,
        rootId: nodeId,
        rootBox,
        rootCenter,
        hasGlobalFolds,
        mode,
        childrenByParent,
        heightCache: localHeightCache,
        widthCache: localWidthCache,
        elementById,
        parentMap,
      };
      // If order is not explicitly locked by an operation, sync to visual sequence.
      if (!mustHonorMindmapOrder) {
        runtimeContext.sortL1NodesBasedOnVisualSequence(l1Nodes, mode, rootCenter);
      }
      if (mode === "Radial") {
        runtimeContext.layoutL1Nodes(
          l1Nodes,
          {
            sortMethod: "radial",
            centerAngle: null,
            gapMultiplier: runtimeContext.layoutSettings.GAP_MULTIPLIER_RADIAL,
            fillSweep: cfg.fillSweep,
          },
          layoutContext,
          mustHonorMindmapOrder,
        );
        return;
      }
      if (["Right-facing", "Left-facing", "Right-Left"].includes(mode)) {
        const leftNodes = [];
        const rightNodes = [];
        if (mode === "Right-Left") {
          l1Nodes.forEach((child) => {
            const childCX = child.x + child.width / 2;
            if (childCX > rootCenter.x) rightNodes.push(child);
            else leftNodes.push(child);
          });
          // If all children are on one side (e.g. after fresh conversion), balance using order.
          if ((leftNodes.length === 0 || rightNodes.length === 0) && l1Nodes.length > 1) {
            leftNodes.length = 0;
            rightNodes.length = 0;
            const splitIdx = Math.ceil(l1Nodes.length / 2);
            l1Nodes.forEach((child, i) => {
              if (i < splitIdx) rightNodes.push(child);
              else leftNodes.push(child);
            });
          }
        } else if (mode === "Left-facing") {
          l1Nodes.forEach((child) => leftNodes.push(child));
        } else {
          l1Nodes.forEach((child) => rightNodes.push(child));
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
        return;
      }
      const upNodes = [];
      const downNodes = [];
      if (mode === "Up-Down") {
        l1Nodes.forEach((child) => {
          const childCY = child.y + child.height / 2;
          if (childCY > rootCenter.y) downNodes.push(child);
          else upNodes.push(child);
        });
        if ((upNodes.length === 0 || downNodes.length === 0) && l1Nodes.length > 1) {
          upNodes.length = 0;
          downNodes.length = 0;
          const splitIdx = Math.ceil(l1Nodes.length / 2);
          l1Nodes.forEach((child, i) => {
            if (i < splitIdx) downNodes.push(child);
            else upNodes.push(child);
          });
        }
      } else if (mode === "Up-facing") {
        l1Nodes.forEach((child) => upNodes.push(child));
      } else {
        l1Nodes.forEach((child) => downNodes.push(child));
      }
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
    });
    return true;
  };

  const layoutSubtree = (
    nodeId,
    targetX,
    targetCenterY,
    side,
    allElements,
    hasGlobalFolds,
    childrenByParent,
    heightCache,
    elementById,
    mustHonorMindmapOrder = false,
    rootId,
    parentMap = null,
  ) => {
    const node = elementById?.get(nodeId) ?? allElements.find((el) => el.id === nodeId);
    const eaNode = runtimeContext.ea.getElement(nodeId);
    const isPinned = node.customData?.isPinned === true;
    let dx = 0,
      dy = 0;
    if (!isPinned) {
      const newX = side === 1 ? targetX : targetX - node.width;
      const newY = targetCenterY - node.height / 2;
      dx = newX - eaNode.x;
      dy = newY - eaNode.y;
      eaNode.x = newX;
      eaNode.y = newY;
    }
    if (node.customData?.isFolded) return;
    const currentX = eaNode.x;
    const currentYCenter = eaNode.y + node.height / 2;
    let effectiveSide = side;
    const parent = runtimeContext.getParentNode(nodeId, allElements, parentMap);
    if (parent) {
      const parentCenterX = parent.x + parent.width / 2;
      const nodeCenterX = currentX + node.width / 2;
      effectiveSide = nodeCenterX >= parentCenterX ? 1 : -1;
    }
    // Handle Fold Indicator
    if (node.customData?.foldIndicatorId) {
      const ind = runtimeContext.ea.getElement(node.customData.foldIndicatorId);
      if (ind) {
        if (effectiveSide === 1) {
          ind.x = eaNode.x + eaNode.width + runtimeContext.layoutSettings.INDICATOR_OFFSET;
          ind.textAlign = "left";
        } else {
          ind.x = eaNode.x - runtimeContext.layoutSettings.INDICATOR_OFFSET - ind.width;
          ind.textAlign = "right";
        }
        ind.y = eaNode.y + eaNode.height / 2 - ind.height / 2;
      }
    }
    const textElement = runtimeContext.ea.getBoundTextElement(eaNode).eaElement;
    if (textElement && !runtimeContext.centerText && textElement.textAlign !== "center") {
      textElement.textAlign = effectiveSide === 1 ? "left" : "right";
    }
    const children =
      childrenByParent?.get(nodeId) ?? runtimeContext.getChildrenNodes(nodeId, allElements);
    // Additional roots are laid out as independent local maps for their descendants.
    // The additional-root node itself stays positioned by the parent layout pass.
    if (node.customData?.isAdditionalRoot === true) {
      if (node.customData?.autoLayoutDisabled) {
        // Shift all descendants to maintain manual layout relative to this root
        if (dx !== 0 || dy !== 0) {
          const branchIds = runtimeContext.getBranchElementIds(nodeId, allElements);
          const descendants = branchIds.filter((id) => id !== nodeId);
          descendants.forEach((descId) => {
            const descNode = elementById?.get(descId) ?? allElements.find((e) => e.id === descId);
            // Do not shift pinned elements
            if (descNode?.customData?.isPinned) return;
            // Do not shift non-branch arrows because moveCrossLinks automatically handles them
            if (descNode && descNode.type === "arrow" && !descNode.customData?.isBranch) return;
            if (!runtimeContext.ea.getElement(descId)) {
              if (descNode) runtimeContext.ea.copyViewElementsToEAforEditing([descNode]);
            }
            const descEl = runtimeContext.ea.getElement(descId);
            if (descEl) {
              descEl.x += dx;
              descEl.y += dy;
            }
          });
        }
      } else {
        layoutChildrenAsAdditionalRoot(
          nodeId,
          allElements,
          hasGlobalFolds,
          childrenByParent,
          heightCache,
          null,
          elementById,
          mustHonorMindmapOrder,
          parentMap,
        );
      }
      if (node.customData?.boundaryId) {
        runtimeContext.updateNodeBoundary(node, runtimeContext.ea.getElements(), rootId);
      }
      return;
    }
    const unpinnedChildren = children.filter((child) => !child.customData?.isPinned);
    const pinnedChildren = children.filter((child) => child.customData?.isPinned);
    if (unpinnedChildren.length > 0) {
      // SORTING LOGIC:
      // If mustHonorMindmapOrder is true: Explicitly sort by mindmapOrder to enforce the manual change.
      // If mustHonorMindmapOrder is false: Fallback to visual Y-position to keep map strictly ordered by position (auto-layout).
      unpinnedChildren.sort((a, b) => {
        if (mustHonorMindmapOrder) {
          return runtimeContext.getMindmapOrder(a) - runtimeContext.getMindmapOrder(b);
        }
        const dy = a.y - b.y;
        if (dy !== 0) return dy;
        return String(a.id).localeCompare(String(b.id));
      });
      // Only update mindmapOrder to match visual reality if we are NOT in a manual sort operation
      if (!mustHonorMindmapOrder) {
        unpinnedChildren.forEach((child, i) => {
          if (runtimeContext.getMindmapOrder(child) !== i) {
            runtimeContext.ea.addAppendUpdateCustomData(child.id, {
              mindmapOrder: i,
            });
          }
        });
      }
      const subtreeHeight = runtimeContext.getSubtreeHeight(
        nodeId,
        allElements,
        childrenByParent,
        heightCache,
        elementById,
      );
      let currentY = currentYCenter - subtreeHeight / 2;
      const dynamicGapX = runtimeContext.layoutSettings.GAP_X;
      unpinnedChildren.forEach((child) => {
        const childH = runtimeContext.getSubtreeHeight(
          child.id,
          allElements,
          childrenByParent,
          heightCache,
          elementById,
        );
        layoutSubtree(
          child.id,
          effectiveSide === 1 ? currentX + node.width + dynamicGapX : currentX - dynamicGapX,
          currentY + childH / 2,
          effectiveSide,
          allElements,
          hasGlobalFolds,
          childrenByParent,
          heightCache,
          elementById,
          mustHonorMindmapOrder,
          rootId,
          parentMap,
        );
        const childNode =
          elementById?.get(child.id) ?? allElements.find((el) => el.id === child.id);
        const grandChildren =
          childrenByParent?.get(child.id) ?? runtimeContext.getChildrenNodes(child.id, allElements);
        const hasUnpinnedGrandChildren = grandChildren.some((gc) => !gc.customData?.isPinned);
        const fontSize = childNode.fontSize ?? 20;
        const gap = !hasUnpinnedGrandChildren
          ? Math.round(fontSize * runtimeContext.layoutSettings.GAP_MULTIPLIER)
          : runtimeContext.layoutSettings.GAP_Y;
        currentY += childH + gap;
      });
    }
    pinnedChildren.forEach((child) =>
      layoutSubtree(
        child.id,
        child.x,
        child.y + child.height / 2,
        effectiveSide,
        allElements,
        hasGlobalFolds,
        childrenByParent,
        heightCache,
        elementById,
        mustHonorMindmapOrder,
        rootId,
        parentMap,
      ),
    );
    // Update Arrows
    children.forEach((child) => {
      const arrow = allElements.find(
        (a) =>
          a.type === "arrow" &&
          a.customData?.isBranch &&
          a.startBinding?.elementId === nodeId &&
          a.endBinding?.elementId === child.id,
      );
      if (arrow) {
        const eaChild = runtimeContext.ea.getElement(child.id);
        const childCenterX = eaChild.x + eaChild.width / 2;
        const parentCenterX = currentX + node.width / 2;
        const isChildRight = childCenterX > parentCenterX;
        const sX = isChildRight ? currentX + node.width : currentX;
        const sY = currentYCenter;
        const eX = isChildRight ? eaChild.x : eaChild.x + eaChild.width;
        const eY = eaChild.y + eaChild.height / 2;
        runtimeContext.configureArrow({
          arrowId: arrow.id,
          isChildRight,
          startId: node.id,
          endId: child.id,
          coordinates: {
            sX,
            sY,
            eX,
            eY,
          },
        });
      }
    });
    if (node.customData?.boundaryId) {
      runtimeContext.updateNodeBoundary(node, runtimeContext.ea.getElements(), rootId);
    }
  };
  return { layoutChildrenAsAdditionalRoot, layoutSubtree };
}
