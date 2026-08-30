import { describe, expect, it } from "vitest";

import { getPresenterKeyboardAction } from "../PresenterViewController";
import { buildFrameSlideDeck } from "../SlideDeck";
import { buildPresentationState } from "../presentationState";

function frame(
  id: string,
  name: string,
  order: number,
  excluded = false,
): {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  customData: Record<string, unknown>;
} {
  return {
    id,
    name,
    x: order * 100,
    y: 0,
    width: 100,
    height: 60,
    customData: {
      slideshow: {
        schemaVersion: 2,
        kind: "frame",
        order,
        ...(excluded ? { excluded: true } : {}),
      },
    },
  };
}

describe("slideshow checkpoint 4 presenter state", () => {
  it("uses the visible deck for current and next presenter slide ids", () => {
    const deck = buildFrameSlideDeck([
      frame("a", "A", 0),
      frame("b", "B", 1, true),
      frame("c", "C", 2),
    ]);

    expect(
      buildPresentationState(deck, 0, { completedSteps: 2, stepCount: 4 }),
    ).toEqual({
      currentSlideId: "a",
      currentIndex: 0,
      visibleSlideCount: 2,
      completedAnimationSteps: 2,
      animationStepCount: 4,
      nextSlideId: "c",
    });
  });

  it("reports the end state on the final visible slide", () => {
    const deck = buildFrameSlideDeck([frame("a", "A", 0), frame("b", "B", 1)]);

    const state = buildPresentationState(deck, 1);
    expect(state.currentSlideId).toBe("b");
    expect(state.currentIndex).toBe(1);
    expect(state.visibleSlideCount).toBe(2);
    expect(state.nextSlideId).toBeNull();
  });

  it("maps presenter-window keys directly to slideshow navigation", () => {
    expect(getPresenterKeyboardAction("ArrowRight")).toBe("next");
    expect(getPresenterKeyboardAction(" ")).toBe("next");
    expect(getPresenterKeyboardAction("Space")).toBe("next");
    expect(getPresenterKeyboardAction("ArrowLeft")).toBe("previous");
    expect(getPresenterKeyboardAction("Home")).toBe("first");
    expect(getPresenterKeyboardAction("End")).toBe("last");
    expect(getPresenterKeyboardAction("Escape")).toBe("finish");
    expect(getPresenterKeyboardAction("x")).toBeNull();
  });
});
