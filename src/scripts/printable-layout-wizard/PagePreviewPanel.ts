import type { PageFrame } from "./frames";
import type { WizardTranslator } from "./lang";
import { PagePreviewService } from "./PagePreviewService";
import { describePrintPages, selectPrintablePages, type PrintPages } from "./printPages";

/** One preview card whose bitmap survives range, inclusion and margin changes. */
interface PageCard {
  frame: PageFrame;
  element: HTMLElement;
  paper: HTMLElement;
  imageHost: HTMLElement;
}

/** Responsive, visible-only page thumbnails; owns its observer and scene subscription. */
export class PagePreviewPanel {
  private pages: PrintPages = { frames: [], emptyIds: new Set() };
  private readonly cards: PageCard[] = [];
  private observer: IntersectionObserver | undefined;
  private unsubscribe: (() => void) | undefined;
  private timer: number | undefined;
  private generation = 0;
  private closed = false;
  private ranges = "";
  private printEmpty = false;
  private margin = 0;
  private readonly grid: HTMLElement;

  public constructor(
    private readonly options: {
      host: HTMLElement;
      ea: ExcalidrawAutomate;
      api: ExcalidrawAPI;
      previews: PagePreviewService;
      markersOnly: boolean;
      t: WizardTranslator;
      onSelection: (count: number, invalid: boolean) => void;
    },
  ) {
    this.grid = options.host.createDiv({
      cls: "printable-layout-previews",
      attr: { role: "list", "aria-label": options.t("preview") },
    });
    this.grid.setCssStyles({
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 140px), 1fr))",
      gap: "12px",
      maxHeight: "min(260px, 32vh)",
      overflowY: "auto",
      padding: "4px",
    });
    this.refresh();
    let previous = options.ea.getViewElements();
    let previousTheme = options.api.getAppState().theme;
    let previousBackground = options.api.getAppState().viewBackgroundColor;
    this.unsubscribe = options.api.onChange((elements, state) => {
      if (
        elements.length === previous.length &&
        elements.every((el, i) => el === previous[i]) &&
        state.theme === previousTheme &&
        state.viewBackgroundColor === previousBackground
      )
        return;
      previous = elements;
      previousTheme = state.theme;
      previousBackground = state.viewBackgroundColor;
      if (this.timer !== undefined) window.clearTimeout(this.timer);
      this.timer = window.setTimeout(() => {
        this.timer = undefined;
        if (!this.closed) this.refresh();
      }, 120);
    });
  }

  /** Updates inclusion without decoding or rebuilding any thumbnail. */
  public setSelection(ranges: string, printEmpty: boolean): void {
    this.ranges = ranges;
    this.printEmpty = printEmpty;
    this.updateSelection();
  }

  /** Shows the same content inset used by PDF fit-to-page margins, without new PNG exports. */
  public setMargin(margin: number): void {
    this.margin = margin;
    for (const card of this.cards) this.applyMargin(card);
  }

  /** Reclassifies the current scene and lazily regenerates only changed, visible crops. */
  public refresh(): void {
    this.observer?.disconnect();
    this.options.previews.cancelPending();
    const generation = ++this.generation;
    const scrollTop = this.grid.scrollTop;
    this.grid.empty();
    this.cards.length = 0;
    this.pages = describePrintPages(
      this.options.ea,
      this.options.ea.getViewElements(),
      this.options.markersOnly,
    );
    for (const [index, frame] of this.pages.frames.entries()) {
      const element = this.grid.createDiv({
        cls: "printable-layout-page",
        attr: { role: "listitem" },
      });
      element.dataset.pageNumber = String(index + 1);
      element.setCssStyles({
        minWidth: "0",
        padding: "6px",
        border: "2px solid var(--background-modifier-border)",
        borderRadius: "6px",
      });
      const paper = element.createDiv();
      paper.setCssStyles({
        position: "relative",
        aspectRatio: `${frame.width} / ${frame.height}`,
        backgroundColor: "#ffffff",
        overflow: "hidden",
        border: "1px solid var(--background-modifier-border)",
      });
      const imageHost = paper.createDiv();
      imageHost.setCssStyles({
        position: "absolute",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      });
      element.createDiv({
        text: this.options.t("previewPage", { number: index + 1, name: frame.name ?? "" }),
        cls: "setting-item-description",
      });
      if (this.pages.emptyIds.has(frame.id))
        element.createDiv({ text: this.options.t("emptyPage"), cls: "setting-item-description" });
      const card = { frame, element, paper, imageHost };
      this.cards.push(card);
      this.applyMargin(card);
    }
    this.grid.scrollTop = scrollTop;
    this.updateSelection();
    const owner = this.grid.ownerDocument.defaultView as
      (Window & { IntersectionObserver?: typeof IntersectionObserver }) | null;
    if (owner?.IntersectionObserver) {
      this.observer = new owner.IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting) {
              this.observer?.unobserve(entry.target);
              const card = this.cards.find((candidate) => candidate.element === entry.target);
              if (card) this.renderPreview(card, generation);
            }
        },
        { root: this.grid, rootMargin: "120px" },
      );
      this.cards.forEach((card) => this.observer!.observe(card.element));
    } else this.cards.slice(0, 8).forEach((card) => this.renderPreview(card, generation));
  }

  /** Detaches all activity before the panel's DOM is removed. */
  public destroy(): void {
    this.closed = true;
    this.generation++;
    this.observer?.disconnect();
    this.unsubscribe?.();
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.options.previews.cancelPending();
  }

  /** Matches PDF's centered contain fit inside all four physical margins. */
  private applyMargin(card: PageCard): void {
    const horizontal = Math.min(50, (this.margin / Math.max(card.frame.width, 1)) * 100);
    const vertical = Math.min(50, (this.margin / Math.max(card.frame.height, 1)) * 100);
    card.imageHost.setCssStyles({
      left: `${horizontal}%`,
      right: `${horizontal}%`,
      top: `${vertical}%`,
      bottom: `${vertical}%`,
    });
  }

  /** Mirrors the exporter selection in borders/counts; invalid input cannot reach PDF export. */
  private updateSelection(): void {
    let selected: PageFrame[] = [];
    let invalid = false;
    try {
      selected = selectPrintablePages(this.pages, this.ranges, this.printEmpty);
    } catch {
      invalid = true;
    }
    const ids = new Set(selected.map((frame) => frame.id));
    for (const card of this.cards) {
      const included = ids.has(card.frame.id);
      card.element.dataset.included = String(included);
      card.element.setCssStyles({
        opacity: included ? "1" : "0.45",
        borderColor: included ? "var(--interactive-accent)" : "var(--background-modifier-border)",
      });
    }
    this.options.onSelection(selected.length, invalid);
  }

  /** Installs a bitmap only while this exact panel generation is still mounted. */
  private renderPreview(card: PageCard, generation: number): void {
    void this.options.previews
      .get(card.frame)
      .then((preview) => {
        if (!preview || this.closed || generation !== this.generation) return;
        const image = card.imageHost.createEl("img", { attr: { alt: "", "aria-hidden": "true" } });
        image.src = preview.objectUrl;
        image.decoding = "async";
        image.draggable = false;
        image.setCssStyles({
          width: "100%",
          height: "100%",
          objectFit: "contain",
          backgroundColor: preview.backgroundColor,
        });
      })
      .catch(() => {
        if (!this.closed && generation === this.generation)
          card.imageHost.setText(this.options.t("previewFailed"));
      });
  }
}
