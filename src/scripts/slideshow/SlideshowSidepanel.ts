/**
 * @file SlideshowSidepanel.ts
 * @overview Drawing-aware sidepanel lifecycle, deck refresh, sorter actions, and notes persistence.
 */

/* eslint-disable complexity, max-lines-per-function -- Sidepanel rendering keeps lifecycle state and controls together. */

import { getNavigationRect } from "../../sharedUtils/presentationGeometry";
import type { SlideDeckSlide } from "./SlideDeck";
import { SlidePreviewService, getSceneVisualFingerprint } from "./SlidePreviewService";
import { SlideSorter } from "./SlideSorter";
import type { SlideshowTranslator } from "./lang";
import { resolveSlideDeck } from "./presentationPath";
import {
  hasBoundLineEndpoint,
  reorderFrameSlides,
  reorderLineSlides,
  saveFrameNotes,
  saveLineNotes,
  setFrameExcluded,
} from "./slideDeckMutations";
import { SLIDESHOW_SIDEPANEL_STYLES } from "./styles";
import type { ResolvedSlideDeck, SlideshowConfig, SlideshowIcons } from "./types";

export interface SlideshowSidepanelOptions {
  ea: ExcalidrawAutomate;
  tab: ScriptSidepanelTab;
  t: SlideshowTranslator;
  icons: SlideshowIcons;
  config: SlideshowConfig;
  startPresentation(): Promise<void>;
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

/** Manages one non-persistent slideshow sidepanel across Excalidraw view focus changes. */
export class SlideshowSidepanel {
  private sorter: SlideSorter | null = null;
  private previewService: SlidePreviewService | null = null;
  private resolved: ResolvedSlideDeck | null = null;
  private refreshTimer = 0;
  private ownerWindow: Window;
  private lastFingerprint = "";
  private pendingRefresh = false;
  private closed = false;
  private bindGeneration = 0;

  public constructor(private readonly options: SlideshowSidepanelOptions) {
    this.ownerWindow = options.tab.contentEl.ownerDocument.defaultView ?? window;
  }

  /** Installs lifecycle hooks and scene-change tracking. */
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
      void this.sorter?.flushNotes();
      this.sorter?.destroy();
      this.sorter = null;
      this.previewService?.clear();
      this.previewService = null;
      ea.onSceneChangeHook = null;
    };
    ea.onSceneChangeHook = {
      appStateKeys: ["selectedElementIds"],
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
    tab.setDisabled(true);
    tab.contentEl.replaceChildren();
    const style = tab.contentEl.ownerDocument.createElement("style");
    style.textContent = SLIDESHOW_SIDEPANEL_STYLES;
    tab.contentEl.appendChild(style);
    const root = tab.contentEl.ownerDocument.createElement("div");
    root.className = "slideshow-sidepanel";
    tab.contentEl.appendChild(root);
    const empty = tab.contentEl.ownerDocument.createElement("div");
    empty.className = "slideshow-empty";
    empty.textContent = t("noActiveDrawing");
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
    const resolved = resolveSlideDeck(ea);
    const compositeFingerprint = `${getDeckFingerprint(resolved)}|${getSceneVisualFingerprint(ea.getViewElements())}`;
    if (!force && compositeFingerprint === this.lastFingerprint) return;

    const selectedId = this.sorter?.getSelectedSlideId() ?? null;
    this.sorter?.destroy();
    this.sorter = null;
    this.resolved = resolved;
    this.lastFingerprint = compositeFingerprint;
    this.pendingRefresh = false;
    this.previewService ??= new SlidePreviewService(ea, api, this.options.config.maxZoom);
    this.render(selectedId);
  }

  private render(preferredSlideId: string | null): void {
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
        await this.options.startPresentation();
      })();
    });

    const refreshButton = doc.createElement("button");
    refreshButton.type = "button";
    refreshButton.setAttribute("aria-label", t("refreshSlides"));
    refreshButton.title = t("refreshSlides");
    header.appendChild(refreshButton);
    refreshButton.innerHTML = icons.refresh;
    refreshButton.addEventListener("click", () => {
      this.previewService?.clear();
      this.lastFingerprint = "";
      void this.refresh(true);
    });

    if (!this.resolved || !this.previewService) {
      const empty = doc.createElement("div");
      empty.className = "slideshow-empty";
      empty.textContent = t("noSlides");
      root.appendChild(empty);
      return;
    }

    const deck = this.resolved.deck;
    const summary = doc.createElement("div");
    summary.className = "slideshow-sidepanel__summary";
    root.appendChild(summary);
    summary.textContent =
      deck.kind === "frame"
        ? `${t("frameDeck")} · ${t("visibleSlideCount", { visible: deck.visibleSlides.length, total: deck.slides.length })}`
        : `${t("lineDeck")} · ${t("slideCount", { count: deck.slides.length })}`;

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
        notesBlurred: () => {
          if (this.pendingRefresh) this.scheduleRefresh();
        },
      },
    });
    this.sorter.render(preferredSlideId);
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

  private requestAnimationEditor(slide: SlideDeckSlide): void {
    new Notice(
      slide.kind === "frame"
        ? this.options.t("animationCheckpoint3")
        : this.options.t("lineAnimationUnsupported"),
    );
  }
}
