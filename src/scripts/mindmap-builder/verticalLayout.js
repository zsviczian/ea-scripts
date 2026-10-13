/**
 * @file verticalLayout.js
 * @overview Vertical subtree placement.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createVerticalLayout(runtimeContext) {
  const layoutSubtreeVertical = (
    nodeId,
    targetCenterX,
    targetY,
    side,
    allElements,
    hasGlobalFolds,
    childrenByParent,
    widthCache,
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
      const newX = targetCenterX - node.width / 2;
      const newY = side === 1 ? targetY : targetY - node.height;
      dx = newX - eaNode.x;
      dy = newY - eaNode.y;
      eaNode.x = newX;
      eaNode.y = newY;
    }
    if (node.customData?.isFolded) return;
    const currentXCenter = eaNode.x + node.width / 2;
    const currentY = eaNode.y;
    let effectiveSide = side;
    const parent = runtimeContext.getParentNode(nodeId, allElements, parentMap);
    if (parent) {
      const parentCenterY = parent.y + parent.height / 2;
      const nodeCenterY = currentY + node.height / 2;
      effectiveSide = nodeCenterY >= parentCenterY ? 1 : -1;
    }
    // Handle Fold Indicator
    if (node.customData?.foldIndicatorId) {
      const ind = runtimeContext.ea.getElement(node.customData.foldIndicatorId);
      if (ind) {
        ind.x = eaNode.x + eaNode.width / 2 - ind.width / 2;
        if (effectiveSide === 1) {
          ind.y = eaNode.y + eaNode.height + runtimeContext.layoutSettings.INDICATOR_OFFSET;
          ind.textAlign = "center";
        } else {
          ind.y = eaNode.y - runtimeContext.layoutSettings.INDICATOR_OFFSET - ind.height;
          ind.textAlign = "center";
        }
      }
    }
    const textElement = runtimeContext.ea.getBoundTextElement(eaNode).eaElement;
    if (textElement && !runtimeContext.centerText && textElement.textAlign !== "center") {
      // In vertical mode, nodes usually look best centered, but we enforce it here
      textElement.textAlign = "center";
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
        runtimeContext.layoutChildrenAsAdditionalRoot(
          nodeId,
          allElements,
          hasGlobalFolds,
          childrenByParent,
          null,
          widthCache,
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
      // If mustHonorMindmapOrder is false: Fallback to visual X-position to keep map strictly ordered by position (auto-layout).
      unpinnedChildren.sort((a, b) => {
        if (mustHonorMindmapOrder) {
          return runtimeContext.getMindmapOrder(a) - runtimeContext.getMindmapOrder(b);
        }
        const dx = a.x - b.x;
        if (dx !== 0) return dx;
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
      const placementWidthCache = new Map();
      const childWidths = unpinnedChildren.map((child) =>
        runtimeContext.getVerticalPlacementWidth(
          child.id,
          allElements,
          childrenByParent,
          widthCache,
          elementById,
          placementWidthCache,
        ),
      );
      const childrenRowWidth = childWidths.reduce((sum, width, index) => {
        const childNode =
          elementById?.get(unpinnedChildren[index].id) ??
          allElements.find((el) => el.id === unpinnedChildren[index].id);
        const grandChildren =
          childrenByParent?.get(unpinnedChildren[index].id) ??
          runtimeContext.getChildrenNodes(unpinnedChildren[index].id, allElements);
        const hasUnpinnedGrandChildren = grandChildren.some((gc) => !gc.customData?.isPinned);
        const fontSize = childNode?.fontSize ?? 20;
        const gap =
          index < unpinnedChildren.length - 1
            ? !hasUnpinnedGrandChildren
              ? Math.round(fontSize * runtimeContext.layoutSettings.GAP_MULTIPLIER)
              : runtimeContext.layoutSettings.GAP_Y
            : 0;
        return sum + width + gap;
      }, 0);
      let currentX = currentXCenter - childrenRowWidth / 2;
      // Primary layout gap used for Parent-Child spacing (vertical)
      // Keep default spacing for larger branches, but tighten compact (1-2 child) subtrees.
      const allChildrenCompact = unpinnedChildren.every((child) => {
        const grandChildren =
          childrenByParent?.get(child.id) ?? runtimeContext.getChildrenNodes(child.id, allElements);
        return !grandChildren.some((gc) => !gc.customData?.isPinned);
      });
      const compactGap = Math.max(
        runtimeContext.layoutSettings.GAP_Y,
        Math.round(
          runtimeContext.layoutSettings.GAP_X *
            (runtimeContext.layoutSettings.VERTICAL_COMPACT_PARENT_CHILD_GAP_RATIO ??
              runtimeContext.LAYOUT_METADATA.VERTICAL_COMPACT_PARENT_CHILD_GAP_RATIO.def),
        ),
      );
      const dynamicGapPrimary =
        unpinnedChildren.length <= 2 && allChildrenCompact
          ? compactGap
          : runtimeContext.layoutSettings.GAP_X;
      unpinnedChildren.forEach((child, index) => {
        const childW = childWidths[index];
        layoutSubtreeVertical(
          child.id,
          currentX + childW / 2,
          effectiveSide === 1
            ? currentY + node.height + dynamicGapPrimary
            : currentY - dynamicGapPrimary,
          effectiveSide,
          allElements,
          hasGlobalFolds,
          childrenByParent,
          widthCache,
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
        // Reusing GAP_Y for the cross-axis (sibling) gap to maintain spacing proportionality
        const gap = !hasUnpinnedGrandChildren
          ? Math.round(fontSize * runtimeContext.layoutSettings.GAP_MULTIPLIER)
          : runtimeContext.layoutSettings.GAP_Y;
        currentX += childW + gap;
      });
    }
    pinnedChildren.forEach((child) =>
      layoutSubtreeVertical(
        child.id,
        child.x + child.width / 2,
        child.y + (effectiveSide === 1 ? 0 : child.height),
        effectiveSide,
        allElements,
        hasGlobalFolds,
        childrenByParent,
        widthCache,
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
        const childCenterY = eaChild.y + eaChild.height / 2;
        const parentCenterY = currentY + node.height / 2;
        const isChildBelow = childCenterY > parentCenterY;
        const sX = currentXCenter;
        const sY = isChildBelow ? currentY + node.height : currentY;
        const eX = eaChild.x + eaChild.width / 2;
        const eY = isChildBelow ? eaChild.y : eaChild.y + eaChild.height;
        runtimeContext.configureArrow({
          arrowId: arrow.id,
          isChildBelow,
          startId: node.id,
          endId: child.id,
          coordinates: {
            sX,
            sY,
            eX,
            eY,
          },
          layoutDirection: "vertical",
        });
      }
    });
    if (node.customData?.boundaryId) {
      runtimeContext.updateNodeBoundary(node, runtimeContext.ea.getElements(), rootId);
    }
  };
  return { layoutSubtreeVertical };
}
