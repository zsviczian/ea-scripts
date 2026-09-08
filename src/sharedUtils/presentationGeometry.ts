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

/** Expands a slide rectangle around its center to the requested aspect ratio without shrinking it. */
export function expandSlideRectToAspectRatio(
  slide: SlideRect,
  dimensions: ViewportDimensions,
): SlideRect {
  const left = Math.min(slide.x1, slide.x2);
  const right = Math.max(slide.x1, slide.x2);
  const top = Math.min(slide.y1, slide.y2);
  const bottom = Math.max(slide.y1, slide.y2);
  const width = Math.max(right - left, Number.EPSILON);
  const height = Math.max(bottom - top, Number.EPSILON);
  const targetRatio = dimensions.width / dimensions.height;
  const currentRatio = width / height;
  const expandedWidth = currentRatio < targetRatio ? height * targetRatio : width;
  const expandedHeight = currentRatio > targetRatio ? width / targetRatio : height;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  return {
    x1: centerX - expandedWidth / 2,
    y1: centerY - expandedHeight / 2,
    x2: centerX + expandedWidth / 2,
    y2: centerY + expandedHeight / 2,
  };
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
