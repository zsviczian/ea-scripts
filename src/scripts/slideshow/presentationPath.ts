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
  type PresentationPathType,
  type PresentationSetup,
  type ResolvedSlideDeck,
} from "./types";

export interface SlideDeckChoices {
  frame: ResolvedSlideDeck | null;
  line: ResolvedSlideDeck | null;
  defaultType: PresentationPathType | null;
}

function getNamedFrames(elements: readonly ExcalidrawElement[]): NamedFrame[] {
  return elements.filter(isFrameElement).map((frame, index) => {
    return {
      ...frame,
      name: getPresentationFrameName(frame.name, index),
    } as NamedFrame;
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

function findHiddenRememberedPath(
  elements: readonly ExcalidrawElement[],
): ExcalidrawLinearElement | null {
  return (
    (elements.find((element) => {
      if (!isLinearPathElement(element)) return false;
      return (
        readLineSlideshowData(
          element.customData,
          element.id,
          Math.floor(element.points.length / 2),
        )?.data.hidden === true
      );
    }) as ExcalidrawLinearElement | undefined) ?? null
  );
}

function resolveFrameDeck(frames: NamedFrame[]): ResolvedSlideDeck | null {
  if (frames.length === 0) return null;
  return {
    deck: buildFrameSlideDeck(frames),
    pathElement: null,
    frames,
  };
}

function resolveLineDeck(
  selectedElement: ExcalidrawElement | null,
  rememberedPath: ExcalidrawLinearElement | null,
  frames: NamedFrame[],
): ResolvedSlideDeck | null {
  const pathElement = isLinearPathElement(selectedElement) ? selectedElement : rememberedPath;
  if (!pathElement) return null;
  return {
    deck: buildLineSlideDeck(pathElement),
    pathElement,
    frames,
  };
}

/** Returns whether a presentation path is persistently hidden by slideshow metadata. */
export function isPresentationPathHidden(path: ExcalidrawLinearElement): boolean {
  return (
    readLineSlideshowData(path.customData, path.id, Math.floor(path.points.length / 2))?.data.hidden ??
    false
  );
}

/** Returns whether a canonical deck can actually be started. */
export function isResolvedDeckPresentable(resolved: ResolvedSlideDeck | null): boolean {
  return Boolean(resolved && resolved.deck.visibleSlides.length > 0);
}

/** Returns the other runnable presentation type when both frame and line decks are available. */
export function getAlternatePresentationType(
  choices: SlideDeckChoices,
  currentType: PresentationPathType,
): PresentationPathType | null {
  const alternate = currentType === "frame" ? "line" : "frame";
  return isResolvedDeckPresentable(choices[alternate]) ? alternate : null;
}

/** Resolves every slideshow type currently available in the drawing without mutating app state. */
export function resolveSlideDeckChoices(ea: ExcalidrawAutomate): SlideDeckChoices {
  const viewElements = ea.getViewElements();
  const frames = getNamedFrames(viewElements);
  const selectedElement = ea.getViewSelectedElement();
  const selectedPath = isLinearPathElement(selectedElement) ? selectedElement : null;
  const rememberedPath = findRememberedPath(viewElements);
  const hiddenRememberedPath = findHiddenRememberedPath(viewElements);
  const frame = resolveFrameDeck(frames);
  const line = resolveLineDeck(selectedElement, rememberedPath, frames);

  // Default launch precedence deliberately distinguishes a visible remembered path from a hidden
  // one. A selected line is an explicit request for a line presentation. A hidden remembered path
  // remains the legacy implicit line presentation. A visible, unselected remembered path yields to
  // frames when frames exist, allowing both configurations to coexist in the same drawing.
  const defaultType: PresentationPathType | null = selectedPath
    ? "line"
    : hiddenRememberedPath
      ? "line"
      : frame
        ? "frame"
        : line
          ? "line"
          : null;

  return { frame, line, defaultType };
}

/** Resolves the current canonical deck without mutating app state or showing notices. */
export function resolveSlideDeck(
  ea: ExcalidrawAutomate,
  presentationType?: PresentationPathType,
): ResolvedSlideDeck | null {
  const choices = resolveSlideDeckChoices(ea);
  if (presentationType) return choices[presentationType];
  return choices.defaultType ? choices[choices.defaultType] : null;
}

/** Resolves the active presentation setup with the same path precedence as Slideshow.md. */
export function resolvePresentationSetup(
  ea: ExcalidrawAutomate,
  api: ExcalidrawAPI,
  t?: SlideshowTranslator,
  presentationType?: PresentationPathType,
): PresentationSetup | null {
  const viewElements = ea.getViewElements();
  const rememberedPath = findRememberedPath(viewElements);
  const selectedElement = ea.getViewSelectedElement();
  let shouldHidePathAfterPresentation = true;

  if (
    presentationType !== "frame" &&
    rememberedPath &&
    isLinearPathElement(selectedElement) &&
    selectedElement.id !== rememberedPath.id
  ) {
    api.setToast({
      message:
        t?.("selectedPathOverridesHidden") ??
        "Using the selected line instead of the hidden presentation path. Run the slideshow without selecting an element to use the hidden path.",
      duration: 5000,
      closable: true,
    });
    shouldHidePathAfterPresentation = false;
  }

  const resolved = resolveSlideDeck(ea, presentationType);
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

  if (resolved.deck.visibleSlides.length === 0) {
    api.setToast({
      message:
        t?.("allSlidesExcluded") ??
        "All slides are excluded. Include at least one slide before presenting.",
      duration: 4000,
      closable: true,
    });
    return null;
  }

  if (!resolved.pathElement) {
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
