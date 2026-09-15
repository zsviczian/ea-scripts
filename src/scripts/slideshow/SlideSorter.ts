/**
 * @file SlideSorter.ts
 * @overview Renders slide rows, keyboard/drag reordering controls, inclusion, and notes editing.
 */

/* eslint-disable max-lines-per-function -- Row construction is intentionally kept together for accessible control ordering. */

import type { SlideDeck, SlideDeckSlide } from "./SlideDeck";
import type { SlidePreviewService } from "./SlidePreviewService";
import type { SlideshowTranslator } from "./lang";
import type { AnimationStep, SlideshowIcons } from "./types";

export interface SlideSorterCallbacks {
  move(fromIndex: number, toIndex: number): Promise<void>;
  toggleInclusion(slide: SlideDeckSlide, excluded: boolean): Promise<void>;
  zoomToSlide(slide: SlideDeckSlide): void;
  saveNotes(slide: SlideDeckSlide, notes: string): Promise<void>;
  requestAnimationEditor(slide: SlideDeckSlide): void;
  mountAnimationEditor?(slide: SlideDeckSlide, container: HTMLElement): void;
  editSlideName?(slide: SlideDeckSlide): void;
  editLineSlide(slide: SlideDeckSlide, index: number): Promise<void>;
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
  animationEditingSlideId?: string | null;
  previewRenderingEnabled?: boolean;
  callbacks: SlideSorterCallbacks;
}

/** Returns the insertion gap nearest the pointer, using each slide row's vertical midpoint. */
export function getDropInsertionIndex(rowMidpoints: readonly number[], pointerY: number): number {
  const index = rowMidpoints.findIndex((midpoint) => pointerY < midpoint);
  return index === -1 ? rowMidpoints.length : index;
}

export interface SorterRowRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Returns whether every rendered slide occupies its own visual row. */
export function isSingleColumnSorterLayout(rowRects: readonly SorterRowRect[]): boolean {
  if (rowRects.length <= 1) return true;
  const firstLeft = rowRects[0]?.left ?? 0;
  return rowRects.every((rect) => Math.abs(rect.left - firstLeft) <= 8);
}

export interface DropIndicatorPlacement {
  beforeIndex: number | null;
  afterIndex: number | null;
  singleColumn: boolean;
}

/** Returns the rows that should visualize one insertion gap. */
export function getDropIndicatorPlacement(
  rowRects: readonly SorterRowRect[],
  insertionIndex: number,
): DropIndicatorPlacement {
  const singleColumn = isSingleColumnSorterLayout(rowRects);
  if (rowRects.length === 0) {
    return { beforeIndex: null, afterIndex: null, singleColumn };
  }
  if (insertionIndex >= rowRects.length) {
    return { beforeIndex: null, afterIndex: rowRects.length - 1, singleColumn };
  }
  const wrapsRow =
    !singleColumn &&
    insertionIndex > 0 &&
    Math.abs(
      (rowRects[insertionIndex - 1]?.top ?? 0) - (rowRects[insertionIndex]?.top ?? 0),
    ) > 8;
  return {
    beforeIndex: insertionIndex,
    afterIndex: wrapsRow ? insertionIndex - 1 : null,
    singleColumn,
  };
}

/** Returns the row-major insertion gap nearest a pointer in either list or grid layouts. */
export function getDropInsertionIndexFromRects(
  rowRects: readonly SorterRowRect[],
  pointerX: number,
  pointerY: number,
): number {
  if (rowRects.length === 0) return 0;
  const groups: Array<Array<{ rect: SorterRowRect; index: number }>> = [];
  rowRects.forEach((rect, index) => {
    const group = groups.find((candidate) => {
      const first = candidate[0]?.rect;
      return Boolean(first && Math.abs(first.top - rect.top) <= 8);
    });
    if (group) group.push({ rect, index });
    else groups.push([{ rect, index }]);
  });

  const targetGroup = groups.find((group) => {
    const top = Math.min(...group.map((entry) => entry.rect.top));
    const bottom = Math.max(...group.map((entry) => entry.rect.bottom));
    return pointerY < (top + bottom) / 2;
  });
  if (!targetGroup) return rowRects.length;
  const ordered = [...targetGroup].sort((a, b) => a.rect.left - b.rect.left);
  const target = ordered.find((entry) => pointerX < (entry.rect.left + entry.rect.right) / 2);
  return target?.index ?? (ordered[ordered.length - 1]?.index ?? -1) + 1;
}

/** Converts a pre-removal insertion gap into the slide's final index. */
export function getDropMoveTarget(
  fromIndex: number,
  insertionIndex: number,
  slideCount: number,
): number | null {
  if (
    fromIndex < 0 ||
    fromIndex >= slideCount ||
    insertionIndex < 0 ||
    insertionIndex > slideCount
  ) {
    return null;
  }
  const target = insertionIndex > fromIndex ? insertionIndex - 1 : insertionIndex;
  return target === fromIndex ? null : target;
}

/** Returns proportional drag autoscroll speed near a sorter's top or bottom edge. */
export function getDragAutoScrollVelocity(
  pointerY: number,
  containerTop: number,
  containerBottom: number,
  edgeSize = 72,
  maximumSpeed = 18,
): number {
  const availableHeight = Math.max(containerBottom - containerTop, 0);
  const edge = Math.min(edgeSize, availableHeight / 2);
  if (edge <= 0) return 0;
  if (pointerY < containerTop + edge) {
    const strength = Math.min(Math.max((containerTop + edge - pointerY) / edge, 0), 1);
    return -maximumSpeed * strength;
  }
  if (pointerY > containerBottom - edge) {
    const strength = Math.min(Math.max((pointerY - (containerBottom - edge)) / edge, 0), 1);
    return maximumSpeed * strength;
  }
  return 0;
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
  private dropTargetIndex: number | null = null;
  private dropIndicatorKey: string | null = null;
  private dragPointerX: number | null = null;
  private dragPointerY: number | null = null;
  private autoScrollVelocity = 0;
  private autoScrollFrame = 0;
  private notesSaveInFlight: Promise<void> | null = null;
  private previewObserver: IntersectionObserver | null = null;
  private previewRenderingEnabled: boolean;

  public constructor(private readonly options: SlideSorterOptions) {
    this.ownerWindow = options.container.ownerDocument.defaultView ?? window;
    this.previewRenderingEnabled = options.previewRenderingEnabled ?? true;
    this.selectedSlideId = options.deck.slides[0]?.id ?? null;
    options.container.addEventListener?.("dragover", this.handleContainerDragOver);
    options.container.addEventListener?.("dragleave", this.handleContainerDragLeave);
    options.container.addEventListener?.("drop", this.handleContainerDrop);
  }

  /** Rebinds timer behavior after the sidepanel DOM migrates between windows. */
  public onWindowMigrated(ownerWindow: Window): void {
    if (this.notesTimer) {
      this.ownerWindow.clearTimeout(this.notesTimer);
      this.notesTimer = 0;
      this.scheduleNotesSave();
    }
    this.stopAutoScroll();
    this.previewObserver?.disconnect();
    this.previewObserver = null;
    this.ownerWindow = ownerWindow;
    this.render();
  }

  /** Enables or suspends sorter thumbnail work without rebuilding slide rows. */
  public setPreviewRenderingEnabled(enabled: boolean): void {
    if (enabled === this.previewRenderingEnabled) return;
    this.previewRenderingEnabled = enabled;
    this.renderGeneration += 1;
    this.previewObserver?.disconnect();
    this.previewObserver = null;
  }

  /** Refreshes visible/nearby thumbnails when preview rendering is enabled. */
  public refreshPreviews(): void {
    if (!this.previewRenderingEnabled) return;
    this.renderGeneration += 1;
    const generation = this.renderGeneration;
    this.previewObserver?.disconnect();
    this.previewObserver = this.createPreviewObserver(generation);
    const hosts = Array.from(
      this.options.container.querySelectorAll<HTMLElement>(".slideshow-sorter__preview"),
    );
    for (const host of hosts) {
      const slide = this.options.deck.slides.find(
        (candidate) => candidate.id === host.dataset.slideId,
      );
      if (!slide) continue;
      if (this.previewObserver) this.previewObserver.observe(host);
      else this.renderPreview(host, slide, generation);
    }
  }

  /** Performs one lazy preview pass without enabling background thumbnail refreshes. */
  public refreshPreviewsOnce(): void {
    this.renderGeneration += 1;
    const generation = this.renderGeneration;
    const hosts = Array.from(
      this.options.container.querySelectorAll<HTMLElement>(".slideshow-sorter__preview"),
    ).filter((host) => !host.firstElementChild);
    if (hosts.length === 0) return;
    const observer = this.createPreviewObserver(generation, true, true);
    if (observer) {
      for (const host of hosts) observer.observe(host);
      return;
    }

    const selectedHost = hosts.find((host) => host.dataset.slideId === this.selectedSlideId);
    const fallbackHosts = Array.from(
      new Set([...(selectedHost ? [selectedHost] : []), ...hosts.slice(0, 8)]),
    );
    for (const host of fallbackHosts) {
      const slide = this.options.deck.slides.find(
        (candidate) => candidate.id === host.dataset.slideId,
      );
      if (slide) this.renderPreview(host, slide, generation, true);
    }
  }

  /** Expands or collapses one animation editor without rebuilding unaffected slide rows. */
  public setAnimationEditingSlideId(slideId: string | null): void {
    const previousSlideId = this.options.animationEditingSlideId ?? null;
    if (previousSlideId === slideId) return;

    const affected = new Set<string>();
    if (previousSlideId) affected.add(previousSlideId);
    if (slideId) {
      affected.add(slideId);
      this.selectedSlideId = slideId;
      if (this.expandedNotesSlideId && this.expandedNotesSlideId !== slideId) {
        affected.add(this.expandedNotesSlideId);
        this.expandedNotesSlideId = null;
        this.notesTextarea = null;
      }
    }
    this.options.animationEditingSlideId = slideId;
    this.options.container.classList.toggle(
      "has-expanded-editor",
      Boolean(this.expandedNotesSlideId || slideId),
    );
    this.updateSelectedRows();
    for (const affectedSlideId of affected) this.replaceRowPreservingPreview(affectedSlideId);
  }

  /** Applies one include/exclude change in place; preview pixels are deliberately untouched. */
  public applyInclusion(slideId: string, excluded: boolean): void {
    const slide = this.options.deck.slides.find((candidate) => candidate.id === slideId);
    if (!slide) return;
    slide.excluded = excluded;
    this.options.deck.visibleSlides = this.options.deck.slides.filter((candidate) => !candidate.excluded);
    if (this.options.deck.kind === "frame") this.options.deck.hasExplicitFrameOrder = true;
    const row = this.getRow(slideId);
    if (row) this.updateRowInclusion(row, slide);
  }

  /** Applies a persisted reorder by moving existing row nodes rather than recreating them. */
  public applyReorder(fromIndex: number, toIndex: number): void {
    const { deck, container } = this.options;
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= deck.slides.length ||
      toIndex >= deck.slides.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const [moved] = deck.slides.splice(fromIndex, 1);
    if (!moved) return;
    deck.slides.splice(toIndex, 0, moved);
    deck.slides.forEach((slide, index) => {
      if (slide.kind === "frame") slide.order = index;
      else slide.pairIndex = index;
    });
    deck.visibleSlides = deck.slides.filter((slide) => !slide.excluded);
    if (deck.kind === "frame") deck.hasExplicitFrameOrder = true;

    const rowsById = new Map(
      Array.from(container.querySelectorAll<HTMLElement>(".slideshow-sorter__row")).map((row) => [
        row.dataset.slideId ?? "",
        row,
      ]),
    );
    const movedRow = rowsById.get(moved.id);
    const nextSlide = deck.slides[toIndex + 1];
    const nextRow = nextSlide ? rowsById.get(nextSlide.id) : undefined;
    if (movedRow) {
      if (nextRow) container.insertBefore(movedRow, nextRow);
      else container.appendChild(movedRow);
    }
    deck.slides.forEach((slide, index) => {
      const row = rowsById.get(slide.id);
      if (row) this.updateRowOrderState(row, slide, index);
    });
  }

  /** Updates one slide's animation badge/model and refreshes only that preview when requested. */
  public updateAnimationSteps(
    slideId: string,
    steps: readonly AnimationStep[],
    refreshPreview = true,
  ): void {
    const slide = this.options.deck.slides.find((candidate) => candidate.id === slideId);
    if (!slide) return;
    Object.assign(slide, { animationSteps: steps.map((step) => structuredClone(step)) });
    const row = this.getRow(slideId);
    if (row) this.updateAnimationBadge(row, slide);
    if (refreshPreview) this.refreshSlidePreview(slideId);
  }

  /** Refreshes only one slide image, retaining the existing bitmap until its replacement is ready. */
  public refreshSlidePreview(slideId: string): void {
    if (!this.previewRenderingEnabled) return;
    const row = this.getRow(slideId);
    const host = row?.querySelector<HTMLElement>(".slideshow-sorter__preview") ?? null;
    const slide = this.options.deck.slides.find((candidate) => candidate.id === slideId);
    if (!host || !slide) return;
    this.renderPreview(host, slide, this.renderGeneration);
  }

  /** Returns the currently selected stable slide id. */
  public getSelectedSlideId(): string | null {
    return this.selectedSlideId;
  }

  /** Returns the slide whose inline notes editor is expanded, if any. */
  public getExpandedNotesSlideId(): string | null {
    return this.expandedNotesSlideId;
  }

  /** Returns the current vertical sorter position for preservation across deck refreshes. */
  public getScrollTop(): number {
    return this.options.container.scrollTop ?? 0;
  }

  /** Restores a vertical sorter position after its rows have been rebuilt. */
  public restoreScrollTop(scrollTop: number): void {
    this.options.container.scrollTop = scrollTop;
  }

  /** Scrolls the requested slide row into the visible sorter viewport. */
  public scrollToSlide(
    slideId: string,
    focus = true,
    block: ScrollLogicalPosition = "center",
  ): void {
    const row = Array.from(
      this.options.container.querySelectorAll<HTMLElement>(".slideshow-sorter__row"),
    ).find((candidate) => candidate.dataset.slideId === slideId);
    if (!row) return;
    if (focus) row.focus({ preventScroll: true });
    row.scrollIntoView({ block });
    this.ownerWindow.setTimeout(() => {
      if (row.isConnected) row.scrollIntoView({ block });
    }, 50);
  }

  /** Returns whether notes currently have keyboard focus. */
  public isEditingNotes(): boolean {
    return this.notesTextarea?.ownerDocument.activeElement === this.notesTextarea;
  }

  /** Mirrors an unambiguous canvas selection without taking keyboard focus from the drawing. */
  public async selectFromScene(slideId: string): Promise<void> {
    if (this.options.animationEditingSlideId || this.isEditingNotes()) return;
    if (!this.options.deck.slides.some((slide) => slide.id === slideId)) return;
    if (slideId !== this.selectedSlideId) {
      await this.flushNotes();
      const previousNotesSlideId = this.expandedNotesSlideId;
      this.selectedSlideId = slideId;
      this.expandedNotesSlideId = null;
      this.notesTextarea = null;
      this.options.container.classList.toggle(
        "has-expanded-editor",
        Boolean(this.options.animationEditingSlideId),
      );
      this.updateSelectedRows();
      if (previousNotesSlideId) this.replaceRowPreservingPreview(previousNotesSlideId);
    }
    this.scrollToSlide(slideId, false);
  }

  /** Selects prior stable ids when still present, then renders the sorter. */
  public render(
    preferredSlideId = this.selectedSlideId,
    preferredNotesSlideId = this.expandedNotesSlideId,
  ): void {
    this.renderGeneration += 1;
    const generation = this.renderGeneration;
    const { container, deck } = this.options;
    const scrollTop = container.scrollTop;
    this.previewObserver?.disconnect();
    this.previewObserver = this.previewRenderingEnabled
      ? this.createPreviewObserver(generation)
      : null;
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
    container.classList.toggle(
      "has-expanded-editor",
      Boolean(this.expandedNotesSlideId || this.options.animationEditingSlideId),
    );

    deck.slides.forEach((slide, index) => {
      const row = this.createRow(slide, index);
      container.appendChild(row);
      const previewHost = row.querySelector<HTMLElement>(".slideshow-sorter__preview");
      if (previewHost) {
        previewHost.dataset.slideId = slide.id;
        if (this.previewRenderingEnabled) {
          if (this.previewObserver) this.previewObserver.observe(previewHost);
          else this.renderPreview(previewHost, slide, generation);
        }
      }
    });
    container.scrollTop = scrollTop;
  }

  private createPreviewObserver(
    generation: number,
    allowWhileSuspended = false,
    disconnectAfterCallback = false,
  ): IntersectionObserver | null {
    const Observer = (
      this.ownerWindow as Window & { IntersectionObserver?: typeof IntersectionObserver }
    ).IntersectionObserver;
    if (typeof Observer !== "function") return null;
    return new Observer(
      (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          const host = entry.target as HTMLElement;
          const slide = this.options.deck.slides.find(
            (candidate) => candidate.id === host.dataset.slideId,
          );
          if (slide) this.renderPreview(host, slide, generation, allowWhileSuspended);
        }
        if (disconnectAfterCallback) observer.disconnect();
      },
      { root: this.options.container, rootMargin: "240px 0px" },
    );
  }

  private renderPreview(
    previewHost: HTMLElement,
    slide: SlideDeckSlide,
    generation: number,
    allowWhileSuspended = false,
  ): void {
    if (!this.previewRenderingEnabled && !allowWhileSuspended) return;
    void this.options.previewService
      .createPreview(slide, previewHost.ownerDocument, { targetWidth: 480 })
      .then((preview) => {
        if (
          !preview ||
          (!this.previewRenderingEnabled && !allowWhileSuspended) ||
          generation !== this.renderGeneration ||
          !previewHost.isConnected
        )
          return;
        previewHost.replaceChildren(preview);
      })
      .catch(() => undefined);
  }

  private getRow(slideId: string): HTMLElement | null {
    return (
      Array.from(
        this.options.container.querySelectorAll<HTMLElement>(".slideshow-sorter__row"),
      ).find((row) => row.dataset.slideId === slideId) ?? null
    );
  }

  private getSlideIndex(slideId: string): number {
    return this.options.deck.slides.findIndex((slide) => slide.id === slideId);
  }

  private updateSelectedRows(): void {
    this.options.container
      .querySelectorAll<HTMLElement>(".slideshow-sorter__row")
      .forEach((row) => row.classList.toggle("is-selected", row.dataset.slideId === this.selectedSlideId));
  }

  private replaceRowPreservingPreview(slideId: string): void {
    const row = this.getRow(slideId);
    const index = this.getSlideIndex(slideId);
    const slide = this.options.deck.slides[index];
    if (!row || !slide || index < 0) return;
    const existingPreview = row.querySelector<HTMLElement>(".slideshow-sorter__preview");
    if (existingPreview) this.previewObserver?.unobserve(existingPreview);
    const previewChildren = existingPreview ? Array.from(existingPreview.childNodes) : [];
    const replacement = this.createRow(slide, index);
    const replacementPreview = replacement.querySelector<HTMLElement>(".slideshow-sorter__preview");
    if (replacementPreview && previewChildren.length > 0) {
      replacementPreview.replaceChildren(...previewChildren);
    }
    row.replaceWith(replacement);
    if (replacementPreview && previewChildren.length === 0 && this.previewRenderingEnabled) {
      if (this.previewObserver) this.previewObserver.observe(replacementPreview);
      else this.renderPreview(replacementPreview, slide, this.renderGeneration);
    }
  }

  private updateRowInclusion(row: HTMLElement, slide: SlideDeckSlide): void {
    row.classList.toggle("is-excluded", slide.excluded);
    const button = row.querySelector<HTMLButtonElement>(".slideshow-sorter__toggle-inclusion");
    if (!button) return;
    const label = this.options.t(slide.excluded ? "includeSlide" : "excludeSlide");
    button.innerHTML = slide.excluded ? this.options.icons.eyeOff : this.options.icons.eye;
    button.setAttribute("aria-label", label);
  }

  private updateRowOrderState(row: HTMLElement, slide: SlideDeckSlide, index: number): void {
    const title = row.querySelector<HTMLElement>(".slideshow-sorter__title");
    if (title) {
      const titleText = this.options.t("slideNumberAndTitle", {
        number: index + 1,
        title: slide.title,
      });
      title.textContent = titleText;
      title.title = titleText;
    }
    const up = row.querySelector<HTMLButtonElement>(".slideshow-sorter__move-up");
    const down = row.querySelector<HTMLButtonElement>(".slideshow-sorter__move-down");
    if (up) up.disabled = !this.options.reorderEnabled || index === 0;
    if (down) {
      down.disabled = !this.options.reorderEnabled || index === this.options.deck.slides.length - 1;
    }
  }

  private updateAnimationBadge(row: HTMLElement, slide: SlideDeckSlide): void {
    const badges = row.querySelector<HTMLElement>(".slideshow-sorter__badges");
    if (!badges) return;
    badges.querySelector(".slideshow-sorter__badge--animation")?.remove();
    if (slide.animationSteps.length === 0) return;
    const badge = row.ownerDocument.createElement("span");
    const count = slide.animationSteps.length;
    const label = this.options.t("animationCount", { count });
    badge.className = "slideshow-sorter__badge slideshow-sorter__badge--animation";
    badge.title = label;
    badge.setAttribute("aria-label", label);
    badge.innerHTML = `${this.options.icons.sparkles}<span class="slideshow-sorter__badge-compact-count" aria-hidden="true">${count}</span><span class="slideshow-sorter__badge-text">${label}</span>`;
    badges.appendChild(badge);
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
    row.addEventListener("keydown", (event) => this.handleRowKeydown(event, slide));

    const top = doc.createElement("div");
    top.className = "slideshow-sorter__top";
    const titleRow = doc.createElement("div");
    titleRow.className = "slideshow-sorter__title-row";
    const title = doc.createElement("div");
    title.className = "slideshow-sorter__title";
    const titleText = t("slideNumberAndTitle", { number: index + 1, title: slide.title });
    title.textContent = titleText;
    title.title = titleText;
    titleRow.appendChild(title);
    const editTitleButton = this.createIconButton(
      doc,
      icons.edit,
      t("editSlideName"),
      false,
      () => this.options.callbacks.editSlideName?.(slide),
    );
    editTitleButton.className = "slideshow-sorter__title-edit";
    editTitleButton.draggable = false;
    editTitleButton.addEventListener("dragstart", (event) => event.preventDefault());
    titleRow.appendChild(editTitleButton);
    top.appendChild(titleRow);
    const badges = doc.createElement("div");
    badges.className = "slideshow-sorter__badges";
    if (slide.notes) {
      const badge = doc.createElement("span");
      const label = t("notesPresent");
      badge.className = "slideshow-sorter__badge slideshow-sorter__badge--notes";
      badge.title = label;
      badge.setAttribute("aria-label", label);
      badge.innerHTML = `${icons.notebookPen}<span class="slideshow-sorter__badge-text">${label}</span>`;
      badges.appendChild(badge);
    }
    if (slide.animationSteps.length > 0) {
      const badge = doc.createElement("span");
      const count = slide.animationSteps.length;
      const label = t("animationCount", { count });
      badge.className = "slideshow-sorter__badge slideshow-sorter__badge--animation";
      badge.title = label;
      badge.setAttribute("aria-label", label);
      badge.innerHTML = `${icons.sparkles}<span class="slideshow-sorter__badge-compact-count" aria-hidden="true">${count}</span><span class="slideshow-sorter__badge-text">${label}</span>`;
      badges.appendChild(badge);
    }
    top.appendChild(badges);
    row.appendChild(top);

    if (ea.DEVICE.isDesktop && reorderEnabled) {
      top.draggable = true;
      top.classList.add("is-draggable");
      top.setAttribute("aria-label", t("dragSlide"));
      top.addEventListener("dragstart", (event) => {
        this.selectedSlideId = slide.id;
        this.options.container
          .querySelectorAll<HTMLElement>(".slideshow-sorter__row.is-selected")
          .forEach((selectedRow) => selectedRow.classList.remove("is-selected"));
        row.classList.add("is-selected");
        this.draggedIndex = this.getSlideIndex(slide.id);
        row.classList.add("is-dragging");
        event.dataTransfer?.setData("text/plain", String(index));
        if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
      });
      top.addEventListener("dragend", () => {
        this.finishDrag();
      });
    }

    const content = doc.createElement("div");
    content.className = "slideshow-sorter__content";
    row.appendChild(content);

    const preview = doc.createElement("div");
    preview.className = "slideshow-sorter__preview";
    preview.style.backgroundColor = this.options.previewService.getBackgroundColor();
    preview.style.aspectRatio = this.options.previewService.getAspectRatio();
    content.appendChild(preview);

    const actions = doc.createElement("div");
    actions.className = "slideshow-sorter__actions";
    const moveUpButton = this.createIconButton(
      doc,
      icons.chevronUp,
      t("moveSlideUp"),
      !reorderEnabled || index === 0,
      () => {
        const currentIndex = this.getSlideIndex(slide.id);
        if (currentIndex > 0) void this.options.callbacks.move(currentIndex, currentIndex - 1);
      },
    );
    moveUpButton.classList.add("slideshow-sorter__move-up");
    actions.appendChild(moveUpButton);
    const moveDownButton = this.createIconButton(
      doc,
      icons.chevronDown,
      t("moveSlideDown"),
      !reorderEnabled || index === deck.slides.length - 1,
      () => {
        const currentIndex = this.getSlideIndex(slide.id);
        if (currentIndex >= 0 && currentIndex < this.options.deck.slides.length - 1) {
          void this.options.callbacks.move(currentIndex, currentIndex + 1);
        }
      },
    );
    moveDownButton.classList.add("slideshow-sorter__move-down");
    actions.appendChild(moveDownButton);
    const inclusionButton = this.createIconButton(
      doc,
      slide.excluded ? icons.eyeOff : icons.eye,
      slide.excluded ? t("includeSlide") : t("excludeSlide"),
      false,
      () => void this.options.callbacks.toggleInclusion(slide, !slide.excluded),
    );
    inclusionButton.classList.add("slideshow-sorter__toggle-inclusion");
    actions.appendChild(inclusionButton);
    const animationExpanded = this.options.animationEditingSlideId === slide.id;
    const animationButton = this.createIconButton(
      doc,
      icons.sparkles,
      t("editAnimations"),
      false,
      () => this.options.callbacks.requestAnimationEditor(slide),
    );
    animationButton.classList.toggle("is-active", animationExpanded);
    animationButton.setAttribute("aria-expanded", String(animationExpanded));
    actions.appendChild(animationButton);
    if (slide.kind === "path") {
      actions.appendChild(
        this.createIconButton(doc, icons.edit, t("editLineSlide"), false, () => {
          const currentIndex = this.getSlideIndex(slide.id);
          if (currentIndex >= 0) void this.options.callbacks.editLineSlide(slide, currentIndex);
        }),
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
    if (this.options.animationEditingSlideId === slide.id) {
      const animationHost = doc.createElement("div");
      animationHost.className = "slideshow-sorter__animation";
      row.appendChild(animationHost);
      this.options.callbacks.mountAnimationEditor?.(slide, animationHost);
    }
    return row;
  }

  private handleRowKeydown(event: KeyboardEvent, slide: SlideDeckSlide): void {
    const index = this.getSlideIndex(slide.id);
    if (index < 0) return;
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
        event.preventDefault();
        void this.options.callbacks.toggleInclusion(slide, !slide.excluded);
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
    this.scrollToSlide(slideId, false, "start");
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
    textarea.addEventListener("keydown", (event) => this.handleNotesKeydown(event));
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

  private handleNotesKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (
      !event.defaultPrevented ||
      event.key.length !== 1 ||
      event.metaKey ||
      event.ctrlKey ||
      event.altKey
    ) {
      return;
    }
    const textarea = event.currentTarget as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    textarea.setRangeText(event.key, start, end, "end");
    this.scheduleNotesSave();
  }

  private readonly handleContainerDragOver = (event: DragEvent): void => {
    if (this.draggedIndex === null) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    this.dragPointerX = event.clientX;
    this.dragPointerY = event.clientY;
    this.updateDropTarget(event.clientX, event.clientY);
    this.updateAutoScroll(event.clientY);
  };

  private readonly handleContainerDragLeave = (event: DragEvent): void => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget && this.options.container.contains(relatedTarget as Node)) return;
    this.clearDropIndicator();
    this.stopAutoScroll();
  };

  private readonly handleContainerDrop = (event: DragEvent): void => {
    if (this.draggedIndex === null) return;
    event.preventDefault();
    const fromIndex = this.draggedIndex;
    const insertionIndex = this.dropTargetIndex;
    this.finishDrag();
    if (insertionIndex === null) return;
    const target = getDropMoveTarget(fromIndex, insertionIndex, this.options.deck.slides.length);
    if (target !== null) void this.options.callbacks.move(fromIndex, target);
  };

  private updateDropTarget(pointerX: number, pointerY: number): void {
    const rows = Array.from(
      this.options.container.querySelectorAll<HTMLElement>(".slideshow-sorter__row"),
    );
    const rowRects = rows.map((row) => row.getBoundingClientRect());
    const insertionIndex = getDropInsertionIndexFromRects(rowRects, pointerX, pointerY);
    const placement = getDropIndicatorPlacement(rowRects, insertionIndex);
    const indicatorKey = [
      insertionIndex,
      placement.beforeIndex ?? "none",
      placement.afterIndex ?? "none",
      placement.singleColumn ? 1 : 0,
    ].join(":");
    this.options.container.classList.toggle("is-single-column", placement.singleColumn);
    if (indicatorKey === this.dropIndicatorKey) return;

    this.clearDropIndicator();
    this.dropTargetIndex = insertionIndex;
    this.dropIndicatorKey = indicatorKey;
    if (placement.beforeIndex !== null) {
      rows[placement.beforeIndex]?.classList.add("is-drop-before");
    }
    if (placement.afterIndex !== null) {
      rows[placement.afterIndex]?.classList.add("is-drop-after");
    }
  }

  private clearDropIndicator(): void {
    const rows =
      this.options.container.querySelectorAll?.<HTMLElement>(".is-drop-before, .is-drop-after") ??
      [];
    rows.forEach((row) => row.classList.remove("is-drop-before", "is-drop-after"));
    this.dropTargetIndex = null;
    this.dropIndicatorKey = null;
  }

  private updateAutoScroll(pointerY: number): void {
    const rect = this.options.container.getBoundingClientRect();
    this.autoScrollVelocity = getDragAutoScrollVelocity(pointerY, rect.top, rect.bottom);
    if (this.autoScrollVelocity === 0) {
      this.stopAutoScroll();
      return;
    }
    if (!this.autoScrollFrame) {
      this.autoScrollFrame = this.ownerWindow.requestAnimationFrame(this.runAutoScroll);
    }
  }

  private readonly runAutoScroll = (): void => {
    this.autoScrollFrame = 0;
    if (this.draggedIndex === null || this.autoScrollVelocity === 0) return;
    const previousScrollTop = this.options.container.scrollTop;
    this.options.container.scrollTop += this.autoScrollVelocity;
    if (this.options.container.scrollTop === previousScrollTop) {
      this.autoScrollVelocity = 0;
      return;
    }
    if (this.dragPointerX !== null && this.dragPointerY !== null) {
      this.updateDropTarget(this.dragPointerX, this.dragPointerY);
    }
    this.autoScrollFrame = this.ownerWindow.requestAnimationFrame(this.runAutoScroll);
  };

  private stopAutoScroll(): void {
    if (this.autoScrollFrame) this.ownerWindow.cancelAnimationFrame(this.autoScrollFrame);
    this.autoScrollFrame = 0;
    this.autoScrollVelocity = 0;
  }

  private finishDrag(): void {
    this.stopAutoScroll();
    this.clearDropIndicator();
    const rows =
      this.options.container.querySelectorAll?.<HTMLElement>(
        ".slideshow-sorter__row.is-dragging",
      ) ?? [];
    rows.forEach((row) => row.classList.remove("is-dragging"));
    this.draggedIndex = null;
    this.dragPointerX = null;
    this.dragPointerY = null;
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
    const slideId = this.expandedNotesSlideId;
    const current = this.notesTextarea?.value;
    if (!slideId || current === undefined) return;
    const previousSave = this.notesSaveInFlight;
    const save = (async () => {
      await previousSave?.catch(() => undefined);
      const slide = this.options.deck.slides.find((candidate) => candidate.id === slideId);
      if (!slide || current === (slide.notes ?? "")) return;
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
    this.previewObserver?.disconnect();
    this.previewObserver = null;
    if (this.notesTimer) this.ownerWindow.clearTimeout(this.notesTimer);
    this.notesTimer = 0;
    this.notesTextarea = null;
    this.finishDrag();
    this.options.container.removeEventListener?.("dragover", this.handleContainerDragOver);
    this.options.container.removeEventListener?.("dragleave", this.handleContainerDragLeave);
    this.options.container.removeEventListener?.("drop", this.handleContainerDrop);
  }
}
