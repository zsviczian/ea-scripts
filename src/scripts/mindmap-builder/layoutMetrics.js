/**
 * @file layoutMetrics.js
 * @overview Fold-aware subtree dimensions and stable node ordering.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createLayoutMetrics(runtimeContext) {
  const getMindmapOrder = (node) => {
    const o = node?.customData?.mindmapOrder;
    return typeof o === "number" && Number.isFinite(o) ? o : 0;
  };

  const getNodeBox = (node, allElements) => {
    if (node.groupIds && node.groupIds.length > 0) {
      const groupElements = runtimeContext.ea.getElementsInTheSameGroupWithElement(
        node,
        allElements,
      );
      if (groupElements.length > 1) {
        const box = ExcalidrawLib.getCommonBoundingBox(groupElements);
        return {
          ...box,
          elements: groupElements,
          isGroup: true,
        };
      }
    }
    return {
      minX: node.x,
      minY: node.y,
      width: node.width,
      height: node.height,
      elements: [node],
      isGroup: false,
    };
  };

  const sortChildrenStable = (children, allElements) => {
    children.sort((a, b) => {
      const ao = getMindmapOrder(a),
        bo = getMindmapOrder(b);
      if (ao !== bo) return ao - bo;
      // Fallback sort by Y position (visual order)
      const ya = allElements ? getNodeBox(a, allElements).minY : a.y;
      const yb = allElements ? getNodeBox(b, allElements).minY : b.y;
      const dy = ya - yb;
      if (dy !== 0) return dy;
      return String(a.id).localeCompare(String(b.id));
    });
  };

  const getSubtreeHeight = (nodeId, allElements, childrenByParent, heightCache, elementById) => {
    if (heightCache?.has(nodeId)) return heightCache.get(nodeId);
    const node = elementById?.get(nodeId) ?? allElements.find((el) => el.id === nodeId);
    if (!node) return 0;
    if (node.customData?.isFolded) {
      const foldedHeight = node.height;
      if (heightCache) heightCache.set(nodeId, foldedHeight);
      return foldedHeight;
    }
    // Bypass calculation and use the true visual bounding box for manual submaps
    if (node.customData?.isAdditionalRoot && node.customData?.autoLayoutDisabled) {
      const branchIds = runtimeContext.getBranchElementIds(nodeId, allElements);
      const branchElements = allElements.filter(
        (el) => branchIds.includes(el.id) && el.opacity > 0 && !el.isDeleted,
      );
      const bbox = runtimeContext.ea.getBoundingBox(branchElements);
      const height = bbox.height;
      if (heightCache) heightCache.set(nodeId, height);
      return height;
    }
    const children =
      childrenByParent?.get(nodeId) ?? runtimeContext.getChildrenNodes(nodeId, allElements);
    const unpinnedChildren = children.filter((child) => !child.customData?.isPinned);
    let totalHeight = 0;
    if (unpinnedChildren.length === 0) {
      totalHeight = node.height;
    } else {
      let childrenHeight = 0;
      unpinnedChildren.forEach((child, index) => {
        childrenHeight += getSubtreeHeight(
          child.id,
          allElements,
          childrenByParent,
          heightCache,
          elementById,
        );
        if (index < unpinnedChildren.length - 1) {
          const childNode =
            elementById?.get(child.id) ?? allElements.find((el) => el.id === child.id);
          // Check if child behaves as a leaf (ignoring pinned descendants)
          const grandChildren =
            childrenByParent?.get(child.id) ??
            runtimeContext.getChildrenNodes(child.id, allElements);
          const hasUnpinnedGrandChildren = grandChildren.some((gc) => !gc.customData?.isPinned);
          const fontSize = childNode.fontSize ?? 20;
          const gap = !hasUnpinnedGrandChildren
            ? Math.round(fontSize * runtimeContext.layoutSettings.GAP_MULTIPLIER)
            : runtimeContext.layoutSettings.GAP_Y;
          childrenHeight += gap;
        }
      });
      totalHeight = Math.max(node.height, childrenHeight);
    }
    // Feature: Boundary Spacing
    // If the node has a visual boundary, add padding to the total subtree height
    // The boundary adds 15px padding on all sides (see updateNodeBoundary), so we add 2*15=30px
    if (node.customData?.boundaryId) {
      totalHeight += 30;
    }
    if (heightCache) heightCache.set(nodeId, totalHeight);
    return totalHeight;
  };

  const getSubtreeWidth = (nodeId, allElements, childrenByParent, widthCache, elementById) => {
    if (widthCache?.has(nodeId)) return widthCache.get(nodeId);
    const node = elementById?.get(nodeId) ?? allElements.find((el) => el.id === nodeId);
    if (!node) return 0;
    if (node.customData?.isFolded) {
      const foldedWidth = node.width;
      if (widthCache) widthCache.set(nodeId, foldedWidth);
      return foldedWidth;
    }
    const children =
      childrenByParent?.get(nodeId) ?? runtimeContext.getChildrenNodes(nodeId, allElements);
    const unpinnedChildren = children.filter((child) => !child.customData?.isPinned);
    let totalWidth = 0;
    if (unpinnedChildren.length === 0) {
      totalWidth = node.width;
    } else {
      let childrenWidth = 0;
      unpinnedChildren.forEach((child, index) => {
        childrenWidth += getSubtreeWidth(
          child.id,
          allElements,
          childrenByParent,
          widthCache,
          elementById,
        );
        if (index < unpinnedChildren.length - 1) {
          const childNode =
            elementById?.get(child.id) ?? allElements.find((el) => el.id === child.id);
          // Check if child behaves as a leaf (ignoring pinned descendants)
          const grandChildren =
            childrenByParent?.get(child.id) ??
            runtimeContext.getChildrenNodes(child.id, allElements);
          const hasUnpinnedGrandChildren = grandChildren.some((gc) => !gc.customData?.isPinned);
          const fontSize = childNode.fontSize ?? 20;
          // For vertical layouts, we reuse GAP_Y as the horizontal sibling gap to maintain proportion
          const gap = !hasUnpinnedGrandChildren
            ? Math.round(fontSize * runtimeContext.layoutSettings.GAP_MULTIPLIER)
            : runtimeContext.layoutSettings.GAP_Y;
          childrenWidth += gap;
        }
      });
      totalWidth = Math.max(node.width, childrenWidth);
    }
    // Feature: Boundary Spacing
    // If the node has a visual boundary, add padding to the total subtree height
    // The boundary adds 15px padding on all sides (see updateNodeBoundary), so we add 2*15=30px
    if (node.customData?.boundaryId) {
      totalWidth += 30;
    }
    if (widthCache) widthCache.set(nodeId, totalWidth);
    return totalWidth;
  };

  const getVerticalPlacementWidth = (
    nodeId,
    allElements,
    childrenByParent,
    widthCache,
    elementById,
    placementWidthCache = null,
  ) => {
    if (placementWidthCache?.has(nodeId)) return placementWidthCache.get(nodeId);
    const node = elementById?.get(nodeId) ?? allElements.find((el) => el.id === nodeId);
    if (!node) return 0;
    const baseWidth = getSubtreeWidth(
      nodeId,
      allElements,
      childrenByParent,
      widthCache,
      elementById,
    );
    // Short-circuit if this is a manual submap
    if (
      node.customData?.isAdditionalRoot !== true ||
      node.customData?.autoLayoutDisabled === true
    ) {
      if (placementWidthCache) placementWidthCache.set(nodeId, baseWidth);
      return baseWidth;
    }
    const mode = node.customData?.growthMode;
    if (!["Right-facing", "Left-facing", "Right-Left"].includes(mode)) {
      if (placementWidthCache) placementWidthCache.set(nodeId, baseWidth);
      return baseWidth;
    }
    const children =
      childrenByParent?.get(nodeId) ?? runtimeContext.getChildrenNodes(nodeId, allElements);
    const unpinnedChildren = children.filter((child) => !child.customData?.isPinned);
    if (unpinnedChildren.length === 0) {
      if (placementWidthCache) placementWidthCache.set(nodeId, baseWidth);
      return baseWidth;
    }
    const childWidths = unpinnedChildren.map((child) =>
      getVerticalPlacementWidth(
        child.id,
        allElements,
        childrenByParent,
        widthCache,
        elementById,
        placementWidthCache,
      ),
    );
    const primaryGap = runtimeContext.layoutSettings.GAP_X;
    const compactMinWidth = node.width + runtimeContext.layoutSettings.GAP_Y * 2;
    let projectedWidth;
    if (mode === "Right-facing" || mode === "Left-facing") {
      const maxChildWidth = childWidths.reduce((max, width) => Math.max(max, width), 0);
      const directionalRawWidth = Math.max(node.width, node.width + primaryGap + maxChildWidth);
      // Single-sided directional submaps mostly expand away from siblings.
      // Compress their reserved slot width to avoid over-spacing in vertical parent layout.
      const singleSideBlend =
        runtimeContext.layoutSettings.VERTICAL_SUBTREE_WIDTH_BLEND_SINGLE ??
        runtimeContext.LAYOUT_METADATA.VERTICAL_SUBTREE_WIDTH_BLEND_SINGLE.def;
      projectedWidth = Math.max(
        compactMinWidth,
        node.width + (directionalRawWidth - node.width) * singleSideBlend,
      );
    } else {
      const nodeCenterX = node.x + node.width / 2;
      let leftMax = 0;
      let rightMax = 0;
      unpinnedChildren.forEach((child, index) => {
        const childCenterX = child.x + child.width / 2;
        if (childCenterX < nodeCenterX) {
          leftMax = Math.max(leftMax, childWidths[index]);
        } else {
          rightMax = Math.max(rightMax, childWidths[index]);
        }
      });
      const directionalRawWidth =
        node.width +
        (leftMax > 0 ? primaryGap + leftMax : 0) +
        (rightMax > 0 ? primaryGap + rightMax : 0);
      // Dual-sided maps need more reserved width than single-sided ones, but still less than full bbox width.
      const dualSideBlend =
        runtimeContext.layoutSettings.VERTICAL_SUBTREE_WIDTH_BLEND_DUAL ??
        runtimeContext.LAYOUT_METADATA.VERTICAL_SUBTREE_WIDTH_BLEND_DUAL.def;
      projectedWidth = Math.max(
        compactMinWidth,
        node.width + (Math.max(node.width, directionalRawWidth) - node.width) * dualSideBlend,
      );
    }
    if (node.customData?.boundaryId) {
      projectedWidth += 30;
    }
    const effectiveWidth = Math.min(baseWidth, projectedWidth);
    // Smooth width growth so adding the 2nd/3rd child does not suddenly blow up sibling spacing.
    const widthExtra = Math.max(0, effectiveWidth - node.width);
    const smoothThresholdMultiplier =
      runtimeContext.layoutSettings.VERTICAL_SUBTREE_SMOOTH_THRESHOLD_MULTIPLIER ??
      runtimeContext.LAYOUT_METADATA.VERTICAL_SUBTREE_SMOOTH_THRESHOLD_MULTIPLIER.def;
    const softThreshold = Math.max(
      runtimeContext.layoutSettings.GAP_X,
      runtimeContext.layoutSettings.GAP_Y * smoothThresholdMultiplier,
    );
    let smoothedWidth = effectiveWidth;
    if (widthExtra > softThreshold) {
      const smoothMinScale =
        runtimeContext.layoutSettings.VERTICAL_SUBTREE_SMOOTH_MIN_SCALE ??
        runtimeContext.LAYOUT_METADATA.VERTICAL_SUBTREE_SMOOTH_MIN_SCALE.def;
      const compressionScale = Math.max(smoothMinScale, runtimeContext.layoutSettings.GAP_X * 2);
      const remaining = widthExtra - softThreshold;
      const compressedRemaining = compressionScale * Math.log1p(remaining / compressionScale);
      smoothedWidth = node.width + softThreshold + compressedRemaining;
    }
    if (placementWidthCache) placementWidthCache.set(nodeId, smoothedWidth);
    return smoothedWidth;
  };
  return {
    getMindmapOrder,
    getNodeBox,
    sortChildrenStable,
    getSubtreeHeight,
    getSubtreeWidth,
    getVerticalPlacementWidth,
  };
}
