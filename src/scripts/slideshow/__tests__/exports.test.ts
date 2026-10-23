import { afterEach, describe, expect, it, vi } from "vitest";
import { renderPrintNotes } from "../MarkdownPrintNotes";
vi.mock("../MarkdownPrintNotes", async (original) => ({
  ...(await original<typeof import("../MarkdownPrintNotes")>()),
  renderPrintNotes: vi.fn(),
}));
import { buildFrameSlideDeck, buildLineSlideDeck } from "../SlideDeck";
import {
  buildSlideshowMarkdown,
  exportSlideshowMarkdown,
  getMarkdownExportPath,
} from "../exportMarkdown";
import { generateSlideshowPdf, type PrintSlideshowOptions } from "../printToPdf";
import {
  fitPrintBox,
  getHandoutBoxes,
  validPrintDimensions,
  wrapPrintText,
  type SlideshowPrintSettings,
} from "../printLayout";
import { waitForPresentationViewport } from "../presentationViewport";
import { createSlideshowTranslator } from "../lang";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const t = createSlideshowTranslator("en");
type ViewSvgOptions = NonNullable<Parameters<ExcalidrawAutomate["createViewSVG"]>[0]>;

/** Minimal SVG boundary: production pagination and text placement run without a browser. */
class Svg {
  public attributes: Record<string, string> = {};
  public styles: Partial<CSSStyleDeclaration> = {};
  public children: Svg[] = [];
  public textContent = "";
  public constructor(public tag = "svg") {}
  public setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }
  public setCssStyles(styles: Partial<CSSStyleDeclaration>): void {
    Object.assign(this.styles, styles);
  }
  public createSvg(tag: string, info: { attr: Record<string, string | number> }): Svg {
    const child = new Svg(tag);
    for (const [name, value] of Object.entries(info.attr)) child.setAttribute(name, String(value));
    this.children.push(child);
    return child;
  }
  public appendChild(child: Svg): void {
    this.children.push(child);
  }
  public cloneNode(): Svg {
    return this;
  }
}

/** Builds frame and line sources plus a captured PDF boundary. */
function printFixture(): {
  options: PrintSlideshowOptions;
  createPDF: ReturnType<typeof vi.fn>;
  exports: ViewSvgOptions[];
} {
  vi.mocked(renderPrintNotes).mockResolvedValue([new Svg("div") as never]);
  vi.stubGlobal(
    "Notice",
    class {
      public containerEl = { parentElement: {} };
      public setMessage(): void {}
      public hide(): void {}
    },
  );
  vi.stubGlobal("createFragment", () => ({
    createSvg: (tag: string, info: { attr: Record<string, string> }) =>
      new Svg().createSvg(tag, info),
    createEl: () => ({
      getContext: () => ({ measureText: (text: string) => ({ width: [...text].length * 7 }) }),
    }),
  }));
  const deck = buildFrameSlideDeck([
    {
      id: "a",
      name: "Alpha",
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      customData: {
        slideshow: { schemaVersion: 2, kind: "frame", order: 0, notes: "Hello <script> & notes" },
      },
    },
    {
      id: "b",
      name: "Beta",
      x: 2200,
      y: 0,
      width: 1920,
      height: 1080,
      customData: {
        slideshow: {
          schemaVersion: 2,
          kind: "frame",
          order: 1,
          excluded: true,
          notes: "Hidden notes",
        },
      },
    },
  ]);
  const line = {
    deck: buildLineSlideDeck({
      id: "path",
      x: 5000,
      y: 0,
      points: [
        [0, 0],
        [100, 100],
      ],
    }),
    pathElement: null,
    frames: [],
  };
  const createPDF = vi.fn(async () => undefined);
  const exports: ViewSvgOptions[] = [];
  const fixture = {
    createPDF,
    exports,
    options: {
      ea: {
        targetView: { file: { basename: "deck", path: "deck.md" }, ownerDocument: {} },
        createPDF,
        obsidian: { Notice: vi.fn() },
        createViewSVG: async (options: ViewSvgOptions) => {
          exports.push(options);
          return new Svg();
        },
      } as unknown as ExcalidrawAutomate,
      api: {
        getAppState: () => ({ theme: "light", viewBackgroundColor: "white" }),
      } as ExcalidrawAPI,
      choices: {
        frame: { deck, pathElement: null, frames: [] },
        lines: [{ key: "line:path", name: "Route", pathId: "path", resolved: line }],
        line,
        defaultType: "frame",
        defaultSourceKey: "frame",
      },
      sourceKey: "frame",
      event: {} as MouseEvent,
      printSlideWidth: 1920,
      printSlideHeight: 1080,
      maxZoom: 1,
      t,
    } satisfies PrintSlideshowOptions,
  };
  fixture.options.ea.getExcalidrawAPI = () => fixture.options.api;
  return fixture;
}

describe("slideshow print output", () => {
  const settings: SlideshowPrintSettings = {
    sourceKey: "frame",
    layout: "slides",
    visibleOnly: true,
    margin: "none",
    width: 816,
    height: 1056,
  };
  it("keeps scene coordinates inside a page-sized wrapper when native PDF export rewrites the page viewBox", async () => {
    const { options, createPDF } = printFixture();
    options.ea.createViewSVG = async () => {
      const image = new Svg();
      image.setAttribute("viewBox", "-17 22 3840 2160");
      return image as never;
    };
    await generateSlideshowPdf(options, { ...settings, width: 1920, height: 1080 });
    const page = createPDF.mock.calls[0]![0].SVG[0] as Svg;
    // The native PDF tiler replaces only the outer viewBox with these pixel dimensions.
    expect(page.attributes.viewBox).toBe("0 0 1920 1080");
    const image = page.children.find((child) => child.tag === "svg")!;
    expect(image.attributes.viewBox).toBe("-17 22 3840 2160");
    expect(image.attributes.width).toBe("1920");
    expect(image.attributes.height).toBe("1080");
  });
  it.each([
    ["none", 0],
    ["minimal", 10],
    ["normal", 60],
  ] as const)(
    "applies %s margins once while filling the remaining page area",
    async (margin, pixels) => {
      const { options, createPDF } = printFixture();
      await generateSlideshowPdf(options, { ...settings, margin });
      const pdf = createPDF.mock.calls[0]![0];
      const page = pdf.SVG[0] as Svg;
      const image = page.children.find((child) => child.tag === "svg")!;
      expect(page.attributes.viewBox).toBe(`0 0 ${settings.width} ${settings.height}`);
      expect(image.attributes).toMatchObject({
        x: String(pixels),
        y: String(pixels),
        width: String(settings.width - pixels * 2),
        height: String(settings.height - pixels * 2),
      });
      expect(image.styles.overflow).toBe("hidden");
      expect(pdf.scale).toEqual({ fitToPage: 0, zoom: 1 });
      expect(pdf.pageProps.margin).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
      const handout = getHandoutBoxes({ ...settings, margin, layout: "handout-2" });
      expect(handout.slide.x).toBe(pixels);
      expect(handout.notes.x + handout.notes.width).toBe(settings.width - pixels);
      expect(handout.notes.y + handout.notes.height + handout.rowHeight).toBeLessThan(
        settings.height - pixels,
      );
    },
  );
  it("clips each slide to its own rectangle on portrait paper and includes excluded slides only on request", async () => {
    const { options, exports, createPDF } = printFixture();
    await generateSlideshowPdf(options, settings);
    expect(exports).toHaveLength(1);
    expect(exports[0]!.exportArea).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    await generateSlideshowPdf(options, { ...settings, visibleOnly: false });
    expect(exports).toHaveLength(3);
    expect(createPDF.mock.calls[1]![0].SVG).toHaveLength(2);
    expect(createPDF.mock.calls[1]![0].pageProps.dimensions).toEqual({ width: 816, height: 1056 });
  });
  it.each(["light", "dark"] as const)(
    "exports the selected %s print theme without changing the scene",
    async (theme) => {
      const { options, exports, createPDF } = printFixture();
      options.api.getAppState = () =>
        ({ theme: theme === "dark" ? "light" : "dark", viewBackgroundColor: "white" }) as never;
      await generateSlideshowPdf(options, { ...settings, theme });
      expect(exports[0]!.theme).toBe(theme);
      expect(createPDF.mock.calls[0]![0].pageProps.backgroundColor).toBe(
        theme === "dark" ? "#121212" : "white",
      );
      expect(options.api.getAppState().theme).not.toBe(theme);
    },
  );
  it("defaults printing to the current scene theme", async () => {
    const { options, exports } = printFixture();
    options.api.getAppState = () => ({ theme: "dark", viewBackgroundColor: "white" }) as never;
    await generateSlideshowPdf(options, settings);
    expect(exports[0]!.theme).toBe("dark");
  });
  it("prints the chosen line deck instead of the default frame deck", async () => {
    const { options, exports } = printFixture();
    await generateSlideshowPdf(options, { ...settings, sourceKey: "line:path" });
    expect(exports).toHaveLength(1);
    expect(exports[0]!.exportArea!.x).toBeGreaterThan(4000);
  });
  it("keeps all-excluded decks printable when all slides are selected", async () => {
    const { options, createPDF } = printFixture();
    options.choices.frame!.deck.slides.forEach((slide) => {
      slide.excluded = true;
    });
    await generateSlideshowPdf(options, settings);
    expect(createPDF).not.toHaveBeenCalled();
    await generateSlideshowPdf(options, { ...settings, visibleOnly: false });
    expect(createPDF).toHaveBeenCalledOnce();
  });
  it.each(["notes", "handout-2", "handout-3"] as const)(
    "assembles %s from rendered HTML continuations, repeating intact slides",
    async (layout) => {
      const { options, createPDF } = printFixture();
      const chunks = ["Opening formatted notes", "Middle", "LAST NOTE <&>"].map((text) => {
        const chunk = new Svg("div");
        chunk.textContent = text;
        return chunk;
      });
      vi.mocked(renderPrintNotes).mockResolvedValueOnce(chunks as never);
      await generateSlideshowPdf(options, { ...settings, layout });
      expect(renderPrintNotes).toHaveBeenLastCalledWith(
        options.ea,
        "Hello <script> & notes",
        "deck.md",
        getHandoutBoxes({ ...settings, layout }).notes,
        {},
        "light",
      );
      const pages = createPDF.mock.calls[0]![0].SVG as Svg[];
      const html = pages.flatMap((page) =>
        page.children.filter((child) => child.tag === "foreignObject"),
      );
      expect(html).toHaveLength(3);
      expect(html.map((node) => node.children[0]!.textContent)).toEqual(
        chunks.map((node) => node.textContent),
      );
      expect(
        pages.flatMap((page) => page.children.filter((child) => child.tag === "svg")),
      ).toHaveLength(3);
      expect(
        pages
          .flatMap((page) => page.children)
          .some((node) => node.textContent.includes("(continued)")),
      ).toBe(true);
    },
  );
  it("applies output page ranges after assembly without duplicating overlapping selections", async () => {
    const { options, createPDF } = printFixture();
    await generateSlideshowPdf(options, { ...settings, visibleOnly: false, pageRanges: "2;2-" });
    expect(createPDF.mock.calls[0]![0].SVG).toHaveLength(1);
    const { options: noPages, createPDF: unused } = printFixture();
    await generateSlideshowPdf(noPages, { ...settings, pageRanges: "9-" });
    expect(unused).not.toHaveBeenCalled();
    expect(noPages.ea.obsidian.Notice).toHaveBeenCalledWith(t("printNoPages"));
  });
  it("keeps notes and thumbnails inside each row at the smallest supported size", () => {
    for (const layout of ["notes", "handout-2", "handout-3"] as const) {
      const boxes = getHandoutBoxes({ ...settings, width: 320, height: 320, layout });
      expect(boxes.notes.height).toBeGreaterThan(0);
      expect(
        boxes.notes.y + boxes.notes.height + (boxes.rows - 1) * boxes.rowHeight,
      ).toBeLessThanOrEqual(320);
    }
    expect(validPrintDimensions(NaN, 800)).toBe(false);
    expect(validPrintDimensions(0, 800)).toBe(false);
    expect(validPrintDimensions(15000, 800)).toBe(false);
  });
  it("wraps Unicode and long words while retaining paragraph breaks", () => {
    expect(wrapPrintText("abcde\n\n猫狗😀猫", 3, (value) => [...value].length)).toEqual([
      "abc",
      "de",
      "",
      "猫狗😀",
      "猫",
    ]);
  });
  it("keeps presentation aspect ratios when placing thumbnails on portrait paper", () => {
    const boxes = getHandoutBoxes({ ...settings, layout: "handout-2" });
    const fitted = fitPrintBox(boxes.slide, 16 / 9);
    expect(fitted.width / fitted.height).toBeCloseTo(16 / 9);
    expect(fitted.width).toBeLessThanOrEqual(boxes.slide.width);
    expect(fitted.height).toBeLessThanOrEqual(boxes.slide.height);
  });
  it("aborts if the sidepanel is rebound during an asynchronous slide export", async () => {
    const { options, createPDF } = printFixture();
    options.ea.createViewSVG = async () => {
      options.ea.targetView = {} as never;
      return new Svg() as never;
    };
    await expect(generateSlideshowPdf(options, settings)).rejects.toThrow("PRINT_VIEW_CHANGED");
    expect(createPDF).not.toHaveBeenCalled();
  });
});

describe("frame Markdown export", () => {
  it("writes canonical frame headings, full-path embeds, and unmodified Markdown notes", () => {
    const frames = [
      {
        id: "a",
        name: "Opening",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        customData: {
          slideshow: { schemaVersion: 2, kind: "frame", order: 0, notes: "**Notes**\n- One" },
        },
      },
    ];
    expect(
      buildSlideshowMarkdown("Talks/Deck.excalidraw.md", buildFrameSlideDeck(frames), frames),
    ).toBe("## Opening\n\n![[Talks/Deck.excalidraw.md#^frame=Opening]]\n\n**Notes**\n- One\n");
  });
  it("uses stable IDs for duplicate names, unsafe names and unnamed frames", () => {
    const frames = ["Same", "Same", "A|B", null].map((name, index) => ({
      id: `f${index}`,
      name,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
    }));
    const markdown = buildSlideshowMarkdown("Deck.md", buildFrameSlideDeck(frames), frames);
    for (let i = 0; i < 4; i += 1) expect(markdown).toContain(`#^frame=f${i}]]`);
  });
  it("resolves filenames only inside the drawing's folder", () => {
    expect(getMarkdownExportPath("Talks/Deck.md", "Handout.md")).toBe("Talks/Handout.md");
    expect(getMarkdownExportPath("Deck.md", "Handout")).toBe("Handout.md");
    for (const name of ["", "..", "../outside", "C:\\note", "bad|alias", "bad."])
      expect(getMarkdownExportPath("Deck.md", name)).toBeNull();
  });
  it("creates the named note and opens it in a new tab, without overwriting existing notes", async () => {
    const file = { path: "Deck.md", basename: "Deck" };
    const created = { path: "Handout.md" };
    const create = vi.fn(async () => created);
    const openFile = vi.fn(async () => undefined);
    const getLeaf = vi.fn(() => ({ openFile }));
    const getFileByPath = vi.fn(() => null);
    vi.stubGlobal("app", { vault: { create, getFileByPath }, workspace: { getLeaf } });
    vi.stubGlobal("Notice", vi.fn());
    const frame = { id: "a", type: "frame", name: "Alpha", x: 0, y: 0, width: 100, height: 100 };
    const context = {
      view: { file, isDirty: () => false },
      ea: { getViewElements: () => [frame], obsidian: { Notice: vi.fn() } },
      utils: { inputPrompt: async () => "Handout" },
      t,
    };
    await exportSlideshowMarkdown(context as never, buildFrameSlideDeck([frame]));
    expect(create).toHaveBeenCalledWith("Handout.md", expect.stringContaining("#^frame=Alpha"));
    expect(getLeaf).toHaveBeenCalledWith("tab");
    expect(openFile).toHaveBeenCalledWith(created);
    getFileByPath.mockReturnValue(created as never);
    await exportSlideshowMarkdown(context as never, buildFrameSlideDeck([frame]));
    expect(create).toHaveBeenCalledOnce();
  });
  it("treats the Script Engine's rejected filename prompt as cancellation", async () => {
    const create = vi.fn();
    vi.stubGlobal("app", { vault: { create } });
    const context = {
      view: { file: { path: "Deck.md", basename: "Deck" }, isDirty: () => false },
      ea: { getViewElements: () => [] },
      utils: { inputPrompt: () => Promise.reject("No input given.") },
      t,
    };
    await exportSlideshowMarkdown(context as never, buildFrameSlideDeck([]));
    expect(create).not.toHaveBeenCalled();
  });
});

describe("presentation viewport readiness", () => {
  it("waits for both the closing-dock layout and delayed API resize before starting", async () => {
    vi.useFakeTimers();
    const view = {
      ownerWindow: { setTimeout },
      excalidrawContainer: { getBoundingClientRect: () => ({ width: 1200, height: 800 }) },
    };
    let width = 900;
    const api = { getAppState: () => ({ width, height: 800 }) };
    let ready = false;
    const pending = waitForPresentationViewport(view as never, api as never).then(() => {
      ready = true;
    });
    await vi.advanceTimersByTimeAsync(400);
    expect(ready).toBe(false);
    width = 1200;
    await vi.advanceTimersByTimeAsync(100);
    expect(ready).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    await pending;
    expect(ready).toBe(true);
  });
});
