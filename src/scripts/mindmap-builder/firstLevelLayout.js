/**
 * @file firstLevelLayout.js
 * @overview Radial and directional placement of first-level branches.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createFirstLevelLayout(runtimeContext) {
  const radialL1Distribution = (
    nodes,
    context,
    l1Metrics,
    totalSubtreeHeight,
    options,
    mustHonorMindmapOrder = false,
  ) => {
    const {
      allElements,
      rootBox,
      rootCenter,
      hasGlobalFolds,
      childrenByParent,
      heightCache,
      elementById,
      rootId,
      parentMap,
    } = context;
    const count = nodes.length;
    // --- CONFIGURATION FROM SETTINGS ---
    const START_ANGLE = runtimeContext.layoutSettings.RADIAL_START_ANGLE;
    // MODIFIED: Use options.fillSweep to force full sweep usage
    const MAX_SWEEP_DEG = options.fillSweep
      ? runtimeContext.layoutSettings.RADIAL_MAX_SWEEP
      : Math.min(
          (runtimeContext.layoutSettings.RADIAL_MAX_SWEEP / 8) * count,
          runtimeContext.layoutSettings.RADIAL_MAX_SWEEP,
        );
    const ASPECT_RATIO = runtimeContext.layoutSettings.RADIAL_ASPECT_RATIO;
    const POLE_GAP_BONUS = runtimeContext.layoutSettings.RADIAL_POLE_GAP_BONUS;
    const BASE_GAP = runtimeContext.layoutSettings.GAP_Y * 2;
    // 1. Determine Minimum Radius Baseline based on root node size
    // This avoids the previous hardcoded 1000px test radius which forced nodes too far out
    const minRadiusY = Math.max(
      Math.round(
        Math.max(rootBox.height, rootBox.width) *
          runtimeContext.layoutSettings.ROOT_RADIUS_FACTOR *
          1.5,
      ),
      runtimeContext.layoutSettings.MIN_RADIUS,
    );
    const minRadiusX = minRadiusY * ASPECT_RATIO;
    // 2. Simulation Pass: Calculate angular space needed at Minimum Radius
    let simAngle = START_ANGLE;
    let totalRequiredSpan = 0;
    // Temporary storage for node angular data calculated at minRadius
    const nodeSimData = nodes.map((node, i) => {
      const rad = simAngle * (Math.PI / 180);
      // Local Radius at this angle for ellipse
      const localR =
        (minRadiusX * minRadiusY) /
        Math.sqrt(
          Math.pow(minRadiusY * Math.cos(rad), 2) + Math.pow(minRadiusX * Math.sin(rad), 2),
        );
      const sinComp = Math.abs(Math.sin(rad));
      const cosComp = Math.abs(Math.cos(rad));
      // Projected size of node at this angle
      const effSize = node.width * sinComp + l1Metrics[i] * cosComp;
      // Angular span of the node (degrees)
      const nodeSpan = (effSize / localR) * (180 / Math.PI);
      // Dynamic Gap: Increases at Poles
      const isLast = i === count - 1;
      const dynamicGapPx = isLast ? 0 : BASE_GAP * (1 + sinComp * POLE_GAP_BONUS);
      const gapSpan = (dynamicGapPx / localR) * (180 / Math.PI);
      const totalSpan = nodeSpan + gapSpan;
      // Advance simulation angle for next node
      simAngle += totalSpan;
      totalRequiredSpan += totalSpan;
      return {
        node,
        nodeSpan,
        gapSpan,
      };
    });
    // 3. Determine Layout Strategy: Expand Radius OR Expand Angles
    let finalRadiusY = minRadiusY;
    let angleExpansionFactor = 1.0;
    if (totalRequiredSpan > MAX_SWEEP_DEG) {
      // Case A: Dense Map. Nodes don't fit in MAX_SWEEP at minRadius.
      // Increase Radius to accommodate nodes within MAX_SWEEP.
      // Logic: ArcLength = R * Theta. To reduce Theta sum to MAX_SWEEP, increase R proportionally.
      const radiusScale = totalRequiredSpan / MAX_SWEEP_DEG;
      finalRadiusY = minRadiusY * radiusScale;
      // Angles shrink proportionally to radius increase to maintain non-overlapping geometry
      angleExpansionFactor = 1 / radiusScale;
    } else {
      // Case B: Sparse Map (e.g. < 8 nodes). Nodes fit easily.
      // Keep Radius at Minimum to keep nodes close to root.
      // Increase angular spacing to fill the MAX_SWEEP.
      angleExpansionFactor = MAX_SWEEP_DEG / totalRequiredSpan;
    }
    const finalRadiusX = finalRadiusY * ASPECT_RATIO;
    // --- FINAL PLACEMENT ---
    let currentAngle = START_ANGLE;
    nodes.forEach((node, i) => {
      const isPinned = node.customData?.isPinned === true;
      const hasBoundary = !!node.customData?.boundaryId;
      const data = nodeSimData[i];
      // Apply the expansion/compression factor to spans
      const realNodeSpan = data.nodeSpan * angleExpansionFactor;
      const realGapSpan = data.gapSpan * angleExpansionFactor;
      // Center node in its slice
      const placementAngle = currentAngle + realNodeSpan / 2;
      const normAngle = ((placementAngle % 360) + 360) % 360;
      // Determine side for subtree layout direction
      const dynamicSide = normAngle > 90 && normAngle < 270 ? -1 : 1;
      // Recalculate exact Cartesian coordinates at final radius
      const rad = placementAngle * (Math.PI / 180);
      const finalLocalR =
        (finalRadiusX * finalRadiusY) /
        Math.sqrt(
          Math.pow(finalRadiusY * Math.cos(rad), 2) + Math.pow(finalRadiusX * Math.sin(rad), 2),
        );
      const placeR = hasBoundary ? finalLocalR * 1.0 : finalLocalR;
      const tCX = rootCenter.x + placeR * Math.cos(rad);
      const tCY = rootCenter.y + placeR * Math.sin(rad);
      if (isPinned) {
        runtimeContext.layoutSubtree(
          node.id,
          node.x,
          node.y + node.height / 2,
          dynamicSide,
          allElements,
          hasGlobalFolds,
          childrenByParent,
          heightCache,
          elementById,
          mustHonorMindmapOrder,
          rootId,
          parentMap,
        );
      } else {
        runtimeContext.layoutSubtree(
          node.id,
          tCX,
          tCY,
          dynamicSide,
          allElements,
          hasGlobalFolds,
          childrenByParent,
          heightCache,
          elementById,
          mustHonorMindmapOrder,
          rootId,
          parentMap,
        );
      }
      // Advance
      currentAngle += realNodeSpan + realGapSpan;
      if (node.customData?.mindmapNew) {
        runtimeContext.ea.addAppendUpdateCustomData(node.id, {
          mindmapNew: undefined,
        });
      }
      runtimeContext.updateL1Arrow(node, context);
      if (runtimeContext.groupBranches) runtimeContext.applyRecursiveGrouping(node.id, allElements);
    });
  };

  const verticalL1Distribution = (
    nodes,
    context,
    l1Metrics,
    totalSubtreeHeight,
    isLeftSide,
    centerAngle,
    gapMultiplier,
    mustHonorMindmapOrder = false,
  ) => {
    const {
      allElements,
      rootBox,
      rootCenter,
      hasGlobalFolds,
      childrenByParent,
      heightCache,
      elementById,
      rootId,
      parentMap,
    } = context;
    const count = nodes.length;
    // --- VERTICAL DIRECTIONAL LAYOUT (RIGHT/LEFT) ---
    const totalContentHeight =
      totalSubtreeHeight + (count - 1) * runtimeContext.layoutSettings.GAP_Y;
    const radiusFromHeight =
      totalContentHeight / runtimeContext.layoutSettings.DIRECTIONAL_ARC_SPAN_RADIANS;
    const radiusY =
      Math.max(
        Math.round(rootBox.height * runtimeContext.layoutSettings.ROOT_RADIUS_FACTOR),
        runtimeContext.layoutSettings.MIN_RADIUS,
        radiusFromHeight,
      ) +
      count * runtimeContext.layoutSettings.RADIUS_PADDING_PER_NODE;
    const crossAxisRatio =
      runtimeContext.layoutSettings.DIRECTIONAL_CROSS_AXIS_RATIO ??
      runtimeContext.LAYOUT_METADATA.DIRECTIONAL_CROSS_AXIS_RATIO.def;
    const radiusX =
      Math.max(
        Math.round(rootBox.width * runtimeContext.layoutSettings.ROOT_RADIUS_FACTOR),
        runtimeContext.layoutSettings.MIN_RADIUS,
        radiusY * crossAxisRatio,
      ) +
      count * runtimeContext.layoutSettings.RADIUS_PADDING_PER_NODE;
    const totalThetaDeg = (totalContentHeight / radiusY) * (180 / Math.PI);
    let currentAngle = isLeftSide
      ? centerAngle + totalThetaDeg / 2
      : centerAngle - totalThetaDeg / 2;
    nodes.forEach((node, i) => {
      const nodeHeight = l1Metrics[i];
      const isPinned = node.customData?.isPinned === true;
      const side = isLeftSide ? -1 : 1;
      const getAngularInfo = (targetNode, height) => {
        const angleRad = Math.atan2(
          targetNode.y + targetNode.height / 2 - rootCenter.y,
          targetNode.x + targetNode.width / 2 - rootCenter.x,
        );
        const angleDeg = angleRad * (180 / Math.PI) + 90;
        const normAngle = angleDeg < 0 ? angleDeg + 360 : angleDeg;
        const spanDeg = (height / radiusY) * (180 / Math.PI);
        return {
          center: normAngle,
          span: spanDeg,
          start: normAngle - spanDeg / 2,
          end: normAngle + spanDeg / 2,
        };
      };
      const effectiveGap = runtimeContext.layoutSettings.GAP_Y * gapMultiplier;
      const gapSpanDeg = (effectiveGap / radiusY) * (180 / Math.PI);
      const nodeSpanDeg = (nodeHeight / radiusY) * (180 / Math.PI);
      if (isPinned) {
        runtimeContext.layoutSubtree(
          node.id,
          node.x,
          node.y + node.height / 2,
          side,
          allElements,
          hasGlobalFolds,
          childrenByParent,
          heightCache,
          elementById,
          mustHonorMindmapOrder,
          rootId,
          parentMap,
        );
        const info = getAngularInfo(node, nodeHeight);
        if (isLeftSide) {
          if (currentAngle > info.start - gapSpanDeg) currentAngle = info.start - gapSpanDeg;
        } else {
          if (currentAngle < info.end + gapSpanDeg) currentAngle = info.end + gapSpanDeg;
        }
      } else {
        const nextPinned = nodes.slice(i + 1).find((n) => n.customData?.isPinned);
        if (nextPinned) {
          const nextInfo = getAngularInfo(
            nextPinned,
            runtimeContext.getSubtreeHeight(
              nextPinned.id,
              allElements,
              childrenByParent,
              heightCache,
              elementById,
            ),
          );
          if (isLeftSide) {
            if (currentAngle - nodeSpanDeg < nextInfo.end + gapSpanDeg)
              currentAngle = nextInfo.start - gapSpanDeg;
          } else {
            if (currentAngle + nodeSpanDeg > nextInfo.start - gapSpanDeg)
              currentAngle = nextInfo.end + gapSpanDeg;
          }
        }
        let angleDeg = isLeftSide ? currentAngle - nodeSpanDeg / 2 : currentAngle + nodeSpanDeg / 2;
        currentAngle = isLeftSide
          ? currentAngle - (nodeSpanDeg + gapSpanDeg)
          : currentAngle + (nodeSpanDeg + gapSpanDeg);
        const angleRad = (angleDeg - 90) * (Math.PI / 180);
        const tCX = rootCenter.x + radiusX * Math.cos(angleRad);
        const tCY = rootCenter.y + radiusY * Math.sin(angleRad);
        runtimeContext.layoutSubtree(
          node.id,
          tCX,
          tCY,
          side,
          allElements,
          hasGlobalFolds,
          childrenByParent,
          heightCache,
          elementById,
          mustHonorMindmapOrder,
          rootId,
          parentMap,
        );
      }
      if (node.customData?.mindmapNew) {
        runtimeContext.ea.addAppendUpdateCustomData(node.id, {
          mindmapNew: undefined,
        });
      }
      runtimeContext.updateL1Arrow(node, context);
      if (runtimeContext.groupBranches) runtimeContext.applyRecursiveGrouping(node.id, allElements);
    });
  };

  const horizontalL1Distribution = (
    nodes,
    context,
    l1Metrics,
    totalSubtreeWidth,
    isTopSide,
    centerAngle,
    gapMultiplier,
    mustHonorMindmapOrder = false,
  ) => {
    const {
      allElements,
      rootBox,
      rootCenter,
      hasGlobalFolds,
      childrenByParent,
      widthCache,
      elementById,
      rootId,
      parentMap,
    } = context;
    const count = nodes.length;
    // --- HORIZONTAL DIRECTIONAL LAYOUT (UP/DOWN) ---
    const compressDirectionalWidth = (node, rawWidth) => {
      const nodeWidth = Math.max(node?.width ?? 0, 1);
      if (rawWidth <= nodeWidth) return rawWidth;
      const extra = rawWidth - nodeWidth;
      const softCapThreshold =
        runtimeContext.layoutSettings.HORIZONTAL_L1_SOFTCAP_THRESHOLD ??
        runtimeContext.LAYOUT_METADATA.HORIZONTAL_L1_SOFTCAP_THRESHOLD.def;
      if (extra <= softCapThreshold) return rawWidth;
      // Preserve small/medium maps, compress only very large subtree footprints.
      const remaining = extra - softCapThreshold;
      const compressionMinScale =
        runtimeContext.layoutSettings.HORIZONTAL_L1_COMPRESSION_MIN_SCALE ??
        runtimeContext.LAYOUT_METADATA.HORIZONTAL_L1_COMPRESSION_MIN_SCALE.def;
      const compressionScale = Math.max(
        compressionMinScale,
        (runtimeContext.layoutSettings.GAP_X ?? runtimeContext.LAYOUT_METADATA.GAP_X.def) * 2,
      );
      // log1p keeps growth monotonic while guaranteeing compressedRemaining <= remaining.
      const compressedRemaining = compressionScale * Math.log1p(remaining / compressionScale);
      return nodeWidth + softCapThreshold + compressedRemaining;
    };
    const effectiveWidths = nodes.map((node, i) => compressDirectionalWidth(node, l1Metrics[i]));
    const effectiveWidthById = new Map(nodes.map((node, i) => [node.id, effectiveWidths[i]]));
    const totalEffectiveWidth = effectiveWidths.reduce((sum, width) => sum + width, 0);
    const effectiveGap = runtimeContext.layoutSettings.GAP_Y * gapMultiplier;
    const totalContentWidth = totalEffectiveWidth + (count - 1) * effectiveGap;
    const baseArcSpan = runtimeContext.layoutSettings.DIRECTIONAL_ARC_SPAN_RADIANS;
    const baselineRadius =
      Math.max(
        Math.round(rootBox.width * runtimeContext.layoutSettings.ROOT_RADIUS_FACTOR),
        runtimeContext.layoutSettings.MIN_RADIUS,
      ) +
      count * runtimeContext.layoutSettings.RADIUS_PADDING_PER_NODE;
    const pressure = totalContentWidth / Math.max(1, baselineRadius * baseArcSpan);
    const adaptiveArcSpan = Math.min(
      Math.PI,
      Math.max(baseArcSpan, baseArcSpan * Math.sqrt(Math.max(1, pressure))),
    );
    const radiusFromWidth = totalContentWidth / adaptiveArcSpan;
    // Notice axis swaps: Radius Y calculates based on Width
    const radiusX =
      Math.max(
        Math.round(rootBox.width * runtimeContext.layoutSettings.ROOT_RADIUS_FACTOR),
        runtimeContext.layoutSettings.MIN_RADIUS,
        radiusFromWidth,
      ) +
      count * runtimeContext.layoutSettings.RADIUS_PADDING_PER_NODE;
    const crossAxisRatio =
      runtimeContext.layoutSettings.DIRECTIONAL_CROSS_AXIS_RATIO ??
      runtimeContext.LAYOUT_METADATA.DIRECTIONAL_CROSS_AXIS_RATIO.def;
    const radiusY =
      Math.max(
        Math.round(rootBox.height * runtimeContext.layoutSettings.ROOT_RADIUS_FACTOR),
        runtimeContext.layoutSettings.MIN_RADIUS,
        radiusX * crossAxisRatio,
      ) +
      count * runtimeContext.layoutSettings.RADIUS_PADDING_PER_NODE;
    const totalThetaDeg = (totalContentWidth / radiusX) * (180 / Math.PI);
    // Reversing the angle spread depending on side to maintain visual reading flow
    let currentAngle = isTopSide
      ? centerAngle - totalThetaDeg / 2
      : centerAngle + totalThetaDeg / 2;
    nodes.forEach((node, i) => {
      const nodeWidth = effectiveWidths[i];
      const isPinned = node.customData?.isPinned === true;
      const side = isTopSide ? -1 : 1;
      const getAngularInfo = (targetNode, width) => {
        const angleRad = Math.atan2(
          targetNode.y + targetNode.height / 2 - rootCenter.y,
          targetNode.x + targetNode.width / 2 - rootCenter.x,
        );
        const angleDeg = angleRad * (180 / Math.PI);
        const normAngle = angleDeg < 0 ? angleDeg + 360 : angleDeg;
        const spanDeg = (width / radiusX) * (180 / Math.PI);
        return {
          center: normAngle,
          span: spanDeg,
          start: normAngle - spanDeg / 2,
          end: normAngle + spanDeg / 2,
        };
      };
      const gapSpanDeg = (effectiveGap / radiusX) * (180 / Math.PI);
      const nodeSpanDeg = (nodeWidth / radiusX) * (180 / Math.PI);
      if (isPinned) {
        runtimeContext.layoutSubtreeVertical(
          node.id,
          node.x + node.width / 2,
          node.y,
          side,
          allElements,
          hasGlobalFolds,
          childrenByParent,
          widthCache,
          elementById,
          mustHonorMindmapOrder,
          rootId,
          parentMap,
        );
        const info = getAngularInfo(node, nodeWidth);
        if (isTopSide) {
          if (currentAngle < info.start - gapSpanDeg) currentAngle = info.start - gapSpanDeg;
        } else {
          if (currentAngle > info.end + gapSpanDeg) currentAngle = info.end + gapSpanDeg;
        }
      } else {
        const nextPinned = nodes.slice(i + 1).find((n) => n.customData?.isPinned);
        if (nextPinned) {
          const nextPinnedWidth =
            effectiveWidthById.get(nextPinned.id) ??
            compressDirectionalWidth(
              nextPinned,
              runtimeContext.getSubtreeWidth(
                nextPinned.id,
                allElements,
                childrenByParent,
                widthCache,
                elementById,
              ),
            );
          const nextInfo = getAngularInfo(nextPinned, nextPinnedWidth);
          if (isTopSide) {
            if (currentAngle + nodeSpanDeg > nextInfo.start - gapSpanDeg)
              currentAngle = nextInfo.start - gapSpanDeg - nodeSpanDeg;
          } else {
            if (currentAngle - nodeSpanDeg < nextInfo.end + gapSpanDeg)
              currentAngle = nextInfo.end + gapSpanDeg + nodeSpanDeg;
          }
        }
        let angleDeg = isTopSide ? currentAngle + nodeSpanDeg / 2 : currentAngle - nodeSpanDeg / 2;
        currentAngle = isTopSide
          ? currentAngle + (nodeSpanDeg + gapSpanDeg)
          : currentAngle - (nodeSpanDeg + gapSpanDeg);
        const angleRad = angleDeg * (Math.PI / 180);
        const tCX = rootCenter.x + radiusX * Math.cos(angleRad);
        const tCY = rootCenter.y + radiusY * Math.sin(angleRad);
        runtimeContext.layoutSubtreeVertical(
          node.id,
          tCX,
          tCY,
          side,
          allElements,
          hasGlobalFolds,
          childrenByParent,
          widthCache,
          elementById,
          mustHonorMindmapOrder,
          rootId,
          parentMap,
        );
      }
      if (node.customData?.mindmapNew) {
        runtimeContext.ea.addAppendUpdateCustomData(node.id, {
          mindmapNew: undefined,
        });
      }
      runtimeContext.updateL1Arrow(node, context, "vertical");
      if (runtimeContext.groupBranches) runtimeContext.applyRecursiveGrouping(node.id, allElements);
    });
  };

  /**
   * Unified layout function for Level 1 nodes.
   * Uses a Vertical Ellipse for Radial mode. Ensures nodes are distributed across
   * the ellipse to prevent wrap-around overlap and maintain correct facing.
   * Returns true if layout logic was executed.
   */
  const layoutL1Nodes = (nodes, options, context, mustHonorMindmapOrder = false) => {
    if (nodes.length === 0) return false;
    const { allElements, childrenByParent, heightCache, widthCache, elementById } = context;
    const { sortMethod, centerAngle, gapMultiplier } = options;
    // SORTING: Respect the established mindmapOrder (0..N)
    nodes.sort((a, b) => runtimeContext.getMindmapOrder(a) - runtimeContext.getMindmapOrder(b));
    if (sortMethod === "radial") {
      const l1Metrics = nodes.map((node) =>
        runtimeContext.getSubtreeHeight(
          node.id,
          allElements,
          childrenByParent,
          heightCache,
          elementById,
        ),
      );
      const totalSubtreeHeight = l1Metrics.reduce((sum, h) => sum + h, 0);
      radialL1Distribution(
        nodes,
        context,
        l1Metrics,
        totalSubtreeHeight,
        options,
        mustHonorMindmapOrder,
      );
    } else if (sortMethod === "horizontal") {
      const l1Metrics = nodes.map((node) =>
        runtimeContext.getSubtreeWidth(
          node.id,
          allElements,
          childrenByParent,
          widthCache,
          elementById,
        ),
      );
      const totalSubtreeWidth = l1Metrics.reduce((sum, w) => sum + w, 0);
      // 270 degrees represents the Top (Up-facing), 90 degrees represents the Bottom (Down-facing)
      const isTopSide = Math.abs((centerAngle ?? 0) - 270) < 1;
      horizontalL1Distribution(
        nodes,
        context,
        l1Metrics,
        totalSubtreeWidth,
        isTopSide,
        centerAngle,
        gapMultiplier,
        mustHonorMindmapOrder,
      );
    } else {
      const l1Metrics = nodes.map((node) =>
        runtimeContext.getSubtreeHeight(
          node.id,
          allElements,
          childrenByParent,
          heightCache,
          elementById,
        ),
      );
      const totalSubtreeHeight = l1Metrics.reduce((sum, h) => sum + h, 0);
      const isLeftSide = sortMethod === "vertical" && Math.abs((centerAngle ?? 0) - 270) < 1;
      verticalL1Distribution(
        nodes,
        context,
        l1Metrics,
        totalSubtreeHeight,
        isLeftSide,
        centerAngle,
        gapMultiplier,
        mustHonorMindmapOrder,
      );
    }
    return true;
  };

  /**
   * Sorts Level 1 nodes based on their current visual position and updates their mindmapOrder.
   * For Radial maps, sorting is done by angle. For others, by Y-coordinate.
   * Newly added nodes (mindmapNew) are always appended to the end of the visual sequence.
   * Returns true if any order was actually updated.
   **/
  const sortL1NodesBasedOnVisualSequence = (l1Nodes, mode, rootCenter) => {
    if (l1Nodes.length === 0) return false;
    let orderChanged = false;
    const isVerticalMode = ["Up-facing", "Down-facing", "Up-Down"].includes(mode);
    /**
     * Helper to sort by Reading Order: Right-side Top-to-Bottom, then Left-side Top-to-Bottom.
     * This serves as our canonical sequence for all directional modes and mode-switching.
     */
    const sortByReadingOrder = (a, b) => {
      const aCX = a.x + a.width / 2;
      const bCX = b.x + b.width / 2;
      const aCY = a.y + a.height / 2;
      const bCY = b.y + b.height / 2;
      if (isVerticalMode) {
        // Vertical modes: Sort bottom-side (Left->Right) then top-side (Left->Right)
        const aIsBottom = aCY > rootCenter.y;
        const bIsBottom = bCY > rootCenter.y;
        if (aIsBottom !== bIsBottom) return aIsBottom ? -1 : 1;
        return aCX - bCX;
      } else {
        // Horizontal modes: Sort right-side (Top->Bottom) then left-side (Top->Bottom)
        const aIsR = aCX > rootCenter.x;
        const bIsR = bCX > rootCenter.x;
        if (aIsR !== bIsR) return aIsR ? -1 : 1;
        return a.y - b.y;
      }
    };
    /** Helper to sort by Angle: Clockwise around the root center. */
    const sortByAngle = (a, b) => {
      return (
        runtimeContext.getAngleFromCenter(rootCenter, {
          x: a.x + a.width / 2,
          y: a.y + a.height / 2,
        }) -
        runtimeContext.getAngleFromCenter(rootCenter, {
          x: b.x + b.width / 2,
          y: b.y + b.height / 2,
        })
      );
    };
    const sortFn = mode === "Radial" ? sortByAngle : sortByReadingOrder;
    const existingNodes = l1Nodes.filter((n) => !n.customData?.mindmapNew);
    const newNodes = l1Nodes.filter((n) => n.customData?.mindmapNew);
    existingNodes.sort(sortFn);
    // Freeze logic mindmapOrder based on final sort
    existingNodes.forEach((node, i) => {
      if (node.customData?.mindmapOrder !== i) {
        runtimeContext.ea.addAppendUpdateCustomData(node.id, {
          mindmapOrder: i,
        });
        orderChanged = true;
      }
    });
    // New nodes always need an update since they lack established order or have a temp one
    newNodes.forEach((node, i) => {
      const newOrder = existingNodes.length + i;
      runtimeContext.ea.addAppendUpdateCustomData(node.id, {
        mindmapOrder: newOrder,
      });
      orderChanged = true;
    });
    return orderChanged;
  };
  return {
    radialL1Distribution,
    verticalL1Distribution,
    horizontalL1Distribution,
    layoutL1Nodes,
    sortL1NodesBasedOnVisualSequence,
  };
}
