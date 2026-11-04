import { describe, expect, it, vi } from "vitest";
import { printToPdf } from "../printToPdf";
import { createWizardTranslator } from "../lang";

/** Export fixture models the EA host boundary and captures resulting PDF page geometry. */
function fixture(): {
  ea: ExcalidrawAutomate;
  createPDF: ReturnType<typeof vi.fn>;
  createViewSVG: ReturnType<typeof vi.fn>;
  notices: string[];
  hide: ReturnType<typeof vi.fn>;
  scene: ExcalidrawElement[];
} {
  const scene = [
    {
      id: "b",
      type: "frame",
      frameRole: "marker",
      name: "02",
      x: 300,
      y: -200,
      width: 300,
      height: 500,
    },
    {
      id: "a",
      type: "frame",
      frameRole: "marker",
      name: "01",
      x: 0,
      y: -200,
      width: 300,
      height: 500,
    },
    {
      id: "c",
      type: "frame",
      frameRole: "marker",
      name: "03",
      x: 600,
      y: -200,
      width: 300,
      height: 500,
    },
    { id: "content", type: "rectangle", x: 20, y: 20 },
  ] as ExcalidrawElement[];
  const notices: string[] = [];
  const hide = vi.fn();
  const createPDF = vi.fn().mockResolvedValue(undefined);
  const createViewSVG = vi.fn().mockResolvedValue({
    cloneNode: () => {
      const attributes: Record<string, string> = {};
      return {
        attributes,
        setAttribute: (key: string, value: string): void => {
          attributes[key] = value;
        },
      };
    },
  });
  const api = { getAppState: () => ({ theme: "light" }) };
  const ea = {
    targetView: { file: { basename: "drawing" } },
    getExcalidrawAPI: () => api,
    getViewElements: () => scene,
    getElementsInArea: (_elements: ExcalidrawElement[], frame: { id: string }) =>
      frame.id === "b" ? [] : [scene[3]],
    style: {},
    clear: vi.fn(),
    addRect: vi.fn(),
    getElements: () => [],
    getBoundingBox: () => ({ topX: 0, topY: -200, width: 900, height: 500 }),
    obsidian: {
      Notice: class {
        public hide = hide;
        public constructor(message: string) {
          notices.push(message);
        }
      },
    },
    createViewSVG,
    createPDF,
  } as unknown as ExcalidrawAutomate;
  return { ea, createPDF, createViewSVG, notices, hide, scene };
}
const t = createWizardTranslator("en");
const defaults = { markersOnly: true, printEmpty: true, ranges: "", margin: "none" as const };

describe("PDF selection and original export behavior", () => {
  it("exports requested pages in frame order with exact custom crop geometry and margins", async () => {
    const f = fixture();
    const before = structuredClone(f.scene);
    await printToPdf(f.ea, { ...defaults, ranges: "3, 1", margin: "tiny" }, t);
    const output = f.createPDF.mock.calls[0]![0];
    expect(
      output.SVG.map((page: { attributes: Record<string, string> }) => page.attributes),
    ).toEqual([
      { viewBox: "0 0 300 500", width: "300", height: "500" },
      { viewBox: "600 0 300 500", width: "300", height: "500" },
    ]);
    expect(output.pageProps.margin).toEqual({ left: 10, right: 10, top: 10, bottom: 10 });
    expect(output.filename).toBe("drawing-pages.pdf");
    expect(f.createViewSVG.mock.calls[0]![0].elementsOverride).toEqual(f.scene);
    expect(f.createViewSVG.mock.calls[0]![0].frameRendering).toEqual({
      enabled: false,
      name: false,
      outline: false,
      clip: false,
    });
    expect(f.scene).toEqual(before);
    expect(f.hide).toHaveBeenCalledOnce();
  });
  it("keeps numbering stable when a selected frame is empty", async () => {
    const f = fixture();
    await printToPdf(f.ea, { ...defaults, printEmpty: false, ranges: "2-" }, t);
    expect(f.createPDF.mock.calls[0]![0].SVG).toHaveLength(1);
    expect(f.createPDF.mock.calls[0]![0].SVG[0].attributes.viewBox).toBe("600 0 300 500");
  });
  it("does no expensive rendering for an empty selection or invalid range", async () => {
    const f = fixture();
    await printToPdf(f.ea, { ...defaults, ranges: "99-" }, t);
    expect(f.createViewSVG).not.toHaveBeenCalled();
    expect(f.notices).toContain(t("noPages"));
    await expect(printToPdf(f.ea, { ...defaults, ranges: "0" }, t)).rejects.toThrow(
      "INVALID_PAGE_RANGE",
    );
    expect(f.createPDF).not.toHaveBeenCalled();
  });
  it("cleans up progress and workbench after an export failure", async () => {
    const f = fixture();
    f.createViewSVG.mockRejectedValue(new Error("export failed"));
    await expect(printToPdf(f.ea, defaults, t)).rejects.toThrow("export failed");
    expect(f.hide).toHaveBeenCalledOnce();
    expect(f.ea.clear).toHaveBeenCalledTimes(2);
  });
  it("rejects a drawing switch while SVG rendering is pending", async () => {
    const f = fixture();
    const svg = await f.ea.createViewSVG();
    f.createViewSVG.mockImplementation(() => {
      f.ea.targetView = null;
      return Promise.resolve(svg);
    });
    await expect(printToPdf(f.ea, defaults, t)).rejects.toThrow("PRINT_VIEW_CHANGED");
    expect(f.createPDF).not.toHaveBeenCalled();
    expect(f.hide).toHaveBeenCalledOnce();
  });
});
