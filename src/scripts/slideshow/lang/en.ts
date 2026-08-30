export const en = {
  requiresNewerVersion:
    "This script requires a newer version of Excalidraw. Please install the latest version.",
  noActiveView: "Open an Excalidraw drawing before starting the slideshow.",
  cannotAccessView: "Could not access the active Excalidraw view.",
} as const;

export type SlideshowTranslationKey = keyof typeof en;
