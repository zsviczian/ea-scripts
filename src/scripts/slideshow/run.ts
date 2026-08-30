/**
 * @file run.ts
 * @overview Registers Slideshow's element action and routes manual invocations.
 */

import { createSlideshowTranslator } from "./lang";
import {
  registerSlideshowElementActionProvider,
  runManualSlideshowInvocation,
} from "./slideshowLauncher";
import { registerSlideshowViewContext, type SlideshowViewContext } from "./slideshowRuntime";
import type { SlideshowConfig } from "./types";

/**
 * Registers Slideshow for a view, or routes a later command/script-button invocation.
 *
 * Every view execution refreshes its runtime context and registers the element action.
 * Autostart stops after that setup; toolbar, command-palette, and hotkey executions are
 * routed to that view's active or new presentation.
 */
export async function runSlideshow(
  scriptEa: ExcalidrawAutomate,
  scriptUtils: ScriptUtils,
  config: SlideshowConfig,
): Promise<void> {
  const t = createSlideshowTranslator(scriptEa.obsidian.moment.locale());
  if (!scriptEa.verifyMinimumPluginVersion("2.27.0")) {
    new Notice(t("requiresNewerVersion"));
    return;
  }

  const targetView = scriptEa.targetView;
  if (!targetView) return;

  const context: SlideshowViewContext = {
    ea: scriptEa,
    utils: scriptUtils,
    view: targetView,
    config,
    t,
  };
  registerSlideshowViewContext(context);
  registerSlideshowElementActionProvider(context);
  await scriptEa.registerAutostart(t("autostartExplanation"));

  if (scriptUtils.executionSource !== "manual") return;

  await runManualSlideshowInvocation(context);
}
