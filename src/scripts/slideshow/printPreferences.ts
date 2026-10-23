import { validPrintDimensions, type SlideshowPrintSettings } from "./printLayout";
import { parsePrintRanges } from "./printRanges";

export type PrintPreset = "configured" | "A4" | "Letter" | "16:9" | "custom";
export interface PrintPreferences extends Omit<SlideshowPrintSettings, "sourceKey" | "theme"> {
  preset: PrintPreset;
}
const PRINT_SETTING = "slideshowPrintPreferences";

/** Restores validated print preferences; source selection remains local to the drawing. */
export function loadPrintPreferences(
  ea: ExcalidrawAutomate,
  width: number,
  height: number,
): PrintPreferences {
  const defaults: PrintPreferences = {
    layout: "slides",
    visibleOnly: true,
    margin: "none",
    width,
    height,
    pageRanges: "",
    preset: "configured",
  };
  const settings = ea.getScriptSettings() as Record<string, unknown>;
  const raw = settings[PRINT_SETTING];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
  const saved = raw as Record<string, unknown>;
  if (["slides", "notes", "handout-2", "handout-3"].includes(String(saved.layout)))
    defaults.layout = saved.layout as PrintPreferences["layout"];
  if (typeof saved.visibleOnly === "boolean") defaults.visibleOnly = saved.visibleOnly;
  if (["none", "minimal", "normal"].includes(String(saved.margin)))
    defaults.margin = saved.margin as PrintPreferences["margin"];
  if (["configured", "A4", "Letter", "16:9", "custom"].includes(String(saved.preset)))
    defaults.preset = saved.preset as PrintPreset;
  if (
    typeof saved.width === "number" &&
    typeof saved.height === "number" &&
    validPrintDimensions(saved.width, saved.height)
  ) {
    defaults.width = saved.width;
    defaults.height = saved.height;
  }
  if (typeof saved.pageRanges === "string") {
    try {
      parsePrintRanges(saved.pageRanges);
      defaults.pageRanges = saved.pageRanges;
    } catch {
      /* Ignore invalid saved ranges. */
    }
  }
  return defaults;
}

/** Saves confirmed print options while preserving every other script setting. */
export async function savePrintPreferences(
  ea: ExcalidrawAutomate,
  preferences: PrintPreferences,
): Promise<void> {
  await ea.setScriptSettings({ ...ea.getScriptSettings(), [PRINT_SETTING]: preferences });
}
