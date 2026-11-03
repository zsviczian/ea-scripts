import type { ExcalidrawFrameElement } from "@zsviczian/excalidraw/element/types";
export type PageFrame = ExcalidrawFrameElement;
export type Direction = "up" | "down" | "left" | "right";

/** Lists marker/all frames in the original alphabetical print order. */
export function getFrames(
  elements: readonly ExcalidrawElement[],
  markersOnly: boolean,
): PageFrame[] {
  return elements
    .filter(
      (el): el is PageFrame => el.type === "frame" && (!markersOnly || el.frameRole === "marker"),
    )
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/** Finds the next numeric frame name, retaining the original optional Page prefix. */
export function nextPageName(frames: readonly PageFrame[]): string {
  return String(
    frames.reduce(
      (max, frame) => Math.max(max, Number(/(?:Page\s+)?(\d+)/i.exec(frame.name ?? "")?.[1] ?? 0)),
      0,
    ) + 1,
  ).padStart(2, "0");
}

/** Positions a matching (optionally rotated) page adjacent to the selected frame. */
export function adjacentPage(
  frame: PageFrame,
  direction: Direction,
  rotate: boolean,
): { x: number; y: number; width: number; height: number } {
  const width = rotate ? frame.height : frame.width;
  const height = rotate ? frame.width : frame.height;
  return {
    width,
    height,
    x:
      direction === "left"
        ? frame.x - width
        : direction === "right"
          ? frame.x + frame.width
          : frame.x,
    y:
      direction === "up"
        ? frame.y - height
        : direction === "down"
          ? frame.y + frame.height
          : frame.y,
  };
}
