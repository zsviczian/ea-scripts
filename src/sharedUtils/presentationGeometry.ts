/**
 * @file presentationGeometry.ts
 * @overview Reusable geometry helpers for viewport-based presentations and exports.
 */

export interface SlideRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ViewportDimensions {
  width: number;
  height: number;
}

export interface NavigationRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  nextZoom: number;
}

export interface SceneBounds {
  topX: number;
  topY: number;
}

/** Returns the persisted frame name or the legacy generated fallback. */
export function getPresentationFrameName(name: string | null, index: number): string {
  return name ?? `Frame ${(index + 1).toString().padStart(2, "0")}`;
}

/** Calculates the canvas scroll rectangle and zoom needed to fit one slide. */
export function getNavigationRect(
  slide: SlideRect,
  dimensions: ViewportDimensions,
  maxZoom: number,
): NavigationRect {
  const { x1, y1, x2, y2 } = slide;
  const { width, height } = dimensions;
  const ratioX = width / Math.abs(x1 - x2);
  const ratioY = height / Math.abs(y1 - y2);
  let ratio = Math.min(Math.max(ratioX, ratioY), maxZoom);

  const scaledWidth = Math.abs(x1 - x2) * ratio;
  const scaledHeight = Math.abs(y1 - y2) * ratio;
  if (scaledWidth > width || scaledHeight > height) {
    ratio = Math.min(width / Math.abs(x1 - x2), height / Math.abs(y1 - y2));
  }

  const deltaX = (width / ratio - Math.abs(x1 - x2)) / 2;
  const deltaY = (height / ratio - Math.abs(y1 - y2)) / 2;
  return {
    left: Math.min(x1, x2) - deltaX,
    top: Math.min(y1, y2) - deltaY,
    right: Math.max(x1, x2) + deltaX,
    bottom: Math.max(y1, y2) + deltaY,
    nextZoom: ratio,
  };
}

/** Translates a navigation rectangle into an exported scene's coordinate space. */
export function translateNavigationRect(
  rect: NavigationRect,
  sceneBounds: SceneBounds,
  padding: number,
): NavigationRect {
  return {
    top: rect.top - (sceneBounds.topY - padding),
    left: rect.left - (sceneBounds.topX - padding),
    bottom: rect.bottom - (sceneBounds.topY - padding),
    right: rect.right - (sceneBounds.topX - padding),
    nextZoom: rect.nextZoom,
  };
}
