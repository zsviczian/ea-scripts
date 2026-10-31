import { afterEach, expect, it, vi } from "vitest";
import { createNodeEditing } from "../nodeEditing.js";
import { createTextParsing } from "../textParsing.js";
import { createNodeStyles } from "../nodeStyles.js";
import { nodeHost, nativeTextWidth, FixtureEA, lib } from "./textContainerFixture";

afterEach(() => vi.unstubAllGlobals());

it.each(["rectangle", "ellipse", "diamond"])(
  "refits a %s edited from the sidepanel before committing",
  async (shape) => {
    const { ea, nodes } = nodeHost();
    const root = await nodes.addNode("Old", true, true, [], null, null, null, shape);
    const box = ea.getElement(root!.id);
    const text = ea.getElement(box.boundElements[0]!.id);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const writes: string[] = [];
    const ctx = {
      ea: {
        ...ea,
        getViewElements: ea.getViewElements,
        getElement: ea.getElement,
        copyViewElementsToEAforEditing: vi.fn(),
        measureText: ea.measureText,
        refreshTextElementSize: (id: string) =>
          Object.assign(ea.getElement(id), ea.measureText(String(ea.getElement(id).text))),
      },
      editingNodeId: box.id,
      inputEl: { value: "[[Project|Project Launch]]" },
      ontologyEl: { value: "" },
      getTextFromNode: () => "Old",
      parseImageInput: () => null,
      parseEmbeddableInput: () => null,
      parseText: async () => "Project Launch",
      getSettingsRootNode: () => box,
      getRootConfigForNode: () => ({ maxWrapWidth: 300, layoutSettings: { CONTAINER_PADDING: 8 } }),
      getHierarchy: vi.fn(() => ({ rootId: box.id })),
      triggerGlobalLayout: vi.fn(),
      addElementsToView: () => {
        expect(text.width).toBeLessThanOrEqual(nativeTextWidth(box));
        expect(text.text).toBe("Project Launch");
        writes.push("commit");
      },
      api: () => ({ updateContainerSize: vi.fn() }),
    };
    await createNodeEditing(ctx).commitEdit();
    expect(writes).toEqual(["commit"]);
    expect(text.rawText).toBe("[[Project|Project Launch]]");
    expect(text.autoResize).toBe(true);
    expect({ x: box.x + box.width / 2, y: box.y + box.height / 2 }).toEqual(center);
    expect(ctx.getHierarchy).toHaveBeenCalledWith(box, ea.getElements());
    expect(ctx.editingNodeId).toBeNull();
  },
);

it("parses explicit label line breaks without treating them as a malformed single line", async () => {
  const parseText = vi.fn(async (text: string) => text);
  const parsing = createTextParsing({ ea: { parseText } });
  expect(parsing.trimText(" - Project\nLaunch  ")).toBe("Project\nLaunch");
  expect(await parsing.parseText("Project\nLaunch")).toBe("Project\nLaunch");
  expect(parseText).toHaveBeenCalledWith("Project\nLaunch");
});

it.each(["rectangle", "ellipse", "diamond"])(
  "fits a label when adding a %s box to an existing text node",
  async (shape) => {
    const ea = new FixtureEA();
    vi.stubGlobal("ExcalidrawLib", lib);
    const text = ea.element("text", {
      text: "Social Media",
      originalText: "Social Media",
      rawText: "Social Media",
      fontSize: 20,
      fontFamily: 1,
      lineHeight: 1.25,
      textAlign: "center",
      verticalAlign: "middle",
      customData: { growthMode: "Right-facing" },
      width: 120,
      height: 25,
    });
    const createShape =
      (type: string) =>
      (x: number, y: number, width: number, height: number): string =>
        ea.element(type, { x, y, width, height }).id;
    const ctx = {
      ea: {
        ...ea,
        getViewElements: ea.getViewElements,
        getElement: ea.getElement,
        getBoundTextElement: () => ({ sceneElement: text }),
        getCM: ea.getCM,
        copyViewElementsToEAforEditing: vi.fn(),
        addAppendUpdateCustomData: ea.addAppendUpdateCustomData,
        addRect: createShape("rectangle"),
        addEllipse: createShape("ellipse"),
        addDiamond: createShape("diamond"),
        moveViewElementToZIndex: vi.fn(),
        getElements: ea.getElements,
      },
      isViewSet: () => true,
      getMindmapNodeFromSelection: () => text,
      getHierarchy: () => ({ depth: 0 }),
      padding: 10,
      getStrokeWidthForDepth: () => 2,
      getAppState: () => ({}),
      getSettingsRootNode: () => text,
      getRootConfigForNode: () => ({
        maxWrapWidth: 450,
        layoutSettings: { CONTAINER_PADDING: 10 },
      }),
      addElementsToView: vi.fn(),
      api: () => ({ updateContainerSize: vi.fn() }),
      selectNodeInView: vi.fn(),
      autoLayoutDisabled: true,
      updateUI: vi.fn(),
    };
    await createNodeStyles(ctx).toggleBox(shape);
    const box = ea.getElement(String(text.containerId));
    expect(text.text).toBe("Social Media");
    expect(text.width).toBeLessThanOrEqual(nativeTextWidth(box));
    expect(box.customData.growthMode).toBe("Right-facing");
    expect(ctx.addElementsToView).toHaveBeenCalledTimes(1);
  },
);
