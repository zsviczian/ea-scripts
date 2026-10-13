/**
 * @file decorations.js
 * @overview decorations implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createDecorations(runtimeContext) {
  // ---------------------------------------------------------------------------
  // 3. Layout & Grouping Engine
  // ---------------------------------------------------------------------------
  const moveCrossLinks = (allElements, originalPositions) => {
    const crossLinkArrows = allElements.filter(
      (el) =>
        el.type === "arrow" &&
        !el.customData?.isBranch &&
        el.startBinding?.elementId &&
        el.endBinding?.elementId,
    );
    const touched = new Set();
    crossLinkArrows.forEach((arrow) => {
      const startId = arrow.startBinding.elementId;
      const endId = arrow.endBinding.elementId;
      const startNodeOld = originalPositions.get(startId);
      const endNodeOld = originalPositions.get(endId);
      const startNodeNew = runtimeContext.ea.getElement(startId);
      const endNodeNew = runtimeContext.ea.getElement(endId);
      if (startNodeOld && endNodeOld && startNodeNew && endNodeNew) {
        touched.add(arrow.id);
        const dsX = startNodeNew.x - startNodeOld.x;
        const dsY = startNodeNew.y - startNodeOld.y;
        const deX = endNodeNew.x - endNodeOld.x;
        const deY = endNodeNew.y - endNodeOld.y;
        if (dsX === 0 && dsY === 0 && deX === 0 && deY === 0) return;
        const eaArrow = runtimeContext.ea.getElement(arrow.id);
        if (!eaArrow) return;
        eaArrow.x += dsX;
        eaArrow.y += dsY;
        const diffX = deX - dsX;
        const diffY = deY - dsY;
        const len = eaArrow.points.length;
        if (len > 0) {
          eaArrow.points = eaArrow.points.map((p, i) => {
            const t = i / (len - 1);
            return [p[0] + diffX * t, p[1] + diffY * t];
          });
        }
      }
    });
    return touched;
  };

  const moveDecorations = (
    allElements,
    originalPositions,
    groupToNodes,
    rootId,
    elementById,
    parentMap,
  ) => {
    const structuralIds = new Set();
    if (rootId) {
      allElements.forEach((el) => {
        if (runtimeContext.isStructuralElement(el, allElements, rootId, elementById, parentMap)) {
          structuralIds.add(el.id);
        }
      });
    }
    const decorationsToUpdate = [];
    allElements.forEach((el) => {
      // Optimization: O(1) lookup instead of function call
      const isStructural = structuralIds.has(el.id);
      const isCrossLink =
        el.type === "arrow" &&
        !el.customData?.isBranch &&
        el.startBinding?.elementId &&
        el.endBinding?.elementId;
      const isDecoration = !isStructural && !isCrossLink && el.groupIds && el.groupIds.length > 0;
      if (isDecoration) {
        const hostNodes = new Set();
        el.groupIds.forEach((gid) => {
          const nodesInGroup = groupToNodes.get(gid);
          if (nodesInGroup) {
            nodesInGroup.forEach((node) => hostNodes.add(node));
          }
        });
        if (hostNodes.size > 0) {
          const nodesArray = Array.from(hostNodes);
          let minXOld = Infinity,
            minYOld = Infinity,
            maxXOld = -Infinity,
            maxYOld = -Infinity;
          let minXNew = Infinity,
            minYNew = Infinity,
            maxXNew = -Infinity,
            maxYNew = -Infinity;
          let validHost = false;
          nodesArray.forEach((n) => {
            const oldPos = originalPositions.get(n.id);
            const newEl = runtimeContext.ea.getElement(n.id);
            if (oldPos && newEl) {
              validHost = true;
              minXOld = Math.min(minXOld, oldPos.x);
              minYOld = Math.min(minYOld, oldPos.y);
              maxXOld = Math.max(maxXOld, oldPos.x + n.width);
              maxYOld = Math.max(maxYOld, oldPos.y + n.height);
              minXNew = Math.min(minXNew, newEl.x);
              minYNew = Math.min(minYNew, newEl.y);
              maxXNew = Math.max(maxXNew, newEl.x + newEl.width);
              maxYNew = Math.max(maxYNew, newEl.y + newEl.height);
            }
          });
          if (validHost) {
            const oldCx = minXOld + (maxXOld - minXOld) / 2;
            const oldCy = minYOld + (maxYOld - minYOld) / 2;
            const newCx = minXNew + (maxXNew - minXNew) / 2;
            const newCy = minYNew + (maxYNew - minYNew) / 2;
            decorationsToUpdate.push({
              elementId: el.id,
              dx: newCx - oldCx,
              dy: newCy - oldCy,
            });
          }
        }
      }
    });
    decorationsToUpdate.forEach((item) => {
      if (Math.abs(item.dx) > 0.01 || Math.abs(item.dy) > 0.01) {
        const decoration = runtimeContext.ea.getElement(item.elementId);
        if (decoration) {
          decoration.x += item.dx;
          decoration.y += item.dy;
        }
      }
    });
    return new Set(decorationsToUpdate.map((d) => d.elementId));
  };

  /**
   * Intelligent scaling for decorations when a node changes size.
   * Uses "Edge Anchoring":
   * - Elements inside the node (like text in a box) scale relative to the center.
   * - Elements outside the node (like stickers/icons above) anchor to the nearest edge
   *   to preserve the visual gap, preventing them from flying away when the node grows significantly.
   */
  const scaleDecorations = (oldNode, newNode, allElements, rootId) => {
    if (!oldNode.groupIds || oldNode.groupIds.length === 0) return;
    const groupElements = runtimeContext.ea.getElementsInTheSameGroupWithElement(
      oldNode,
      allElements,
    );
    // Filter out the node itself and structural elements
    const decorations = groupElements.filter(
      (el) => el.id !== oldNode.id && !runtimeContext.isStructuralElement(el, allElements, rootId),
    );
    if (decorations.length === 0) return;
    const oldCx = oldNode.x + oldNode.width / 2;
    const oldCy = oldNode.y + oldNode.height / 2;
    const newCx = newNode.x + newNode.width / 2;
    const newCy = newNode.y + newNode.height / 2;
    // Ratios for "Inside" elements
    const ratioX = oldNode.width > 1 ? newNode.width / oldNode.width : 1;
    const ratioY = oldNode.height > 1 ? newNode.height / oldNode.height : 1;
    runtimeContext.ea.copyViewElementsToEAforEditing(decorations);
    decorations.forEach((dec) => {
      const el = runtimeContext.ea.getElement(dec.id);
      if (!el) return;
      const decCx = dec.x + dec.width / 2;
      const decCy = dec.y + dec.height / 2;
      // Determine relative position (normalized -1 to 1)
      const relX = (decCx - oldCx) / (oldNode.width / 2);
      const relY = (decCy - oldCy) / (oldNode.height / 2);
      // Inside check: Scale relative to center if within bounds
      const isInside = Math.abs(relX) <= 1.05 && Math.abs(relY) <= 1.05;
      if (isInside) {
        const dx = decCx - oldCx;
        const dy = decCy - oldCy;
        const newDx = dx * ratioX;
        const newDy = dy * ratioY;
        el.x = newCx + newDx - el.width / 2;
        el.y = newCy + newDy - el.height / 2;
      } else {
        // Outside: Anchor to nearest edge to preserve gap
        // Determine primary axis of separation
        if (Math.abs(relX) > Math.abs(relY)) {
          // Horizontal (Left/Right)
          const sign = Math.sign(relX);
          const oldEdgeX = oldCx + (sign * oldNode.width) / 2;
          const gapX = decCx - oldEdgeX; // Preserve this gap
          const newEdgeX = newCx + (sign * newNode.width) / 2;
          const newDecCx = newEdgeX + gapX;
          el.x = newDecCx - el.width / 2;
          // For the minor axis (Y), scale relative to center to keep alignment
          el.y = newCy + (decCy - oldCy) * ratioY - el.height / 2;
        } else {
          // Vertical (Top/Bottom)
          const sign = Math.sign(relY);
          const oldEdgeY = oldCy + (sign * oldNode.height) / 2;
          const gapY = decCy - oldEdgeY; // Preserve this gap
          const newEdgeY = newCy + (sign * newNode.height) / 2;
          const newDecCy = newEdgeY + gapY;
          el.y = newDecCy - el.height / 2;
          // For the minor axis (X), scale relative to center
          el.x = newCx + (decCx - oldCx) * ratioX - el.width / 2;
        }
      }
    });
  };
  return { moveCrossLinks, moveDecorations, scaleDecorations };
}
