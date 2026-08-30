/**
 * @file PresentationControls.ts
 * @overview Slideshow navigation panel, fade behavior, and drag interaction.
 */

/* eslint-disable max-lines-per-function -- The toolbar is kept in visual order to preserve the legacy control layout. */

import type { SlideshowTranslator } from "./lang";
import type { PresentationPathType, SlideshowIcons } from "./types";

export interface PresentationControlCallbacks {
  previous(): void;
  next(): void;
  navigateToSlide(slideNumber: number): void;
  toggleLaser(): boolean;
  refocus(): void;
  toggleFullscreen(): void;
  togglePathVisibility(hidden: boolean): void;
  editSlide(): void;
  switchPresentation(): void;
  openSidepanel(): void;
  print(event: MouseEvent): void;
  finish(): void;
}

export interface PresentationControlsOptions {
  ea: ExcalidrawAutomate;
  ownerWindow: Window;
  ownerDocument: Document;
  contentElement: ScriptContentElement;
  slidesCount: number;
  pathType: PresentationPathType;
  alternatePresentationType: PresentationPathType | null;
  slideTitles: readonly string[];
  shouldOfferPathVisibility: boolean;
  isPathHidden: boolean;
  isFullscreen: boolean;
  fadeLevel: number;
  transitionDelay: number;
  printSlideWidth: number;
  printSlideHeight: number;
  icons: SlideshowIcons;
  t: SlideshowTranslator;
  callbacks: PresentationControlCallbacks;
}

/** Owns the presentation control panel and all panel-local event listeners. */
export class PresentationControls {
  private panel: HTMLDivElement | null = null;
  private select: HTMLSelectElement | null = null;
  private fullscreenButton: HTMLButtonElement | null = null;
  private fadeTimeout = 0;
  private posX1 = 0;
  private posY1 = 0;
  private posX2 = 0;
  private posY2 = 0;

  public constructor(private readonly options: PresentationControlsOptions) {}

  /** Creates and attaches the complete slideshow toolbar. */
  public create(): void {
    const {
      contentElement,
      slidesCount,
      pathType,
      alternatePresentationType,
      slideTitles,
      shouldOfferPathVisibility,
      isPathHidden,
      printSlideWidth,
      printSlideHeight,
      ea,
      callbacks,
      icons,
      t,
      ownerDocument,
    } = this.options;
    const excalidrawContainer = contentElement.querySelector<HTMLElement>(".excalidraw");
    if (!excalidrawContainer) {
      throw new Error("Could not find the Excalidraw container for slideshow controls.");
    }

    const top = contentElement.innerHeight;
    const left = contentElement.innerWidth / 2;
    this.panel = excalidrawContainer.createDiv({
      cls: ["excalidraw-presentation-panel"],
      attr: {
        style: `
          width: fit-content;
          z-index:5;
          position: absolute;
          top:calc(${top}px - var(--default-button-size)*2);
          left:calc(${left}px - var(--default-button-size)*5);`,
      },
    });
    this.setFadeTimeout(this.options.transitionDelay * 3);

    const panelColumn = this.panel.createDiv({ cls: "panelColumn" });
    panelColumn.createDiv(
      {
        cls: ["Island", "buttonList"],
        attr: {
          style: `
            max-width: unset;
            justify-content: space-between;
            height: calc(var(--default-button-size)*1.5);
            width: 100%;
            background: var(--island-bg-color);
            display: flex;
            align-items: center;`,
        },
      },
      (buttonList) => {
        buttonList.createEl("style", { text: " select:focus { box-shadow: var(--input-shadow);} " });
        buttonList.createEl(
          "button",
          {
            attr: {
              style: "margin-left: calc(var(--default-button-size)*0.25);",
              "aria-label": t("previousSlide"),
              title: t("previousSlide"),
            },
          },
          (button) => {
            button.innerHTML = icons.leftArrow;
            button.onclick = callbacks.previous;
          },
        );

        this.select = buttonList.createEl(
          "select",
          {
            attr: {
              style: `
                font-size: inherit;
                background-color: var(--island-bg-color);
                border: none;
                color: var(--color-gray-100);
                cursor: pointer;`,
              title: t("navigateToSlide"),
            },
          },
          (selectElement) => {
            for (let index = 0; index < slidesCount; index += 1) {
              const option = ownerDocument.createElement("option");
              option.text = t("presentationSlideTitle", {
                title: slideTitles[index] ?? t("slideLabel", { number: index + 1 }),
                number: index + 1,
                total: slidesCount,
              });
              option.value = String(index + 1);
              selectElement.add(option);
            }
            selectElement.addEventListener("change", () => {
              const selectedSlideNumber = Number.parseInt(selectElement.value, 10);
              selectElement.blur();
              callbacks.navigateToSlide(selectedSlideNumber);
            });
          },
        );

        buttonList.createEl(
          "button",
          { attr: { title: t("nextSlide"), "aria-label": t("nextSlide") } },
          (button) => {
            button.innerHTML = icons.rightArrow;
            button.onclick = callbacks.next;
          },
        );
        buttonList.createDiv({
          attr: {
            style: `
              width: 1px;
              height: var(--default-button-size);
              background-color: var(--default-border-color);
              margin: 0px auto;`,
          },
        });

        buttonList.createEl(
          "button",
          { attr: { title: t("toggleLaser"), "aria-label": t("toggleLaser") } },
          (button) => {
            button.innerHTML = icons.laserOff;
            button.onclick = () => {
              const laserIsOn = callbacks.toggleLaser();
              button.innerHTML = laserIsOn ? icons.laserOn : icons.laserOff;
            };
          },
        );
        buttonList.createEl(
          "button",
          { attr: { title: t("refocusSlide"), "aria-label": t("refocusSlide") } },
          (button) => {
            button.innerHTML = icons.refocus;
            button.onclick = callbacks.refocus;
          },
        );
        buttonList.createEl(
          "button",
          { attr: { title: t("toggleFullscreen"), "aria-label": t("toggleFullscreen") } },
          (button) => {
            this.fullscreenButton = button;
            button.innerHTML = this.options.isFullscreen ? icons.minimize : icons.maximize;
            button.onclick = callbacks.toggleFullscreen;
          },
        );

        if (pathType === "line") {
          if (shouldOfferPathVisibility) {
            new ea.obsidian.ToggleComponent(buttonList)
              .setValue(isPathHidden)
              .onChange((value: boolean) => callbacks.togglePathVisibility(value))
              .toggleEl.setAttribute("title", t("pathVisibility"));
          }
          buttonList.createEl(
            "button",
            { attr: { title: t("editSlide"), "aria-label": t("editSlide") } },
            (button) => {
              button.innerHTML = icons.edit;
              button.onclick = callbacks.editSlide;
            },
          );
        }

        if (alternatePresentationType) {
          const switchLabel =
            alternatePresentationType === "frame"
              ? t("switchToFrameSlideshow")
              : t("switchToLineSlideshow");
          buttonList.createEl(
            "button",
            { attr: { title: switchLabel, "aria-label": switchLabel } },
            (button) => {
              button.innerHTML = icons.switchPresentation;
              button.onclick = callbacks.switchPresentation;
            },
          );
        }

        buttonList.createEl(
          "button",
          { attr: { title: t("openPanelEndsPresentation"), "aria-label": t("openSlideshowPanel") } },
          (button) => {
            button.innerHTML = icons.settings;
            button.onclick = callbacks.openSidepanel;
          },
        );

        if (ea.DEVICE.isDesktop) {
          buttonList.createEl(
            "button",
            {
              attr: {
                style: "margin-right: calc(var(--default-button-size)*0.25);",
                title: t("printPdf", { width: printSlideWidth, height: printSlideHeight }),
                "aria-label": t("printPdf", { width: printSlideWidth, height: printSlideHeight }),
              },
            },
            (button) => {
              button.innerHTML = icons.printer;
              button.onclick = callbacks.print;
            },
          );
        }
        buttonList.createEl(
          "button",
          {
            attr: {
              style: "margin-right: calc(var(--default-button-size)*0.25);",
              title: t("endPresentation"),
              "aria-label": t("endPresentation"),
            },
          },
          (button) => {
            button.innerHTML = icons.finish;
            button.onclick = callbacks.finish;
          },
        );
      },
    );

    this.panel.addEventListener("pointerdown", this.onPointerDown, false);
    this.panel.addEventListener("mouseenter", this.onMouseEnter, false);
    this.panel.addEventListener("mouseleave", this.onMouseLeave, false);
    this.options.ownerWindow.addEventListener("pointerup", this.onPointerUp, false);
  }

  /** Repositions the panel and restores the current slide's viewport. */
  public resetPosition(): void {
    if (!this.panel) return;
    const top = this.options.contentElement.innerHeight;
    const left = this.options.contentElement.innerWidth / 2;
    this.panel.style.top = `calc(${top}px - var(--default-button-size)*2)`;
    this.panel.style.left = `calc(${left}px - var(--default-button-size)*5)`;
    this.options.callbacks.refocus();
  }

  /** Updates the slide picker to the one-based slide number. */
  public setSelectedSlide(slideNumber: number): void {
    if (this.select) this.select.value = String(slideNumber);
  }

  /** Updates the fullscreen button without rebuilding the toolbar. */
  public setFullscreen(fullscreen: boolean): void {
    if (this.fullscreenButton) {
      this.fullscreenButton.innerHTML = fullscreen ? this.options.icons.minimize : this.options.icons.maximize;
    }
  }

  /** Removes the panel and every event listener owned by it. */
  public destroy(): void {
    this.clearFadeTimeout();
    this.options.ownerWindow.removeEventListener("pointermove", this.onDrag, true);
    this.options.ownerWindow.removeEventListener("pointerup", this.onPointerUp, false);
    this.panel?.removeEventListener("pointerdown", this.onPointerDown, false);
    this.panel?.removeEventListener("mouseenter", this.onMouseEnter, false);
    this.panel?.removeEventListener("mouseleave", this.onMouseLeave, false);
    this.panel?.parentElement?.removeChild(this.panel);
    this.panel = null;
    this.select = null;
    this.fullscreenButton = null;
  }

  private setFadeTimeout(delay = this.options.transitionDelay): void {
    this.fadeTimeout = this.options.ownerWindow.setTimeout(() => {
      this.fadeTimeout = 0;
      if (this.options.ownerDocument.activeElement === this.select) {
        this.setFadeTimeout(delay);
        return;
      }
      if (this.panel) this.panel.style.opacity = String(this.options.fadeLevel);
    }, delay);
  }

  private clearFadeTimeout(): void {
    if (this.fadeTimeout) {
      this.options.ownerWindow.clearTimeout(this.fadeTimeout);
      this.fadeTimeout = 0;
    }
    if (this.panel) this.panel.style.opacity = "1";
  }

  private readonly onPointerUp = (): void => {
    this.options.ownerWindow.removeEventListener("pointermove", this.onDrag, true);
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.clearFadeTimeout();
    this.setFadeTimeout();
    this.posX2 = event.clientX;
    this.posY2 = event.clientY;
    this.options.ownerWindow.addEventListener("pointermove", this.onDrag, true);
  };

  private readonly onDrag = (event: PointerEvent): void => {
    event.preventDefault();
    this.posX1 = this.posX2 - event.clientX;
    this.posY1 = this.posY2 - event.clientY;
    this.posX2 = event.clientX;
    this.posY2 = event.clientY;
    this.updatePosition(this.posY1, this.posX1);
  };

  private updatePosition(deltaY = 0, deltaX = 0): void {
    if (!this.panel) return;
    this.panel.style.top = `${this.panel.offsetTop - deltaY}px`;
    this.panel.style.left = `${this.panel.offsetLeft - deltaX}px`;
  }

  private readonly onMouseEnter = (): void => this.clearFadeTimeout();
  private readonly onMouseLeave = (): void => this.setFadeTimeout();
}
