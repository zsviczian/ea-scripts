import { afterEach, describe, expect, it, vi } from "vitest";

import { printSlideshowToPdf } from "../printToPdf";

afterEach(() => vi.unstubAllGlobals());

describe("slideshow bounded exports", () => {
  it("exports one area-bounded SVG per PDF page", async () => {
    vi.stubGlobal(
      "Notice",
      class {
        public containerEl = { parentElement: null };
        public noticeEl = this.containerEl;
        public setMessage(): void {}
        public hide(): void {}
      },
    );
    const exportOptions: ViewSvgOptions[] = [];
    const pages: Array<{ attributes: Record<string, string> }> = [];
    const createPDF = vi.fn(async () => undefined);
    const ea = {
      targetView: { file: { basename: "deck" } },
      createViewSVG: async (options: ViewSvgOptions) => {
        exportOptions.push(options);
        const page = {
          attributes: {} as Record<string, string>,
          setAttribute(name: string, value: string) {
            this.attributes[name] = value;
          },
        };
        pages.push(page);
        return page as unknown as SVGSVGElement;
      },
      createPDF,
    } as unknown as ExcalidrawAutomate;
    const api = {
      getAppState: () => ({
        width: 1920,
        height: 1080,
        theme: "light",
        viewBackgroundColor: "#ffffff",
      }),
    } as unknown as ExcalidrawAPI;

    await printSlideshowToPdf({
      event: { shiftKey: false } as MouseEvent,
      ea,
      api,
      slides: [
        { x1: 0, y1: 0, x2: 1920, y2: 1080 },
        { x1: 1920, y1: 0, x2: 3840, y2: 1080 },
      ],
      printSlideWidth: 1920,
      printSlideHeight: 1080,
      maxZoom: 1,
      t: ((key: string) => key) as never,
    });

    expect(exportOptions).toHaveLength(2);
    expect(exportOptions.map((options) => options.exportArea)).toEqual([
      { x: 0, y: 0, width: 1920, height: 1080 },
      { x: 1920, y: 0, width: 1920, height: 1080 },
    ]);
    expect(exportOptions.every((options) => options.elementsOverride === undefined)).toBe(true);
    expect(createPDF).toHaveBeenCalledOnce();
    expect(pages.map((page) => page.attributes)).toEqual([
      { width: "1920", height: "1080" },
      { width: "1920", height: "1080" },
    ]);
  });
});
