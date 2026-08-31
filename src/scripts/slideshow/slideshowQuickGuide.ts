/**
 * @file slideshowQuickGuide.ts
 * @overview Script-button shortcuts and a concise overview of slideshow authoring features.
 */

import type { SlideshowTranslator } from "./lang";

/** Opens the slideshow quick guide in an Obsidian modal. */
export function openSlideshowQuickGuideModal(ea: ExcalidrawAutomate, t: SlideshowTranslator): void {
  const modal = new ea.obsidian.Modal(app);
  modal.titleEl.setText(t("quickGuideTitle"));

  modal.contentEl.createEl("h3", { text: t("quickGuideShortcutsTitle") });
  const shortcuts = modal.contentEl.createEl("ul");
  for (const key of [
    "quickGuideClick",
    "quickGuideWindowed",
    "quickGuideEditor",
    "quickGuideResumeFullscreen",
    "quickGuideResumeWindowed",
  ] as const) {
    shortcuts.createEl("li", { text: t(key) });
  }

  modal.contentEl.createEl("h3", { text: t("quickGuideAuthoringTitle") });
  for (const key of [
    "quickGuideFrameSlides",
    "quickGuideLineSlides",
    "quickGuideMarkerFrames",
    "quickGuideAnimations",
    "quickGuideNotes",
  ] as const) {
    modal.contentEl.createEl("p", { text: t(key) });
  }

  modal.open();
}
