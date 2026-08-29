/**
 * @file types.ts
 * @overview Slideshow-specific contracts and element guards.
 */

/* eslint-disable complexity -- Metadata validation is deliberately explicit at the untyped customData boundary. */

import type { AppState } from "@zsviczian/excalidraw/types";

import type { NavigationRect, SlideRect } from "../../sharedUtils/presentationGeometry";

export type Direction = "fwd" | "bkwd";
export type PresentationPathType = "line" | "frame";

export interface SlideshowConfig {
  transitionStepCount: number;
  transitionDelay: number;
  frameSleep: number;
  editZoomOut: number;
  fadeLevel: number;
  printSlideWidth: number;
  printSlideHeight: number;
  maxZoom: number;
}

export interface SlideshowIcons {
  finish: string;
  rightArrow: string;
  leftArrow: string;
  edit: string;
  maximize: string;
  minimize: string;
  laserOn: string;
  laserOff: string;
  printer: string;
  refocus: string;
}

export interface OriginalPathProperties {
  strokeColor: string;
  backgroundColor: string;
  locked: boolean;
}

export interface SlideshowPathMetadata {
  originalProps: OriginalPathProperties;
  hidden: boolean;
}

export type EditableLinearElement = Mutable<ExcalidrawLinearElement> & {
  customData?: Record<string, unknown> & {
    slideshow?: SlideshowPathMetadata;
  };
  /**
   * Legacy Slideshow.md assigns this misspelled property during cleanup.
   * Keeping it preserves the generated script's established behavior.
   */
  backgroundProps?: string;
};

export type NamedFrame = Mutable<ExcalidrawFrameElement> & { name: string };

export interface PresentationSetup {
  pathType: PresentationPathType;
  pathElement: ExcalidrawLinearElement | null;
  frames: NamedFrame[];
  slides: SlideRect[];
  shouldHidePathAfterPresentation: boolean;
  isHidden: boolean;
  originalPathProperties: OriginalPathProperties | null;
  frameRenderingOriginalState: AppState["frameRendering"];
}

export type Navigate = (direction: Direction) => Promise<void>;
export type NavigateToSlide = (slideNumber: number) => void;
export type ScrollToRect = (rect: NavigationRect, steps?: number) => Promise<void>;

/** Returns whether an element can define a point-pair presentation path. */
export function isLinearPathElement(
  element: ExcalidrawElement | null | undefined,
): element is ExcalidrawLinearElement {
  return element?.type === "line" || element?.type === "arrow";
}

/** Returns whether an element is an Excalidraw frame. */
export function isFrameElement(
  element: ExcalidrawElement | null | undefined,
): element is ExcalidrawFrameElement {
  return element?.type === "frame";
}

/** Reads the legacy slideshow metadata stored on a path element. */
export function getSlideshowPathMetadata(
  element: ExcalidrawLinearElement,
): SlideshowPathMetadata | null {
  const value = (element.customData as { slideshow?: unknown } | undefined)?.slideshow;
  if (!value || typeof value !== "object") {
    return null;
  }

  const metadata = value as Partial<SlideshowPathMetadata>;
  const props = metadata.originalProps;
  if (
    typeof metadata.hidden !== "boolean" ||
    !props ||
    typeof props.strokeColor !== "string" ||
    typeof props.backgroundColor !== "string" ||
    typeof props.locked !== "boolean"
  ) {
    return null;
  }

  return {
    hidden: metadata.hidden,
    originalProps: {
      strokeColor: props.strokeColor,
      backgroundColor: props.backgroundColor,
      locked: props.locked,
    },
  };
}
