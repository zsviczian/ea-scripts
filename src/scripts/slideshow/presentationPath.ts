/**
 * @file presentationPath.ts
 * @overview Resolves frame or line presentation paths and their slide rectangles.
 */

/* eslint-disable complexity, max-lines-per-function -- Path precedence is kept together to make legacy behavior auditable. */

import { getPresentationFrameName } from "../../sharedUtils/presentationGeometry";
import {
  getSlideshowPathMetadata,
  isFrameElement,
  isLinearPathElement,
  type NamedFrame,
  type OriginalPathProperties,
  type PresentationSetup,
} from "./types";

/** Resolves the active presentation path with the same precedence as Slideshow.md. */
export function resolvePresentationSetup(
  ea: ExcalidrawAutomate,
  api: ExcalidrawAPI,
): PresentationSetup | null {
  const viewElements = ea.getViewElements();
  let pathElement = viewElements.find(
    (element) =>
      isLinearPathElement(element) &&
      Boolean((element.customData as { slideshow?: unknown } | undefined)?.slideshow),
  ) as ExcalidrawLinearElement | undefined;

  const frames = viewElements
    .filter(isFrameElement)
    .map((frame, index) => {
      const clone = ea.cloneElement(frame) as NamedFrame;
      clone.name = getPresentationFrameName(clone.name, index);
      return clone;
    })
    .sort((left, right) => (left.name > right.name ? 1 : -1));

  const selectedElement = ea.getViewSelectedElement();
  let shouldHidePathAfterPresentation = true;
  if (pathElement && isLinearPathElement(selectedElement)) {
    api.setToast({
      message:
        "Using selected line instead of hidden line. Note that there is a hidden presentation path for this drawing. Run the slideshow script without selecting any elements to access the hidden presentation path",
      duration: 5000,
      closable: true,
    });
    shouldHidePathAfterPresentation = false;
    pathElement = selectedElement;
  }

  pathElement ??= isLinearPathElement(selectedElement) ? selectedElement : undefined;
  const frameRenderingOriginalState = api.getAppState().frameRendering;
  if (!pathElement && frames.length === 0) {
    api.setToast({
      message: "Please select the line or arrow for the presentation path or add frames.",
      duration: 3000,
      closable: true,
    });
    return null;
  }

  if (!pathElement) {
    const slides = frames.map((frame) => ({
      x1: frame.x,
      y1: frame.y,
      x2: frame.x + frame.width,
      y2: frame.y + frame.height,
    }));
    if (frameRenderingOriginalState.enabled) {
      api.updateScene({
        appState: {
          frameRendering: { ...frameRenderingOriginalState, enabled: false },
        },
      });
    }

    return {
      pathType: "frame",
      pathElement: null,
      frames,
      slides,
      shouldHidePathAfterPresentation,
      isHidden: false,
      originalPathProperties: null,
      frameRenderingOriginalState,
    };
  }

  const slides = [];
  for (let index = 0; index < Math.floor(pathElement.points.length / 2); index += 1) {
    const pointA = pathElement.points[index * 2];
    const pointB = pathElement.points[index * 2 + 1];
    if (!pointA || !pointB) {
      continue;
    }
    slides.push({
      x1: pathElement.x + pointA[0],
      y1: pathElement.y + pointA[1],
      x2: pathElement.x + pointB[0],
      y2: pathElement.y + pointB[1],
    });
  }

  const metadata = getSlideshowPathMetadata(pathElement);
  const originalPathProperties: OriginalPathProperties = metadata?.hidden
    ? metadata.originalProps
    : {
        strokeColor: pathElement.strokeColor,
        backgroundColor: pathElement.backgroundColor,
        locked: pathElement.locked,
      };

  return {
    pathType: "line",
    pathElement,
    frames,
    slides,
    shouldHidePathAfterPresentation,
    isHidden: metadata?.hidden ?? false,
    originalPathProperties,
    frameRenderingOriginalState,
  };
}
