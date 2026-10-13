/**
 * @file graph.js
 * @overview Mindmap ancestry, children, branch membership, and project traversal.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createGraph(runtimeContext) {
  const buildParentMap = (allElements, elementById) => {
    const parentMap = new Map();
    const byId = elementById || buildElementMap(allElements);
    allElements.forEach((el) => {
      if (
        el.type === "arrow" &&
        el.customData?.isBranch &&
        el.startBinding?.elementId &&
        el.endBinding?.elementId
      ) {
        const parent = byId.get(el.startBinding.elementId);
        const childId = el.endBinding.elementId;
        if (parent && childId) {
          // Handle container nodes if applicable
          const actualParent = parent.containerId ? byId.get(parent.containerId) : parent;
          if (actualParent) parentMap.set(childId, actualParent);
        }
      }
    });
    return parentMap;
  };

  /**
   * Retrieves the parent node of a specific element.
   */
  const getParentNode = (id, allElements, parentMap = null) => {
    if (parentMap && parentMap.has(id)) {
      return parentMap.get(id);
    }
    const arrow = allElements.find(
      (el) => el.type === "arrow" && el.customData?.isBranch && el.endBinding?.elementId === id,
    );
    if (!arrow) return null;
    const parent = allElements.find((el) => el.id === arrow.startBinding?.elementId);
    return parent?.containerId ? allElements.find((el) => el.id === parent.containerId) : parent;
  };

  const buildElementMap = (allElements) => {
    const map = new Map();
    allElements.forEach((el) => map.set(el.id, el));
    return map;
  };

  const buildChildrenMap = (allElements, elementById) => {
    const childrenByParent = new Map();
    const byId = elementById || buildElementMap(allElements);
    allElements.forEach((el) => {
      if (el.type === "arrow" && el.customData?.isBranch && el.startBinding?.elementId) {
        const parentId = el.startBinding.elementId;
        const child = byId.get(el.endBinding?.elementId);
        if (!child) return;
        if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
        childrenByParent.get(parentId).push(child);
      }
    });
    return childrenByParent;
  };

  const getChildrenNodes = (id, allElements) => {
    const arrows = allElements.filter(
      (el) => el.type === "arrow" && el.customData?.isBranch && el.startBinding?.elementId === id,
    );
    return arrows
      .map((a) => allElements.find((el) => el.id === a.endBinding?.elementId))
      .filter(Boolean);
  };

  const buildGroupToNodes = (branchIds, allElements) => {
    const branchIdSet = new Set(branchIds);
    const groupToNodes = new Map();
    allElements.forEach((el) => {
      if (branchIdSet.has(el.id) && el.type !== "arrow" && el.groupIds) {
        el.groupIds.forEach((gid) => {
          if (!groupToNodes.has(gid)) groupToNodes.set(gid, new Set());
          groupToNodes.get(gid).add(el);
        });
      }
    });
    return groupToNodes;
  };

  /**
   * Returns the IDs of root nodes in the scene
   * - A root node is defined as a node with `growthMode` that has only outgoing branch arrows, or no branch arrows at all.
   * @returns {string[]} An array of root node IDs.
   */
  const getMasterRoots = () => {
    const all = runtimeContext.ea.getViewElements();
    const allMap = new Map(all.map((el) => [el.id, el]));
    const maybeRoots = all.filter((el) => el.customData?.growthMode);
    const roots = maybeRoots.filter((r) => {
      const notRoot = r.boundElements.some((be) => {
        if (be.type !== "arrow") return false;
        const arrow = allMap.get(be.id);
        if (!arrow) return false;
        if (!arrow.customData?.isBranch) return false;
        if (arrow.endBinding?.elementId === r.id) return true;
        return false;
      });
      return !notRoot;
    });
    return roots.map((r) => r.id);
  };

  /**
   * Traverses up the tree to find the root and depth.
   */
  const getHierarchy = (el, allElements, elementById = null, parentMap = null) => {
    // Optimization: If we have an ID lookup, use it, otherwise perform search
    if (elementById) {
      el = runtimeContext.getBoundaryHost([el]) ?? el;
    } else {
      // Legacy behavior for ad-hoc calls
      el = runtimeContext.getBoundaryHost([el]) ?? el;
    }
    let depth = 0,
      curr = el,
      l1Id = el.id,
      rootId = el.id;
    const visited = new Set([el.id]);
    while (true) {
      let p = getParentNode(curr.id, allElements, parentMap);
      if (!p || visited.has(p.id)) {
        rootId = curr.id;
        break;
      }
      visited.add(p.id);
      l1Id = curr.id;
      curr = p;
      depth++;
    }
    return {
      depth,
      l1AncestorId: l1Id,
      rootId,
    };
  };

  /**
   * Returns the nearest configuration root for the selected node.
   * - Additional roots (`isAdditionalRoot`) act as local configuration roots.
   * - If none is found on the path, the master root is returned.
   */
  const getSettingsRootNode = (el, allElements, elementById = null, parentMap = null) => {
    if (!el) return null;
    let curr = runtimeContext.getBoundaryHost([el]) ?? el;
    let last = curr;
    const visited = new Set();
    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      last = curr;
      if (curr.customData?.isAdditionalRoot === true) {
        return curr;
      }
      const p = getParentNode(curr.id, allElements, parentMap);
      if (!p) {
        return curr; // master root
      }
      curr = p;
    }
    return last;
  };

  /**
   * Returns depth from a specific ancestor.
   * If the ancestor is not found, it safely falls back to absolute hierarchy depth.
   */
  const getDepthFromAncestor = (nodeId, ancestorId, allElements, parentMap = null) => {
    const byId = buildElementMap(allElements);
    let curr = byId.get(nodeId);
    if (!curr) return 0;
    let depth = 0;
    const visited = new Set();
    while (curr && !visited.has(curr.id)) {
      if (curr.id === ancestorId) return depth;
      visited.add(curr.id);
      curr = getParentNode(curr.id, allElements, parentMap);
      depth++;
    }
    const fallbackNode = byId.get(nodeId);
    return fallbackNode ? getHierarchy(fallbackNode, allElements, byId, parentMap).depth : 0;
  };

  /**
   * Collects all node IDs and arrow IDs belonging to a branch.
   * Includes "isBranch" arrows and internal non-mindmap arrows.
   **/
  const getBranchElementIds = (nodeId, allElements) => {
    const childMap = new Map();
    const allArrows = [];
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i];
      if (el.type === "arrow") {
        allArrows.push(el);
        if (el.customData?.isBranch && el.startBinding?.elementId && el.endBinding?.elementId) {
          const start = el.startBinding.elementId;
          const end = el.endBinding.elementId;
          if (!childMap.has(start)) {
            childMap.set(start, []);
          }
          childMap.get(start).push(end);
        }
      }
    }
    const branchNodes = new Set([nodeId]);
    const queue = [nodeId];
    while (queue.length > 0) {
      const currentId = queue.shift();
      const currentNode = allElements.find((el) => el.id === currentId);
      if (currentNode?.customData?.boundaryId) {
        branchNodes.add(currentNode.customData.boundaryId);
      }
      const children = childMap.get(currentId);
      if (children) {
        for (let i = 0; i < children.length; i++) {
          const childId = children[i];
          if (!branchNodes.has(childId)) {
            branchNodes.add(childId);
            queue.push(childId);
          }
        }
      }
    }
    const branchElementIds = Array.from(branchNodes);
    // 3. Identify all arrows (structural OR annotations) where BOTH ends are within the branch
    for (let i = 0; i < allArrows.length; i++) {
      const el = allArrows[i];
      const startId = el.startBinding?.elementId;
      const endId = el.endBinding?.elementId;
      // An arrow (isBranch or internal) is part of the group only if
      // BOTH ends are nodes within the branch set.
      if (startId && endId && branchNodes.has(startId) && branchNodes.has(endId)) {
        branchElementIds.push(el.id);
      }
    }
    return branchElementIds;
  };

  /**
   * Identifies all elements belonging to a specific mindmap tree to optimize performance on large canvases.
   * This includes nodes, branch arrows, crosslinks, decorations, boundaries, and bound text.
   */
  const getMindmapProjectElements = (rootId, allViewElements) => {
    // 1. Get core structural IDs
    const branchIds = getBranchElementIds(rootId, allViewElements);
    // 2. Get decorations and cross-links (requires scanning allViewElements for groups/arrows)
    const decorationAndCrossLinkIds = runtimeContext.getDecorationAndCrossLinkIdsForBranches(
      branchIds,
      allViewElements,
      rootId,
    );
    const projectElementIds = new Set([...branchIds, ...decorationAndCrossLinkIds]);
    const projectElements = [];
    const addedIds = new Set();
    const addWithDependencies = (id) => {
      if (addedIds.has(id)) return;
      const el = allViewElements.find((e) => e.id === id);
      if (!el) return;
      projectElements.push(el);
      addedIds.add(id);
      // Include text inside containers or arrows
      if (el.boundElements) {
        el.boundElements.forEach((be) => addWithDependencies(be.id));
      }
      // Include container of text
      if (el.containerId) {
        addWithDependencies(el.containerId);
      }
      // Include fold indicators
      if (el.customData?.foldIndicatorId) {
        addWithDependencies(el.customData.foldIndicatorId);
      }
      // Include boundaries
      if (el.customData?.boundaryId) {
        addWithDependencies(el.customData.boundaryId);
      }
    };
    projectElementIds.forEach((id) => addWithDependencies(id));
    return projectElements;
  };
  return {
    buildParentMap,
    getParentNode,
    buildElementMap,
    buildChildrenMap,
    getChildrenNodes,
    buildGroupToNodes,
    getMasterRoots,
    getHierarchy,
    getSettingsRootNode,
    getDepthFromAncestor,
    getBranchElementIds,
    getMindmapProjectElements,
  };
}
