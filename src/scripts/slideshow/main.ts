/**
 * @file main.ts
 * @overview Delayed single-click presentation launcher and double-click slideshow sidepanel entrypoint.
 *
 * Build output: build/slideshow/slideshow.md
 */

import { createSlideshowTranslator } from "./lang";
import {
  isDoubleSlideshowInvocation,
  openSlideshowSidepanel,
  SLIDESHOW_SINGLE_START_DELAY_MS,
  startSlideshowPresentation,
} from "./slideshowLauncher";
import type { SlideshowConfig } from "./types";

const CONFIG: SlideshowConfig = {
  transitionStepCount: 100,
  transitionDelay: 1000,
  frameSleep: 1,
  editZoomOut: 0.7,
  fadeLevel: 0.1,
  printSlideWidth: 1920,
  printSlideHeight: 1080,
  maxZoom: 30,
};

/** Creates a delayed slideshow start or opens the sorter on a double invocation. */
export async function runSlideshow(
  scriptEa: ExcalidrawAutomate,
  scriptUtils: ScriptUtils,
): Promise<void> {
  const t = createSlideshowTranslator(scriptEa.obsidian.moment.locale());
  if (!scriptEa.verifyMinimumPluginVersion?.("2.8.0")) {
    new Notice(t("requiresNewerVersion"));
    return;
  }

  const targetView = scriptEa.targetView;
  if (!targetView) {
    new Notice(t("noActiveView"));
    return;
  }
  const timestamp = Date.now();
  const session = window.ExcalidrawSlideshow;
  const isDoubleInvocation = isDoubleSlideshowInvocation(
    session,
    scriptUtils.scriptFile.path,
    timestamp,
  );

  if (isDoubleInvocation) {
    if (window.ExcalidrawSlideshowStartTimer) {
      window.clearTimeout(window.ExcalidrawSlideshowStartTimer);
      delete window.ExcalidrawSlideshowStartTimer;
    }
    window.ExcalidrawSlideshow!.timestamp = timestamp;
    await openSlideshowSidepanel(scriptEa, scriptUtils, CONFIG, t);
    return;
  }

  if (window.ExcalidrawSlideshowStartTimer) {
    window.clearTimeout(window.ExcalidrawSlideshowStartTimer);
    delete window.ExcalidrawSlideshowStartTimer;
  }
  window.ExcalidrawSlideshow ??= {
    script: scriptUtils.scriptFile.path,
    timestamp,
    slide: {},
  };
  window.ExcalidrawSlideshow.script = scriptUtils.scriptFile.path;
  window.ExcalidrawSlideshow.timestamp = timestamp;

  const savedSlide = window.ExcalidrawSlideshow.slide[targetView.file.path];
  const shouldStartWithLastSlide =
    targetView.modifierKeyDown.shiftKey && typeof savedSlide === "number";
  const ctrlKey = targetView.modifierKeyDown.ctrlKey || targetView.modifierKeyDown.metaKey;
  const startFullscreen = !(targetView.modifierKeyDown.altKey || ctrlKey);
  window.ExcalidrawSlideshow.slide[targetView.file.path] = 0;
  window.ExcalidrawSlideshowStartTimer = window.setTimeout(() => {
    delete window.ExcalidrawSlideshowStartTimer;
    void startSlideshowPresentation(scriptEa, scriptUtils, CONFIG, t, {
      initialSlide: shouldStartWithLastSlide ? savedSlide : 0,
      startFullscreen,
    });
  }, SLIDESHOW_SINGLE_START_DELAY_MS);
}

void runSlideshow(ea, utils);
