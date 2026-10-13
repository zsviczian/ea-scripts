/**
 * @file transactions.js
 * @overview EA workbench commits and undo transaction accounting.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createTransactions(runtimeContext) {
  // addElementsToView with different defaults compared to EA
  const addElementsToView = async ({
    repositionToCursor = false,
    save = false,
    newElementsOnTop = true,
    shouldRestoreElements = true,
    captureUpdate = "IMMEDIATELY",
  } = {}) => {
    if (!runtimeContext.isViewSet()) return;
    // Track transaction steps for Undo/Redo
    if (["EVENTUALLY", "IMMEDIATELY"].includes(captureUpdate)) {
      runtimeContext.currentTransactionAccumulator++;
    }
    await runtimeContext.ea.addElementsToView(
      repositionToCursor,
      save,
      newElementsOnTop,
      shouldRestoreElements,
      captureUpdate,
    );
    const fileIds = new Set(
      runtimeContext.ea
        .getElements()
        .filter((el) => el.fileId && !el.isDeleted)
        .map((el) => el.fileId),
    );
    runtimeContext.ea.clear();
    // Commit transaction logic
    if (captureUpdate === "IMMEDIATELY") {
      // We only record the undo checkpoint when a visual commit happens
      const currentSceneVersion = ExcalidrawLib.getSceneVersion(
        runtimeContext.api().getSceneElements(),
      );
      runtimeContext.lastCommittedTransaction = {
        steps: runtimeContext.currentTransactionAccumulator,
        version: currentSceneVersion,
      };
      // Reset accumulator and clear redo availability since we pushed a new action
      runtimeContext.currentTransactionAccumulator = 0;
      runtimeContext.redoAvailable = null;
    }
    if (fileIds.size === 0) return;
    const checker = () => {
      const loadedFiles = runtimeContext.api().getFiles();
      const loadedKeys = Object.keys(loadedFiles).filter((f) => loadedFiles[f].dataURL);
      for (const fileId of fileIds) {
        if (!loadedKeys.find((f) => f.id === fileId)) return false;
      }
      return true;
    };
    let watchdog = 0;
    while (!checker() && watchdog++ < 20) {
      await sleep(15);
    }
  };
  return { addElementsToView };
}
