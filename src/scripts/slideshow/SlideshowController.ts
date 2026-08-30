/**
 * @file SlideshowController.ts
 * @overview Coordinates slideshow lifecycle, hierarchical build navigation, fullscreen, and cleanup.
 */

/* eslint-disable complexity, max-lines-per-function -- Presentation restoration intentionally remains explicit and auditable. */

import { getNavigationRect, type NavigationRect } from "../../sharedUtils/presentationGeometry";
import { sleepInWindow } from "../../sharedUtils/windowTiming";
import { AnimationRuntime } from "./AnimationRuntime";
import { moveWindowToDisplay, restoreWindowPlacement, type NativeWindowPlacementSnapshot } from "./desktopDisplays";
import type { FrameDeckSlide, LineDeckSlide } from "./SlideDeck";
import { PresentationControls } from "./PresentationControls";
import { PresenterViewController } from "./PresenterViewController";
import { buildPresentationState } from "./presentationState";
import type { SlideshowTranslator } from "./lang";
import { printSlideshowToPdf } from "./printToPdf";
import { upgradeLineSlideshowData, writeSlideshowMetadata } from "./slideshowMetadata";
import {
  type Direction,
  type EditableLinearElement,
  type PresentationSetup,
  type PresentationState,
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
  openPresenterViewOnStart?: boolean;
  presentationDisplayId?: number;
  presenterDisplayId?: number;
  t: SlideshowTranslator;
  onSlideChange(slide: number): void;
  onExit(): void;
  openSidepanel(): Promise<void>;
  switchPresentation(presentationType: "line" | "frame", startFullscreen: boolean): Promise<void>;
}

/** Owns one active presentation from setup through guaranteed animation/path restoration. */
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
  private readonly openPresenterViewOnStart: boolean;
  private readonly presentationDisplayId: number | undefined;
  private readonly presenterDisplayId: number | undefined;
  private readonly t: SlideshowTranslator;
  private readonly onSlideChange: (slide: number) => void;
  private readonly onExit: () => void;
  private readonly openSidepanel: () => Promise<void>;
  private readonly switchPresentation: (
    presentationType: "line" | "frame",
    startFullscreen: boolean,
  ) => Promise<void>;
  private readonly animationRuntime: AnimationRuntime | null;
  private controls: PresentationControls | null = null;
  private presenter: PresenterViewController | null = null;
  private slide: number;
  private isFullscreen = false;
  private isLaserOn = false;
  private shouldSaveAfterPresentation = false;
  private busy = false;
  private preventFullscreenExit = true;
  private exitPromise: Promise<void> | null = null;
  private navigationQueue: Promise<void> = Promise.resolve();
  private stateEmissionPauseDepth = 0;
  private hostWindowPlacement: NativeWindowPlacementSnapshot | null = null;

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
    this.slide = Math.min(
      Math.max(options.initialSlide, 0),
      Math.max(options.setup.slides.length - 1, 0),
    );
    this.shouldStartFullscreen = options.startFullscreen;
    this.openPresenterViewOnStart = options.openPresenterViewOnStart ?? false;
    this.presentationDisplayId = options.presentationDisplayId;
    this.presenterDisplayId = options.presenterDisplayId;
    this.t = options.t;
    this.onSlideChange = options.onSlideChange;
    this.onExit = options.onExit;
    this.openSidepanel = options.openSidepanel;
    this.switchPresentation = options.switchPresentation;
    this.animationRuntime =
      options.setup.pathType === "frame"
        ? new AnimationRuntime({
            ea: options.ea,
            api: options.api,
            hostView: options.hostView,
            onStateChange: () => this.emitPresentationState(),
          })
        : null;
  }

  /** Starts the presentation and installs all temporary UI and handlers. */
  public async start(): Promise<void> {
    this.ea.setView(this.hostView);
    if (this.statusBarElement) this.statusBarElement.style.display = "none";
    this.ea.setViewModeEnabled(true);
    const helpButton = this.hostView.excalidrawContainer?.querySelector(
      ".ToolIcon__icon.help-icon",
    );
    if (helpButton) (helpButton as HTMLElement).style.display = "none";
    const zoomButton = this.hostView.excalidrawContainer?.querySelector(
      ".Stack.Stack_vertical.zoom-actions",
    );
    if (zoomButton) (zoomButton as HTMLElement).style.display = "none";

    this.createControls();
    this.initializeEventListeners();
    if (this.shouldStartFullscreen) await this.gotoFullscreen(false);
    else this.controls?.resetPosition(false);
    if (this.setup.pathType === "line") await this.togglePathVisibility(this.setup.isHidden);
    this.stateEmissionPauseDepth += 1;
    try {
      await this.enterSlide(this.slide, false);
    } finally {
      this.stateEmissionPauseDepth -= 1;
    }
    this.controls?.setSelectedSlide(this.slide + 1);
    this.emitPresentationState();
    this.hostView.clearDirty();
    if (this.openPresenterViewOnStart) await this.openPresenterView();
  }

  /** Advances this presentation when the script is invoked again for its view. */
  public advance(): void {
    this.enqueueNavigation(() => this.navigate("fwd"));
  }

  /** Navigates backward through builds/slides from presenter-window controls. */
  public previous(): void {
    this.enqueueNavigation(() => this.navigate("bkwd"));
  }

  /** Jumps directly to a zero-based visible slide index. */
  public goToSlide(index: number): void {
    this.enqueueNavigation(() => this.jumpToSlide(index));
  }

  /** Opens or focuses the desktop presenter popout for this presentation. */
  public async openPresenterView(): Promise<void> {
    if (this.ea.DEVICE.isMobile) {
      new Notice(this.t("presenterViewDesktopOnly"));
      return;
    }
    if (this.presenter) {
      await this.presenter.focus();
      this.presenter.update(this.getPresentationState());
      return;
    }
    const presenter = new PresenterViewController({
      ea: this.ea,
      api: this.api,
      hostView: this.hostView,
      setup: this.setup,
      config: this.config,
      icons: this.icons,
      t: this.t,
      callbacks: {
        previous: () => this.previous(),
        next: () => this.advance(),
        first: () => this.goToSlide(0),
        last: () => this.goToSlide(this.setup.slides.length - 1),
        finish: () => void this.exit(),
      },
      ...(this.presenterDisplayId === undefined ? {} : { targetDisplayId: this.presenterDisplayId }),
      getAnimationOriginalOpacities: () =>
        this.animationRuntime?.getOriginalOpacities() ?? new Map<string, number>(),
      onClosed: () => {
        if (this.presenter === presenter) this.presenter = null;
      },
    });
    this.presenter = presenter;
    try {
      await presenter.open(this.getPresentationState());
    } catch (error) {
      if (this.presenter === presenter) this.presenter = null;
      await presenter.destroy(false).catch(() => undefined);
      console.error("Slideshow presenter view failed to open", error);
      new Notice(this.t("presenterViewOpenFailed"));
    }
  }

  /** Returns the authoritative state shared by floating controls and presenter view. */
  public getPresentationState(): PresentationState {
    let animationState = this.animationRuntime?.getState() ?? { completedSteps: 0, stepCount: 0 };
    if (
      this.setup.pathType === "frame" &&
      animationState.stepCount === 0 &&
      this.setup.deck.visibleSlides[this.slide]?.kind === "frame"
    ) {
      const current = this.setup.deck.visibleSlides[this.slide] as FrameDeckSlide;
      animationState = { completedSteps: 0, stepCount: current.animationSteps.length };
    }
    return buildPresentationState(this.setup.deck, this.slide, animationState);
  }

  private emitPresentationState(): void {
    if (this.stateEmissionPauseDepth > 0) return;
    this.presenter?.update(this.getPresentationState());
  }

  private enqueueNavigation(task: () => Promise<void>): void {
    const queued = this.navigationQueue.then(async () => {
      if (!this.exitPromise) await task();
    });
    this.navigationQueue = queued.catch((error) => {
      console.error("Slideshow navigation failed", error);
    });
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
        previous: () => this.enqueueNavigation(() => this.navigate("bkwd")),
        next: () => this.enqueueNavigation(() => this.navigate("fwd")),
        navigateToSlide: (slideNumber) =>
          this.enqueueNavigation(() => this.jumpToSlide(slideNumber - 1)),
        toggleLaser: () => this.toggleLaser(),
        refocus: () => this.enqueueNavigation(() => this.jumpToSlide(this.slide)),
        toggleFullscreen: () => this.enqueueNavigation(() => this.toggleFullscreen()),
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
          if (this.setup.shouldHidePathAfterPresentation) void this.togglePathVisibility(false);
          void this.exit(true);
        },
        switchPresentation: () => void this.switchToAlternatePresentation(),
        openSidepanel: () => {
          void this.exit().then(() => this.openSidepanel());
        },
        openPresenterView: () => void this.openPresenterView(),
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

  private async gotoFullscreen(refocus = true): Promise<void> {
    if (this.isFullscreen) return;
    this.preventFullscreenExit = true;
    if (!this.hostWindowPlacement && this.presentationDisplayId !== undefined) {
      this.hostWindowPlacement = moveWindowToDisplay(
        this.ownerWindow,
        this.presentationDisplayId,
        true,
        false,
      );
    }
    this.animationRuntime?.pauseTimedStep();
    if (this.ea.DEVICE.isMobile) this.ea.viewToggleFullScreen();
    else await this.contentElement.webkitRequestFullscreen();
    await this.waitForExcalidrawResize();
    const layerUiWrapper = this.contentElement.querySelector(".layer-ui__wrapper");
    if (!layerUiWrapper?.hasClass("excalidraw-hidden")) layerUiWrapper?.addClass("excalidraw-hidden");
    this.controls?.setFullscreen(true);
    this.controls?.resetPosition(false);
    this.isFullscreen = true;
    if (refocus) await this.scrollToSlide(this.slide, 1);
    this.animationRuntime?.startPendingTimer();
  }

  private async exitFullscreen(refocus = true): Promise<void> {
    if (!this.isFullscreen) return;
    this.preventFullscreenExit = true;
    this.animationRuntime?.pauseTimedStep();
    if (!this.ea.DEVICE.isMobile && this.ownerDocument.fullscreenElement) {
      await this.ownerDocument.exitFullscreen();
    }
    if (this.ea.DEVICE.isMobile) this.ea.viewToggleFullScreen();
    this.controls?.setFullscreen(false);
    await this.waitForExcalidrawResize();
    this.controls?.resetPosition(false);
    this.isFullscreen = false;
    if (this.hostWindowPlacement) {
      restoreWindowPlacement(this.ownerWindow, this.hostWindowPlacement);
      this.hostWindowPlacement = null;
      await sleepInWindow(this.ownerWindow, 100);
    }
    if (refocus) await this.scrollToSlide(this.slide, 1);
    this.animationRuntime?.startPendingTimer();
  }

  private async toggleFullscreen(): Promise<void> {
    if (this.isFullscreen) await this.exitFullscreen();
    else await this.gotoFullscreen();
  }

  private async togglePathVisibility(setToHidden: boolean, isMetadataEdit = false): Promise<void> {
    await this.presenter?.waitForIdle();
    const pathElement = this.setup.pathElement;
    const originalProps = this.setup.originalPathProperties;
    if (!pathElement || !originalProps) return;
    this.ea.setView(this.hostView);
    this.ea.clear();
    this.ea.copyViewElementsToEAforEditing(
      this.ea.getViewElements().filter((element) => element.id === pathElement.id),
    );
    const element = this.ea.getElement<ExcalidrawLinearElement>(
      pathElement.id,
    ) as EditableLinearElement | null;
    if (!element) return;
    element.strokeColor = "transparent";
    element.backgroundColor = "transparent";
    const shouldRemainHidden = setToHidden && this.setup.shouldHidePathAfterPresentation;
    if (shouldRemainHidden) element.locked = true;
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
    await this.ea.addElementsToView(
      false,
      isMetadataEdit,
      false,
      false,
      isMetadataEdit ? "IMMEDIATELY" : "NEVER",
    );
  }

  private getSlideNavigationRect(index: number): NavigationRect {
    const targetSlide = this.setup.slides[index];
    if (!targetSlide) throw new Error(this.t("invalidSlide"));
    const appState = this.api.getAppState();
    return getNavigationRect(
      targetSlide,
      { width: appState.width, height: appState.height },
      this.config.maxZoom,
    );
  }

  private async scrollToSlide(index: number, steps = this.config.transitionStepCount): Promise<void> {
    await this.scrollToRect(this.getSlideNavigationRect(index), steps);
  }

  private async enterSlide(index: number, fullyBuilt: boolean): Promise<void> {
    const deckSlide = this.setup.deck.visibleSlides[index];
    if (deckSlide?.kind === "frame" && this.animationRuntime) {
      await this.animationRuntime.enterSlide(deckSlide as FrameDeckSlide, fullyBuilt, false);
    } else {
      await this.animationRuntime?.leaveSlide();
    }
    await this.scrollToSlide(index);
    this.animationRuntime?.startPendingTimer();
  }

  private async scrollToRect(
    rect: NavigationRect,
    steps = this.config.transitionStepCount,
  ): Promise<void> {
    const startTimer = Date.now();
    let watchdog = 0;
    while (this.busy && watchdog++ < 15) await sleepInWindow(this.ownerWindow, 100);
    if (this.busy && watchdog >= 15) return;
    this.busy = true;
    try {
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
            zoom: { value: (zoom.value - zoomStep * index) as typeof zoom.value },
          },
        });
        const elapsed = Date.now() - startTimer;
        if (elapsed > this.config.transitionDelay) index = index < steps ? steps : steps + 1;
        else {
          const timeProgress = elapsed / this.config.transitionDelay;
          index = Math.min(Math.round(steps * timeProgress), steps);
          await sleepInWindow(this.ownerWindow, this.config.frameSleep);
        }
      }
      this.api.updateScene({ appState: { shouldCacheIgnoreZoom: false } });
      if (this.isLaserOn) this.api.setActiveTool({ type: "laser" });
    } finally {
      this.busy = false;
    }
  }

  private async navigate(direction: Direction): Promise<void> {
    if (direction === "fwd") {
      if (await this.animationRuntime?.advance()) return;
      if (this.slide >= this.setup.slides.length - 1) {
        void this.exit();
        return;
      }
      this.stateEmissionPauseDepth += 1;
      try {
        await this.animationRuntime?.leaveSlide();
        this.slide += 1;
        this.controls?.setSelectedSlide(this.slide + 1);
        await this.enterSlide(this.slide, false);
      } finally {
        this.stateEmissionPauseDepth -= 1;
      }
      this.onSlideChange(this.slide);
      this.emitPresentationState();
      return;
    }

    if (await this.animationRuntime?.reverse()) return;
    if (this.slide <= 0) {
      void this.exit();
      return;
    }
    this.stateEmissionPauseDepth += 1;
    try {
      await this.animationRuntime?.leaveSlide();
      this.slide -= 1;
      this.controls?.setSelectedSlide(this.slide + 1);
      await this.enterSlide(this.slide, true);
    } finally {
      this.stateEmissionPauseDepth -= 1;
    }
    this.onSlideChange(this.slide);
    this.emitPresentationState();
  }

  private async jumpToSlide(index: number): Promise<void> {
    const bounded = Math.min(Math.max(index, 0), this.setup.slides.length - 1);
    this.stateEmissionPauseDepth += 1;
    try {
      await this.animationRuntime?.leaveSlide();
      this.slide = bounded;
      this.controls?.setSelectedSlide(this.slide + 1);
      await this.enterSlide(this.slide, false);
    } finally {
      this.stateEmissionPauseDepth -= 1;
    }
    this.onSlideChange(this.slide);
    this.emitPresentationState();
  }

  private readonly keydownListener = (event: KeyboardEvent): void => {
    if (!this.ownerDocument.hasFocus()) return;
    if (this.hostLeaf !== app.workspace.activeLeaf) return;
    if (this.hostLeaf.width === 0 && this.hostLeaf.height === 0) return;
    switch (event.key) {
      case "Backspace":
      case "Escape":
        event.preventDefault();
        void this.exit();
        break;
      case "Space":
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        this.enqueueNavigation(() => this.navigate("fwd"));
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        this.enqueueNavigation(() => this.navigate("bkwd"));
        break;
      case "End":
        event.preventDefault();
        this.enqueueNavigation(() => this.jumpToSlide(this.setup.slides.length - 1));
        break;
      case "Home":
        event.preventDefault();
        this.enqueueNavigation(() => this.jumpToSlide(this.slide));
        break;
      case "e":
        if (this.setup.pathType !== "line") return;
        event.preventDefault();
        void (async () => {
          await this.togglePathVisibility(false);
          await this.exit(true);
        })();
        break;
      case "f":
        event.preventDefault();
        this.enqueueNavigation(() => this.toggleFullscreen());
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
    this.ea.onLinkClickHook = this.linkClickHook;
    if (!this.ea.DEVICE.isMobile) {
      this.contentElement.addEventListener("webkitfullscreenchange", this.fullscreenListener);
      this.contentElement.addEventListener("fullscreenchange", this.fullscreenListener);
    }
  }

  private readonly linkClickHook = (): boolean => {
    void this.exit();
    return true;
  };

  private removeEventListeners(): void {
    if (this.ea.onLinkClickHook === this.linkClickHook) this.ea.onLinkClickHook = null;
    this.controls?.destroy();
    this.controls = null;
    if (!this.ea.DEVICE.isMobile) {
      this.contentElement.removeEventListener("webkitfullscreenchange", this.fullscreenListener);
      this.contentElement.removeEventListener("fullscreenchange", this.fullscreenListener);
    }
    this.ownerWindow.removeEventListener("keydown", this.keydownListener);
    this.contentElement.querySelector(".layer-ui__wrapper")?.removeClass("excalidraw-hidden");
  }

  /** Restores the drawing and Excalidraw UI after the presentation. */
  public exit(openForEdit = false): Promise<void> {
    this.exitPromise ??= this.performExit(openForEdit).finally(this.onExit);
    return this.exitPromise;
  }

  private async performExit(openForEdit: boolean): Promise<void> {
    this.ea.setView(this.hostView);
    const presenter = this.presenter;
    this.presenter = null;
    await presenter?.destroy(true).catch(() => undefined);
    await presenter?.waitForIdle().catch(() => undefined);
    try {
      await this.animationRuntime?.finishActiveSlide();
      this.isLaserOn = false;
      if (this.statusBarElement) this.statusBarElement.style.display = "inherit";
      if (openForEdit) this.hostView.preventAutozoom();
      await this.exitFullscreen(false);
      if (this.hostWindowPlacement) {
        restoreWindowPlacement(this.ownerWindow, this.hostWindowPlacement);
        this.hostWindowPlacement = null;
      }
      await this.waitForExcalidrawResize();
      this.ea.setViewModeEnabled(false);

      if (
        this.setup.pathType === "line" &&
        this.setup.pathElement &&
        this.setup.originalPathProperties
      ) {
        await this.restoreLinePathForExit(openForEdit);
      } else if (this.setup.frameRenderingOriginalState.enabled) {
        this.api.updateScene({
          appState: {
            frameRendering: { ...this.setup.frameRenderingOriginalState, enabled: true },
          },
        });
      }
    } finally {
      await this.animationRuntime?.finishActiveSlide().catch(() => undefined);
      this.removeEventListeners();
      this.ownerWindow.setTimeout(() => {
        this.hostView.refreshCanvasOffset();
        this.api.setActiveTool({ type: "selection" });
      });
      if (!this.shouldSaveAfterPresentation) this.hostView.clearDirty();
    }
  }

  private async restoreLinePathForExit(openForEdit: boolean): Promise<void> {
    const pathElement = this.setup.pathElement;
    const originalProps = this.setup.originalPathProperties;
    if (!pathElement || !originalProps) return;
    this.ea.clear();
    this.ea.copyViewElementsToEAforEditing(
      this.ea.getViewElements().filter((element) => element.id === pathElement.id),
    );
    const element = this.ea.getElement<ExcalidrawLinearElement>(
      pathElement.id,
    ) as EditableLinearElement | null;
    if (!element) return;
    if (!this.setup.isHidden) {
      element.strokeColor = originalProps.strokeColor;
      element.backgroundColor = originalProps.backgroundColor;
      element.locked = openForEdit ? false : originalProps.locked;
    }
    await this.ea.addElementsToView(false, false, false, false, "NEVER");
    if (!this.setup.isHidden) this.ea.selectElementsInView([element]);
    if (!openForEdit) return;

    const deckSlide = this.setup.deck.visibleSlides[this.slide] as LineDeckSlide | undefined;
    const pairIndex = deckSlide?.kind === "path" ? deckSlide.pairIndex : this.slide;
    let nextRect = this.getSlideNavigationRect(this.slide);
    const offsetWidth = ((nextRect.right - nextRect.left) * (1 - this.config.editZoomOut)) / 2;
    const offsetHeight = ((nextRect.bottom - nextRect.top) * (1 - this.config.editZoomOut)) / 2;
    nextRect = {
      left: nextRect.left - offsetWidth,
      right: nextRect.right + offsetWidth,
      top: nextRect.top - offsetHeight,
      bottom: nextRect.bottom + offsetHeight,
      nextZoom: Math.max(nextRect.nextZoom * this.config.editZoomOut, 0.1),
    };
    await this.scrollToRect(nextRect, 1);
    this.api.startLineEditor(element, [pairIndex * 2, pairIndex * 2 + 1]);
  }

  private async print(event: MouseEvent): Promise<void> {
    await this.presenter?.waitForIdle();
    this.ea.setView(this.hostView);
    const task = () =>
      printSlideshowToPdf({
        event,
        ea: this.ea,
        api: this.api,
        slides: this.setup.slides,
        printSlideWidth: this.config.printSlideWidth,
        printSlideHeight: this.config.printSlideHeight,
        maxZoom: this.config.maxZoom,
        t: this.t,
      });
    if (this.animationRuntime) await this.animationRuntime.withFinalState(task);
    else await task();
  }
}
