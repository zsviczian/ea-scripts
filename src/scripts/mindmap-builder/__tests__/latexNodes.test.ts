import { afterEach, expect, it, vi } from "vitest";
import { createNodeEditing } from "../nodeEditing.js";
import { createTextParsing } from "../textParsing.js";
import { createNodes } from "../nodes.js";
import { nodeHost, type FixtureElement } from "./textContainerFixture";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function equationHost(): ReturnType<typeof nodeHost> & { addLaTex: ReturnType<typeof vi.fn> } {
  const host = nodeHost();
  const addLaTex = vi.fn(
    async (x: number, y: number, latex: string) =>
      host.ea.element("image", { x, y, fileId: `file-${latex}`, customData: { latex } }).id,
  );
  Object.assign(host.ea, { addLaTex });
  return { ...host, addLaTex };
}

it("adds equations as root and child images with branch bindings and root settings", async () => {
  const { ea, nodes, addLaTex } = equationHost();
  const root = await nodes.addNode("$$x=5$$", true, true, [], null);
  expect(root).toMatchObject({ type: "image", customData: { growthMode: "Right-facing" } });
  const child = await nodes.addNode(" $$\\frac{x}{2}$$ ", true, true, ea.getElements(), root);
  expect(child).toMatchObject({ type: "image", customData: { mindmapOrder: 1 } });
  expect(addLaTex.mock.calls.map((args) => args[2])).toEqual(["x=5", "\\frac{x}{2}"]);
  expect(ea.getElements().find((e) => e.type === "arrow")).toMatchObject({
    startBinding: { elementId: root?.id },
    endBinding: { elementId: child?.id },
    customData: { isBranch: true },
  });
});

it.each(["$x=5$", "before $$x=5$$", "$$x=5$$ after", "$$$$", "$$  $$", "$$x$$ $$y$$"])(
  "keeps %s as an ordinary text node",
  async (input) => {
    const { nodes, addLaTex } = equationHost();
    const node = await nodes.addNode(input, true, true, [], null);
    expect(node?.type).toBe("rectangle");
    expect(addLaTex).not.toHaveBeenCalled();
  },
);

it("restores saved equation source before attempting ordinary image-file lookup", () => {
  const getFile = vi.fn();
  const parsing = createTextParsing({
    ea: { targetView: { excalidrawData: { getEquation: () => ({ latex: "x=5" }), getFile } } },
  });
  const node = { type: "image", fileId: "equation" };
  expect(parsing.getTextFromNode([], node, true, true)).toBe("$$x=5$$");
  expect(parsing.getTextFromNode([], node)).toBe("$$x=5$$");
  expect(getFile).not.toHaveBeenCalled();
});

function editHost(
  node: FixtureElement,
  input: string,
  ea: ReturnType<typeof nodeHost>["ea"],
): {
  ctx: {
    editingNodeId: string | null;
    inputEl: { value: string; focus: ReturnType<typeof vi.fn> };
    ontologyEl: { value: string };
    addElementsToView: ReturnType<typeof vi.fn>;
  };
  editing: ReturnType<typeof createNodeEditing>;
} {
  const ctx = {
    ea: Object.assign(ea, {
      copyViewElementsToEAforEditing: vi.fn(),
      getBoundTextElement: vi.fn(),
    }),
    editingNodeId: node.id as string | null,
    inputEl: { value: input, focus: vi.fn() },
    ontologyEl: { value: "" },
    getTextFromNode: createTextParsing({ ea }).getTextFromNode,
    parseImageInput: () => null,
    parseEmbeddableInput: () => null,
    getAppState: () => ({}),
    getHierarchy: () => ({ depth: 0, rootId: node.id }),
    scaleDecorations: vi.fn(),
    addElementsToView: vi.fn(),
    autoLayoutDisabled: true,
    getMindmapNodeFromSelection: () => node,
    revealInputEl: () => false,
    updateUI: vi.fn(),
  };
  return { ctx, editing: createNodeEditing(ctx) };
}

it("loads $$equation$$ into the node editor and leaves an unchanged equation untouched", async () => {
  vi.useFakeTimers();
  const { ea } = equationHost();
  const node = ea.element("image", { customData: { latex: "x=5" } });
  const { ctx, editing } = editHost(node, "", ea);
  editing.startEditing();
  vi.runAllTimers();
  expect(ctx.inputEl.value).toBe("$$x=5$$");
  await editing.commitEdit();
  expect(ctx.addElementsToView).not.toHaveBeenCalled();
  expect(node.isDeleted).toBeUndefined();
});

it.each(["image", "text"])(
  "converts an edited %s node to an equation and preserves connections",
  async (type) => {
    const { ea, addLaTex } = equationHost();
    const node = ea.element(type, {
      rawText: "Old",
      customData: {
        latex: type === "image" ? "x=5" : undefined,
        mindmapOrder: 2,
        presetName: "My preset",
        customPalette: { enabled: true, colors: ["#ff0000"] },
      },
      x: 20,
      y: 40,
    });
    const arrow = ea.element("arrow", {
      startBinding: { elementId: node.id },
      points: [
        [0, 0],
        [100, 0],
      ],
    });
    const { ctx, editing } = editHost(node, "$$x=6$$", ea);
    await editing.commitEdit();
    const replacement = ea.getElements().find((e) => e.customData.latex === "x=6");
    expect(addLaTex).toHaveBeenCalledWith(0, 0, "x=6");
    expect(replacement).toMatchObject({
      type: "image",
      x: 20,
      y: 40,
      customData: {
        mindmapOrder: 2,
        presetName: "My preset",
        customPalette: { enabled: true, colors: ["#ff0000"] },
      },
    });
    expect(arrow.startBinding).toEqual({ elementId: replacement?.id });
    expect(node.isDeleted).toBe(true);
    expect(ctx.addElementsToView).toHaveBeenCalledOnce();
  },
);

it("keeps an existing node when equation rendering returns no image", async () => {
  const { ea, addLaTex } = equationHost();
  addLaTex.mockResolvedValue(null);
  const node = ea.element("text", { rawText: "Old" });
  const { ctx, editing } = editHost(node, "$$x=6$$", ea);
  await editing.commitEdit();
  expect(node.isDeleted).toBeUndefined();
  expect(ctx.addElementsToView).not.toHaveBeenCalled();
  expect(ctx.inputEl.value).toBe("$$x=6$$");
});

it("does not add a root when equation rendering returns no image", async () => {
  const { ea, nodes, addLaTex } = equationHost();
  addLaTex.mockResolvedValue(null);
  expect(await nodes.addNode("$$x=5$$", true, true, [], null)).toBeUndefined();
  expect(ea.getElements()).toEqual([]);
});

it("saves the equation image when adding through the interactive node path", async () => {
  const { ea, context } = equationHost();
  Object.assign(ea, { clear: vi.fn(), getViewSelectedElement: () => null });
  const commit = vi.fn();
  const nodes = createNodes({
    ...context,
    getMindmapNodeFromSelection: () => null,
    addElementsToView: commit,
    selectNodeInView: vi.fn(),
    zoomToFit: vi.fn(),
    focusInputEl: vi.fn(),
    triggerGlobalLayout: vi.fn(),
  });
  expect((await nodes.addNode("$$x=5$$"))?.type).toBe("image");
  expect(commit).toHaveBeenCalledWith(expect.objectContaining({ save: true }));
});

it("still extracts ordinary image links when no equation is registered", () => {
  const parsing = createTextParsing({
    ea: {
      targetView: {
        excalidrawData: {
          getEquation: () => undefined,
          getFile: () => ({ linkParts: { original: "photo.png" } }),
        },
      },
      getViewFileForImageElement: () => ({ path: "folder/photo.png" }),
    },
  });
  const image = { type: "image", width: 200, fileId: "photo" };
  expect(parsing.getTextFromNode([], image, true, true)).toBe("![[photo.png|200]]");
  expect(parsing.getTextFromNode([], image)).toBe("![[folder/photo.png|200]]");
});

it.each(["Right-facing", "Left-facing", "Up-facing", "Down-facing"])(
  "places equation children with rendered dimensions in %s layouts",
  async (growthMode) => {
    for (const autoLayoutDisabled of [false, true]) {
      const { ea, context } = equationHost();
      const parent = ea.element("image", { customData: { growthMode } });
      const nodes = createNodes({
        ...context,
        autoLayoutDisabled,
        layoutSettings: { MANUAL_GAP_MULTIPLIER: 1, MANUAL_JITTER_RANGE: 0 },
      });
      const child = await nodes.addNode("$$x=5$$", true, true, [parent], parent);
      expect(Number.isFinite(child?.x)).toBe(true);
      expect(Number.isFinite(child?.y)).toBe(true);
      if (autoLayoutDisabled && growthMode === "Up-facing") {
        expect(child?.y).toBe(parent.y - parent.height - child!.height);
      }
    }
  },
);

it("converts an equation back to text when its math delimiters are removed", async () => {
  const { ea, context } = equationHost();
  const node = ea.element("image", { customData: { latex: "x=5" } });
  const { ctx, editing } = editHost(node, "x=5", ea);
  Object.assign(ctx, {
    getFontScale: context.getFontScale,
    getStrokeWidthForDepth: context.getStrokeWidthForDepth,
    parseText: context.parseText,
    maxWidth: 450,
  });
  await editing.commitEdit();
  expect(node.isDeleted).toBe(true);
  expect(ea.getElements().find((e) => e.type === "text")).toMatchObject({ rawText: "x=5" });
});
