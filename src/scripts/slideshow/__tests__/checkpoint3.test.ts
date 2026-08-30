import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AnimationRuntime,
  captureAnimationTargets,
  elementOverlapsFrame,
  getAnimationOverlayPlacement,
  removeAnimationTargetConflicts,
  resolveAnimationTargetElementIds,
} from "../AnimationRuntime";
import { buildLineSlideDeck, getVisibleSlideIndex } from "../SlideDeck";
import { resolvePresentationSetup } from "../presentationPath";
import {
  reorderLineSlides,
  saveFrameAnimationSteps,
  setLineSlideExcluded,
} from "../slideDeckMutations";
import { readFrameSlideshowData, readLineSlideshowDataV2 } from "../slideshowMetadata";
import type { AnimationStep } from "../types";

function element(
  id: string,
  type: string,
  frameId: string | null,
  extras: Record<string, unknown> = {},
): ExcalidrawElement {
  return {
    id,
    type,
    frameId,
    x: 0,
    y: 0,
    width: 20,
    height: 20,
    angle: 0,
    opacity: 80,
    groupIds: [],
    boundElements: null,
    ...extras,
  } as unknown as ExcalidrawElement;
}

function frame(id = "frame"): ExcalidrawFrameElement {
  return element(id, "frame", null, { name: "Frame", width: 200, height: 100 }) as ExcalidrawFrameElement;
}

function line(customData?: Record<string, unknown>): ExcalidrawLinearElement {
  return {
    ...element("path", "line", null),
    x: 100,
    y: 200,
    points: [
      [0, 0],
      [10, 10],
      [20, 20],
      [30, 30],
    ],
    strokeColor: "#123",
    backgroundColor: "transparent",
    locked: false,
    startBinding: null,
    endBinding: null,
    customData,
  } as unknown as ExcalidrawLinearElement;
}

function createFakeEa(elements: ExcalidrawElement[]): ExcalidrawAutomate {
  let workbench = new Map<string, Mutable<ExcalidrawElement>>();
  return {
    getViewElements: () => elements,
    clear: () => {
      workbench = new Map();
    },
    copyViewElementsToEAforEditing: (selected: readonly ExcalidrawElement[]) => {
      for (const selectedElement of selected) {
        workbench.set(selectedElement.id, structuredClone(selectedElement) as Mutable<ExcalidrawElement>);
      }
    },
    getElement: <T extends ExcalidrawElement>(id: string) =>
      (workbench.get(id) as Mutable<T>) ?? null,
    addAppendUpdateCustomData: (id: string, patch: Record<string, unknown | undefined>) => {
      const edited = workbench.get(id);
      if (!edited) return undefined;
      edited.customData = { ...(edited.customData ?? {}), ...patch };
      return edited;
    },
    addElementsToView: async () => {
      for (const [id, edited] of workbench) {
        const index = elements.findIndex((candidate) => candidate.id === id);
        if (index >= 0) elements[index] = structuredClone(edited);
      }
      return true;
    },
  } as unknown as ExcalidrawAutomate;
}


afterEach(() => {
  vi.useRealTimers();
});

describe("checkpoint 3 animation preview geometry", () => {
  it("positions editor overlays relative to the Excalidraw host instead of the browser viewport", () => {
    const placement = getAnimationOverlayPlacement(
      { topX: 100, topY: 70, width: 20, height: 10 },
      {
        offsetLeft: 120,
        offsetTop: 60,
        scrollX: -50,
        scrollY: -20,
        zoom: { value: 2 },
      },
      { left: 200, top: 100 },
    );
    expect(placement).toEqual({ left: 20, top: 60, width: 40, height: 20 });
  });
});

describe("checkpoint 3 animation target resolution", () => {
  it("captures marker-frame targets by geometric overlap and expands bound text dynamically", () => {
    const elements = [
      frame(),
      element("box", "rectangle", null, {
        x: 20,
        y: 20,
        groupIds: ["group-a"],
        boundElements: [{ id: "text", type: "text" }],
      }),
      element("text", "text", null, { x: 25, y: 25, groupIds: ["group-a"], containerId: "box" }),
      element("outside", "rectangle", null, { x: 240, y: 20, groupIds: ["group-a"] }),
    ];
    const captured = captureAnimationTargets(
      "frame",
      elements,
      { box: true, text: true, outside: true },
      { "group-a": true },
    );
    expect(captured.targets).toEqual([{ type: "group", id: "group-a" }]);
    expect(captured.ignoredSelectionCount).toBe(1);
    expect(resolveAnimationTargetElementIds("frame", captured.targets, elements).sort()).toEqual([
      "box",
      "text",
    ]);
  });

  it("canonicalizes bound-text selection to its container visual unit", () => {
    const elements = [
      frame(),
      element("box", "rectangle", null, { x: 20, y: 20, boundElements: [{ id: "text", type: "text" }] }),
      element("text", "text", null, { x: 25, y: 25, containerId: "box" }),
    ];
    const captured = captureAnimationTargets("frame", elements, { text: true }, {});
    expect(captured.targets).toEqual([{ type: "element", id: "box" }]);
    expect(resolveAnimationTargetElementIds("frame", captured.targets, elements).sort()).toEqual([
      "box",
      "text",
    ]);
  });

  it("treats partial rectangle overlap as marker-frame membership", () => {
    const marker = frame();
    const touching = element("touching", "rectangle", null, { x: 190, y: 40, width: 20, height: 20 });
    const outside = element("outside", "rectangle", "frame", { x: 205, y: 40, width: 20, height: 20 });
    expect(elementOverlapsFrame(touching, marker)).toBe(true);
    expect(elementOverlapsFrame(outside, marker)).toBe(false);
    expect(captureAnimationTargets("frame", [marker, touching, outside], { touching: true, outside: true }, {})).toEqual({
      targets: [{ type: "element", id: "touching" }],
      ignoredSelectionCount: 1,
    });
  });

  it("moves overlapping visual targets out of earlier animation steps", () => {
    const elements = [
      frame(),
      element("one", "rectangle", null, { x: 20, y: 20, groupIds: ["g"] }),
      element("two", "ellipse", null, { x: 50, y: 20, groupIds: ["g"] }),
    ];
    const steps: AnimationStep[] = [
      {
        id: "first",
        targets: [{ type: "element", id: "one" }],
        effect: "appear",
        trigger: "advance",
      },
      {
        id: "second",
        targets: [{ type: "element", id: "two" }],
        effect: "fade",
        trigger: "advance",
      },
    ];
    expect(
      removeAnimationTargetConflicts(
        "frame",
        steps,
        [{ type: "group", id: "g" }],
        elements,
      ),
    ).toEqual([]);
  });
});

describe("checkpoint 3 animation metadata and runtime", () => {
  it("saves frame animation steps while preserving existing slideshow fields", async () => {
    const source = frame() as Mutable<ExcalidrawFrameElement>;
    source.customData = {
      keep: true,
      slideshow: {
        schemaVersion: 2,
        kind: "frame",
        order: 4,
        excluded: true,
        notes: "Speaker note",
      },
    };
    const elements: ExcalidrawElement[] = [source];
    const ea = createFakeEa(elements);
    const steps: AnimationStep[] = [
      {
        id: "step",
        targets: [{ type: "element", id: "shape" }],
        effect: "fade",
        trigger: "after-delay",
        delayMs: 750,
        durationMs: 250,
      },
    ];
    await saveFrameAnimationSteps(ea, source.id, steps);
    const data = readFrameSlideshowData(elements[0]?.customData);
    expect(data?.order).toBe(0);
    expect(data?.excluded).toBe(true);
    expect(data?.notes).toBe("Speaker note");
    expect(data?.animation?.steps).toEqual(steps);
    expect((elements[0]?.customData as Record<string, unknown>).keep).toBe(true);
  });

  it("hides, reveals, reverses, and restores appear steps without persisting geometry", async () => {
    let elements: ExcalidrawElement[] = [
      frame(),
      element("shape", "rectangle", "frame", { opacity: 65 }),
    ];
    const api = {
      getSceneElements: () => elements,
      updateScene: (scene: { elements?: readonly ExcalidrawElement[] }) => {
        if (scene.elements) elements = [...scene.elements];
      },
    } as unknown as ExcalidrawAPI;
    const ownerWindow = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      requestAnimationFrame: (callback: FrameRequestCallback) =>
        globalThis.setTimeout(() => callback(Date.now()), 0) as unknown as number,
      performance: { now: () => Date.now() },
    } as unknown as Window;
    const runtime = new AnimationRuntime({
      ea: {} as ExcalidrawAutomate,
      api,
      hostView: { ownerWindow } as ScriptExcalidrawView,
    });
    await runtime.enterSlide(
      {
        id: "frame",
        kind: "frame",
        frameId: "frame",
        title: "Frame",
        rect: { x1: 0, y1: 0, x2: 100, y2: 100 },
        excluded: false,
        order: 0,
        animationSteps: [
          {
            id: "step",
            targets: [{ type: "element", id: "shape" }],
            effect: "appear",
            trigger: "advance",
          },
        ],
      },
      false,
      false,
    );
    expect((elements.find((candidate) => candidate.id === "shape") as { opacity: number }).opacity).toBe(0);
    expect(await runtime.advance()).toBe(true);
    expect((elements.find((candidate) => candidate.id === "shape") as { opacity: number }).opacity).toBe(65);
    expect(await runtime.reverse()).toBe(true);
    expect((elements.find((candidate) => candidate.id === "shape") as { opacity: number }).opacity).toBe(0);
    await runtime.leaveSlide();
    expect((elements.find((candidate) => candidate.id === "shape") as { opacity: number }).opacity).toBe(65);
  });

  it("runs after-delay steps sequentially and lets advance consume a pending timed step", async () => {
    vi.useFakeTimers();
    let elements: ExcalidrawElement[] = [
      frame(),
      element("one", "rectangle", "frame", { opacity: 70 }),
      element("two", "ellipse", "frame", { opacity: 55 }),
    ];
    const api = {
      getSceneElements: () => elements,
      updateScene: (scene: { elements?: readonly ExcalidrawElement[] }) => {
        if (scene.elements) elements = [...scene.elements];
      },
    } as unknown as ExcalidrawAPI;
    const ownerWindow = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      requestAnimationFrame: (callback: FrameRequestCallback) =>
        globalThis.setTimeout(() => callback(Date.now()), 0) as unknown as number,
      performance: { now: () => Date.now() },
    } as unknown as Window;
    const runtime = new AnimationRuntime({
      ea: {} as ExcalidrawAutomate,
      api,
      hostView: { ownerWindow } as ScriptExcalidrawView,
    });
    await runtime.enterSlide(
      {
        id: "frame",
        kind: "frame",
        frameId: "frame",
        title: "Frame",
        rect: { x1: 0, y1: 0, x2: 100, y2: 100 },
        excluded: false,
        order: 0,
        animationSteps: [
          {
            id: "one",
            targets: [{ type: "element", id: "one" }],
            effect: "appear",
            trigger: "after-delay",
            delayMs: 100,
          },
          {
            id: "two",
            targets: [{ type: "element", id: "two" }],
            effect: "appear",
            trigger: "after-delay",
            delayMs: 100,
          },
        ],
      },
      false,
      true,
    );
    expect((elements.find((candidate) => candidate.id === "one") as { opacity: number }).opacity).toBe(0);
    expect((elements.find((candidate) => candidate.id === "two") as { opacity: number }).opacity).toBe(0);

    await vi.advanceTimersByTimeAsync(100);
    expect((elements.find((candidate) => candidate.id === "one") as { opacity: number }).opacity).toBe(70);
    expect((elements.find((candidate) => candidate.id === "two") as { opacity: number }).opacity).toBe(0);

    expect(await runtime.advance()).toBe(true);
    expect((elements.find((candidate) => candidate.id === "two") as { opacity: number }).opacity).toBe(55);
    await vi.advanceTimersByTimeAsync(200);
    expect(runtime.getState()).toEqual({ completedSteps: 2, stepCount: 2 });
    await runtime.leaveSlide();
  });

  it("serializes rapid build advances so the same step cannot complete twice", async () => {
    let elements: ExcalidrawElement[] = [
      frame(),
      element("one", "rectangle", "frame", { opacity: 70 }),
      element("two", "ellipse", "frame", { opacity: 55 }),
    ];
    const api = {
      getSceneElements: () => elements,
      updateScene: (scene: { elements?: readonly ExcalidrawElement[] }) => {
        if (scene.elements) elements = [...scene.elements];
      },
    } as unknown as ExcalidrawAPI;
    const ownerWindow = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      requestAnimationFrame: (callback: FrameRequestCallback) =>
        globalThis.setTimeout(() => callback(Date.now()), 0) as unknown as number,
      performance: { now: () => Date.now() },
    } as unknown as Window;
    const runtime = new AnimationRuntime({
      ea: {} as ExcalidrawAutomate,
      api,
      hostView: { ownerWindow } as ScriptExcalidrawView,
    });
    await runtime.enterSlide(
      {
        id: "frame",
        kind: "frame",
        frameId: "frame",
        title: "Frame",
        rect: { x1: 0, y1: 0, x2: 100, y2: 100 },
        excluded: false,
        order: 0,
        animationSteps: [
          {
            id: "one",
            targets: [{ type: "element", id: "one" }],
            effect: "appear",
            trigger: "advance",
          },
          {
            id: "two",
            targets: [{ type: "element", id: "two" }],
            effect: "appear",
            trigger: "advance",
          },
        ],
      },
      false,
      false,
    );
    expect(await Promise.all([runtime.advance(), runtime.advance()])).toEqual([true, true]);
    expect(runtime.getState()).toEqual({ completedSteps: 2, stepCount: 2 });
    expect((elements.find((candidate) => candidate.id === "one") as { opacity: number }).opacity).toBe(70);
    expect((elements.find((candidate) => candidate.id === "two") as { opacity: number }).opacity).toBe(55);
    await runtime.leaveSlide();
  });

  it("restores final visibility when a presentation is interrupted mid-animation", async () => {
    let elements: ExcalidrawElement[] = [
      frame(),
      element("shape", "rectangle", null, { x: 20, y: 20, opacity: 60 }),
    ];
    const pendingFrames: FrameRequestCallback[] = [];
    let now = 0;
    const api = {
      getSceneElements: () => elements,
      updateScene: (scene: { elements?: readonly ExcalidrawElement[] }) => {
        if (scene.elements) elements = [...scene.elements];
      },
    } as unknown as ExcalidrawAPI;
    const ownerWindow = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        pendingFrames.push(callback);
        return pendingFrames.length;
      },
      performance: { now: () => now },
    } as unknown as Window;
    const runtime = new AnimationRuntime({
      ea: {} as ExcalidrawAutomate,
      api,
      hostView: { ownerWindow } as ScriptExcalidrawView,
    });
    await runtime.enterSlide(
      {
        id: "frame",
        kind: "frame",
        frameId: "frame",
        title: "Frame",
        rect: { x1: 0, y1: 0, x2: 200, y2: 100 },
        excluded: false,
        order: 0,
        animationSteps: [
          {
            id: "step",
            targets: [{ type: "element", id: "shape" }],
            effect: "fade",
            trigger: "advance",
            durationMs: 350,
          },
        ],
      },
      false,
      false,
    );
    expect((elements.find((candidate) => candidate.id === "shape") as { opacity: number }).opacity).toBe(0);

    const advancing = runtime.advance();
    await Promise.resolve();
    await Promise.resolve();
    expect(pendingFrames.length).toBe(1);
    await runtime.finishActiveSlide();
    expect((elements.find((candidate) => candidate.id === "shape") as { opacity: number }).opacity).toBe(60);
    now = 16;
    pendingFrames.splice(0).forEach((callback) => callback(now));
    await advancing;
    expect((elements.find((candidate) => candidate.id === "shape") as { opacity: number }).opacity).toBe(60);
  });

  it("temporarily exposes the fully built state for PDF work and restores the current build", async () => {
    let elements: ExcalidrawElement[] = [
      frame(),
      element("shape", "rectangle", "frame", { opacity: 60 }),
    ];
    const api = {
      getSceneElements: () => elements,
      updateScene: (scene: { elements?: readonly ExcalidrawElement[] }) => {
        if (scene.elements) elements = [...scene.elements];
      },
    } as unknown as ExcalidrawAPI;
    const ownerWindow = {
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis),
      requestAnimationFrame: (callback: FrameRequestCallback) =>
        globalThis.setTimeout(() => callback(Date.now()), 0) as unknown as number,
      performance: { now: () => Date.now() },
    } as unknown as Window;
    const runtime = new AnimationRuntime({
      ea: {} as ExcalidrawAutomate,
      api,
      hostView: { ownerWindow } as ScriptExcalidrawView,
    });
    await runtime.enterSlide(
      {
        id: "frame",
        kind: "frame",
        frameId: "frame",
        title: "Frame",
        rect: { x1: 0, y1: 0, x2: 100, y2: 100 },
        excluded: false,
        order: 0,
        animationSteps: [
          {
            id: "step",
            targets: [{ type: "element", id: "shape" }],
            effect: "appear",
            trigger: "advance",
          },
        ],
      },
      false,
      false,
    );
    expect((elements.find((candidate) => candidate.id === "shape") as { opacity: number }).opacity).toBe(0);
    await runtime.withFinalState(async () => {
      expect((elements.find((candidate) => candidate.id === "shape") as { opacity: number }).opacity).toBe(60);
    });
    expect((elements.find((candidate) => candidate.id === "shape") as { opacity: number }).opacity).toBe(0);
    await runtime.leaveSlide();
  });
});

describe("checkpoint 3 start-from-selected resolution", () => {
  it("maps a selected slide id to the visible presentation index and rejects excluded slides", () => {
    const path = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [
          { id: "one", excluded: true },
          { id: "two" },
        ],
      },
    });
    const deck = buildLineSlideDeck(path);
    expect(getVisibleSlideIndex(deck, "one")).toBeNull();
    expect(getVisibleSlideIndex(deck, "two")).toBe(0);
    expect(getVisibleSlideIndex(deck, null)).toBeNull();
  });
});

describe("checkpoint 3 line-slide exclusions", () => {
  it("persists line exclusion and filters the canonical visible deck", async () => {
    const path = line();
    const elements: ExcalidrawElement[] = [path];
    const ea = createFakeEa(elements);
    await setLineSlideExcluded(ea, "path", "slideshow-path-1", true);
    const metadata = readLineSlideshowDataV2(elements[0]?.customData);
    expect(metadata?.slides[0]?.excluded).toBe(true);
    const deck = buildLineSlideDeck(elements[0] as ExcalidrawLinearElement);
    expect(deck.slides.map((slide) => slide.excluded)).toEqual([true, false]);
    expect(deck.visibleSlides.map((slide) => slide.id)).toEqual(["slideshow-path-2"]);
    await setLineSlideExcluded(ea, "path", "slideshow-path-1", false);
    expect(readLineSlideshowDataV2(elements[0]?.customData)?.slides[0]?.excluded).toBeUndefined();
  });


  it("blocks a line presentation when every line slide is excluded", () => {
    const path = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [
          { id: "one", excluded: true },
          { id: "two", excluded: true },
        ],
      },
    });
    let toast = "";
    const ea = {
      getViewElements: () => [path],
      getViewSelectedElement: () => path,
    } as unknown as ExcalidrawAutomate;
    const api = {
      getAppState: () => ({ frameRendering: { enabled: false } }),
      setToast: ({ message }: { message: string }) => {
        toast = message;
      },
    } as unknown as ExcalidrawAPI;
    expect(resolvePresentationSetup(ea, api)).toBeNull();
    expect(toast).toContain("excluded");
  });

  it("keeps line exclusion attached to the stable slide record when point pairs reorder", async () => {
    const path = line();
    const elements: ExcalidrawElement[] = [path];
    const ea = createFakeEa(elements);
    await setLineSlideExcluded(ea, "path", "slideshow-path-1", true);
    await reorderLineSlides(ea, "path", 0, 1);
    const deck = buildLineSlideDeck(elements[0] as ExcalidrawLinearElement);
    expect(deck.slides.map((slide) => [slide.id, slide.excluded])).toEqual([
      ["slideshow-path-2", false],
      ["slideshow-path-1", true],
    ]);
    expect(deck.visibleSlides.map((slide) => slide.id)).toEqual(["slideshow-path-2"]);
  });
});
