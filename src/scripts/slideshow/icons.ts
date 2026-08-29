/**
 * @file icons.ts
 * @overview Resolves Obsidian icons to cross-window-safe SVG markup.
 */

import type { SlideshowIcons } from "./types";

function iconMarkup(ea: ExcalidrawAutomate, iconName: string): string {
  return ea.obsidian.getIcon(iconName)?.outerHTML ?? "";
}

/** Gets all SVG markup used by the slideshow controls. */
export function getSlideshowIcons(ea: ExcalidrawAutomate): SlideshowIcons {
  // The returned SVG belongs to Obsidian's main document. Serializing it first
  // lets innerHTML recreate it in a popout's owning document.
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
  };
}
