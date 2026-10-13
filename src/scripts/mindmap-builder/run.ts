/**
 * @file run.ts
 * @overview Version validation and reuse of a resident Mindmap Builder sidepanel.
 */
import { createMindmapTranslator, type MindmapTranslator } from "./lang";
import { initializeMindmapBuilder } from "./runtime.js";

const minimumPluginVersion = "2.23.4";

/** Resolves the current invocation's locale and keyboard modifier label. */
function getTranslator(ea: ExcalidrawAutomate): MindmapTranslator {
  return createMindmapTranslator(
    localStorage.getItem("language") ?? "en",
    ea.DEVICE.isMacOS || ea.DEVICE.isIOS,
  );
}

/** Reuses the existing host EA before allocating the mindmap implementation's state. */
export async function runMindmapBuilder(
  ea: ExcalidrawAutomate,
  utils: ScriptUtils,
  version: string,
): Promise<void> {
  const t = getTranslator(ea);
  if (!ea.verifyMinimumPluginVersion?.(minimumPluginVersion)) {
    new ea.obsidian.Notice(t("requiresNewerVersion", { version: minimumPluginVersion }));
    return;
  }

  ea.skipSidepanelScriptRestore();
  const existingTab = ea.checkForActiveSidepanelTabForScript();
  const hostEA = existingTab?.getHostEA();
  if (existingTab && hostEA && hostEA !== ea) {
    // Script-owned activation flag consumed by the legacy sidepanel's onFocus hook.
    const mindmapHost = hostEA as ExcalidrawAutomate & { activateMindmap?: boolean };
    mindmapHost.activateMindmap = true;
    hostEA.setView(ea.targetView);
    existingTab.open(false);
    return;
  }

  await initializeMindmapBuilder(ea, utils, version, t);
}

/** Reports bootstrap failures from the template's synchronous IIFE entrypoint. */
export function reportMindmapLaunchError(ea: ExcalidrawAutomate, error: unknown): void {
  console.error("Mindmap Builder could not start", error);
  const t = getTranslator(ea);
  new ea.obsidian.Notice(t("launchFailed"));
}
