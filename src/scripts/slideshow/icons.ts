/**
 * @file icons.ts
 * @overview Resolves Obsidian icons to cross-window-safe SVG markup.
 */

import type { AnimationDirection, AnimationEffect, AnimationTrigger, SlideshowIcons } from "./types";

export type AnimationIconChoice = AnimationEffect | AnimationDirection | AnimationTrigger;

const ANIMATION_ICON_NAMES: Record<Exclude<AnimationIconChoice, "fade-out">, string> = {
  appear: "eye",
  fade: "circle-fading-plus",
  slide: "arrow-right-to-line",
  zoom: "zoom-in",
  disappear: "eye-off",
  "slide-out": "arrow-right-from-line",
  "zoom-out": "zoom-out",
  left: "arrow-big-left-dash",
  right: "arrow-big-right-dash",
  up: "arrow-big-up-dash",
  down: "arrow-big-down-dash",
  "after-delay": "timer",
  advance: "step-forward",
};

// Owner-supplied companion to Lucide's circle-fading-plus.
const FADE_OUT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-fading-minus preview-icon"><path d="M12 2a10 10 0 0 1 7.38 16.75"/><path d="M8 12h8"/><path d="M2.5 8.875a10 10 0 0 0-.5 3"/><path d="M2.83 16a10 10 0 0 0 2.43 3.4"/><path d="M4.636 5.235a10 10 0 0 1 .891-.857"/><path d="M8.644 21.42a10 10 0 0 0 7.631-.38"/></svg>';

function iconMarkup(ea: ExcalidrawAutomate, iconName: string): string {
  return ea.obsidian.getIcon(iconName)?.outerHTML ?? "";
}

/** Resolves animation controls; entrance arrows point toward the target, exit arrows away. */
export function getAnimationEditorIcon(
  ea: ExcalidrawAutomate,
  choice: AnimationIconChoice,
  exits: boolean,
): string {
  if (choice === "fade-out") return FADE_OUT_ICON;
  const direction = exits ? choice :
    choice === "left" ? "right" : choice === "right" ? "left" :
      choice === "up" ? "down" : choice === "down" ? "up" : choice;
  return iconMarkup(ea, `lucide-${ANIMATION_ICON_NAMES[direction]}`);
}

/** Gets all SVG markup used by slideshow presentation and sidepanel controls. */
export function getSlideshowIcons(ea: ExcalidrawAutomate): SlideshowIcons {
  // The returned SVG belongs to Obsidian's main document. Serializing it first
  // lets innerHTML recreate it in a popout or sidepanel owner document.
  return {
    finish: iconMarkup(ea, "lucide-x"),
    rightArrow: iconMarkup(ea, "lucide-arrow-right"),
    leftArrow: iconMarkup(ea, "lucide-arrow-left"),
    edit: iconMarkup(ea, "lucide-pencil"),
    maximize: iconMarkup(ea, "lucide-maximize"),
    minimize: iconMarkup(ea, "lucide-minimize"),
    currentWindow: iconMarkup(ea, "lucide-app-window"),
    laserOn: iconMarkup(ea, "lucide-hand"),
    laserOff: iconMarkup(ea, "lucide-wand"),
    printer: iconMarkup(ea, "lucide-printer"),
    fileDown: iconMarkup(ea, "lucide-file-down"),
    refocus: iconMarkup(ea, "lucide-scan-eye"),
    gripVertical: iconMarkup(ea, "lucide-grip-vertical"),
    chevronUp: iconMarkup(ea, "lucide-chevron-up"),
    chevronDown: iconMarkup(ea, "lucide-chevron-down"),
    eye: iconMarkup(ea, "lucide-eye"),
    eyeOff: iconMarkup(ea, "lucide-eye-off"),
    sparkles: iconMarkup(ea, "lucide-sparkles"),
    notebookPen: iconMarkup(ea, "lucide-notebook-pen"),
    play: iconMarkup(ea, "lucide-play"),
    continuePresentation: iconMarkup(ea, "lucide-circle-play"),
    presentation: iconMarkup(ea, "lucide-presentation"),
    plus: iconMarkup(ea, "lucide-plus"),
    trash: iconMarkup(ea, "lucide-trash-2"),
    close: iconMarkup(ea, "lucide-x"),
    settings: iconMarkup(ea, "lucide-settings"),
    info: iconMarkup(ea, "info"),
    frameSlideshow: iconMarkup(ea, "lucide-frame"),
    lineSlideshow: iconMarkup(ea, "lucide-route"),
    moreHorizontal: iconMarkup(ea, "lucide-ellipsis"),
  };
}
