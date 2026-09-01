/**
 * @file printToPdf.ts
 * @overview Builds one exported SVG view per slideshow page and creates a PDF.
 */

/* eslint-disable max-lines-per-function -- PDF steps intentionally remain sequential for progress reporting. */

import { SingleNotice } from "../../sharedUtils/SingleNotice";
import type { SlideshowTranslator } from "./lang";
import { getNavigationRect, type SlideRect } from "../../sharedUtils/presentationGeometry";

export interface PrintSlideshowOptions {
  event: MouseEvent;
  ea: ExcalidrawAutomate;
  api: ExcalidrawAPI;
  slides: readonly SlideRect[];
  printSlideWidth: number;
  printSlideHeight: number;
  maxZoom: number;
  t: SlideshowTranslator;
}

/** Prints all slideshow rectangles to a multi-page PDF. */
export async function printSlideshowToPdf(options: PrintSlideshowOptions): Promise<void> {
  const { event, ea, api, slides, printSlideWidth, printSlideHeight, maxZoom, t } = options;
  const appState = api.getAppState();
  const slideWidth = event.shiftKey ? appState.width : printSlideWidth;
  const slideHeight = event.shiftKey ? appState.height : printSlideHeight;
  const shouldClipFrames = false;
  const notice = new SingleNotice();
  notice.setMessage(t("generatingImage"));

  const pages: SVGSVGElement[] = [];
  for (const [index, slide] of slides.entries()) {
    notice.setMessage(t("generatingSlide", { number: index + 1 }));
    const rect = getNavigationRect(
      slide,
      { width: slideWidth, height: slideHeight },
      maxZoom,
    );
    const width = Math.abs(rect.left - rect.right);
    const height = Math.abs(rect.top - rect.bottom);
    const page = await ea.createViewSVG({
      withBackground: true,
      theme: appState.theme,
      frameRendering: {
        enabled: shouldClipFrames,
        name: false,
        outline: false,
        clip: shouldClipFrames,
      },
      padding: 0,
      selectedOnly: false,
      skipInliningFonts: false,
      embedScene: false,
      exportArea: {
        x: Math.min(rect.left, rect.right),
        y: Math.min(rect.top, rect.bottom),
        width,
        height,
      },
    });
    page.setAttribute("width", `${width}`);
    page.setAttribute("height", `${height}`);
    pages.push(page);
  }

  notice.setMessage(t("creatingPdf"));
  try {
    await ea.createPDF({
      SVG: pages,
      scale: { fitToPage: true },
      pageProps: {
        dimensions: { width: slideWidth, height: slideHeight },
        backgroundColor: api.getAppState().viewBackgroundColor,
        margin: { left: 0, right: 0, top: 0, bottom: 0 },
        alignment: "center",
      },
      filename: `${ea.targetView?.file.basename ?? "slideshow"}.pdf`,
    });
  } finally {
    notice.hide();
  }
}
