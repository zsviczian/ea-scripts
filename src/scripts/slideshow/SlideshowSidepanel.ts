/**
 * @file SlideshowSidepanel.ts
 * @overview Drawing-aware sidepanel lifecycle, deck refresh, sorter actions, and notes persistence.
 */

/* eslint-disable complexity, max-lines-per-function -- Sidepanel rendering keeps lifecycle state and controls together. */

import type { EventRef, WorkspaceLeaf } from "obsidian";

import { getNavigationRect } from "../../sharedUtils/presentationGeometry";
import type { SlideDeckSlide } from "./SlideDeck";
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
} from "./slideDeckMutations";
import { SLIDESHOW_SIDEPANEL_STYLES } from "./styles";
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
  startPresentation(presentationType: PresentationPathType): Promise<void>;
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

function getExcalidrawViewFromLeaf(leaf: WorkspaceLeaf | null): ScriptExcalidrawView | null {
  if (!leaf) return null;
  const candidate = leaf.view as unknown as Partial<ScriptExcalidrawView>;
  if (
    typeof candidate.isDirty !== "function" ||
    typeof candidate.forceSave !== "function" ||
    typeof candidate.preventAutozoom !== "function" ||
    typeof candidate.refreshCanvasOffset !== "function" ||
    !candidate.file ||
    !candidate.contentEl
  ) {
    return null;
  }
  return candidate as ScriptExcalidrawView;
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

  public constructor(private readonly options: SlideshowSidepanelOptions) {
    this.ownerWindow = options.tab.contentEl.ownerDocument.defaultView ?? window;
  }

  /** Installs lifecycle hooks, workspace focus tracking, and scene-change tracking. */
  public initialize(): void {
    const { ea, tab } = this.options;
    tab.onOpen = () => void this.refresh(true);
    tab.onFocus = (view) => this.bindView(view);
    tab.onWindowMigrated = (win) => {
      this.ownerWindow = win;
      this.sorter?.onWindowMigrated(win);
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
      this.previewService?.clear();
      this.previewService = null;
      ea.onSceneChangeHook = null;
      if (this.activeLeafChangeRef) {
        app.workspace.offref(this.activeLeafChangeRef);
        this.activeLeafChangeRef = null;
      }
    };
    this.activeLeafChangeRef = app.workspace.on("active-leaf-change", (leaf: WorkspaceLeaf | null) => {
      if (this.closed || leaf === ea.getSidepanelLeaf()) return;
      this.bindView(getExcalidrawViewFromLeaf(leaf));
    });
    ea.onSceneChangeHook = {
      appStateKeys: ["selectedElementIds", "viewBackgroundColor", "theme"],
      trackElements: true,
      triggerWhenInvisible: false,
      callback: (_elements, _appState, _files, view) => {
        if (view && view !== ea.targetView) {
          this.bindView(view);
          return;
        }
        this.scheduleRefresh();
      },
    };
    if (ea.targetView) void this.refresh(true);
    else this.renderUnavailable();
  }

  private bindView(view: ScriptExcalidrawView | null): void {
    if (this.closed) return;
    if (view === this.options.ea.targetView) {
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
    this.previewService?.clear();
    this.previewService = null;
    this.resolved = null;
    this.choices = { frame: null, line: null, defaultType: null };
    this.presentationType = null;
    this.lastFingerprint = "";
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
    const empty = tab.contentEl.ownerDocument.createElement("div");
    empty.className = "slideshow-empty";
    empty.textContent = t("noEligibleSlides");
    root.appendChild(empty);
  }

  /** Refreshes deck data and previews only when the debounced scene fingerprint changes. */
  public async refresh(force = false): Promise<void> {
    const { ea } = this.options;
    if (this.closed || !ea.targetView) {
      this.renderUnavailable();
      return;
    }
    const api = ea.getExcalidrawAPI();
    if (!api) {
      this.renderUnavailable();
      return;
    }
    const choices = resolveSlideDeckChoices(ea);
    const drawingKey = ea.targetView.file.path;
    const storedType = this.presentationTypeByDrawing.get(drawingKey);
    const presentationType = storedType && choices[storedType] ? storedType : choices.defaultType;
    if (presentationType) this.presentationTypeByDrawing.set(drawingKey, presentationType);
    const resolved = presentationType ? choices[presentationType] : null;
    const appState = api.getAppState();
    const compositeFingerprint = `${presentationType ?? "none"}|${getDeckFingerprint(choices.frame)}|${getDeckFingerprint(choices.line)}|${appState.theme}|${appState.viewBackgroundColor}|${getSceneVisualFingerprint(ea.getViewElements())}`;
    if (!force && compositeFingerprint === this.lastFingerprint) return;

    const selectedId = this.sorter?.getSelectedSlideId() ?? null;
    const expandedNotesId = this.sorter?.getExpandedNotesSlideId() ?? null;
    this.sorter?.destroy();
    this.sorter = null;
    this.choices = choices;
    this.presentationType = presentationType;
    this.resolved = resolved;
    this.lastFingerprint = compositeFingerprint;
    this.pendingRefresh = false;
    this.previewService ??= new SlidePreviewService(ea, api, this.options.config.maxZoom);
    this.render(selectedId, expandedNotesId);
  }

  private render(preferredSlideId: string | null, preferredNotesSlideId: string | null): void {
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
    const header = doc.createElement("div");
    header.className = "slideshow-sidepanel__header";
    root.appendChild(header);

    const startButton = doc.createElement("button");
    startButton.type = "button";
    header.appendChild(startButton);
    startButton.innerHTML = `${icons.play}<span>${t("startPresentation")}</span>`;
    const noVisibleFrames =
      this.resolved?.deck.kind === "frame" && this.resolved.deck.visibleSlides.length === 0;
    startButton.disabled = !this.resolved || noVisibleFrames;
    if (noVisibleFrames) startButton.title = t("allFramesExcluded");
    startButton.addEventListener("click", () => {
      void (async () => {
        await this.sorter?.flushNotes();
        if (this.presentationType) {
          await this.options.startPresentation(this.presentationType);
        }
      })();
    });

    const refreshButton = doc.createElement("button");
    refreshButton.type = "button";
    refreshButton.setAttribute("aria-label", t("refreshSlides"));
    refreshButton.title = t("refreshSlides");
    header.appendChild(refreshButton);
    refreshButton.innerHTML = icons.refresh;
    refreshButton.addEventListener("click", () => {
      void (async () => {
        await this.sorter?.flushNotes();
        this.previewService?.clear();
        this.lastFingerprint = "";
        await this.refresh(true);
      })();
    });

    if (!this.resolved || !this.previewService) {
      const empty = doc.createElement("div");
      empty.className = "slideshow-empty";
      empty.textContent = t("noEligibleSlides");
      root.appendChild(empty);
      return;
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
        : `${t("lineDeck")} · ${t("slideCount", { count: deck.slides.length })}`;

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
      callbacks: {
        move: (fromIndex, toIndex) => this.moveSlide(fromIndex, toIndex),
        toggleInclusion: (slide, excluded) => this.toggleInclusion(slide, excluded),
        zoomToSlide: (slide) => this.zoomToSlide(slide),
        saveNotes: (slide, notes) => this.saveNotes(slide, notes),
        requestAnimationEditor: (slide) => this.requestAnimationEditor(slide),
        editLineSlide: (slide, index) => this.editLineSlide(slide, index),
        notesBlurred: () => {
          if (this.pendingRefresh) this.scheduleRefresh();
        },
      },
    });
    this.sorter.render(preferredSlideId, preferredNotesSlideId);
  }

  private async selectPresentationType(presentationType: PresentationPathType): Promise<void> {
    if (!this.choices[presentationType] || presentationType === this.presentationType) return;
    await this.sorter?.flushNotes();
    const view = this.options.ea.targetView;
    if (!view) return;
    this.presentationTypeByDrawing.set(view.file.path, presentationType);
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
    if (slide.kind !== "frame") return;
    try {
      await this.sorter?.flushNotes();
      await setFrameExcluded(this.options.ea, slide.frameId, excluded);
      this.lastFingerprint = "";
      await this.refresh(true);
    } catch (error) {
      console.error("Slideshow inclusion update failed", error);
      new Notice(this.options.t("metadataSaveFailed"));
    }
  }

  private async saveNotes(slide: SlideDeckSlide, notes: string): Promise<void> {
    try {
      if (slide.kind === "frame") {
        await saveFrameNotes(this.options.ea, slide.frameId, notes);
      } else {
        await saveLineNotes(this.options.ea, slide.pathId, slide.id, notes);
      }
      this.lastFingerprint = "";
      if (!this.sorter?.isEditingNotes() && this.pendingRefresh) this.scheduleRefresh();
    } catch (error) {
      console.error("Slideshow notes update failed", error);
      new Notice(this.options.t("metadataSaveFailed"));
    }
  }

  private zoomToSlide(slide: SlideDeckSlide): void {
    const api = this.options.ea.getExcalidrawAPI();
    const view = this.options.ea.targetView;
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
    const view = ea.targetView;
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
      api.startLineEditor(ea.getViewSelectedElement(), [index * 2, index * 2 + 1]);
      this.lastFingerprint = "";
    } catch (error) {
      console.error("Slideshow line-slide editing failed", error);
      new Notice(this.options.t("editLineSlideFailed"));
    }
  }

  private requestAnimationEditor(slide: SlideDeckSlide): void {
    new Notice(
      slide.kind === "frame"
        ? this.options.t("animationCheckpoint3")
        : this.options.t("lineAnimationUnsupported"),
    );
  }
}
