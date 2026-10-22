import { sleepInWindow } from "../../sharedUtils/windowTiming";
import type { SlideshowViewContext } from "./slideshowRuntime";

/** Waits for layout to settle and for Excalidraw's ResizeObserver state to match its DOM. */
export async function waitForPresentationViewport(
  view: SlideshowViewContext["view"],
  api: ExcalidrawAPI,
): Promise<void> {
  const container = view.excalidrawContainer ?? view.contentEl;
  let previous = "";
  let stableSamples = 0;
  // Dock animations and React's resize publication are separate asynchronous steps.
  // Require 150 ms of matching samples, with a bounded wait for detached/closing views.
  for (let sample = 0; sample < 40; sample += 1) {
    await sleepInWindow(view.ownerWindow, 50);
    const { width, height } = container.getBoundingClientRect();
    const state = api.getAppState();
    const size = `${width}:${height}`;
    const matches =
      width > 0 &&
      height > 0 &&
      Math.abs(width - state.width) <= 2 &&
      Math.abs(height - state.height) <= 2;
    stableSamples = matches && size === previous ? stableSamples + 1 : 0;
    if (stableSamples >= 3) return;
    previous = size;
  }
}
