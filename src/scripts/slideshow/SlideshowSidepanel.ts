/**
 * @file SlideshowSidepanel.ts
 * @overview Drawing-aware sidepanel lifecycle, deck refresh, sorter actions, and notes persistence.
 */

/* eslint-disable complexity, max-lines-per-function -- Sidepanel rendering keeps lifecycle state and controls together. */

import type { EventRef, WorkspaceLeaf } from "obsidian";

import { getNavigationRect } from "../../sharedUtils/presentationGeometry";
import { AnimationEditor } from "./AnimationEditor";
import { getVisibleSlideIndex, type FrameDeckSlide, type SlideDeckSlide } from "./SlideDeck";
import { SlidePreviewService, getSceneVisualFingerprint } from "./SlidePreviewService";
import { SlideSorter } from "./SlideSorter";
import type { SlideshowTranslator } from "./lang";
import {
  isPresentationPathHidden,
  resolveSlideDeckChoices,
  type SlideDeckChoices,
} from "./presentationPath";
import {
  hasBoundLineEndpoint,
  reorderFrameSlides,
  reorderLineSlides,
  saveFrameNotes,
  saveLineNotes,
  setFrameExcluded,
  setLinePresentationPathHidden,
  setLineSlideExcluded,
} from "./slideDeckMutations";
import { openSlideshowSettingsModal } from "./slideshowSettings";
import { SLIDESHOW_SIDEPANEL_STYLES } from "./styles";
import { getSlideshowProgress, getSlideshowProgressType } from "./slideshowRuntime";
import {
  isLinearPathElement,
  type PresentationPathType,
  type ResolvedSlideDeck,
  type SlideshowConfig,
  type SlideshowIcons,
} from "./types";

export interface SlideshowSidepanelOptions {
  ea: ExcalidrawAutomate;
  tab: ScriptSidepanelTab;
  t: SlideshowTranslator;
  icons: SlideshowIcons;
  config: SlideshowConfig;
  startPresentation(
    presentationType: PresentationPathType,
    initialSlide?: number,
  ): Promise<void>;
  printPresentation(presentationType: PresentationPathType, event: MouseEvent): Promise<void>;
  onClosed(): void;
}

function getDeckFingerprint(resolved: ResolvedSlideDeck | null): string {
  if (!resolved) return "none";
  return JSON.stringify({
    kind: resolved.deck.kind,
    pathId: resolved.pathElement?.id ?? null,
    slides: resolved.deck.slides.map((slide) => ({
      id: slide.id,
      title: slide.title,
      rect: slide.rect,
      notes: slide.notes ?? null,
      excluded: slide.excluded,
      animationCount: slide.kind === "frame" ? slide.animationSteps.length : 0,
    })),
  });
}

/** Chooses the sorter deck, giving an explicitly selected line priority over remembered UI state. */
export function chooseSidepanelPresentationType(
  choices: SlideDeckChoices,
  storedType: PresentationPathType | undefined,
  selectedElement: ExcalidrawElement | null,
): PresentationPathType | null {
  if (isLinearPathElement(selectedElement) && choices.line) return "line";
  return storedType && choices[storedType] ? storedType : choices.defaultType;
}

/** Clears selected line intent when the user explicitly switches to the frame deck. */
export function clearLineSelectionForDeckSwitch(
  presentationType: PresentationPathType,
  selectedElement: ExcalidrawElement | null,
  api: ExcalidrawAPI,
): void {
  if (presentationType === "frame" && isLinearPathElement(selectedElement)) {
    api.selectElements([]);
  }
}

interface SorterSceneSelection {
  selectedElementIds: Readonly<Record<string, true>>;
  selectedLinearElement: {
    elementId: string;
    selectedPointsIndices: readonly number[] | null;
    isEditing: boolean;
  } | null;
}

/** Resolves a canvas selection to one sorter slide, or null when it is ambiguous. */
export function getSceneSelectedSlideId(
  resolved: ResolvedSlideDeck | null,
  appState: SorterSceneSelection,
): string | null {
  if (!resolved) return null;
  if (resolved.deck.kind === "frame") {
    const selectedSlides = resolved.deck.slides.filter(
      (slide) => slide.kind === "frame" && appState.selectedElementIds[slide.frameId],
    );
    return selectedSlides.length === 1 ? (selectedSlides[0]?.id ?? null) : null;
  }

  const editor = appState.selectedLinearElement;
  if (!editor?.isEditing || editor.elementId !== resolved.pathElement?.id) return null;
  const pointIndices = editor.selectedPointsIndices;
  if (!pointIndices || pointIndices.length === 0) return null;
  const pairIndices = new Set(pointIndices.map((pointIndex) => Math.floor(pointIndex / 2)));
  if (pairIndices.size !== 1) return null;
  const pairIndex = pairIndices.values().next().value as number | undefined;
  return pairIndex === undefined ? null : (resolved.deck.slides[pairIndex]?.id ?? null);
}

/** Resolves saved progress for the active deck, clamping it after deck edits. */
export function getResumeSlideForPresentation(
  progress: number | undefined,
  progressType: PresentationPathType | undefined,
  presentationType: PresentationPathType | null,
  visibleSlideCount: number,
): number | null {
  if (progress === undefined || presentationType === null || visibleSlideCount <= 0) return null;
  if (progressType && progressType !== presentationType) return null;
  return Math.min(Math.max(progress, 0), visibleSlideCount - 1);
}

/** Manages one non-persistent slideshow sidepanel across Excalidraw view focus changes. */
export class SlideshowSidepanel {
  private sorter: SlideSorter | null = null;
  private previewService: SlidePreviewService | null = null;
  private resolved: ResolvedSlideDeck | null = null;
  private choices: SlideDeckChoices = { frame: null, line: null, defaultType: null };
  private presentationType: PresentationPathType | null = null;
  private readonly presentationTypeByDrawing = new Map<string, PresentationPathType>();
  private refreshTimer = 0;
  private ownerWindow: Window;
  private lastFingerprint = "";
  private pendingRefresh = false;
  private closed = false;
  private bindGeneration = 0;
  private activeLeafChangeRef: EventRef | null = null;
  private boundView: ScriptExcalidrawView | null;
  private requestedSlideId: string | null = null;
  private animationEditor: AnimationEditor | null = null;
  private animationEditingSlideId: string | null = null;

  public constructor(private readonly options: SlideshowSidepanelOptions) {
    this.ownerWindow = options.tab.contentEl.ownerDocument.defaultView ?? window;
    this.boundView = null;
  }

  /** Returns the drawing currently edited by this sidepanel. */
  public getBoundView(): ScriptExcalidrawView | null {
    return this.boundView;
  }

  /** Focuses and reveals the slide requested by an element action after the tab is visible. */
  public revealRequestedSlide(): void {
    const slideId = this.requestedSlideId;
    if (!slideId) return;
    this.sorter?.scrollToSlide(slideId);
    this.ownerWindow.setTimeout(() => {
      if (this.requestedSlideId === slideId) this.requestedSlideId = null;
    }, 500);
  }

  /** Rebinds the panel to a concrete view and optionally selects its deck type. */
  public async activate(
    view: ScriptExcalidrawView,
    preferredType?: PresentationPathType,
    preferredSlideId?: string,
  ): Promise<void> {
    if (preferredType) this.presentationTypeByDrawing.set(view.file.path, preferredType);
    if (preferredSlideId) this.requestedSlideId = preferredSlideId;
    if (view === this.boundView) {
      this.options.ea.setView(view);
      this.lastFingerprint = "";
      await this.refresh(true);
      return;
    }
    const generation = ++this.bindGeneration;
    await this.applyViewBinding(view, generation);
  }

  /** Installs lifecycle hooks, workspace focus tracking, and scene-change tracking. */
  public initialize(): void {
    const { ea, tab } = this.options;
    tab.onOpen = () => void this.refresh(true);
    tab.onFocus = (view) => this.bindView(view);
    tab.onWindowMigrated = (win) => {
      this.ownerWindow = win;
      this.sorter?.onWindowMigrated(win);
      void this.animationEditor?.destroy();
      this.animationEditor = null;
      this.animationEditingSlideId = null;
      this.previewService?.clear();
      this.lastFingerprint = "";
      void this.refresh(true);
    };
    tab.onExcalidrawViewClosed = () => this.bindView(null);
    tab.onClose = () => {
      this.closed = true;
      if (this.refreshTimer) this.ownerWindow.clearTimeout(this.refreshTimer);
      this.refreshTimer = 0;
      const sorter = this.sorter;
      this.sorter = null;
      void sorter?.flushNotes().finally(() => sorter.destroy());
      void this.animationEditor?.destroy();
      this.animationEditor = null;
      this.animationEditingSlideId = null;
      this.previewService?.clear();
      this.previewService = null;
      ea.onSceneChangeHook = null;
      if (this.activeLeafChangeRef) {
        app.workspace.offref(this.activeLeafChangeRef);
        this.activeLeafChangeRef = null;
      }
      this.options.onClosed();
    };
    this.activeLeafChangeRef = app.workspace.on(
      "active-leaf-change",
      (leaf: WorkspaceLeaf | null) => {
        if (this.closed || leaf === ea.getSidepanelLeaf()) return;
        this.bindView(
          leaf && ea.isExcalidrawView(leaf.view)
            ? (leaf.view as unknown as ScriptExcalidrawView)
            : null,
        );
      },
    );
    ea.onSceneChangeHook = {
      appStateKeys: [
        "selectedElementIds",
        "selectedGroupIds",
        "selectedLinearElement",
        "viewBackgroundColor",
        "theme",
      ],
      trackElements: true,
      triggerWhenInvisible: false,
      callback: (elements, appState, _files, view) => {
        if (!this.boundView || view !== this.boundView) return;
        if (this.animationEditor) {
          this.animationEditor.handleSceneChange(elements, appState);
          return;
        }
        const selectedSlideId = getSceneSelectedSlideId(this.resolved, appState);
        if (selectedSlideId) void this.sorter?.selectFromScene(selectedSlideId);
        this.scheduleRefresh();
      },
    };
    if (this.boundView) void this.refresh(true);
    else this.renderUnavailable();
  }

  private bindView(view: ScriptExcalidrawView | null): void {
    if (this.closed) return;
    if (view === this.boundView) {
      if (view) void this.refresh();
      else this.renderUnavailable();
      return;
    }
    const generation = ++this.bindGeneration;
    void this.applyViewBinding(view, generation);
  }

  private async applyViewBinding(
    view: ScriptExcalidrawView | null,
    generation: number,
  ): Promise<void> {
    const previousSorter = this.sorter;
    await previousSorter?.flushNotes();
    if (this.closed || generation !== this.bindGeneration) return;
    previousSorter?.destroy();
    if (this.sorter === previousSorter) this.sorter = null;
    await this.animationEditor?.destroy();
    this.animationEditor = null;
    this.animationEditingSlideId = null;
    this.previewService?.clear();
    this.previewService = null;
    this.resolved = null;
    this.choices = { frame: null, line: null, defaultType: null };
    this.presentationType = null;
    this.lastFingerprint = "";
    this.boundView = view;
    this.options.ea.setView(view);
    this.options.ea.clear();
    if (!view) {
      this.renderUnavailable();
      return;
    }
    await this.refresh(true);
  }

  private scheduleRefresh(): void {
    if (this.closed) return;
    if (this.sorter?.isEditingNotes()) {
      this.pendingRefresh = true;
      return;
    }
    if (this.refreshTimer) this.ownerWindow.clearTimeout(this.refreshTimer);
    this.refreshTimer = this.ownerWindow.setTimeout(() => {
      this.refreshTimer = 0;
      void this.refresh();
    }, 180);
  }

  private appendSupportLine(root: HTMLElement, doc: Document): void {
    const support = doc.createElement("div");
    support.className = "slideshow-sidepanel__support";
    const prefix = doc.createElement("span");
    prefix.textContent = `${this.options.t("supportPrompt")} `;
    support.appendChild(prefix);
    const link = doc.createElement("a");
    link.href = "https://ko-fi.com/zsolt";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = this.options.t("supportLink");
    support.appendChild(link);
    root.appendChild(support);
  }

  private appendSettingsButton(header: HTMLElement, doc: Document): void {
    const { ea, icons, t } = this.options;
    const settingsButton = doc.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "slideshow-sidepanel__icon-button";
    settingsButton.setAttribute("aria-label", t("settingsTitle"));
    settingsButton.title = t("settingsTitle");
    settingsButton.innerHTML = icons.settings;
    settingsButton.addEventListener("click", () => {
      void (async () => {
        await this.sorter?.flushNotes();
        openSlideshowSettingsModal(ea, this.options.config, t, () => {
          this.previewService?.clear();
          this.lastFingerprint = "";
          void this.refresh(true);
        });
      })();
    });
    header.appendChild(settingsButton);
  }

  private renderUnavailable(): void {
    const { tab, t } = this.options;
    tab.setDisabled(false);
    tab.contentEl.replaceChildren();
    const style = tab.contentEl.ownerDocument.createElement("style");
    style.textContent = SLIDESHOW_SIDEPANEL_STYLES;
    tab.contentEl.appendChild(style);
    const root = tab.contentEl.ownerDocument.createElement("div");
    root.className = "slideshow-sidepanel";
    tab.contentEl.appendChild(root);
    const doc = tab.contentEl.ownerDocument;
    this.appendSupportLine(root, doc);
    const header = doc.createElement("div");
    header.className = "slideshow-sidepanel__header";
    root.appendChild(header);
    this.appendSettingsButton(header, doc);
    const empty = tab.contentEl.ownerDocument.createElement("div");
    empty.className = "slideshow-empty";
    empty.textContent = t("noEligibleSlides");
    root.appendChild(empty);
  }

  /** Refreshes deck data and previews only when the debounced scene fingerprint changes. */
  public async refresh(force = false): Promise<void> {
    const { ea } = this.options;
    const view = this.boundView;
    if (this.closed || !view) {
      this.renderUnavailable();
      return;
    }
    if (ea.targetView !== view) ea.setView(view);
    const api = ea.getExcalidrawAPI();
    if (!api) {
      this.renderUnavailable();
      return;
    }
    const choices = resolveSlideDeckChoices(ea);
    const drawingKey = view.file.path;
    const storedType = this.presentationTypeByDrawing.get(drawingKey);
    const selectedElement = ea.getViewSelectedElement();
    const presentationType = chooseSidepanelPresentationType(choices, storedType, selectedElement);
    if (presentationType) this.presentationTypeByDrawing.set(drawingKey, presentationType);
    const resolved = presentationType ? choices[presentationType] : null;
    const appState = api.getAppState();
    const compositeFingerprint = `${presentationType ?? "none"}|${getDeckFingerprint(choices.frame)}|${getDeckFingerprint(choices.line)}|${appState.theme}|${appState.viewBackgroundColor}|${getSceneVisualFingerprint(ea.getViewElements())}`;
    if (!force && compositeFingerprint === this.lastFingerprint) return;

    const requestedSlideId = this.requestedSlideId;
    const sceneSelectedSlideId = getSceneSelectedSlideId(resolved, appState);
    const selectedId =
      requestedSlideId ?? sceneSelectedSlideId ?? this.sorter?.getSelectedSlideId() ?? null;
    const expandedNotesId = this.sorter?.getExpandedNotesSlideId() ?? null;
    this.sorter?.destroy();
    this.sorter = null;
    this.choices = choices;
    this.presentationType = presentationType;
    this.resolved = resolved;
    this.lastFingerprint = compositeFingerprint;
    this.pendingRefresh = false;
    this.previewService ??= new SlidePreviewService(ea, api, this.options.config);
    const renderedSorter = this.render(selectedId, expandedNotesId);
    if (requestedSlideId) {
      renderedSorter?.scrollToSlide(requestedSlideId);
    }
  }

  private render(
    preferredSlideId: string | null,
    preferredNotesSlideId: string | null,
  ): SlideSorter | null {
    const { tab, t, icons, ea } = this.options;
    tab.setDisabled(false);
    tab.contentEl.replaceChildren();
    const style = tab.contentEl.ownerDocument.createElement("style");
    style.textContent = SLIDESHOW_SIDEPANEL_STYLES;
    tab.contentEl.appendChild(style);
    const doc = tab.contentEl.ownerDocument;
    const root = doc.createElement("div");
    root.className = "slideshow-sidepanel";
    tab.contentEl.appendChild(root);
    this.appendSupportLine(root, doc);
    const header = doc.createElement("div");
    header.className = "slideshow-sidepanel__header";
    root.appendChild(header);

    const noVisibleSlides = Boolean(this.resolved && this.resolved.deck.visibleSlides.length === 0);
    const startButton = doc.createElement("button");
    startButton.type = "button";
    startButton.className = "slideshow-sidepanel__icon-button";
    startButton.setAttribute("aria-label", t("startPresentation"));
    startButton.title = noVisibleSlides ? t("allSlidesExcluded") : t("startPresentation");
    startButton.innerHTML = icons.play;
    startButton.disabled = !this.resolved || noVisibleSlides;
    header.appendChild(startButton);
    startButton.addEventListener("click", () => {
      void this.startPresentation();
    });

    const resumeSlide =
      this.boundView && this.resolved
        ? getResumeSlideForPresentation(
            getSlideshowProgress(this.boundView),
            getSlideshowProgressType(this.boundView),
            this.presentationType,
            this.resolved.deck.visibleSlides.length,
          )
        : null;
    if (resumeSlide !== null) {
      const continueButton = doc.createElement("button");
      continueButton.type = "button";
      continueButton.className = "slideshow-sidepanel__icon-button";
      continueButton.setAttribute("aria-label", t("continuePresentation"));
      continueButton.title = t("continuePresentation");
      continueButton.innerHTML = icons.continuePresentation;
      continueButton.addEventListener("click", () => {
        void this.startPresentation(resumeSlide);
      });
      header.appendChild(continueButton);
    }

    const startSelectedButton = doc.createElement("button");
    startSelectedButton.type = "button";
    startSelectedButton.className = "slideshow-sidepanel__icon-button";
    startSelectedButton.setAttribute("aria-label", t("startFromSelectedSlide"));
    startSelectedButton.title = t("startFromSelectedSlide");
    startSelectedButton.innerHTML = icons.presentation;
    startSelectedButton.disabled = !this.resolved || noVisibleSlides;
    header.appendChild(startSelectedButton);
    startSelectedButton.addEventListener("click", () => {
      const selectedId = this.sorter?.getSelectedSlideId() ?? null;
      const initialSlide = this.resolved
        ? getVisibleSlideIndex(this.resolved.deck, selectedId)
        : null;
      if (initialSlide === null) {
        new Notice(t("selectedSlideNotPresentable"));
        return;
      }
      void this.startPresentation(initialSlide);
    });

    const printButton = doc.createElement("button");
    printButton.type = "button";
    printButton.className = "slideshow-sidepanel__icon-button";
    const printLabel = t("printPdf", {
      width: this.options.config.printSlideWidth,
      height: this.options.config.printSlideHeight,
    });
    printButton.setAttribute("aria-label", printLabel);
    printButton.title = printLabel;
    printButton.innerHTML = icons.printer;
    printButton.disabled = !this.resolved || noVisibleSlides;
    header.appendChild(printButton);
    printButton.addEventListener("click", (event) => {
      void this.printPresentation(event);
    });

    const refreshButton = doc.createElement("button");
    refreshButton.type = "button";
    refreshButton.className = "slideshow-sidepanel__icon-button";
    refreshButton.setAttribute("aria-label", t("refreshSlides"));
    refreshButton.title = t("refreshSlides");
    header.appendChild(refreshButton);
    refreshButton.innerHTML = icons.refresh;
    refreshButton.addEventListener("click", () => {
      void (async () => {
        await this.sorter?.flushNotes();
        await this.animationEditor?.destroy();
        this.animationEditor = null;
        this.animationEditingSlideId = null;
        this.previewService?.clear();
        this.lastFingerprint = "";
        await this.refresh(true);
      })();
    });

    this.appendSettingsButton(header, doc);

    if (!this.resolved || !this.previewService) {
      const empty = doc.createElement("div");
      empty.className = "slideshow-empty";
      empty.textContent = t("noEligibleSlides");
      root.appendChild(empty);
      return null;
    }

    if (this.choices.frame && this.choices.line) {
      const deckPicker = doc.createElement("div");
      deckPicker.className = "slideshow-sidepanel__deck-picker";
      root.appendChild(deckPicker);
      const label = doc.createElement("label");
      label.textContent = t("presentationType");
      deckPicker.appendChild(label);
      const select = doc.createElement("select");
      select.setAttribute("aria-label", t("presentationType"));
      select.title = t("presentationTypeHint");
      const frameOption = doc.createElement("option");
      frameOption.value = "frame";
      frameOption.textContent = t("frameDeck");
      select.appendChild(frameOption);
      const lineOption = doc.createElement("option");
      lineOption.value = "line";
      lineOption.textContent = t("lineDeck");
      select.appendChild(lineOption);
      select.value = this.presentationType ?? this.choices.defaultType ?? "frame";
      select.addEventListener("change", () => {
        const nextType = select.value === "line" ? "line" : "frame";
        void this.selectPresentationType(nextType);
      });
      deckPicker.appendChild(select);
    }

    const deck = this.resolved.deck;
    const summary = doc.createElement("div");
    summary.className = "slideshow-sidepanel__summary";
    root.appendChild(summary);
    summary.textContent =
      deck.kind === "frame"
        ? `${t("frameDeck")} · ${t("visibleSlideCount", { visible: deck.visibleSlides.length, total: deck.slides.length })}`
        : `${t("lineDeck")} · ${t("visibleSlideCount", { visible: deck.visibleSlides.length, total: deck.slides.length })}`;

    if (
      deck.kind === "path" &&
      this.resolved.pathElement &&
      isPresentationPathHidden(this.resolved.pathElement)
    ) {
      const pathActions = doc.createElement("div");
      pathActions.className = "slideshow-sidepanel__path-actions";
      root.appendChild(pathActions);
      const showPathButton = doc.createElement("button");
      showPathButton.type = "button";
      showPathButton.innerHTML = `${icons.eye}<span>${t("showPresentationPath")}</span>`;
      showPathButton.setAttribute("aria-label", t("showPresentationPath"));
      showPathButton.title = t("showPresentationPath");
      showPathButton.addEventListener("click", () => void this.showPresentationPath());
      pathActions.appendChild(showPathButton);
    }

    const reorderEnabled =
      !this.resolved.pathElement || !hasBoundLineEndpoint(this.resolved.pathElement);
    if (!reorderEnabled) {
      const warning = doc.createElement("div");
      warning.className = "slideshow-warning";
      warning.textContent = t("lineReorderBound");
      root.appendChild(warning);
    }
    if (deck.kind === "path") {
      const warning = doc.createElement("div");
      warning.className = "slideshow-warning";
      warning.textContent = t("lineAnimationUnsupported");
      root.appendChild(warning);
    }
    const sorterContainer = doc.createElement("div");
    sorterContainer.className = "slideshow-sorter";
    sorterContainer.setAttribute("role", "list");
    root.appendChild(sorterContainer);
    this.sorter = new SlideSorter({
      ea,
      container: sorterContainer,
      deck,
      previewService: this.previewService,
      icons,
      t,
      reorderEnabled,
      animationEditingSlideId: this.animationEditingSlideId,
      callbacks: {
        move: (fromIndex, toIndex) => this.moveSlide(fromIndex, toIndex),
        toggleInclusion: (slide, excluded) => this.toggleInclusion(slide, excluded),
        zoomToSlide: (slide) => this.zoomToSlide(slide),
        saveNotes: (slide, notes) => this.saveNotes(slide, notes),
        requestAnimationEditor: (slide) => this.requestAnimationEditor(slide),
        mountAnimationEditor: (slide, container) => this.mountAnimationEditor(slide, container),
        editLineSlide: (slide, index) => this.editLineSlide(slide, index),
        notesBlurred: () => {
          if (this.pendingRefresh) this.scheduleRefresh();
        },
      },
    });
    this.sorter.render(preferredSlideId, preferredNotesSlideId);
    return this.sorter;
  }

  private async startPresentation(initialSlide?: number): Promise<void> {
    await this.sorter?.flushNotes();
    await this.animationEditor?.destroy();
    this.animationEditor = null;
    this.animationEditingSlideId = null;
    if (this.presentationType) {
      await this.options.startPresentation(this.presentationType, initialSlide);
    }
  }

  private async printPresentation(event: MouseEvent): Promise<void> {
    await this.sorter?.flushNotes();
    if (this.animationEditor) {
      await this.animationEditor.destroy();
      this.animationEditor = null;
      this.animationEditingSlideId = null;
      this.lastFingerprint = "";
      await this.refresh(true);
    }
    if (this.presentationType) {
      await this.options.printPresentation(this.presentationType, event);
    }
  }

  private async selectPresentationType(presentationType: PresentationPathType): Promise<void> {
    if (!this.choices[presentationType] || presentationType === this.presentationType) return;
    await this.sorter?.flushNotes();
    await this.animationEditor?.destroy();
    this.animationEditor = null;
    this.animationEditingSlideId = null;
    const view = this.boundView;
    if (!view) return;
    this.presentationTypeByDrawing.set(view.file.path, presentationType);
    const api = this.options.ea.getExcalidrawAPI();
    if (api) {
      clearLineSelectionForDeckSwitch(
        presentationType,
        this.options.ea.getViewSelectedElement(),
        api,
      );
    }
    this.lastFingerprint = "";
    await this.refresh(true);
  }

  private async showPresentationPath(): Promise<void> {
    const path = this.resolved?.pathElement;
    if (!path) return;
    try {
      await this.sorter?.flushNotes();
      await setLinePresentationPathHidden(this.options.ea, path.id, false);
      this.lastFingerprint = "";
      await this.refresh(true);
    } catch (error) {
      console.error("Slideshow presentation path visibility update failed", error);
      new Notice(this.options.t("metadataSaveFailed"));
    }
  }

  private async moveSlide(fromIndex: number, toIndex: number): Promise<void> {
    if (!this.resolved) return;
    try {
      await this.sorter?.flushNotes();
      if (this.resolved.deck.kind === "frame") {
        await reorderFrameSlides(this.options.ea, fromIndex, toIndex);
      } else if (this.resolved.pathElement) {
        await reorderLineSlides(this.options.ea, this.resolved.pathElement.id, fromIndex, toIndex);
      }
      this.lastFingerprint = "";
      await this.refresh(true);
    } catch (error) {
      if (error instanceof Error && error.message === "BOUND_PRESENTATION_PATH") {
        new Notice(this.options.t("lineReorderBound"));
      } else {
        console.error("Slideshow sorter reorder failed", error);
        new Notice(this.options.t("reorderFailed"));
      }
    }
  }

  private async toggleInclusion(slide: SlideDeckSlide, excluded: boolean): Promise<void> {
    try {
      await this.sorter?.flushNotes();
      if (slide.kind === "frame") {
        await setFrameExcluded(this.options.ea, slide.frameId, excluded);
      } else {
        await setLineSlideExcluded(this.options.ea, slide.pathId, slide.id, excluded);
      }
      this.lastFingerprint = "";
      await this.refresh(true);
    } catch (error) {
      console.error("Slideshow inclusion update failed", error);
      new Notice(this.options.t("metadataSaveFailed"));
    }
  }

  private async saveNotes(slide: SlideDeckSlide, notes: string): Promise<void> {
    try {
      const view = this.boundView;
      if (!view) throw new Error("The slideshow sidepanel is not bound to a drawing.");
      if (this.options.ea.targetView !== view) this.options.ea.setView(view);
      if (slide.kind === "frame") {
        await saveFrameNotes(this.options.ea, slide.frameId, notes);
      } else {
        await saveLineNotes(this.options.ea, slide.pathId, slide.id, notes);
      }
      await view.forceSave(true);
      this.lastFingerprint = "";
      if (!this.sorter?.isEditingNotes() && this.pendingRefresh) this.scheduleRefresh();
    } catch (error) {
      console.error("Slideshow notes update failed", error);
      new Notice(this.options.t("metadataSaveFailed"));
    }
  }

  private zoomToSlide(slide: SlideDeckSlide): void {
    const api = this.options.ea.getExcalidrawAPI();
    const view = this.boundView;
    if (!api || !view) return;
    view.preventAutozoom();
    const appState = api.getAppState();
    const rect = getNavigationRect(
      slide.rect,
      { width: appState.width, height: appState.height },
      this.options.config.maxZoom,
    );
    api.updateScene({
      appState: {
        scrollX: -rect.left,
        scrollY: -rect.top,
        zoom: { value: rect.nextZoom as typeof appState.zoom.value },
      },
    });
  }

  private async editLineSlide(slide: SlideDeckSlide, index: number): Promise<void> {
    if (slide.kind !== "path") return;
    const { ea } = this.options;
    const api = ea.getExcalidrawAPI();
    const view = this.boundView;
    if (!api || !view) return;
    try {
      await this.sorter?.flushNotes();
      const currentPath = ea.getViewElements().find((element) => element.id === slide.pathId);
      if (!isLinearPathElement(currentPath)) return;
      if (isPresentationPathHidden(currentPath)) {
        await setLinePresentationPathHidden(ea, currentPath.id, false);
      }
      const path = ea.getViewElements().find((element) => element.id === slide.pathId);
      if (!isLinearPathElement(path)) return;

      app.workspace.setActiveLeaf(view.leaf, { focus: true });
      view.preventAutozoom();
      ea.selectElementsInView([path]);
      const appState = api.getAppState();
      let rect = getNavigationRect(
        slide.rect,
        { width: appState.width, height: appState.height },
        this.options.config.maxZoom,
      );
      const offsetWidth = ((rect.right - rect.left) * (1 - this.options.config.editZoomOut)) / 2;
      const offsetHeight = ((rect.bottom - rect.top) * (1 - this.options.config.editZoomOut)) / 2;
      rect = {
        left: rect.left - offsetWidth,
        right: rect.right + offsetWidth,
        top: rect.top - offsetHeight,
        bottom: rect.bottom + offsetHeight,
        nextZoom: Math.max(rect.nextZoom * this.options.config.editZoomOut, 0.1),
      };
      api.updateScene({
        appState: {
          scrollX: -rect.left,
          scrollY: -rect.top,
          zoom: { value: rect.nextZoom as typeof appState.zoom.value },
        },
      });
      api.setActiveTool({ type: "selection" });
      api.startLineEditor(path, [index * 2, index * 2 + 1]);
      this.lastFingerprint = "";
    } catch (error) {
      console.error("Slideshow line-slide editing failed", error);
      new Notice(this.options.t("editLineSlideFailed"));
    }
  }

  private requestAnimationEditor(slide: SlideDeckSlide): void {
    if (slide.kind !== "frame") {
      new Notice(this.options.t("lineAnimationUnsupported"));
      return;
    }
    void (async () => {
      await this.sorter?.flushNotes();
      if (this.animationEditingSlideId === slide.id) {
        await this.closeAnimationEditor();
        return;
      }
      await this.animationEditor?.destroy();
      this.animationEditor = null;
      this.animationEditingSlideId = slide.id;
      const expandedNotesId = this.sorter?.getExpandedNotesSlideId() ?? null;
      this.sorter?.destroy();
      this.sorter = null;
      const sorter = this.render(slide.id, expandedNotesId);
      this.selectAndZoomAnimationFrame(slide);
      sorter?.scrollToSlide(slide.id, false);
    })();
  }

  private mountAnimationEditor(slide: FrameDeckSlide, container: HTMLElement): void {
    const api = this.options.ea.getExcalidrawAPI();
    const view = this.boundView;
    if (!api || !view || slide.id !== this.animationEditingSlideId) return;
    const previousEditor = this.animationEditor;
    this.animationEditor = null;
    void previousEditor?.destroy();
    this.animationEditor = new AnimationEditor({
      ea: this.options.ea,
      api,
      hostView: view,
      container,
      slide,
      icons: this.options.icons,
      t: this.options.t,
      onSaved: () => {
        this.lastFingerprint = "";
      },
    });
    this.animationEditor.render();
    this.animationEditor.handleSceneChange(this.options.ea.getViewElements(), api.getAppState());
  }

  private selectAndZoomAnimationFrame(slide: FrameDeckSlide): void {
    const view = this.boundView;
    if (!view) return;
    const frame = this.options.ea.getViewElements().find((element) => element.id === slide.frameId);
    if (!frame) return;
    this.options.ea.selectElementsInView([frame]);
    this.zoomToSlide(slide);
    app.workspace.setActiveLeaf(view.leaf, { focus: true });
  }

  private async closeAnimationEditor(): Promise<void> {
    await this.animationEditor?.destroy();
    this.animationEditor = null;
    const slideId = this.animationEditingSlideId;
    this.animationEditingSlideId = null;
    this.lastFingerprint = "";
    await this.refresh(true);
    if (slideId) this.sorter?.scrollToSlide(slideId);
  }
}
