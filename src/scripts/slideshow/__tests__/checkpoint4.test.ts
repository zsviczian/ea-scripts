import { describe, expect, it } from "vitest";

import {
  captureWindowPlacement,
  chooseClosestNativeWindow,
  chooseDefaultDisplayTargets,
  onDisplayConfigurationChanged,
  resolveSameNativeWindow,
  restoreWindowPlacement,
  restoreWindowPlacementStable,
  type SlideshowDisplay,
} from "../desktopDisplays";
import {
  getPresenterKeyboardAction,
  waitForPresenterOwnerWindow,
} from "../PresenterViewController";
import { resolveManualInvocationIntent } from "../slideshowLauncher";
import { buildFrameSlideDeck, type FrameDeckSlide } from "../SlideDeck";
import { getHiddenBuildElementIds } from "../SlidePreviewService";
import { buildPresentationState } from "../presentationState";
import {
  loadSlideshowDisplayPreferences,
  loadSlideshowLaunchPreferences,
  saveSlideshowDisplayPreferences,
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

  it("subscribes to and disposes Electron display configuration events", () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    const on = (event: string, listener: (...args: unknown[]) => void): void => {
      listeners.set(event, listener);
    };
    const offCalls: string[] = [];
    const callbackCalls: number[] = [];
    const fakeWindow = {
      require: () => ({
        getCurrentWindow: () => ({ getBounds: () => ({ x: 0, y: 0, width: 1, height: 1 }) }),
        screen: {
          on,
          off: (event: string) => offCalls.push(event),
        },
      }),
    } as unknown as Window;

    const dispose = onDisplayConfigurationChanged(fakeWindow, () => callbackCalls.push(1));
    listeners.get("display-added")?.();
    listeners.get("display-removed")?.();
    listeners.get("display-metrics-changed")?.();
    dispose();

    expect(callbackCalls).toHaveLength(3);
    expect(offCalls).toEqual(["display-added", "display-removed", "display-metrics-changed"]);
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

  it("uses Electron BrowserWindow.id for native identity and immutable host placement snapshots", () => {
    const hostNative = {
      id: 41,
      getBounds: () => ({ x: 0, y: 25, width: 1680, height: 1025 }),
      isMaximized: () => true,
    };
    const presenterNative = {
      id: 42,
      getBounds: () => ({ x: 300, y: 80, width: 1024, height: 800 }),
      isMaximized: () => false,
    };
    const displays = [
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1680, height: 1050 },
        workArea: { x: 0, y: 25, width: 1680, height: 1025 },
      },
    ];
    const makeWindow = (
      nativeWindow: typeof hostNative | typeof presenterNative,
      geometry: { x: number; y: number; width: number; height: number },
    ) =>
      ({
        require: () => ({
          getCurrentWindow: () => nativeWindow,
          BrowserWindow: { getAllWindows: () => [hostNative, presenterNative] },
          screen: {
            getAllDisplays: () => displays,
            getPrimaryDisplay: () => displays[0],
            getDisplayMatching: () => displays[0],
          },
        }),
        screenX: geometry.x,
        screenY: geometry.y,
        outerWidth: geometry.width,
        outerHeight: geometry.height,
        document: {},
      }) as unknown as Window;
    const host = makeWindow(hostNative, { x: 0, y: 25, width: 1680, height: 1025 });
    const presenter = makeWindow(presenterNative, { x: 300, y: 80, width: 1024, height: 800 });

    expect(resolveSameNativeWindow(host, presenter)).toBe(false);
    expect(captureWindowPlacement(host)).toEqual({
      windowId: 41,
      sourceDisplayId: 1,
      bounds: { x: 0, y: 25, width: 1680, height: 1025 },
      maximized: true,
    });
  });

  it("waits until the presenter leaf migrates away from the host DOM window", async () => {
    const presenterWindow = {} as Window;
    let currentWindow: Window;
    const hostWindow = {
      setTimeout: (callback: () => void) => {
        currentWindow = presenterWindow;
        callback();
        return 1;
      },
    } as unknown as Window;
    currentWindow = hostWindow;
    const ownerDocument = {
      get defaultView() {
        return currentWindow;
      },
    };
    const leaf = {
      view: {
        containerEl: { ownerDocument },
      },
    } as unknown as Parameters<typeof waitForPresenterOwnerWindow>[0];

    const result = await waitForPresenterOwnerWindow(leaf, hostWindow, 200);
    expect(result.win).toBe(presenterWindow);
  });

  it("restores the captured native BrowserWindow by id instead of geometry-rematching another window", () => {
    let mainBounds = { x: 1800, y: 0, width: 1200, height: 800 };
    let popoutBounds = { x: 0, y: 0, width: 1000, height: 700 };
    const main = {
      id: 1,
      getBounds: () => ({ ...mainBounds }),
      setBounds: (bounds: typeof mainBounds) => {
        mainBounds = { ...bounds };
      },
      isMaximized: () => false,
    };
    const popout = {
      id: 2,
      getBounds: () => ({ ...popoutBounds }),
      setBounds: (bounds: typeof popoutBounds) => {
        popoutBounds = { ...bounds };
      },
      isMaximized: () => false,
    };
    const displays = [
      {
        id: 10,
        bounds: { x: 0, y: 0, width: 1600, height: 900 },
        workArea: { x: 0, y: 0, width: 1600, height: 860 },
      },
      {
        id: 11,
        bounds: { x: 1600, y: 0, width: 1200, height: 900 },
        workArea: { x: 1600, y: 0, width: 1200, height: 860 },
      },
    ];
    const remote = {
      getCurrentWindow: () => popout,
      BrowserWindow: {
        getAllWindows: () => [main, popout],
        fromId: (id: number) => (id === 1 ? main : id === 2 ? popout : null),
      },
      screen: {
        getAllDisplays: () => displays,
        getPrimaryDisplay: () => displays[0],
        getDisplayMatching: (bounds: typeof mainBounds) =>
          bounds.x >= 1600 ? displays[1] : displays[0],
      },
    };
    const fakeWindow = {
      require: () => remote,
      screenX: 0,
      screenY: 0,
      outerWidth: 1000,
      outerHeight: 700,
    } as unknown as Window;

    restoreWindowPlacement(fakeWindow, {
      windowId: 1,
      sourceDisplayId: 10,
      bounds: { x: 100, y: 80, width: 1200, height: 760 },
      maximized: false,
    });

    expect(mainBounds).toEqual({ x: 100, y: 80, width: 1200, height: 760 });
    expect(popoutBounds).toEqual({ x: 0, y: 0, width: 1000, height: 700 });
  });

  it("persists independent start, window, notes, and presentation-type dropdowns", async () => {
    let settings: Record<string, unknown> = { unrelated: "keep" };
    const ea = {
      getScriptSettings: () => settings,
      setScriptSettings: async (next: Record<string, unknown>) => {
        settings = next;
      },
    } as unknown as ExcalidrawAutomate;

    expect(loadSlideshowLaunchPreferences(ea)).toEqual({
      startMode: "beginning",
      windowMode: "fullscreen",
      notesMode: "slides",
    });
    await saveSlideshowLaunchPreferences(ea, {
      startMode: "resume",
      windowMode: "window",
      notesMode: "presenter",
      presentationType: "line",
    });
    expect(loadSlideshowLaunchPreferences(ea)).toEqual({
      startMode: "resume",
      windowMode: "window",
      notesMode: "presenter",
      presentationType: "line",
    });
    expect(settings.unrelated).toBe("keep");
  });

  it("migrates the previous combined launch preferences when new dropdown settings are absent", () => {
    const ea = {
      getScriptSettings: () => ({
        slideshowLaunchMode: "presenter",
        slideshowStartFullscreen: false,
      }),
    } as unknown as ExcalidrawAutomate;

    expect(loadSlideshowLaunchPreferences(ea)).toEqual({
      startMode: "beginning",
      windowMode: "window",
      notesMode: "presenter",
    });
  });

  it("stores display choices independently for each local device key", async () => {
    let settings: Record<string, unknown> = { unrelated: "keep" };
    const ea = {
      getScriptSettings: () => settings,
      setScriptSettings: async (next: Record<string, unknown>) => {
        settings = next;
      },
    } as unknown as ExcalidrawAutomate;

    await saveSlideshowDisplayPreferences(ea, "macbook", {
      presentationDisplayId: 1,
      presenterDisplayId: 2,
    });
    await saveSlideshowDisplayPreferences(ea, "desktop", {
      presentationDisplayId: 10,
      presenterDisplayId: 11,
    });
    expect(loadSlideshowDisplayPreferences(ea, "macbook")).toEqual({
      presentationDisplayId: 1,
      presenterDisplayId: 2,
    });
    expect(loadSlideshowDisplayPreferences(ea, "desktop")).toEqual({
      presentationDisplayId: 10,
      presenterDisplayId: 11,
    });
    expect(settings.unrelated).toBe("keep");
  });

  it("maps script-button modifiers to panel, resume, fullscreen, and windowed actions", () => {
    const base = { altKey: false, shiftKey: false, ctrlKey: false, metaKey: false };
    expect(resolveManualInvocationIntent(base)).toEqual({
      openSidepanel: false,
      resume: false,
      startFullscreen: true,
    });
    expect(resolveManualInvocationIntent({ ...base, shiftKey: true })).toEqual({
      openSidepanel: false,
      resume: true,
      startFullscreen: true,
    });
    expect(resolveManualInvocationIntent({ ...base, altKey: true })).toEqual({
      openSidepanel: false,
      resume: false,
      startFullscreen: false,
    });
    expect(resolveManualInvocationIntent({ ...base, altKey: true, shiftKey: true })).toEqual({
      openSidepanel: false,
      resume: true,
      startFullscreen: false,
    });
    expect(resolveManualInvocationIntent({ ...base, metaKey: true })).toEqual({
      openSidepanel: true,
      resume: false,
      startFullscreen: true,
    });
    expect(resolveManualInvocationIntent({ ...base, ctrlKey: true })).toEqual({
      openSidepanel: true,
      resume: false,
      startFullscreen: true,
    });
  });

  it("repairs a late macOS window drift after fullscreen restoration", async () => {
    let bounds = { x: -1100, y: 25, width: 1000, height: 700 };
    let setCount = 0;
    let driftScheduled = false;
    const nativeWindow = {
      id: 7,
      getBounds: () => ({ ...bounds }),
      setBounds: (next: typeof bounds) => {
        bounds = { ...next };
        setCount += 1;
        if (!driftScheduled) {
          driftScheduled = true;
          setTimeout(() => {
            bounds = { x: -1500, y: -900, width: 1000, height: 700 };
          }, 20);
        }
      },
      isMaximized: () => false,
      isFullScreen: () => false,
    };
    const displays = [
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1680, height: 1050 },
        workArea: { x: 0, y: 25, width: 1680, height: 1025 },
      },
      {
        id: 5,
        bounds: { x: -1194, y: 0, width: 1194, height: 834 },
        workArea: { x: -1194, y: 25, width: 1194, height: 809 },
      },
    ];
    const remote = {
      getCurrentWindow: () => nativeWindow,
      BrowserWindow: {
        getAllWindows: () => [nativeWindow],
        fromId: (id: number) => (id === 7 ? nativeWindow : null),
      },
      screen: {
        getAllDisplays: () => displays,
        getPrimaryDisplay: () => displays[0],
        getDisplayMatching: (candidate: typeof bounds) =>
          candidate.x < 0 ? displays[1] : displays[0],
      },
    };
    const fakeWindow = {
      require: () => remote,
      setTimeout: globalThis.setTimeout.bind(globalThis),
      screenX: 0,
      screenY: 25,
      outerWidth: 1680,
      outerHeight: 1025,
    } as unknown as Window;

    await restoreWindowPlacementStable(
      fakeWindow,
      {
        windowId: 7,
        sourceDisplayId: 1,
        bounds: { x: 0, y: 25, width: 1680, height: 1025 },
        maximized: false,
      },
      100,
      180,
    );

    expect(setCount).toBeGreaterThanOrEqual(2);
    expect(bounds).toEqual({ x: 0, y: 25, width: 1680, height: 1025 });
  });
});
