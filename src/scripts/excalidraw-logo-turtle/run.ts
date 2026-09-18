/**
 * @file run.ts
 * @overview Opens or restores the persistent Excalidraw Logo Turtle sidepanel.
 */

import { createLogoTurtleTranslator } from "./lang";
import { LogoTurtleSidepanel } from "./LogoTurtleSidepanel";

/** Opens the Logo Turtle panel while avoiding duplicate persistent tabs. */
export async function runLogoTurtle(scriptEa: ExcalidrawAutomate, scriptUtils: ScriptUtils): Promise<void> {
  const t = createLogoTurtleTranslator(scriptEa.obsidian.moment.locale());
  if (!scriptEa.verifyMinimumPluginVersion("2.27.0")) {
    new Notice(t("requiresNewerVersion"));
    return;
  }
  const existing = scriptEa.checkForActiveSidepanelTabForScript();
  if (existing) {
    const hostEa = existing.getHostEA();
    if (hostEa !== scriptEa) {
      if (scriptEa.targetView) hostEa.setView(scriptEa.targetView);
      existing.open();
      existing.focus();
      return;
    }
    existing.open();
    return;
  }
  const reveal = scriptUtils.executionSource === "manual";
  const tab = await scriptEa.createSidepanelTab(t("sidepanelTitle"), true, reveal);
  if (!tab) return;
  const sidepanel = new LogoTurtleSidepanel({ ea: scriptEa, tab, t });
  sidepanel.initialize();
  if (reveal) tab.open();
}
