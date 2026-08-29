/**
 * @file windowTiming.ts
 * @overview Timer helpers that preserve the owning window for popout-safe scripts.
 */

/** Resolves after a delay scheduled in the supplied window realm. */
export function sleepInWindow(ownerWindow: Window, milliseconds: number): Promise<void> {
  return new Promise((resolve) => ownerWindow.setTimeout(resolve, milliseconds));
}
