import type { WizardTranslator } from "./lang";
import { getFrames } from "./frames";
import { selectPages } from "./pageRanges";
import { MARGINS } from "./settings";

/** Selects and crops a read-only scene snapshot; never commits placeholder rectangles. */
export async function printToPdf(
  ea: ExcalidrawAutomate,
  options: {
    markersOnly: boolean;
    printEmpty: boolean;
    ranges: string;
    margin: keyof typeof MARGINS;
  },
  t: WizardTranslator,
): Promise<void> {
  const view = ea.targetView;
  const file = view?.file;
  const api = ea.getExcalidrawAPI();
  const assertTarget = (): void => {
    if (
      !view ||
      !file ||
      ea.targetView !== view ||
      view.file !== file ||
      ea.getExcalidrawAPI() !== api
    )
      throw new Error("PRINT_VIEW_CHANGED");
  };
  assertTarget();
  const scene = ea.getViewElements();
  const frames = getFrames(scene, options.markersOnly);
  if (!frames.length) {
    new ea.obsidian.Notice(t("noFrames"));
    return;
  }
  const selected = selectPages(frames, options.ranges).filter(
    (frame) =>
      options.printEmpty ||
      ea.getElementsInArea(
        scene.filter((el) => el.type !== "frame"),
        frame,
      ).length > 0,
  );
  if (!selected.length) {
    new ea.obsidian.Notice(t("noPages"));
    return;
  }
  const notice = new ea.obsidian.Notice(t("preparing"), 0);
  try {
    // Invisible rectangles include every requested area in the export bounds, even empty pages.
    ea.clear();
    ea.style.opacity = 0;
    ea.style.roughness = 0;
    ea.style.fillStyle = "solid";
    ea.style.backgroundColor = "black";
    ea.style.strokeWidth = 0.01;
    for (const frame of frames) ea.addRect(frame.x, frame.y, frame.width, frame.height);
    const elements = [...scene, ...ea.getElements()];
    const bounds = ea.getBoundingBox(elements);
    const svg = await ea.createViewSVG({
      withBackground: true,
      theme: api.getAppState().theme,
      frameRendering: { enabled: false, name: false, outline: false, clip: false },
      padding: 0,
      selectedOnly: false,
      skipInliningFonts: false,
      embedScene: false,
      elementsOverride: elements,
    });
    assertTarget();
    if (!svg) throw new Error("MISSING_PRINT_SVG");
    const pages = selected.map((frame) => {
      const page = svg.cloneNode(true) as SVGSVGElement;
      page.setAttribute(
        "viewBox",
        `${frame.x - bounds.topX} ${frame.y - bounds.topY} ${frame.width} ${frame.height}`,
      );
      page.setAttribute("width", String(frame.width));
      page.setAttribute("height", String(frame.height));
      return page;
    });
    const margin = MARGINS[options.margin];
    await ea.createPDF({
      SVG: pages,
      scale: { fitToPage: 1 },
      pageProps: {
        // Non-positive dimensions retain the original per-SVG custom-page sizing.
        dimensions: { width: 0, height: 0 },
        backgroundColor: "#ffffff",
        alignment: "center",
        margin: { left: margin, right: margin, top: margin, bottom: margin },
      },
      filename: `${file!.basename}-pages.pdf`,
    });
  } finally {
    ea.clear();
    notice.hide();
  }
}
