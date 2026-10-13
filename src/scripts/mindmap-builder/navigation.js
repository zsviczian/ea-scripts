/**
 * @file navigation.js
 * @overview navigation implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createNavigation(runtimeContext) {
  const nextZoomLevel = (current) => {
    const idx = runtimeContext.ZOOM_TYPES.indexOf(current);
    return idx === -1
      ? runtimeContext.ZOOM_TYPES[0]
      : runtimeContext.ZOOM_TYPES[(idx + 1) % runtimeContext.ZOOM_TYPES.length];
  };

  const zoomToFit = (mode) => {
    if (!runtimeContext.isViewSet()) return;
    let sel = runtimeContext.getMindmapNodeFromSelection();
    // Fallback to most recently selected if nothing is currently selected
    if (!sel && runtimeContext.mostRecentlySelectedNodeID) {
      const fallback = runtimeContext.ea
        .getViewElements()
        .find((el) => el.id === runtimeContext.mostRecentlySelectedNodeID);
      if (fallback) {
        sel = fallback;
        runtimeContext.selectNodeInView(sel);
        runtimeContext.focusInputEl();
      } else {
        runtimeContext.mostRecentlySelectedNodeID = null;
      }
    }
    if (sel) {
      let nextLevel = runtimeContext.zoomLevel;
      if (typeof mode === "string") {
        nextLevel = mode;
      } else if (!!mode && runtimeContext.storedZoom.elementID === sel.id) {
        nextLevel = nextZoomLevel(runtimeContext.storedZoom.level ?? runtimeContext.zoomLevel);
      }
      runtimeContext.storedZoom = {
        elementID: sel.id,
        level: nextLevel,
      };
      const targetZoom = runtimeContext.getZoom(nextLevel);
      // Fallback for older versions vs new Excalidraw 2.26.0+ Viewport API
      if (!runtimeContext.ea.verifyMinimumPluginVersion("2.26.0")) {
        runtimeContext.api().scrollToContent([sel], {
          fitToViewport: true,
          viewportZoomFactor: targetZoom,
          animate: true,
        });
      } else {
        // For the new API, we calculate a target rect centered on the element
        // with dimensions that will force 'fit: "contain"' to reach our target zoom.
        const appState = runtimeContext.api().getAppState();
        const targetW = appState.width / targetZoom;
        const targetH = appState.height / targetZoom;
        const cx = sel.x + sel.width / 2;
        const cy = sel.y + sel.height / 2;
        runtimeContext.api().setViewport({
          target: {
            x: cx - targetW / 2,
            y: cy - targetH / 2,
            width: targetW,
            height: targetH,
          },
          fit: "contain",
          animation: true,
        });
      }
    }
  };

  const focusSelected = () => {
    if (!runtimeContext.isViewSet()) return;
    let sel = runtimeContext.getMindmapNodeFromSelection();
    // Fallback to most recently selected if nothing is currently selected
    if (!sel) {
      if (!runtimeContext.mostRecentlySelectedNodeID) {
        const roots = runtimeContext.getMasterRoots();
        if (roots.length > 0) {
          runtimeContext.mostRecentlySelectedNodeID = roots[0];
        }
        if (!runtimeContext.mostRecentlySelectedNodeID) return;
      }
      const fallback = runtimeContext.ea
        .getViewElements()
        .find((el) => el.id === runtimeContext.mostRecentlySelectedNodeID);
      if (fallback) {
        sel = fallback;
        runtimeContext.selectNodeInView(sel);
        runtimeContext.focusInputEl();
      } else {
        runtimeContext.mostRecentlySelectedNodeID = null;
      }
    }
    if (!sel) return;
    // Fallback for older versions vs new Excalidraw 2.26.0+ Viewport API
    if (!runtimeContext.ea.verifyMinimumPluginVersion("2.26.0")) {
      runtimeContext.api().scrollToContent(sel, {
        fitToContent: false,
        animate: true,
      });
    } else {
      // fit: "none" recenters at the current zoom without changing it
      runtimeContext.api().setViewport({
        target: [sel],
        fit: "none",
        animation: true,
      });
    }
  };

  /**
   * Navigates the mindmap using arrow keys.
   * Handles different layout modes (Radial, Directional) and folds.
   *
   * @param {object} params
   * @param {string} params.key - "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"
   * @param {boolean} params.zoom - whether to zoom to the new node
   * @param {boolean} params.focus - whether to focus the new node
   */
  const navigateMap = async ({ key, zoom = false, focus = false } = {}) => {
    if (!key) return;
    if (!runtimeContext.isViewSet()) return;
    let allElements = runtimeContext.ea.getViewElements();
    const current = runtimeContext.getMindmapNodeFromSelection();
    if (!current) return;
    const info = runtimeContext.getHierarchy(current, allElements);
    const parent = runtimeContext.getParentNode(current.id, allElements);
    const currentSettingsRoot = runtimeContext.getSettingsRootNode(current, allElements);
    const root =
      current.customData?.isAdditionalRoot === true && parent
        ? runtimeContext.getSettingsRootNode(parent, allElements) ||
          currentSettingsRoot ||
          allElements.find((e) => e.id === info.rootId)
        : currentSettingsRoot || allElements.find((e) => e.id === info.rootId);
    if (!root) return;
    const rootCenter = {
      x: root.x + root.width / 2,
      y: root.y + root.height / 2,
    };
    const mapMode = root.customData?.growthMode || runtimeContext.currentModalGrowthMode;
    const isVerticalLayout = ["Up-facing", "Down-facing", "Up-Down"].includes(mapMode);
    if (current.id === root.id) {
      if (current.customData?.isFolded) {
        await runtimeContext.toggleFold("L0");
        allElements = runtimeContext.ea.getViewElements();
      }
      const children = runtimeContext.getChildrenNodes(root.id, allElements);
      if (children.length) {
        // Sort by order/index first to establish the visual list sequence
        runtimeContext.sortChildrenStable(children);
        let targetChild = null;
        if (isVerticalLayout) {
          if (key === "ArrowLeft") targetChild = children[0];
          else if (key === "ArrowRight") targetChild = children[children.length - 1];
          else {
            // Left/Right Logic
            // Calculate relative positions
            const childrenWithPos = children.map((c) => ({
              node: c,
              dx: Math.abs(c.x + c.width / 2 - rootCenter.x), // distance from vertical centerline
              dy: c.y + c.height / 2 - rootCenter.y,
            }));
            if (key === "ArrowDown") {
              // Find nodes below (dy > 0)
              const downNodes = childrenWithPos.filter((c) => c.dy > 0).sort((a, b) => a.dx - b.dx);
              targetChild = downNodes.length > 0 ? downNodes[0].node : children[0];
            } else if (key === "ArrowUp") {
              // Find nodes above (dy < 0)
              const upNodes = childrenWithPos.filter((c) => c.dy < 0).sort((a, b) => a.dx - b.dx);
              targetChild = upNodes.length > 0 ? upNodes[0].node : children[children.length - 1];
            }
          }
        } else {
          if (key === "ArrowUp") targetChild = children[0];
          else if (key === "ArrowDown") targetChild = children[children.length - 1];
          else {
            // Left/Right Logic
            // Calculate relative positions
            const childrenWithPos = children.map((c) => ({
              node: c,
              dx: c.x + c.width / 2 - rootCenter.x,
              dy: Math.abs(c.y + c.height / 2 - rootCenter.y), // distance from horizontal centerline
            }));
            if (key === "ArrowRight") {
              // Find nodes to the right (dx > 0)
              const rightNodes = childrenWithPos
                .filter((c) => c.dx > 0)
                .sort((a, b) => a.dy - b.dy);
              targetChild = rightNodes.length > 0 ? rightNodes[0].node : children[0];
            } else if (key === "ArrowLeft") {
              // Find nodes to the left (dx < 0)
              const leftNodes = childrenWithPos.filter((c) => c.dx < 0).sort((a, b) => a.dy - b.dy);
              targetChild =
                leftNodes.length > 0 ? leftNodes[0].node : children[children.length - 1];
            }
          }
        }
        if (targetChild) {
          runtimeContext.selectNodeInView(targetChild);
          if (zoom) zoomToFit();
          if (focus) focusSelected();
        }
      }
      return;
    }
    const isHierarchyNav = isVerticalLayout
      ? key === "ArrowUp" || key === "ArrowDown"
      : key === "ArrowLeft" || key === "ArrowRight";
    const isSiblingNav = isVerticalLayout
      ? key === "ArrowLeft" || key === "ArrowRight"
      : key === "ArrowUp" || key === "ArrowDown";
    if (isHierarchyNav) {
      const curCenter = {
        x: current.x + current.width / 2,
        y: current.y + current.height / 2,
      };
      const isInPositive = isVerticalLayout
        ? curCenter.y > rootCenter.y
        : curCenter.x > rootCenter.x;
      let goIn = false;
      if (isVerticalLayout) {
        goIn = (key === "ArrowUp" && isInPositive) || (key === "ArrowDown" && !isInPositive);
      } else {
        goIn = (key === "ArrowLeft" && isInPositive) || (key === "ArrowRight" && !isInPositive);
      }
      if (goIn) {
        runtimeContext.selectNodeInView(runtimeContext.getParentNode(current.id, allElements));
      } else {
        if (current.customData?.isFolded) {
          await runtimeContext.toggleFold("L0");
          allElements = runtimeContext.ea.getViewElements();
        }
        const ch = runtimeContext
          .getChildrenNodes(current.id, allElements)
          .sort(
            (a, b) => (a.customData?.mindmapOrder ?? 100) - (b.customData?.mindmapOrder ?? 100),
          );
        if (ch.length) runtimeContext.selectNodeInView(ch[0]);
      }
    } else if (isSiblingNav) {
      const parent = runtimeContext.getParentNode(current.id, allElements);
      if (!parent) return;
      const siblings = runtimeContext.getChildrenNodes(parent.id, allElements);
      // Calculate the immediate parent's center to sort siblings clockwise around it
      const parentCenter = {
        x: parent.x + parent.width / 2,
        y: parent.y + parent.height / 2,
      };
      // Always sort by angle from 12 o'clock (0 degrees) to ensure clockwise navigation
      // regardless of layout mode or hierarchy level.
      // We project the coordinates to neutralize width/height skewing the geometric center.
      siblings.sort((a, b) => {
        const aCX = a.x + a.width / 2;
        const aCY = a.y + a.height / 2;
        const bCX = b.x + b.width / 2;
        const bCY = b.y + b.height / 2;
        let aPoint = {
          x: aCX,
          y: aCY,
        };
        let bPoint = {
          x: bCX,
          y: bCY,
        };
        if (mapMode === "Radial") {
          // Use the edge closest to the parent to neutralize text width/height skew in Radial
          aPoint.x = aCX >= parentCenter.x ? a.x : a.x + a.width;
          aPoint.y = aCY >= parentCenter.y ? a.y : a.y + a.height;
          bPoint.x = bCX >= parentCenter.x ? b.x : b.x + b.width;
          bPoint.y = bCY >= parentCenter.y ? b.y : b.y + b.height;
        } else if (isVerticalLayout) {
          // Neutralize Y distance to sort strictly by X sequentially on each side
          aPoint.y = parentCenter.y + (aCY >= parentCenter.y ? 100000 : -100000);
          bPoint.y = parentCenter.y + (bCY >= parentCenter.y ? 100000 : -100000);
        } else {
          // Neutralize X distance to sort strictly by Y sequentially on each side
          aPoint.x = parentCenter.x + (aCX >= parentCenter.x ? 100000 : -100000);
          bPoint.x = parentCenter.x + (bCX >= parentCenter.x ? 100000 : -100000);
        }
        return (
          runtimeContext.getAngleFromCenter(parentCenter, aPoint) -
          runtimeContext.getAngleFromCenter(parentCenter, bPoint)
        );
      });
      const idx = siblings.findIndex((s) => s.id === current.id);
      const startIndex = idx === -1 ? 0 : idx; // Start at 0 if current isn't found
      const currentIsNegativeBranch = isVerticalLayout
        ? current.y + current.height / 2 < parent.y + parent.height / 2
        : current.x + current.width / 2 < parent.x + parent.width / 2;
      // Reverse up/down for left-facing branches in directional modes
      let navigateForward; // true for next sibling (clockwise), false for previous (counter-clockwise)
      if (isVerticalLayout) {
        navigateForward = currentIsNegativeBranch ? key === "ArrowRight" : key === "ArrowLeft";
      } else {
        navigateForward = currentIsNegativeBranch ? key === "ArrowUp" : key === "ArrowDown";
      }
      let nIdx = navigateForward
        ? (startIndex + 1) % siblings.length
        : (startIndex - 1 + siblings.length) % siblings.length;
      runtimeContext.selectNodeInView(siblings[nIdx]);
    }
    if (zoom) zoomToFit();
    if (focus) focusSelected();
  };
  return { nextZoomLevel, zoomToFit, focusSelected, navigateMap };
}
