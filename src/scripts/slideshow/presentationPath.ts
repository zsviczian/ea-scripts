/**
 * @file presentationPath.ts
 * @overview Resolves frame or line presentation paths and canonical decks.
 */

/* eslint-disable complexity, max-lines-per-function -- Path precedence is kept together to make legacy behavior auditable. */

import { getPresentationFrameName } from "../../sharedUtils/presentationGeometry";
import { buildFrameSlideDeck, buildLineSlideDeck } from "./SlideDeck";
import type { SlideshowTranslator } from "./lang";
import { readLineSlideshowData } from "./slideshowMetadata";
import {
  isFrameElement,
  isLinearPathElement,
  type NamedFrame,
  type OriginalPathProperties,
  type PresentationSetup,
  type ResolvedSlideDeck,
} from "./types";

function getNamedFrames(ea: ExcalidrawAutomate, elements: readonly ExcalidrawElement[]): NamedFrame[] {
  return elements.filter(isFrameElement).map((frame, index) => {
    const clone = ea.cloneElement(frame) as NamedFrame;
    clone.name = getPresentationFrameName(clone.name, index);
    return clone;
  });
}

function findRememberedPath(elements: readonly ExcalidrawElement[]): ExcalidrawLinearElement | null {
  return (
    (elements.find(
      (element) =>
        isLinearPathElement(element) &&
        Boolean(
          readLineSlideshowData(
            element.customData,
            element.id,
            Math.floor(element.points.length / 2),
          ),
        ),
    ) as ExcalidrawLinearElement | undefined) ?? null
  );
}

/** Resolves the current canonical deck without mutating app state or showing notices. */
export function resolveSlideDeck(ea: ExcalidrawAutomate): ResolvedSlideDeck | null {
  const viewElements = ea.getViewElements();
  const frames = getNamedFrames(ea, viewElements);
  const selectedElement = ea.getViewSelectedElement();
  const rememberedPath = findRememberedPath(viewElements);
  const pathElement = isLinearPathElement(selectedElement) ? selectedElement : rememberedPath;

  if (pathElement) {
    return {
      deck: buildLineSlideDeck(pathElement),
      pathElement,
      frames,
    };
  }
  if (frames.length === 0) {
    return null;
  }
  return {
    deck: buildFrameSlideDeck(frames),
    pathElement: null,
    frames,
  };
}

/** Resolves the active presentation setup with the same path precedence as Slideshow.md. */
export function resolvePresentationSetup(
  ea: ExcalidrawAutomate,
  api: ExcalidrawAPI,
  t?: SlideshowTranslator,
): PresentationSetup | null {
  const viewElements = ea.getViewElements();
  const rememberedPath = findRememberedPath(viewElements);
  const selectedElement = ea.getViewSelectedElement();
  let shouldHidePathAfterPresentation = true;

  if (rememberedPath && isLinearPathElement(selectedElement)) {
    api.setToast({
      message:
        t?.("selectedPathOverridesHidden") ??
        "Using the selected line instead of the hidden presentation path. Run the slideshow without selecting an element to use the hidden path.",
      duration: 5000,
      closable: true,
    });
    shouldHidePathAfterPresentation = false;
  }

  const resolved = resolveSlideDeck(ea);
  const frameRenderingOriginalState = api.getAppState().frameRendering;
  if (!resolved) {
    api.setToast({
      message:
        t?.("noPresentationPath") ??
        "Select the line or arrow for the presentation path or add frames.",
      duration: 3000,
      closable: true,
    });
    return null;
  }

  if (!resolved.pathElement) {
    if (resolved.deck.visibleSlides.length === 0) {
      api.setToast({
        message: t?.("allFramesExcluded") ?? "All frame slides are excluded. Include at least one frame before presenting.",
        duration: 4000,
        closable: true,
      });
      return null;
    }
    if (frameRenderingOriginalState.enabled) {
      api.updateScene({
        appState: {
          frameRendering: { ...frameRenderingOriginalState, enabled: false },
        },
      });
    }
    return {
      ...resolved,
      pathType: "frame",
      slides: resolved.deck.visibleSlides.map((slide) => slide.rect),
      slideTitles: resolved.deck.visibleSlides.map((slide) => slide.title),
      shouldHidePathAfterPresentation,
      isHidden: false,
      originalPathProperties: null,
      frameRenderingOriginalState,
    };
  }

  const pathElement = resolved.pathElement;
  const metadata = readLineSlideshowData(
    pathElement.customData,
    pathElement.id,
    Math.floor(pathElement.points.length / 2),
  );
  const originalPathProperties: OriginalPathProperties = metadata?.data.hidden
    ? metadata.data.originalProps
    : {
        strokeColor: pathElement.strokeColor,
        backgroundColor: pathElement.backgroundColor,
        locked: pathElement.locked,
      };

  return {
    ...resolved,
    pathType: "line",
    slides: resolved.deck.visibleSlides.map((slide) => slide.rect),
    slideTitles: resolved.deck.visibleSlides.map((slide) => slide.title),
    shouldHidePathAfterPresentation,
    isHidden: metadata?.data.hidden ?? false,
    originalPathProperties,
    frameRenderingOriginalState,
  };
}
