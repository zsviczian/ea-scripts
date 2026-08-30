import { describe, expect, it } from "vitest";

import {
  chooseClosestNativeWindow,
  chooseDefaultDisplayTargets,
  type SlideshowDisplay,
} from "../desktopDisplays";
import { getPresenterKeyboardAction } from "../PresenterViewController";
import { buildFrameSlideDeck, type FrameDeckSlide } from "../SlideDeck";
import { getHiddenBuildElementIds } from "../SlidePreviewService";
import { buildPresentationState } from "../presentationState";
import {
  loadSlideshowLaunchPreferences,
  saveSlideshowLaunchPreferences,
} from "../slideshowSettings";
import type { AnimationStep } from "../types";

function frame(
  id: string,
  name: string,
  order: number,
  excluded = false,
  steps: readonly AnimationStep[] = [],
): {
  id: string;
  type: "frame";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  opacity: number;
  customData: Record<string, unknown>;
} {
  return {
    id,
    type: "frame",
    name,
    x: order * 100,
    y: 0,
    width: 100,
    height: 60,
    angle: 0,
    opacity: 100,
    customData: {
      slideshow: {
        schemaVersion: 2,
        kind: "frame",
        order,
        ...(excluded ? { excluded: true } : {}),
        ...(steps.length > 0 ? { animation: { steps } } : {}),
      },
    },
  };
}

function element(id: string, x: number): ExcalidrawElement {
  return {
    id,
    type: "rectangle",
    x,
    y: 10,
    width: 20,
    height: 20,
    angle: 0,
    opacity: 100,
    groupIds: [],
    boundElements: null,
  } as unknown as ExcalidrawElement;
}

describe("slideshow checkpoint 4 presenter state", () => {
  it("uses the visible deck for current and next presenter slide ids", () => {
    const deck = buildFrameSlideDeck([
      frame("a", "A", 0),
      frame("b", "B", 1, true),
      frame("c", "C", 2),
    ]);

    expect(buildPresentationState(deck, 0)).toEqual({
      currentSlideId: "a",
      currentIndex: 0,
      visibleSlideCount: 2,
      completedAnimationSteps: 0,
      animationStepCount: 0,
      nextSlideId: "c",
      nextAction: "slide",
      nextCompletedAnimationSteps: 0,
    });
  });

  it("uses the next build of the current slide before the following slide", () => {
    const deck = buildFrameSlideDeck([frame("a", "A", 0), frame("b", "B", 1)]);

    expect(buildPresentationState(deck, 0, { completedSteps: 2, stepCount: 4 })).toEqual({
      currentSlideId: "a",
      currentIndex: 0,
      visibleSlideCount: 2,
      completedAnimationSteps: 2,
      animationStepCount: 4,
      nextSlideId: "a",
      nextAction: "build",
      nextCompletedAnimationSteps: 3,
    });
  });

  it("reports the end state on the final visible slide", () => {
    const deck = buildFrameSlideDeck([frame("a", "A", 0), frame("b", "B", 1)]);

    const state = buildPresentationState(deck, 1);
    expect(state.currentSlideId).toBe("b");
    expect(state.currentIndex).toBe(1);
    expect(state.visibleSlideCount).toBe(2);
    expect(state.nextSlideId).toBeNull();
    expect(state.nextAction).toBe("end");
    expect(state.nextCompletedAnimationSteps).toBeNull();
  });

  it("maps presenter-window keys directly to slideshow navigation", () => {
    expect(getPresenterKeyboardAction("ArrowRight")).toBe("next");
    expect(getPresenterKeyboardAction(" ")).toBe("next");
    expect(getPresenterKeyboardAction("Space")).toBe("next");
    expect(getPresenterKeyboardAction("ArrowLeft")).toBe("previous");
    expect(getPresenterKeyboardAction("Home")).toBe("first");
    expect(getPresenterKeyboardAction("End")).toBe("last");
    expect(getPresenterKeyboardAction("Escape")).toBe("finish");
    expect(getPresenterKeyboardAction("x")).toBeNull();
  });

  it("hides only future build targets in presenter previews", () => {
    const steps: AnimationStep[] = [
      {
        id: "step-a",
        targets: [{ type: "element", id: "target-a" }],
        effect: "appear",
        trigger: "advance",
      },
      {
        id: "step-b",
        targets: [{ type: "element", id: "target-b" }],
        effect: "fade",
        trigger: "advance",
      },
    ];
    const source = frame("frame", "Frame", 0, false, steps);
    const slide = buildFrameSlideDeck([source]).slides[0] as FrameDeckSlide;
    const elements = [
      source as unknown as ExcalidrawElement,
      element("target-a", 10),
      element("target-b", 50),
    ];

    expect(getHiddenBuildElementIds(slide, 0, elements)).toEqual(["target-a", "target-b"]);
    expect(getHiddenBuildElementIds(slide, 1, elements)).toEqual(["target-b"]);
    expect(getHiddenBuildElementIds(slide, 2, elements)).toEqual([]);
  });

  it("defaults presenter notes to a different display when one is available", () => {
    const displays: SlideshowDisplay[] = [
      {
        id: 1,
        index: 0,
        label: "Main",
        primary: true,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      },
      {
        id: 2,
        index: 1,
        label: "Sidecar",
        primary: false,
        bounds: { x: 1920, y: 0, width: 1366, height: 1024 },
        workArea: { x: 1920, y: 0, width: 1366, height: 984 },
      },
    ];

    expect(chooseDefaultDisplayTargets(displays, 1)).toEqual({
      presentationDisplayId: 1,
      presenterDisplayId: 2,
    });
  });
  it("matches a popout DOM window to the closest Electron BrowserWindow", () => {
    const main = { getBounds: () => ({ x: 0, y: 0, width: 1440, height: 900 }) };
    const sidecar = { getBounds: () => ({ x: 1440, y: 0, width: 1024, height: 768 }) };

    expect(
      chooseClosestNativeWindow([main, sidecar], {
        screenX: 1440,
        screenY: 0,
        outerWidth: 1024,
        outerHeight: 768,
      }),
    ).toBe(sidecar);
  });

  it("persists the most recent launch mode and fullscreen/window preference", async () => {
    let settings: Record<string, unknown> = { unrelated: "keep" };
    const ea = {
      getScriptSettings: () => settings,
      setScriptSettings: async (next: Record<string, unknown>) => {
        settings = next;
      },
    } as unknown as ExcalidrawAutomate;

    expect(loadSlideshowLaunchPreferences(ea)).toEqual({
      mode: "beginning",
      startFullscreen: true,
    });
    await saveSlideshowLaunchPreferences(ea, { mode: "resume", startFullscreen: false });
    expect(loadSlideshowLaunchPreferences(ea)).toEqual({
      mode: "resume",
      startFullscreen: false,
    });
    expect(settings.unrelated).toBe("keep");
  });

});
