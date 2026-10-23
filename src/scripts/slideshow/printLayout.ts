import type { PresentationSourceKey } from "./types";

export type HandoutLayout = "slides" | "notes" | "handout-2" | "handout-3";
export type PrintTheme = "light" | "dark";
export type PrintMargin = "none" | "minimal" | "normal";

export interface SlideshowPrintSettings {
  sourceKey: PresentationSourceKey;
  pageRanges?: string;
  theme?: PrintTheme;
  layout: HandoutLayout;
  visibleOnly: boolean;
  margin: PrintMargin;
  width: number;
  height: number;
}

export interface PrintBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Returns page margins in CSS pixels, matching Excalidraw's none/tiny/normal spacing. */
export function getPrintContentBox(settings: SlideshowPrintSettings): PrintBox {
  const margin = { none: 0, minimal: 10, normal: 60 }[settings.margin];
  return {
    x: margin,
    y: margin,
    width: settings.width - margin * 2,
    height: settings.height - margin * 2,
  };
}

/** Fits a presentation-shaped thumbnail inside a handout slot without changing slide framing. */
export function fitPrintBox(box: PrintBox, aspect: number): PrintBox {
  const width = Math.min(box.width, box.height * aspect);
  return { ...box, width, height: width / aspect };
}

/** Rejects dimensions too small for readable handouts or too large for native PDF export. */
export function validPrintDimensions(width: number, height: number): boolean {
  return [width, height].every((value) => Number.isFinite(value) && value >= 320 && value <= 14400);
}

/** Computes a row's slide and notes areas in page pixels, with space for a title. */
export function getHandoutBoxes(settings: SlideshowPrintSettings): {
  rows: number;
  slide: PrintBox;
  notes: PrintBox;
  rowHeight: number;
} {
  const rows = settings.layout === "handout-3" ? 3 : settings.layout === "handout-2" ? 2 : 1;
  const content = getPrintContentBox(settings);
  const margin = content.x;
  const rowHeight = content.height / rows;
  const width = content.width;
  const contentHeight = rowHeight - 44;
  const below = settings.layout === "notes";
  return {
    rows,
    rowHeight,
    slide: {
      x: margin,
      y: margin + 24,
      width: below ? width : width * 0.46,
      height: below ? contentHeight * 0.48 : contentHeight,
    },
    notes: {
      x: below ? margin : margin + width * 0.5,
      y: below ? margin + 36 + contentHeight * 0.48 : margin + 24,
      width: below ? width : width * 0.5,
      height: below ? contentHeight * 0.52 - 12 : contentHeight,
    },
  };
}

/** Wraps plain text without dropping blank lines, Unicode, or words wider than the notes column. */
export function wrapPrintText(
  text: string,
  width: number,
  measure: (text: string) => number,
): string[] {
  const result: string[] = [];
  for (const paragraph of text.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const character of paragraph) {
      const candidate = line + character;
      if (line && measure(candidate) > width) {
        const space = line.lastIndexOf(" ");
        if (space > 0) {
          result.push(line.slice(0, space));
          line = line.slice(space + 1) + character;
        } else {
          result.push(line);
          line = character;
        }
      } else line = candidate;
    }
    result.push(line);
  }
  return result;
}

/** Keeps handout paper, titles, and rendered notes legible in either print theme. */
export function getPrintColors(theme: PrintTheme): {
  background: string;
  foreground: string;
  border: string;
} {
  return theme === "dark"
    ? { background: "#121212", foreground: "#e0e0e0", border: "#666666" }
    : { background: "#ffffff", foreground: "#202020", border: "#aaaaaa" };
}
