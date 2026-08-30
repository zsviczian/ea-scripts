import type { SlideshowTranslationKey } from "./en";

export const de = {
  requiresNewerVersion:
    "Dieses Skript benötigt eine neuere Version von Excalidraw. Installiere bitte die neueste Version.",
  noActiveView: "Öffne eine Excalidraw-Zeichnung, bevor du die Präsentation startest.",
  cannotAccessView: "Auf die aktive Excalidraw-Ansicht konnte nicht zugegriffen werden.",
} satisfies Record<SlideshowTranslationKey, string>;
