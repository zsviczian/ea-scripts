/**
 * @file actions.js
 * @overview actions implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createActions(runtimeContext) {
  const performAction = async (action, event) => {
    if (!action || !runtimeContext.ea.targetView) return;
    switch (action) {
      case runtimeContext.ACTION_CALENDAR:
        await runtimeContext.openCalendarModal();
        break;
      case runtimeContext.ACTION_TOGGLE_FLOATING_EXTRAS:
        runtimeContext.toggleFloatingExtras?.();
        break;
      case runtimeContext.ACTION_REARRANGE:
        await runtimeContext.refreshMapLayout();
        break;
      case runtimeContext.ACTION_TOGGLE_GROUP:
        await runtimeContext.toggleBranchGroup();
        break;
      case runtimeContext.ACTION_HIDE:
        if (runtimeContext.editingNodeId) {
          runtimeContext.editingNodeId = null;
          runtimeContext.updateUI();
        } else if (runtimeContext.isUndocked) {
          runtimeContext.toggleDock({
            silent: true,
            forceDock: true,
            saveSetting: false,
          });
        }
        break;
      case runtimeContext.ACTION_PIN:
        await runtimeContext.togglePin();
        break;
      case runtimeContext.ACTION_TOGGLE_CHECKBOX:
        await runtimeContext.toggleCheckboxStatus();
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_TOGGLE_EMBED:
        await runtimeContext.toggleEmbedStatus();
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_TOGGLE_SUBMAP_ROOT:
        await runtimeContext.toggleSubmapRoot();
        break;
      case runtimeContext.ACTION_BOX:
        await runtimeContext.toggleBox();
        break;
      case runtimeContext.ACTION_TOGGLE_BOUNDARY:
        await runtimeContext.toggleBoundary();
        break;
      case runtimeContext.ACTION_FOLD:
        await runtimeContext.toggleFold("L0");
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_FOLD_L1:
        await runtimeContext.toggleFold("L1");
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_FOLD_ALL:
        await runtimeContext.toggleFold("ALL");
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_COPY:
        runtimeContext.copyMapAsText(false);
        break;
      case runtimeContext.ACTION_CUT:
        runtimeContext.copyMapAsText(true);
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_PASTE:
        await runtimeContext.pasteElementToMap();
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_IMPORT_OUTLINE:
        await runtimeContext.importOutline();
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_ZOOM:
        runtimeContext.zoomToFit(true);
        break;
      case runtimeContext.ACTION_FOCUS:
        runtimeContext.focusSelected();
        break;
      case runtimeContext.ACTION_SORT_ORDER:
        runtimeContext.changeNodeOrder(event?.key);
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_NAVIGATE:
        await runtimeContext.navigateMap({
          key: event?.key,
          zoom: false,
          focus: false,
        });
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_NAVIGATE_ZOOM:
        await runtimeContext.navigateMap({
          key: event?.key,
          zoom: true,
          focus: false,
        });
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_NAVIGATE_FOCUS:
        await runtimeContext.navigateMap({
          key: event?.key,
          zoom: false,
          focus: true,
        });
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_DOCK_UNDOCK:
        runtimeContext.toggleDock({
          saveSetting: true,
        });
        break;
      case runtimeContext.ACTION_EDIT:
        runtimeContext.startEditing();
        break;
      case runtimeContext.ACTION_ADD_SIBLING_AFTER:
        runtimeContext.addSibling(event, true);
        break;
      case runtimeContext.ACTION_ADD_SIBLING_BEFORE:
        runtimeContext.addSibling(event, false);
        break;
      case runtimeContext.ACTION_ADD_FOLLOW:
      case runtimeContext.ACTION_ADD_FOLLOW_FOCUS:
      case runtimeContext.ACTION_ADD_FOLLOW_ZOOM:
        if (!runtimeContext.inputEl.value) return;
        await runtimeContext.addNode(
          runtimeContext.inputEl.value,
          true,
          false,
          null,
          null,
          null,
          runtimeContext.ontologyEl.value,
        );
        runtimeContext.inputEl.value = "";
        runtimeContext.ontologyEl.value = "";
        runtimeContext.updateUI();
        if (action === runtimeContext.ACTION_ADD_FOLLOW_FOCUS) runtimeContext.focusSelected();
        if (action === runtimeContext.ACTION_ADD_FOLLOW_ZOOM) runtimeContext.zoomToFit();
        break;
      case runtimeContext.ACTION_ADD:
        const currentSel =
          runtimeContext.getMindmapNodeFromSelection() ??
          runtimeContext.ea.getViewSelectedElement();
        if (
          runtimeContext.editingNodeId &&
          currentSel &&
          (currentSel.id === runtimeContext.editingNodeId ||
            currentSel.containerId === runtimeContext.editingNodeId)
        ) {
          await runtimeContext.commitEdit();
        } else {
          if (runtimeContext.editingNodeId) {
            runtimeContext.editingNodeId = null;
          }
          if (runtimeContext.inputEl.value) {
            await runtimeContext.addNode(
              runtimeContext.inputEl.value,
              false,
              false,
              null,
              null,
              null,
              runtimeContext.ontologyEl.value,
            );
            runtimeContext.inputEl.value = "";
            runtimeContext.ontologyEl.value = "";
          } else {
            const sel = runtimeContext.getMindmapNodeFromSelection();
            const allElements = runtimeContext.ea.getViewElements();
            let handledRecent = false;
            if (runtimeContext.mostRecentlyAddedNodeID) {
              const mostRecentNode = runtimeContext.getMostRecentlyAddedNode();
              if (mostRecentNode && sel) {
                const selParent = runtimeContext.getParentNode(sel.id, allElements);
                const recentParent = runtimeContext.getParentNode(mostRecentNode.id, allElements);
                const isSameOrSibling =
                  sel.id === mostRecentNode.id ||
                  (selParent && recentParent && selParent.id === recentParent.id);
                if (!isSameOrSibling) {
                  runtimeContext.selectNodeInView(mostRecentNode);
                  handledRecent = true;
                }
              } else {
                runtimeContext.mostRecentlyAddedNodeID = null;
              }
            }
            if (!handledRecent && sel) {
              const parent = runtimeContext.getParentNode(sel.id, allElements);
              const siblings = parent
                ? runtimeContext.getChildrenNodes(parent.id, allElements)
                : [];
              if (siblings.length > 1) {
                siblings.sort(
                  (a, b) => runtimeContext.getMindmapOrder(a) - runtimeContext.getMindmapOrder(b),
                );
                const idx = siblings.findIndex((s) => s.id === sel.id);
                const nextIdx = (idx + 1) % siblings.length;
                runtimeContext.selectNodeInView(siblings[nextIdx]);
              } else {
                const children = runtimeContext.getChildrenNodes(sel.id, allElements);
                if (children.length > 0) {
                  children.sort(
                    (a, b) => runtimeContext.getMindmapOrder(a) - runtimeContext.getMindmapOrder(b),
                  );
                  runtimeContext.selectNodeInView(children[0]);
                } else if (parent) {
                  runtimeContext.selectNodeInView(parent);
                }
              }
            }
          }
        }
        runtimeContext.updateUI();
        break;
      case runtimeContext.ACTION_UNDO:
        if (runtimeContext.ea.targetView) {
          const currentVer = ExcalidrawLib.getSceneVersion(runtimeContext.api().getSceneElements());
          if (
            runtimeContext.lastCommittedTransaction &&
            currentVer === runtimeContext.lastCommittedTransaction.version &&
            runtimeContext.lastCommittedTransaction.steps > 0
          ) {
            for (let i = 0; i <= runtimeContext.lastCommittedTransaction.steps; i++) {
              runtimeContext.api().history.undo();
            }
            const afterUndoVer = ExcalidrawLib.getSceneVersion(
              runtimeContext.api().getSceneElements(),
            );
            runtimeContext.redoAvailable = {
              steps: runtimeContext.lastCommittedTransaction.steps,
              version: afterUndoVer,
            };
            runtimeContext.lastCommittedTransaction = null;
          } else {
            runtimeContext.api().history.undo();
            runtimeContext.lastCommittedTransaction = null;
            runtimeContext.redoAvailable = null;
          }
        }
        break;
      case runtimeContext.ACTION_REDO_Z:
      case runtimeContext.ACTION_REDO_Y:
        if (runtimeContext.ea.targetView) {
          const currentVer = ExcalidrawLib.getSceneVersion(runtimeContext.api().getSceneElements());
          if (
            runtimeContext.redoAvailable &&
            currentVer === runtimeContext.redoAvailable.version &&
            runtimeContext.redoAvailable.steps > 0
          ) {
            for (let i = 0; i <= runtimeContext.redoAvailable.steps; i++) {
              runtimeContext.api().history.redo();
            }
            const afterRedoVer = ExcalidrawLib.getSceneVersion(
              runtimeContext.api().getSceneElements(),
            );
            runtimeContext.lastCommittedTransaction = {
              steps: runtimeContext.redoAvailable.steps,
              version: afterRedoVer,
            };
            runtimeContext.redoAvailable = null;
          } else {
            runtimeContext.api().history.redo();
            runtimeContext.lastCommittedTransaction = null;
            runtimeContext.redoAvailable = null;
          }
        }
        break;
    }
  };
  return { performAction };
}
