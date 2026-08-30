/**
 * @file types.ts
 * @overview Slideshow-specific contracts and element guards.
 */

import type { AppState } from "@zsviczian/excalidraw/types";

import type { NavigationRect, SlideRect } from "../../sharedUtils/presentationGeometry";
import type { SlideDeck } from "./SlideDeck";

export type Direction = "fwd" | "bkwd";
export type PresentationPathType = "line" | "frame";
export type AnimationEffect = "appear" | "fade" | "slide" | "zoom";
export type AnimationTrigger = "advance" | "after-delay";
export type AnimationDirection = "left" | "right" | "up" | "down";

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
  gripVertical: string;
  chevronUp: string;
  chevronDown: string;
  eye: string;
  eyeOff: string;
  sparkles: string;
  notebookPen: string;
  play: string;
  continuePresentation: string;
  presentation: string;
  refresh: string;
  plus: string;
  trash: string;
  close: string;
  settings: string;
  frameSlideshow: string;
  lineSlideshow: string;
}

export interface OriginalPathProperties {
  strokeColor: string;
  backgroundColor: string;
  locked: boolean;
}

export type AnimationTarget = { type: "element"; id: string } | { type: "group"; id: string };

export interface AnimationStep {
  id: string;
  targets: AnimationTarget[];
  effect: AnimationEffect;
  trigger: AnimationTrigger;
  delayMs?: number;
  durationMs?: number;
  direction?: AnimationDirection;
}

export interface FrameSlideshowData {
  schemaVersion: 2;
  kind: "frame";
  order: number;
  excluded?: boolean;
  notes?: string;
  animation?: {
    steps: AnimationStep[];
  };
}

export interface LineSlideMetadataRecord {
  id: string;
  notes?: string;
  excluded?: boolean;
}

export interface LineSlideshowData {
  schemaVersion: 2;
  kind: "path";
  hidden: boolean;
  originalProps: OriginalPathProperties;
  slides: LineSlideMetadataRecord[];
}

/** Legacy metadata written by Slideshow 3.x before schemaVersion 2. */
export interface LegacyLineSlideshowData {
  originalProps: OriginalPathProperties;
  hidden: boolean;
}

export type SlideshowElementMetadata =
  FrameSlideshowData | LineSlideshowData | LegacyLineSlideshowData;

export type EditableLinearElement = Mutable<ExcalidrawLinearElement> & {
  customData?: Record<string, unknown> & {
    slideshow?: SlideshowElementMetadata;
  };
};

export type NamedFrame = Mutable<ExcalidrawFrameElement> & { name: string };

export interface ResolvedSlideDeck {
  deck: SlideDeck;
  pathElement: ExcalidrawLinearElement | null;
  frames: NamedFrame[];
}

export interface PresentationSetup extends ResolvedSlideDeck {
  pathType: PresentationPathType;
  slides: SlideRect[];
  slideTitles: string[];
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
