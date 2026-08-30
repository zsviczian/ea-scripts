/**
 * @file presentationPath.ts
 * @overview Resolves frame and named line presentation sources and canonical decks.
 */

import { getPresentationFrameName } from "../../sharedUtils/presentationGeometry";
import { buildFrameSlideDeck, buildLineSlideDeck } from "./SlideDeck";
import type { SlideshowTranslator } from "./lang";
import { readLineSlideshowData } from "./slideshowMetadata";
import {
  isFrameElement,
  isLinearPathElement,
  type LinePresentationSource,
  type NamedFrame,
  type OriginalPathProperties,
  type PresentationPathType,
  type PresentationSetup,
  type PresentationSourceKey,
  type ResolvedSlideDeck,
} from "./types";

export interface SlideDeckChoices {
  frame: ResolvedSlideDeck | null;
  lines: LinePresentationSource[];
  /** Compatibility alias for the first line presentation. */
  line: ResolvedSlideDeck | null;
  defaultSourceKey: PresentationSourceKey | null;
  /** Compatibility path type for legacy callers/settings. */
  defaultType: PresentationPathType | null;
}

function getNamedFrames(elements: readonly ExcalidrawElement[]): NamedFrame[] {
  return elements.filter(isFrameElement).map((frame, index) => ({
    ...frame,
    name: getPresentationFrameName(frame.name, index),
  }) as NamedFrame);
}

function resolveFrameDeck(frames: NamedFrame[]): ResolvedSlideDeck | null {
  if (frames.length === 0) return null;
  return { deck: buildFrameSlideDeck(frames), pathElement: null, frames };
}

function toLinePresentationSource(
  pathElement: ExcalidrawLinearElement,
  frames: NamedFrame[],
): LinePresentationSource | null {
  const metadata = readLineSlideshowData(
    pathElement.customData,
    pathElement.id,
    Math.floor(pathElement.points.length / 2),
  );
  if (!metadata) return null;
  return {
    key: `line:${pathElement.id}`,
    pathId: pathElement.id,
    name: metadata.data.name?.trim() || null,
    resolved: {
      deck: buildLineSlideDeck(pathElement),
      pathElement,
      frames,
    },
  };
}

function resolveLineSources(
  elements: readonly ExcalidrawElement[],
  frames: NamedFrame[],
): LinePresentationSource[] {
  const result: LinePresentationSource[] = [];
  for (const element of elements) {
    if (!isLinearPathElement(element)) continue;
    const source = toLinePresentationSource(element, frames);
    if (source) result.push(source);
  }
  return result;
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

/** Returns whether a source key still identifies a presentation in these choices. */
export function hasPresentationSource(
  choices: SlideDeckChoices,
  sourceKey: PresentationSourceKey | null | undefined,
): boolean {
  if (!sourceKey) return false;
  if (sourceKey === "frame") return choices.frame !== null;
  return choices.lines.some((line) => line.key === sourceKey);
}

/** Resolves one exact presentation source key from the drawing choices. */
export function resolvePresentationSource(
  choices: SlideDeckChoices,
  sourceKey: PresentationSourceKey | null | undefined,
): ResolvedSlideDeck | null {
  if (!sourceKey) return null;
  if (sourceKey === "frame") return choices.frame;
  return choices.lines.find((line) => line.key === sourceKey)?.resolved ?? null;
}

/** Returns the source's broad frame/line type. */
export function getPresentationSourceType(sourceKey: PresentationSourceKey): PresentationPathType {
  return sourceKey === "frame" ? "frame" : "line";
}

/** Returns the exact source key for a line element that already carries slideshow metadata. */
export function getLinePresentationSourceKey(
  element: ExcalidrawElement | null | undefined,
): `line:${string}` | null {
  if (!isLinearPathElement(element)) return null;
  const metadata = readLineSlideshowData(
    element.customData,
    element.id,
    Math.floor(element.points.length / 2),
  );
  return metadata ? `line:${element.id}` : null;
}

/**
 * Returns an unambiguous alternate source for the presentation toolbar.
 * A frame presentation can switch directly only when exactly one line presentation exists.
 * A line presentation can always switch directly to the unique frame presentation when present.
 */
export function getAlternatePresentationSourceKey(
  choices: SlideDeckChoices,
  currentSourceKey: PresentationSourceKey,
): PresentationSourceKey | null {
  if (currentSourceKey === "frame") {
    const presentableLines = choices.lines.filter((line) => isResolvedDeckPresentable(line.resolved));
    return presentableLines.length === 1 ? presentableLines[0]?.key ?? null : null;
  }
  return isResolvedDeckPresentable(choices.frame) ? "frame" : null;
}

/** Compatibility helper retained for code/tests that only care about broad presentation type. */
export function getAlternatePresentationType(
  choices: SlideDeckChoices,
  currentType: PresentationPathType,
): PresentationPathType | null {
  if (currentType === "line") return isResolvedDeckPresentable(choices.frame) ? "frame" : null;
  const presentableLines = choices.lines.filter((line) => isResolvedDeckPresentable(line.resolved));
  return presentableLines.length === 1 ? "line" : null;
}

/**
 * Resolves all persisted presentations in the drawing without mutating app state.
 * Ordinary selected lines are deliberately ignored. A selected persisted presentation path can
 * influence manual launch defaults, but sidepanel selection is maintained separately by the panel.
 */
export function resolveSlideDeckChoices(ea: ExcalidrawAutomate): SlideDeckChoices {
  const viewElements = ea.getViewElements();
  const frames = getNamedFrames(viewElements);
  const frame = resolveFrameDeck(frames);
  const lines = resolveLineSources(viewElements, frames);
  const selectedSourceKey = getLinePresentationSourceKey(ea.getViewSelectedElement());
  const defaultSourceKey: PresentationSourceKey | null = selectedSourceKey
    ? selectedSourceKey
    : frame
      ? "frame"
      : lines[0]?.key ?? null;
  const defaultType = defaultSourceKey ? getPresentationSourceType(defaultSourceKey) : null;
  return { frame, lines, line: lines[0]?.resolved ?? null, defaultSourceKey, defaultType };
}

/** Resolves the current canonical deck without mutating app state or showing notices. */
export function resolveSlideDeck(
  ea: ExcalidrawAutomate,
  presentationSource?: PresentationSourceKey | PresentationPathType,
): ResolvedSlideDeck | null {
  const choices = resolveSlideDeckChoices(ea);
  if (presentationSource === "frame") return choices.frame;
  if (presentationSource === "line") return choices.line;
  if (presentationSource?.startsWith("line:")) {
    return resolvePresentationSource(choices, presentationSource as PresentationSourceKey);
  }
  return resolvePresentationSource(choices, choices.defaultSourceKey);
}

function normalizeSourceKey(
  choices: SlideDeckChoices,
  requested: PresentationSourceKey | PresentationPathType | undefined,
): PresentationSourceKey | null {
  if (requested === "frame") return choices.frame ? "frame" : null;
  if (requested === "line") return choices.lines[0]?.key ?? null;
  if (requested?.startsWith("line:")) {
    return hasPresentationSource(choices, requested as PresentationSourceKey)
      ? (requested as PresentationSourceKey)
      : null;
  }
  return choices.defaultSourceKey;
}

/** Resolves the active presentation setup for one exact persisted presentation source. */
export function resolvePresentationSetup(
  ea: ExcalidrawAutomate,
  api: ExcalidrawAPI,
  t?: SlideshowTranslator,
  presentationSource?: PresentationSourceKey | PresentationPathType,
): PresentationSetup | null {
  const choices = resolveSlideDeckChoices(ea);
  const sourceKey = normalizeSourceKey(choices, presentationSource);
  const resolved = resolvePresentationSource(choices, sourceKey);
  const frameRenderingOriginalState = api.getAppState().frameRendering;
  if (!resolved || !sourceKey) {
    api.setToast({
      message:
        t?.("noPresentationPath") ??
        "Select a configured presentation in the Slideshow panel or add frames.",
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
      sourceKey,
      pathType: "frame",
      slides: resolved.deck.visibleSlides.map((slide) => slide.rect),
      slideTitles: resolved.deck.visibleSlides.map((slide) => slide.title),
      shouldHidePathAfterPresentation: true,
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
  if (!metadata) return null;
  const originalPathProperties: OriginalPathProperties = metadata.data.hidden
    ? metadata.data.originalProps
    : {
        strokeColor: pathElement.strokeColor,
        backgroundColor: pathElement.backgroundColor,
        locked: pathElement.locked,
      };

  return {
    ...resolved,
    sourceKey,
    pathType: "line",
    slides: resolved.deck.visibleSlides.map((slide) => slide.rect),
    slideTitles: resolved.deck.visibleSlides.map((slide) => slide.title),
    shouldHidePathAfterPresentation: true,
    isHidden: metadata.data.hidden,
    originalPathProperties,
    frameRenderingOriginalState,
  };
}
