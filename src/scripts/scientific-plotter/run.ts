/** Opens or restores one persistent scientific plotter tab. */
import { createPlotTranslator } from "./lang";
import { PlotterSidepanel } from "./PlotterSidepanel";

/** Reuses an existing panel and defers restored view-bound actions until focus supplies a drawing. */
export async function runPlotter(ea: ExcalidrawAutomate, utils: ScriptUtils): Promise<void> {
  const t = createPlotTranslator(ea.obsidian.moment.locale());
  if (!ea.verifyMinimumPluginVersion("2.27.0")) {
    new ea.obsidian.Notice(t("requiresVersion"));
    return;
  }
  const existing = ea.checkForActiveSidepanelTabForScript();
  if (existing) {
    existing.open();
    existing.focus();
    return;
  }
  const tab = await ea.createSidepanelTab(t("title"), true, utils.executionSource === "manual");
  if (tab) new PlotterSidepanel(ea, tab, t).initialize();
}
