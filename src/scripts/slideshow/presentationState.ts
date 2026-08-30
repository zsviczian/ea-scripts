/**
 * @file presentationState.ts
 * @overview Pure construction of synchronized presenter/presentation state.
 */

import type { SlideDeck } from "./SlideDeck";
import type { AnimationRuntimeState } from "./AnimationRuntime";
import type { PresentationState } from "./types";

/** Builds the authoritative presentation state consumed by presenter-window UI. */
export function buildPresentationState(
  deck: SlideDeck,
  currentIndex: number,
  animationState: AnimationRuntimeState = { completedSteps: 0, stepCount: 0 },
): PresentationState {
  const visibleSlides = deck.visibleSlides;
  const boundedIndex = Math.min(Math.max(currentIndex, 0), Math.max(visibleSlides.length - 1, 0));
  const current = visibleSlides[boundedIndex];
  const next = visibleSlides[boundedIndex + 1];
  return {
    currentSlideId: current?.id ?? "",
    currentIndex: boundedIndex,
    visibleSlideCount: visibleSlides.length,
    completedAnimationSteps: animationState.completedSteps,
    animationStepCount: animationState.stepCount,
    nextSlideId: next?.id ?? null,
  };
}
