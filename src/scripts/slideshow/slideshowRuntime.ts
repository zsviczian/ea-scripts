/**
 * @file slideshowRuntime.ts
 * @overview Process-local slideshow state shared by all script executions and popout realms.
 */

import type { App } from "obsidian";

import type { SlideshowTranslator } from "./lang";
import type { PresentationPathType, PresentationSourceKey, SlideshowConfig } from "./types";

const RUNTIME_PROPERTY = "__excalidrawAutomateSlideshowRuntimeV1" as const;

/** The view-bound dependencies captured when Slideshow registers its element action. */
export interface SlideshowViewContext {
  ea: ExcalidrawAutomate;
  utils: ScriptUtils;
  view: ScriptExcalidrawView;
  config: SlideshowConfig;
  t: SlideshowTranslator;
}

/** Minimal controller boundary needed by later script invocations. */
export interface SlideshowPresentationHandle {
  advance(): void;
  exit(openForEdit?: boolean): Promise<void>;
}

/** Minimal sidepanel boundary shared across view and window changes. */
export interface SlideshowSidepanelHandle {
  activate(
    view: ScriptExcalidrawView,
    preferredSource?: PresentationSourceKey | PresentationPathType,
    preferredSlideId?: string,
  ): Promise<void>;
}

export interface SlideshowRuntimeState {
  readonly contexts: WeakMap<ScriptExcalidrawView, SlideshowViewContext>;
  readonly progress: WeakMap<ScriptExcalidrawView, number>;
  readonly progressType: WeakMap<ScriptExcalidrawView, PresentationPathType>;
  readonly progressSource: WeakMap<ScriptExcalidrawView, PresentationSourceKey>;
  readonly presentations: WeakMap<ScriptExcalidrawView, SlideshowPresentationHandle>;
  sidepanel: SlideshowSidepanelHandle | null;
}

type RuntimeHost = App & {
  [RUNTIME_PROPERTY]?: SlideshowRuntimeState;
};

/** Returns the temporary slideshow state attached to Obsidian's shared App instance. */
export function getSlideshowRuntime(): SlideshowRuntimeState {
  const host = app as RuntimeHost;
  host[RUNTIME_PROPERTY] ??= {
    contexts: new WeakMap(),
    progress: new WeakMap(),
    progressType: new WeakMap(),
    progressSource: new WeakMap(),
    presentations: new WeakMap(),
    sidepanel: null,
  };
  const runtime = host[RUNTIME_PROPERTY];
  // Hot-reloaded scripts can encounter a V1 runtime created before progressType existed.
  if (!("progressType" in runtime) || !runtime.progressType) {
    Object.assign(runtime, {
      progressType: new WeakMap<ScriptExcalidrawView, PresentationPathType>(),
    });
  }
  if (!("progressSource" in runtime) || !runtime.progressSource) {
    Object.assign(runtime, {
      progressSource: new WeakMap<ScriptExcalidrawView, PresentationSourceKey>(),
    });
  }
  return runtime;
}

/** Registers or refreshes a view context and reports whether the view was already known. */
export function registerSlideshowViewContext(context: SlideshowViewContext): boolean {
  const runtime = getSlideshowRuntime();
  const wasKnown = runtime.contexts.has(context.view);
  runtime.contexts.set(context.view, context);
  return wasKnown;
}

/** Returns the latest script dependencies registered for a concrete view. */
export function getSlideshowViewContext(
  view: ScriptExcalidrawView,
): SlideshowViewContext | undefined {
  return getSlideshowRuntime().contexts.get(view);
}

/** Stores a zero-based slide position in temporary memory for one concrete view. */
export function setSlideshowProgress(
  view: ScriptExcalidrawView,
  slide: number,
  presentationSource?: PresentationSourceKey | PresentationPathType,
): void {
  const runtime = getSlideshowRuntime();
  runtime.progress.set(view, slide);
  if (presentationSource) {
    const type: PresentationPathType = presentationSource === "frame" ? "frame" : "line";
    runtime.progressType.set(view, type);
    if (presentationSource === "frame" || presentationSource.startsWith("line:")) {
      runtime.progressSource.set(view, presentationSource as PresentationSourceKey);
    }
  }
}

/** Returns a concrete view's last temporary zero-based slide position. */
export function getSlideshowProgress(view: ScriptExcalidrawView): number | undefined {
  return getSlideshowRuntime().progress.get(view);
}

/** Returns the presentation type associated with the saved temporary slide position. */
export function getSlideshowProgressType(
  view: ScriptExcalidrawView,
): PresentationPathType | undefined {
  return getSlideshowRuntime().progressType.get(view);
}


/** Returns the exact presentation source associated with the saved temporary slide position. */
export function getSlideshowProgressSource(
  view: ScriptExcalidrawView,
): PresentationSourceKey | undefined {
  return getSlideshowRuntime().progressSource.get(view);
}

/** Clears the shared runtime. Intended for tests and development reloads. */
export function resetSlideshowRuntimeForTests(): void {
  delete (app as RuntimeHost)[RUNTIME_PROPERTY];
}
