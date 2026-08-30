import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPreviewNavigationRect,
  getSceneVisualFingerprint,
  SlidePreviewService,
} from "../SlidePreviewService";
import {
  DEFAULT_SLIDESHOW_CONFIG,
  normalizeSlideshowConfig,
  resetSlideshowConfigToDefaults,
  saveSlideshowConfig,
} from "../slideshowSettings";
import { hasSlideshowMetadata, registerSlideshowElementActionProvider } from "../slideshowLauncher";
import { createSlideshowTranslator } from "../lang";
import {
  getAlternatePresentationSourceKey,
  getAlternatePresentationType,
  resolvePresentationSetup,
  resolvePresentationSource,
  resolveSlideDeck,
  resolveSlideDeckChoices,
} from "../presentationPath";
import {
  createLinePresentation,
  hasBoundLineEndpoint,
  removeLinePresentation,
  renameLinePresentation,
  reorderFrameSlides,
  reorderLineSlides,
  saveFrameNotes,
  saveLineNotes,
  setFrameExcluded,
  setLinePresentationPathHidden,
} from "../slideDeckMutations";
import { readFrameSlideshowData, readLineSlideshowDataV2 } from "../slideshowMetadata";
import {
  getSlideshowProgress,
  getSlideshowProgressSource,
  getSlideshowProgressType,
  getSlideshowRuntime,
  resetSlideshowRuntimeForTests,
  setSlideshowProgress,
} from "../slideshowRuntime";
import { runSlideshow } from "../run";
import { buildFrameSlideDeck } from "../SlideDeck";
import { SlideSorter } from "../SlideSorter";
import {
  chooseSidepanelPresentationSourceKey,
  chooseSidepanelPresentationType,
  clearLineSelectionForDeckSwitch,
  getConvertibleSelectedLine,
  getPresentationSourceLabels,
  getResumeSlideForPresentation,
  getSceneSelectedSlideId,
  SlideshowSidepanel,
} from "../SlideshowSidepanel";

function frame(
  id: string,
  name: string,
  customData?: Record<string, unknown>,
): ExcalidrawFrameElement {
  return {
    id,
    type: "frame",
    name,
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    customData,
  } as unknown as ExcalidrawFrameElement;
}

function line(
  customData?: Record<string, unknown>,
  id = "path",
): ExcalidrawLinearElement {
  return {
    id,
    type: "line",
    x: 100,
    y: 200,
    points: [
      [0, 0],
      [10, 10],
      [20, 20],
      [30, 30],
      [40, 40],
      [50, 50],
    ],
    strokeColor: "#123",
    backgroundColor: "transparent",
    locked: false,
    startBinding: null,
    endBinding: null,
    customData,
  } as unknown as ExcalidrawLinearElement;
}

function createFakeEa(elements: ExcalidrawElement[]): ExcalidrawAutomate & {
  commits: number;
  saveRequests: number;
} {
  let workbench = new Map<string, Mutable<ExcalidrawElement>>();
  const api = {
    targetView: null,
    sidepanelTab: null,
    commits: 0,
    saveRequests: 0,
    getViewElements: () => elements,
    getViewSelectedElement: () => null,
    cloneElement: <T extends ExcalidrawElement>(element: T) =>
      structuredClone(element) as Mutable<T>,
    clear: () => {
      workbench = new Map();
    },
    copyViewElementsToEAforEditing: (selected: readonly ExcalidrawElement[]) => {
      for (const element of selected) {
        workbench.set(element.id, structuredClone(element) as Mutable<ExcalidrawElement>);
      }
    },
    getElement: <T extends ExcalidrawElement>(id: string) =>
      (workbench.get(id) as Mutable<T>) ?? null,
    addAppendUpdateCustomData: (id: string, patch: Record<string, unknown | undefined>) => {
      const element = workbench.get(id);
      if (!element) return undefined;
      const current = (element.customData ?? {}) as Record<string, unknown>;
      element.customData = { ...current, ...patch };
      return element;
    },
    addElementsToView: async (_repositionToCursor?: boolean, save = true) => {
      for (const [id, edited] of workbench) {
        const index = elements.findIndex((element) => element.id === id);
        if (index >= 0) elements[index] = structuredClone(edited);
      }
      api.commits += 1;
      if (save) api.saveRequests += 1;
      return true;
    },
  } as unknown as ExcalidrawAutomate & {
    commits: number;
    saveRequests: number;
  };
  return api;
}

describe("slideshow checkpoint 2 mutations", () => {
  it("normalizes and reorders all frames in one scene transaction", async () => {
    const elements: ExcalidrawElement[] = [
      frame("c", "Charlie", { preserved: 1 }),
      frame("a", "Alpha", { preserved: 2 }),
      frame("b", "Bravo", { preserved: 3 }),
    ];
    const ea = createFakeEa(elements);
    await reorderFrameSlides(ea, 2, 0);
    expect(ea.commits).toBe(1);
    expect(
      elements.map((element) => [element.id, readFrameSlideshowData(element.customData)?.order]),
    ).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
    expect((elements[0]?.customData as Record<string, unknown>).preserved).toBe(1);
  });

  it("persists frame exclusion and notes without losing normalized order", async () => {
    const elements: ExcalidrawElement[] = [frame("b", "Bravo"), frame("a", "Alpha")];
    const ea = createFakeEa(elements);
    await setFrameExcluded(ea, "b", true);
    await saveFrameNotes(ea, "a", "Speaker note");
    const a = elements.find((element) => element.id === "a");
    const b = elements.find((element) => element.id === "b");
    expect(readFrameSlideshowData(a?.customData)?.notes).toBe("Speaker note");
    expect(readFrameSlideshowData(a?.customData)?.order).toBe(0);
    expect(readFrameSlideshowData(b?.customData)?.excluded).toBe(true);
    expect(readFrameSlideshowData(b?.customData)?.order).toBe(1);
    await saveFrameNotes(ea, "a", "   ");
    const updatedA = elements.find((element) => element.id === "a");
    expect(readFrameSlideshowData(updatedA?.customData)?.notes).toBeUndefined();
  });

  it("normalizes the whole frame deck before a first notes-only metadata edit", async () => {
    const elements: ExcalidrawElement[] = [
      frame("c", "Charlie"),
      frame("a", "Alpha"),
      frame("b", "Bravo"),
    ];
    const ea = createFakeEa(elements);
    await saveFrameNotes(ea, "b", "Note");
    const byId = new Map(elements.map((element) => [element.id, element]));
    expect(readFrameSlideshowData(byId.get("a")?.customData)?.order).toBe(0);
    expect(readFrameSlideshowData(byId.get("b")?.customData)?.order).toBe(1);
    expect(readFrameSlideshowData(byId.get("c")?.customData)?.order).toBe(2);
    expect(readFrameSlideshowData(byId.get("b")?.customData)?.notes).toBe("Note");
  });

  it("persists presenter notes through the awaited EA save path", async () => {
    const elements: ExcalidrawElement[] = [frame("a", "Alpha")];
    const ea = createFakeEa(elements);
    await saveFrameNotes(ea, "a", "Persist me");
    expect(ea.commits).toBe(1);
    expect(ea.saveRequests).toBe(1);
    expect(readFrameSlideshowData(elements[0]?.customData)?.notes).toBe("Persist me");
  });

  it("moves a line point-pair and its stable notes record together", async () => {
    const path = line({
      untouched: "yes",
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [
          { id: "one", notes: "First" },
          { id: "two", notes: "Second" },
          { id: "three", notes: "Third" },
        ],
      },
    });
    const elements: ExcalidrawElement[] = [path];
    const ea = createFakeEa(elements);
    await reorderLineSlides(ea, "path", 2, 0);
    expect(ea.commits).toBe(1);
    const edited = elements[0] as ExcalidrawLinearElement;
    expect([edited.x, edited.y]).toEqual([140, 240]);
    expect(edited.points).toEqual([
      [0, 0],
      [10, 10],
      [-40, -40],
      [-30, -30],
      [-20, -20],
      [-10, -10],
    ]);
    expect(readLineSlideshowDataV2(edited.customData)?.slides).toEqual([
      { id: "three", notes: "Third" },
      { id: "one", notes: "First" },
      { id: "two", notes: "Second" },
    ]);
    expect((edited.customData as Record<string, unknown>).untouched).toBe("yes");
  });

  it("saves and removes line notes by stable slide id", async () => {
    const path = line();
    const elements: ExcalidrawElement[] = [path];
    const ea = createFakeEa(elements);
    await saveLineNotes(ea, "path", "slideshow-path-2", "Second note");
    expect(readLineSlideshowDataV2(elements[0]?.customData)?.slides[1]?.notes).toBe("Second note");
    await saveLineNotes(ea, "path", "slideshow-path-2", "");
    expect(readLineSlideshowDataV2(elements[0]?.customData)?.slides[1]?.notes).toBeUndefined();
    expect(ea.saveRequests).toBe(2);
  });

  it("restores a persistently hidden line path and clears its hidden flag", async () => {
    const path = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        hidden: true,
        originalProps: { strokeColor: "#123", backgroundColor: "#fed", locked: false },
        slides: [{ id: "one" }, { id: "two" }, { id: "three" }],
      },
    }) as Mutable<ExcalidrawLinearElement>;
    path.strokeColor = "transparent";
    path.backgroundColor = "transparent";
    path.locked = true;
    const elements: ExcalidrawElement[] = [path];
    const ea = createFakeEa(elements);
    await setLinePresentationPathHidden(ea, "path", false);
    const updated = elements[0] as ExcalidrawLinearElement;
    expect(updated.strokeColor).toBe("#123");
    expect(updated.backgroundColor).toBe("#fed");
    expect(updated.locked).toBe(false);
    expect(readLineSlideshowDataV2(updated.customData)?.hidden).toBe(false);
  });

  it("creates, renames, and removes line presentation metadata without losing unrelated custom data", async () => {
    const elements: ExcalidrawElement[] = [line({ preserved: "keep" }, "draft")];
    const ea = createFakeEa(elements);

    await createLinePresentation(ea, "draft", "Product demo");
    let metadata = readLineSlideshowDataV2(elements[0]?.customData);
    expect(metadata?.name).toBe("Product demo");
    expect(metadata?.slides).toHaveLength(3);
    const stableIds = metadata?.slides.map((slide) => slide.id);

    await renameLinePresentation(ea, "draft", "Investor pitch");
    metadata = readLineSlideshowDataV2(elements[0]?.customData);
    expect(metadata?.name).toBe("Investor pitch");
    expect(metadata?.slides.map((slide) => slide.id)).toEqual(stableIds);

    await setLinePresentationPathHidden(ea, "draft", true);
    expect((elements[0] as ExcalidrawLinearElement).strokeColor).toBe("transparent");
    await removeLinePresentation(ea, "draft");
    const restored = elements[0] as ExcalidrawLinearElement;
    expect(readLineSlideshowDataV2(restored.customData)).toBeNull();
    expect((restored.customData as Record<string, unknown>).preserved).toBe("keep");
    expect(restored.strokeColor).toBe("#123");
    expect(restored.backgroundColor).toBe("transparent");
    expect(restored.locked).toBe(false);
  });

  it("detects bound endpoints before line reordering", () => {
    const path = line() as Mutable<ExcalidrawLinearElement>;
    path.startBinding = { elementId: "box", fixedPoint: [0.5, 0.5], mode: "orbit" };
    expect(hasBoundLineEndpoint(path)).toBe(true);
  });
});

describe("slideshow checkpoint 2 deck consumption", () => {
  it("keeps frame and remembered line decks independently selectable", () => {
    const rememberedPath = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        hidden: true,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [{ id: "one" }, { id: "two" }, { id: "three" }],
      },
    });
    const elements: ExcalidrawElement[] = [frame("a", "Alpha"), rememberedPath];
    const ea = {
      getViewElements: () => elements,
      getViewSelectedElement: () => null,
      cloneElement: <T extends ExcalidrawElement>(element: T) =>
        structuredClone(element) as Mutable<T>,
    } as unknown as ExcalidrawAutomate;
    const choices = resolveSlideDeckChoices(ea);
    expect(choices.defaultSourceKey).toBe("frame");
    expect(choices.defaultType).toBe("frame");
    expect(choices.frame?.deck.kind).toBe("frame");
    expect(choices.lines).toHaveLength(1);
    expect(choices.line?.deck.kind).toBe("path");
    expect(resolveSlideDeck(ea, "frame")?.deck.slides.map((slide) => slide.title)).toEqual([
      "Alpha",
    ]);
    expect(resolveSlideDeck(ea, "line")?.pathElement?.id).toBe("path");
  });

  it("defaults to frames when a remembered line path is visible and unselected", () => {
    const rememberedPath = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [{ id: "one" }, { id: "two" }, { id: "three" }],
      },
    });
    const elements: ExcalidrawElement[] = [frame("a", "Alpha"), rememberedPath];
    const ea = {
      getViewElements: () => elements,
      getViewSelectedElement: () => null,
      cloneElement: <T extends ExcalidrawElement>(element: T) =>
        structuredClone(element) as Mutable<T>,
    } as unknown as ExcalidrawAutomate;
    const choices = resolveSlideDeckChoices(ea);
    expect(choices.defaultType).toBe("frame");
    expect(choices.line?.pathElement?.id).toBe("path");
    expect(getAlternatePresentationType(choices, "frame")).toBe("line");
  });

  it("does not treat an ordinary selected line as a presentation source", () => {
    const selectedPath = line();
    const elements: ExcalidrawElement[] = [frame("a", "Alpha"), selectedPath];
    const ea = {
      getViewElements: () => elements,
      getViewSelectedElement: () => selectedPath,
      cloneElement: <T extends ExcalidrawElement>(element: T) =>
        structuredClone(element) as Mutable<T>,
    } as unknown as ExcalidrawAutomate;
    const choices = resolveSlideDeckChoices(ea);
    expect(choices.defaultSourceKey).toBe("frame");
    expect(choices.defaultType).toBe("frame");
    expect(choices.lines).toHaveLength(0);
    expect(chooseSidepanelPresentationType(choices, "frame", selectedPath)).toBe("frame");
    expect(getConvertibleSelectedLine(ea)?.id).toBe("path");
  });

  it("uses a selected persisted line presentation as the manual launch default", () => {
    const selectedPath = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        name: "Lecture",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [{ id: "one" }, { id: "two" }, { id: "three" }],
      },
    });
    const elements: ExcalidrawElement[] = [frame("a", "Alpha"), selectedPath];
    const ea = {
      getViewElements: () => elements,
      getViewSelectedElement: () => selectedPath,
      cloneElement: <T extends ExcalidrawElement>(element: T) =>
        structuredClone(element) as Mutable<T>,
    } as unknown as ExcalidrawAutomate;
    const choices = resolveSlideDeckChoices(ea);
    expect(choices.defaultSourceKey).toBe("line:path");
    expect(choices.defaultType).toBe("line");
    expect(getConvertibleSelectedLine(ea)).toBeNull();
  });

  it("enumerates multiple named line presentations and disambiguates duplicate names", () => {
    const first = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        name: "Lecture",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
      },
    }, "path-a");
    const second = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        name: "Lecture",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [{ id: "b1" }, { id: "b2" }, { id: "b3" }],
      },
    }, "path-b");
    const ordinary = line(undefined, "ordinary");
    const elements: ExcalidrawElement[] = [frame("frame-a", "Frames"), first, second, ordinary];
    const ea = {
      getViewElements: () => elements,
      getViewSelectedElement: () => ordinary,
      cloneElement: <T extends ExcalidrawElement>(element: T) =>
        structuredClone(element) as Mutable<T>,
    } as unknown as ExcalidrawAutomate;
    const choices = resolveSlideDeckChoices(ea);
    expect(choices.lines.map((source) => source.key)).toEqual(["line:path-a", "line:path-b"]);
    expect(resolvePresentationSource(choices, "line:path-b")?.pathElement?.id).toBe("path-b");
    expect(getAlternatePresentationSourceKey(choices, "frame")).toBeNull();
    expect(chooseSidepanelPresentationSourceKey(choices, "line:path-b", "frame")).toBe("line:path-b");
    expect(getPresentationSourceLabels(choices, "Frames", "Line presentation")).toEqual([
      { key: "frame", label: "Frames" },
      { key: "line:path-a", label: "Lecture (1)" },
      { key: "line:path-b", label: "Lecture (2)" },
    ]);
  });

  it("preserves scene frame ids instead of using cloneElement's generated ids", () => {
    const elements: ExcalidrawElement[] = [frame("a", "Alpha"), frame("b", "Bravo")];
    let cloneCalls = 0;
    const ea = {
      getViewElements: () => elements,
      getViewSelectedElement: () => null,
      cloneElement: <T extends ExcalidrawElement>(element: T) => {
        cloneCalls += 1;
        return { ...element, id: `generated-${cloneCalls}` } as T;
      },
    } as unknown as ExcalidrawAutomate;

    const choices = resolveSlideDeckChoices(ea);

    expect(choices.frame?.deck.slides.map((slide) => slide.id)).toEqual(["a", "b"]);
    expect(cloneCalls).toBe(0);
  });

  it("maps one selected frame to its sorter slide and rejects ambiguous frame selections", () => {
    const elements: ExcalidrawElement[] = [frame("a", "Alpha"), frame("b", "Bravo")];
    const ea = {
      getViewElements: () => elements,
      getViewSelectedElement: () => null,
      cloneElement: <T extends ExcalidrawElement>(element: T) =>
        structuredClone(element) as Mutable<T>,
    } as unknown as ExcalidrawAutomate;
    const resolved = resolveSlideDeckChoices(ea).frame;
    const selection = (
      ids: Record<string, true>,
    ): Parameters<typeof getSceneSelectedSlideId>[1] => ({
      selectedElementIds: ids,
      selectedLinearElement: null,
    });

    expect(getSceneSelectedSlideId(resolved, selection({ b: true }))).toBe("b");
    expect(getSceneSelectedSlideId(resolved, selection({ a: true, b: true }))).toBeNull();
  });

  it("maps selected line points only when every point belongs to one slide pair", () => {
    const path = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [{ id: "slideshow-path-1" }, { id: "slideshow-path-2" }, { id: "slideshow-path-3" }],
      },
    });
    const ea = {
      getViewElements: () => [path],
      getViewSelectedElement: () => path,
      cloneElement: <T extends ExcalidrawElement>(element: T) =>
        structuredClone(element) as Mutable<T>,
    } as unknown as ExcalidrawAutomate;
    const resolved = resolveSlideDeckChoices(ea).line;
    const selection = (
      selectedPointsIndices: number[],
    ): Parameters<typeof getSceneSelectedSlideId>[1] => ({
      selectedElementIds: { path: true } as const,
      selectedLinearElement: {
        elementId: "path",
        selectedPointsIndices,
        isEditing: true,
      },
    });

    expect(getSceneSelectedSlideId(resolved, selection([2, 3]))).toBe("slideshow-path-2");
    expect(getSceneSelectedSlideId(resolved, selection([1, 2]))).toBeNull();
  });

  it("presentation setup uses explicit frame order and omits excluded frames", () => {
    const elements: ExcalidrawElement[] = [
      frame("a", "Alpha", { slideshow: { schemaVersion: 2, kind: "frame", order: 1 } }),
      frame("b", "Bravo", {
        slideshow: { schemaVersion: 2, kind: "frame", order: 0, excluded: true },
      }),
    ];
    const ea = {
      getViewElements: () => elements,
      getViewSelectedElement: () => null,
      cloneElement: <T extends ExcalidrawElement>(element: T) =>
        structuredClone(element) as Mutable<T>,
    } as unknown as ExcalidrawAutomate;
    const api = {
      getAppState: () => ({ frameRendering: { enabled: false } }),
      setToast: () => undefined,
      updateScene: () => undefined,
    } as unknown as ExcalidrawAPI;
    const setup = resolvePresentationSetup(ea, api);
    expect(setup?.slideTitles).toEqual(["Alpha"]);
    expect(setup?.slides).toHaveLength(1);
    expect(setup?.deck.slides.map((slide) => slide.id)).toEqual(["b", "a"]);
  });

  it("prevents starting a frame presentation when every slide is excluded", () => {
    const elements: ExcalidrawElement[] = [
      frame("a", "Alpha", {
        slideshow: { schemaVersion: 2, kind: "frame", order: 0, excluded: true },
      }),
    ];
    let toast = "";
    const ea = {
      getViewElements: () => elements,
      getViewSelectedElement: () => null,
      cloneElement: <T extends ExcalidrawElement>(element: T) =>
        structuredClone(element) as Mutable<T>,
    } as unknown as ExcalidrawAutomate;
    const api = {
      getAppState: () => ({ frameRendering: { enabled: true } }),
      setToast: ({ message }: { message: string }) => {
        toast = message;
      },
      updateScene: () => {
        throw new Error("frame rendering must not change when presentation is blocked");
      },
    } as unknown as ExcalidrawAPI;
    expect(resolvePresentationSetup(ea, api)).toBeNull();
    expect(toast).toContain("excluded");
  });

  it("explicit frame presentation ignores a remembered line path", () => {
    const rememberedPath = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        hidden: true,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [{ id: "one" }, { id: "two" }, { id: "three" }],
      },
    });
    const elements: ExcalidrawElement[] = [frame("a", "Alpha"), rememberedPath];
    const ea = {
      getViewElements: () => elements,
      getViewSelectedElement: () => null,
      cloneElement: <T extends ExcalidrawElement>(element: T) =>
        structuredClone(element) as Mutable<T>,
    } as unknown as ExcalidrawAutomate;
    const api = {
      getAppState: () => ({ frameRendering: { enabled: false } }),
      setToast: () => undefined,
      updateScene: () => undefined,
    } as unknown as ExcalidrawAPI;
    const setup = resolvePresentationSetup(ea, api, undefined, "frame");
    expect(setup?.pathType).toBe("frame");
    expect(setup?.slideTitles).toEqual(["Alpha"]);
  });

  it("loads slideshow config values with defaults and safe numeric normalization", () => {
    const config = normalizeSlideshowConfig({
      transitionStepCount: 42.4,
      fadeLevel: 2,
      printSlideWidth: 1600,
      printSlideHeight: 1000,
    });
    expect(config.transitionStepCount).toBe(42);
    expect(config.fadeLevel).toBe(1);
    expect(config.printSlideWidth).toBe(1600);
    expect(config.printSlideHeight).toBe(1000);
    expect(config.maxZoom).toBe(DEFAULT_SLIDESHOW_CONFIG.maxZoom);
  });

  it("resets slideshow config values to built-in defaults", () => {
    const config = {
      ...DEFAULT_SLIDESHOW_CONFIG,
      transitionStepCount: 12,
      fadeLevel: 0.8,
      printSlideWidth: 1024,
      printSlideHeight: 768,
    };
    resetSlideshowConfigToDefaults(config);
    expect(config).toEqual(DEFAULT_SLIDESHOW_CONFIG);
  });

  it("persists slideshow config without deleting unrelated script settings", async () => {
    let persisted: Record<string, unknown> = { unrelated: "keep" };
    const ea = {
      getScriptSettings: () => persisted,
      setScriptSettings: async (settings: Record<string, unknown>) => {
        persisted = settings;
      },
    } as unknown as ExcalidrawAutomate;
    await saveSlideshowConfig(ea, {
      ...DEFAULT_SLIDESHOW_CONFIG,
      printSlideWidth: 1600,
      printSlideHeight: 1000,
    });
    expect(persisted.unrelated).toBe("keep");
    expect(persisted.printSlideWidth).toBe(1600);
    expect(persisted.printSlideHeight).toBe(1000);
  });

  it("calculates preview crops against an HD presentation viewport", () => {
    const slide = {
      id: "a",
      kind: "frame",
      frameId: "a",
      title: "Alpha",
      rect: { x1: 100, y1: 200, x2: 200, y2: 300 },
      excluded: false,
      order: 0,
      animationSteps: [],
    } as const;
    const rect = getPreviewNavigationRect(slide, 1);
    expect(rect.right - rect.left).toBe(1920);
    expect(rect.bottom - rect.top).toBe(1080);
  });

  it("uses configured print dimensions for sorter preview crops", () => {
    const slide = {
      id: "a",
      kind: "frame",
      frameId: "a",
      title: "Alpha",
      rect: { x1: 100, y1: 200, x2: 200, y2: 300 },
      excluded: false,
      order: 0,
      animationSteps: [],
    } as const;
    const rect = getPreviewNavigationRect(slide, 1, 1600, 1000);
    expect(rect.right - rect.left).toBe(1600);
    expect(rect.bottom - rect.top).toBe(1000);
  });

  it("uses the Excalidraw scene background behind preview crop overflow", () => {
    const service = new SlidePreviewService(
      {} as ExcalidrawAutomate,
      { getAppState: () => ({ viewBackgroundColor: "#f7f1e8" }) } as unknown as ExcalidrawAPI,
      { ...DEFAULT_SLIDESHOW_CONFIG },
    );
    expect(service.getBackgroundColor()).toBe("#f7f1e8");
    expect(service.getAspectRatio()).toBe("1920 / 1080");
  });

  it("uses the EA workbench to hide a line presentation path for preview export", async () => {
    const path = line();
    const other = frame("a", "Alpha");
    let workbench: ExcalidrawElement[] = [];
    let exported: ExcalidrawElement[] = [];
    let copiedIds: string[] = [];
    let clearCalls = 0;
    const ea = {
      clear: () => {
        clearCalls += 1;
        workbench = [];
      },
      copyViewElementsToEAforEditing: (elements: readonly ExcalidrawElement[]) => {
        copiedIds = elements.map((element) => element.id);
        workbench = structuredClone(elements) as ExcalidrawElement[];
      },
      getBoundingBox: () => ({ topX: 0, topY: 0, width: 100, height: 100 }),
      getElement: (id: string) => workbench.find((element) => element.id === id),
      addRect: () => {
        const anchor = frame("anchor", "Anchor");
        workbench.push(anchor);
        return anchor.id;
      },
      getElements: () => workbench,
      createViewSVG: ({ elementsOverride }: { elementsOverride: ExcalidrawElement[] }) => {
        exported = structuredClone(elementsOverride) as ExcalidrawElement[];
        return Promise.resolve({ outerHTML: "<svg></svg>" });
      },
    } as unknown as ExcalidrawAutomate;
    const api = {
      getAppState: () => ({ theme: "light", viewBackgroundColor: "#fff" }),
    } as unknown as ExcalidrawAPI;
    const service = new SlidePreviewService(ea, api, { ...DEFAULT_SLIDESHOW_CONFIG });

    await (
      service as unknown as {
        ensureSceneSvg: (
          elements: readonly ExcalidrawElement[],
          hiddenPathId?: string,
        ) => Promise<unknown>;
      }
    ).ensureSceneSvg([path, other], path.id);

    expect(exported.find((element) => element.id === path.id)?.opacity).toBe(0);
    expect(exported.find((element) => element.id === path.id)?.id).toBe(path.id);
    expect(exported.some((element) => element.id === other.id)).toBe(true);
    expect(new Set(exported.map((element) => element.id)).size).toBe(exported.length);
    expect(copiedIds).toEqual([path.id, other.id]);
    expect(path.opacity).not.toBe(0);
    expect(clearCalls).toBe(2);
    expect(workbench).toEqual([]);
  });

  it("formats presentation slide titles with current and total slide numbers", () => {
    const t = createSlideshowTranslator("en");
    expect(t("presentationSlideTitle", { title: "Alpha", number: 1, total: 2 })).toBe(
      "Alpha (1/2)",
    );
  });

  it("thumbnail fingerprint ignores slideshow metadata-only edits", () => {
    const before = frame("a", "Alpha", {
      slideshow: { schemaVersion: 2, kind: "frame", order: 0 },
    });
    const after = {
      ...(before as unknown as Record<string, unknown>),
      version: 99,
      customData: {
        slideshow: { schemaVersion: 2, kind: "frame", order: 0, notes: "New notes" },
      },
    } as unknown as ExcalidrawElement;
    expect(getSceneVisualFingerprint([before])).toBe(getSceneVisualFingerprint([after]));
    const visuallyRelevantCustomData = {
      ...(after as unknown as Record<string, unknown>),
      customData: { slideshow: after.customData?.slideshow, strokeOptions: { highlighter: true } },
    } as unknown as ExcalidrawElement;
    expect(getSceneVisualFingerprint([before])).not.toBe(
      getSceneVisualFingerprint([visuallyRelevantCustomData]),
    );
  });
});

describe("slideshow checkpoint 2 element actions", () => {
  it("offers slideshow editing only for elements with valid slideshow metadata", () => {
    const slideshowFrame = frame("a", "Alpha", {
      slideshow: { schemaVersion: 2, kind: "frame", order: 0 },
    });
    const slideshowLine = line({
      slideshow: {
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        hidden: false,
      },
    });
    expect(hasSlideshowMetadata(slideshowFrame)).toBe(true);
    expect(hasSlideshowMetadata(slideshowLine)).toBe(true);
    expect(hasSlideshowMetadata(frame("b", "Bravo"))).toBe(false);
    expect(hasSlideshowMetadata(line())).toBe(false);
  });

  it("opens the clicked frame's deck and requests its sorter row", async () => {
    vi.stubGlobal("app", {});
    const holder: {
      provider?: (element: ExcalidrawElement) => readonly SelectedElementMenuAction[];
    } = {};
    const activations: Array<[ScriptExcalidrawView, string | undefined, string | undefined]> = [];
    const view = {} as ScriptExcalidrawView;
    const ea = {
      registerElementActionProvider: (
        getActions: (element: ExcalidrawElement) => readonly SelectedElementMenuAction[],
      ) => {
        holder.provider = getActions;
        return () => undefined;
      },
      setView: () => view,
    } as unknown as ExcalidrawAutomate;
    getSlideshowRuntime().sidepanel = {
      activate: async (activatedView, presentationType, slideId) => {
        activations.push([activatedView, presentationType, slideId]);
      },
    };
    const unregister = registerSlideshowElementActionProvider({
      ea,
      utils: {} as ScriptUtils,
      view,
      config: {} as never,
      t: createSlideshowTranslator("en"),
    });
    const actions = holder.provider?.(
      frame("a", "Alpha", {
        slideshow: { schemaVersion: 2, kind: "frame", order: 0 },
      }),
    );
    expect(unregister).toBeTypeOf("function");
    expect(actions).toEqual([
      expect.objectContaining({
        id: "edit-slideshow",
        title: "Edit slideshow",
        icon: "presentation",
      }),
    ]);
    actions?.[0]?.action();
    await Promise.resolve();
    await Promise.resolve();
    expect(activations).toEqual([[view, "frame", "a"]]);
    resetSlideshowRuntimeForTests();
    vi.unstubAllGlobals();
  });

  it("clears a selected line when the dropdown explicitly switches to frames", () => {
    const selectElements = vi.fn();
    clearLineSelectionForDeckSwitch(
      "frame",
      line(),
      { selectElements } as unknown as ExcalidrawAPI,
    );
    expect(selectElements).toHaveBeenCalledOnce();
    expect(selectElements).toHaveBeenCalledWith([]);
  });

  it("focuses and scrolls the requested sorter row after the panel becomes visible", () => {
    const focus = vi.fn();
    const scrollIntoView = vi.fn();
    const row = {
      dataset: { slideId: "b" },
      isConnected: true,
      focus,
      scrollIntoView,
    };
    const ownerWindow = {
      clearTimeout: vi.fn(),
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
    };
    const sorter = new SlideSorter({
      ea: { DEVICE: { isDesktop: true, isMobile: false } } as ExcalidrawAutomate,
      container: {
        ownerDocument: { defaultView: ownerWindow },
        querySelectorAll: () => [row],
      } as unknown as HTMLElement,
      deck: buildFrameSlideDeck([frame("a", "Alpha"), frame("b", "Bravo")]),
      previewService: {} as SlidePreviewService,
      icons: {} as never,
      t: createSlideshowTranslator("en"),
      reorderEnabled: true,
      callbacks: {
        move: async () => undefined,
        toggleInclusion: async () => undefined,
        zoomToSlide: () => undefined,
        saveNotes: async () => undefined,
        requestAnimationEditor: () => undefined,
        editLineSlide: async () => undefined,
        notesBlurred: () => undefined,
      },
    });

    sorter.scrollToSlide("b");

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "center" });
  });
});

describe("slideshow checkpoint 2 temporary progress", () => {
  beforeEach(() => vi.stubGlobal("app", {}));

  afterEach(() => {
    resetSlideshowRuntimeForTests();
    vi.unstubAllGlobals();
  });

  it("remembers progress independently for concrete views of the same drawing", () => {
    const firstView = {} as ScriptExcalidrawView;
    const secondView = {} as ScriptExcalidrawView;
    setSlideshowProgress(firstView, 2);
    setSlideshowProgress(secondView, 5);
    expect(getSlideshowProgress(firstView)).toBe(2);
    expect(getSlideshowProgress(secondView)).toBe(5);
  });

  it("associates saved progress with the presentation type and resolves continue safely", () => {
    const view = {} as ScriptExcalidrawView;
    setSlideshowProgress(view, 4, "frame");
    expect(getSlideshowProgress(view)).toBe(4);
    expect(getSlideshowProgressType(view)).toBe("frame");
    expect(getResumeSlideForPresentation(4, "frame", "frame", 3)).toBe(2);
    expect(getResumeSlideForPresentation(4, "frame", "line", 6)).toBeNull();
    expect(getResumeSlideForPresentation(undefined, "frame", "frame", 3)).toBeNull();
  });

  it("associates resume progress with one exact line presentation source", () => {
    const view = {} as ScriptExcalidrawView;
    setSlideshowProgress(view, 2, "line:path-b");
    expect(getSlideshowProgressType(view)).toBe("line");
    expect(getSlideshowProgressSource(view)).toBe("line:path-b");
    expect(getResumeSlideForPresentation(2, "line", "line", 5, "line:path-b", "line:path-b")).toBe(2);
    expect(getResumeSlideForPresentation(2, "line", "line", 5, "line:path-b", "line:path-a")).toBeNull();
  });

  it("upgrades an existing runtime when presentation-type progress was not available yet", () => {
    const legacyRuntime = {
      contexts: new WeakMap(),
      progress: new WeakMap(),
      presentations: new WeakMap(),
      sidepanel: null,
    };
    vi.stubGlobal("app", { __excalidrawAutomateSlideshowRuntimeV1: legacyRuntime });
    const view = {} as ScriptExcalidrawView;
    setSlideshowProgress(view, 1, "line");
    expect(getSlideshowProgress(view)).toBe(1);
    expect(getSlideshowProgressType(view)).toBe("line");
  });

  it("keeps autostart registration-only and launches on the first manual invocation", async () => {
    vi.stubGlobal("Notice", class {});
    const view = {
      modifierKeyDown: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
      isDirty: () => false,
      forceSave: async () => undefined,
    } as ScriptExcalidrawView;
    let apiAccesses = 0;
    let providerRegistrations = 0;
    let autostartRegistrations = 0;
    const autostartMessages: Array<string | undefined> = [];
    const scriptEa = {
      targetView: view,
      obsidian: { moment: { locale: () => "en" } },
      verifyMinimumPluginVersion: () => true,
      skipSidepanelScriptRestore: () => false,
      setView: () => view,
      registerElementActionProvider: () => {
        providerRegistrations += 1;
        return () => undefined;
      },
      registerAutostart: async (message?: string) => {
        autostartRegistrations += 1;
        autostartMessages.push(message);
        return "allow" as const;
      },
      getExcalidrawAPI: () => {
        apiAccesses += 1;
        return null;
      },
    } as unknown as ExcalidrawAutomate;

    await runSlideshow(scriptEa, { executionSource: "autostart" } as ScriptUtils, {} as never);

    expect(providerRegistrations).toBe(1);
    expect(autostartRegistrations).toBe(1);
    expect(apiAccesses).toBe(0);

    await runSlideshow(scriptEa, { executionSource: "manual" } as ScriptUtils, {} as never);

    expect(providerRegistrations).toBe(2);
    expect(autostartRegistrations).toBe(2);
    expect(apiAccesses).toBe(1);
    expect(autostartMessages).toEqual([
      'Autostart is required for registering the "Edit Slide" button. Autostart does not mean slideshows will autostart when opening a drawing.',
      'Autostart is required for registering the "Edit Slide" button. Autostart does not mean slideshows will autostart when opening a drawing.',
    ]);
  });
});

describe("slideshow checkpoint 2 presenter-note lifecycle", () => {
  it("force-saves the drawing immediately after presenter notes are persisted", async () => {
    const elements: ExcalidrawElement[] = [frame("a", "Alpha")];
    const ea = createFakeEa(elements);
    const forceSave = vi.fn(async () => undefined);
    const view = {
      file: { path: "Deck.excalidraw.md" },
      forceSave,
    } as unknown as ScriptExcalidrawView;
    ea.targetView = view;
    const sidepanel = new SlideshowSidepanel({
      ea,
      tab: {
        contentEl: { ownerDocument: { defaultView: {} } },
      } as unknown as ScriptSidepanelTab,
      t: createSlideshowTranslator("en"),
      icons: {} as never,
      config: {} as never,
      startPresentation: async () => undefined,
      printPresentation: async () => undefined,
      onClosed: () => undefined,
    });
    const internals = sidepanel as unknown as {
      boundView: ScriptExcalidrawView | null;
      saveNotes(slide: ReturnType<typeof buildFrameSlideDeck>["slides"][number], notes: string): Promise<void>;
    };
    internals.boundView = view;

    const slide = buildFrameSlideDeck(elements as ExcalidrawFrameElement[]).slides[0];
    if (!slide) throw new Error("Expected one frame slide.");
    await internals.saveNotes(slide, "Persist to disk");

    expect(forceSave).toHaveBeenCalledOnce();
    expect(forceSave).toHaveBeenCalledWith(true);
    expect(readFrameSlideshowData(elements[0]?.customData)?.notes).toBe("Persist to disk");
  });

  it("manually inserts printable repeated keys when the host already prevented their default", () => {
    const deck = buildFrameSlideDeck([frame("a", "Alpha")]);
    let text = "";
    let selection = 0;
    const textarea = {
      value: text,
      selectionStart: selection,
      selectionEnd: selection,
      setRangeText: (value: string, start: number, end: number): void => {
        text = `${text.slice(0, start)}${value}${text.slice(end)}`;
        textarea.value = text;
        selection = start + value.length;
        textarea.selectionStart = selection;
        textarea.selectionEnd = selection;
      },
    };
    const sorter = new SlideSorter({
      ea: { DEVICE: { isDesktop: true, isMobile: false } } as ExcalidrawAutomate,
      container: {
        ownerDocument: {
          defaultView: {
            clearTimeout: () => undefined,
            setTimeout: () => 1,
          },
        },
      } as unknown as HTMLElement,
      deck,
      previewService: {} as SlidePreviewService,
      icons: {} as never,
      t: createSlideshowTranslator("en"),
      reorderEnabled: true,
      callbacks: {
        move: async () => undefined,
        toggleInclusion: async () => undefined,
        zoomToSlide: () => undefined,
        saveNotes: async () => undefined,
        requestAnimationEditor: () => undefined,
        editLineSlide: async () => undefined,
        notesBlurred: () => undefined,
      },
    });
    const internals = sorter as unknown as {
      expandedNotesSlideId: string | null;
      notesTextarea: typeof textarea | null;
      handleNotesKeydown(event: KeyboardEvent): void;
    };
    internals.expandedNotesSlideId = "a";
    internals.notesTextarea = textarea;
    const keydown = () =>
      ({
        key: "-",
        defaultPrevented: true,
        metaKey: false,
        ctrlKey: false,
        altKey: false,
        currentTarget: textarea,
        stopPropagation: () => undefined,
      }) as unknown as KeyboardEvent;

    internals.handleNotesKeydown(keydown());
    internals.handleNotesKeydown(keydown());
    internals.handleNotesKeydown(keydown());

    expect(textarea.value).toBe("---");
  });
  it("keeps the latest textarea draft when an earlier save is still in flight", async () => {
    const deck = buildFrameSlideDeck([frame("a", "Alpha")]);
    const saved: string[] = [];
    const sorter = new SlideSorter({
      ea: { DEVICE: { isDesktop: true, isMobile: false } } as ExcalidrawAutomate,
      container: {
        ownerDocument: { defaultView: { clearTimeout: () => undefined } },
      } as unknown as HTMLElement,
      deck,
      previewService: {} as SlidePreviewService,
      icons: {} as never,
      t: createSlideshowTranslator("en"),
      reorderEnabled: true,
      callbacks: {
        move: async () => undefined,
        toggleInclusion: async () => undefined,
        zoomToSlide: () => undefined,
        saveNotes: async (_slide, notes) => {
          saved.push(notes);
        },
        requestAnimationEditor: () => undefined,
        editLineSlide: async () => undefined,
        notesBlurred: () => undefined,
      },
    });
    let finishEarlierSave!: () => void;
    const earlierSave = new Promise<void>((resolve) => {
      finishEarlierSave = resolve;
    });
    const internals = sorter as unknown as {
      expandedNotesSlideId: string | null;
      notesTextarea: { value: string } | null;
      notesSaveInFlight: Promise<void> | null;
    };
    internals.expandedNotesSlideId = "a";
    internals.notesTextarea = { value: "Latest draft" };
    internals.notesSaveInFlight = earlierSave;

    const flush = sorter.flushNotes();
    sorter.destroy();
    finishEarlierSave();
    await flush;

    expect(saved).toEqual(["Latest draft"]);
    expect(deck.slides[0]?.notes).toBe("Latest draft");
  });

  it("serializes rapid note drafts so the newest value is persisted last", async () => {
    const deck = buildFrameSlideDeck([frame("a", "Alpha")]);
    const saved: string[] = [];
    let finishFirstSave!: () => void;
    const firstSaveGate = new Promise<void>((resolve) => {
      finishFirstSave = resolve;
    });
    const sorter = new SlideSorter({
      ea: { DEVICE: { isDesktop: true, isMobile: false } } as ExcalidrawAutomate,
      container: {
        ownerDocument: { defaultView: { clearTimeout: () => undefined } },
      } as unknown as HTMLElement,
      deck,
      previewService: {} as SlidePreviewService,
      icons: {} as never,
      t: createSlideshowTranslator("en"),
      reorderEnabled: true,
      callbacks: {
        move: async () => undefined,
        toggleInclusion: async () => undefined,
        zoomToSlide: () => undefined,
        saveNotes: async (_slide, notes) => {
          saved.push(notes);
          if (notes === "First draft") await firstSaveGate;
        },
        requestAnimationEditor: () => undefined,
        editLineSlide: async () => undefined,
        notesBlurred: () => undefined,
      },
    });
    const textarea = { value: "First draft" };
    const internals = sorter as unknown as {
      expandedNotesSlideId: string | null;
      notesTextarea: { value: string } | null;
    };
    internals.expandedNotesSlideId = "a";
    internals.notesTextarea = textarea;

    const firstFlush = sorter.flushNotes();
    await Promise.resolve();
    textarea.value = "Latest draft";
    const latestFlush = sorter.flushNotes();
    finishFirstSave();
    await Promise.all([firstFlush, latestFlush]);

    expect(saved).toEqual(["First draft", "Latest draft"]);
    expect(deck.slides[0]?.notes).toBe("Latest draft");
  });
});
