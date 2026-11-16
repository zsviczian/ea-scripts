import { afterEach, describe, expect, it, vi } from "vitest";

import { AnimationEditor, type AnimationEditorOptions } from "../AnimationEditor";
import { AnimationRuntime } from "../AnimationRuntime";
import { buildFrameSlideDeck, type SlideDeckSlide } from "../SlideDeck";
import { getHiddenBuildElementIds } from "../SlidePreviewService";
import { createSlideshowTranslator } from "../lang";
import { saveFrameAnimationSteps } from "../slideDeckMutations";
import type { AnimationStep, SlideshowIcons } from "../types";

vi.mock("../slideDeckMutations", () => ({ saveFrameAnimationSteps: vi.fn(async () => undefined) }));

/** Creates a marker frame with two distinct animation targets. */
function scene(): ExcalidrawElement[] {
  return [
    { id: "frame", type: "frame", name: "Slide", width: 400, height: 200 },
    { id: "one", type: "rectangle", x: 20, y: 20, groupIds: ["group"] },
    { id: "two", type: "ellipse", x: 100, y: 20 },
  ].map((shape) => ({
    x: 0, y: 0, width: 20, height: 20, opacity: 65, groupIds: [], angle: 0,
    ...shape,
  })) as unknown as ExcalidrawElement[];
}

/** Makes one saved step, allowing repeated visual targets. */
function step(id: string, effect: AnimationStep["effect"] = "slide"): AnimationStep {
  return { id, targets: [{ type: "element", id: "one" }], effect,
    trigger: "advance", durationMs: 100, direction: "right" };
}

type EditorInternals = {
  selectedStepId: string | null;
  targets: AnimationStep["targets"];
  effect: AnimationStep["effect"];
  direction: "left" | "right" | "up" | "down";
  startNewStep(): void;
  selectStep(step: AnimationStep): void;
  saveCurrentStep(): Promise<void>;
  rememberFormDefaults(): void;
};

/** Creates the real editor with rendering suppressed; native tests exercise the actual controls. */
function editorFixture(steps: AnimationStep[] = []): {
  editor: AnimationEditor; form: EditorInternals; options: AnimationEditorOptions;
  elements: ExcalidrawElement[];
  state: { width: number; height: number; selectedElementIds: Record<string, true>; selectedGroupIds: Record<string, true> };
} {
  const elements = scene();
  const slide = buildFrameSlideDeck(elements.filter((element) => element.type === "frame")).slides[0]!;
  Object.assign(slide, { animationSteps: steps });
  const state = { width: 1000, height: 700, selectedElementIds: {}, selectedGroupIds: {} };
  const options = {
    ea: { getViewElements: () => elements, selectElementsInView: vi.fn((selected: ExcalidrawElement[]) => {
      state.selectedElementIds = Object.fromEntries(selected.map(({ id }) => [id, true as const]));
    }) },
    api: { getAppState: () => state, updateScene: ({ appState }: { appState: Partial<typeof state> }) => Object.assign(state, appState) },
    hostView: { file: {} },
    config: { printSlideWidth: 1920, printSlideHeight: 1080, maxZoom: 30 },
    container: {}, icons: {} as SlideshowIcons, t: createSlideshowTranslator("en"), onSaved: vi.fn(),
    slide,
  } as unknown as AnimationEditorOptions;
  const editor = new AnimationEditor(options);
  vi.spyOn(editor, "render").mockImplementation(() => undefined);
  return { editor, form: editor as unknown as EditorInternals, options, elements, state };
}

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("selection-driven animation editing", () => {
  it("adds consecutive targets with the chosen effect and returns to add mode", async () => {
    const { editor, form, elements, options } = editorFixture();
    editor.captureSelection(elements, { selectedElementIds: { one: true }, selectedGroupIds: {} });
    form.effect = "slide";
    form.direction = "right";
    await form.saveCurrentStep();
    expect(form.selectedStepId).toBeNull();
    // An unrelated scene change must not select the step that was just saved.
    editor.captureSelection(elements, { selectedElementIds: { one: true }, selectedGroupIds: {} });
    expect(form.selectedStepId).toBeNull();
    editor.captureSelection(elements, { selectedElementIds: { two: true }, selectedGroupIds: {} });
    expect(form.selectedStepId).toBeNull();
    expect(form.targets).toEqual([{ type: "element", id: "two" }]);
    expect(form.effect).toBe("slide");
    expect(form.direction).toBe("right");
    await form.saveCurrentStep();
    const saved = vi.mocked(saveFrameAnimationSteps).mock.calls.at(-1)?.[2];
    expect(saved?.map(({ targets, effect, direction }) => ({ targets, effect, direction }))).toEqual([
      { targets: [{ type: "element", id: "one" }], effect: "slide", direction: "right" },
      { targets: [{ type: "element", id: "two" }], effect: "slide", direction: "right" },
    ]);
    expect(options.onSaved).toHaveBeenCalledTimes(2);
  });

  it("selects the first animation from the canvas and can add a third for the same group", async () => {
    const first = { ...step("first"), targets: [{ type: "group" as const, id: "group" }] };
    const second = { ...step("second", "fade-out"), targets: first.targets };
    const { editor, form, elements } = editorFixture([first, second]);
    editor.captureSelection(elements, { selectedElementIds: { one: true }, selectedGroupIds: { group: true } });
    expect(form.selectedStepId).toBe("first");
    form.startNewStep();
    form.effect = "fade";
    await form.saveCurrentStep();
    const saved = vi.mocked(saveFrameAnimationSteps).mock.calls.at(-1)?.[2];
    expect(saved).toHaveLength(3);
    expect(saved?.slice(0, 2)).toEqual([first, second]);
    expect(saved?.[2]?.targets).toEqual(first.targets);
  });

  it("keeps a later step selected through scene notifications and accepts an immediate new selection", () => {
    const { editor, form, elements, state } = editorFixture([step("first"), step("second", "fade")]);
    form.selectStep(step("second", "fade"));
    editor.captureSelection(elements, state);
    expect(form.selectedStepId).toBe("second");
    editor.captureSelection(elements, { selectedElementIds: { two: true }, selectedGroupIds: {} });
    expect(form.selectedStepId).toBeNull();
    expect(form.targets).toEqual([{ type: "element", id: "two" }]);
  });

  it("retains chosen defaults when inspecting existing animations", () => {
    const { editor, form, elements } = editorFixture([step("existing", "fade")]);
    form.effect = "slide-out";
    form.direction = "down";
    form.rememberFormDefaults();
    editor.captureSelection(elements, { selectedElementIds: { one: true }, selectedGroupIds: {} });
    expect(form.effect).toBe("fade");
    editor.captureSelection(elements, { selectedElementIds: { two: true }, selectedGroupIds: {} });
    expect(form.effect).toBe("slide-out");
    expect(form.direction).toBe("down");
  });

  it("updates only the selected repeated step", async () => {
    const first = step("first");
    const second = step("second", "fade-out");
    const { form } = editorFixture([first, second]);
    form.selectStep(second);
    form.effect = "zoom-out";
    await form.saveCurrentStep();
    const saved = vi.mocked(saveFrameAnimationSteps).mock.calls.at(-1)?.[2];
    expect(saved).toHaveLength(2);
    expect(saved?.[0]).toEqual(first);
    expect(saved?.[1]?.effect).toBe("zoom-out");
  });

  it("preserves a new canvas selection while an earlier save is finishing", async () => {
    const { editor, form, elements } = editorFixture();
    let finish: () => void = () => undefined;
    vi.mocked(saveFrameAnimationSteps).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    editor.captureSelection(elements, { selectedElementIds: { one: true }, selectedGroupIds: {} });
    const saving = form.saveCurrentStep();
    editor.captureSelection(elements, { selectedElementIds: { two: true }, selectedGroupIds: {} });
    finish();
    await saving;
    expect(form.targets).toEqual([{ type: "element", id: "two" }]);
    expect(form.selectedStepId).toBeNull();
  });
});

/** Creates a runtime with an actual in-memory scene and frame/timer scheduling. */
function runtimeFixture(steps: AnimationStep[]): {
  runtime: AnimationRuntime; slide: SlideDeckSlide; opacity(): number;
  paints(): number; elements(): ExcalidrawElement[];
} {
  let elements = scene();
  let paints = 0;
  const api = {
    getSceneElements: () => elements,
    getAppState: () => ({ width: 1000, height: 700 }),
    updateScene: ({ elements: next }: { elements: readonly ExcalidrawElement[] }) => { elements = [...next]; },
  } as unknown as ExcalidrawAPI;
  const ownerWindow = {
    setTimeout: globalThis.setTimeout.bind(globalThis), clearTimeout: globalThis.clearTimeout.bind(globalThis),
    requestAnimationFrame: (callback: FrameRequestCallback) => globalThis.setTimeout(() => {
      paints += 1;
      callback(Date.now());
    }, 16), performance: { now: () => Date.now() },
  } as unknown as Window;
  const runtime = new AnimationRuntime({ ea: {} as ExcalidrawAutomate, api, hostView: { ownerWindow } as AnimationEditorOptions["hostView"] });
  const slide = buildFrameSlideDeck(elements.filter((element) => element.type === "frame")).slides[0]!;
  Object.assign(slide, { animationSteps: steps });
  return { runtime, slide, opacity: () => elements[1]!.opacity, paints: () => paints, elements: () => elements };
}

describe("repeated animation playback and handoff", () => {
  it("plays every entrance/exit and reverses to each previous visibility state", async () => {
    const fixture = runtimeFixture([step("a", "appear"), step("b", "disappear"), step("c", "appear"), step("d", "appear")]);
    const { runtime, slide, opacity, elements } = fixture;
    await runtime.enterSlide(slide, false, false);
    expect(runtime.getState().stepCount).toBe(4);
    expect(opacity()).toBe(0);
    for (const visible of [true, false, true, true]) {
      expect(await runtime.advance()).toBe(true);
      expect(opacity()).toBe(visible ? 65 : 0);
    }
    expect(await runtime.advance()).toBe(false);
    for (const [index, visible] of [true, false, true, false].entries()) {
      expect(await runtime.reverse()).toBe(true);
      expect(opacity()).toBe(visible ? 65 : 0);
      expect(getHiddenBuildElementIds(slide, 3 - index, elements()).includes("one")).toBe(!visible);
    }
    await runtime.leaveSlide();
    expect(opacity()).toBe(65);
  });

  it("retains the final motion overlay until the canvas can paint the restored target", async () => {
    vi.useFakeTimers();
    const { runtime, slide, opacity, paints } = runtimeFixture([step("slide")]);
    let restoredAt = -1;
    const remove = vi.fn(() => {
      expect(opacity()).toBe(65);
      expect(paints() - restoredAt).toBeGreaterThanOrEqual(2);
    });
    const internals = runtime as unknown as {
      createOverlay(): Promise<HTMLElement>;
      applyResolvedOpacity: (...args: unknown[]) => void;
    };
    vi.spyOn(internals, "createOverlay").mockResolvedValue({ style: {}, remove,
      getBoundingClientRect: () => ({ width: 100, height: 100 }),
    } as unknown as HTMLElement);
    const apply = internals.applyResolvedOpacity.bind(internals);
    vi.spyOn(internals, "applyResolvedOpacity").mockImplementation((...args) => {
      apply(...args);
      if (args[1] === null) restoredAt = paints();
    });
    await runtime.enterSlide(slide, false, false);
    const playing = runtime.advance();
    await vi.runAllTimersAsync();
    await playing;
    expect(remove).toHaveBeenCalledOnce();
    expect(runtime.getState()).toEqual({ completedSteps: 1, stepCount: 1 });
    await runtime.leaveSlide();
  });
});
