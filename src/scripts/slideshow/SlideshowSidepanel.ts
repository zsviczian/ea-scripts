/**
 * @file SlideshowSidepanel.ts
 * @overview Drawing-aware sidepanel lifecycle, deck refresh, sorter actions, and notes persistence.
 */

/* eslint-disable complexity, max-lines-per-function -- Sidepanel rendering keeps lifecycle state and controls together. */

import type { EventRef, WorkspaceLeaf } from "obsidian";

import { getNavigationRect } from "../../sharedUtils/presentationGeometry";
import { AnimationEditor } from "./AnimationEditor";
import {
  chooseDefaultDisplayTargets,
  getAvailableDisplays,
  getCurrentDisplayId,
  getSlideshowDeviceKey,
  logDisplayDiagnostics,
  type SlideshowDisplay,
} from "./desktopDisplays";
import { getVisibleSlideIndex, type FrameDeckSlide, type SlideDeckSlide } from "./SlideDeck";
import { SlidePreviewService, getSceneVisualFingerprint } from "./SlidePreviewService";
import { SlideSorter } from "./SlideSorter";
import type { SlideshowTranslator } from "./lang";
import {
  getLinePresentationSourceKey,
  getPresentationSourceType,
  hasPresentationSource,
  isPresentationPathHidden,
  resolvePresentationSource,
  resolveSlideDeckChoices,
  type SlideDeckChoices,
} from "./presentationPath";
import {
  createLinePresentation,
  hasBoundLineEndpoint,
  removeLinePresentation,
  renameLinePresentation,
  reorderFrameSlides,
  reorderLineSlides,
  saveFrameNotes,
  saveLineNotes,
  setFrameExcluded,
  setLinePresentationPathHidden,
  setLineSlideExcluded,
} from "./slideDeckMutations";
import {
  loadSlideshowDisplayPreferences,
  loadSlideshowLaunchPreferences,
  openSlideshowSettingsModal,
  saveSlideshowDisplayPreferences,
  saveSlideshowLaunchPreferences,
  type SlideshowNotesMode,
  type SlideshowStartMode,
  type SlideshowWindowMode,
} from "./slideshowSettings";
import { SLIDESHOW_SIDEPANEL_STYLES } from "./styles";
import { getSlideshowProgress, getSlideshowProgressSource, getSlideshowProgressType } from "./slideshowRuntime";
import {
  isLinearPathElement,
  type LinePresentationSource,
  type PresentationPathType,
  type PresentationSourceKey,
  type ResolvedSlideDeck,
  type SlideshowConfig,
  type SlideshowIcons,
} from "./types";

export interface SidepanelPresentationLaunchOptions {
  initialSlide?: number;
  startFullscreen: boolean;
  openPresenterView?: boolean;
  presentationDisplayId?: number;
  presenterDisplayId?: number;
}

export interface SlideshowSidepanelOptions {
  ea: ExcalidrawAutomate;
  tab: ScriptSidepanelTab;
  t: SlideshowTranslator;
  icons: SlideshowIcons;
  config: SlideshowConfig;
  startPresentation(
    presentationSource: PresentationSourceKey,
    options: SidepanelPresentationLaunchOptions,
  ): Promise<void>;
  printPresentation(presentationSource: PresentationSourceKey, event: MouseEvent): Promise<void>;
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

/** Chooses the sorter source from stable panel state; canvas selection never changes it. */
export function chooseSidepanelPresentationSourceKey(
  choices: SlideDeckChoices,
  storedSource: PresentationSourceKey | undefined,
  preferredType?: PresentationPathType,
): PresentationSourceKey | null {
  if (storedSource && hasPresentationSource(choices, storedSource)) return storedSource;
  if (preferredType === "frame" && choices.frame) return "frame";
  if (preferredType === "line" && choices.lines.length > 0) return choices.lines[0]?.key ?? null;
  return choices.defaultSourceKey;
}

/** Compatibility wrapper retained for broad-type tests/callers. */
export function chooseSidepanelPresentationType(
  choices: SlideDeckChoices,
  storedType: PresentationPathType | undefined,
  _selectedElement?: ExcalidrawElement | null,
): PresentationPathType | null {
  const source = chooseSidepanelPresentationSourceKey(choices, undefined, storedType);
  return source ? getPresentationSourceType(source) : null;
}

/** Compatibility helper retained for callers that intentionally clear a selected line. */
export function clearLineSelectionForDeckSwitch(
  presentationType: PresentationPathType,
  selectedElement: ExcalidrawElement | null,
  api: ExcalidrawAPI,
): void {
  if (presentationType === "frame" && isLinearPathElement(selectedElement)) api.selectElements([]);
}

/** Returns an ordinary selected line that can be explicitly converted into a presentation. */
export function getConvertibleSelectedLine(ea: ExcalidrawAutomate): ExcalidrawLinearElement | null {
  const selected = ea.getViewSelectedElement();
  if (!isLinearPathElement(selected) || Math.floor(selected.points.length / 2) <= 0) return null;
  return getLinePresentationSourceKey(selected) ? null : selected;
}

/** Creates disambiguated presentation labels without changing stored presentation names. */
export function getPresentationSourceLabels(
  choices: SlideDeckChoices,
  frameLabel: string,
  defaultLineLabel: string,
): Array<{ key: PresentationSourceKey; label: string }> {
  const result: Array<{ key: PresentationSourceKey; label: string }> = [];
  if (choices.frame) result.push({ key: "frame", label: frameLabel });
  const bases = choices.lines.map((line) => line.name?.trim() || defaultLineLabel);
  const totals = new Map<string, number>();
  for (const base of bases) totals.set(base, (totals.get(base) ?? 0) + 1);
  const seen = new Map<string, number>();
  choices.lines.forEach((line, index) => {
    const base = bases[index] ?? defaultLineLabel;
    const ordinal = (seen.get(base) ?? 0) + 1;
    seen.set(base, ordinal);
    result.push({
      key: line.key,
      label: (totals.get(base) ?? 0) > 1 ? `${base} (${ordinal})` : base,
    });
  });
  return result;
}

function getLineSourceByKey(
  choices: SlideDeckChoices,
  sourceKey: PresentationSourceKey | null,
): LinePresentationSource | null {
  if (!sourceKey || sourceKey === "frame") return null;
  return choices.lines.find((line) => line.key === sourceKey) ?? null;
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
  progressSource?: PresentationSourceKey,
  presentationSource?: PresentationSourceKey | null,
): number | null {
  if (progress === undefined || presentationType === null || visibleSlideCount <= 0) return null;
  if (progressType && progressType !== presentationType) return null;
  if (progressSource && presentationSource && progressSource !== presentationSource) return null;
  return Math.min(Math.max(progress, 0), visibleSlideCount - 1);
}

/** Manages one non-persistent slideshow sidepanel across Excalidraw view focus changes. */
export class SlideshowSidepanel {
  private sorter: SlideSorter | null = null;
  private previewService: SlidePreviewService | null = null;
  private resolved: ResolvedSlideDeck | null = null;
  private choices: SlideDeckChoices = { frame: null, lines: [], line: null, defaultSourceKey: null, defaultType: null };
  private presentationSourceKey: PresentationSourceKey | null = null;
  private readonly presentationSourceByDrawing = new Map<string, PresentationSourceKey>();
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
  private startMode: SlideshowStartMode = "beginning";
  private windowMode: SlideshowWindowMode = "fullscreen";
  private notesMode: SlideshowNotesMode = "slides";
  private launchSettingsExpanded = false;
  private preferredPresentationType: PresentationPathType | undefined;
  private displays: SlideshowDisplay[] = [];
  private presentationDisplayId: number | null = null;
  private presenterDisplayId: number | null = null;
  private deviceKey: string;
  private settingsWriteQueue: Promise<void> = Promise.resolve();

  public constructor(private readonly options: SlideshowSidepanelOptions) {
    this.ownerWindow = options.tab.contentEl.ownerDocument.defaultView ?? window;
    this.boundView = null;
    const launchPreferences = loadSlideshowLaunchPreferences(options.ea);
    this.startMode = launchPreferences.startMode;
    this.windowMode = launchPreferences.windowMode;
    this.notesMode = launchPreferences.notesMode;
    this.preferredPresentationType = launchPreferences.presentationType;
    this.deviceKey = getSlideshowDeviceKey(this.ownerWindow);
    const displayPreferences = loadSlideshowDisplayPreferences(options.ea, this.deviceKey);
    if (displayPreferences) {
      this.presentationDisplayId = displayPreferences.presentationDisplayId;
      this.presenterDisplayId = displayPreferences.presenterDisplayId;
    }
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
    preferredSource?: PresentationSourceKey | PresentationPathType,
    preferredSlideId?: string,
  ): Promise<void> {
    if (preferredSource) {
      const sourceKey: PresentationSourceKey | null =
        preferredSource === "line" ? null : (preferredSource as PresentationSourceKey);
      if (sourceKey) this.presentationSourceByDrawing.set(view.file.path, sourceKey);
      else this.preferredPresentationType = "line";
    }
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
        if (leaf && ea.isExcalidrawView(leaf.view)) {
          this.bindView(leaf.view as unknown as ScriptExcalidrawView);
          return;
        }
        // Presenter view is hosted in an otherwise empty popout leaf. Focusing it must not
        // detach the slideshow sidepanel from the drawing that owns the active presentation.
        if (leaf?.view.getViewType?.() === "empty") return;
        this.bindView(null);
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
    this.choices = { frame: null, lines: [], line: null, defaultSourceKey: null, defaultType: null };
    this.presentationSourceKey = null;
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
    const storedSource = this.presentationSourceByDrawing.get(drawingKey);
    const presentationSourceKey = chooseSidepanelPresentationSourceKey(
      choices,
      storedSource,
      this.preferredPresentationType,
    );
    if (presentationSourceKey) this.presentationSourceByDrawing.set(drawingKey, presentationSourceKey);
    const resolved = resolvePresentationSource(choices, presentationSourceKey);
    const appState = api.getAppState();
    const lineFingerprint = choices.lines
      .map((line) => `${line.key}:${line.name ?? ""}:${getDeckFingerprint(line.resolved)}`)
      .join("|");
    const convertibleId = getConvertibleSelectedLine(ea)?.id ?? "none";
    const compositeFingerprint = `${presentationSourceKey ?? "none"}|${getDeckFingerprint(choices.frame)}|${lineFingerprint}|candidate=${convertibleId}|${appState.theme}|${appState.viewBackgroundColor}|${getSceneVisualFingerprint(ea.getViewElements())}`;
    if (!force && compositeFingerprint === this.lastFingerprint) return;

    const requestedSlideId = this.requestedSlideId;
    const sceneSelectedSlideId = getSceneSelectedSlideId(resolved, appState);
    const selectedId =
      requestedSlideId ?? sceneSelectedSlideId ?? this.sorter?.getSelectedSlideId() ?? null;
    const expandedNotesId = this.sorter?.getExpandedNotesSlideId() ?? null;
    this.sorter?.destroy();
    this.sorter = null;
    this.choices = choices;
    this.presentationSourceKey = presentationSourceKey;
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
    const resumeSlide =
      this.boundView && this.resolved
        ? getResumeSlideForPresentation(
            getSlideshowProgress(this.boundView),
            getSlideshowProgressType(this.boundView),
            this.presentationSourceKey
              ? getPresentationSourceType(this.presentationSourceKey)
              : null,
            this.resolved.deck.visibleSlides.length,
            getSlideshowProgressSource(this.boundView),
            this.presentationSourceKey,
          )
        : null;
    const selectedSlideId =
      this.sorter?.getSelectedSlideId() ??
      preferredSlideId ??
      this.resolved?.deck.slides[0]?.id ??
      null;
    const selectedVisibleIndex = this.resolved
      ? getVisibleSlideIndex(this.resolved.deck, selectedSlideId)
      : null;

    this.refreshDisplayTargets();

    const startButton = doc.createElement("button");
    startButton.type = "button";
    startButton.className = "slideshow-sidepanel__icon-button slideshow-sidepanel__launch-main";
    startButton.setAttribute("aria-label", t("startPresentation"));
    startButton.innerHTML = icons.play;
    startButton.disabled = !this.resolved || noVisibleSlides;
    header.appendChild(startButton);
    startButton.addEventListener("click", () => void this.launchPresentation());

    const printButton = doc.createElement("button");
    printButton.type = "button";
    printButton.className = "slideshow-sidepanel__icon-button";
    const printLabel = t("printPdf", {
      width: this.options.config.printSlideWidth,
      height: this.options.config.printSlideHeight,
    });
    printButton.setAttribute("aria-label", printLabel);
    printButton.innerHTML = icons.printer;
    printButton.disabled = !this.resolved || noVisibleSlides;
    header.appendChild(printButton);
    printButton.addEventListener("click", (event) => {
      void this.printPresentation(event);
    });

    const convertibleLine = getConvertibleSelectedLine(ea);
    if (convertibleLine) {
      const createPathButton = doc.createElement("button");
      createPathButton.type = "button";
      createPathButton.className = "slideshow-sidepanel__icon-button";
      createPathButton.setAttribute("aria-label", t("createLinePresentation"));
      createPathButton.innerHTML = icons.plus;
      createPathButton.addEventListener("click", () => void this.convertSelectedLineToPresentation());
      header.appendChild(createPathButton);
    } else if (this.presentationSourceKey !== "frame" && this.resolved?.pathElement) {
      const pathHidden = isPresentationPathHidden(this.resolved.pathElement);
      const pathButton = doc.createElement("button");
      pathButton.type = "button";
      pathButton.className = "slideshow-sidepanel__icon-button";
      pathButton.setAttribute(
        "aria-label",
        t(pathHidden ? "showPresentationPath" : "hidePresentationPath"),
      );
      pathButton.innerHTML = pathHidden ? icons.eyeOff : icons.eye;
      pathButton.addEventListener("click", () => void this.togglePresentationPathVisibility());
      header.appendChild(pathButton);
    }

    this.appendSettingsButton(header, doc);

    if (!this.resolved || !this.previewService) {
      const empty = doc.createElement("div");
      empty.className = "slideshow-empty";
      empty.textContent = t("noEligibleSlides");
      root.appendChild(empty);
      return null;
    }

    const launchSettings = doc.createElement("details");
    launchSettings.className = "slideshow-sidepanel__launch-settings";
    launchSettings.open = this.launchSettingsExpanded;
    launchSettings.addEventListener("toggle", () => {
      this.launchSettingsExpanded = launchSettings.open;
    });
    const launchSummary = doc.createElement("summary");
    launchSummary.className = "slideshow-sidepanel__launch-settings-summary";
    launchSummary.textContent = t("presentationSettings");
    launchSettings.appendChild(launchSummary);
    root.appendChild(launchSettings);

    const launchOptions = doc.createElement("div");
    launchOptions.className = "slideshow-sidepanel__launch-options";
    launchSettings.appendChild(launchOptions);

    const appendSelect = <T extends string>(
      labelText: string,
      value: T,
      options: Array<{ value: T; label: string; disabled?: boolean }>,
      onChange: (value: T) => void,
    ): HTMLSelectElement => {
      const label = doc.createElement("label");
      label.className = "slideshow-sidepanel__launch-option";
      const select = doc.createElement("select");
      select.setAttribute("aria-label", labelText);
      for (const optionDefinition of options) {
        const option = doc.createElement("option");
        option.value = optionDefinition.value;
        option.textContent = optionDefinition.label;
        option.disabled = optionDefinition.disabled ?? false;
        select.appendChild(option);
      }
      select.value = value;
      select.addEventListener("change", () => onChange(select.value as T));
      label.appendChild(select);
      launchOptions.appendChild(label);
      return select;
    };

    const sourceOptions = getPresentationSourceLabels(
      this.choices,
      t("frameDeck"),
      t("linePresentationDefaultName"),
    );
    if (sourceOptions.length > 1 && this.presentationSourceKey) {
      appendSelect<PresentationSourceKey>(
        t("presentationType"),
        this.presentationSourceKey,
        sourceOptions.map((option) => ({ value: option.key, label: option.label })),
        (nextSource) => void this.selectPresentationSource(nextSource),
      );
    }

    const effectiveStartMode: SlideshowStartMode =
      this.startMode === "resume" && resumeSlide === null
        ? "beginning"
        : this.startMode === "current" && selectedVisibleIndex === null
          ? "beginning"
          : this.startMode;
    appendSelect<SlideshowStartMode>(
      t("startMode"),
      effectiveStartMode,
      [
        { value: "beginning", label: t("startModeStart") },
        { value: "resume", label: t("startModeResume"), disabled: resumeSlide === null },
        {
          value: "current",
          label: t("startModeCurrent"),
          disabled: selectedVisibleIndex === null,
        },
      ],
      (mode) => {
        this.startMode = mode;
        void this.persistLaunchPreferences();
      },
    );
    appendSelect<SlideshowWindowMode>(
      t("windowMode"),
      this.windowMode,
      [
        { value: "fullscreen", label: t("windowModeFullscreen") },
        { value: "window", label: t("windowModeWindowed") },
      ],
      (mode) => {
        this.windowMode = mode;
        void this.persistLaunchPreferences();
      },
    );
    appendSelect<SlideshowNotesMode>(
      t("notesMode"),
      ea.DEVICE.isMobile ? "slides" : this.notesMode,
      [
        { value: "slides", label: t("notesModeSlidesOnly") },
        {
          value: "presenter",
          label: t("notesModeWithNotes"),
          disabled: ea.DEVICE.isMobile,
        },
      ],
      (mode) => {
        this.notesMode = mode;
        void this.persistLaunchPreferences();
        this.lastFingerprint = "";
        void this.refresh(true);
      },
    );

    if (!ea.DEVICE.isMobile && this.notesMode === "presenter" && this.displays.length > 1) {
      const displayControls = doc.createElement("div");
      displayControls.className = "slideshow-sidepanel__display-controls";
      launchSettings.appendChild(displayControls);
      const appendDisplayPicker = (
        labelText: string,
        selectedId: number | null,
        onChange: (id: number) => void,
      ): void => {
        const label = doc.createElement("label");
        const caption = doc.createElement("span");
        caption.textContent = labelText;
        label.appendChild(caption);
        const select = doc.createElement("select");
        select.setAttribute("aria-label", labelText);
        for (const display of this.displays) {
          const option = doc.createElement("option");
          option.value = String(display.id);
          option.textContent = this.getDisplayLabel(display);
          select.appendChild(option);
        }
        if (selectedId !== null) select.value = String(selectedId);
        select.addEventListener("change", () => onChange(Number(select.value)));
        label.appendChild(select);
        displayControls.appendChild(label);
      };
      appendDisplayPicker(t("presentationDisplay"), this.presentationDisplayId, (id) => {
        this.presentationDisplayId = id;
        logDisplayDiagnostics(this.boundView?.ownerWindow ?? this.ownerWindow, `presentation display selected id=${id}`);
        void this.persistDisplayPreferences();
      });
      appendDisplayPicker(t("presenterDisplay"), this.presenterDisplayId, (id) => {
        this.presenterDisplayId = id;
        logDisplayDiagnostics(this.boundView?.ownerWindow ?? this.ownerWindow, `presenter display selected id=${id}`);
        void this.persistDisplayPreferences();
      });
    }

    const deck = this.resolved.deck;
    const summaryRow = doc.createElement("div");
    summaryRow.className = "slideshow-sidepanel__summary-row";
    root.appendChild(summaryRow);
    const summary = doc.createElement("div");
    summary.className = "slideshow-sidepanel__summary";
    summaryRow.appendChild(summary);
    const activeSourceLabel =
      sourceOptions.find((option) => option.key === this.presentationSourceKey)?.label ??
      (deck.kind === "frame" ? t("frameDeck") : t("linePresentationDefaultName"));
    summary.textContent = `${activeSourceLabel} · ${t("visibleSlideCount", { visible: deck.visibleSlides.length, total: deck.slides.length })}`;
    if (deck.kind === "path") {
      const presentationSettingsButton = doc.createElement("button");
      presentationSettingsButton.type = "button";
      presentationSettingsButton.className = "slideshow-sidepanel__icon-button slideshow-sidepanel__presentation-settings";
      presentationSettingsButton.setAttribute("aria-label", t("linePresentationSettings"));
      presentationSettingsButton.innerHTML = icons.moreHorizontal;
      presentationSettingsButton.addEventListener("click", () => this.openLinePresentationSettings());
      summaryRow.appendChild(presentationSettingsButton);
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

  private refreshDisplayTargets(): void {
    const hostWindow = this.boundView?.ownerWindow ?? this.ownerWindow;
    this.displays = getAvailableDisplays(hostWindow);
    if (this.displays.length === 0) {
      this.presentationDisplayId = null;
      this.presenterDisplayId = null;
      return;
    }
    const presentationValid = this.displays.some(
      (display) => display.id === this.presentationDisplayId,
    );
    const presenterValid = this.displays.some((display) => display.id === this.presenterDisplayId);
    if (presentationValid && presenterValid) return;
    const defaults = chooseDefaultDisplayTargets(
      this.displays,
      getCurrentDisplayId(hostWindow),
    );
    if (!presentationValid) this.presentationDisplayId = defaults.presentationDisplayId;
    if (!presenterValid) this.presenterDisplayId = defaults.presenterDisplayId;
  }

  private getDisplayLabel(display: SlideshowDisplay): string {
    const resolution = `${display.bounds.width}×${display.bounds.height}`;
    const primary = display.primary ? ` · ${this.options.t("primaryDisplay")}` : "";
    const name =
      display.label || this.options.t("displayLabel", { number: display.index + 1 });
    return `${name} · ${resolution}${primary}`;
  }

  private persistLaunchPreferences(): Promise<void> {
    const preferences = {
      startMode: this.startMode,
      windowMode: this.windowMode,
      notesMode: this.notesMode,
      ...(this.presentationSourceKey
        ? { presentationType: getPresentationSourceType(this.presentationSourceKey) }
        : {}),
    };
    this.settingsWriteQueue = this.settingsWriteQueue
      .then(() => saveSlideshowLaunchPreferences(this.options.ea, preferences))
      .catch((error) => console.error("Slideshow launch preference save failed", error));
    return this.settingsWriteQueue;
  }

  private persistDisplayPreferences(): Promise<void> {
    const preferences = {
      presentationDisplayId: this.presentationDisplayId,
      presenterDisplayId: this.presenterDisplayId,
    };
    this.settingsWriteQueue = this.settingsWriteQueue
      .then(() => saveSlideshowDisplayPreferences(this.options.ea, this.deviceKey, preferences))
      .catch((error) => console.error("Slideshow display preference save failed", error));
    return this.settingsWriteQueue;
  }

  private hideSidepanelForWindowedPresentation(): void {
    const sidepanelLeaf = this.options.ea.getSidepanelLeaf();
    const container = sidepanelLeaf?.view.containerEl;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const visible =
      container.isConnected &&
      rect.width > 1 &&
      rect.height > 1 &&
      this.ownerWindow.getComputedStyle(container).display !== "none";
    if (visible) this.options.ea.toggleSidepanelView();
  }

  private async launchPresentation(): Promise<void> {
    const view = this.boundView;
    const resolved = this.resolved;
    const presentationSourceKey = this.presentationSourceKey;
    if (!view || !resolved || !presentationSourceKey || resolved.deck.visibleSlides.length === 0) return;
    const presentationType = getPresentationSourceType(presentationSourceKey);

    await this.persistLaunchPreferences();
    await this.persistDisplayPreferences();

    const resume = getResumeSlideForPresentation(
      getSlideshowProgress(view),
      getSlideshowProgressType(view),
      presentationType,
      resolved.deck.visibleSlides.length,
      getSlideshowProgressSource(view),
      presentationSourceKey,
    );
    const selectedId = this.sorter?.getSelectedSlideId() ?? null;
    const selectedIndex = getVisibleSlideIndex(resolved.deck, selectedId);
    const effectiveStartMode: SlideshowStartMode =
      this.startMode === "resume" && resume === null
        ? "beginning"
        : this.startMode === "current" && selectedIndex === null
          ? "beginning"
          : this.startMode;

    let initialSlide: number | undefined;
    if (effectiveStartMode === "resume") {
      initialSlide = resume ?? 0;
    } else if (effectiveStartMode === "current") {
      if (selectedIndex === null) {
        new Notice(this.options.t("selectedSlideNotPresentable"));
        return;
      }
      initialSlide = selectedIndex;
    } else {
      initialSlide = 0;
    }

    await this.sorter?.flushNotes();
    await this.animationEditor?.destroy();
    this.animationEditor = null;
    this.animationEditingSlideId = null;
    const startFullscreen = this.windowMode === "fullscreen";
    const openPresenterView = !this.options.ea.DEVICE.isMobile && this.notesMode === "presenter";
    const launchOptions: SidepanelPresentationLaunchOptions = {
      initialSlide,
      startFullscreen,
      openPresenterView,
      ...(openPresenterView && this.presentationDisplayId !== null
        ? { presentationDisplayId: this.presentationDisplayId }
        : {}),
      ...(openPresenterView && this.presenterDisplayId !== null
        ? { presenterDisplayId: this.presenterDisplayId }
        : {}),
    };

    logDisplayDiagnostics(
      view.ownerWindow,
      `launch device=${this.deviceKey},source=${presentationSourceKey},type=${presentationType},startPreference=${this.startMode},startEffective=${effectiveStartMode},window=${this.windowMode},notes=${this.notesMode},presentationDisplay=${this.presentationDisplayId ?? "none"},presenterDisplay=${this.presenterDisplayId ?? "none"}`,
    );

    if (!startFullscreen) this.hideSidepanelForWindowedPresentation();
    await this.options.startPresentation(presentationSourceKey, launchOptions);
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
    if (this.presentationSourceKey) {
      await this.options.printPresentation(this.presentationSourceKey, event);
    }
  }

  private async selectPresentationSource(sourceKey: PresentationSourceKey): Promise<void> {
    if (!hasPresentationSource(this.choices, sourceKey) || sourceKey === this.presentationSourceKey) return;
    await this.sorter?.flushNotes();
    await this.animationEditor?.destroy();
    this.animationEditor = null;
    this.animationEditingSlideId = null;
    const view = this.boundView;
    if (!view) return;
    this.presentationSourceByDrawing.set(view.file.path, sourceKey);
    this.preferredPresentationType = getPresentationSourceType(sourceKey);
    this.presentationSourceKey = sourceKey;
    await this.persistLaunchPreferences();
    this.lastFingerprint = "";
    await this.refresh(true);
  }

  private async convertSelectedLineToPresentation(): Promise<void> {
    const view = this.boundView;
    const path = getConvertibleSelectedLine(this.options.ea);
    if (!view || !path) return;
    try {
      await this.sorter?.flushNotes();
      await createLinePresentation(
        this.options.ea,
        path.id,
        this.options.t("linePresentationDefaultName"),
      );
      await view.forceSave(true);
      const sourceKey: PresentationSourceKey = `line:${path.id}`;
      this.presentationSourceByDrawing.set(view.file.path, sourceKey);
      this.presentationSourceKey = sourceKey;
      this.preferredPresentationType = "line";
      await this.persistLaunchPreferences();
      this.lastFingerprint = "";
      await this.refresh(true);
    } catch (error) {
      console.error("Slideshow line presentation creation failed", error);
      new Notice(this.options.t("metadataSaveFailed"));
    }
  }

  private openLinePresentationSettings(): void {
    const source = getLineSourceByKey(this.choices, this.presentationSourceKey);
    const view = this.boundView;
    if (!source || !view) return;
    const { ea, t } = this.options;
    const modal = new ea.obsidian.Modal(app);
    modal.titleEl.setText(t("linePresentationSettings"));
    const input = modal.contentEl.createEl("input", {
      type: "text",
      value: source.name ?? t("linePresentationDefaultName"),
      attr: { "aria-label": t("linePresentationName") },
    });
    input.style.width = "100%";
    input.style.marginBottom = "1rem";
    const actions = modal.contentEl.createDiv({ cls: "slideshow-line-presentation-settings__actions" });
    actions.style.display = "flex";
    actions.style.gap = "0.5rem";
    actions.style.flexWrap = "wrap";
    const save = actions.createEl("button", { text: t("settingsSave") });
    save.addEventListener("click", () => {
      void (async () => {
        try {
          await renameLinePresentation(ea, source.pathId, input.value);
          await view.forceSave(true);
          modal.close();
          this.lastFingerprint = "";
          await this.refresh(true);
        } catch (error) {
          console.error("Slideshow line presentation rename failed", error);
          new Notice(t("metadataSaveFailed"));
        }
      })();
    });
    const remove = actions.createEl("button", { text: t("removeLinePresentation") });
    remove.style.color = "var(--text-error)";
    remove.addEventListener("click", () => {
      const confirmed = this.ownerWindow.confirm(t("removeLinePresentationConfirm"));
      if (!confirmed) return;
      void (async () => {
        try {
          await removeLinePresentation(ea, source.pathId);
          await view.forceSave(true);
          modal.close();
          this.presentationSourceByDrawing.delete(view.file.path);
          this.presentationSourceKey = null;
          this.lastFingerprint = "";
          await this.refresh(true);
        } catch (error) {
          console.error("Slideshow line presentation removal failed", error);
          new Notice(t("metadataSaveFailed"));
        }
      })();
    });
    modal.open();
    input.focus();
    input.select();
  }

  private async togglePresentationPathVisibility(): Promise<void> {
    const path = this.resolved?.pathElement;
    if (!path) return;
    try {
      await this.sorter?.flushNotes();
      await setLinePresentationPathHidden(
        this.options.ea,
        path.id,
        !isPresentationPathHidden(path),
      );
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
