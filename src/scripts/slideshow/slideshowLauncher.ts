/**
 * @file slideshowLauncher.ts
 * @overview View-aware presentation, element-action, and sidepanel launch helpers.
 */

import { getSlideshowIcons } from "./icons";
import {
  getAlternatePresentationType,
  resolvePresentationSetup,
  resolveSlideDeckChoices,
} from "./presentationPath";
import { SlideshowController } from "./SlideshowController";
import { SlideshowSidepanel } from "./SlideshowSidepanel";
import { readFrameSlideshowData, readLineSlideshowData } from "./slideshowMetadata";
import {
  getSlideshowProgress,
  getSlideshowRuntime,
  getSlideshowViewContext,
  setSlideshowProgress,
  type SlideshowViewContext,
} from "./slideshowRuntime";
import { isFrameElement, isLinearPathElement, type PresentationPathType } from "./types";

export interface PresentationLaunchOptions {
  initialSlide?: number;
  startFullscreen?: boolean;
  presentationType?: PresentationPathType;
  resume?: boolean;
}

function resolveLaunchModifiers(view: ScriptExcalidrawView): { startFullscreen: boolean } {
  const ctrlKey = view.modifierKeyDown.ctrlKey || view.modifierKeyDown.metaKey;
  return { startFullscreen: !(view.modifierKeyDown.altKey || ctrlKey) };
}

function getElementPresentationType(element: ExcalidrawElement): PresentationPathType | null {
  if (isFrameElement(element) && readFrameSlideshowData(element.customData)) {
    return "frame";
  }
  if (
    isLinearPathElement(element) &&
    readLineSlideshowData(element.customData, element.id, Math.floor(element.points.length / 2))
  ) {
    return "line";
  }
  return null;
}

/** Returns whether a frame or linear element carries valid slideshow metadata. */
export function hasSlideshowMetadata(element: ExcalidrawElement): boolean {
  return getElementPresentationType(element) !== null;
}

/** Registers the view-local “Edit slideshow” element action. */
export function registerSlideshowElementActionProvider(
  context: SlideshowViewContext,
): (() => void) | null {
  return context.ea.registerElementActionProvider((element) => {
    const presentationType = getElementPresentationType(element);
    if (!presentationType) return [];
    return [
      {
        id: "edit-slideshow",
        title: context.t("editSlideshow"),
        icon: "presentation",
        action: () => {
          context.ea.setView(context.view);
          void openSlideshowSidepanel(
            context,
            presentationType,
            presentationType === "frame" ? element.id : undefined,
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
  const setup = resolvePresentationSetup(ea, api, t, launch.presentationType);
  if (!setup || setup.slides.length === 0) return;
  const alternatePresentationType = getAlternatePresentationType(choices, setup.pathType);
  app.workspace.setActiveLeaf(view.leaf, { focus: true });
  const modifierDefaults = resolveLaunchModifiers(view);
  const resumedSlide = launch.resume ? getSlideshowProgress(view) : undefined;
  const initialSlide = launch.initialSlide ?? resumedSlide ?? 0;

  const controller = new SlideshowController({
    ea,
    api,
    hostView: view,
    statusBarElement: view.ownerDocument.querySelector<HTMLElement>("div.status-bar"),
    setup,
    alternatePresentationType,
    config,
    icons: getSlideshowIcons(ea),
    initialSlide,
    startFullscreen: launch.startFullscreen ?? modifierDefaults.startFullscreen,
    t,
    onSlideChange: (slide) => setSlideshowProgress(view, slide),
    onExit: () => {
      if (runtime.presentations.get(view) === controller) {
        runtime.presentations.delete(view);
      }
    },
    openSidepanel: () => openSlideshowSidepanel(context, setup.pathType),
    switchPresentation: (presentationType, startFullscreen) =>
      startSlideshowPresentation(context, {
        presentationType,
        startFullscreen,
      }),
  });
  runtime.presentations.set(view, controller);
  setSlideshowProgress(view, initialSlide);
  try {
    await controller.start();
  } catch (error) {
    if (runtime.presentations.get(view) === controller) {
      runtime.presentations.delete(view);
    }
    throw error;
  }
}

/** Opens or focuses the single slideshow sidepanel and binds it to the requested view. */
export async function openSlideshowSidepanel(
  context: SlideshowViewContext,
  preferredType?: PresentationPathType,
  preferredSlideId?: string,
): Promise<void> {
  const runtime = getSlideshowRuntime();
  await runtime.presentations.get(context.view)?.exit();

  if (runtime.sidepanel) {
    await runtime.sidepanel.activate(context.view, preferredType, preferredSlideId);
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
    startPresentation: async (presentationType, initialSlide) => {
      const boundView = sidepanel.getBoundView();
      if (!boundView) return;
      const boundContext = getSlideshowViewContext(boundView);
      if (!boundContext) return;
      await startSlideshowPresentation(
        boundContext,
        initialSlide === undefined ? { presentationType } : { presentationType, initialSlide },
      );
    },
  });
  const handle = {
    activate: async (view: ScriptExcalidrawView, type?: PresentationPathType, slideId?: string) => {
      await sidepanel.activate(view, type, slideId);
      tab.open();
      sidepanel.revealRequestedSlide();
    },
  };
  runtime.sidepanel = handle;
  sidepanel.initialize();
  await handle.activate(context.view, preferredType, preferredSlideId);
}

/** Routes a script-button, command-palette, or hotkey invocation for the current view. */
export async function runManualSlideshowInvocation(context: SlideshowViewContext): Promise<void> {
  const active = getSlideshowRuntime().presentations.get(context.view);
  if (active) {
    active.advance();
    return;
  }
  context.ea.setView(context.view);
  await startSlideshowPresentation(context, {
    resume: context.view.modifierKeyDown.shiftKey,
  });
}
