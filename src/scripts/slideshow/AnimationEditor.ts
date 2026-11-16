/**
 * @file AnimationEditor.ts
 * @overview Sidepanel editor for frame animation targets, effects, timing, ordering, and previews.
 */

/* eslint-disable max-lines-per-function -- The editor form is kept in one render path so controls remain synchronized. */

import type { AppState } from "@zsviczian/excalidraw/types";

import { AnimationTargetPreviewService } from "./AnimationTargetPreviewService";
import {
  AnimationRuntime,
  type AnimationSlideScope,
  captureAnimationTargets,
  getAnimationSlideScope,
  recycleMissingAnimationTargets,
  resolveAnimationTargetElementIds,
} from "./AnimationRuntime";
import type { SlideDeckSlide } from "./SlideDeck";
import { getAnimationEditorIcon, type AnimationIconChoice } from "./icons";
import type { SlideshowTranslator } from "./lang";
import { saveFrameAnimationSteps, saveLineAnimationSteps } from "./slideDeckMutations";
import type {
  AnimationDirection,
  AnimationEffect,
  AnimationStep,
  AnimationTarget,
  AnimationTrigger,
  SlideshowConfig,
  SlideshowIcons,
} from "./types";
import { isExitAnimationEffect, isInstantAnimationEffect } from "./types";

export interface AnimationEditorOptions {
  ea: ExcalidrawAutomate;
  api: ExcalidrawAPI;
  hostView: ScriptExcalidrawView;
  container: HTMLElement;
  slide: SlideDeckSlide;
  config: SlideshowConfig;
  icons: SlideshowIcons;
  t: SlideshowTranslator;
  onSaved(steps: readonly AnimationStep[]): void;
}

function targetKey(target: AnimationTarget): string {
  return `${target.type}:${target.id}:${target.scope ?? "slide"}`;
}

function sameTargets(left: readonly AnimationTarget[], right: readonly AnimationTarget[]): boolean {
  if (left.length !== right.length) return false;
  const keys = new Set(right.map(targetKey));
  return left.every((target) => keys.has(targetKey(target)));
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
  private newStepDefaults = {
    effect: this.effect,
    trigger: this.trigger,
    delayMs: this.delayMs,
    durationMs: this.durationMs,
    direction: this.direction,
  };
  private lastSelectionTargets: AnimationTarget[] | null = null;
  private destroyed = false;
  private saving = false;
  private selectingStep = false;
  private recycleTimer = 0;
  private pendingRecycleElements: readonly ExcalidrawElement[] | null = null;
  private readonly previewRuntime: AnimationRuntime;
  private readonly targetPreviews: AnimationTargetPreviewService;
  private readonly drawingFile: ScriptExcalidrawView["file"];

  public constructor(private readonly options: AnimationEditorOptions) {
    this.steps = options.slide.animationSteps.map((step) => structuredClone(step));
    this.drawingFile = options.hostView.file;
    this.targetPreviews = new AnimationTargetPreviewService(options.ea, options.api);
    this.previewRuntime = new AnimationRuntime({
      ea: options.ea,
      api: options.api,
      hostView: options.hostView,
      config: options.config,
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
      warning.textContent = t("animationOutsideSlideIgnored", { count: this.ignoredSelectionCount });
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
        const preview = this.createTargetPreview(doc, [target], "slideshow-animation-editor__target-preview");
        preview.setAttribute("role", "img");
        preview.setAttribute("aria-label", this.getTargetLabel(target));
        chip.appendChild(preview);
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
    const effectSelect = this.createChoices<AnimationEffect>(doc, t("animationEffect"), [
      ["appear", t("animationEffectAppear")],
      ["fade", t("animationEffectFade")],
      ["slide", t("animationEffectSlide")],
      ["zoom", t("animationEffectZoom")],
      ["disappear", t("animationEffectDisappear")],
      ["fade-out", t("animationEffectFadeOut")],
      ["slide-out", t("animationEffectSlideOut")],
      ["zoom-out", t("animationEffectZoomOut")],
    ], this.effect, (value) => {
      this.effect = value;
      this.rememberFormDefaults();
      this.render();
    });
    form.appendChild(effectSelect);

    const triggerSelect = this.createChoices<AnimationTrigger>(doc, t("animationTrigger"), [
      ["advance", t("animationTriggerAdvance")],
      ["after-delay", t("animationTriggerDelay")],
    ], this.trigger, (value) => {
      this.trigger = value;
      this.rememberFormDefaults();
      this.render();
    });
    form.appendChild(triggerSelect);

    if (this.trigger === "after-delay") {
      form.appendChild(
        this.numberField(doc, t("animationDelayMs"), this.delayMs, 0, (value) => {
          this.delayMs = value;
          this.rememberFormDefaults();
        }),
      );
    }
    if (!isInstantAnimationEffect(this.effect)) {
      form.appendChild(
        this.numberField(doc, t("animationDurationMs"), this.durationMs, 0, (value) => {
          this.durationMs = value;
          this.rememberFormDefaults();
        }),
      );
    }
    if (this.effect === "slide" || this.effect === "slide-out") {
      const directionOptions: Array<[AnimationDirection, string]> = isExitAnimationEffect(this.effect)
        ? [
            ["left", t("animationDirectionOutLeft")],
            ["right", t("animationDirectionOutRight")],
            ["up", t("animationDirectionOutUp")],
            ["down", t("animationDirectionOutDown")],
          ]
        : [
            ["left", t("animationDirectionLeft")],
            ["right", t("animationDirectionRight")],
            ["up", t("animationDirectionUp")],
            ["down", t("animationDirectionDown")],
          ];
      form.appendChild(
        this.createChoices<AnimationDirection>(doc, t("animationDirection"), directionOptions, this.direction, (value) => {
          this.direction = value;
          this.rememberFormDefaults();
          this.render();
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
        this.startNewStep();
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
    if (
      this.destroyed ||
      !this.isCurrentDrawing() ||
      this.selectingStep
    ) {
      return;
    }
    const captured = captureAnimationTargets(
      this.getSlideScope(),
      elements,
      appState.selectedElementIds,
      appState.selectedGroupIds,
    );
    if (
      this.lastSelectionTargets !== null &&
      sameTargets(captured.targets, this.lastSelectionTargets) &&
      captured.ignoredSelectionCount === this.ignoredSelectionCount
    ) {
      return;
    }
    const selectionChanged = this.lastSelectionTargets === null ||
      !sameTargets(captured.targets, this.lastSelectionTargets);
    this.lastSelectionTargets = captured.targets;
    if (selectionChanged) {
      const ids = new Set(resolveAnimationTargetElementIds(this.getSlideScope(), captured.targets, elements));
      const firstStep = this.steps.find((step) =>
        resolveAnimationTargetElementIds(this.getSlideScope(), step.targets, elements).some((id) => ids.has(id)),
      );
      if (firstStep) this.loadStepForm(firstStep);
      else {
        this.startNewStep();
        this.targets = captured.targets;
      }
    }
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
    this.targetPreviews.destroy();
    if (this.isCurrentDrawing()) await this.previewRuntime.leaveSlide();
    else this.previewRuntime.abandonActiveSlide();
  }

  private scheduleMissingTargetRecycle(elements: readonly ExcalidrawElement[]): void {
    if (this.destroyed || !this.isCurrentDrawing()) return;
    this.pendingRecycleElements = elements;
    const ownerWindow = this.options.hostView.ownerWindow;
    if (this.recycleTimer) ownerWindow.clearTimeout(this.recycleTimer);
    this.recycleTimer = ownerWindow.setTimeout(() => {
      this.recycleTimer = 0;
      void this.recycleMissingTargets();
    }, 160);
  }

  private async recycleMissingTargets(): Promise<void> {
    if (this.destroyed || !this.isCurrentDrawing()) return;
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
      await this.saveAnimationSteps(steps);
      if (!this.isCurrentDrawing()) return;
      this.steps = steps;
      if (this.selectedStepId) {
        const selectedStep = steps.find((step) => step.id === this.selectedStepId);
        if (selectedStep) {
          this.targets = selectedStep.targets.map((target) => structuredClone(target));
        } else {
          this.selectedStepId = null;
          this.targets = [];
          this.startNewStep();
        }
      }
      this.options.onSaved(this.steps);
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
    const label = doc.createElement("span");
    label.textContent = t("animationStepSummary", {
      number: index + 1,
      effect: this.effectLabel(step.effect),
      targets: step.targets.length,
    });
    const preview = this.createTargetPreview(doc, step.targets, "slideshow-animation-editor__step-preview");
    summary.append(preview, label);
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
        void this.previewRuntime.previewStep(this.getSlideScope(), step);
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

  /** Loads a saved step without changing the user's defaults for the next new step. */
  private loadStepForm(step: AnimationStep): void {
    this.selectedStepId = step.id;
    this.targets = step.targets.map((target) => structuredClone(target));
    this.effect = step.effect;
    this.trigger = step.trigger;
    this.delayMs = step.delayMs ?? 1000;
    this.durationMs = step.durationMs ?? 350;
    this.direction = step.direction ?? "left";
    this.ignoredSelectionCount = 0;
  }

  /** Shares the bounded thumbnail cache between selected-target cards and sequence rows. */
  private createTargetPreview(
    doc: Document,
    targets: readonly AnimationTarget[],
    className: string,
  ): HTMLElement {
    const preview = doc.createElement("span");
    preview.className = className;
    void this.targetPreviews.createPreview(
      this.getSlideScope(), targets, doc,
      () => !this.destroyed && preview.isConnected && this.isCurrentDrawing(),
      this.previewRuntime.getOriginalOpacities(),
    ).then((image) => {
      if (image && !this.destroyed && preview.isConnected) preview.replaceChildren(image);
    }).catch((error) => console.error("Slideshow animation thumbnail failed", error));
    return preview;
  }

  private selectStep(step: AnimationStep): void {
    this.loadStepForm(step);
    const ids = resolveAnimationTargetElementIds(
      this.getSlideScope(),
      step.targets,
      this.options.ea.getViewElements(),
    );
    const elements = this.options.ea
      .getViewElements()
      .filter((element) => ids.includes(element.id));
    // Remember the programmatic canvas selection so its later onChange cannot
    // replace a deliberately selected second/third animation with the first one.
    this.selectingStep = true;
    try {
      if (elements.length > 0) this.options.ea.selectElementsInView(elements);
      this.options.api.updateScene({
        appState: {
          selectedGroupIds: Object.fromEntries(step.targets
            .filter((target) => target.type === "group")
            .map((target) => [target.id, true])),
        },
        captureUpdate: "NEVER",
        forceFlushSync: true,
      });
      const state = this.options.api.getAppState();
      this.lastSelectionTargets = captureAnimationTargets(
        this.getSlideScope(), this.options.ea.getViewElements(),
        state.selectedElementIds, state.selectedGroupIds,
      ).targets;
    } finally {
      this.selectingStep = false;
    }
    this.render();
  }

  private async saveCurrentStep(): Promise<void> {
    if (this.saving || this.targets.length === 0 || !this.isCurrentDrawing()) return;
    this.saving = true;
    this.render();
    try {
      const selectedId = this.selectedStepId;
      const steps = this.steps.map((step) => structuredClone(step));
      const step = this.buildFormStep(selectedId ?? uniqueStepId(steps));
      this.rememberFormDefaults();
      if (selectedId) {
        const index = steps.findIndex((candidate) => candidate.id === selectedId);
        if (index >= 0) steps[index] = step;
        else steps.push(step);
      } else {
        steps.push(step);
      }
      await this.saveAnimationSteps(steps);
      if (!this.isCurrentDrawing()) return;
      this.steps = steps;
      if (!selectedId && this.selectedStepId === null && sameTargets(this.targets, step.targets)) {
        this.startNewStep();
      }
      this.options.onSaved(this.steps);
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
      this.startNewStep();
    }
    this.render();
  }

  private async persistSteps(steps: AnimationStep[]): Promise<void> {
    if (!this.isCurrentDrawing()) return;
    this.saving = true;
    try {
      await this.saveAnimationSteps(steps);
      if (!this.isCurrentDrawing()) return;
      this.steps = steps;
      this.options.onSaved(this.steps);
    } catch (error) {
      console.error("Slideshow animation sequence save failed", error);
      new Notice(this.options.t("animationSaveFailed"));
    } finally {
      this.saving = false;
      this.render();
    }
  }

  private async previewCurrentStep(): Promise<void> {
    if (this.targets.length === 0 || !this.isCurrentDrawing()) return;
    await this.previewRuntime.previewStep(
      this.getSlideScope(),
      this.buildFormStep(this.selectedStepId ?? "preview"),
    );
  }

  private saveAnimationSteps(steps: readonly AnimationStep[]): Promise<void> {
    if (!this.isCurrentDrawing()) return Promise.resolve();
    const { slide, ea } = this.options;
    return slide.kind === "frame"
      ? saveFrameAnimationSteps(ea, slide.frameId, steps)
      : saveLineAnimationSteps(ea, slide.pathId, slide.id, steps);
  }

  private buildFormStep(id: string): AnimationStep {
    const step: AnimationStep = {
      id,
      targets: this.targets.map((target) => structuredClone(target)),
      effect: this.effect,
      trigger: this.trigger,
    };
    if (this.trigger === "after-delay") step.delayMs = this.delayMs;
    if (!isInstantAnimationEffect(this.effect)) step.durationMs = this.durationMs;
    if (this.effect === "slide" || this.effect === "slide-out") step.direction = this.direction;
    return step;
  }

  private startNewStep(): void {
    this.selectedStepId = null;
    Object.assign(this, this.newStepDefaults);
  }

  private getSlideScope(): AnimationSlideScope {
    const appState = this.options.api.getAppState();
    return getAnimationSlideScope(this.options.slide, this.options.config, {
      width: appState.width,
      height: appState.height,
    });
  }

  private isCurrentDrawing(): boolean {
    return this.options.hostView.file === this.drawingFile;
  }

  /** Remembers explicit form choices independently of saved-step selection. */
  private rememberFormDefaults(): void {
    this.newStepDefaults = {
      effect: this.effect,
      trigger: this.trigger,
      delayMs: this.delayMs,
      durationMs: this.durationMs,
      direction: this.direction,
    };
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
      case "disappear":
        return t("animationEffectDisappear");
      case "fade-out":
        return t("animationEffectFadeOut");
      case "slide-out":
        return t("animationEffectSlideOut");
      case "zoom-out":
        return t("animationEffectZoomOut");
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
    button.setAttribute("aria-label", label);
    button.addEventListener("click", callback);
    return button;
  }

  /** Renders accessible effect/direction buttons using the same form state as timing controls. */
  private createChoices<T extends AnimationIconChoice>(
    doc: Document,
    labelText: string,
    choices: readonly (readonly [T, string])[],
    value: T,
    onChange: (value: T) => void,
  ): HTMLElement {
    const section = doc.createElement("div");
    section.className = "slideshow-animation-editor__choices-section";
    const heading = doc.createElement("span");
    heading.textContent = labelText;
    const buttons = doc.createElement("div");
    buttons.className = "slideshow-animation-editor__choices";
    buttons.setAttribute("role", "group");
    buttons.setAttribute("aria-label", labelText);
    for (const [choice, label] of choices) {
      const button = doc.createElement("button");
      button.type = "button";
      const icon = doc.createElement("span");
      icon.className = "slideshow-animation-editor__choice-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = getAnimationEditorIcon(this.options.ea, choice, isExitAnimationEffect(this.effect));
      const text = doc.createElement("span");
      text.textContent = label;
      button.append(icon, text);
      button.setAttribute("aria-pressed", String(choice === value));
      button.addEventListener("click", () => onChange(choice));
      buttons.appendChild(button);
    }
    section.append(heading, buttons);
    return section;
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
