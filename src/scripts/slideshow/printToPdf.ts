/** Vector slide export and paginated plain-text notes handouts. */
/* eslint-disable max-lines-per-function -- Export progress and page assembly are sequential. */
import { SingleNotice } from "../../sharedUtils/SingleNotice";
import { getNavigationRect } from "../../sharedUtils/presentationGeometry";
import type { SlideshowTranslator } from "./lang";
import type { SlideDeckSlide } from "./SlideDeck";
import { resolvePresentationSource, type SlideDeckChoices } from "./presentationPath";
import type { PresentationSourceKey } from "./types";
import { openSlideshowPrintDialog } from "./PrintDialog";
import {
  fitPrintBox,
  getHandoutBoxes,
  getPrintContentBox,
  validPrintDimensions,
  wrapPrintText,
  type PrintBox,
  type SlideshowPrintSettings,
} from "./printLayout";

export interface PrintSlideshowOptions {
  event: MouseEvent;
  ea: ExcalidrawAutomate;
  api: ExcalidrawAPI;
  choices: SlideDeckChoices;
  sourceKey: PresentationSourceKey;
  printSlideWidth: number;
  printSlideHeight: number;
  maxZoom: number;
  t: SlideshowTranslator;
}

/** Opens print setup, then exports the selected canonical deck without changing its metadata. */
export async function printSlideshowToPdf(options: PrintSlideshowOptions): Promise<void> {
  const view = options.ea.targetView;
  const file = view?.file;
  const state = options.api.getAppState();
  const settings = await openSlideshowPrintDialog(
    options.ea,
    {
      width: options.event.shiftKey ? state.width : options.printSlideWidth,
      height: options.event.shiftKey ? state.height : options.printSlideHeight,
      choices: options.choices,
      sourceKey: options.sourceKey,
    },
    options.t,
  );
  if (!settings) return;
  if (
    options.ea.targetView !== view ||
    view?.file !== file ||
    options.ea.getExcalidrawAPI() !== options.api
  ) {
    new options.ea.obsidian.Notice(options.t("printViewChanged"));
    return;
  }
  await generateSlideshowPdf(options, settings);
}

/** Exports a single area-bounded SVG using the aspect ratio of its destination on the page. */
async function exportSlide(
  options: PrintSlideshowOptions,
  slide: SlideDeckSlide,
  box: PrintBox,
): Promise<SVGSVGElement> {
  const rect = getNavigationRect(slide.rect, box, options.maxZoom);
  const width = rect.right - rect.left;
  const height = rect.bottom - rect.top;
  const svg = await options.ea.createViewSVG({
    withBackground: true,
    theme: options.api.getAppState().theme,
    frameRendering: { enabled: false, name: false, outline: false, clip: false },
    padding: 0,
    selectedOnly: false,
    skipInliningFonts: false,
    embedScene: false,
    exportArea: { x: rect.left, y: rect.top, width, height },
  });
  svg.setAttribute("width", String(box.width));
  svg.setAttribute("height", String(box.height));
  svg.setCssStyles({ overflow: "hidden" });
  return svg;
}

/** Creates a detached, self-contained SVG page; no view/window state is attached. */
function createPrintPage(settings: SlideshowPrintSettings, backgroundColor: string): SVGSVGElement {
  const page = createFragment().createSvg("svg", {
    attr: {
      xmlns: "http://www.w3.org/2000/svg",
      width: settings.width,
      height: settings.height,
      viewBox: `0 0 ${settings.width} ${settings.height}`,
    },
  });
  page.createSvg("rect", {
    attr: { width: settings.width, height: settings.height, fill: backgroundColor },
  });
  return page;
}

/** Appends plain SVG text; user notes are always text content, never SVG markup. */
function addText(page: SVGSVGElement, text: string, x: number, y: number, bold = false): void {
  const element = page.createSvg("text", {
    attr: {
      x,
      y,
      fill: "#202020",
      "font-family": "Arial, sans-serif",
      "font-size": 14,
      "font-weight": bold ? "bold" : "normal",
      "xml:space": "preserve",
    },
  });
  element.textContent = text;
}

/** Generates all selected slides; long notes continue in another slot with their slide repeated. */
export async function generateSlideshowPdf(
  options: PrintSlideshowOptions,
  settings: SlideshowPrintSettings,
): Promise<void> {
  if (!validPrintDimensions(settings.width, settings.height))
    throw new Error("INVALID_PRINT_DIMENSIONS");
  const { ea, t } = options;
  const targetView = ea.targetView;
  const targetFile = targetView?.file;
  const assertTarget = (): void => {
    if (
      ea.targetView !== targetView ||
      targetView?.file !== targetFile ||
      ea.getExcalidrawAPI() !== options.api
    )
      throw new Error("PRINT_VIEW_CHANGED");
  };
  const exportCurrentSlide = async (
    slide: SlideDeckSlide,
    box: PrintBox,
  ): Promise<SVGSVGElement> => {
    assertTarget();
    const image = await exportSlide(options, slide, box);
    assertTarget();
    return image;
  };
  const deck = resolvePresentationSource(options.choices, settings.sourceKey)?.deck;
  const slides = deck?.slides.filter((slide) => !settings.visibleOnly || !slide.excluded) ?? [];
  if (slides.length === 0) {
    new ea.obsidian.Notice(t("printNoSlides"));
    return;
  }
  const notice = new SingleNotice();
  const pages: SVGSVGElement[] = [];
  try {
    notice.setMessage(t("generatingImage"));
    if (settings.layout === "slides") {
      for (const [index, slide] of slides.entries()) {
        notice.setMessage(t("generatingSlide", { number: index + 1 }));
        const box = getPrintContentBox(settings);
        const image = await exportCurrentSlide(slide, box);
        image.setAttribute("x", String(box.x));
        image.setAttribute("y", String(box.y));
        // Native PDF export replaces the outer viewBox using its pixel width/height.
        // Keep scene coordinates on the nested SVG, and page coordinates on the wrapper.
        const page = createPrintPage(settings, options.api.getAppState().viewBackgroundColor);
        page.appendChild(image);
        pages.push(page);
      }
    } else {
      const view = ea.targetView;
      if (!view) throw new Error("MISSING_PRINT_VIEW");
      const canvas = createFragment().createEl("canvas");
      const context = canvas.getContext("2d");
      if (!context) throw new Error("MISSING_TEXT_MEASUREMENT");
      context.font = "14px Arial";
      const measure = (text: string): number => context.measureText(text).width;
      const boxes = getHandoutBoxes(settings);
      const slideBox = fitPrintBox(boxes.slide, options.printSlideWidth / options.printSlideHeight);
      const linesPerSlot = Math.max(1, Math.floor(boxes.notes.height / 19));
      let slot = 0;
      let page: SVGSVGElement | undefined;
      for (const [index, slide] of slides.entries()) {
        notice.setMessage(t("generatingSlide", { number: index + 1 }));
        const image = await exportCurrentSlide(slide, slideBox);
        const lines = wrapPrintText(slide.notes ?? "", boxes.notes.width, measure);
        for (let offset = 0; offset < lines.length; offset += linesPerSlot) {
          if (slot % boxes.rows === 0) {
            page = createPrintPage(settings, "#ffffff");
            pages.push(page);
          }
          const y = (slot % boxes.rows) * boxes.rowHeight;
          const continuation = offset > 0 ? ` ${t("printContinued")}` : "";
          const title = `${index + 1}. ${slide.title.replace(/[\r\n]/g, " ")}${continuation}`;
          const content = getPrintContentBox(settings);
          const titleLines = wrapPrintText(title, content.width, measure);
          addText(
            page!,
            (titleLines[0] ?? "") + (titleLines.length > 1 ? "…" : ""),
            content.x,
            content.y + 16 + y,
            true,
          );
          const clone = image.cloneNode(true) as SVGSVGElement;
          clone.setAttribute("x", String(boxes.slide.x));
          clone.setAttribute("y", String(boxes.slide.y + y));
          page!.appendChild(clone);
          lines
            .slice(offset, offset + linesPerSlot)
            .forEach((line, lineIndex) =>
              addText(page!, line, boxes.notes.x, boxes.notes.y + y + 14 + lineIndex * 19),
            );
          slot += 1;
        }
      }
    }
    notice.setMessage(t("creatingPdf"));
    assertTarget();
    await ea.createPDF({
      SVG: pages,
      scale: { fitToPage: 0, zoom: 1 },
      pageProps: {
        dimensions: { width: settings.width, height: settings.height },
        backgroundColor:
          settings.layout === "slides" ? options.api.getAppState().viewBackgroundColor : "#ffffff",
        margin: { left: 0, right: 0, top: 0, bottom: 0 },
        alignment: "center",
      },
      filename: `${targetFile?.basename ?? "slideshow"}.pdf`,
    });
  } finally {
    notice.hide();
  }
}
