/**
 * @file grouping.js
 * @overview grouping implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createGrouping(runtimeContext) {
  /**
   * Determines if an element is part of the mindmap structure.
   */
  const isStructuralElement = (
    el,
    allElements,
    rootId = null,
    elementById = null,
    parentMap = null,
  ) => {
    const isStructuralType =
      el.customData?.isBranch ||
      el.customData?.growthMode ||
      el.customData?.isBoundary ||
      typeof el.customData?.mindmapOrder !== "undefined";
    if (rootId && isStructuralType) {
      let targetEl = el;
      if (el.type === "arrow" && el.customData?.isBranch) {
        const targetId = el.endBinding?.elementId || el.startBinding?.elementId;
        if (targetId) {
          targetEl = elementById?.get(targetId) || allElements.find((e) => e.id === targetId);
        }
      }
      if (!targetEl) return false;
      // Pass maps to getHierarchy to prevent O(N) lookups
      const info = runtimeContext.getHierarchy(targetEl, allElements, elementById, parentMap);
      if (info?.rootId === rootId) return true;
      if (info?.rootId) return false;
    }
    if (!rootId && isStructuralType) return true;
    const connectedArrow = allElements.find(
      (a) =>
        a.type === "arrow" &&
        a.customData?.isBranch &&
        (a.startBinding?.elementId === el.id || a.endBinding?.elementId === el.id),
    );
    return !!connectedArrow;
  };

  const getViewGroupElements = (groupID) => {
    return runtimeContext.ea.getViewElements().filter((el) => el.groupIds.includes(groupID));
  };

  const getCommonGroupForElements = (elements) => {
    const groupIds = elements
      .map((el) => el.groupIds)
      .reduce((prev, cur) => cur.filter((v) => prev.includes(v)));
    return groupIds;
  };

  /**
   * A group is considered a "Mindmap Group" if it contains at least 2 structural elements.
   * Groups with only 1 structural element (e.g. a Node grouped with a Sticker) are treated as decoration.
   */
  const isMindmapGroup = (groupId, allElements) => {
    const groupEls = allElements.filter((el) => el.groupIds?.includes(groupId));
    const structuralCount = groupEls.filter((el) => isStructuralElement(el, allElements)).length;
    return structuralCount >= 2;
  };

  const collectCrosslinkIds = (allElements) =>
    new Set(
      allElements
        .filter(
          (el) =>
            el.type === "arrow" &&
            !el.customData?.isBranch &&
            el.startBinding?.elementId &&
            el.endBinding?.elementId,
        )
        .map((el) => el.id),
    );

  const collectDecorationIds = (allElements, rootId) =>
    new Set(
      allElements
        .filter(
          (el) =>
            el.groupIds && el.groupIds.length > 0 && !isStructuralElement(el, allElements, rootId),
        )
        .map((el) => el.id),
    );

  /**
   * Finds the first group ID in the element's group stack that qualifies as a Mindmap Group.
   */
  const getStructuralGroup = (element, allElements, rootId) => {
    if (!element.groupIds || element.groupIds.length === 0) return null;
    return element.groupIds.find((gid) => isMindmapGroup(gid, allElements));
  };

  const applyRecursiveGrouping = (nodeId, allElements) => {
    const children = runtimeContext.getChildrenNodes(nodeId, allElements);
    const nodeIdsInSubtree = [nodeId];
    const node = allElements.find((el) => el.id === nodeId);
    if (node?.customData?.boundaryId) {
      nodeIdsInSubtree.push(node.customData.boundaryId);
    }
    children.forEach((child) => {
      const subtreeIds = applyRecursiveGrouping(child.id, allElements);
      nodeIdsInSubtree.push(...subtreeIds);
      // Find the arrow connecting nodeId to child
      const arrow = allElements.find(
        (a) =>
          a.type === "arrow" &&
          a.customData?.isBranch &&
          a.startBinding?.elementId === nodeId &&
          a.endBinding?.elementId === child.id,
      );
      if (arrow) {
        nodeIdsInSubtree.push(arrow.id);
      }
    });
    // Apply group in EA workbench
    if (nodeIdsInSubtree.length > 1) {
      runtimeContext.ea.addToGroup(nodeIdsInSubtree);
    }
    return nodeIdsInSubtree;
  };

  /**
   *
   * @param {*} nodeId
   * @param {*} workbenchEls ExcalidrawAutomate elements on the workbench
   * @returns the group ID if a structural mindmap group exists for the branch, else null
   */
  const getStructuralGroupForNode = (branchIds, workbenchEls, rootId) => {
    const decorationAndCrossLinkIds = getDecorationAndCrossLinkIdsForBranches(
      branchIds,
      workbenchEls,
      rootId,
    );
    const elements = workbenchEls.filter(
      (el) => branchIds.includes(el.id) || decorationAndCrossLinkIds.includes(el.id),
    );
    const commonGroupId = getCommonGroupForElements(elements)[0];
    const structuralGroupId =
      commonGroupId && isMindmapGroup(commonGroupId, workbenchEls) ? commonGroupId : null;
    return {
      structuralGroupId,
      groupedElementIds: structuralGroupId ? elements.map((e) => e.id) : [],
    };
  };

  /**
   *
   * @param {*} nodeId
   * @param {*} workbenchEls ExcalidrawAutomate elements on the workbench
   * @returns the group ID if a structural mindmap group exists for the branch, else null
   */
  const getStructuralGroupsForNode = (branchIds, workbenchEls, rootId) => {
    const decorationAndCrossLinkIds = getDecorationAndCrossLinkIdsForBranches(
      branchIds,
      workbenchEls,
      rootId,
    );
    const elements = workbenchEls.filter(
      (el) => branchIds.includes(el.id) || decorationAndCrossLinkIds.includes(el.id),
    );
    const commonGroupIds = getCommonGroupForElements(elements);
    const structuralGroupIds = commonGroupIds.filter((commonGroupId) =>
      isMindmapGroup(commonGroupId, workbenchEls),
    );
    return {
      structuralGroupIds,
      groupedElementIds: elements.map((e) => e.id),
    };
  };

  /**
   *
   * @param {*} groupId
   * @param {*} workbenchEls ExcalidrawAutomate elements on the workbench
   */
  const removeGroupFromElements = (groupId, workbenchEls) => {
    workbenchEls.forEach((el) => {
      if (el.groupIds) {
        el.groupIds = el.groupIds.filter((g) => g !== groupId);
      }
    });
  };

  const getDecorationAndCrossLinkIdsForBranches = (branchIds, allElements, rootId) => {
    const idsInBranch = new Set(branchIds);
    const decorationsAndCrossLInks = new Set();
    // Pre-index elements by ID and GroupID to avoid O(N*M) lookups
    const elementMap = new Map();
    const groupMap = new Map();
    for (const el of allElements) {
      elementMap.set(el.id, el);
      if (el.groupIds && el.groupIds.length > 0) {
        for (const gid of el.groupIds) {
          if (!groupMap.has(gid)) {
            groupMap.set(gid, []);
          }
          groupMap.get(gid).push(el);
        }
      }
    }
    // Track processed groups to avoid redundant checks if multiple branch nodes share a group
    const processedGroups = new Set();
    // Logic: Include elements that are grouped with our branch nodes,
    // UNLESS that group also contains structural elements outside our branch (which would mean it's a parent group).
    for (const id of branchIds) {
      const el = elementMap.get(id);
      if (el && el.groupIds && el.groupIds.length > 0) {
        for (const gid of el.groupIds) {
          if (processedGroups.has(gid)) continue;
          processedGroups.add(gid);
          const groupMembers = groupMap.get(gid) || [];
          // Check if this group belongs *exclusively* to the branch (or is a local decoration group)
          // We do this by checking if any 'structural' member of the group is OUTSIDE our branch.
          let hasOutsider = false;
          const structuralMembers = [];
          for (const member of groupMembers) {
            if (idsInBranch.has(member.id) || isStructuralElement(member, allElements, rootId)) {
              structuralMembers.push(member);
              if (!idsInBranch.has(member.id)) {
                hasOutsider = true;
                break;
              }
            }
          }
          if (!hasOutsider) {
            const structuralMemberIds = new Set(structuralMembers.map((e) => e.id));
            for (const member of groupMembers) {
              if (!structuralMemberIds.has(member.id)) {
                decorationsAndCrossLInks.add(member.id);
              }
            }
          }
        }
      }
    }
    // 3. Include Arrows (Structural & Crosslinks)
    // Condition: Start AND End are in the set.
    for (const el of allElements) {
      // Skip if already in branch or already identified as decoration
      if (idsInBranch.has(el.id) || decorationsAndCrossLInks.has(el.id)) continue;
      if (el.type === "arrow" && !el.customData?.isBranch) {
        if (el.startBinding?.elementId && el.endBinding?.elementId) {
          if (
            idsInBranch.has(el.startBinding.elementId) &&
            idsInBranch.has(el.endBinding.elementId)
          ) {
            decorationsAndCrossLInks.add(el.id);
            // Optimization: Check bound elements directly via elementMap instead of ea.getBoundTextElement (which might scan scene)
            if (el.boundElements && el.boundElements.length > 0) {
              for (const bound of el.boundElements) {
                if (bound.type === "text") decorationsAndCrossLInks.add(bound.id);
              }
            }
          }
        }
      }
    }
    return Array.from(decorationsAndCrossLInks);
  };

  /**
   * Toggles a single flat group for the selected branch.
   **/
  const toggleBranchGroup = async () => {
    if (!runtimeContext.isViewSet()) return;
    const sel = runtimeContext.getMindmapNodeFromSelection();
    if (!sel) return;
    const info = runtimeContext.getHierarchy(sel, runtimeContext.ea.getViewElements());
    if (!info || !info.rootId) return;
    const allElements = runtimeContext.ea.getViewElements();
    const branchIds = runtimeContext.getBranchElementIds(sel.id, allElements);
    const decorationAndCrossLinkIds = getDecorationAndCrossLinkIdsForBranches(
      branchIds,
      allElements,
      info.rootId,
    );
    if (branchIds.length <= 1) return;
    runtimeContext.ea.copyViewElementsToEAforEditing(
      allElements.filter(
        (el) => branchIds.includes(el.id) || decorationAndCrossLinkIds.includes(el.id),
      ),
    );
    const workbenchEls = runtimeContext.ea.getElements();
    let newGroupId;
    let { structuralGroupIds, groupedElementIds } = getStructuralGroupsForNode(
      branchIds,
      workbenchEls,
      info.rootId,
    );
    if (structuralGroupIds.length > 0) {
      //normally there should only be one structural group, however do to a bug in earlier MinMap Builder versions,
      //some branches may have multiple structural groups for the exact same set of nodes.
      structuralGroupIds.forEach((structuralGroupId) => {
        if (getViewGroupElements(structuralGroupId).length === groupedElementIds.length) {
          removeGroupFromElements(structuralGroupId, workbenchEls);
        }
      });
    } else {
      newGroupId = runtimeContext.ea.addToGroup([...branchIds, ...decorationAndCrossLinkIds]);
    }
    await runtimeContext.addElementsToView({
      captureUpdate: "IMMEDIATELY",
    });
    if (newGroupId) {
      let selectedGroupIds = {};
      selectedGroupIds[newGroupId] = true;
      runtimeContext.ea.viewUpdateScene({
        appState: {
          selectedGroupIds,
          selectedElementIds: {},
        },
      });
    } else {
      runtimeContext.ea.viewUpdateScene({
        appState: {
          selectedGroupIds: {},
          selectedElementIds: {
            [sel.id]: true,
          },
        },
      });
    }
    runtimeContext.updateUI();
  };
  return {
    isStructuralElement,
    getViewGroupElements,
    getCommonGroupForElements,
    isMindmapGroup,
    collectCrosslinkIds,
    collectDecorationIds,
    getStructuralGroup,
    applyRecursiveGrouping,
    getStructuralGroupForNode,
    getStructuralGroupsForNode,
    removeGroupFromElements,
    getDecorationAndCrossLinkIdsForBranches,
    toggleBranchGroup,
  };
}
