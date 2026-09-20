/** @file run.ts @overview Opens or restores the persistent Excalidraw Canvas Chat sidepanel. */
import { CanvasChatSidepanel } from "./CanvasChatSidepanel";
import { createCanvasChatTranslator } from "./lang";

/** Opens Canvas Chat while reusing an already-restored persistent tab when present. */
export async function runCanvasChat(scriptEa: ExcalidrawAutomate, scriptUtils: ScriptUtils): Promise<void> {
  const t = createCanvasChatTranslator(scriptEa.obsidian.moment.locale());
  if (!scriptEa.verifyMinimumPluginVersion("2.27.0")) {
    new scriptEa.obsidian.Notice(t("requiresNewerVersion"));
    return;
  }
  const existing = scriptEa.checkForActiveSidepanelTabForScript();
  if (existing) {
    const hostEa = existing.getHostEA();
    if (hostEa !== scriptEa && scriptEa.targetView) hostEa.setView(scriptEa.targetView);
    existing.open();
    existing.focus();
    return;
  }
  const reveal = scriptUtils.executionSource === "manual";
  const tab = await scriptEa.createSidepanelTab(t("sidepanelTitle"), true, reveal);
  if (!tab) return;
  new CanvasChatSidepanel({ ea: scriptEa, tab, t }).initialize();
  if (reveal) tab.open();
}
