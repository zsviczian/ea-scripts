import { afterEach, expect, it, vi } from "vitest";
import { createMarkdownImport } from "../markdownImport.js";
import { createMarkdownExport } from "../markdownExport.js";
import { createMermaidExport } from "../mermaidExport.js";
import { parseMermaidMindmap } from "../mermaid";

interface TestNode {
  id: string;
  text: string;
  type: string;
  parent: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  customData: Record<string, unknown>;
}

type AddNode = (
  text: string,
  follow: boolean,
  skip: boolean,
  all: unknown,
  parent: TestNode | null,
  pos: unknown,
  ontology: unknown,
  shape: string | null,
  markdownImage?: import("../markdownImages").LocalMarkdownImage,
) => Promise<TestNode>;

interface TestHost {
  ctx: {
    addNode: ReturnType<typeof vi.fn<AddNode>>;
    addElementsToView: ReturnType<typeof vi.fn>;
    triggerGlobalLayout: ReturnType<typeof vi.fn>;
    [key: string]: unknown;
  };
  scene: TestNode[];
  notices: string[];
  clipboard: Record<"readText" | "writeText" | "read", ReturnType<typeof vi.fn>>;
}

/** Hosts the real import/export factories with scene writes and clipboard access stubbed. */
function host(selected = false): TestHost {
  const scene: TestNode[] = [];
  const notices: string[] = [];
  const clipboard = { readText: vi.fn(), writeText: vi.fn(), read: vi.fn() };
  vi.stubGlobal("navigator", { clipboard });
  vi.stubGlobal("sleep", vi.fn());
  vi.stubGlobal("app", { vault: { getConfig: (key: string) => (key === "tabSize" ? 2 : false) } });
  const ctx = {
    isViewSet: () => true,
    ensureNodeSelected: vi.fn(),
    getMindmapNodeFromSelection: (): TestNode | undefined => (selected ? scene[0] : undefined),
    currentModalGrowthMode: "Right-facing",
    api: () => ({ onChange: () => vi.fn(), getSceneElementsIncludingDeleted: () => scene }),
    t: (key: string) => key,
    Notice: class {
      constructor(message: string) {
        notices.push(message);
      }
      setMessage = vi.fn();
      setAutoHide = vi.fn();
    },
    ea: {
      clear: vi.fn(),
      getViewElements: () => scene,
      getElements: () => scene,
      getElement: (id: string) => scene.find((node) => node.id === id),
      copyViewElementsToEAforEditing: vi.fn(),
    },
    addNode: vi.fn(
      async (
        text: string,
        _follow: boolean,
        _skip: boolean,
        _all: unknown,
        parent: TestNode | null,
        _pos: unknown,
        _ontology: unknown,
        shape: string | null,
      ) => {
        const node: TestNode = {
          id: `node-${scene.length}`,
          text,
          type: shape ?? "text",
          parent: parent?.id ?? null,
          x: 0,
          y: scene.length * 50,
          width: 100,
          height: 30,
          customData: {},
        };
        scene.push(node);
        return node;
      },
    ),
    getHierarchy: () => ({ rootId: scene[0]!.id }),
    getMindmapProjectElements: () => scene,
    getChildrenNodes: (id: string) => scene.filter((node) => node.parent === id),
    getParentNode: (id: string) =>
      scene.find((node) => node.id === scene.find((n) => n.id === id)?.parent),
    getBranchElementIds: () => scene.map((node) => node.id),
    getTextFromNode: (_all: unknown, node: TestNode) => node.text,
    selectNodeInView: vi.fn(),
    triggerGlobalLayout: vi.fn(),
    addElementsToView: vi.fn(),
  };
  return { ctx, scene, notices, clipboard };
}

afterEach(() => vi.unstubAllGlobals());

it("pastes fenced Mermaid through the clipboard dispatcher before reading an image preview", async () => {
  const h = host();
  h.clipboard.readText.mockResolvedValue(
    "```mermaid\nmindmap\n root((Root))\n   a[Child]\n     b{Leaf}\n   Sibling\n```",
  );
  await createMarkdownImport(h.ctx).pasteElementToMap();
  expect(h.scene.map(({ text, type, parent }) => ({ text, type, parent }))).toEqual([
    { text: "Root", type: "ellipse", parent: null },
    { text: "Child", type: "rectangle", parent: "node-0" },
    { text: "Leaf", type: "diamond", parent: "node-1" },
    { text: "Sibling", type: "text", parent: "node-0" },
  ]);
  expect(h.clipboard.read).not.toHaveBeenCalled();
  expect(h.ctx.addElementsToView).toHaveBeenCalledTimes(1);
  expect(h.ctx.triggerGlobalLayout).toHaveBeenCalledWith("node-0");
});

it("attaches a single Mermaid root beneath a selected node and rejects multiple roots without writes", async () => {
  const h = host(true);
  await h.ctx.addNode("Destination", false, false, null, null, null, null, null);
  const importer = createMarkdownImport(h.ctx);
  await importer.importTextToMap("mindmap\n  root[New branch]");
  expect(h.scene[1]?.parent).toBe("node-0");
  expect(h.scene[1]?.type).toBe("rectangle");
  h.ctx.addNode.mockClear();
  await importer.importTextToMap("mindmap\nRoot\nSecond root");
  expect(h.ctx.addNode).not.toHaveBeenCalled();
  expect(h.notices).toContain("NOTICE_MERMAID_INVALID");
});

it("leaves Markdown links, ontology and ordinary copy output intact", async () => {
  const h = host();
  await createMarkdownImport(h.ctx).importTextToMap(
    "# Root\n- [[Note]]\n- [alias](path)\n- relation:: [rectangle]",
  );
  expect(h.scene.map((node) => node.text)).toEqual([
    "Root",
    "[[Note]]",
    "[alias](path)",
    "[rectangle]",
  ]);
  expect(h.ctx.addNode.mock.calls[3]?.[6]).toBe("relation");
  const exporter = createMarkdownExport({
    ...h.ctx,
    getMindmapNodeFromSelection: () => h.scene[0],
  });
  await exporter.copyMapAsText();
  expect(h.clipboard.writeText).toHaveBeenCalledWith(
    "# Root\n- [[Note]]\n- [alias](path)\n- [rectangle]\n",
  );
});

it("copies a selected branch with folded descendants and nested submaps in visual order", async () => {
  const h = host(true);
  const add = async (
    text: string,
    parent: TestNode | null,
    shape: string | null = null,
  ): Promise<TestNode> => h.ctx.addNode(text, false, false, null, parent, null, null, shape);
  const root = await add("Root", null, "ellipse");
  root.customData.growthMode = "Right-Left";
  const left = await add("Left", root, "diamond");
  left.x = -200;
  left.customData.isFolded = true;
  const right = await add("Right", root, "rectangle");
  right.x = 200;
  right.customData.isAdditionalRoot = true;
  await add("Nested", right);
  await add("Hidden child", left);
  const exporter = createMermaidExport(h.ctx);
  const text = await exporter.copyMapAsMermaid();
  expect(parseMermaidMindmap(text!)?.map((node) => node.text)).toEqual([
    "Root",
    "Right",
    "Nested",
    "Left",
    "Hidden child",
  ]);
  expect(h.clipboard.writeText).toHaveBeenCalledWith(text);
  expect(h.ctx.addElementsToView).not.toHaveBeenCalled();
  const branch = createMermaidExport({ ...h.ctx, getMindmapNodeFromSelection: () => left });
  expect(parseMermaidMindmap((await branch.copyMapAsMermaid())!)?.map((node) => node.text)).toEqual(
    ["Left", "Hidden child"],
  );
});

it("handles an unbound view or empty selection without touching the clipboard", async () => {
  const h = host();
  await createMermaidExport(h.ctx).copyMapAsMermaid();
  expect(h.notices).toEqual(["NOTICE_SELECT_NODE_TO_COPY"]);
  await createMermaidExport({ ...h.ctx, isViewSet: () => false }).copyMapAsMermaid();
  expect(h.clipboard.writeText).not.toHaveBeenCalled();
});

it("exports unlabeled nodes with a fallback so the Mermaid hierarchy stays complete", async () => {
  const h = host(true);
  await h.ctx.addNode("", false, false, null, null, null, null, null);
  const text = await createMermaidExport(h.ctx).copyMapAsMermaid();
  expect(parseMermaidMindmap(text!)?.[0]?.text).toBe("MERMAID_EMPTY_NODE");
});

it("exports a portable image appendix and reimports the source under the same hierarchy", async () => {
  const h = host(true);
  await h.ctx.addNode("Root", false, false, null, null, null, null, null);
  const image = await h.ctx.addNode("", false, false, null, h.scene[0]!, null, null, "image");
  image.width = 240;
  image.customData.markdownImage = { source: "local", render: { width: 480 } };
  await h.ctx.addNode("Image child", false, false, null, image, null, null, null);
  const markdown = "# Inner heading\n\n- inner list\n\n```js\nconst x = 1;\n```\n";
  const ctx = {
    ...h.ctx,
    ea: {
      ...(h.ctx.ea as object),
      targetView: { excalidrawData: { getMarkdownImage: () => ({ markdown }) } },
    },
  };
  await createMarkdownExport(ctx).copyMapAsText();
  const [text] = h.clipboard.writeText.mock.calls[0]! as [string];
  expect(text).toContain("# Root\n- ![[#^markdown-image=node-1|240]]\n  - Image child\n");
  expect(text).toContain(`<!-- excalidraw-markdown-image:node-1 -->\n\n${  markdown}`);
  const destination = host();
  await createMarkdownImport(destination.ctx).importTextToMap(text);
  expect(destination.scene.map(({ text, parent }) => ({ text, parent }))).toEqual([
    { text: "Root", parent: null },
    { text: "![[#^markdown-image=node-1|240]]", parent: "node-0" },
    { text: "Image child", parent: "node-1" },
  ]);
  expect(destination.ctx.addNode.mock.calls[1]?.[8]).toEqual({
    markdown,
    render: { width: 480 },
    width: 240,
  });
});

it("leaves the clipboard and scene intact if a local image source is unavailable", async () => {
  const h = host(true);
  const image = await h.ctx.addNode("", false, false, null, null, null, null, "image");
  image.customData.markdownImage = { source: "local" };
  const deleteViewElements = vi.fn();
  const ctx = {
    ...h.ctx,
    ea: {
      ...(h.ctx.ea as object),
      deleteViewElements,
      targetView: { excalidrawData: { getMarkdownImage: () => undefined } },
    },
  };
  await createMarkdownExport(ctx).copyMapAsText(true);
  expect(deleteViewElements).not.toHaveBeenCalled();
  expect(h.clipboard.writeText).not.toHaveBeenCalled();
  expect(h.notices).toEqual(["NOTICE_MARKDOWN_IMAGE_MISSING"]);
});

it("reimports a single-image heading and rejects incomplete appendices before scene writes", async () => {
  const h = host(true);
  const image = await h.ctx.addNode("", false, false, null, null, null, null, "image");
  image.customData.markdownImage = { source: "local" };
  await createMarkdownExport({
    ...h.ctx,
    ea: {
      ...(h.ctx.ea as object),
      targetView: { excalidrawData: { getMarkdownImage: () => ({ markdown: "Source" }) } },
    },
  }).copyMapAsText();
  const [text] = h.clipboard.writeText.mock.calls[0]! as [string];
  const destination = host();
  const importer = createMarkdownImport(destination.ctx);
  await importer.importTextToMap(text);
  expect(destination.ctx.addNode.mock.calls[0]?.[8]).toEqual({ markdown: "Source", width: 100 });
  destination.ctx.addNode.mockClear();
  await importer.importTextToMap("# Root\n- ![[#^markdown-image=missing|300]]");
  expect(destination.ctx.addNode).not.toHaveBeenCalled();
  expect(destination.notices).toContain("NOTICE_MARKDOWN_IMAGE_INVALID");
});

it("puts the portable source on the clipboard before cutting a local image with inline submap children", async () => {
  const h = host(true);
  const image = await h.ctx.addNode("", false, false, null, null, null, null, "image");
  image.customData = { markdownImage: { source: "local" }, isAdditionalRoot: true };
  await h.ctx.addNode("Child", false, false, null, image, null, null, null);
  const deleteViewElements = vi.fn();
  await createMarkdownExport({ ...h.ctx, ea: { ...(h.ctx.ea as object), deleteViewElements,
    targetView: { excalidrawData: { getMarkdownImage: () => ({ markdown: "Portable source" }) } },
  } }).copyMapAsText(true);
  const [text] = h.clipboard.writeText.mock.calls[0]! as [string];
  expect(text).toContain("# ![[#^markdown-image=node-0|100]]\n- Child\n");
  expect(text).toContain("\n\nPortable source\n\n<!-- /excalidraw-markdown-image:node-0 -->");
  expect(deleteViewElements).toHaveBeenCalled();
  expect(h.clipboard.writeText.mock.invocationCallOrder[0]).toBeLessThan(deleteViewElements.mock.invocationCallOrder[0]!);
});
