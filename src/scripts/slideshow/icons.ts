/**
 * @file icons.ts
 * @overview Resolves Obsidian icons to cross-window-safe SVG markup.
 */

import type { SlideshowIcons } from "./types";

function iconMarkup(ea: ExcalidrawAutomate, iconName: string): string {
  return ea.obsidian.getIcon(iconName)?.outerHTML ?? "";
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
    laserOn: iconMarkup(ea, "lucide-hand"),
    laserOff: iconMarkup(ea, "lucide-wand"),
    printer: iconMarkup(ea, "lucide-printer"),
    refocus: iconMarkup(ea, "lucide-scan-eye"),
    gripVertical: iconMarkup(ea, "lucide-grip-vertical"),
    chevronUp: iconMarkup(ea, "lucide-chevron-up"),
    chevronDown: iconMarkup(ea, "lucide-chevron-down"),
    eye: iconMarkup(ea, "lucide-eye"),
    eyeOff: iconMarkup(ea, "lucide-eye-off"),
    sparkles: iconMarkup(ea, "lucide-sparkles"),
    notebookPen: iconMarkup(ea, "lucide-notebook-pen"),
    play: iconMarkup(ea, "lucide-play"),
    presentation: iconMarkup(ea, "lucide-presentation"),
    refresh: iconMarkup(ea, "lucide-refresh-cw"),
    plus: iconMarkup(ea, "lucide-plus"),
    trash: iconMarkup(ea, "lucide-trash-2"),
    close: iconMarkup(ea, "lucide-x"),
    settings: iconMarkup(ea, "lucide-settings"),
    switchPresentation: iconMarkup(ea, "lucide-repeat-2"),
  };
}
