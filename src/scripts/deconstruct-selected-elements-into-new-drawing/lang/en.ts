/** English source-of-truth strings for Deconstruct Selected Elements Into New Drawing. */
export const en = {
  requiresNewerVersion:
    "This script requires Excalidraw 2.27.0 or newer. Please install the latest version.",
  selectElements: "You must select elements first.",
  templatesSettingDesc: "Comma-separated list of template filepaths",
  defaultFilenameSettingDesc: "The default filename to use when deconstructing elements.",
  modalTitle: "Deconstruct Elements",
  folderPath: "Folder path",
  fileName: "File name",
  selectTemplate: "Select template",
  noTemplate: "none",
  openDeconstructedImage: "Open deconstructed image",
  reuseExistingTab: "Reuse existing tab",
  reuseExistingTabDesc: "If available, open in an adjacent tab. Otherwise open in a new tab.",
  insert: "Insert",
  insertTooltip: "Insert without anchoring",
  insertAt100: "Insert @100%",
  insertAt100Tooltip: "Anchor to 100% size",
  filenameRequired: "Filename is required.",
  invalidFilenameCharacter: 'File name contains an invalid character: "{character}".',
  invalidFolderCharacter: 'Folder path contains an invalid character: "{character}".',
  invalidFilename: 'Invalid file name: "{name}".',
  invalidFolderPath: 'Invalid folder path near: "{name}".',
  somethingWentWrong: "Something went wrong while creating the deconstructed drawing.",
  deconstructionReady: "Deconstruction ready.",
} as const;

export type DeconstructTranslationKey = keyof typeof en;
