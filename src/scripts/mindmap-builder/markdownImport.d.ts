/** Narrow entry boundary; JavaScript implementation bodies remain outside TypeScript checking. */
export function createMarkdownImport(context: object): {
  importOutline: () => Promise<void>;
  importTextToMap: (text: string) => Promise<void>;
  pasteListToMap: (text?: string | null) => Promise<void>;
  pasteElementToMap: () => Promise<void>;
  cancelBranchPaste: () => void;
  disposeBranchPaste: () => void;
  isBranchPasteBusy: () => boolean;
  watchPasteMetadata: () => void;
};
