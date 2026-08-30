/**
 * @file printToPdf.ts
 * @overview Builds one exported SVG view per slideshow page and creates a PDF.
 */

/* eslint-disable complexity, max-lines-per-function -- PDF steps intentionally remain sequential for progress reporting. */

import { SingleNotice } from "../../sharedUtils/SingleNotice";
import type { SlideshowTranslator } from "./lang";
import {
  getNavigationRect,
  translateNavigationRect,
  type SlideRect,
} from "../../sharedUtils/presentationGeometry";

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

function getElementPlaceholdersForMarkerFrames(
  ea: ExcalidrawAutomate,
): ExcalidrawElement[] | undefined {
  const markerFrames = ea
    .getViewElements()
    .filter((element) => element.type === "frame" && element.frameRole === "marker");
  if (markerFrames.length === 0) {
    return undefined;
  }

  ea.clear();
  ea.style.opacity = 0;
  ea.style.roughness = 0;
  ea.style.fillStyle = "solid";
  ea.style.backgroundColor = "black";
  ea.style.strokeWidth = 0.01;
  for (const frame of markerFrames) {
    ea.addRect(frame.x, frame.y, frame.width, frame.height);
  }
  return ea.getViewElements().concat(ea.getElements());
}

/** Prints all slideshow rectangles to a multi-page PDF. */
export async function printSlideshowToPdf(options: PrintSlideshowOptions): Promise<void> {
  const { event, ea, api, slides, printSlideWidth, printSlideHeight, maxZoom, t } = options;
  const appState = api.getAppState();
  const slideWidth = event.shiftKey ? appState.width : printSlideWidth;
  const slideHeight = event.shiftKey ? appState.height : printSlideHeight;
  const shouldClipFrames = false;
  const padding = shouldClipFrames ? 0 : Math.round(Math.max(slideWidth, slideHeight) / 2) + 10;
  const notice = new SingleNotice();
  notice.setMessage(t("generatingImage"));

  const elementsOverride = getElementPlaceholdersForMarkerFrames(ea);
  const svg = await ea.createViewSVG({
    withBackground: true,
    theme: appState.theme,
    frameRendering: {
      enabled: shouldClipFrames,
      name: false,
      outline: false,
      clip: shouldClipFrames,
    },
    padding,
    selectedOnly: false,
    skipInliningFonts: false,
    embedScene: false,
    ...(elementsOverride ? { elementsOverride } : {}),
  });
  const sceneBounds = ea.getBoundingBox(ea.getViewElements());
  const pages: SVGSVGElement[] = [];
  for (const [index, slide] of slides.entries()) {
    notice.setMessage(t("generatingSlide", { number: index + 1 }));
    const rect = translateNavigationRect(
      getNavigationRect(slide, { width: slideWidth, height: slideHeight }, maxZoom),
      sceneBounds,
      padding,
    );

    // PDF creation belongs to the main Obsidian realm, even for a popout view.
    const host = window.createDiv();
    host.innerHTML = svg.outerHTML;
    const clonedSvg = host.firstElementChild as SVGSVGElement | null;
    if (clonedSvg?.tagName.toLowerCase() !== "svg") {
      throw new Error("Could not clone the slideshow SVG for PDF generation.");
    }
    const width = Math.abs(rect.left - rect.right);
    const height = Math.abs(rect.top - rect.bottom);
    clonedSvg.setAttribute("viewBox", `${rect.left} ${rect.top} ${width} ${height}`);
    clonedSvg.setAttribute("width", `${width}`);
    clonedSvg.setAttribute("height", `${height}`);
    pages.push(clonedSvg);
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
