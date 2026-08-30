/**
 * @file AnimationRuntime.ts
 * @overview Frame-animation target resolution, transient effects, timers, and guaranteed restoration.
 */

import type { FrameDeckSlide } from "./SlideDeck";
import type { AnimationStep, AnimationTarget } from "./types";

interface AnimationElementShape {
  id: string;
  type: string;
  frameId?: string | null;
  groupIds?: readonly string[];
  boundElements?: readonly { id: string; type: string }[] | null;
  containerId?: string | null;
  opacity: number;
}

export interface CapturedAnimationTargets {
  targets: AnimationTarget[];
  ignoredSelectionCount: number;
}

export interface AnimationRuntimeState {
  completedSteps: number;
  stepCount: number;
}

interface ResolvedRuntimeStep {
  step: AnimationStep;
  elementIds: string[];
}

interface ActiveAnimationSlide {
  frameId: string;
  steps: ResolvedRuntimeStep[];
  originals: Map<string, ExcalidrawElement>;
  completedSteps: number;
}

export interface AnimationRuntimeOptions {
  ea: ExcalidrawAutomate;
  api: ExcalidrawAPI;
  hostView: ScriptExcalidrawView;
  onStateChange?(state: AnimationRuntimeState): void;
}

function asAnimationShape(element: ExcalidrawElement): AnimationElementShape {
  return element as unknown as AnimationElementShape;
}

interface ElementRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function getElementRect(element: ExcalidrawElement): ElementRect {
  const x1 = element.x;
  const y1 = element.y;
  const x2 = element.x + element.width;
  const y2 = element.y + element.height;
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  const angle = element.angle ?? 0;
  if (angle === 0) return { left, top, right, bottom };

  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ] as const;
  const rotated = corners.map(([x, y]) => {
    const dx = x - centerX;
    const dy = y - centerY;
    return [centerX + dx * cos - dy * sin, centerY + dx * sin + dy * cos] as const;
  });
  return {
    left: Math.min(...rotated.map(([x]) => x)),
    top: Math.min(...rotated.map(([, y]) => y)),
    right: Math.max(...rotated.map(([x]) => x)),
    bottom: Math.max(...rotated.map(([, y]) => y)),
  };
}

function rectsOverlap(left: ElementRect, right: ElementRect): boolean {
  return (
    left.left <= right.right &&
    left.right >= right.left &&
    left.top <= right.bottom &&
    left.bottom >= right.top
  );
}

/** Marker frames do not own elements, so slide membership is geometric rather than frameId-based. */
export function elementOverlapsFrame(
  element: ExcalidrawElement,
  frame: ExcalidrawElement,
): boolean {
  return element.id !== frame.id && rectsOverlap(getElementRect(element), getElementRect(frame));
}

function getElementById(
  elements: readonly ExcalidrawElement[],
  id: string,
): ExcalidrawElement | undefined {
  return elements.find((element) => element.id === id);
}

function canonicalElementTargetId(
  element: ExcalidrawElement,
  elements: readonly ExcalidrawElement[],
): string {
  const shape = asAnimationShape(element);
  if (element.type === "text" && shape.containerId) {
    const container = getElementById(elements, shape.containerId);
    if (container) return container.id;
  }
  return element.id;
}

function expandBoundVisualUnit(
  initialIds: Iterable<string>,
  elements: readonly ExcalidrawElement[],
): string[] {
  const result = new Set<string>();
  const queue = [...initialIds];
  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || result.has(id)) continue;
    const element = getElementById(elements, id);
    if (!element) continue;
    result.add(id);
    const shape = asAnimationShape(element);
    if (element.type === "text" && shape.containerId) queue.push(shape.containerId);
    for (const bound of shape.boundElements ?? []) {
      const boundElement = getElementById(elements, bound.id);
      if (boundElement?.type === "text") queue.push(bound.id);
    }
  }
  return [...result];
}

function visualUnitOverlapsFrame(
  element: ExcalidrawElement,
  frame: ExcalidrawElement,
  elements: readonly ExcalidrawElement[],
): boolean {
  return expandBoundVisualUnit([element.id], elements).some((id) => {
    const candidate = getElementById(elements, id);
    return candidate ? elementOverlapsFrame(candidate, frame) : false;
  });
}

/** Resolves metadata targets to the current visual elements inside one frame. */
export function resolveAnimationTargetElementIds(
  frameId: string,
  targets: readonly AnimationTarget[],
  elements: readonly ExcalidrawElement[],
): string[] {
  const frame = getElementById(elements, frameId);
  if (!frame) return [];
  const baseIds = new Set<string>();
  for (const target of targets) {
    if (target.type === "element") {
      const element = getElementById(elements, target.id);
      if (element && visualUnitOverlapsFrame(element, frame, elements)) {
        baseIds.add(canonicalElementTargetId(element, elements));
      }
      continue;
    }
    for (const element of elements) {
      const shape = asAnimationShape(element);
      if (shape.groupIds?.includes(target.id) && elementOverlapsFrame(element, frame)) {
        baseIds.add(element.id);
      }
    }
  }
  return expandBoundVisualUnit(baseIds, elements);
}

/** Converts the current Excalidraw selection into stable frame-local animation targets. */
export function captureAnimationTargets(
  frameId: string,
  elements: readonly ExcalidrawElement[],
  selectedElementIds: Readonly<Record<string, true>>,
  selectedGroupIds: Readonly<Record<string, boolean>>,
): CapturedAnimationTargets {
  const frame = getElementById(elements, frameId);
  if (!frame) return { targets: [], ignoredSelectionCount: Object.keys(selectedElementIds).length };
  const targets: AnimationTarget[] = [];
  const seen = new Set<string>();
  let ignoredSelectionCount = 0;
  const selectedGroups = Object.entries(selectedGroupIds)
    .filter(([, selected]) => selected)
    .map(([groupId]) => groupId);

  for (const groupId of selectedGroups) {
    const members = elements.filter((element) => asAnimationShape(element).groupIds?.includes(groupId));
    const inFrame = members.filter((element) => elementOverlapsFrame(element, frame));
    const selectedOutside = members.some(
      (element) => selectedElementIds[element.id] && !elementOverlapsFrame(element, frame),
    );
    if (inFrame.length > 0) {
      const key = `group:${groupId}`;
      if (!seen.has(key)) {
        seen.add(key);
        targets.push({ type: "group", id: groupId });
      }
    }
    if (selectedOutside) ignoredSelectionCount += 1;
  }

  for (const element of elements) {
    if (!selectedElementIds[element.id] || element.id === frameId) continue;
    const shape = asAnimationShape(element);
    if (selectedGroups.some((groupId) => shape.groupIds?.includes(groupId))) continue;
    if (!visualUnitOverlapsFrame(element, frame, elements)) {
      ignoredSelectionCount += 1;
      continue;
    }
    const id = canonicalElementTargetId(element, elements);
    const key = `element:${id}`;
    if (!seen.has(key)) {
      seen.add(key);
      targets.push({ type: "element", id });
    }
  }

  return { targets, ignoredSelectionCount };
}

function targetsOverlap(
  frameId: string,
  left: AnimationTarget,
  right: AnimationTarget,
  elements: readonly ExcalidrawElement[],
): boolean {
  const leftIds = new Set(resolveAnimationTargetElementIds(frameId, [left], elements));
  return resolveAnimationTargetElementIds(frameId, [right], elements).some((id) => leftIds.has(id));
}

/**
 * Moves conflicting targets out of other steps so one current visual unit belongs to one step.
 * Empty steps are removed. The edited step itself is excluded from conflict removal.
 */
export function removeAnimationTargetConflicts(
  frameId: string,
  steps: readonly AnimationStep[],
  incomingTargets: readonly AnimationTarget[],
  elements: readonly ExcalidrawElement[],
  editedStepId?: string,
): AnimationStep[] {
  return steps.flatMap((step) => {
    if (step.id === editedStepId) return [structuredClone(step)];
    const targets = step.targets.filter(
      (target) => !incomingTargets.some((incoming) => targetsOverlap(frameId, target, incoming, elements)),
    );
    return targets.length === 0 ? [] : [{ ...structuredClone(step), targets }];
  });
}

function getOpacity(element: ExcalidrawElement): number {
  return asAnimationShape(element).opacity;
}

function resolveRuntimeSteps(
  frameId: string,
  steps: readonly AnimationStep[],
  elements: readonly ExcalidrawElement[],
): ResolvedRuntimeStep[] {
  const resolved = steps.map((step) => ({
    step: structuredClone(step),
    elementIds: resolveAnimationTargetElementIds(frameId, step.targets, elements),
  }));
  const claimedByLaterStep = new Set<string>();
  for (let index = resolved.length - 1; index >= 0; index -= 1) {
    const current = resolved[index];
    if (!current) continue;
    current.elementIds = current.elementIds.filter((id) => !claimedByLaterStep.has(id));
    for (const id of current.elementIds) claimedByLaterStep.add(id);
  }
  return resolved.filter((step) => step.elementIds.length > 0);
}

/** Owns the transient animation state for one presentation or one editor preview. */
export class AnimationRuntime {
  private readonly ea: ExcalidrawAutomate;
  private readonly api: ExcalidrawAPI;
  private readonly hostView: ScriptExcalidrawView;
  private readonly ownerWindow: Window;
  private readonly onStateChange: ((state: AnimationRuntimeState) => void) | undefined;
  private active: ActiveAnimationSlide | null = null;
  private timer = 0;
  private generation = 0;
  private overlays = new Set<HTMLElement>();
  private buildQueue: Promise<void> = Promise.resolve();

  public constructor(options: AnimationRuntimeOptions) {
    this.ea = options.ea;
    this.api = options.api;
    this.hostView = options.hostView;
    this.ownerWindow = options.hostView.ownerWindow;
    this.onStateChange = options.onStateChange;
  }

  /** Returns current build progress for presentation-state consumers. */
  public getState(): AnimationRuntimeState {
    return {
      completedSteps: this.active?.completedSteps ?? 0,
      stepCount: this.active?.steps.length ?? 0,
    };
  }

  /** Restores the prior slide, resolves the destination's dynamic targets, and applies its build state. */
  public async enterSlide(
    slide: FrameDeckSlide,
    fullyBuilt: boolean,
    startTimedSteps = true,
  ): Promise<void> {
    await this.leaveSlide();
    const elements = this.api.getSceneElements() as readonly ExcalidrawElement[];
    const steps = resolveRuntimeSteps(slide.frameId, slide.animationSteps, elements);
    const allIds = new Set(steps.flatMap((step) => step.elementIds));
    const originals = new Map<string, ExcalidrawElement>();
    for (const element of elements) {
      if (allIds.has(element.id)) originals.set(element.id, element);
    }
    this.active = {
      frameId: slide.frameId,
      steps,
      originals,
      completedSteps: fullyBuilt ? steps.length : 0,
    };
    const generation = this.generation;
    try {
      if (!fullyBuilt) this.applyBuildState();
      this.emitState();
      if (startTimedSteps) this.schedulePendingTimedStep();
    } catch (error) {
      if (generation === this.generation) await this.leaveSlide();
      throw error;
    }
  }

  /** Starts the pending timed step after viewport navigation has completed. */
  public startPendingTimer(): void {
    this.schedulePendingTimedStep();
  }

  /** Pauses only the pending after-delay timer without changing build state. */
  public pauseTimedStep(): void {
    this.cancelTimer();
  }

  /** Reveals the next build step, returning false only when the slide is fully built. */
  public advance(): Promise<boolean> {
    const requestedGeneration = this.generation;
    return this.enqueueBuildAction(requestedGeneration, () =>
      this.advanceCurrentStep(requestedGeneration),
    );
  }

  /** Reverses the most recently completed build step, returning false at the slide's initial state. */
  public reverse(): Promise<boolean> {
    const requestedGeneration = this.generation;
    return this.enqueueBuildAction(requestedGeneration, () =>
      this.reverseCurrentStep(requestedGeneration),
    );
  }

  private enqueueBuildAction(
    requestedGeneration: number,
    task: () => Promise<boolean>,
  ): Promise<boolean> {
    const result = this.buildQueue.then(() => {
      if (requestedGeneration !== this.generation) return true;
      return task();
    });
    this.buildQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async advanceCurrentStep(generation: number): Promise<boolean> {
    const active = this.active;
    if (!active || active.completedSteps >= active.steps.length) return false;
    this.cancelTimer();
    const resolved = active.steps[active.completedSteps];
    if (!resolved) return false;
    try {
      await this.runStepEffect(resolved, false, generation);
      if (!this.active || generation !== this.generation) return true;
      this.active.completedSteps += 1;
      this.emitState();
      this.schedulePendingTimedStep();
      return true;
    } catch (error) {
      if (generation === this.generation) await this.leaveSlide();
      throw error;
    }
  }

  private async reverseCurrentStep(generation: number): Promise<boolean> {
    const active = this.active;
    if (!active || active.completedSteps <= 0) return false;
    this.cancelTimer();
    const resolved = active.steps[active.completedSteps - 1];
    if (!resolved) return false;
    try {
      await this.runStepEffect(resolved, true, generation);
      if (!this.active || generation !== this.generation) return true;
      this.active.completedSteps -= 1;
      this.emitState();
      return true;
    } catch (error) {
      if (generation === this.generation) await this.leaveSlide();
      throw error;
    }
  }

  /** Restores every animation target to its final/original visibility and invalidates callbacks. */
  public async finishActiveSlide(): Promise<void> {
    this.invalidateAsyncWork();
    if (this.active) this.restoreOriginalOpacities();
    this.active = null;
    this.emitState();
  }

  /** Leaves a slide with every animation target restored to its final/original visibility. */
  public async leaveSlide(): Promise<void> {
    await this.finishActiveSlide();
  }

  /** Runs one animation from the sidepanel and restores the drawing when the preview completes. */
  public async previewStep(frameId: string, step: AnimationStep): Promise<void> {
    await this.leaveSlide();
    const elements = this.api.getSceneElements() as readonly ExcalidrawElement[];
    const elementIds = resolveAnimationTargetElementIds(frameId, step.targets, elements);
    const originals = new Map<string, ExcalidrawElement>();
    for (const element of elements) {
      if (elementIds.includes(element.id)) originals.set(element.id, element);
    }
    this.active = {
      frameId,
      steps: elementIds.length > 0 ? [{ step: structuredClone(step), elementIds }] : [],
      originals,
      completedSteps: 0,
    };
    const generation = this.generation;
    try {
      this.applyBuildState();
      await this.wait(250, generation);
      if (this.active.steps[0] && generation === this.generation) {
        await this.runStepEffect(this.active.steps[0], false, generation);
      }
      await this.wait(Math.max(step.durationMs ?? 350, 150) + 120, generation);
    } finally {
      if (generation === this.generation && this.active) await this.leaveSlide();
    }
  }

  /** Temporarily exposes the fully built current slide for PDF export, then restores build state. */
  public async withFinalState<T>(task: () => Promise<T>): Promise<T> {
    const active = this.active;
    if (!active) return task();
    const completedSteps = active.completedSteps;
    this.invalidateAsyncWork();
    this.restoreOriginalOpacities();
    try {
      return await task();
    } finally {
      if (this.active === active) {
        active.completedSteps = completedSteps;
        this.applyBuildState();
        this.emitState();
        this.schedulePendingTimedStep();
      }
    }
  }

  private emitState(): void {
    this.onStateChange?.(this.getState());
  }

  private schedulePendingTimedStep(): void {
    this.cancelTimer();
    const active = this.active;
    const pending = active?.steps[active.completedSteps];
    if (!active || !pending || pending.step.trigger !== "after-delay") return;
    const generation = this.generation;
    this.timer = this.ownerWindow.setTimeout(() => {
      this.timer = 0;
      if (generation !== this.generation) return;
      void this.advance().catch((error) => {
        console.error("Slideshow timed animation failed", error);
      });
    }, pending.step.delayMs ?? 1000);
  }

  private applyBuildState(): void {
    const active = this.active;
    if (!active) return;
    const visibleIds = new Set(
      active.steps.slice(0, active.completedSteps).flatMap((resolved) => resolved.elementIds),
    );
    const opacities = new Map<string, number>();
    for (const [id, original] of active.originals) {
      opacities.set(id, visibleIds.has(id) ? getOpacity(original) : 0);
    }
    this.applyOpacities(opacities);
  }

  private restoreOriginalOpacities(): void {
    const active = this.active;
    if (!active || active.originals.size === 0) return;
    const opacities = new Map<string, number>();
    for (const [id, original] of active.originals) opacities.set(id, getOpacity(original));
    this.applyOpacities(opacities);
  }

  private applyOpacities(opacities: ReadonlyMap<string, number>): void {
    if (opacities.size === 0) return;
    const current = this.api.getSceneElements() as readonly ExcalidrawElement[];
    const elements = current.map((element) => {
      const opacity = opacities.get(element.id);
      return opacity === undefined ? element : ({ ...element, opacity } as ExcalidrawElement);
    });
    this.api.updateScene({ elements, captureUpdate: "NEVER" });
  }

  private async runStepEffect(
    resolved: ResolvedRuntimeStep,
    reverse: boolean,
    generation: number,
  ): Promise<void> {
    const { step, elementIds } = resolved;
    if (step.effect === "appear") {
      this.applyResolvedOpacity(resolved, reverse ? 0 : null);
      return;
    }
    if (step.effect === "fade") {
      await this.animateFade(resolved, reverse, generation);
      return;
    }
    await this.animateOverlay(resolved, reverse, generation);
  }

  private applyResolvedOpacity(resolved: ResolvedRuntimeStep, opacity: number | null): void {
    const active = this.active;
    if (!active) return;
    const opacities = new Map<string, number>();
    for (const id of resolved.elementIds) {
      const original = active.originals.get(id);
      if (original) opacities.set(id, opacity ?? getOpacity(original));
    }
    this.applyOpacities(opacities);
  }

  private async animateFade(
    resolved: ResolvedRuntimeStep,
    reverse: boolean,
    generation: number,
  ): Promise<void> {
    const active = this.active;
    if (!active) return;
    const duration = resolved.step.durationMs ?? 350;
    const started = this.ownerWindow.performance.now();
    while (generation === this.generation) {
      const elapsed = this.ownerWindow.performance.now() - started;
      const progress = duration <= 0 ? 1 : Math.min(elapsed / duration, 1);
      const opacities = new Map<string, number>();
      for (const id of resolved.elementIds) {
        const original = active.originals.get(id);
        if (!original) continue;
        const originalOpacity = getOpacity(original);
        opacities.set(id, reverse ? originalOpacity * (1 - progress) : originalOpacity * progress);
      }
      this.applyOpacities(opacities);
      if (progress >= 1) break;
      await this.nextFrame(generation);
    }
  }

  private async animateOverlay(
    resolved: ResolvedRuntimeStep,
    reverse: boolean,
    generation: number,
  ): Promise<void> {
    const overlay = await this.createOverlay(resolved.elementIds);
    if (!overlay || generation !== this.generation) {
      overlay?.remove();
      return;
    }
    this.overlays.add(overlay);
    const duration = resolved.step.durationMs ?? 350;
    const motion = this.getOverlayMotion(resolved.step, overlay);
    overlay.style.transition = "none";
    overlay.style.opacity = "1";
    overlay.style.transform = reverse ? motion.end : motion.start;
    if (reverse) this.applyResolvedOpacity(resolved, 0);
    await this.nextFrame(generation);
    await this.nextFrame(generation);
    if (generation !== this.generation) return;
    overlay.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
    overlay.style.transform = reverse ? motion.start : motion.end;
    if (reverse && resolved.step.effect === "zoom") overlay.style.opacity = "0";
    await this.wait(duration + 24, generation);
    if (!reverse && generation === this.generation) this.applyResolvedOpacity(resolved, null);
    overlay.remove();
    this.overlays.delete(overlay);
  }

  private getOverlayMotion(
    step: AnimationStep,
    overlay: HTMLElement,
  ): { start: string; end: string } {
    if (step.effect === "zoom") return { start: "scale(0.05)", end: "scale(1)" };
    const rect = overlay.getBoundingClientRect();
    const appState = this.api.getAppState();
    const horizontal = Math.max(rect.width, appState.width * 0.2, 80);
    const vertical = Math.max(rect.height, appState.height * 0.2, 80);
    const start =
      step.direction === "right"
        ? `translateX(${horizontal}px)`
        : step.direction === "up"
          ? `translateY(-${vertical}px)`
          : step.direction === "down"
            ? `translateY(${vertical}px)`
            : `translateX(-${horizontal}px)`;
    return { start, end: "translate(0, 0)" };
  }

  private async createOverlay(elementIds: readonly string[]): Promise<HTMLElement | null> {
    const active = this.active;
    if (!active) return null;
    const originals = elementIds
      .map((id) => active.originals.get(id))
      .filter((element): element is ExcalidrawElement => Boolean(element));
    if (originals.length === 0) return null;
    this.ea.setView(this.hostView);
    const svg = await this.ea.createViewSVG({
      withBackground: false,
      theme: this.api.getAppState().theme,
      frameRendering: { enabled: false, name: false, outline: false, clip: false },
      padding: 0,
      selectedOnly: false,
      skipInliningFonts: false,
      embedScene: false,
      elementsOverride: originals,
    });
    const excalidraw = this.hostView.contentEl.querySelector<HTMLElement>(".excalidraw");
    if (!excalidraw) return null;
    const bounds = this.ea.getBoundingBox(originals);
    const state = this.api.getAppState();
    const zoom = state.zoom.value;
    const overlay = this.hostView.ownerDocument.createElement("div");
    overlay.className = "slideshow-animation-overlay";
    overlay.style.position = "absolute";
    overlay.style.pointerEvents = "none";
    overlay.style.zIndex = "4";
    overlay.style.left = `${state.offsetLeft + (bounds.topX + state.scrollX) * zoom}px`;
    overlay.style.top = `${state.offsetTop + (bounds.topY + state.scrollY) * zoom}px`;
    overlay.style.width = `${Math.max(bounds.width * zoom, 1)}px`;
    overlay.style.height = `${Math.max(bounds.height * zoom, 1)}px`;
    overlay.style.transformOrigin = "center center";
    overlay.innerHTML = svg.outerHTML;
    const child = overlay.firstElementChild as SVGSVGElement | null;
    if (child) {
      child.setAttribute("width", "100%");
      child.setAttribute("height", "100%");
      child.style.display = "block";
      child.style.overflow = "visible";
    }
    excalidraw.appendChild(overlay);
    return overlay;
  }

  private cancelTimer(): void {
    if (this.timer) this.ownerWindow.clearTimeout(this.timer);
    this.timer = 0;
  }

  private invalidateAsyncWork(): void {
    this.generation += 1;
    this.cancelTimer();
    for (const overlay of this.overlays) overlay.remove();
    this.overlays.clear();
  }

  private nextFrame(generation: number): Promise<void> {
    if (generation !== this.generation) return Promise.resolve();
    return new Promise((resolve) => {
      this.ownerWindow.requestAnimationFrame(() => resolve());
    });
  }

  private wait(delay: number, generation: number): Promise<void> {
    if (generation !== this.generation) return Promise.resolve();
    return new Promise((resolve) => {
      this.ownerWindow.setTimeout(resolve, delay);
    });
  }
}
