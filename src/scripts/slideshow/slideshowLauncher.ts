/**
 * @file slideshowLauncher.ts
 * @overview View-aware presentation, element-action, and sidepanel launch helpers.
 */

import {
  chooseDefaultDisplayTargets,
  getAvailableDisplays,
  getCurrentDisplayId,
  getSlideshowDeviceKey,
} from "./desktopDisplays";
import { getSlideshowIcons } from "./icons";
import {
  getLinePresentationSourceKey,
  resolvePresentationSetup,
  resolvePresentationSource,
  resolveSlideDeckChoices,
} from "./presentationPath";
import { SlideshowController } from "./SlideshowController";
import { SlideshowSidepanel } from "./SlideshowSidepanel";
import { printSlideshowToPdf } from "./printToPdf";
import { readFrameSlideshowData } from "./slideshowMetadata";
import {
  loadSlideshowDisplayPreferences,
  loadSlideshowLaunchPreferences,
} from "./slideshowSettings";
import {
  getSlideshowProgress,
  getSlideshowProgressSource,
  getSlideshowProgressType,
  getSlideshowRuntime,
  getSlideshowViewContext,
  setSlideshowProgress,
  type SlideshowViewContext,
} from "./slideshowRuntime";
import { isFrameElement, isLinearPathElement, type PresentationPathType, type PresentationSourceKey } from "./types";

export interface PresentationLaunchOptions {
  initialSlide?: number;
  startFullscreen?: boolean;
  presentationType?: PresentationPathType;
  presentationSourceKey?: PresentationSourceKey;
  resume?: boolean;
  openPresenterView?: boolean;
  presentationDisplayId?: number;
  presenterDisplayId?: number;
}

export interface ManualSlideshowInvocationIntent {
  openSidepanel: boolean;
  resume: boolean;
  startFullscreen: boolean;
}

/** Resolves the script-button modifier contract without depending on DOM event timing. */
export function resolveManualInvocationIntent(
  modifiers: Pick<ScriptExcalidrawView["modifierKeyDown"], "altKey" | "shiftKey" | "ctrlKey" | "metaKey">,
): ManualSlideshowInvocationIntent {
  return {
    openSidepanel: modifiers.ctrlKey || modifiers.metaKey,
    resume: modifiers.shiftKey,
    startFullscreen: !modifiers.altKey,
  };
}

function resolveLaunchModifiers(view: ScriptExcalidrawView): { startFullscreen: boolean } {
  return { startFullscreen: !view.modifierKeyDown.altKey };
}

function getElementPresentationSourceKey(element: ExcalidrawElement): PresentationSourceKey | null {
  if (isFrameElement(element) && readFrameSlideshowData(element.customData)) return "frame";
  if (isLinearPathElement(element)) return getLinePresentationSourceKey(element);
  return null;
}

/** Returns whether a frame or linear element carries valid slideshow metadata. */
export function hasSlideshowMetadata(element: ExcalidrawElement): boolean {
  return getElementPresentationSourceKey(element) !== null;
}

/** Registers the view-local “Edit slideshow” element action. */
export function registerSlideshowElementActionProvider(
  context: SlideshowViewContext,
): (() => void) | null {
  return context.ea.registerElementActionProvider((element) => {
    const latestContext = getSlideshowViewContext(context.view) ?? context;
    const presentationSourceKey = getElementPresentationSourceKey(element);
    if (!presentationSourceKey) return [];
    return [
      {
        id: "edit-slideshow",
        title: latestContext.t("editSlideshow"),
        icon: "presentation",
        action: () => {
          latestContext.ea.setView(latestContext.view);
          void openSlideshowSidepanel(
            latestContext,
            presentationSourceKey,
            presentationSourceKey === "frame" ? element.id : undefined,
          );
        },
      },
    ];
  });
}

/** Starts a presentation for one concrete view without creating duplicate controllers. */
export async function startSlideshowPresentation(
  context: SlideshowViewContext,
  launch: PresentationLaunchOptions = {},
): Promise<void> {
  const { ea, view, config, t } = context;
  ea.setView(view);
  if (view.isDirty()) await view.forceSave(true);
  const api = ea.getExcalidrawAPI();
  if (!api) {
    new Notice(t("cannotAccessView"));
    return;
  }

  const runtime = getSlideshowRuntime();
  const previous = runtime.presentations.get(view);
  if (previous) await previous.exit();

  const choices = resolveSlideDeckChoices(ea);
  const requestedSource =
    launch.presentationSourceKey ?? launch.presentationType ?? choices.defaultSourceKey ?? undefined;
  const setup = resolvePresentationSetup(ea, api, t, requestedSource);
  if (!setup || setup.slides.length === 0) return;
  app.workspace.setActiveLeaf(view.leaf, { focus: true });
  const modifierDefaults = resolveLaunchModifiers(view);
  const savedProgressType = getSlideshowProgressType(view);
  const savedProgressSource = getSlideshowProgressSource(view);
  const resumedSlide =
    launch.resume &&
    (!savedProgressType || savedProgressType === setup.pathType) &&
    (!savedProgressSource || savedProgressSource === setup.sourceKey)
      ? getSlideshowProgress(view)
      : undefined;
  const initialSlide = launch.initialSlide ?? resumedSlide ?? 0;

  const controller = new SlideshowController({
    ea,
    api,
    hostView: view,
    statusBarElement: view.ownerDocument.querySelector<HTMLElement>("div.status-bar"),
    setup,
    config,
    icons: getSlideshowIcons(ea),
    initialSlide,
    startFullscreen: launch.startFullscreen ?? modifierDefaults.startFullscreen,
    ...(launch.openPresenterView === undefined
      ? {}
      : { openPresenterViewOnStart: launch.openPresenterView }),
    ...(launch.presentationDisplayId === undefined
      ? {}
      : { presentationDisplayId: launch.presentationDisplayId }),
    ...(launch.presenterDisplayId === undefined
      ? {}
      : { presenterDisplayId: launch.presenterDisplayId }),
    t,
    onSlideChange: (slide) => setSlideshowProgress(view, slide, setup.sourceKey),
    onExit: () => {
      if (runtime.presentations.get(view) === controller) {
        runtime.presentations.delete(view);
      }
    },
    openSidepanel: () => openSlideshowSidepanel(context, setup.sourceKey),
  });
  runtime.presentations.set(view, controller);
  setSlideshowProgress(view, initialSlide, setup.sourceKey);
  try {
    await controller.start();
  } catch (error) {
    if (runtime.presentations.get(view) === controller) {
      runtime.presentations.delete(view);
    }
    throw error;
  }
}

/** Prints one canonical slideshow deck without entering presentation mode. */
export async function printSlideshowPresentation(
  context: SlideshowViewContext,
  presentationSource: PresentationSourceKey | PresentationPathType,
  event: MouseEvent,
): Promise<void> {
  const { ea, view, config, t } = context;
  ea.setView(view);
  if (view.isDirty()) await view.forceSave(true);
  const api = ea.getExcalidrawAPI();
  if (!api) {
    new Notice(t("cannotAccessView"));
    return;
  }
  const choices = resolveSlideDeckChoices(ea);
  const resolved =
    presentationSource === "line"
      ? choices.line
      : presentationSource === "frame"
        ? choices.frame
        : resolvePresentationSource(choices, presentationSource);
  if (!resolved || resolved.deck.visibleSlides.length === 0) {
    new Notice(t("allSlidesExcluded"));
    return;
  }
  await printSlideshowToPdf({
    event,
    ea,
    api,
    slides: resolved.deck.visibleSlides.map((slide) => slide.rect),
    printSlideWidth: config.printSlideWidth,
    printSlideHeight: config.printSlideHeight,
    maxZoom: config.maxZoom,
    t,
  });
}

/** Opens or focuses the single slideshow sidepanel and binds it to the requested view. */
export async function openSlideshowSidepanel(
  context: SlideshowViewContext,
  preferredSource?: PresentationSourceKey | PresentationPathType,
  preferredSlideId?: string,
): Promise<void> {
  const runtime = getSlideshowRuntime();
  await runtime.presentations.get(context.view)?.exit();

  if (runtime.sidepanel) {
    await runtime.sidepanel.activate(context.view, preferredSource, preferredSlideId);
    return;
  }

  const existing = context.ea.checkForActiveSidepanelTabForScript();
  if (existing) {
    // A tab without the shared runtime handle belongs to a stale script execution and cannot
    // receive the requested deck/slide identity. Recreate it so element actions remain exact.
    existing.close();
  }

  context.ea.setView(context.view);
  const tab = await context.ea.createSidepanelTab(context.t("sidepanelTitle"), false, true);
  if (!tab) return;

  const sidepanel = new SlideshowSidepanel({
    ea: context.ea,
    tab,
    t: context.t,
    icons: getSlideshowIcons(context.ea),
    config: context.config,
    onClosed: () => {
      if (runtime.sidepanel?.activate === handle.activate) runtime.sidepanel = null;
    },
    startPresentation: async (presentationSourceKey, launchOptions) => {
      const boundView = sidepanel.getBoundView();
      if (!boundView) return;
      const boundContext = getSlideshowViewContext(boundView);
      if (!boundContext) return;
      Object.assign(boundContext.config, context.config);
      await startSlideshowPresentation(boundContext, {
        presentationSourceKey,
        ...launchOptions,
      });
    },
    printPresentation: async (presentationSourceKey, event) => {
      const boundView = sidepanel.getBoundView();
      if (!boundView) return;
      const boundContext = getSlideshowViewContext(boundView);
      if (!boundContext) return;
      Object.assign(boundContext.config, context.config);
      await printSlideshowPresentation(boundContext, presentationSourceKey, event);
    },
  });
  const handle = {
    activate: async (
      view: ScriptExcalidrawView,
      source?: PresentationSourceKey | PresentationPathType,
      slideId?: string,
    ) => {
      await sidepanel.activate(view, source, slideId);
      tab.open();
      sidepanel.revealRequestedSlide();
    },
  };
  runtime.sidepanel = handle;
  sidepanel.initialize();
  await handle.activate(context.view, preferredSource, preferredSlideId);
}

/** Routes a script-button, command-palette, or hotkey invocation for the current view. */
export async function runManualSlideshowInvocation(context: SlideshowViewContext): Promise<void> {
  const intent = resolveManualInvocationIntent(context.view.modifierKeyDown);
  if (intent.openSidepanel) {
    await openSlideshowSidepanel(context);
    return;
  }

  const active = getSlideshowRuntime().presentations.get(context.view);
  if (active) {
    active.advance();
    return;
  }

  context.ea.setView(context.view);
  const preferences = loadSlideshowLaunchPreferences(context.ea);
  const openPresenterView = !context.ea.DEVICE.isMobile && preferences.notesMode === "presenter";
  const launch: PresentationLaunchOptions = {
    resume: intent.resume,
    startFullscreen: intent.startFullscreen,
    openPresenterView,
  };

  if (openPresenterView) {
    const ownerWindow = context.view.ownerWindow;
    const deviceKey = getSlideshowDeviceKey(ownerWindow);
    const savedDisplays = loadSlideshowDisplayPreferences(context.ea, deviceKey);
    const displays = getAvailableDisplays(ownerWindow);
    const defaults = chooseDefaultDisplayTargets(displays, getCurrentDisplayId(ownerWindow));
    const validDisplayIds = new Set(displays.map((display) => display.id));
    const presentationDisplayId =
      savedDisplays?.presentationDisplayId !== null &&
      savedDisplays?.presentationDisplayId !== undefined &&
      validDisplayIds.has(savedDisplays.presentationDisplayId)
        ? savedDisplays.presentationDisplayId
        : defaults.presentationDisplayId;
    const presenterDisplayId =
      savedDisplays?.presenterDisplayId !== null &&
      savedDisplays?.presenterDisplayId !== undefined &&
      validDisplayIds.has(savedDisplays.presenterDisplayId)
        ? savedDisplays.presenterDisplayId
        : defaults.presenterDisplayId;
    if (presentationDisplayId !== null) launch.presentationDisplayId = presentationDisplayId;
    if (presenterDisplayId !== null) launch.presenterDisplayId = presenterDisplayId;
  }

  await startSlideshowPresentation(context, launch);
}
