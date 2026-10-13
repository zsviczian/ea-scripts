import { afterEach, expect, it, vi } from "vitest";
import { createBranchPaste } from "../branchPaste.js";
import type { BranchElement, BranchClipboard } from "../branchClipboard";

type Listener = (elements: BranchElement[]) => void;
interface TestHost {
  ctx: {
    triggerGlobalLayout: ReturnType<typeof vi.fn>;
    selectNodeInView: ReturnType<typeof vi.fn>;
    addElementsToView: ReturnType<typeof vi.fn>;
    api: () => { updateScene: (args: { elements: BranchElement[] }) => void };
  };
  parent: BranchElement;
  scene: () => BranchElement[];
  listeners: Set<Listener>;
  cleanups: (() => void)[];
  notices: string[];
  emit: () => void;
  dispatched: () => number;
  changeView: () => void;
  pointerListeners: Set<() => void>;
}
const node = (id: string, text: string, customData = {}): BranchElement => ({
  id,
  type: "text",
  rawText: text,
  x: 0,
  y: 0,
  width: 100,
  height: 20,
  strokeColor: "#ff0000",
  roughness: 0,
  groupIds: [],
  boundElements: [],
  customData,
});
const payload = (): BranchClipboard => ({
  type: "excalidraw/clipboard",
  files: { kept: true },
  elements: [
    node("root", "Root", { mindmapOrder: 0, boundaryId: "boundary", foldIndicatorId: "fold" }),
    node("leaf", "Leaf", { mindmapOrder: 0 }),
    node("note", "Note", { userValue: "keep" }),
    { ...node("boundary", "Boundary"), type: "line", customData: { isBoundary: true } },
    node("fold", "..."),
    {
      id: "edge",
      type: "arrow",
      customData: { isBranch: true },
      startBinding: { elementId: "root" },
      endBinding: { elementId: "leaf" },
    },
  ],
});

/** Fake only the host boundary; real branch parsing, correlation and attachment code runs. */
// eslint-disable-next-line max-lines-per-function -- One fixture assembles the mocked host boundary, not production behavior.
function host(defer = false): TestHost {
  const parent = node("parent", "Destination", { growthMode: "Right-facing" });
  let scene = [parent];
  const workbench = new Map<string, BranchElement>();
  const listeners = new Set<Listener>();
  const cleanups: (() => void)[] = [];
  const notices: string[] = [];
  const pointerListeners = new Set<() => void>();
  let dispatched = 0;
  let sequence = 0;
  const emit = (): void => listeners.forEach((f) => f(scene));
  class EventStub {
    constructor(
      public type: string,
      public options: { clipboardData?: TransferStub } = {},
    ) {}
  }
  class TransferStub {
    text = "";
    setData(_type: string, text: string): void {
      this.text = text;
    }
  }
  const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }) };
  const container = {
    querySelector: () => canvas,
    focus: vi.fn(),
    dispatchEvent(event: EventStub) {
      if (event.type !== "paste") return;
      dispatched++;
      const data = JSON.parse(event.options.clipboardData!.text) as BranchClipboard;
      const ids = new Map(data.elements.map((e) => [e.id, `new-${e.id}`]));
      scene = [
        ...scene,
        ...data.elements.map((e) => ({
          ...e,
          id: ids.get(e.id)!,
          startBinding: e.startBinding ? { elementId: ids.get(e.startBinding.elementId)! } : null,
          endBinding: e.endBinding ? { elementId: ids.get(e.endBinding.elementId)! } : null,
        })),
      ];
      if (!defer) queueMicrotask(emit);
    },
  };
  const view = {
    file: { path: "test.md" },
    ownerDocument: {
      elementFromPoint: () => canvas,
      addEventListener: (_type: string, callback: () => void): void => {
        pointerListeners.add(callback);
      },
      removeEventListener: (_type: string, callback: () => void): void => {
        pointerListeners.delete(callback);
      },
    },
    contentEl: { querySelector: () => container },
    ownerWindow: {
      PointerEvent: EventStub,
      ClipboardEvent: EventStub,
      DataTransfer: TransferStub,
      setTimeout,
      clearTimeout,
    },
  };
  const api = {
    isDestroyed: false,
    getAppState: () => ({}),
    getSceneElementsIncludingDeleted: () => scene,
    getSceneElements: () => scene,
    onChange: (f: Listener) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    updateScene: ({ elements }: { elements: BranchElement[] }) => {
      scene = elements;
    },
  };
  const ea = {
    targetView: view as typeof view | null,
    sidepanelTab: {},
    style: {},
    registerCleanup: (f: () => void) => cleanups.push(f),
    generateElementId: () => String(++sequence),
    getViewElements: () => scene,
    getElement: (id: string) => workbench.get(id),
    getElements: () => [...workbench.values()],
    clear: () => workbench.clear(),
    copyViewElementsToEAforEditing: (els: BranchElement[]) =>
      els.forEach((e) => workbench.set(e.id, structuredClone(e))),
    addAppendUpdateCustomData: (id: string, data: object) => {
      const e = workbench.get(id)!;
      e.customData = { ...e.customData, ...data };
    },
    addArrow: (_points: unknown, opts: { startObjectId: string; endObjectId: string }) => {
      const id = `connection-${++sequence}`;
      workbench.set(id, {
        id,
        type: "arrow",
        startBinding: { elementId: opts.startObjectId },
        endBinding: { elementId: opts.endObjectId },
      });
      return id;
    },
  };
  const ctx = {
    ea,
    api: () => api,
    isViewSet: () => !!ea.targetView,
    t: (key: string) => key,
    Notice: class {
      constructor(message: string) {
        notices.push(message);
      }
    },
    getSettingsRootNode: () => parent,
    initializeRootCustomData: (id: string): void =>
      ea.addAppendUpdateCustomData(id, { growthMode: "Right-facing" }),
    getRootConfigForNode: () => ({
      growthMode: "Right-facing",
      autoLayoutDisabled: true,
      baseStrokeWidth: 6,
      branchScale: "Uniform",
      isSolidArrow: true,
    }),
    getDepthFromAncestor: () => 0,
    getChildrenNodes: () => [],
    getMindmapOrder: () => 0,
    calculateStrokeWidth: () => 6,
    configureArrow: vi.fn(),
    getAppState: () => ({}),
    withRootLayoutContext: (_root: unknown, fn: () => void) => fn(),
    selectNodeInView: vi.fn(),
    focusInputEl: vi.fn(),
    triggerGlobalLayout: vi.fn(),
    getHierarchy: () => ({ rootId: parent.id }),
    getMindmapProjectElements: () => scene,
    updateBranchVisibility: (_id: string, _hide: boolean, elements: BranchElement[]): void => {
      // Existing fold visibility restores locking for every element it visits.
      elements.forEach((element) => {
        element.locked = false;
      });
    },
    addElementsToView: vi.fn(async () => {
      scene = scene.map((e) => workbench.get(e.id) ?? e);
      workbench.forEach((e) => {
        if (!scene.some((s) => s.id === e.id)) scene.push(e);
      });
      workbench.clear();
    }),
  };
  vi.stubGlobal("ExcalidrawLib", {
    getSceneVersion: (elements: BranchElement[]) => elements.length,
    newElementWith: (e: BranchElement, patch: object) => ({ ...e, ...patch }),
  });
  return {
    ctx,
    parent,
    scene: () => scene,
    listeners,
    cleanups,
    notices,
    emit,
    dispatched: () => dispatched,
    changeView: () => {
      ea.targetView = null;
    },
    pointerListeners,
  };
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("attaches only the correlated duplicates and remaps decoration IDs, preserving copied content", async () => {
  const h = host();
  const controller = createBranchPaste(h.ctx);
  expect(await controller.pasteBranch(payload(), h.parent)).toBe(true);
  const root = h.scene().find((e) => e.id === "new-root")!;
  expect(root.customData).toEqual({
    mindmapOrder: 1,
    boundaryId: "new-boundary",
    foldIndicatorId: "new-fold",
  });
  expect(h.scene().find((e) => e.id === "new-note")?.customData).toEqual({ userValue: "keep" });
  expect(h.scene().find((e) => e.id.startsWith("connection"))).toMatchObject({
    customData: { isBranch: true },
    startBinding: { elementId: "parent" },
    endBinding: { elementId: "new-root" },
  });
  expect(h.ctx.triggerGlobalLayout).not.toHaveBeenCalled();
  expect(h.ctx.selectNodeInView).toHaveBeenCalledWith(h.parent);
  expect(h.notices).toEqual(["NOTICE_PASTE_COMPLETE"]);
  expect(h.listeners.size).toBe(1); // history metadata repair, owned by this script EA
  controller.disposeBranchPaste();
  expect(h.listeners.size).toBe(0);
  expect(controller.isBranchPasteBusy()).toBe(false);
  expect(h.pointerListeners.size).toBe(0);
});

it("pastes an independent map without a destination and keeps an attached whole map as a submap", async () => {
  const h = host();
  const data = payload();
  data.elements[0]!.customData!.growthMode = "Radial";
  const controller = createBranchPaste(h.ctx);
  await controller.pasteBranch(data);
  expect(h.scene().filter((e) => e.id.startsWith("connection"))).toHaveLength(0);
  await controller.pasteBranch(data, h.parent);
  expect(h.scene().find((e) => e.id === "new-root")?.customData?.isAdditionalRoot).toBe(true);
});

it("unfolds the destination without changing a copied note's manual lock state", async () => {
  const h = host();
  h.parent.customData!.isFolded = true;
  const data = payload();
  data.elements.find((e) => e.id === "note")!.locked = true;
  const controller = createBranchPaste(h.ctx);
  await controller.pasteBranch(data, h.parent);
  expect(h.scene().find((e) => e.id === "parent")?.customData?.isFolded).toBe(false);
  expect(h.scene().find((e) => e.id === "new-note")?.locked).toBe(true);
  controller.disposeBranchPaste();
});

it("does not dispatch native paste for invalid graphs or ordinary Excalidraw content", async () => {
  const h = host();
  const controller = createBranchPaste(h.ctx);
  expect(
    await controller.pasteBranch(
      { type: "excalidraw/clipboard", elements: [node("ordinary", "Plain")] },
      h.parent,
    ),
  ).toBe(false);
  const data = payload();
  data.elements.push({
    id: "cycle",
    type: "arrow",
    customData: { isBranch: true },
    startBinding: { elementId: "leaf" },
    endBinding: { elementId: "root" },
  });
  expect(await controller.pasteBranch(data, h.parent)).toBe(true);
  expect(h.dispatched()).toBe(0);
});

it("cancels on teardown without attaching, removes transport tags and completion listeners", async () => {
  const h = host(true);
  const controller = createBranchPaste(h.ctx);
  const waiting = controller.pasteBranch(payload(), h.parent);
  expect(controller.isBranchPasteBusy()).toBe(true);
  h.cleanups.forEach((f) => f());
  await waiting;
  expect(h.listeners.size).toBe(0);
  expect(h.ctx.addElementsToView).not.toHaveBeenCalled();
  expect(
    h
      .scene()
      .every((e) => !Object.keys(e.customData ?? {}).some((k) => k.startsWith("__mindmapPaste_"))),
  ).toBe(true);
});

it("times out without inferring unrelated elements as a branch and prevents overlapping pastes", async () => {
  vi.useFakeTimers();
  const h = host(true);
  const controller = createBranchPaste(h.ctx);
  const waiting = controller.pasteBranch(payload(), h.parent);
  await controller.pasteBranch(payload(), h.parent);
  expect(h.dispatched()).toBe(1);
  await vi.advanceTimersByTimeAsync(5001);
  await waiting;
  controller.disposeBranchPaste();
  expect(h.listeners.size).toBe(0);
  expect(h.notices).toContain("NOTICE_BRANCH_PASTE_FAILED");
});

it("abandons attachment when the host changes drawings while native paste is pending", async () => {
  const h = host(true);
  const controller = createBranchPaste(h.ctx);
  const waiting = controller.pasteBranch(payload(), h.parent);
  h.changeView();
  h.emit();
  await waiting;
  expect(h.ctx.addElementsToView).not.toHaveBeenCalled();
  expect(h.pointerListeners.size).toBe(0);
  controller.disposeBranchPaste();
  expect(h.listeners.size).toBe(0);
});

it("repairs transport metadata and source IDs resurrected by native Undo without another capture", async () => {
  const h = host();
  const controller = createBranchPaste(h.ctx);
  await controller.pasteBranch(payload(), h.parent);
  const elements = h.scene().map((e) =>
    e.id === "new-root"
      ? {
          ...e,
          customData: {
            mindmapOrder: 0,
            boundaryId: "boundary",
            foldIndicatorId: "fold",
            __mindmapPaste_1: "root",
          },
        }
      : e,
  );
  h.ctx.api().updateScene({ elements });
  h.emit();
  expect(h.scene().find((e) => e.id === "new-root")?.customData).toEqual({
    mindmapOrder: 0,
    boundaryId: "new-boundary",
    foldIndicatorId: "new-fold",
  });
  controller.disposeBranchPaste();
  expect(h.listeners.size).toBe(0);
});

it("recovers references from an old invocation's native Undo snapshot when Builder reopens", async () => {
  const h = host();
  const controller = createBranchPaste(h.ctx);
  await controller.pasteBranch(payload(), h.parent);
  controller.disposeBranchPaste();
  const elements = h.scene().map((e) =>
    e.id.startsWith("new-")
      ? {
          ...e,
          customData: {
            ...e.customData,
            __mindmapPaste_retired: e.id.slice(4),
            ...(e.id === "new-root" ? { boundaryId: "boundary", foldIndicatorId: "fold" } : {}),
          },
        }
      : e,
  );
  h.ctx.api().updateScene({ elements });
  const reopened = createBranchPaste(h.ctx);
  expect(h.scene().find((e) => e.id === "new-root")?.customData).toEqual({
    mindmapOrder: 1,
    boundaryId: "new-boundary",
    foldIndicatorId: "new-fold",
  });
  expect(
    h
      .scene()
      .every((e) => !Object.keys(e.customData ?? {}).some((k) => k.startsWith("__mindmapPaste_"))),
  ).toBe(true);
  reopened.disposeBranchPaste();
  expect(h.listeners.size).toBe(0);
});
