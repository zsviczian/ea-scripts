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
  const followingSlide = visibleSlides[boundedIndex + 1];
  const hasPendingBuild =
    Boolean(current) && animationState.completedSteps < animationState.stepCount;

  return {
    currentSlideId: current?.id ?? "",
    currentIndex: boundedIndex,
    visibleSlideCount: visibleSlides.length,
    completedAnimationSteps: animationState.completedSteps,
    animationStepCount: animationState.stepCount,
    nextSlideId: hasPendingBuild ? (current?.id ?? null) : (followingSlide?.id ?? null),
    nextAction: hasPendingBuild ? "build" : followingSlide ? "slide" : "end",
    nextCompletedAnimationSteps: hasPendingBuild
      ? Math.min(animationState.completedSteps + 1, animationState.stepCount)
      : followingSlide
        ? 0
        : null,
  };
}
