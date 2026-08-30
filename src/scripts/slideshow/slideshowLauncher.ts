/**
 * @file slideshowLauncher.ts
 * @overview Shared presentation and sidepanel launch helpers used by the script bootstrap and toolbar.
 */

import { getSlideshowIcons } from "./icons";
import type { SlideshowTranslator } from "./lang";
import { resolvePresentationSetup } from "./presentationPath";
import { SlideshowController } from "./SlideshowController";
import { SlideshowSidepanel } from "./SlideshowSidepanel";
import type { SlideshowConfig } from "./types";

interface PresentationLaunchOptions {
  initialSlide?: number;
  startFullscreen?: boolean;
}

function resolveLaunchModifiers(view: ScriptExcalidrawView): { startFullscreen: boolean } {
  const ctrlKey = view.modifierKeyDown.ctrlKey || view.modifierKeyDown.metaKey;
  return { startFullscreen: !(view.modifierKeyDown.altKey || ctrlKey) };
}

/** Starts a presentation immediately using the current canonical visible deck. */
export async function startSlideshowPresentation(
  scriptEa: ExcalidrawAutomate,
  scriptUtils: ScriptUtils,
  config: SlideshowConfig,
  t: SlideshowTranslator,
  launch: PresentationLaunchOptions = {},
): Promise<void> {
  const targetView = scriptEa.targetView;
  if (!targetView) {
    new Notice(t("noActiveView"));
    return;
  }
  scriptEa.setView(targetView);
  if (targetView.isDirty()) await targetView.forceSave(true);
  const api = scriptEa.getExcalidrawAPI();
  if (!api) {
    new Notice(t("cannotAccessView"));
    return;
  }

  window.removePresentationEventHandlers?.();
  const setup = resolvePresentationSetup(scriptEa, api, t);
  if (!setup || setup.slides.length === 0) return;
  const modifierDefaults = resolveLaunchModifiers(targetView);
  const controller = new SlideshowController({
    ea: scriptEa,
    api,
    hostView: targetView,
    statusBarElement: targetView.ownerDocument.querySelector<HTMLElement>("div.status-bar"),
    setup,
    config,
    icons: getSlideshowIcons(scriptEa),
    initialSlide: launch.initialSlide ?? 0,
    startFullscreen: launch.startFullscreen ?? modifierDefaults.startFullscreen,
    t,
    openSidepanel: () => openSlideshowSidepanel(scriptEa, scriptUtils, config, t),
  });
  await controller.start();
}

/** Opens/focuses the single slideshow sidepanel and binds it to the active drawing. */
export async function openSlideshowSidepanel(
  scriptEa: ExcalidrawAutomate,
  scriptUtils: ScriptUtils,
  config: SlideshowConfig,
  t: SlideshowTranslator,
): Promise<void> {
  const existing = scriptEa.checkForActiveSidepanelTabForScript();
  if (existing) {
    if (scriptEa.targetView) existing.onFocus(scriptEa.targetView);
    existing.open();
    return;
  }

  const tab = await scriptEa.createSidepanelTab(t("sidepanelTitle"), false, true);
  if (!tab) return;
  const sidepanel = new SlideshowSidepanel({
    ea: scriptEa,
    tab,
    t,
    icons: getSlideshowIcons(scriptEa),
    config,
    startPresentation: () => startSlideshowPresentation(scriptEa, scriptUtils, config, t),
  });
  sidepanel.initialize();
  tab.open();
}
