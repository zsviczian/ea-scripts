/**
 * @file boundaries.js
 * @overview boundaries implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createBoundaries(runtimeContext) {
  const getAngleFromCenter = (center, point) => {
    let dx = point.x - center.x,
      dy = point.y - center.y;
    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    return angle < 0 ? angle + 360 : angle;
  };

  // Monotone Chain Convex Hull Algorithm
  const getConvexHull = (points) => {
    points.sort((a, b) => (a[0] != b[0] ? a[0] - b[0] : a[1] - b[1]));
    const n = points.length;
    if (n <= 2) return points;
    const cross = (a, b, o) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (let i = 0; i < n; i++) {
      while (
        lower.length >= 2 &&
        cross(lower[lower.length - 2], lower[lower.length - 1], points[i]) <= 0
      ) {
        lower.pop();
      }
      lower.push(points[i]);
    }
    const upper = [];
    for (let i = n - 1; i >= 0; i--) {
      while (
        upper.length >= 2 &&
        cross(upper[upper.length - 2], upper[upper.length - 1], points[i]) <= 0
      ) {
        upper.pop();
      }
      upper.push(points[i]);
    }
    upper.pop();
    lower.pop();
    return lower.concat(upper);
  };

  const updateNodeBoundary = (node, allElements, rootId) => {
    const boundaryId = node.customData?.boundaryId;
    if (!boundaryId) {
      return;
    }
    if (node.opacity === 0) return;
    const ids = runtimeContext.getBranchElementIds(node.id, allElements);
    const branchElements = allElements.filter(
      (el) => ids.includes(el.id) && el.id !== boundaryId && el.opacity > 0 && !el.isDeleted,
    );
    if (branchElements.length === 0) return;
    const root = allElements.find((el) => el.id === rootId);
    const growthMode = root?.customData?.growthMode || runtimeContext.currentModalGrowthMode;
    const isVerticalBoundaryMode =
      growthMode === "Up-facing" || growthMode === "Down-facing" || growthMode === "Up-Down";
    const padding = 15;
    let allPoints = [];
    branchElements.forEach((el) => {
      if (
        isVerticalBoundaryMode &&
        el.type === "arrow" &&
        Array.isArray(el.points) &&
        el.points.length > 0
      ) {
        el.points.forEach(([px, py]) => {
          const x = el.x + px;
          const y = el.y + py;
          allPoints.push([x - padding, y - padding]);
          allPoints.push([x + padding, y - padding]);
          allPoints.push([x + padding, y + padding]);
          allPoints.push([x - padding, y + padding]);
        });
        return;
      }
      const x1 = el.x - padding;
      const y1 = el.y - padding;
      const x2 = el.x + el.width + padding;
      const y2 = el.y + el.height + padding;
      allPoints.push([x1, y1]);
      allPoints.push([x2, y1]);
      allPoints.push([x2, y2]);
      allPoints.push([x1, y2]);
    });
    const hullPoints = getConvexHull(allPoints);
    if (hullPoints.length < 3) return;
    // Subdivide long segments to tame the bezier curve over-extension
    const subdividedPoints = [];
    const MAX_SEGMENT_LENGTH =
      runtimeContext.layoutSettings.MAX_SEGMENT_LENGTH ??
      runtimeContext.LAYOUT_METADATA.MAX_SEGMENT_LENGTH.def;
    for (let i = 0; i < hullPoints.length; i++) {
      const p1 = hullPoints[i];
      const p2 = hullPoints[(i + 1) % hullPoints.length];
      subdividedPoints.push(p1);
      const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      if (dist > MAX_SEGMENT_LENGTH) {
        const steps = Math.ceil(dist / MAX_SEGMENT_LENGTH);
        for (let j = 1; j < steps; j++) {
          subdividedPoints.push([
            p1[0] + (p2[0] - p1[0]) * (j / steps),
            p1[1] + (p2[1] - p1[1]) * (j / steps),
          ]);
        }
      }
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    // Calculate bounding box using the original hull points
    hullPoints.forEach((p) => {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    });
    const w = maxX - minX;
    const h = maxY - minY;
    let boundaryEl = runtimeContext.ea.getElement(boundaryId);
    if (!boundaryEl) return;
    boundaryEl.x = minX;
    boundaryEl.y = minY;
    boundaryEl.width = w;
    boundaryEl.height = h;
    // Use the newly subdivided points for the final path
    const normalizedPoints = subdividedPoints.map((p) => [p[0] - minX, p[1] - minY]);
    normalizedPoints.push([normalizedPoints[0][0], normalizedPoints[0][1]]); // Close loop
    boundaryEl.points = normalizedPoints;
    boundaryEl.roundness =
      runtimeContext.arrowType === "curved"
        ? {
            type: 2,
          }
        : null;
    boundaryEl.polygon = true;
    boundaryEl.locked = false;
    if (node.groupIds.length > 0 && runtimeContext.isMindmapGroup(node.groupIds[0], allElements)) {
      if (
        !boundaryEl.groupIds ||
        boundaryEl.groupIds.length === 0 ||
        boundaryEl.groupIds[0] !== node.groupIds[0]
      ) {
        boundaryEl.groupIds = [node.groupIds[0]];
      }
    } else {
      boundaryEl.groupIds = [];
    }
  };

  /**
   * Toggles a visual boundary polygon around the selected node's subtree.
   */
  const toggleBoundary = async () => {
    if (!runtimeContext.isViewSet()) return;
    const sel = runtimeContext.getMindmapNodeFromSelection();
    if (sel) {
      const info = runtimeContext.getHierarchy(sel, runtimeContext.ea.getViewElements());
      runtimeContext.ea.copyViewElementsToEAforEditing([sel]);
      const eaSel = runtimeContext.ea.getElement(sel.id);
      let newBoundaryId = null;
      if (eaSel.customData?.boundaryId) {
        const b = runtimeContext.ea
          .getViewElements()
          .find((el) => el.id === eaSel.customData.boundaryId);
        if (b) {
          runtimeContext.ea.copyViewElementsToEAforEditing([b]);
          runtimeContext.ea.getElement(b.id).isDeleted = true;
        }
        runtimeContext.ea.addAppendUpdateCustomData(sel.id, {
          boundaryId: undefined,
        });
      } else {
        const id = runtimeContext.ea.generateElementId();
        newBoundaryId = id;
        const st = runtimeContext.getAppState();
        const boundaryEl = {
          id: id,
          type: "line",
          x: sel.x,
          y: sel.y,
          width: 1,
          height: 1,
          angle: 0,
          roughness: st.currentItemRoughness,
          strokeColor: sel.strokeColor,
          backgroundColor: sel.strokeColor,
          fillStyle: "solid",
          strokeWidth: 2,
          strokeStyle: "solid",
          opacity: 30,
          points: [
            [0, 0],
            [1, 1],
            [0, 0],
          ],
          polygon: true,
          locked: false,
          groupIds: sel.groupIds || [],
          customData: {
            isBoundary: true,
          },
          roundness:
            runtimeContext.arrowType === "curved"
              ? {
                  type: 2,
                }
              : null,
        };
        if (
          sel.groupIds.length > 0 &&
          runtimeContext.isMindmapGroup(sel.groupIds[0], runtimeContext.ea.getViewElements())
        ) {
          boundaryEl.groupIds = [sel.groupIds[0]];
        } else {
          boundaryEl.groupIds = [];
        }
        runtimeContext.ea.elementsDict[id] = boundaryEl;
        runtimeContext.ea.addAppendUpdateCustomData(sel.id, {
          boundaryId: id,
        });
      }
      await runtimeContext.addElementsToView({
        newElementsOnTop: false,
        captureUpdate: "EVENTUALLY",
      });
      if (newBoundaryId) {
        const els = runtimeContext.ea.getViewElements();
        let parentBoundaryIndex = -1;
        let curr = sel;
        while (curr) {
          const parent = runtimeContext.getParentNode(curr.id, els);
          if (!parent) break;
          if (parent.customData?.boundaryId) {
            const pIndex = els.findIndex((el) => el.id === parent.customData.boundaryId);
            if (pIndex !== -1) {
              parentBoundaryIndex = pIndex;
              break;
            }
          }
          curr = parent;
        }
        const targetIndex = parentBoundaryIndex !== -1 ? parentBoundaryIndex + 1 : 0;
        runtimeContext.ea.moveViewElementToZIndex(newBoundaryId, targetIndex);
      }
      await runtimeContext.triggerGlobalLayout(info.rootId);
    }
    runtimeContext.updateUI();
  };
  return { getAngleFromCenter, getConvexHull, updateNodeBoundary, toggleBoundary };
}
