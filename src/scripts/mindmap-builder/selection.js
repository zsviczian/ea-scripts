/**
 * @file selection.js
 * @overview selection implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createSelection(runtimeContext) {
  const selectNodeInView = (node) => {
    if (!node) {
      runtimeContext.mostRecentlySelectedNodeID = null;
      return;
    }
    const nodeId = typeof node === "string" ? node : node.id;
    runtimeContext.ea.selectElementsInView([nodeId]);
    runtimeContext.mostRecentlySelectedNodeID = nodeId;
  };

  // ---------------------------------------------------------------------------
  // 2. Traversal & Geometry Helpers
  // ---------------------------------------------------------------------------
  const getBoundaryHost = (selectedElements) => {
    if (
      selectedElements.length === 1 &&
      selectedElements[0].type === "line" &&
      selectedElements[0].customData?.hasOwnProperty("isBoundary")
    ) {
      const sel = selectedElements[0];
      // Check if this line is referenced as a boundaryId by any other element
      const allElements = runtimeContext.ea.getViewElements();
      const owner = allElements.find((el) => el.customData?.boundaryId === sel.id);
      return owner;
    }
  };

  const getMindmapNodeFromSelection = () => {
    if (!runtimeContext.isViewSet()) return;
    const selectedElements = runtimeContext.ea
      .getViewSelectedElements()
      .filter(
        (el) =>
          el.customData &&
          (el.customData.hasOwnProperty("mindmapOrder") ||
            el.customData.hasOwnProperty("isBranch") ||
            el.customData.hasOwnProperty("growthMode") ||
            el.customData.hasOwnProperty("isBoundary")),
      );
    if (selectedElements.length === 0) return;
    const owner = getBoundaryHost(selectedElements);
    if (owner) {
      runtimeContext.mostRecentlySelectedNodeID = owner.id;
      return owner;
    }
    if (
      selectedElements.length === 1 &&
      (selectedElements[0].customData.hasOwnProperty("mindmapOrder") ||
        selectedElements[0].customData.hasOwnProperty("growthMode"))
    ) {
      if (
        selectedElements[0].type === "text" &&
        selectedElements[0].boundElements.length === 0 &&
        !!selectedElements[0].containerId
      ) {
        const node = runtimeContext.ea
          .getViewElements()
          .find((el) => el.id === selectedElements[0].containerId);
        runtimeContext.mostRecentlySelectedNodeID = node?.id;
        return node;
      }
      runtimeContext.mostRecentlySelectedNodeID = selectedElements?.[0]?.id;
      return selectedElements[0];
    }
    // Handle Single Arrow Selection, deliberatly not filtering to el.customData?.isBranch
    if (selectedElements.length === 1 && selectedElements[0].type === "arrow") {
      const sel = selectedElements[0];
      const targetId = sel.startBinding?.elementId || sel.endBinding?.elementId;
      if (targetId) {
        const target = runtimeContext.ea.getViewElements().find((el) => el.id === targetId);
        runtimeContext.mostRecentlySelectedNodeID = target?.id;
        return target;
      }
      return;
    }
    // Possibly Text + Container Selection
    if (selectedElements.length === 2) {
      const textEl = selectedElements.find((el) => el.type === "text");
      if (
        textEl &&
        textEl.boundElements.length > 0 &&
        textEl.customData.hasOwnProperty("mindmapOrder")
      ) {
        runtimeContext.mostRecentlySelectedNodeID = textEl.id;
        return textEl;
      } else if (textEl) {
        const containerId = textEl.containerId;
        if (containerId) {
          const container = selectedElements.find((el) => el.id === containerId);
          if (
            container &&
            container.boundElements.length > 0 &&
            container.customData.hasOwnProperty("mindmapOrder")
          ) {
            runtimeContext.mostRecentlySelectedNodeID = container.id;
            return container;
          }
        }
      }
    }
    // Handle Group Selection (Find Highest Ranking Parent)
    // deliberatly not filtering to el.customData?.isBranch
    if (selectedElements.length > 1) {
      const selectedIds = new Set(selectedElements.map((el) => el.id));
      const arrows = selectedElements.filter((el) => el.type === "arrow");
      const sourceIds = new Set();
      const sinkIds = new Set();
      // Analyze arrows that connect elements WITHIN the current selection
      arrows.forEach((arrow) => {
        const startId = arrow.startBinding?.elementId;
        const endId = arrow.endBinding?.elementId;
        if (startId && selectedIds.has(startId)) sourceIds.add(startId);
        if (endId && selectedIds.has(endId)) sinkIds.add(endId);
      });
      // The "Highest Ranking Parent" is a source within the group
      // that is NOT a sink of any arrow within that same group.
      const rootId = Array.from(sourceIds).find((id) => !sinkIds.has(id));
      if (rootId) {
        runtimeContext.mostRecentlySelectedNodeID = rootId;
        return selectedElements.find((el) => el.id === rootId);
      }
    }
  };

  const ensureNodeSelected = () => {
    const elementToSelect = getMindmapNodeFromSelection();
    if (elementToSelect) {
      selectNodeInView(elementToSelect);
    }
  };

  const getMostRecentlyAddedNode = () => {
    if (!runtimeContext.mostRecentlyAddedNodeID) return null;
    return runtimeContext.ea
      .getViewElements()
      .find((el) => el.id === runtimeContext.mostRecentlyAddedNodeID);
  };
  return {
    selectNodeInView,
    getBoundaryHost,
    getMindmapNodeFromSelection,
    ensureNodeSelected,
    getMostRecentlyAddedNode,
  };
}
