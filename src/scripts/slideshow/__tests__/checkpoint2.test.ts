import { describe, expect, it } from "vitest";

import { getSceneVisualFingerprint } from "../SlidePreviewService";
import { resolvePresentationSetup } from "../presentationPath";
import {
  hasBoundLineEndpoint,
  reorderFrameSlides,
  reorderLineSlides,
  saveFrameNotes,
  saveLineNotes,
  setFrameExcluded,
} from "../slideDeckMutations";
import { readFrameSlideshowData, readLineSlideshowDataV2 } from "../slideshowMetadata";

function frame(id: string, name: string, customData?: Record<string, unknown>): ExcalidrawFrameElement {
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

function line(customData?: Record<string, unknown>): ExcalidrawLinearElement {
  return {
    id: "path",
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

function createFakeEa(elements: ExcalidrawElement[]): ExcalidrawAutomate & { commits: number } {
  let workbench = new Map<string, Mutable<ExcalidrawElement>>();
  const api = {
    targetView: null,
    sidepanelTab: null,
    commits: 0,
    getViewElements: () => elements,
    getViewSelectedElement: () => null,
    cloneElement: <T extends ExcalidrawElement>(element: T) => structuredClone(element) as Mutable<T>,
    clear: () => {
      workbench = new Map();
    },
    copyViewElementsToEAforEditing: (selected: readonly ExcalidrawElement[]) => {
      for (const element of selected) {
        workbench.set(element.id, structuredClone(element) as Mutable<ExcalidrawElement>);
      }
    },
    getElement: <T extends ExcalidrawElement>(id: string) => (workbench.get(id) as Mutable<T>) ?? null,
    addAppendUpdateCustomData: (id: string, patch: Record<string, unknown | undefined>) => {
      const element = workbench.get(id);
      if (!element) return undefined;
      const current = (element.customData ?? {}) as Record<string, unknown>;
      element.customData = { ...current, ...patch };
      return element;
    },
    addElementsToView: async () => {
      for (const [id, edited] of workbench) {
        const index = elements.findIndex((element) => element.id === id);
        if (index >= 0) elements[index] = structuredClone(edited);
      }
      api.commits += 1;
    },
  } as unknown as ExcalidrawAutomate & { commits: number };
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
  });

  it("detects bound endpoints before line reordering", () => {
    const path = line() as ExcalidrawLinearElement & { startBinding: unknown };
    path.startBinding = { elementId: "box" };
    expect(hasBoundLineEndpoint(path)).toBe(true);
  });
});

describe("slideshow checkpoint 2 deck consumption", () => {
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
      cloneElement: <T extends ExcalidrawElement>(element: T) => structuredClone(element) as Mutable<T>,
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
      cloneElement: <T extends ExcalidrawElement>(element: T) => structuredClone(element) as Mutable<T>,
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

  it("thumbnail fingerprint ignores slideshow metadata-only edits", () => {
    const before = frame("a", "Alpha", { slideshow: { schemaVersion: 2, kind: "frame", order: 0 } });
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
