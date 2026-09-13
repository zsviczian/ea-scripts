/**
 * @file slideshowQuickGuide.ts
 * @overview Script-button shortcuts and a concise overview of slideshow authoring features.
 */

import type { SlideshowTranslator } from "./lang";

const SLIDESHOW_VIDEO_URL = "https://youtu.be/7DDY8rRDzdU";
const SLIDESHOW_VIDEO_THUMBNAIL_URL =
  "https://img.youtube.com/vi/7DDY8rRDzdU/maxresdefault.jpg";
const SLIDESHOW_COURSE_THUMBNAIL_URL =
  "https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/master/images/logo-slideshow-v4.png";
const SLIDESHOW_COURSE_URL = "https://community.sketch-your-mind.com/slideshow";

/** Opens the slideshow quick guide in an Obsidian modal. */
export function openSlideshowQuickGuideModal(
  ea: ExcalidrawAutomate,
  t: SlideshowTranslator,
): void {
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

  modal.contentEl.createEl("h3", { text: t("quickGuideLearnMoreTitle") });

  const videoLink = modal.contentEl.createEl("a");
  videoLink.href = SLIDESHOW_VIDEO_URL;
  videoLink.target = "_blank";
  videoLink.rel = "noopener noreferrer";
  videoLink.style.display = "inline-flex";
  videoLink.style.alignItems = "center";
  videoLink.style.gap = "10px";
  videoLink.style.marginBottom = "8px";

  const videoThumbnail = videoLink.createEl("img");
  videoThumbnail.src = SLIDESHOW_VIDEO_THUMBNAIL_URL;
  videoThumbnail.alt = t("quickGuideVideoThumbnailAlt");
  videoThumbnail.width = 112;
  videoThumbnail.style.width = "112px";
  videoThumbnail.style.height = "63px";
  videoThumbnail.style.objectFit = "cover";
  videoThumbnail.style.borderRadius = "6px";
  videoThumbnail.style.flex = "0 0 auto";
  videoLink.createSpan({ text: t("quickGuideVideo") });

  modal.contentEl.createEl("br");

  const courseLink = modal.contentEl.createEl("a");
  courseLink.href = SLIDESHOW_COURSE_URL;
  courseLink.target = "_blank";
  courseLink.rel = "noopener noreferrer";
  courseLink.style.display = "inline-flex";
  courseLink.style.alignItems = "center";
  courseLink.style.gap = "10px";

  const courseThumbnail = courseLink.createEl("img");
  courseThumbnail.src = SLIDESHOW_COURSE_THUMBNAIL_URL;
  courseThumbnail.alt = t("quickGuideCourse");
  courseThumbnail.width = 112;
  courseThumbnail.style.width = "112px";
  courseThumbnail.style.objectFit = "cover";
  courseThumbnail.style.borderRadius = "6px";
  courseThumbnail.style.flex = "0 0 auto";
  courseLink.createSpan({ text: t("quickGuideCourse") });

  modal.open();
}
