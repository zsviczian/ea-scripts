/** @file branchHistory.ts
 * @overview Groups native paste history without assuming how many native captures occurred.
 */

interface BranchHistoryApi {
  isDestroyed?: boolean;
  getSceneElements: () => readonly { id: string }[];
  history: { undo: () => void };
}

/** Stops at the paste's insertion entry, before any edit preceding this operation. */
export async function undoPastedBranch(
  api: BranchHistoryApi,
  rootIds: readonly string[],
  waitForCommit: () => Promise<void>,
): Promise<number> {
  const roots = new Set(rootIds);
  let steps = 0;
  while (!api.isDestroyed && api.getSceneElements().some((e) => roots.has(e.id)) && steps < 64) {
    api.history.undo();
    steps++;
    await waitForCommit();
  }
  return steps;
}
