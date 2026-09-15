import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getPreviewNavigationRect,
  getSceneVisualFingerprint,
  getSlideVisualFingerprint,
  SlidePreviewService,
} from "../SlidePreviewService";
import {
  DEFAULT_SLIDESHOW_CONFIG,
  loadPresenterNotesFontSize,
  loadSlideshowPresentationSource,
  loadSorterThumbnailMaxWidth,
  normalizeSlideshowConfig,
  resetSlideshowConfigToDefaults,
  savePresenterNotesFontSize,
  saveSlideshowConfig,
  saveSlideshowPresentationSource,
  saveSorterThumbnailMaxWidth,
} from "../slideshowSettings";
import {
  chooseManualPresentationSourceKey,
  ensureManualSlideshowDeclaration,
  hasSlideshowMetadata,
  registerSlideshowElementActionProvider,
} from "../slideshowLauncher";
import { createSlideshowTranslator } from "../lang";
import { SLIDESHOW_PRESENTER_STYLES, SLIDESHOW_SIDEPANEL_STYLES } from "../styles";
import {
  getAlternatePresentationSourceKey,
  getAlternatePresentationType,
  resolvePresentationSetup,
  resolvePresentationSource,
  resolveSlideDeck,
  resolveSlideDeckChoices,
} from "../presentationPath";
import {
  convertFramePresentationToLine,
  convertLinePresentationToFrames,
  createLinePresentation,
  declareFrameSlideshow,
  hasBoundLineEndpoint,
  removeLinePresentation,
  renameFramePresentation,
  renameFrameSlide,
  renameLinePresentation,
  renameLineSlide,
  reorderFrameSlides,
  reorderLineSlides,
  resizeFrameToPresentationAspect,
  saveFrameNotes,
  saveLineAnimationSteps,
  saveLineNotes,
  setFrameExcluded,
  setLinePresentationPathHidden,
} from "../slideDeckMutations";
import {
  getRawSlideshowMetadata,
  hasFrameSlideshowDeclaration,
  readFrameSlideshowData,
  readLineSlideshowDataV2,
} from "../slideshowMetadata";
import {
  getSlideshowProgress,
  getSlideshowProgressForSource,
  getSlideshowProgressSource,
  getSlideshowProgressType,
  getSlideshowRuntime,
  resetSlideshowRuntimeForTests,
  setSlideshowProgress,
  type SlideshowViewContext,
} from "../slideshowRuntime";
import { runSlideshow } from "../run";
import { buildFrameSlideDeck } from "../SlideDeck";
import {
  getDragAutoScrollVelocity,
  getDropIndicatorPlacement,
  getDropInsertionIndex,
  getDropInsertionIndexFromRects,
  getDropMoveTarget,
  isSingleColumnSorterLayout,
  SlideSorter,
} from "../SlideSorter";
import {
  chooseSidepanelPresentationSourceKey,
  chooseSidepanelPresentationType,
  clearLineSelectionForDeckSwitch,
  getConvertibleSelectedLine,
  getDeclarableSelectedFrame,
  getPresentationSourceLabels,
  getResumeSlideForPresentation,
  resolveDeviceLaunchModes,
  getSceneSelectedSlideId,
  getSorterSceneSelectionSignature,
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

function line(customData?: Record<string, unknown>, id = "path"): ExcalidrawLinearElement {
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

function createFakeEa(
  elements: ExcalidrawElement[],
  selectedElementId?: string,
): ExcalidrawAutomate & {
  commits: number;
  saveRequests: number;
} {
  let workbench = new Map<string, Mutable<ExcalidrawElement>>();
  let generatedFrame = 0;
  let generatedLine = 0;
  const api = {
    targetView: null,
    sidepanelTab: null,
    commits: 0,
    saveRequests: 0,
    setView: () => null,
    getViewElements: () => elements,
    getViewSelectedElement: () =>
      selectedElementId
        ? elements.find((element) => element.id === selectedElementId) ?? null
        : null,
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
    addFrame: (x: number, y: number, width: number, height: number, name?: string) => {
      const id = `generated-frame-${++generatedFrame}`;
      workbench.set(
        id,
        {
          id,
          type: "frame",
          name: name ?? null,
          x,
          y,
          width,
          height,
          customData: {},
        } as unknown as Mutable<ExcalidrawElement>,
      );
      return id;
    },
    addLine: (points: readonly [number, number][]) => {
      const id = `generated-line-${++generatedLine}`;
      const origin = points[0] ?? [0, 0];
      const relativePoints = points.map(([x, y]) => [x - origin[0], y - origin[1]] as [number, number]);
      const xs = relativePoints.map(([x]) => x);
      const ys = relativePoints.map(([, y]) => y);
      workbench.set(
        id,
        {
          id,
          type: "line",
          x: origin[0],
          y: origin[1],
          width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys),
          points: relativePoints,
          strokeColor: "#123",
          backgroundColor: "transparent",
          locked: false,
          startBinding: null,
          endBinding: null,
          customData: {},
        } as unknown as Mutable<ExcalidrawElement>,
      );
      return id;
    },
    getElementsInArea: (
      candidates: readonly ExcalidrawElement[],
      area: { x: number; y: number; width: number; height: number },
    ) =>
      candidates.filter((element) => {
        const width = "width" in element && typeof element.width === "number" ? element.width : 0;
        const height = "height" in element && typeof element.height === "number" ? element.height : 0;
        return (
          element.x >= area.x &&
          element.y >= area.y &&
          element.x + width <= area.x + area.width &&
          element.y + height <= area.y + area.height
        );
      }),
    addElementsToView: async (_repositionToCursor?: boolean, save = true) => {
      for (const [id, edited] of workbench) {
        const index = elements.findIndex((element) => element.id === id);
        if (index >= 0) elements[index] = structuredClone(edited);
        else elements.push(structuredClone(edited));
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
  it("auto-declares a selected ordinary line before falling back to scene frames", async () => {
    const elements: ExcalidrawElement[] = [frame("frame-a", "Frame"), line(undefined, "path")];
    const ea = createFakeEa(elements, "path");
    const view = {} as ScriptExcalidrawView;

    await expect(
      ensureManualSlideshowDeclaration({ ea, view } as unknown as SlideshowViewContext),
    ).resolves.toBe("line:path");

    expect(
      readLineSlideshowDataV2(elements.find((element) => element.id === "path")?.customData),
    ).not.toBeNull();
    expect(hasFrameSlideshowDeclaration(elements[0]?.customData)).toBe(false);
    expect(ea.commits).toBe(1);
  });

  it("auto-declares the selected frame when no line is selected", async () => {
    const elements: ExcalidrawElement[] = [frame("a", "Alpha"), frame("b", "Bravo")];
    const ea = createFakeEa(elements, "b");
    const view = {} as ScriptExcalidrawView;

    await expect(
      ensureManualSlideshowDeclaration({ ea, view } as unknown as SlideshowViewContext),
    ).resolves.toBe("frame");

    expect(hasFrameSlideshowDeclaration(elements[0]?.customData)).toBe(false);
    expect(hasFrameSlideshowDeclaration(elements[1]?.customData)).toBe(true);
    expect(ea.commits).toBe(1);
  });

  it("leaves an unselected drawing unresolved so the saved sidepanel source can win", async () => {
    const elements: ExcalidrawElement[] = [frame("a", "Alpha"), frame("b", "Bravo")];
    const ea = createFakeEa(elements);
    const view = {} as ScriptExcalidrawView;

    await expect(
      ensureManualSlideshowDeclaration({ ea, view } as unknown as SlideshowViewContext),
    ).resolves.toBeUndefined();

    expect(hasFrameSlideshowDeclaration(elements[0]?.customData)).toBe(false);
    expect(hasFrameSlideshowDeclaration(elements[1]?.customData)).toBe(false);
    expect(ea.commits).toBe(0);
  });

  it("declares a frame slideshow on only the selected frame without changing deck order", async () => {
    const elements: ExcalidrawElement[] = [
      frame("c", "Charlie"),
      frame("a", "Alpha"),
      frame("b", "Bravo"),
    ];
    const ea = createFakeEa(elements);
    await declareFrameSlideshow(ea, "b");
    const byId = new Map(elements.map((element) => [element.id, element]));
    expect(getRawSlideshowMetadata(byId.get("b")?.customData)).toEqual({
      schemaVersion: 2,
      kind: "frame",
    });
    expect(hasFrameSlideshowDeclaration(byId.get("b")?.customData)).toBe(true);
    expect(readFrameSlideshowData(byId.get("b")?.customData)).toBeNull();
    expect(byId.get("a")?.customData).toBeUndefined();
    expect(byId.get("c")?.customData).toBeUndefined();
    expect(
      buildFrameSlideDeck(elements as ExcalidrawFrameElement[]).slides.map((slide) => slide.id),
    ).toEqual(["a", "b", "c"]);
    expect(ea.commits).toBe(1);
  });

  it("renames the underlying frame when a frame slide is renamed", async () => {
    const elements: ExcalidrawElement[] = [frame("a", "Alpha")];
    const ea = createFakeEa(elements);
    await renameFrameSlide(ea, "a", "Opening");
    expect((elements[0] as ExcalidrawFrameElement).name).toBe("Opening");
  });

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
    expect(
      readLineSlideshowDataV2(edited.customData)?.slides.map(({ id, notes }) => ({ id, notes })),
    ).toEqual([
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

  it("moves line slide titles and animations with their point pair", async () => {
    const elements: ExcalidrawElement[] = [line()];
    const ea = createFakeEa(elements);
    const animation = [
      {
        id: "build",
        targets: [{ type: "element" as const, id: "shape" }],
        effect: "appear" as const,
        trigger: "advance" as const,
      },
    ];
    await renameLineSlide(ea, "path", "slideshow-path-2", "Middle");
    await saveLineAnimationSteps(ea, "path", "slideshow-path-2", animation);
    await reorderLineSlides(ea, "path", 1, 0);

    const metadata = readLineSlideshowDataV2(elements[0]?.customData);
    expect(metadata?.slides[0]?.id).toBe("slideshow-path-2");
    expect(metadata?.slides[0]?.title).toBe("Middle");
    expect(metadata?.slides[0]?.animation?.steps).toEqual(animation);
  });

  it("names frame presentations and expands frames around their center to the presentation ratio", async () => {
    const elements: ExcalidrawElement[] = [frame("a", "Alpha"), frame("b", "Bravo")];
    const ea = createFakeEa(elements);
    await renameFramePresentation(ea, "Product demo");
    expect(buildFrameSlideDeck(elements as ExcalidrawFrameElement[]).name).toBe("Product demo");

    await resizeFrameToPresentationAspect(ea, "a", {
      ...DEFAULT_SLIDESHOW_CONFIG,
      printSlideWidth: 16,
      printSlideHeight: 9,
    });
    const resized = elements[0] as ExcalidrawFrameElement;
    expect(resized.width / resized.height).toBeCloseTo(16 / 9);
    expect(resized.width).toBe(100);
    expect(resized.x + resized.width / 2).toBeCloseTo(50);
    expect(resized.y + resized.height / 2).toBeCloseTo(25);
  });

  it("converts a line presentation to marker frames and transfers deck metadata", async () => {
    const path = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        name: "Line deck",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [
          {
            id: "one",
            title: "Opening",
            notes: "Speaker note",
            animation: {
              steps: [
                {
                  id: "build",
                  targets: [{ type: "element", id: "shape" }],
                  effect: "appear",
                  trigger: "advance",
                },
              ],
            },
          },
          { id: "two", excluded: true },
          { id: "three" },
        ],
      },
    });
    const elements: ExcalidrawElement[] = [path];
    const ea = createFakeEa(elements);
    await convertLinePresentationToFrames(
      ea,
      "path",
      { ...DEFAULT_SLIDESHOW_CONFIG, printSlideWidth: 16, printSlideHeight: 9 },
      true,
    );

    const frames = elements.filter((element): element is ExcalidrawFrameElement => element.type === "frame");
    const deck = buildFrameSlideDeck(frames);
    expect(deck.name).toBe("Line deck (frames)");
    expect(deck.slides.map((slide) => slide.title)).toEqual(["Opening", "Slide 2", "Slide 3"]);
    expect(deck.slides[0]?.notes).toBe("Speaker note");
    expect(deck.slides[0]?.animationSteps).toHaveLength(1);
    expect(deck.slides[1]?.excluded).toBe(true);
    expect(frames.every((candidate) => candidate.width / candidate.height === 16 / 9)).toBe(true);
    expect(frames.every((candidate) => candidate.frameRole === "marker")).toBe(true);
    expect(elements.some((element) => element.id === "path")).toBe(true);
  });

  it("converts a frame presentation to a line presentation and transfers names and builds", async () => {
    const animation = {
      steps: [
        {
          id: "build",
          targets: [{ type: "element" as const, id: "shape" }],
          effect: "fade" as const,
          trigger: "advance" as const,
        },
      ],
    };
    const framedShape = {
      id: "shape",
      type: "rectangle",
      frameId: "a",
    } as unknown as ExcalidrawElement;
    const framedText = {
      id: "text",
      type: "text",
      frameId: "b",
    } as unknown as ExcalidrawElement;
    const unrelated = {
      id: "outside",
      type: "rectangle",
      frameId: "other-frame",
    } as unknown as ExcalidrawElement;
    const elements: ExcalidrawElement[] = [
      frame("a", "Opening", {
        slideshow: {
          schemaVersion: 2,
          kind: "frame",
          order: 0,
          deckName: "Frame deck",
          notes: "Note",
          animation,
        },
      }),
      frame("b", "Close", {
        slideshow: {
          schemaVersion: 2,
          kind: "frame",
          order: 1,
          deckName: "Frame deck",
          excluded: true,
        },
      }),
      framedShape,
      framedText,
      unrelated,
    ];
    (elements[1] as Mutable<ExcalidrawFrameElement>).x = 200;
    const ea = createFakeEa(elements);
    const lineId = await convertFramePresentationToLine(ea);
    const generated = elements.find((element) => element.id === lineId) as ExcalidrawLinearElement;
    const metadata = readLineSlideshowDataV2(generated.customData);

    expect(metadata?.name).toBe("Frame deck (line)");
    expect(metadata?.slides.map((slide) => slide.title)).toEqual(["Opening", "Close"]);
    expect(metadata?.slides[0]?.notes).toBe("Note");
    expect(metadata?.slides[0]?.animation?.steps).toEqual(animation.steps);
    expect(metadata?.slides[1]?.excluded).toBe(true);
    expect(generated.type).toBe("line");
    expect(elements.filter((element) => element.type === "frame")).toHaveLength(2);
    expect(elements.find((element) => element.id === "shape")?.frameId).toBeNull();
    expect(elements.find((element) => element.id === "text")?.frameId).toBeNull();
    expect(elements.find((element) => element.id === "outside")?.frameId).toBe("other-frame");
  });

  it("can create a line from only visible frame slides and delete the source frames", async () => {
    const framedShape = {
      id: "shape",
      type: "rectangle",
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      frameId: "a",
      isDeleted: false,
    } as unknown as ExcalidrawElement;
    const elements: ExcalidrawElement[] = [
      frame("a", "Opening", {
        slideshow: {
          schemaVersion: 2,
          kind: "frame",
          order: 0,
          deckName: "Frame deck",
        },
      }),
      frame("b", "Hidden", {
        slideshow: {
          schemaVersion: 2,
          kind: "frame",
          order: 1,
          deckName: "Frame deck",
          excluded: true,
        },
      }),
      framedShape,
    ];
    (elements[1] as Mutable<ExcalidrawFrameElement>).x = 200;
    const ea = createFakeEa(elements);

    const lineId = await convertFramePresentationToLine(ea, {
      deleteFrames: true,
      visibleSlidesOnly: true,
    });
    const generated = elements.find((element) => element.id === lineId) as ExcalidrawLinearElement;
    const metadata = readLineSlideshowDataV2(generated.customData);

    expect(metadata?.name).toBe("Frame deck");
    expect(metadata?.slides).toHaveLength(1);
    expect(metadata?.slides[0]?.title).toBe("Opening");
    expect(metadata?.slides[0]?.excluded).toBeUndefined();
    expect(elements.find((element) => element.id === "shape")?.frameId).toBeNull();
    expect(elements.filter((element) => element.type === "frame").every((element) => element.isDeleted)).toBe(true);
  });

  it("can create normal frames from a line, assign contained elements, and delete the line", async () => {
    const path = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        name: "Line deck",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [{ id: "one" }, { id: "two" }, { id: "three" }],
      },
    });
    const inside = {
      id: "inside",
      type: "rectangle",
      x: 102,
      y: 202,
      width: 4,
      height: 4,
      frameId: null,
      isDeleted: false,
    } as unknown as ExcalidrawElement;
    const outside = {
      id: "outside",
      type: "rectangle",
      x: 500,
      y: 500,
      width: 4,
      height: 4,
      frameId: null,
      isDeleted: false,
    } as unknown as ExcalidrawElement;
    const elements: ExcalidrawElement[] = [path, inside, outside];
    const ea = createFakeEa(elements);

    await convertLinePresentationToFrames(ea, "path", DEFAULT_SLIDESHOW_CONFIG, {
      correctAspectRatio: false,
      deleteLine: true,
      frameKind: "normal",
    });

    const frames = elements.filter((element): element is ExcalidrawFrameElement => element.type === "frame");
    expect(buildFrameSlideDeck(frames).name).toBe("Line deck");
    expect(frames.every((candidate) => candidate.frameRole === undefined)).toBe(true);
    expect(elements.find((element) => element.id === "path")?.isDeleted).toBe(true);
    expect(elements.find((element) => element.id === "inside")?.frameId).toBe(frames[0]?.id);
    expect(elements.find((element) => element.id === "outside")?.frameId).toBeNull();
  });

  it("keeps marker-frame conversions reference-free and disambiguates a retained line name", async () => {
    const path = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        name: "Line deck",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [{ id: "one" }, { id: "two" }, { id: "three" }],
      },
    });
    const inside = {
      id: "inside",
      type: "rectangle",
      x: 102,
      y: 202,
      width: 4,
      height: 4,
      frameId: null,
      isDeleted: false,
    } as unknown as ExcalidrawElement;
    const elements: ExcalidrawElement[] = [path, inside];
    const ea = createFakeEa(elements);

    await convertLinePresentationToFrames(ea, "path", DEFAULT_SLIDESHOW_CONFIG, {
      correctAspectRatio: false,
      deleteLine: false,
      frameKind: "marker",
    });

    const frames = elements.filter((element): element is ExcalidrawFrameElement => element.type === "frame");
    expect(buildFrameSlideDeck(frames).name).toBe("Line deck (frames)");
    expect(frames.every((candidate) => candidate.frameRole === "marker")).toBe(true);
    expect(elements.find((element) => element.id === "path")?.isDeleted).not.toBe(true);
    expect(elements.find((element) => element.id === "inside")?.frameId).toBeNull();
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
    const first = line(
      {
        slideshow: {
          schemaVersion: 2,
          kind: "path",
          name: "Lecture",
          hidden: false,
          originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
          slides: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
        },
      },
      "path-a",
    );
    const second = line(
      {
        slideshow: {
          schemaVersion: 2,
          kind: "path",
          name: "Lecture",
          hidden: false,
          originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
          slides: [{ id: "b1" }, { id: "b2" }, { id: "b3" }],
        },
      },
      "path-b",
    );
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
    expect(chooseSidepanelPresentationSourceKey(choices, "line:path-b", "frame")).toBe(
      "line:path-b",
    );
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

  it("changes sorter navigation state only when the canvas selection changes", () => {
    const first = getSorterSceneSelectionSignature({
      selectedElementIds: { frameA: true },
      selectedLinearElement: null,
    });
    const sameSelectionAfterMetadataChange = getSorterSceneSelectionSignature({
      selectedElementIds: { frameA: true },
      selectedLinearElement: null,
    });
    const nextSelection = getSorterSceneSelectionSignature({
      selectedElementIds: { frameB: true },
      selectedLinearElement: null,
    });

    expect(sameSelectionAfterMetadataChange).toBe(first);
    expect(nextSelection).not.toBe(first);
  });

  it("maps selected line points only when every point belongs to one slide pair", () => {
    const path = line({
      slideshow: {
        schemaVersion: 2,
        kind: "path",
        hidden: false,
        originalProps: { strokeColor: "#123", backgroundColor: "transparent", locked: false },
        slides: [
          { id: "slideshow-path-1" },
          { id: "slideshow-path-2" },
          { id: "slideshow-path-3" },
        ],
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

  it("persists and clamps the presenter notes font size without deleting other settings", async () => {
    let persisted: Record<string, unknown> = { unrelated: "keep" };
    const ea = {
      getScriptSettings: () => persisted,
      setScriptSettings: async (settings: Record<string, unknown>) => {
        persisted = settings;
      },
    } as unknown as ExcalidrawAutomate;
    expect(loadPresenterNotesFontSize(ea)).toBe(18);
    await savePresenterNotesFontSize(ea, 22.4);
    expect(loadPresenterNotesFontSize(ea)).toBe(22);
    expect(persisted.unrelated).toBe("keep");
    await savePresenterNotesFontSize(ea, 99);
    expect(loadPresenterNotesFontSize(ea)).toBe(48);
  });

  it("persists presenter note font sizes independently per device, setup, and display", async () => {
    let persisted: Record<string, unknown> = { unrelated: "keep" };
    const ea = {
      getScriptSettings: () => persisted,
      setScriptSettings: async (settings: Record<string, unknown>) => {
        persisted = settings;
      },
    } as unknown as ExcalidrawAutomate;

    await savePresenterNotesFontSize(ea, 21, "device-a", "dual-monitor", "display-left");
    await savePresenterNotesFontSize(ea, 31, "device-a", "dual-monitor", "display-right");
    await savePresenterNotesFontSize(ea, 27, "device-b", "dual-monitor", "display-left");

    expect(loadPresenterNotesFontSize(ea, "device-a", "dual-monitor", "display-left")).toBe(21);
    expect(loadPresenterNotesFontSize(ea, "device-a", "dual-monitor", "display-right")).toBe(31);
    expect(loadPresenterNotesFontSize(ea, "device-b", "dual-monitor", "display-left")).toBe(27);
    expect(loadPresenterNotesFontSize(ea, "device-a", "single-monitor", "display-left")).toBe(18);
    expect(persisted.unrelated).toBe("keep");
  });

  it("persists and clamps the sorter thumbnail maximum width without deleting other settings", async () => {
    let persisted: Record<string, unknown> = { unrelated: "keep" };
    const ea = {
      getScriptSettings: () => persisted,
      setScriptSettings: async (settings: Record<string, unknown>) => {
        persisted = settings;
      },
    } as unknown as ExcalidrawAutomate;
    expect(loadSorterThumbnailMaxWidth(ea)).toBe(280);
    await saveSorterThumbnailMaxWidth(ea, 346);
    expect(loadSorterThumbnailMaxWidth(ea)).toBe(346);
    expect(persisted.unrelated).toBe("keep");
    await saveSorterThumbnailMaxWidth(ea, 999);
    expect(loadSorterThumbnailMaxWidth(ea)).toBe(520);
    await saveSorterThumbnailMaxWidth(ea, 80);
    expect(loadSorterThumbnailMaxWidth(ea)).toBe(140);
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

  it("exports only slide-local elements without mutating the EA workbench", async () => {
    const path = line();
    const other = frame("a", "Alpha");
    let exported: ExcalidrawElement[] = [];
    const clear = vi.fn();
    const copyViewElementsToEAforEditing = vi.fn();
    const ea = {
      clear,
      copyViewElementsToEAforEditing,
      getElementsIntersectionArea: (elements: readonly ExcalidrawElement[]) => [...elements],
      createViewPNG: ({ elementsOverride }: { elementsOverride: ExcalidrawElement[] }) => {
        exported = structuredClone(elementsOverride) as ExcalidrawElement[];
        return Promise.resolve(new Blob(["preview"], { type: "image/png" }));
      },
    } as unknown as ExcalidrawAutomate;
    const api = {
      getAppState: () => ({ theme: "light", viewBackgroundColor: "#fff" }),
    } as unknown as ExcalidrawAPI;
    const service = new SlidePreviewService(ea, api, { ...DEFAULT_SLIDESHOW_CONFIG });

    const slide = {
      id: path.id,
      kind: "path",
      pathId: path.id,
      title: "Path slide",
      rect: { x1: 0, y1: 0, x2: 100, y2: 100 },
      excluded: false,
      order: 0,
      pointIndex: 0,
    } as const;
    await (
      service as unknown as {
        exportPreview: (
          elements: readonly ExcalidrawElement[],
          slide: unknown,
          hiddenElementIds: readonly string[],
          originalOpacities: ReadonlyMap<string, number> | undefined,
          targetWidth: number,
          generation: number,
          cacheKey: string,
        ) => Promise<unknown>;
      }
    ).exportPreview([path, other], slide, [], undefined, 480, 0, "test");

    expect(exported.find((element) => element.id === path.id)?.opacity).toBe(0);
    expect(exported.find((element) => element.id === path.id)?.id).toBe(path.id);
    expect(exported.some((element) => element.id === other.id)).toBe(true);
    expect(new Set(exported.map((element) => element.id)).size).toBe(exported.length);
    expect(path.opacity).not.toBe(0);
    expect(clear).not.toHaveBeenCalled();
    expect(copyViewElementsToEAforEditing).not.toHaveBeenCalled();
  });

  it("formats presentation slide titles with current and total slide numbers", () => {
    const t = createSlideshowTranslator("en");
    expect(t("presentationSlideTitle", { title: "Alpha", number: 1, total: 2 })).toBe(
      "Alpha (1/2)",
    );
  });

  it("keeps tiled sorter status badges compact without reserving the old tall header", () => {
    const t = createSlideshowTranslator("en");
    expect(t("notesPresent")).toBe("Notes");
    expect(t("animationCount", { count: 7 })).toBe("7 anims");
    expect(SLIDESHOW_SIDEPANEL_STYLES).toContain(
      ".slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__top { min-height:0",
    );
    expect(SLIDESHOW_SIDEPANEL_STYLES).toContain(
      ".slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__badge-text { display:none; }",
    );
    expect(SLIDESHOW_SIDEPANEL_STYLES).toContain(
      ".slideshow-sorter:not(.has-expanded-editor) .slideshow-sorter__badge-compact-count { display:inline; }",
    );
    expect(SLIDESHOW_PRESENTER_STYLES).toContain(
      ".slideshow-presenter__font-size-control { display:flex",
    );
    expect(SLIDESHOW_PRESENTER_STYLES).toContain(
      ".slideshow-presenter__notes { flex:1 1 auto; min-height:120px; font-size:var(--slideshow-presenter-notes-font-size, 18px)",
    );
    expect(SLIDESHOW_PRESENTER_STYLES).toContain(
      ".slideshow-presenter:not(.is-notes-focused) .slideshow-presenter__controls { align-self:flex-end; }",
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

  it("thumbnail fingerprint ignores frame names and a hidden line presentation path", () => {
    const before = frame("a", "Alpha");
    const renamed = frame("a", "Renamed");
    expect(getSceneVisualFingerprint([before])).toBe(getSceneVisualFingerprint([renamed]));

    const path = line();
    const slide = {
      id: "slide-a",
      kind: "path",
      pathId: path.id,
      title: "Slide A",
      rect: { x1: 0, y1: 0, x2: 100, y2: 100 },
      excluded: false,
      pairIndex: 0,
      animationSteps: [],
    } as const;
    const reorderedPath = {
      ...path,
      x: 500,
      points: [...path.points].reverse(),
    } as unknown as ExcalidrawElement;
    expect(getSlideVisualFingerprint([path, before], slide)).toBe(
      getSlideVisualFingerprint([reorderedPath, before], slide),
    );
  });

  it("reuses slide previews after metadata edits and changes outside the slide crop", async () => {
    const frameA = {
      ...frame("a", "Alpha"),
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    } as ExcalidrawFrameElement;
    const frameB = {
      ...frame("b", "Bravo"),
      x: 5_000,
      y: 0,
      width: 100,
      height: 100,
    } as ExcalidrawFrameElement;
    const contentA = {
      id: "content-a",
      type: "rectangle",
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      strokeColor: "#111",
    } as unknown as ExcalidrawElement;
    const contentB = {
      id: "content-b",
      type: "rectangle",
      x: 5_010,
      y: 10,
      width: 20,
      height: 20,
      strokeColor: "#222",
    } as unknown as ExcalidrawElement;
    let elements: ExcalidrawElement[] = [frameA, contentA, frameB, contentB];
    let workbench: ExcalidrawElement[] = [];
    const createViewPNG = vi.fn(async () => new Blob(["preview"], { type: "image/png" }));
    const ea = {
      getViewElements: () => elements,
      getElementsIntersectionArea: (
        candidates: readonly ExcalidrawElement[],
        area: { x: number; y: number; width: number; height: number },
      ) =>
        candidates.filter((element) => {
          const left = element.x;
          const right = left + element.width;
          return right >= area.x && left <= area.x + area.width;
        }),
      clear: () => {
        workbench = [];
      },
      copyViewElementsToEAforEditing: (candidates: readonly ExcalidrawElement[]) => {
        workbench = structuredClone(candidates) as ExcalidrawElement[];
      },
      getElement: (id: string) => workbench.find((element) => element.id === id),
      getElements: () => workbench,
      createViewPNG,
    } as unknown as ExcalidrawAutomate;
    const api = {
      getAppState: () => ({ theme: "light", viewBackgroundColor: "#fff" }),
    } as unknown as ExcalidrawAPI;
    const service = new SlidePreviewService(ea, api, { ...DEFAULT_SLIDESHOW_CONFIG });
    const [slideA, slideB] = buildFrameSlideDeck([frameA, frameB]).slides;
    if (!slideA || !slideB) throw new Error("Expected two frame slides.");
    const ownerDocument = {
      createElement: () => ({ style: {}, setAttribute: vi.fn() }),
    } as unknown as Document;

    await service.createPreview(slideA, ownerDocument, { targetWidth: 480 });
    await service.createPreview(slideB, ownerDocument, { targetWidth: 480 });
    expect(createViewPNG).toHaveBeenCalledTimes(2);

    elements = elements.map((element) =>
      element.id === frameA.id
        ? ({
            ...element,
            name: "Renamed",
            version: 99,
            customData: { slideshow: { excluded: true, notes: "Notes" } },
          } as unknown as ExcalidrawElement)
        : element,
    );
    await service.createPreview(slideA, ownerDocument, { targetWidth: 480 });
    expect(createViewPNG).toHaveBeenCalledTimes(2);

    elements = elements.map((element) =>
      element.id === contentA.id
        ? ({ ...element, strokeColor: "#f00" } as ExcalidrawElement)
        : element,
    );
    await service.createPreview(slideB, ownerDocument, { targetWidth: 480 });
    expect(createViewPNG).toHaveBeenCalledTimes(2);
    await service.createPreview(slideA, ownerDocument, { targetWidth: 480 });
    expect(createViewPNG).toHaveBeenCalledTimes(3);
    service.clear();
  });
});

describe("slideshow checkpoint 2 element actions", () => {
  it("offers frame slideshow declaration only before any frame has slideshow metadata", () => {
    const selected = frame("a", "Alpha");
    const plainEa = {
      getViewSelectedElement: () => selected,
      getViewElements: () => [selected, frame("b", "Bravo")],
    } as unknown as ExcalidrawAutomate;
    expect(getDeclarableSelectedFrame(plainEa)?.id).toBe("a");

    const declaredEa = {
      getViewSelectedElement: () => selected,
      getViewElements: () => [
        selected,
        frame("b", "Bravo", { slideshow: { schemaVersion: 2, kind: "frame" } }),
      ],
    } as unknown as ExcalidrawAutomate;
    expect(getDeclarableSelectedFrame(declaredEa)).toBeNull();
  });

  it("offers slideshow editing for declared frames and elements with valid slideshow metadata", () => {
    const slideshowFrame = frame("a", "Alpha", {
      slideshow: { schemaVersion: 2, kind: "frame" },
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

  it("reads the latest persisted aspect ratio each time the frame-fit action runs", async () => {
    vi.stubGlobal("app", {});
    const elements: ExcalidrawElement[] = [
      frame("a", "Alpha", { slideshow: { schemaVersion: 2, kind: "frame" } }),
    ];
    const ea = createFakeEa(elements, "a");
    let scriptSettings: Record<string, unknown> = { printSlideWidth: 4, printSlideHeight: 3 };
    let provider:
      | ((element: ExcalidrawElement) => readonly SelectedElementMenuAction[])
      | undefined;
    Object.assign(ea, {
      registerElementActionProvider: (
        getActions: (element: ExcalidrawElement) => readonly SelectedElementMenuAction[],
      ) => {
        provider = getActions;
        return () => undefined;
      },
      getScriptSettings: () => scriptSettings,
    });
    const view = {} as ScriptExcalidrawView;
    registerSlideshowElementActionProvider({
      ea,
      utils: {} as ScriptUtils,
      view,
      config: { ...DEFAULT_SLIDESHOW_CONFIG, printSlideWidth: 16, printSlideHeight: 9 },
      t: createSlideshowTranslator("en"),
    });

    const fit = provider?.(elements[0]!)?.find(
      (action) => action.id === "fit-frame-to-slideshow-aspect",
    );
    fit?.action();
    await Promise.resolve();
    await Promise.resolve();

    const resized = elements[0] as ExcalidrawFrameElement;
    expect(resized.width / resized.height).toBeCloseTo(4 / 3);

    scriptSettings = { printSlideWidth: 3, printSlideHeight: 2 };
    fit?.action();
    await Promise.resolve();
    await Promise.resolve();
    expect(resized.width / resized.height).toBeCloseTo(3 / 2);

    resetSlideshowRuntimeForTests();
    vi.unstubAllGlobals();
  });

  it("opens the clicked frame's deck and requests its sorter row", async () => {
    vi.stubGlobal("app", {});
    const holder: {
      provider?: (element: ExcalidrawElement) => readonly SelectedElementMenuAction[];
    } = {};
    const activations: Array<[
      ScriptExcalidrawView,
      string | undefined,
      string | undefined,
      boolean | undefined,
    ]> = [];
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
      activate: async (activatedView, presentationType, slideId, reassertActiveTab) => {
        activations.push([activatedView, presentationType, slideId, reassertActiveTab]);
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
        icon: "pencil",
      }),
      expect.objectContaining({
        id: "fit-frame-to-slideshow-aspect",
        title: "Fit frame to presentation aspect ratio",
        icon: "ratio",
      }),
    ]);
    actions?.[0]?.action();
    await Promise.resolve();
    await Promise.resolve();
    expect(activations).toEqual([[view, "frame", "a", true]]);
    resetSlideshowRuntimeForTests();
    vi.unstubAllGlobals();
  });

  it("offers slideshow editing on every frame when the scene contains a presentation frame", () => {
    vi.stubGlobal("app", {});
    const slideshowFrame = frame("a", "Alpha", {
      slideshow: { schemaVersion: 2, kind: "frame" },
    });
    const plainFrame = frame("b", "Bravo");
    let provider:
      ((element: ExcalidrawElement) => readonly SelectedElementMenuAction[]) | undefined;
    const view = {} as ScriptExcalidrawView;
    const ea = {
      registerElementActionProvider: (
        getActions: (element: ExcalidrawElement) => readonly SelectedElementMenuAction[],
      ) => {
        provider = getActions;
        return () => undefined;
      },
      getViewElements: () => [slideshowFrame, plainFrame],
    } as unknown as ExcalidrawAutomate;

    registerSlideshowElementActionProvider({
      ea,
      utils: {} as ScriptUtils,
      view,
      config: {} as never,
      t: createSlideshowTranslator("en"),
    });

    expect(provider?.(plainFrame)?.map((action) => action.id)).toEqual([
      "edit-slideshow",
      "fit-frame-to-slideshow-aspect",
    ]);
    resetSlideshowRuntimeForTests();
    vi.unstubAllGlobals();
  });

  it("clears a selected line when the dropdown explicitly switches to frames", () => {
    const selectElements = vi.fn();
    clearLineSelectionForDeckSwitch("frame", line(), {
      selectElements,
    } as unknown as ExcalidrawAPI);
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

    scrollIntoView.mockClear();
    sorter.scrollToSlide("b", false, "start");
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "start" });
  });

  it("allows one explicit thumbnail pass while background preview rendering stays suspended", async () => {
    const previewHost = {
      dataset: { slideId: "a" },
      ownerDocument: {},
      isConnected: true,
      firstElementChild: null,
      replaceChildren: vi.fn(),
    } as unknown as HTMLElement;
    const populatedPreviewHost = {
      dataset: { slideId: "b" },
      ownerDocument: {},
      isConnected: true,
      firstElementChild: {},
      replaceChildren: vi.fn(),
    } as unknown as HTMLElement;
    const createPreview = vi.fn(async () => null);
    const sorter = new SlideSorter({
      ea: { DEVICE: { isDesktop: true, isMobile: false } } as ExcalidrawAutomate,
      container: {
        ownerDocument: { defaultView: {} },
        querySelectorAll: () => [previewHost, populatedPreviewHost],
      } as unknown as HTMLElement,
      deck: buildFrameSlideDeck([frame("a", "Alpha"), frame("b", "Bravo")]),
      previewService: { createPreview } as unknown as SlidePreviewService,
      icons: {} as never,
      t: createSlideshowTranslator("en"),
      reorderEnabled: true,
      previewRenderingEnabled: false,
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

    sorter.refreshPreviews();
    expect(createPreview).not.toHaveBeenCalled();

    sorter.refreshPreviewsOnce();
    await Promise.resolve();
    expect(createPreview).toHaveBeenCalledOnce();

    sorter.refreshPreviews();
    expect(createPreview).toHaveBeenCalledOnce();

    sorter.setPreviewRenderingEnabled(true);
    sorter.refreshPreviews();
    await Promise.resolve();
    expect(createPreview).toHaveBeenCalledTimes(3);
  });

  it("applies inclusion and reorder changes without rebuilding sorter rows", () => {
    const deck = buildFrameSlideDeck([frame("a", "Alpha"), frame("b", "Bravo")]);
    const rowA = { dataset: { slideId: "a" }, querySelector: () => null };
    const rowB = { dataset: { slideId: "b" }, querySelector: () => null };
    const appendChild = vi.fn();
    const insertBefore = vi.fn();
    const sorter = new SlideSorter({
      ea: { DEVICE: { isDesktop: true, isMobile: false } } as ExcalidrawAutomate,
      container: {
        ownerDocument: { defaultView: {} },
        querySelectorAll: () => [rowA, rowB],
        appendChild,
        insertBefore,
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
      updateRowInclusion: ReturnType<typeof vi.fn>;
    };
    internals.updateRowInclusion = vi.fn();

    sorter.applyInclusion("a", true);
    expect(deck.slides[0]?.excluded).toBe(true);
    expect(deck.visibleSlides.map((slide) => slide.id)).toEqual(["b"]);
    expect(internals.updateRowInclusion).toHaveBeenCalledOnce();

    sorter.applyReorder(0, 1);
    expect(deck.slides.map((slide) => slide.id)).toEqual(["b", "a"]);
    expect(appendChild).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledWith(rowA);
    expect(insertBefore).not.toHaveBeenCalled();
  });

  it("pins sorter selection while a frame animation editor is active", async () => {
    const sorter = new SlideSorter({
      ea: { DEVICE: { isDesktop: true, isMobile: false } } as ExcalidrawAutomate,
      container: {
        ownerDocument: { defaultView: {} },
      } as unknown as HTMLElement,
      deck: buildFrameSlideDeck([frame("a", "Alpha"), frame("b", "Bravo")]),
      previewService: {} as SlidePreviewService,
      icons: {} as never,
      t: createSlideshowTranslator("en"),
      reorderEnabled: true,
      animationEditingSlideId: "a",
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

    await sorter.selectFromScene("b");

    expect(sorter.getSelectedSlideId()).toBe("a");
  });

  it("updates canvas-driven sorter selection without rebuilding thumbnail rows", async () => {
    const toggleA = vi.fn();
    const toggleB = vi.fn();
    const rowA = { dataset: { slideId: "a" }, classList: { toggle: toggleA } };
    const rowB = { dataset: { slideId: "b" }, classList: { toggle: toggleB } };
    const container = {
      ownerDocument: { defaultView: {} },
      classList: { toggle: vi.fn() },
      querySelectorAll: vi.fn(() => [rowA, rowB]),
    } as unknown as HTMLElement;
    const sorter = new SlideSorter({
      ea: { DEVICE: { isDesktop: true, isMobile: false } } as ExcalidrawAutomate,
      container,
      deck: buildFrameSlideDeck([frame("a", "Alpha"), frame("b", "Bravo")]),
      previewService: {} as SlidePreviewService,
      icons: {} as never,
      t: createSlideshowTranslator("en"),
      reorderEnabled: true,
      previewRenderingEnabled: false,
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
    const render = vi.spyOn(sorter, "render");
    vi.spyOn(sorter, "scrollToSlide").mockImplementation(() => undefined);

    await sorter.selectFromScene("b");

    expect(sorter.getSelectedSlideId()).toBe("b");
    expect(render).not.toHaveBeenCalled();
    expect(toggleA).toHaveBeenCalledWith("is-selected", false);
    expect(toggleB).toHaveBeenCalledWith("is-selected", true);
  });

  it("resolves moving insertion gaps and edge autoscroll", () => {
    expect(getDropInsertionIndex([100, 200, 300], 50)).toBe(0);
    expect(getDropInsertionIndex([100, 200, 300], 250)).toBe(2);
    expect(getDropInsertionIndex([100, 200, 300], 350)).toBe(3);
    expect(
      getDropInsertionIndexFromRects(
        [
          { left: 0, right: 100, top: 0, bottom: 80 },
          { left: 110, right: 210, top: 0, bottom: 80 },
          { left: 0, right: 100, top: 90, bottom: 170 },
          { left: 110, right: 210, top: 90, bottom: 170 },
        ],
        150,
        20,
      ),
    ).toBe(1);
    const gridRects = [
      { left: 0, right: 100, top: 0, bottom: 80 },
      { left: 110, right: 210, top: 0, bottom: 80 },
      { left: 0, right: 100, top: 90, bottom: 170 },
      { left: 110, right: 210, top: 90, bottom: 170 },
    ];
    expect(getDropInsertionIndexFromRects(gridRects, 20, 120)).toBe(2);
    expect(getDropIndicatorPlacement(gridRects, 2)).toEqual({
      beforeIndex: 2,
      afterIndex: 1,
      singleColumn: false,
    });

    const singleColumnRects = [
      { left: 0, right: 200, top: 0, bottom: 80 },
      { left: 0, right: 200, top: 90, bottom: 170 },
    ];
    expect(isSingleColumnSorterLayout(singleColumnRects)).toBe(true);
    expect(getDropIndicatorPlacement(singleColumnRects, 1)).toEqual({
      beforeIndex: 1,
      afterIndex: null,
      singleColumn: true,
    });

    expect(getDropMoveTarget(1, 0, 4)).toBe(0);
    expect(getDropMoveTarget(1, 2, 4)).toBeNull();
    expect(getDropMoveTarget(1, 4, 4)).toBe(3);

    expect(getDragAutoScrollVelocity(105, 100, 500)).toBeLessThan(0);
    expect(getDragAutoScrollVelocity(300, 100, 500)).toBe(0);
    expect(getDragAutoScrollVelocity(495, 100, 500)).toBeGreaterThan(0);
  });

  it("ignores canvas selection synchronization while presenter notes have focus", async () => {
    const notesDocument: { activeElement: object | null } = { activeElement: null };
    const sorter = new SlideSorter({
      ea: { DEVICE: { isDesktop: true, isMobile: false } } as ExcalidrawAutomate,
      container: {
        ownerDocument: { defaultView: {} },
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
    const internals = sorter as unknown as {
      notesTextarea: { ownerDocument: { activeElement: object | null } } | null;
    };
    const textarea = { ownerDocument: notesDocument };
    notesDocument.activeElement = textarea;
    internals.notesTextarea = textarea;

    await sorter.selectFromScene("b");

    expect(sorter.getSelectedSlideId()).toBe("a");
  });
});

describe("slideshow checkpoint 2 temporary progress", () => {
  beforeEach(() => vi.stubGlobal("app", {}));

  afterEach(() => {
    resetSlideshowRuntimeForTests();
    vi.unstubAllGlobals();
  });

  it("persists an exact default slideshow source independently for each drawing", async () => {
    let settings: Record<string, unknown> = { unrelated: "keep" };
    const ea = {
      getScriptSettings: () => settings,
      setScriptSettings: async (next: Record<string, unknown>) => {
        settings = next;
      },
    } as unknown as ExcalidrawAutomate;

    await saveSlideshowPresentationSource(ea, "Deck A.md", "line:path-a");
    await saveSlideshowPresentationSource(ea, "Deck B.md", "frame");
    expect(loadSlideshowPresentationSource(ea, "Deck A.md")).toBe("line:path-a");
    expect(loadSlideshowPresentationSource(ea, "Deck B.md")).toBe("frame");
    expect(settings.unrelated).toBe("keep");
  });

  it("prefers selection, then the saved exact source, then the legacy type fallback", () => {
    const frameDeck = {
      deck: buildFrameSlideDeck([frame("a", "Alpha")]),
      pathElement: null,
      frames: [],
    };
    const lineResolved = {
      deck: buildFrameSlideDeck([frame("b", "Bravo")]),
      pathElement: line(undefined, "path-a"),
      frames: [],
    };
    const choices = {
      frame: frameDeck,
      lines: [{ key: "line:path-a", pathId: "path-a", name: "A", resolved: lineResolved }],
      line: lineResolved,
      defaultSourceKey: "frame",
      defaultType: "frame",
    } as unknown as ReturnType<typeof resolveSlideDeckChoices>;

    expect(chooseManualPresentationSourceKey(choices, "frame", "line:path-a", "line")).toBe("frame");
    expect(chooseManualPresentationSourceKey(choices, undefined, "line:path-a", "frame")).toBe(
      "line:path-a",
    );
    expect(chooseManualPresentationSourceKey(choices, undefined, undefined, "line")).toBe(
      "line:path-a",
    );
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

  it("associates resume progress independently with exact presentation sources", () => {
    const view = {} as ScriptExcalidrawView;
    setSlideshowProgress(view, 2, "line:path-b");
    setSlideshowProgress(view, 4, "frame");
    setSlideshowProgress(view, 1, "line:path-a");
    expect(getSlideshowProgressType(view)).toBe("line");
    expect(getSlideshowProgressSource(view)).toBe("line:path-a");
    expect(getSlideshowProgressForSource(view, "line:path-b")).toBe(2);
    expect(getSlideshowProgressForSource(view, "frame")).toBe(4);
    expect(getSlideshowProgressForSource(view, "line:path-a")).toBe(1);
    expect(getResumeSlideForPresentation(2, "line", "line", 5, "line:path-b", "line:path-b")).toBe(
      2,
    );
    expect(
      getResumeSlideForPresentation(2, "line", "line", 5, "line:path-b", "line:path-a"),
    ).toBeNull();
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

  it("snapshots manual modifier keys before awaiting autostart permission", async () => {
    vi.stubGlobal("Notice", class {});
    const view = {
      modifierKeyDown: { shiftKey: false, altKey: false, ctrlKey: true, metaKey: false },
    } as ScriptExcalidrawView;
    const activate = vi.fn(async () => undefined);
    getSlideshowRuntime().sidepanel = { activate };
    const scriptEa = {
      targetView: view,
      obsidian: { moment: { locale: () => "en" } },
      verifyMinimumPluginVersion: () => true,
      setView: () => view,
      getViewSelectedElement: () => null,
      registerElementActionProvider: () => () => undefined,
      registerAutostart: async () => {
        (view.modifierKeyDown as ModifierKeyState).ctrlKey = false;
        return "allow" as const;
      },
    } as unknown as ExcalidrawAutomate;

    await runSlideshow(scriptEa, { executionSource: "manual" } as ScriptUtils, {} as never);

    expect(activate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith(view, undefined, undefined, false);
  });

  it("keeps autostart registration-only and launches on the first manual invocation", async () => {
    vi.stubGlobal("Notice", class {});
    const view = {
      modifierKeyDown: { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
      isDirty: () => false,
      forceSave: async () => undefined,
      ownerWindow: {} as Window,
    } as ScriptExcalidrawView;
    let apiAccesses = 0;
    let providerRegistrations = 0;
    let autostartRegistrations = 0;
    const autostartMessages: Array<string | undefined> = [];
    const scriptEa = {
      targetView: view,
      DEVICE: { isMobile: false },
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

    await runSlideshow(scriptEa, { executionSource: "view-autostart" } as ScriptUtils, {} as never);

    expect(providerRegistrations).toBe(1);
    expect(autostartRegistrations).toBe(1);
    expect(apiAccesses).toBe(0);

    await runSlideshow(scriptEa, { executionSource: "manual" } as ScriptUtils, {} as never);

    expect(providerRegistrations).toBe(1);
    expect(autostartRegistrations).toBe(2);
    expect(apiAccesses).toBe(1);
    expect(autostartMessages).toEqual([
      'Autostart is required for registering the "Edit Slide" button. Autostart does not mean slideshows will autostart when opening a drawing.',
      'Autostart is required for registering the "Edit Slide" button. Autostart does not mean slideshows will autostart when opening a drawing.',
    ]);
  });
});

describe("slideshow checkpoint 2 sidepanel launch preparation", () => {
  it("hides a docked sidepanel before measuring windowed presentation but only focuses from a popout", async () => {
    const setActiveLeaf = vi.fn();
    vi.stubGlobal("app", { workspace: { setActiveLeaf } });
    const mainWindow = {
      getComputedStyle: () => ({ display: "block" }),
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
    } as unknown as Window;
    const popoutWindow = {} as Window;
    let containerWindow = mainWindow;
    const container = {
      ownerDocument: {
        get defaultView() {
          return containerWindow;
        },
      },
      isConnected: true,
      getBoundingClientRect: () => ({ width: 300, height: 700 }),
    } as unknown as HTMLElement;
    const toggleSidepanelView = vi.fn();
    const ea = {
      getSidepanelLeaf: () => ({ view: { containerEl: container } }),
      toggleSidepanelView,
    } as unknown as ExcalidrawAutomate;
    const sidepanel = Object.create(SlideshowSidepanel.prototype) as SlideshowSidepanel;
    Object.assign(sidepanel as object, { options: { ea } });
    const prepare = (sidepanel as unknown as {
      prepareWindowedPresentation(view: ScriptExcalidrawView): Promise<void>;
    }).prepareWindowedPresentation.bind(sidepanel);
    const view = { ownerWindow: mainWindow, leaf: {} } as ScriptExcalidrawView;

    await prepare(view);
    expect(toggleSidepanelView).toHaveBeenCalledOnce();
    expect(setActiveLeaf).toHaveBeenCalledWith(view.leaf, { focus: true });

    containerWindow = popoutWindow;
    await prepare(view);
    expect(toggleSidepanelView).toHaveBeenCalledOnce();
    expect(setActiveLeaf).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});

describe("slideshow checkpoint 2 mobile launch behavior", () => {
  it("forces fullscreen slides-only behavior on mobile", () => {
    expect(resolveDeviceLaunchModes(true, "window", "presenter", true)).toEqual({
      startFullscreen: true,
      openPresenterView: false,
    });
    expect(resolveDeviceLaunchModes(false, "window", "presenter", true)).toEqual({
      startFullscreen: false,
      openPresenterView: true,
    });
    expect(resolveDeviceLaunchModes(false, "fullscreen", "presenter", false)).toEqual({
      startFullscreen: true,
      openPresenterView: false,
    });
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
      saveNotes(
        slide: ReturnType<typeof buildFrameSlideDeck>["slides"][number],
        notes: string,
      ): Promise<void>;
    };
    internals.boundView = view;

    const slide = buildFrameSlideDeck(elements as ExcalidrawFrameElement[]).slides[0];
    if (!slide) throw new Error("Expected one frame slide.");
    await internals.saveNotes(slide, "Persist to disk");

    expect(forceSave).toHaveBeenCalledOnce();
    expect(forceSave).toHaveBeenCalledWith(true);
    expect(readFrameSlideshowData(elements[0]?.customData)?.notes).toBe("Persist to disk");
  });

  it("discards stale editor state when the same view opens a different drawing", async () => {
    const ea = {
      setView: vi.fn(),
      clear: vi.fn(),
    } as unknown as ExcalidrawAutomate;
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
    const refresh = vi.spyOn(sidepanel, "refresh").mockResolvedValue();
    const flushNotes = vi.fn(async () => undefined);
    const destroySorter = vi.fn();
    const destroyEditor = vi.fn(async () => undefined);
    const view = { file: { path: "New.excalidraw.md" } } as ScriptExcalidrawView;
    const internals = sidepanel as unknown as {
      bindGeneration: number;
      boundView: ScriptExcalidrawView | null;
      boundDrawingFile: ScriptExcalidrawView["file"] | null;
      sorter: { flushNotes(): Promise<void>; destroy(): void } | null;
      animationEditor: { destroy(): Promise<void> } | null;
      animationEditingSlideId: string | null;
      applyViewBinding(
        view: ScriptExcalidrawView,
        generation: number,
        discardUnsaved: boolean,
      ): Promise<void>;
    };
    internals.bindGeneration = 1;
    internals.boundView = view;
    internals.boundDrawingFile = { path: "Old.excalidraw.md" } as ScriptExcalidrawView["file"];
    internals.sorter = { flushNotes, destroy: destroySorter };
    internals.animationEditor = { destroy: destroyEditor };
    internals.animationEditingSlideId = "old-slide";

    await internals.applyViewBinding(view, 1, true);

    expect(flushNotes).not.toHaveBeenCalled();
    expect(destroySorter).toHaveBeenCalledOnce();
    expect(destroyEditor).toHaveBeenCalledOnce();
    expect(internals.boundDrawingFile).toBe(view.file);
    expect(internals.animationEditor).toBeNull();
    expect(internals.animationEditingSlideId).toBeNull();
    expect(refresh).toHaveBeenCalledWith(true);
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
