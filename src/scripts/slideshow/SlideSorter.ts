/**
 * @file SlideSorter.ts
 * @overview Renders slide rows, keyboard/drag reordering controls, inclusion, and notes editing.
 */

/* eslint-disable max-lines-per-function -- Row construction is intentionally kept together for accessible control ordering. */

import type { SlideDeck, SlideDeckSlide } from "./SlideDeck";
import type { SlidePreviewService } from "./SlidePreviewService";
import type { SlideshowTranslator } from "./lang";
import type { SlideshowIcons } from "./types";

export interface SlideSorterCallbacks {
  move(fromIndex: number, toIndex: number): Promise<void>;
  toggleInclusion(slide: SlideDeckSlide, excluded: boolean): Promise<void>;
  zoomToSlide(slide: SlideDeckSlide): void;
  saveNotes(slide: SlideDeckSlide, notes: string): Promise<void>;
  requestAnimationEditor(slide: SlideDeckSlide): void;
  notesBlurred(): void;
}

export interface SlideSorterOptions {
  ea: ExcalidrawAutomate;
  container: HTMLElement;
  deck: SlideDeck;
  previewService: SlidePreviewService;
  icons: SlideshowIcons;
  t: SlideshowTranslator;
  reorderEnabled: boolean;
  callbacks: SlideSorterCallbacks;
}

/** Owns one rendered sorter instance and pending presenter-note edits. */
export class SlideSorter {
  private selectedSlideId: string | null = null;
  private expandedNotesSlideId: string | null = null;
  private notesTextarea: HTMLTextAreaElement | null = null;
  private notesTimer = 0;
  private ownerWindow: Window;
  private renderGeneration = 0;
  private draggedIndex: number | null = null;
  private notesSaveInFlight: Promise<void> | null = null;

  public constructor(private readonly options: SlideSorterOptions) {
    this.ownerWindow = options.container.ownerDocument.defaultView ?? window;
    this.selectedSlideId = options.deck.slides[0]?.id ?? null;
  }

  /** Rebinds timer behavior after the sidepanel DOM migrates between windows. */
  public onWindowMigrated(ownerWindow: Window): void {
    if (this.notesTimer) {
      this.ownerWindow.clearTimeout(this.notesTimer);
      this.notesTimer = 0;
      this.scheduleNotesSave();
    }
    this.ownerWindow = ownerWindow;
  }

  /** Returns the currently selected stable slide id. */
  public getSelectedSlideId(): string | null {
    return this.selectedSlideId;
  }

  /** Returns the slide whose inline notes editor is expanded, if any. */
  public getExpandedNotesSlideId(): string | null {
    return this.expandedNotesSlideId;
  }

  /** Returns whether notes currently have keyboard focus. */
  public isEditingNotes(): boolean {
    return this.notesTextarea?.ownerDocument.activeElement === this.notesTextarea;
  }

  /** Selects prior stable ids when still present, then renders the sorter. */
  public render(
    preferredSlideId = this.selectedSlideId,
    preferredNotesSlideId = this.expandedNotesSlideId,
  ): void {
    this.renderGeneration += 1;
    const generation = this.renderGeneration;
    const { container, deck } = this.options;
    container.replaceChildren();
    this.notesTextarea = null;
    if (deck.slides.length === 0) return;

    this.selectedSlideId =
      preferredSlideId && deck.slides.some((slide) => slide.id === preferredSlideId)
        ? preferredSlideId
        : (deck.slides[0]?.id ?? null);
    this.expandedNotesSlideId =
      preferredNotesSlideId &&
      preferredNotesSlideId === this.selectedSlideId &&
      deck.slides.some((slide) => slide.id === preferredNotesSlideId)
        ? preferredNotesSlideId
        : null;

    deck.slides.forEach((slide, index) => {
      const row = this.createRow(slide, index);
      container.appendChild(row);
      const previewHost = row.querySelector<HTMLElement>(".slideshow-sorter__preview");
      if (previewHost) {
        void this.options.previewService
          .createPreview(slide, row.ownerDocument)
          .then((preview) => {
            if (!preview || generation !== this.renderGeneration || !previewHost.isConnected) return;
            previewHost.replaceChildren();
            previewHost.appendChild(preview);
          })
          .catch(() => undefined);
      }
    });
  }

  private createIconButton(
    ownerDocument: Document,
    icon: string,
    label: string,
    disabled: boolean,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.innerHTML = icon;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.disabled = disabled;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  private createRow(slide: SlideDeckSlide, index: number): HTMLDivElement {
    const { deck, icons, t, reorderEnabled, ea } = this.options;
    const doc = this.options.container.ownerDocument;
    const row = doc.createElement("div");
    row.className = "slideshow-sorter__row";
    if (slide.id === this.selectedSlideId) row.classList.add("is-selected");
    if (slide.excluded) row.classList.add("is-excluded");
    row.tabIndex = 0;
    row.dataset.slideId = slide.id;
    row.setAttribute("role", "listitem");
    row.addEventListener("click", () => void this.selectSlide(slide.id));
    row.addEventListener("dblclick", () => this.options.callbacks.zoomToSlide(slide));
    row.addEventListener("keydown", (event) => this.handleRowKeydown(event, slide, index));

    const top = doc.createElement("div");
    top.className = "slideshow-sorter__top";
    const title = doc.createElement("div");
    title.className = "slideshow-sorter__title";
    const titleText = t("slideNumberAndTitle", { number: index + 1, title: slide.title });
    title.textContent = titleText;
    title.title = titleText;
    top.appendChild(title);
    const badges = doc.createElement("div");
    badges.className = "slideshow-sorter__badges";
    if (slide.notes) {
      const badge = doc.createElement("span");
      badge.className = "slideshow-sorter__badge";
      badge.innerHTML = `${icons.notebookPen}<span>${t("notesPresent")}</span>`;
      badges.appendChild(badge);
    }
    if (slide.kind === "frame" && slide.animationSteps.length > 0) {
      const badge = doc.createElement("span");
      badge.className = "slideshow-sorter__badge";
      badge.innerHTML = `${icons.sparkles}<span>${t("animationCount", { count: slide.animationSteps.length })}</span>`;
      badges.appendChild(badge);
    }
    top.appendChild(badges);
    row.appendChild(top);

    const content = doc.createElement("div");
    content.className = "slideshow-sorter__content";
    row.appendChild(content);

    const drag = doc.createElement("div");
    drag.className = "slideshow-sorter__drag";
    const dragButton = this.createIconButton(
      doc,
      icons.gripVertical,
      t("dragSlide"),
      !reorderEnabled,
      () => undefined,
    );
    drag.appendChild(dragButton);
    content.appendChild(drag);

    if (ea.DEVICE.isDesktop && reorderEnabled) {
      drag.draggable = true;
      drag.addEventListener("dragstart", (event) => {
        this.draggedIndex = index;
        row.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", String(index));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      drag.addEventListener("dragend", () => {
        this.draggedIndex = null;
        row.classList.remove("is-dragging");
      });
      row.addEventListener("dragover", (event) => {
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      });
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        const dataIndex = Number.parseInt(event.dataTransfer?.getData("text/plain") ?? "", 10);
        const fromIndex = this.draggedIndex ?? dataIndex;
        if (Number.isInteger(fromIndex) && fromIndex !== index) {
          void this.options.callbacks.move(fromIndex, index);
        }
      });
    }

    const preview = doc.createElement("div");
    preview.className = "slideshow-sorter__preview";
    content.appendChild(preview);

    const actions = doc.createElement("div");
    actions.className = "slideshow-sorter__actions";
    actions.appendChild(
      this.createIconButton(
        doc,
        icons.chevronUp,
        t("moveSlideUp"),
        !reorderEnabled || index === 0,
        () => {
          void this.options.callbacks.move(index, index - 1);
        },
      ),
    );
    actions.appendChild(
      this.createIconButton(
        doc,
        icons.chevronDown,
        t("moveSlideDown"),
        !reorderEnabled || index === deck.slides.length - 1,
        () => {
          void this.options.callbacks.move(index, index + 1);
        },
      ),
    );
    if (slide.kind === "frame") {
      actions.appendChild(
        this.createIconButton(
          doc,
          slide.excluded ? icons.eyeOff : icons.eye,
          slide.excluded ? t("includeSlide") : t("excludeSlide"),
          false,
          () => void this.options.callbacks.toggleInclusion(slide, !slide.excluded),
        ),
      );
      actions.appendChild(
        this.createIconButton(doc, icons.sparkles, t("editAnimations"), true, () =>
          this.options.callbacks.requestAnimationEditor(slide),
        ),
      );
    }
    const notesExpanded = this.expandedNotesSlideId === slide.id;
    const notesButton = this.createIconButton(
      doc,
      icons.notebookPen,
      notesExpanded ? t("hidePresenterNotes") : t("showPresenterNotes"),
      false,
      () => void this.toggleNotes(slide.id),
    );
    notesButton.classList.toggle("is-active", notesExpanded);
    notesButton.setAttribute("aria-expanded", String(notesExpanded));
    actions.appendChild(notesButton);
    content.appendChild(actions);

    if (notesExpanded) this.renderNotesEditor(slide, row);
    return row;
  }

  private handleRowKeydown(event: KeyboardEvent, slide: SlideDeckSlide, index: number): void {
    const rows = Array.from(
      this.options.container.querySelectorAll<HTMLElement>(".slideshow-sorter__row"),
    );
    if (event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      if (!this.options.reorderEnabled) return;
      const target = event.key === "ArrowUp" ? index - 1 : index + 1;
      if (target >= 0 && target < this.options.deck.slides.length) {
        void this.options.callbacks.move(index, target);
      }
      return;
    }
    switch (event.key) {
      case "ArrowUp":
      case "ArrowDown": {
        event.preventDefault();
        const target = event.key === "ArrowUp" ? index - 1 : index + 1;
        rows[target]?.focus();
        break;
      }
      case "Enter":
        event.preventDefault();
        this.options.callbacks.zoomToSlide(slide);
        break;
      case " ":
      case "Spacebar":
        if (slide.kind === "frame") {
          event.preventDefault();
          void this.options.callbacks.toggleInclusion(slide, !slide.excluded);
        }
        break;
      case "n":
      case "N":
        event.preventDefault();
        void this.openNotes(slide.id, true);
        break;
      case "a":
      case "A":
        event.preventDefault();
        this.options.callbacks.requestAnimationEditor(slide);
        break;
    }
  }

  private async selectSlide(slideId: string): Promise<void> {
    if (slideId === this.selectedSlideId) return;
    await this.flushNotes();
    this.selectedSlideId = slideId;
    this.expandedNotesSlideId = null;
    this.render(slideId);
  }

  private async toggleNotes(slideId: string): Promise<void> {
    if (this.expandedNotesSlideId === slideId) {
      await this.flushNotes();
      this.expandedNotesSlideId = null;
      this.render(this.selectedSlideId);
      return;
    }
    await this.openNotes(slideId, false);
  }

  private async openNotes(slideId: string, focusNotes: boolean): Promise<void> {
    await this.flushNotes();
    this.selectedSlideId = slideId;
    this.expandedNotesSlideId = slideId;
    this.render(slideId, slideId);
    if (focusNotes) this.notesTextarea?.focus();
  }

  private renderNotesEditor(slide: SlideDeckSlide, row: HTMLElement): void {
    const doc = this.options.container.ownerDocument;
    const notes = doc.createElement("div");
    notes.className = "slideshow-notes";
    notes.addEventListener("click", (event) => event.stopPropagation());
    const heading = doc.createElement("strong");
    heading.textContent = this.options.t("notesHeading");
    notes.appendChild(heading);
    const textarea = doc.createElement("textarea");
    textarea.placeholder = this.options.t("notesPlaceholder");
    textarea.value = slide.notes ?? "";
    textarea.addEventListener("click", (event) => event.stopPropagation());
    textarea.addEventListener("keydown", (event) => event.stopPropagation());
    textarea.addEventListener("input", () => this.scheduleNotesSave());
    textarea.addEventListener("blur", () => {
      void this.flushNotes().finally(() => this.options.callbacks.notesBlurred());
    });
    notes.appendChild(textarea);
    const hint = doc.createElement("div");
    hint.className = "slideshow-notes__hint";
    hint.textContent = this.options.t("notesHint");
    notes.appendChild(hint);
    row.appendChild(notes);
    this.notesTextarea = textarea;
  }

  private scheduleNotesSave(): void {
    if (!this.notesTextarea || !this.expandedNotesSlideId) return;
    if (this.notesTimer) this.ownerWindow.clearTimeout(this.notesTimer);
    this.notesTimer = this.ownerWindow.setTimeout(() => {
      this.notesTimer = 0;
      void this.flushNotes();
    }, 500);
  }

  /** Flushes a pending notes edit before slide changes, panel close, or presentation start. */
  public async flushNotes(): Promise<void> {
    if (this.notesTimer) {
      this.ownerWindow.clearTimeout(this.notesTimer);
      this.notesTimer = 0;
    }
    if (this.notesSaveInFlight) await this.notesSaveInFlight;
    const slide = this.options.deck.slides.find(
      (candidate) => candidate.id === this.expandedNotesSlideId,
    );
    if (!slide || !this.notesTextarea) return;
    const current = this.notesTextarea.value;
    if (current === (slide.notes ?? "")) return;
    const save = (async () => {
      await this.options.callbacks.saveNotes(slide, current);
      if (current.trim().length === 0) delete slide.notes;
      else slide.notes = current;
    })();
    this.notesSaveInFlight = save;
    try {
      await save;
    } finally {
      if (this.notesSaveInFlight === save) this.notesSaveInFlight = null;
    }
  }

  /** Cancels timers and invalidates asynchronous preview insertions. */
  public destroy(): void {
    this.renderGeneration += 1;
    if (this.notesTimer) this.ownerWindow.clearTimeout(this.notesTimer);
    this.notesTimer = 0;
    this.notesTextarea = null;
  }
}
