/**
 * @file AnimationEditor.ts
 * @overview Sidepanel editor for frame animation targets, effects, timing, ordering, and previews.
 */

/* eslint-disable max-lines-per-function -- The editor form is kept in one render path so controls remain synchronized. */

import type { AppState } from "@zsviczian/excalidraw/types";

import {
  AnimationRuntime,
  captureAnimationTargets,
  recycleMissingAnimationTargets,
  removeAnimationTargetConflicts,
  resolveAnimationTargetElementIds,
} from "./AnimationRuntime";
import type { FrameDeckSlide } from "./SlideDeck";
import type { SlideshowTranslator } from "./lang";
import { saveFrameAnimationSteps } from "./slideDeckMutations";
import type {
  AnimationDirection,
  AnimationEffect,
  AnimationStep,
  AnimationTarget,
  AnimationTrigger,
  SlideshowIcons,
} from "./types";

export interface AnimationEditorOptions {
  ea: ExcalidrawAutomate;
  api: ExcalidrawAPI;
  hostView: ScriptExcalidrawView;
  container: HTMLElement;
  slide: FrameDeckSlide;
  icons: SlideshowIcons;
  t: SlideshowTranslator;
  onSaved(): void;
}

function targetKey(target: AnimationTarget): string {
  return `${target.type}:${target.id}`;
}

function sameTargets(left: readonly AnimationTarget[], right: readonly AnimationTarget[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((target, index) => targetKey(target) === targetKey(right[index] ?? target));
}

function uniqueStepId(steps: readonly AnimationStep[]): string {
  const used = new Set(steps.map((step) => step.id));
  const base = `animation-${Date.now().toString(36)}`;
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  return id;
}

function moveStep(steps: AnimationStep[], fromIndex: number, toIndex: number): void {
  if (fromIndex < 0 || toIndex < 0 || fromIndex >= steps.length || toIndex >= steps.length) return;
  const [step] = steps.splice(fromIndex, 1);
  if (step) steps.splice(toIndex, 0, step);
}

/** Owns one frame's animation-editing session. */
export class AnimationEditor {
  private steps: AnimationStep[];
  private selectedStepId: string | null = null;
  private targets: AnimationTarget[] = [];
  private ignoredSelectionCount = 0;
  private effect: AnimationEffect = "appear";
  private trigger: AnimationTrigger = "advance";
  private delayMs = 1000;
  private durationMs = 350;
  private direction: AnimationDirection = "left";
  private destroyed = false;
  private saving = false;
  private ignoreSelectionUntil = 0;
  private recycleTimer = 0;
  private pendingRecycleElements: readonly ExcalidrawElement[] | null = null;
  private readonly previewRuntime: AnimationRuntime;

  public constructor(private readonly options: AnimationEditorOptions) {
    this.steps = options.slide.animationSteps.map((step) => structuredClone(step));
    this.previewRuntime = new AnimationRuntime({
      ea: options.ea,
      api: options.api,
      hostView: options.hostView,
    });
  }

  /** Renders the editor into its current sidepanel container. */
  public render(): void {
    if (this.destroyed) return;
    const { container, icons, t } = this.options;
    const doc = container.ownerDocument;
    container.replaceChildren();
    container.className = "slideshow-animation-editor";

    const instructions = doc.createElement("div");
    instructions.className = "slideshow-animation-editor__hint";
    instructions.textContent = t("animationSelectionHint");
    container.appendChild(instructions);

    if (this.ignoredSelectionCount > 0) {
      const warning = doc.createElement("div");
      warning.className = "slideshow-warning";
      warning.textContent = t("animationOutsideFrameIgnored", { count: this.ignoredSelectionCount });
      container.appendChild(warning);
    }

    const targetSection = doc.createElement("div");
    targetSection.className = "slideshow-animation-editor__section";
    const targetHeading = doc.createElement("div");
    targetHeading.className = "slideshow-animation-editor__section-title";
    targetHeading.textContent = t("animationTargets");
    targetSection.appendChild(targetHeading);
    const chips = doc.createElement("div");
    chips.className = "slideshow-animation-editor__targets";
    if (this.targets.length === 0) {
      const empty = doc.createElement("span");
      empty.className = "slideshow-animation-editor__muted";
      empty.textContent = t("animationNoTargets");
      chips.appendChild(empty);
    } else {
      this.targets.forEach((target, index) => {
        const chip = doc.createElement("span");
        chip.className = "slideshow-animation-editor__target";
        const label = doc.createElement("span");
        label.textContent = this.getTargetLabel(target);
        chip.appendChild(label);
        const remove = this.iconButton(doc, icons.close, t("removeAnimationTarget"), false, () => {
          this.targets.splice(index, 1);
          this.render();
        });
        chip.appendChild(remove);
        chips.appendChild(chip);
      });
    }
    targetSection.appendChild(chips);
    container.appendChild(targetSection);

    const form = doc.createElement("div");
    form.className = "slideshow-animation-editor__form";
    const effectSelect = this.createSelect<AnimationEffect>(doc, t("animationEffect"), [
      ["appear", t("animationEffectAppear")],
      ["fade", t("animationEffectFade")],
      ["slide", t("animationEffectSlide")],
      ["zoom", t("animationEffectZoom")],
    ], this.effect, (value) => {
      this.effect = value;
      this.render();
    });
    form.appendChild(effectSelect);

    const triggerSelect = this.createSelect<AnimationTrigger>(doc, t("animationTrigger"), [
      ["advance", t("animationTriggerAdvance")],
      ["after-delay", t("animationTriggerDelay")],
    ], this.trigger, (value) => {
      this.trigger = value;
      this.render();
    });
    form.appendChild(triggerSelect);

    if (this.trigger === "after-delay") {
      form.appendChild(
        this.numberField(doc, t("animationDelayMs"), this.delayMs, 0, (value) => {
          this.delayMs = value;
        }),
      );
    }
    if (this.effect !== "appear") {
      form.appendChild(
        this.numberField(doc, t("animationDurationMs"), this.durationMs, 0, (value) => {
          this.durationMs = value;
        }),
      );
    }
    if (this.effect === "slide") {
      form.appendChild(
        this.createSelect<AnimationDirection>(doc, t("animationDirection"), [
          ["left", t("animationDirectionLeft")],
          ["right", t("animationDirectionRight")],
          ["up", t("animationDirectionUp")],
          ["down", t("animationDirectionDown")],
        ], this.direction, (value) => {
          this.direction = value;
        }),
      );
    }
    container.appendChild(form);

    const formActions = doc.createElement("div");
    formActions.className = "slideshow-animation-editor__form-actions";
    const saveLabel = this.selectedStepId ? t("updateAnimationStep") : t("addAnimationStep");
    const saveButton = doc.createElement("button");
    saveButton.type = "button";
    saveButton.disabled = this.saving || this.targets.length === 0;
    saveButton.innerHTML = `${icons.plus}<span>${saveLabel}</span>`;
    saveButton.addEventListener("click", () => void this.saveCurrentStep());
    formActions.appendChild(saveButton);
    const previewButton = doc.createElement("button");
    previewButton.type = "button";
    previewButton.disabled = this.targets.length === 0;
    previewButton.innerHTML = `${icons.play}<span>${t("previewAnimation")}</span>`;
    previewButton.addEventListener("click", () => void this.previewCurrentStep());
    formActions.appendChild(previewButton);
    if (this.selectedStepId) {
      const cancelButton = doc.createElement("button");
      cancelButton.type = "button";
      cancelButton.textContent = t("newAnimationStep");
      cancelButton.addEventListener("click", () => {
        this.selectedStepId = null;
        this.targets = [];
        this.resetFormDefaults();
        this.render();
      });
      formActions.appendChild(cancelButton);
    }
    container.appendChild(formActions);

    const stepHeading = doc.createElement("div");
    stepHeading.className = "slideshow-animation-editor__section-title";
    stepHeading.textContent = t("animationSequence", { count: this.steps.length });
    container.appendChild(stepHeading);

    const stepList = doc.createElement("div");
    stepList.className = "slideshow-animation-editor__steps";
    if (this.steps.length === 0) {
      const empty = doc.createElement("div");
      empty.className = "slideshow-animation-editor__muted";
      empty.textContent = t("animationNoSteps");
      stepList.appendChild(empty);
    }
    this.steps.forEach((step, index) => stepList.appendChild(this.renderStep(doc, step, index)));
    container.appendChild(stepList);
  }

  /** Processes live scene changes while animation editing is active. */
  public handleSceneChange(
    elements: readonly ExcalidrawElement[],
    appState: Pick<AppState, "selectedElementIds" | "selectedGroupIds">,
  ): void {
    this.captureSelection(elements, appState);
    this.scheduleMissingTargetRecycle(elements);
  }

  /** Captures the live canvas selection while animation editing is active. */
  public captureSelection(
    elements: readonly ExcalidrawElement[],
    appState: Pick<AppState, "selectedElementIds" | "selectedGroupIds">,
  ): void {
    if (this.destroyed || Date.now() < this.ignoreSelectionUntil) return;
    const captured = captureAnimationTargets(
      this.options.slide.frameId,
      elements,
      appState.selectedElementIds,
      appState.selectedGroupIds,
    );
    if (
      sameTargets(captured.targets, this.targets) &&
      captured.ignoredSelectionCount === this.ignoredSelectionCount
    ) {
      return;
    }
    this.targets = captured.targets;
    this.ignoredSelectionCount = captured.ignoredSelectionCount;
    this.render();
  }

  /** Restores preview state and releases editor-owned resources. */
  public async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.recycleTimer) this.options.hostView.ownerWindow.clearTimeout(this.recycleTimer);
    this.recycleTimer = 0;
    this.pendingRecycleElements = null;
    await this.previewRuntime.leaveSlide();
  }

  private scheduleMissingTargetRecycle(elements: readonly ExcalidrawElement[]): void {
    if (this.destroyed) return;
    this.pendingRecycleElements = elements;
    const ownerWindow = this.options.hostView.ownerWindow;
    if (this.recycleTimer) ownerWindow.clearTimeout(this.recycleTimer);
    this.recycleTimer = ownerWindow.setTimeout(() => {
      this.recycleTimer = 0;
      void this.recycleMissingTargets();
    }, 160);
  }

  private async recycleMissingTargets(): Promise<void> {
    if (this.destroyed) return;
    const elements = this.pendingRecycleElements ?? this.options.ea.getViewElements();
    this.pendingRecycleElements = null;
    if (this.saving) {
      this.scheduleMissingTargetRecycle(elements);
      return;
    }

    const steps = recycleMissingAnimationTargets(this.steps, elements);
    if (JSON.stringify(steps) === JSON.stringify(this.steps)) return;

    this.saving = true;
    try {
      await saveFrameAnimationSteps(this.options.ea, this.options.slide.frameId, steps);
      this.steps = steps;
      if (this.selectedStepId) {
        const selectedStep = steps.find((step) => step.id === this.selectedStepId);
        if (selectedStep) {
          this.targets = selectedStep.targets.map((target) => structuredClone(target));
        } else {
          this.selectedStepId = null;
          this.targets = [];
          this.resetFormDefaults();
        }
      }
      this.options.onSaved();
    } catch (error) {
      console.error("Slideshow stale animation cleanup failed", error);
      new Notice(this.options.t("animationSaveFailed"));
    } finally {
      this.saving = false;
      this.render();
    }
  }

  private renderStep(doc: Document, step: AnimationStep, index: number): HTMLElement {
    const { icons, t } = this.options;
    const row = doc.createElement("div");
    row.className = "slideshow-animation-editor__step";
    if (step.id === this.selectedStepId) row.classList.add("is-selected");
    row.tabIndex = 0;
    row.draggable = this.options.ea.DEVICE.isDesktop;
    const summary = doc.createElement("button");
    summary.type = "button";
    summary.className = "slideshow-animation-editor__step-summary";
    summary.textContent = t("animationStepSummary", {
      number: index + 1,
      effect: this.effectLabel(step.effect),
      targets: step.targets.length,
    });
    summary.addEventListener("click", () => this.selectStep(step));
    row.appendChild(summary);

    const actions = doc.createElement("div");
    actions.className = "slideshow-animation-editor__step-actions";
    actions.appendChild(
      this.iconButton(doc, icons.chevronUp, t("moveAnimationStepUp"), index === 0, () => {
        void this.reorderStep(index, index - 1);
      }),
    );
    actions.appendChild(
      this.iconButton(
        doc,
        icons.chevronDown,
        t("moveAnimationStepDown"),
        index === this.steps.length - 1,
        () => void this.reorderStep(index, index + 1),
      ),
    );
    actions.appendChild(
      this.iconButton(doc, icons.play, t("previewAnimationStep"), false, () => {
        void this.previewRuntime.previewStep(this.options.slide.frameId, step);
      }),
    );
    actions.appendChild(
      this.iconButton(doc, icons.trash, t("deleteAnimationStep"), false, () => {
        void this.deleteStep(step.id);
      }),
    );
    row.appendChild(actions);

    if (this.options.ea.DEVICE.isDesktop) {
      row.addEventListener("dragstart", (event) => {
        event.dataTransfer?.setData("text/plain", String(index));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        const fromIndex = Number.parseInt(event.dataTransfer?.getData("text/plain") ?? "", 10);
        if (Number.isInteger(fromIndex) && fromIndex !== index) void this.reorderStep(fromIndex, index);
      });
    }
    row.addEventListener("keydown", (event) => {
      if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
      event.preventDefault();
      const target = event.key === "ArrowUp" ? index - 1 : index + 1;
      void this.reorderStep(index, target);
    });
    return row;
  }

  private selectStep(step: AnimationStep): void {
    this.selectedStepId = step.id;
    this.targets = step.targets.map((target) => structuredClone(target));
    this.effect = step.effect;
    this.trigger = step.trigger;
    this.delayMs = step.delayMs ?? 1000;
    this.durationMs = step.durationMs ?? 350;
    this.direction = step.direction ?? "left";
    this.ignoredSelectionCount = 0;
    const ids = resolveAnimationTargetElementIds(
      this.options.slide.frameId,
      step.targets,
      this.options.ea.getViewElements(),
    );
    const elements = this.options.ea
      .getViewElements()
      .filter((element) => ids.includes(element.id));
    this.ignoreSelectionUntil = Date.now() + 500;
    if (elements.length > 0) this.options.ea.selectElementsInView(elements);
    this.render();
  }

  private async saveCurrentStep(): Promise<void> {
    if (this.saving || this.targets.length === 0) return;
    this.saving = true;
    this.render();
    try {
      const elements = this.options.ea.getViewElements();
      const selectedId = this.selectedStepId;
      let steps = removeAnimationTargetConflicts(
        this.options.slide.frameId,
        this.steps,
        this.targets,
        elements,
        selectedId ?? undefined,
      );
      const step = this.buildFormStep(selectedId ?? uniqueStepId(steps));
      if (selectedId) {
        const index = steps.findIndex((candidate) => candidate.id === selectedId);
        if (index >= 0) steps[index] = step;
        else steps.push(step);
      } else {
        steps.push(step);
      }
      await saveFrameAnimationSteps(this.options.ea, this.options.slide.frameId, steps);
      this.steps = steps;
      this.selectedStepId = step.id;
      this.targets = step.targets.map((target) => structuredClone(target));
      this.options.onSaved();
    } catch (error) {
      console.error("Slideshow animation metadata save failed", error);
      new Notice(this.options.t("animationSaveFailed"));
    } finally {
      this.saving = false;
      this.render();
    }
  }

  private async reorderStep(fromIndex: number, toIndex: number): Promise<void> {
    if (toIndex < 0 || toIndex >= this.steps.length || this.saving) return;
    const steps = this.steps.map((step) => structuredClone(step));
    moveStep(steps, fromIndex, toIndex);
    await this.persistSteps(steps);
  }

  private async deleteStep(stepId: string): Promise<void> {
    if (this.saving) return;
    const steps = this.steps.filter((step) => step.id !== stepId);
    await this.persistSteps(steps);
    if (this.selectedStepId === stepId) {
      this.selectedStepId = null;
      this.targets = [];
      this.resetFormDefaults();
    }
    this.render();
  }

  private async persistSteps(steps: AnimationStep[]): Promise<void> {
    this.saving = true;
    try {
      await saveFrameAnimationSteps(this.options.ea, this.options.slide.frameId, steps);
      this.steps = steps;
      this.options.onSaved();
    } catch (error) {
      console.error("Slideshow animation sequence save failed", error);
      new Notice(this.options.t("animationSaveFailed"));
    } finally {
      this.saving = false;
      this.render();
    }
  }

  private async previewCurrentStep(): Promise<void> {
    if (this.targets.length === 0) return;
    await this.previewRuntime.previewStep(
      this.options.slide.frameId,
      this.buildFormStep(this.selectedStepId ?? "preview"),
    );
  }

  private buildFormStep(id: string): AnimationStep {
    const step: AnimationStep = {
      id,
      targets: this.targets.map((target) => structuredClone(target)),
      effect: this.effect,
      trigger: this.trigger,
    };
    if (this.trigger === "after-delay") step.delayMs = this.delayMs;
    if (this.effect !== "appear") step.durationMs = this.durationMs;
    if (this.effect === "slide") step.direction = this.direction;
    return step;
  }

  private resetFormDefaults(): void {
    this.effect = "appear";
    this.trigger = "advance";
    this.delayMs = 1000;
    this.durationMs = 350;
    this.direction = "left";
  }

  private getTargetLabel(target: AnimationTarget): string {
    if (target.type === "group") {
      return this.options.t("animationGroupTarget", { id: target.id.slice(0, 8) });
    }
    const element = this.options.ea.getViewElements().find((candidate) => candidate.id === target.id);
    return this.options.t("animationElementTarget", {
      type: element?.type ?? "?",
      id: target.id.slice(0, 8),
    });
  }

  private effectLabel(effect: AnimationEffect): string {
    const { t } = this.options;
    switch (effect) {
      case "fade":
        return t("animationEffectFade");
      case "slide":
        return t("animationEffectSlide");
      case "zoom":
        return t("animationEffectZoom");
      default:
        return t("animationEffectAppear");
    }
  }

  private iconButton(
    doc: Document,
    icon: string,
    label: string,
    disabled: boolean,
    callback: () => void,
  ): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.innerHTML = icon;
    button.disabled = disabled;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", callback);
    return button;
  }

  private createSelect<T extends string>(
    doc: Document,
    labelText: string,
    options: readonly (readonly [T, string])[],
    value: T,
    onChange: (value: T) => void,
  ): HTMLElement {
    const label = doc.createElement("label");
    const text = doc.createElement("span");
    text.textContent = labelText;
    label.appendChild(text);
    const select = doc.createElement("select");
    for (const [optionValue, optionLabel] of options) {
      const option = doc.createElement("option");
      option.value = optionValue;
      option.textContent = optionLabel;
      select.appendChild(option);
    }
    select.value = value;
    select.addEventListener("change", () => onChange(select.value as T));
    label.appendChild(select);
    return label;
  }

  private numberField(
    doc: Document,
    labelText: string,
    value: number,
    min: number,
    onChange: (value: number) => void,
  ): HTMLElement {
    const label = doc.createElement("label");
    const text = doc.createElement("span");
    text.textContent = labelText;
    label.appendChild(text);
    const input = doc.createElement("input");
    input.type = "number";
    input.min = String(min);
    input.step = "50";
    input.value = String(value);
    input.addEventListener("change", () => {
      const parsed = Number(input.value);
      onChange(Number.isFinite(parsed) ? Math.max(min, parsed) : value);
    });
    label.appendChild(input);
    return label;
  }
}
