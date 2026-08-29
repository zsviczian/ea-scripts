/**
 * @file main.ts
 * @overview Converts an Excalidraw drawing into a line- or frame-driven slideshow.
 *
 * Build output: build/slideshow/slideshow.md
 */

/* eslint-disable complexity, max-lines-per-function -- Startup order mirrors the published Slideshow.md scheduler. */

import { getSlideshowIcons } from "./icons";
import { resolvePresentationSetup } from "./presentationPath";
import { SlideshowController } from "./SlideshowController";

const TRANSITION_STEP_COUNT = 100;
const TRANSITION_DELAY = 1000;
const FRAME_SLEEP = 1;
const EDIT_ZOOMOUT = 0.7;
const FADE_LEVEL = 0.1;
const PRINT_SLIDE_WIDTH = 1920;
const PRINT_SLIDE_HEIGHT = 1080;
const MAX_ZOOM = 30;

/** Creates and schedules a slideshow for the current Excalidraw view. */
export async function runSlideshow(
  scriptEa: ExcalidrawAutomate,
  scriptUtils: ScriptUtils,
): Promise<void> {
  if (!scriptEa.verifyMinimumPluginVersion?.("2.8.0")) {
    new Notice(
      "This script requires a newer version of Excalidraw. Please install the latest version.",
    );
    return;
  }

  const targetView = scriptEa.targetView;
  if (!targetView) {
    new Notice("Open an Excalidraw drawing before starting the slideshow.");
    return;
  }
  if (targetView.isDirty()) {
    void targetView.forceSave(true);
  }

  const api = scriptEa.getExcalidrawAPI();
  if (!api) {
    new Notice("Could not access the active Excalidraw view.");
    return;
  }
  const ctrlKey = targetView.modifierKeyDown.ctrlKey || targetView.modifierKeyDown.metaKey;
  const startFullscreen = !(targetView.modifierKeyDown.altKey || ctrlKey);
  const savedSlide = window.ExcalidrawSlideshow?.slide[targetView.file.path];
  const shouldStartWithLastSlide =
    targetView.modifierKeyDown.shiftKey &&
    window.ExcalidrawSlideshow?.script === scriptUtils.scriptFile.path &&
    typeof savedSlide === "number";

  window.removePresentationEventHandlers?.();
  const setup = resolvePresentationSetup(scriptEa, api);
  if (!setup) {
    return;
  }

  const controller = new SlideshowController({
    ea: scriptEa,
    api,
    hostView: targetView,
    statusBarElement: document.querySelector<HTMLElement>("div.status-bar"),
    setup,
    config: {
      transitionStepCount: TRANSITION_STEP_COUNT,
      transitionDelay: TRANSITION_DELAY,
      frameSleep: FRAME_SLEEP,
      editZoomOut: EDIT_ZOOMOUT,
      fadeLevel: FADE_LEVEL,
      printSlideWidth: PRINT_SLIDE_WIDTH,
      printSlideHeight: PRINT_SLIDE_HEIGHT,
      maxZoom: MAX_ZOOM,
    },
    icons: getSlideshowIcons(scriptEa),
    initialSlide: shouldStartWithLastSlide ? savedSlide : 0,
    startFullscreen,
  });

  const timestamp = Date.now();
  if (
    window.ExcalidrawSlideshow?.script === scriptUtils.scriptFile.path &&
    timestamp - window.ExcalidrawSlideshow.timestamp < 400
  ) {
    if (window.ExcalidrawSlideshowStartTimer) {
      window.clearTimeout(window.ExcalidrawSlideshowStartTimer);
      delete window.ExcalidrawSlideshowStartTimer;
    }
    await controller.start();
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
  window.ExcalidrawSlideshow.timestamp = timestamp;
  window.ExcalidrawSlideshow.slide[targetView.file.path] = 0;
  window.ExcalidrawSlideshowStartTimer = window.setTimeout(() => void controller.start(), 500);
}

void runSlideshow(ea, utils);
