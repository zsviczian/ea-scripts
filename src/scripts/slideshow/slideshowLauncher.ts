/**
 * @file slideshowLauncher.ts
 * @overview Shared presentation and sidepanel launch helpers used by the script bootstrap and toolbar.
 */

import { getSlideshowIcons } from "./icons";
import type { SlideshowTranslator } from "./lang";
import {
  getAlternatePresentationType,
  resolvePresentationSetup,
  resolveSlideDeckChoices,
} from "./presentationPath";
import { SlideshowController } from "./SlideshowController";
import { SlideshowSidepanel } from "./SlideshowSidepanel";
import type { PresentationPathType, SlideshowConfig } from "./types";

export const SLIDESHOW_DOUBLE_INVOCATION_MS = 650;
export const SLIDESHOW_SINGLE_START_DELAY_MS = 700;

interface PresentationLaunchOptions {
  initialSlide?: number;
  startFullscreen?: boolean;
  presentationType?: PresentationPathType;
}

function resolveLaunchModifiers(view: ScriptExcalidrawView): { startFullscreen: boolean } {
  const ctrlKey = view.modifierKeyDown.ctrlKey || view.modifierKeyDown.metaKey;
  return { startFullscreen: !(view.modifierKeyDown.altKey || ctrlKey) };
}

/** Returns whether a second script invocation should be interpreted as a double click. */
export function isDoubleSlideshowInvocation(
  session: SlideshowSessionState | undefined,
  scriptPath: string,
  timestamp: number,
): boolean {
  return Boolean(
    session &&
      session.script === scriptPath &&
      timestamp - session.timestamp >= 0 &&
      timestamp - session.timestamp < SLIDESHOW_DOUBLE_INVOCATION_MS,
  );
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
  const choices = resolveSlideDeckChoices(scriptEa);
  const setup = resolvePresentationSetup(scriptEa, api, t, launch.presentationType);
  if (!setup || setup.slides.length === 0) return;
  const alternatePresentationType = getAlternatePresentationType(choices, setup.pathType);
  // Starting from a sidepanel leaves the sidepanel leaf active. Return keyboard focus to the
  // drawing before the controller installs its shortcuts so navigation works immediately.
  app.workspace.setActiveLeaf(targetView.leaf, { focus: true });
  const modifierDefaults = resolveLaunchModifiers(targetView);
  const controller = new SlideshowController({
    ea: scriptEa,
    api,
    hostView: targetView,
    statusBarElement: targetView.ownerDocument.querySelector<HTMLElement>("div.status-bar"),
    setup,
    alternatePresentationType,
    config,
    icons: getSlideshowIcons(scriptEa),
    initialSlide: launch.initialSlide ?? 0,
    startFullscreen: launch.startFullscreen ?? modifierDefaults.startFullscreen,
    t,
    openSidepanel: () => openSlideshowSidepanel(scriptEa, scriptUtils, config, t),
    switchPresentation: (presentationType, startFullscreen) =>
      startSlideshowPresentation(scriptEa, scriptUtils, config, t, {
        presentationType,
        startFullscreen,
      }),
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
    startPresentation: (presentationType) =>
      startSlideshowPresentation(scriptEa, scriptUtils, config, t, { presentationType }),
  });
  sidepanel.initialize();
  tab.open();
}
