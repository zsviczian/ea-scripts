/**
 * @file SlideshowController.ts
 * @overview Coordinates slideshow lifecycle, navigation, fullscreen, and cleanup.
 */

/* eslint-disable complexity, max-lines-per-function -- Presentation transitions are intentionally kept in legacy execution order. */

import { getNavigationRect, type NavigationRect } from "../../sharedUtils/presentationGeometry";
import { sleepInWindow } from "../../sharedUtils/windowTiming";
import { PresentationControls } from "./PresentationControls";
import type { SlideshowTranslator } from "./lang";
import { printSlideshowToPdf } from "./printToPdf";
import { upgradeLineSlideshowData, writeSlideshowMetadata } from "./slideshowMetadata";
import {
  type Direction,
  type EditableLinearElement,
  type PresentationSetup,
  type SlideshowConfig,
  type SlideshowIcons,
} from "./types";

export interface SlideshowControllerOptions {
  ea: ExcalidrawAutomate;
  api: ExcalidrawAPI;
  hostView: ScriptExcalidrawView;
  statusBarElement: HTMLElement | null;
  setup: PresentationSetup;
  alternatePresentationType: "line" | "frame" | null;
  config: SlideshowConfig;
  icons: SlideshowIcons;
  initialSlide: number;
  startFullscreen: boolean;
  t: SlideshowTranslator;
  openSidepanel(): Promise<void>;
  switchPresentation(presentationType: "line" | "frame", startFullscreen: boolean): Promise<void>;
}

/** Owns one active presentation from setup through restoration. */
export class SlideshowController {
  private readonly ea: ExcalidrawAutomate;
  private readonly api: ExcalidrawAPI;
  private readonly hostView: ScriptExcalidrawView;
  private readonly hostLeaf: ScriptWorkspaceLeaf;
  private readonly ownerWindow: Window;
  private readonly ownerDocument: Document;
  private readonly contentElement: ScriptContentElement;
  private readonly setup: PresentationSetup;
  private readonly alternatePresentationType: "line" | "frame" | null;
  private readonly config: SlideshowConfig;
  private readonly icons: SlideshowIcons;
  private readonly statusBarElement: HTMLElement | null;
  private readonly shouldStartFullscreen: boolean;
  private readonly t: SlideshowTranslator;
  private readonly openSidepanel: () => Promise<void>;
  private readonly switchPresentation: (
    presentationType: "line" | "frame",
    startFullscreen: boolean,
  ) => Promise<void>;
  private controls: PresentationControls | null = null;
  private slide: number;
  private isFullscreen = false;
  private isLaserOn = false;
  private shouldSaveAfterPresentation = false;
  private busy = false;
  private preventFullscreenExit = true;

  public constructor(options: SlideshowControllerOptions) {
    this.ea = options.ea;
    this.api = options.api;
    this.hostView = options.hostView;
    this.hostLeaf = options.hostView.leaf;
    this.ownerWindow = options.hostView.ownerWindow;
    this.ownerDocument = options.hostView.ownerDocument;
    this.contentElement = options.hostView.contentEl;
    this.setup = options.setup;
    this.alternatePresentationType = options.alternatePresentationType;
    this.config = options.config;
    this.icons = options.icons;
    this.statusBarElement = options.statusBarElement;
    this.slide = Math.min(Math.max(options.initialSlide, 0), Math.max(options.setup.slides.length - 1, 0));
    this.shouldStartFullscreen = options.startFullscreen;
    this.t = options.t;
    this.openSidepanel = options.openSidepanel;
    this.switchPresentation = options.switchPresentation;
  }

  /** Starts the presentation and installs all temporary UI and handlers. */
  public async start(): Promise<void> {
    if (this.statusBarElement) {
      this.statusBarElement.style.display = "none";
    }
    this.ea.setViewModeEnabled(true);
    const helpButton = this.hostView.excalidrawContainer?.querySelector(
      ".ToolIcon__icon.help-icon",
    );
    if (helpButton) {
      (helpButton as HTMLElement).style.display = "none";
    }
    const zoomButton = this.hostView.excalidrawContainer?.querySelector(
      ".Stack.Stack_vertical.zoom-actions",
    );
    if (zoomButton) {
      (zoomButton as HTMLElement).style.display = "none";
    }

    this.createControls();
    this.initializeEventListeners();
    if (this.shouldStartFullscreen) {
      await this.gotoFullscreen();
    } else {
      this.controls?.resetPosition();
    }
    if (this.setup.pathType === "line") {
      await this.togglePathVisibility(this.setup.isHidden);
    }
    this.ea.targetView?.clearDirty();
  }

  private createControls(): void {
    this.controls = new PresentationControls({
      ea: this.ea,
      ownerWindow: this.ownerWindow,
      ownerDocument: this.ownerDocument,
      contentElement: this.contentElement,
      slidesCount: this.setup.slides.length,
      pathType: this.setup.pathType,
      alternatePresentationType: this.alternatePresentationType,
      slideTitles: this.setup.slideTitles,
      shouldOfferPathVisibility: this.setup.shouldHidePathAfterPresentation,
      isPathHidden: this.setup.isHidden,
      isFullscreen: this.isFullscreen,
      fadeLevel: this.config.fadeLevel,
      transitionDelay: this.config.transitionDelay,
      printSlideWidth: this.config.printSlideWidth,
      printSlideHeight: this.config.printSlideHeight,
      icons: this.icons,
      t: this.t,
      callbacks: {
        previous: () => void this.navigate("bkwd"),
        next: () => void this.navigate("fwd"),
        navigateToSlide: (slideNumber) => this.navigateToSlide(slideNumber),
        toggleLaser: () => this.toggleLaser(),
        refocus: () => this.refocus(),
        toggleFullscreen: () => void this.toggleFullscreen(),
        togglePathVisibility: (hidden) => {
          this.shouldSaveAfterPresentation = true;
          if (hidden) {
            this.api.setToast({
              message: this.t("pathWillRemainHidden"),
              duration: 5000,
              closable: true,
            });
          }
          void this.togglePathVisibility(hidden, true);
        },
        editSlide: () => {
          if (this.setup.shouldHidePathAfterPresentation) {
            void this.togglePathVisibility(false);
          }
          void this.exit(true);
        },
        switchPresentation: () => void this.switchToAlternatePresentation(),
        openSidepanel: () => {
          void this.exit().then(() => this.openSidepanel());
        },
        print: (event) => void this.print(event),
        finish: () => void this.exit(),
      },
    });
    this.controls.create();
  }

  private async switchToAlternatePresentation(): Promise<void> {
    if (!this.alternatePresentationType) return;
    const startFullscreen = this.isFullscreen;
    const alternate = this.alternatePresentationType;
    await this.exit();
    await this.switchPresentation(alternate, startFullscreen);
  }

  private toggleLaser(): boolean {
    this.isLaserOn = !this.isLaserOn;
    this.api.setActiveTool({ type: this.isLaserOn ? "laser" : "selection" });
    return this.isLaserOn;
  }

  private refocus(): void {
    this.slide -= 1;
    void this.navigate("fwd");
  }

  private async waitForExcalidrawResize(): Promise<void> {
    await sleepInWindow(this.ownerWindow, 100);
    const deltaWidth = (): number =>
      Math.abs(this.contentElement.clientWidth - this.api.getAppState().width);
    const deltaHeight = (): number =>
      Math.abs(this.contentElement.clientHeight - this.api.getAppState().height);
    let watchdog = 0;
    while ((deltaWidth() > 50 || deltaHeight() > 50) && watchdog++ < 20) {
      await sleepInWindow(this.ownerWindow, 50);
    }
  }

  private async gotoFullscreen(): Promise<void> {
    if (this.isFullscreen) {
      return;
    }
    this.preventFullscreenExit = true;
    if (this.ea.DEVICE.isMobile) {
      this.ea.viewToggleFullScreen();
    } else {
      await this.contentElement.webkitRequestFullscreen();
    }
    await this.waitForExcalidrawResize();
    const layerUiWrapper = this.contentElement.querySelector(".layer-ui__wrapper");
    if (!layerUiWrapper?.hasClass("excalidraw-hidden")) {
      layerUiWrapper?.addClass("excalidraw-hidden");
    }
    this.controls?.setFullscreen(true);
    this.controls?.resetPosition();
    this.isFullscreen = true;
  }

  private async exitFullscreen(): Promise<void> {
    if (!this.isFullscreen) {
      return;
    }
    this.preventFullscreenExit = true;
    if (!this.ea.DEVICE.isMobile && this.ownerDocument.fullscreenElement) {
      await this.ownerDocument.exitFullscreen();
    }
    if (this.ea.DEVICE.isMobile) {
      this.ea.viewToggleFullScreen();
    }
    this.controls?.setFullscreen(false);
    await this.waitForExcalidrawResize();
    this.controls?.resetPosition();
    this.isFullscreen = false;
  }

  private async toggleFullscreen(): Promise<void> {
    if (this.isFullscreen) {
      await this.exitFullscreen();
    } else {
      await this.gotoFullscreen();
    }
  }

  private async togglePathVisibility(
    setToHidden: boolean,
    isMetadataEdit = false,
  ): Promise<void> {
    const pathElement = this.setup.pathElement;
    const originalProps = this.setup.originalPathProperties;
    if (!pathElement || !originalProps) {
      return;
    }
    this.ea.clear();
    this.ea.copyViewElementsToEAforEditing(
      this.ea.getViewElements().filter((element) => element.id === pathElement.id),
    );
    const element = this.ea.getElement<ExcalidrawLinearElement>(
      pathElement.id,
    ) as EditableLinearElement | null;
    if (!element) {
      return;
    }
    element.strokeColor = "transparent";
    element.backgroundColor = "transparent";
    const shouldRemainHidden = setToHidden && this.setup.shouldHidePathAfterPresentation;
    if (shouldRemainHidden) {
      element.locked = true;
    }
    if (isMetadataEdit) {
      const metadata = upgradeLineSlideshowData(
        element.customData,
        element.id,
        Math.floor(element.points.length / 2),
        originalProps,
      );
      metadata.hidden = shouldRemainHidden;
      writeSlideshowMetadata(this.ea, element.id, metadata);
    }
    this.setup.isHidden = shouldRemainHidden;
    await this.ea.addElementsToView();
  }

  private getNextSlideRect(forward: boolean): NavigationRect {
    this.slide = forward
      ? this.slide < this.setup.slides.length - 1
        ? this.slide + 1
        : 0
      : this.slide <= 0
        ? this.setup.slides.length - 1
        : this.slide - 1;
    const targetSlide = this.setup.slides[this.slide];
    if (!targetSlide) {
      throw new Error(this.t("invalidSlide"));
    }
    const appState = this.api.getAppState();
    return getNavigationRect(
      targetSlide,
      { width: appState.width, height: appState.height },
      this.config.maxZoom,
    );
  }

  private async scrollToRect(
    rect: NavigationRect,
    steps = this.config.transitionStepCount,
  ): Promise<void> {
    const startTimer = Date.now();
    let watchdog = 0;
    while (this.busy && watchdog++ < 15) {
      await sleepInWindow(this.ownerWindow, 100);
    }
    if (this.busy && watchdog >= 15) {
      return;
    }
    this.busy = true;
    this.api.updateScene({ appState: { shouldCacheIgnoreZoom: true } });
    const { scrollX, scrollY, zoom } = this.api.getAppState();
    const zoomStep = (zoom.value - rect.nextZoom) / steps;
    const xStep = (rect.left + scrollX) / steps;
    const yStep = (rect.top + scrollY) / steps;
    let index = 1;
    while (index <= steps) {
      this.api.updateScene({
        appState: {
          scrollX: scrollX - xStep * index,
          scrollY: scrollY - yStep * index,
          zoom: {
            value: (zoom.value - zoomStep * index) as typeof zoom.value,
          },
        },
      });
      const elapsed = Date.now() - startTimer;
      if (elapsed > this.config.transitionDelay) {
        index = index < steps ? steps : steps + 1;
      } else {
        const timeProgress = elapsed / this.config.transitionDelay;
        index = Math.min(Math.round(steps * timeProgress), steps);
        await sleepInWindow(this.ownerWindow, this.config.frameSleep);
      }
    }
    this.api.updateScene({ appState: { shouldCacheIgnoreZoom: false } });
    if (this.isLaserOn) {
      this.api.setActiveTool({ type: "laser" });
    }
    this.busy = false;
  }

  private async navigate(direction: Direction): Promise<void> {
    const forward = direction === "fwd";
    const previousSlide = this.slide;
    const nextRect = this.getNextSlideRect(forward);
    const shouldExit = forward ? this.slide <= previousSlide : this.slide >= previousSlide;
    if (shouldExit) {
      void this.exit();
      return;
    }
    this.controls?.setSelectedSlide(this.slide + 1);
    await this.scrollToRect(nextRect);
    const targetView = this.ea.targetView;
    if (
      window.ExcalidrawSlideshow &&
      targetView &&
      typeof window.ExcalidrawSlideshow.slide[targetView.file.path] === "number"
    ) {
      window.ExcalidrawSlideshow.slide[targetView.file.path] = this.slide;
    }
  }

  private navigateToSlide(slideNumber: number): void {
    const boundedSlide = Math.min(Math.max(slideNumber, 1), this.setup.slides.length);
    this.slide = boundedSlide - 2;
    void this.navigate("fwd");
  }

  private readonly keydownListener = (event: KeyboardEvent): void => {
    if (this.hostLeaf !== app.workspace.activeLeaf) {
      return;
    }
    if (this.hostLeaf.width === 0 && this.hostLeaf.height === 0) {
      return;
    }
    event.preventDefault();
    switch (event.key) {
      case "Backspace":
      case "Escape":
        void this.exit();
        break;
      case "Space":
      case "ArrowRight":
      case "ArrowDown":
        void this.navigate("fwd");
        break;
      case "ArrowLeft":
      case "ArrowUp":
        void this.navigate("bkwd");
        break;
      case "End":
        this.slide = this.setup.slides.length - 2;
        void this.navigate("fwd");
        break;
      case "Home":
        this.refocus();
        break;
      case "e":
        if (this.setup.pathType !== "line") {
          return;
        }
        void (async () => {
          await this.togglePathVisibility(false);
          await this.exit(true);
        })();
        break;
      case "f":
        void this.toggleFullscreen();
        break;
    }
  };

  private readonly fullscreenListener = (event: Event): void => {
    if (this.preventFullscreenExit) {
      this.preventFullscreenExit = false;
      return;
    }
    event.preventDefault();
    void this.exit();
  };

  private initializeEventListeners(): void {
    this.ownerWindow.addEventListener("keydown", this.keydownListener);
    window.removePresentationEventHandlers = () => {
      this.ea.onLinkClickHook = null;
      this.controls?.destroy();
      this.controls = null;
      if (!this.ea.DEVICE.isMobile) {
        this.contentElement.removeEventListener("webkitfullscreenchange", this.fullscreenListener);
        this.contentElement.removeEventListener("fullscreenchange", this.fullscreenListener);
      }
      this.ownerWindow.removeEventListener("keydown", this.keydownListener);
      this.contentElement.querySelector(".layer-ui__wrapper")?.removeClass("excalidraw-hidden");
      delete window.removePresentationEventHandlers;
    };
    this.ea.onLinkClickHook = () => {
      void this.exit();
      return true;
    };
    if (!this.ea.DEVICE.isMobile) {
      this.contentElement.addEventListener("webkitfullscreenchange", this.fullscreenListener);
      this.contentElement.addEventListener("fullscreenchange", this.fullscreenListener);
    }
  }

  /** Restores the drawing and Excalidraw UI after the presentation. */
  public async exit(openForEdit = false): Promise<void> {
    // Other scripts can replace EA's target view while this presentation is active.
    this.ea.targetView = this.hostView;
    this.isLaserOn = false;
    if (this.statusBarElement) {
      this.statusBarElement.style.display = "inherit";
    }
    if (openForEdit) {
      this.ea.targetView.preventAutozoom();
    }
    await this.exitFullscreen();
    await this.waitForExcalidrawResize();
    this.ea.setViewModeEnabled(false);

    if (
      this.setup.pathType === "line" &&
      this.setup.pathElement &&
      this.setup.originalPathProperties
    ) {
      this.ea.clear();
      this.ea.copyViewElementsToEAforEditing(
        this.ea.getViewElements().filter((element) => element.id === this.setup.pathElement?.id),
      );
      const element = this.ea.getElement<ExcalidrawLinearElement>(
        this.setup.pathElement.id,
      ) as EditableLinearElement | null;
      if (element) {
        if (!this.setup.isHidden) {
          element.strokeColor = this.setup.originalPathProperties.strokeColor;
          // This mirrors the legacy backgroundProps assignment intentionally.
          element.backgroundProps = this.setup.originalPathProperties.backgroundColor;
          element.locked = openForEdit ? false : this.setup.originalPathProperties.locked;
        }
        await this.ea.addElementsToView();
        if (!this.setup.isHidden) {
          this.ea.selectElementsInView([element]);
        }
        if (openForEdit) {
          // The legacy script passes the decremented numeric value as a boolean.
          let nextRect = this.getNextSlideRect(Boolean(--this.slide));
          const offsetWidth =
            ((nextRect.right - nextRect.left) * (1 - this.config.editZoomOut)) / 2;
          const offsetHeight =
            ((nextRect.bottom - nextRect.top) * (1 - this.config.editZoomOut)) / 2;
          nextRect = {
            left: nextRect.left - offsetWidth,
            right: nextRect.right + offsetWidth,
            top: nextRect.top - offsetHeight,
            bottom: nextRect.bottom + offsetHeight,
            nextZoom: Math.max(nextRect.nextZoom * this.config.editZoomOut, 0.1),
          };
          await this.scrollToRect(nextRect, 1);
          this.api.startLineEditor(this.ea.getViewSelectedElement(), [
            this.slide * 2,
            this.slide * 2 + 1,
          ]);
        }
      }
    } else if (this.setup.frameRenderingOriginalState.enabled) {
      this.api.updateScene({
        appState: {
          frameRendering: {
            ...this.setup.frameRenderingOriginalState,
            enabled: true,
          },
        },
      });
    }

    window.removePresentationEventHandlers?.();
    this.ownerWindow.setTimeout(() => {
      this.hostView.refreshCanvasOffset();
      this.api.setActiveTool({ type: "selection" });
    });
    if (!this.shouldSaveAfterPresentation) {
      this.ea.targetView.clearDirty();
    }
  }

  private async print(event: MouseEvent): Promise<void> {
    await printSlideshowToPdf({
      event,
      ea: this.ea,
      api: this.api,
      slides: this.setup.slides,
      printSlideWidth: this.config.printSlideWidth,
      printSlideHeight: this.config.printSlideHeight,
      maxZoom: this.config.maxZoom,
      t: this.t,
    });
  }
}
