/**
 * @file ea.d.ts
 * @overview Typed declarations for the globals injected by the Excalidraw
 *   Script Engine and the narrow host surface used by script projects.
 */

/* eslint-disable max-params -- Host callback declarations must match ExcalidrawAutomate's runtime signature. */

import type { AppState, ExcalidrawImperativeAPI } from "@zsviczian/excalidraw/types";
import type {
  ExcalidrawElement as ForkExcalidrawElement,
  ExcalidrawFrameElement as ForkExcalidrawFrameElement,
  ExcalidrawLinearElement as ForkExcalidrawLinearElement,
} from "@zsviczian/excalidraw/element/types";
import type { TFile, WorkspaceLeaf } from "obsidian";

declare global {
  type ExcalidrawElement = ForkExcalidrawElement;
  type ExcalidrawFrameElement = ForkExcalidrawFrameElement;
  type ExcalidrawLinearElement = ForkExcalidrawLinearElement;
  type ExcalidrawAPI = ExcalidrawImperativeAPI;
  type Mutable<T> = { -readonly [Key in keyof T]: T[Key] };
  type CaptureUpdateActionType = "NEVER" | "EVENTUALLY" | "IMMEDIATELY";

  interface ModifierKeyState {
    shiftKey: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
  }

  interface ScriptContentElement extends HTMLDivElement {
    readonly innerWidth: number;
    readonly innerHeight: number;
    webkitRequestFullscreen(): Promise<void>;
  }

  type ScriptWorkspaceLeaf = WorkspaceLeaf & {
    readonly width: number;
    readonly height: number;
    readonly view: WorkspaceLeaf["view"] & ScriptExcalidrawView;
  };

  interface ScriptExcalidrawView {
    readonly leaf: ScriptWorkspaceLeaf;
    readonly file: TFile;
    readonly modifierKeyDown: ModifierKeyState;
    readonly ownerDocument: Document;
    readonly ownerWindow: Window;
    readonly contentEl: ScriptContentElement;
    readonly excalidrawContainer?: HTMLDivElement;
    isDirty(): boolean;
    forceSave(silent?: boolean): Promise<void>;
    preventAutozoom(): void;
    refreshCanvasOffset(): void;
    clearDirty(): void;
  }

  interface ScriptUtils {
    readonly scriptFile: TFile;
  }

  interface ElementStyle {
    strokeColor: string;
    backgroundColor: string;
    strokeWidth: number;
    fillStyle: "hachure" | "cross-hatch" | "solid" | "dots" | "dashed" | "zigzag";
    roughness: number;
    opacity: number;
    fontSize: number;
    fontFamily: 1 | 2 | 3 | 4;
    textAlign: "left" | "center" | "right";
    verticalAlign: "top" | "middle" | "bottom";
  }

  interface TextFormatting {
    width?: number;
    height?: number;
    textAlign?: "left" | "center" | "right";
    box?: boolean;
    boxPadding?: number;
  }

  interface ArrowFormatting {
    startArrowHead?: string;
    endArrowHead?: string;
  }

  interface ViewSvgOptions {
    withBackground?: boolean;
    theme?: AppState["theme"];
    frameRendering?: {
      enabled: boolean;
      name: boolean;
      outline: boolean;
      clip: boolean;
    };
    padding?: number;
    selectedOnly?: boolean;
    skipInliningFonts?: boolean;
    embedScene?: boolean;
    elementsOverride?: ExcalidrawElement[];
  }

  interface PdfPageProperties {
    dimensions?: { width: number; height: number };
    backgroundColor?: string;
    margin: { left: number; right: number; top: number; bottom: number };
    alignment: "center" | "left" | "right";
  }


  interface ScriptSidepanelTab {
    readonly id: string;
    readonly scriptName?: string;
    readonly title: string;
    readonly containerEl: HTMLDivElement;
    readonly modalEl: HTMLDivElement;
    readonly contentEl: HTMLDivElement;
    readonly titleEl: HTMLDivElement;
    onFocus: (view: ScriptExcalidrawView | null) => void;
    onExcalidrawViewClosed: () => void;
    onWindowMigrated: (win: Window) => void;
    onOpen(): Promise<void> | void;
    onClose(): void;
    clear(): void;
    setTitle(title: string): this;
    setContent(content: string | DocumentFragment): this;
    setDisabled(disabled: boolean): this;
    focus(): void;
    open(reveal?: boolean): void;
    close(): void;
    getHostEA(): ExcalidrawAutomate;
    isVisible(): boolean;
    isActiveTab(): boolean;
  }

  interface SceneChangeHook {
    appStateKeys?: string[];
    trackElements?: boolean;
    triggerWhenInvisible?: boolean;
    callback: (
      elements: readonly ExcalidrawElement[],
      appState: AppState,
      files: unknown,
      view: ScriptExcalidrawView,
      ea: ExcalidrawAutomate,
    ) => void;
  }

  interface ExcalidrawAutomate {
    targetView: ScriptExcalidrawView | null;
    sidepanelTab: ScriptSidepanelTab | null;
    readonly obsidian: typeof import("obsidian");
    readonly DEVICE: {
      isDesktop: boolean;
      isMobile: boolean;
    };
    style: ElementStyle;
    onSceneChangeHook: SceneChangeHook | null;
    onLinkClickHook:
      | ((
          element: ExcalidrawElement,
          linkText: string,
          event: MouseEvent,
          view: ScriptExcalidrawView,
          ea: ExcalidrawAutomate,
        ) => boolean)
      | null;

    verifyMinAppVersion(version: string): boolean;
    verifyMinimumPluginVersion(version: string): boolean;
    getExcalidrawAPI(): ExcalidrawAPI | null;
    setView(view: ScriptExcalidrawView | null): void;
    checkForActiveSidepanelTabForScript(scriptName?: string): ScriptSidepanelTab | null;
    createSidepanelTab(title: string, persist?: boolean, reveal?: boolean): Promise<ScriptSidepanelTab | null>;
    getSidepanelLeaf(): WorkspaceLeaf | null;
    toggleSidepanelView(): void;
    getViewElements(): ExcalidrawElement[];
    getViewSelectedElements(): ExcalidrawElement[];
    getViewSelectedElement(): ExcalidrawElement | null;
    cloneElement<T extends ExcalidrawElement>(element: T): Mutable<T>;
    clear(): void;
    reset(): void;
    copyViewElementsToEAforEditing(elements: readonly ExcalidrawElement[]): void;
    getElement<T extends ExcalidrawElement = ExcalidrawElement>(id: string): Mutable<T> | null;
    getElements(): ExcalidrawElement[];
    addAppendUpdateCustomData(
      id: string,
      newData: Record<string, unknown | undefined>,
    ): ExcalidrawElement | undefined;
    addElementsToView(
      repositionToCursor?: boolean,
      save?: boolean,
      newElementsOnTop?: boolean,
      shouldRestoreElements?: boolean,
      captureUpdate?: CaptureUpdateActionType,
    ): Promise<boolean>;
    selectElementsInView(elements: readonly ExcalidrawElement[]): void;
    setViewModeEnabled(enabled: boolean): void;
    viewToggleFullScreen(forceViewMode?: boolean): void;
    addRect(topX: number, topY: number, width: number, height: number): string;
    addEllipse(topX: number, topY: number, width: number, height: number): string;
    addText(topX: number, topY: number, text: string, formatting?: TextFormatting): string;
    addLine(points: [number, number][]): string;
    addArrow(points: [number, number][], formatting?: ArrowFormatting): string;
    getBoundingBox(elements: readonly ExcalidrawElement[]): {
      topX: number;
      topY: number;
      width: number;
      height: number;
    };
    createViewSVG(options: ViewSvgOptions): Promise<SVGSVGElement>;
    createPDF(options: {
      SVG: SVGSVGElement[];
      scale?: { fitToPage?: boolean | number; zoom?: number };
      pageProps?: PdfPageProperties;
      filename: string;
    }): Promise<void>;
    getScriptSettings(): Record<string, unknown>;
    setScriptSettings(settings: Record<string, unknown>): Promise<void>;
    inputPrompt(header: string, placeholder?: string, value?: string): Promise<string | null>;
    suggestionPrompt(header: string, displayItems: string[], hint?: string): Promise<string | null>;
  }

  interface SlideshowSessionState {
    script: string;
    timestamp: number;
    slide: Record<string, number>;
  }

  interface Window {
    ExcalidrawSlideshow?: SlideshowSessionState;
    ExcalidrawSlideshowStartTimer?: number;
    removePresentationEventHandlers?: () => void;
    createDiv(options?: { cls?: string | string[] }): HTMLDivElement;
  }

  const ea: ExcalidrawAutomate;
  const utils: ScriptUtils;
  const app: import("obsidian").App;
  const Notice: typeof import("obsidian").Notice;
}

export {};
