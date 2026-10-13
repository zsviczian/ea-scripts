import type { BranchClipboard, BranchElement } from "./branchClipboard";

/** Narrow boundary for the invocation-owned JavaScript subsystem. */
export function createBranchPaste(context: object): {
  pasteBranch: (payload: BranchClipboard, parent?: BranchElement | null) => Promise<boolean>;
  cancelBranchPaste: () => void;
  disposeBranchPaste: () => void;
  watchPasteMetadata: () => void;
  isBranchPasteBusy: () => boolean;
};
