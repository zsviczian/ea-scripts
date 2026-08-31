/**
 * @file PresenterViewController.ts
 * @overview Script-owned desktop presenter popout with synchronized previews, notes, and navigation.
 */

import type { Component, WorkspaceLeaf } from "obsidian";

import {
  moveWindowToDisplay,
  resolveSameNativeWindow,
  waitForWindowOnDisplay,
} from "./desktopDisplays";
import { sleepInWindow } from "../../sharedUtils/windowTiming";
import { SlidePreviewService } from "./SlidePreviewService";
import type { SlideDeckSlide } from "./SlideDeck";
import type { SlideshowTranslator } from "./lang";
import { SLIDESHOW_PRESENTER_STYLES } from "./styles";
import type { PresentationSetup, PresentationState, SlideshowConfig, SlideshowIcons } from "./types";

export type PresenterKeyboardAction = "next" | "previous" | "first" | "last" | "finish" | null;

export interface PresenterLeaf extends WorkspaceLeaf {
  readonly view: WorkspaceLeaf["view"] & { containerEl: HTMLElement };
}

export interface PresenterViewCallbacks {
  previous(): void;
  next(): void;
  first(): void;
  last(): void;
  finish(): void;
}

export interface PresenterViewControllerOptions {
  ea: ExcalidrawAutomate;
  api: ExcalidrawAPI;
  hostView: ScriptExcalidrawView;
  setup: PresentationSetup;
  config: SlideshowConfig;
  icons: SlideshowIcons;
  t: SlideshowTranslator;
  callbacks: PresenterViewCallbacks;
  targetDisplayId?: number;
  getAnimationOriginalOpacities?(): ReadonlyMap<string, number>;
  onClosed(): void;
}


/** Waits until Obsidian migrates a newly opened popout leaf into a distinct DOM window. */
export async function waitForPresenterOwnerWindow(
  leaf: PresenterLeaf,
  hostWindow: Window,
  timeoutMs = 3000,
): Promise<{ win: Window | null; elapsedMs: number }> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    const win = leaf.view.containerEl.ownerDocument.defaultView;
    if (win && win !== hostWindow) return { win, elapsedMs: Date.now() - started };
    await sleepInWindow(hostWindow, 50);
  }
  return { win: null, elapsedMs: Date.now() - started };
}

/** Maps presenter-window keyboard input to the authoritative slideshow actions. */
export function getPresenterKeyboardAction(key: string): PresenterKeyboardAction {
  switch (key) {
    case " ":
    case "Space":
    case "Spacebar":
    case "ArrowRight":
    case "ArrowDown":
      return "next";
    case "ArrowLeft":
    case "ArrowUp":
      return "previous";
    case "Home":
      return "first";
    case "End":
      return "last";
    case "Backspace":
    case "Escape":
      return "finish";
    default:
      return null;
  }
}

/** Owns one desktop presenter popout. Closing the popout does not end the slideshow. */
export class PresenterViewController {
  private leaf: PresenterLeaf | null = null;
  private ownerWindow: Window | null = null;
  private root: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private counterEl: HTMLElement | null = null;
  private currentPreviewEl: HTMLElement | null = null;
  private nextPreviewEl: HTMLElement | null = null;
  private notesEl: HTMLElement | null = null;
  private progressEl: HTMLElement | null = null;
  private layoutButton: HTMLButtonElement | null = null;
  private notesFocusedLayout = false;
  private nextSectionTitleEl: HTMLElement | null = null;
  private markdownComponent: Component | null = null;
  private lastNotesSlideId: string | null = null;
  private updateGeneration = 0;
  private previewQueue: Promise<void> = Promise.resolve();
  private closed = false;
  private destroying = false;
  private readonly previewService: SlidePreviewService;

  public constructor(private readonly options: PresenterViewControllerOptions) {
    this.previewService = new SlidePreviewService(options.ea, options.api, options.config);
  }

  /** Opens the popout, waits for real window migration, and renders its initial state. */
  public async open(initialState: PresentationState): Promise<void> {
    if (this.leaf) {
      this.update(initialState);
      await app.workspace.revealLeaf(this.leaf);
      app.workspace.setActiveLeaf(this.leaf, { focus: true });
      return;
    }
    const leaf = app.workspace.openPopoutLeaf() as PresenterLeaf;
    this.leaf = leaf;
    await app.workspace.revealLeaf(leaf);
    // Give Obsidian a chance to actually migrate the new leaf into its popout document before
    // reading ownerDocument/defaultView. Without this, the leaf can still report the host window.
    app.workspace.setActiveLeaf(leaf, { focus: true });
    const migrated = await waitForPresenterOwnerWindow(leaf, this.options.hostView.ownerWindow);
    const win = migrated.win;
    if (!win) {
      leaf.detach();
      this.leaf = null;
      throw new Error("Presenter popout did not migrate to a distinct window.");
    }
    const container = leaf.view.containerEl;
    const doc = container.ownerDocument;
    this.ownerWindow = win;
    doc.title = this.options.t("presenterViewTitle");
    const headerTitle = container.querySelector(".view-header-title") as HTMLElement | null;
    if (headerTitle) headerTitle.textContent = this.options.t("presenterViewTitle");
    const content = (container.querySelector(".view-content") as HTMLElement | null) ?? container;
    content.replaceChildren();
    this.renderShell(content, doc);
    win.addEventListener("keydown", this.keydownListener, true);
    win.addEventListener("beforeunload", this.windowClosingListener, { once: true });
    this.update(initialState);
    app.workspace.setActiveLeaf(leaf, { focus: true });
    await sleepInWindow(win, 100);
    if (this.options.targetDisplayId !== undefined) {
      const sameNative = resolveSameNativeWindow(this.options.hostView.ownerWindow, win);
      if (sameNative === false) {
        const moved = moveWindowToDisplay(win, this.options.targetDisplayId, true);
        if (moved) {
          await waitForWindowOnDisplay(win, this.options.targetDisplayId, 2500);
          await sleepInWindow(win, 150);
        }
      }
    }
  }

  /** Brings an already-open presenter window to the foreground. */
  public async focus(): Promise<void> {
    if (!this.leaf) return;
    await app.workspace.revealLeaf(this.leaf);
    app.workspace.setActiveLeaf(this.leaf, { focus: true });
  }

  /** Updates text synchronously and refreshes previews/Markdown asynchronously. */
  public update(state: PresentationState): void {
    if (this.closed || !this.root) return;
    const slide = this.getSlide(state.currentSlideId);
    if (this.titleEl) {
      this.titleEl.textContent =
        slide?.title ?? this.options.t("slideLabel", { number: state.currentIndex + 1 });
    }
    if (this.counterEl) {
      this.counterEl.textContent = this.options.t("presenterSlideCounter", {
        number: state.currentIndex + 1,
        total: state.visibleSlideCount,
      });
    }
    if (this.progressEl) {
      this.progressEl.textContent =
        state.animationStepCount > 0
          ? this.options.t("presenterAnimationProgress", {
              completed: state.completedAnimationSteps,
              total: state.animationStepCount,
            })
          : this.options.t("presenterNoAnimations");
    }
    if (this.nextSectionTitleEl) {
      this.nextSectionTitleEl.textContent =
        state.nextAction === "build"
          ? this.options.t("presenterNextBuild")
          : this.options.t("presenterNextSlide");
    }
    const generation = ++this.updateGeneration;
    if (state.currentSlideId !== this.lastNotesSlideId) {
      this.lastNotesSlideId = state.currentSlideId;
      void this.renderNotes(slide, generation);
    }
    const queuedPreview = this.previewQueue.then(async () => {
      if (generation !== this.updateGeneration || this.closed) return;
      await this.renderPreviews(state, generation);
    });
    this.previewQueue = queuedPreview.catch((error) => {
      console.error("Slideshow presenter preview failed", error);
    });
  }

  /** Waits for any in-flight EA-backed preview export to release the shared workbench. */
  public async waitForIdle(): Promise<void> {
    await this.previewQueue;
  }

  /** Removes listeners/renderers and optionally detaches the presenter leaf/popout. */
  public async destroy(detachLeaf = true): Promise<void> {
    if (this.destroying) return;
    this.destroying = true;
    const leaf = this.leaf;
    const win = this.ownerWindow;
    this.closed = true;
    this.updateGeneration += 1;
    if (win) {
      win.removeEventListener("keydown", this.keydownListener, true);
      win.removeEventListener("beforeunload", this.windowClosingListener);
    }
    this.markdownComponent?.unload();
    this.markdownComponent = null;
    this.root?.remove();
    this.root = null;
    this.leaf = null;
    this.ownerWindow = null;
    if (detachLeaf && leaf) {
      try {
        leaf.detach();
      } catch {
        // The popout may already be tearing down because the user closed its window.
      }
    }
    await this.previewQueue.catch(() => undefined);
    this.previewService.clear();
    this.options.onClosed();
  }

  private renderShell(content: HTMLElement, doc: Document): void {
    const style = doc.createElement("style");
    style.textContent = SLIDESHOW_PRESENTER_STYLES;
    content.appendChild(style);
    const root = doc.createElement("div");
    root.className = "slideshow-presenter";
    content.appendChild(root);
    this.root = root;

    const header = doc.createElement("div");
    header.className = "slideshow-presenter__header";
    root.appendChild(header);
    const heading = doc.createElement("div");
    heading.className = "slideshow-presenter__heading";
    header.appendChild(heading);
    this.titleEl = doc.createElement("div");
    this.titleEl.className = "slideshow-presenter__title";
    heading.appendChild(this.titleEl);
    this.counterEl = doc.createElement("div");
    this.counterEl.className = "slideshow-presenter__counter";
    heading.appendChild(this.counterEl);
    const headerActions = doc.createElement("div");
    headerActions.className = "slideshow-presenter__header-actions";
    header.appendChild(headerActions);
    this.layoutButton = doc.createElement("button");
    this.layoutButton.type = "button";
    this.layoutButton.className = "slideshow-presenter__layout-toggle";
    this.layoutButton.innerHTML = this.options.icons.notebookPen;
    this.layoutButton.addEventListener("click", () => this.toggleNotesFocusedLayout());
    headerActions.appendChild(this.layoutButton);
    this.updateLayoutButton();
    const close = doc.createElement("button");
    close.type = "button";
    close.className = "slideshow-presenter__close";
    close.setAttribute("aria-label", this.options.t("presenterClose"));
    close.innerHTML = this.options.icons.close;
    close.addEventListener("click", () => void this.destroy(true));
    headerActions.appendChild(close);

    const grid = doc.createElement("div");
    grid.className = "slideshow-presenter__grid";
    root.appendChild(grid);
    const currentColumn = doc.createElement("section");
    currentColumn.className = "slideshow-presenter__column";
    grid.appendChild(currentColumn);
    currentColumn.appendChild(this.sectionTitle(doc, this.options.t("presenterCurrentSlide")));
    this.currentPreviewEl = doc.createElement("div");
    this.currentPreviewEl.className = "slideshow-presenter__preview slideshow-presenter__current-preview";
    this.currentPreviewEl.style.aspectRatio = this.previewService.getAspectRatio();
    currentColumn.appendChild(this.currentPreviewEl);
    const nextColumn = doc.createElement("section");
    nextColumn.className = "slideshow-presenter__column";
    grid.appendChild(nextColumn);
    this.nextSectionTitleEl = this.sectionTitle(doc, this.options.t("presenterNextSlide"));
    nextColumn.appendChild(this.nextSectionTitleEl);
    this.nextPreviewEl = doc.createElement("div");
    this.nextPreviewEl.className = "slideshow-presenter__preview slideshow-presenter__next-preview";
    this.nextPreviewEl.style.aspectRatio = this.previewService.getAspectRatio();
    nextColumn.appendChild(this.nextPreviewEl);
    this.progressEl = doc.createElement("div");
    this.progressEl.className = "slideshow-presenter__progress";
    nextColumn.appendChild(this.progressEl);

    const notesColumn = doc.createElement("section");
    notesColumn.className = "slideshow-presenter__column slideshow-presenter__notes-column";
    grid.appendChild(notesColumn);
    notesColumn.appendChild(this.sectionTitle(doc, this.options.t("presenterNotes")));
    this.notesEl = doc.createElement("div");
    this.notesEl.className = "slideshow-presenter__notes";
    notesColumn.appendChild(this.notesEl);

    const controls = doc.createElement("div");
    controls.className = "slideshow-presenter__controls";
    root.appendChild(controls);
    controls.appendChild(this.iconButton(doc, this.options.icons.leftArrow, this.options.t("previousSlide"), this.options.callbacks.previous));
    controls.appendChild(this.iconButton(doc, this.options.icons.rightArrow, this.options.t("nextSlide"), this.options.callbacks.next));
    controls.appendChild(this.iconButton(doc, this.options.icons.finish, this.options.t("endPresentation"), this.options.callbacks.finish));
  }

  private toggleNotesFocusedLayout(): void {
    this.notesFocusedLayout = !this.notesFocusedLayout;
    this.root?.classList.toggle("is-notes-focused", this.notesFocusedLayout);
    this.updateLayoutButton();
  }

  private updateLayoutButton(): void {
    if (!this.layoutButton) return;
    const label = this.options.t(
      this.notesFocusedLayout ? "presenterStandardLayout" : "presenterNotesFocusLayout",
    );
    this.layoutButton.setAttribute("aria-label", label);
    this.layoutButton.classList.toggle("is-active", this.notesFocusedLayout);
  }

  private sectionTitle(doc: Document, text: string): HTMLElement {
    const title = doc.createElement("div");
    title.className = "slideshow-presenter__section-title";
    title.textContent = text;
    return title;
  }

  private iconButton(doc: Document, icon: string, label: string, callback: () => void): HTMLButtonElement {
    const button = doc.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.innerHTML = icon;
    button.addEventListener("click", callback);
    return button;
  }

  private getSlide(slideId: string | null): SlideDeckSlide | null {
    if (!slideId) return null;
    return this.options.setup.deck.visibleSlides.find((slide) => slide.id === slideId) ?? null;
  }

  private async renderNotes(slide: SlideDeckSlide | null, generation: number): Promise<void> {
    const notesEl = this.notesEl;
    if (!notesEl) return;
    this.markdownComponent?.unload();
    this.markdownComponent = null;
    notesEl.replaceChildren();
    const notes = slide?.notes?.trim() ?? "";
    notesEl.classList.toggle("is-empty", notes.length === 0);
    if (!notes) {
      notesEl.textContent = this.options.t("presenterNoNotes");
      return;
    }
    const component = new this.options.ea.obsidian.Component();
    component.load();
    this.markdownComponent = component;
    try {
      await this.options.ea.obsidian.MarkdownRenderer.render(
        app,
        notes,
        notesEl,
        this.options.hostView.file.path,
        component,
      );
      if (generation !== this.updateGeneration) component.unload();
    } catch (error) {
      if (generation === this.updateGeneration) notesEl.textContent = notes;
      console.error("Slideshow presenter notes render failed", error);
    }
  }

  private async renderPreviews(state: PresentationState, generation: number): Promise<void> {
    const currentHost = this.currentPreviewEl;
    const nextHost = this.nextPreviewEl;
    if (!currentHost || !nextHost) return;
    const doc = currentHost.ownerDocument;
    const currentSlide = this.getSlide(state.currentSlideId);
    const nextSlide = this.getSlide(state.nextSlideId);
    const originalOpacities = this.options.getAnimationOriginalOpacities?.();
    // EA is a shared workbench. Keep current/next exports sequential, especially when
    // the next navigation is another build state of the same slide.
    const currentPreview = currentSlide
      ? await this.previewService.createPreview(
          currentSlide,
          doc,
          currentSlide.kind === "frame"
            ? {
                completedAnimationSteps: state.completedAnimationSteps,
                ...(originalOpacities ? { originalOpacities } : {}),
              }
            : {},
        )
      : null;
    const nextPreview = nextSlide
      ? await this.previewService.createPreview(
          nextSlide,
          doc,
          nextSlide.kind === "frame"
            ? {
                completedAnimationSteps: state.nextCompletedAnimationSteps ?? 0,
                ...(originalOpacities ? { originalOpacities } : {}),
              }
            : {},
        )
      : null;
    if (generation !== this.updateGeneration || this.closed) return;
    currentHost.replaceChildren();
    if (currentPreview) currentHost.appendChild(currentPreview);
    nextHost.replaceChildren();
    if (nextPreview) {
      nextHost.classList.remove("slideshow-presenter__end");
      nextHost.appendChild(nextPreview);
    } else {
      nextHost.classList.add("slideshow-presenter__end");
      nextHost.textContent = this.options.t("presenterEnd");
    }
  }

  private readonly keydownListener = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || event.repeat) return;
    const target = event.target as HTMLElement | null;
    if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
    const action = getPresenterKeyboardAction(event.key);
    if (!action) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    switch (action) {
      case "next":
        this.options.callbacks.next();
        break;
      case "previous":
        this.options.callbacks.previous();
        break;
      case "first":
        this.options.callbacks.first();
        break;
      case "last":
        this.options.callbacks.last();
        break;
      case "finish":
        this.options.callbacks.finish();
        break;
    }
  };

  private readonly windowClosingListener = (): void => {
    void this.destroy(false);
  };
}
