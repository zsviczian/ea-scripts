/**
 * @file desktopDisplays.ts
 * @overview Best-effort Electron display discovery and native-window placement for desktop slideshows.
 */

export interface SlideshowDisplay {
  id: number;
  label: string;
  index: number;
  bounds: { x: number; y: number; width: number; height: number };
  workArea: { x: number; y: number; width: number; height: number };
  primary: boolean;
}

export interface NativeWindowPlacementSnapshot {
  bounds: { x: number; y: number; width: number; height: number };
  maximized: boolean;
}

interface ElectronDisplayLike {
  id: number;
  label?: string;
  bounds: { x: number; y: number; width: number; height: number };
  workArea?: { x: number; y: number; width: number; height: number };
}

interface ElectronScreenLike {
  getAllDisplays(): ElectronDisplayLike[];
  getPrimaryDisplay(): ElectronDisplayLike;
  getDisplayMatching(bounds: { x: number; y: number; width: number; height: number }): ElectronDisplayLike;
}

interface ElectronBrowserWindowLike {
  getBounds(): { x: number; y: number; width: number; height: number };
  setBounds(bounds: { x: number; y: number; width: number; height: number }, animate?: boolean): void;
  isMaximized?(): boolean;
  maximize?(): void;
  unmaximize?(): void;
}

interface ElectronRemoteLike {
  getCurrentWindow(): ElectronBrowserWindowLike;
  BrowserWindow?: { getAllWindows(): ElectronBrowserWindowLike[] };
  screen?: ElectronScreenLike;
}

type ElectronRendererWindow = Window & {
  electron?: { remote?: ElectronRemoteLike };
  require?: (moduleName: string) => unknown;
};

function getRemote(win: Window): ElectronRemoteLike | null {
  const rendererWindow = win as ElectronRendererWindow;
  try {
    const contextRemote = rendererWindow.require?.("@electron/remote") as ElectronRemoteLike | undefined;
    if (contextRemote?.getCurrentWindow) return contextRemote;
  } catch {
    // Fall back to Obsidian's exposed bridge below.
  }
  return rendererWindow.electron?.remote ?? null;
}

interface WindowGeometryLike {
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
}

/** Chooses the native Electron window whose bounds most closely match one DOM window. */
export function chooseClosestNativeWindow<T extends { getBounds(): { x: number; y: number; width: number; height: number } }>(
  windows: readonly T[],
  geometry: WindowGeometryLike,
): T | null {
  if (windows.length === 0) return null;
  const expectedWidth = Math.max(geometry.outerWidth, 1);
  const expectedHeight = Math.max(geometry.outerHeight, 1);
  let best: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of windows) {
    const bounds = candidate.getBounds();
    const score =
      Math.abs(bounds.x - geometry.screenX) * 2 +
      Math.abs(bounds.y - geometry.screenY) * 2 +
      Math.abs(bounds.width - expectedWidth) +
      Math.abs(bounds.height - expectedHeight);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

function getNativeWindow(win: Window): ElectronBrowserWindowLike | null {
  const remote = getRemote(win);
  if (!remote) return null;
  try {
    const candidates = remote.BrowserWindow?.getAllWindows?.() ?? [];
    const geometry = {
      screenX: Number.isFinite(win.screenX) ? win.screenX : 0,
      screenY: Number.isFinite(win.screenY) ? win.screenY : 0,
      outerWidth: Number.isFinite(win.outerWidth) ? win.outerWidth : 1,
      outerHeight: Number.isFinite(win.outerHeight) ? win.outerHeight : 1,
    };
    return chooseClosestNativeWindow(candidates, geometry) ?? remote.getCurrentWindow();
  } catch {
    return remote.getCurrentWindow();
  }
}

function toDisplay(
  display: ElectronDisplayLike,
  primaryId: number,
  index: number,
): SlideshowDisplay {
  const workArea = display.workArea ?? display.bounds;
  const label = display.label?.trim() ?? "";
  return {
    id: display.id,
    label,
    index,
    bounds: { ...display.bounds },
    workArea: { ...workArea },
    primary: display.id === primaryId,
  };
}

/** Returns Electron displays when Obsidian exposes its desktop remote bridge. */
export function getAvailableDisplays(win: Window): SlideshowDisplay[] {
  try {
    const screen = getRemote(win)?.screen;
    if (!screen) return [];
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((display, index) => toDisplay(display, primaryId, index));
  } catch {
    return [];
  }
}

/** Returns the display currently containing the native Obsidian window. */
export function getCurrentDisplayId(win: Window): number | null {
  try {
    const remote = getRemote(win);
    const screen = remote?.screen;
    if (!remote || !screen) return null;
    const nativeWindow = getNativeWindow(win);
    return nativeWindow ? screen.getDisplayMatching(nativeWindow.getBounds()).id : null;
  } catch {
    return null;
  }
}

/** Picks presentation=current display and presenter=first other display when available. */
export function chooseDefaultDisplayTargets(
  displays: readonly SlideshowDisplay[],
  currentDisplayId: number | null,
): { presentationDisplayId: number | null; presenterDisplayId: number | null } {
  if (displays.length === 0) {
    return { presentationDisplayId: null, presenterDisplayId: null };
  }
  const presentation =
    displays.find((display) => display.id === currentDisplayId) ??
    displays.find((display) => display.primary) ??
    displays[0];
  const presenter = displays.find((display) => display.id !== presentation?.id) ?? presentation;
  return {
    presentationDisplayId: presentation?.id ?? null,
    presenterDisplayId: presenter?.id ?? null,
  };
}

/** Moves one native Obsidian window to the requested display and returns restorable placement. */
export function moveWindowToDisplay(
  win: Window,
  displayId: number | null | undefined,
  fillWorkArea = true,
  moveIfAlreadyOnDisplay = true,
): NativeWindowPlacementSnapshot | null {
  if (displayId === null || displayId === undefined) return null;
  try {
    const remote = getRemote(win);
    const screen = remote?.screen;
    if (!remote || !screen) return null;
    const target = screen.getAllDisplays().find((display) => display.id === displayId);
    if (!target) return null;
    const nativeWindow = getNativeWindow(win);
    if (!nativeWindow) return null;
    const currentBounds = nativeWindow.getBounds();
    const currentDisplay = screen.getDisplayMatching(currentBounds);
    if (currentDisplay.id === displayId && !moveIfAlreadyOnDisplay) return null;
    const snapshot: NativeWindowPlacementSnapshot = {
      bounds: { ...currentBounds },
      maximized: nativeWindow.isMaximized?.() ?? false,
    };
    if (snapshot.maximized) nativeWindow.unmaximize?.();
    const area = target.workArea ?? target.bounds;
    nativeWindow.setBounds(
      fillWorkArea
        ? { ...area }
        : {
            x: area.x + Math.round(area.width * 0.08),
            y: area.y + Math.round(area.height * 0.08),
            width: Math.max(Math.round(area.width * 0.84), 480),
            height: Math.max(Math.round(area.height * 0.84), 360),
          },
      false,
    );
    return snapshot;
  } catch {
    return null;
  }
}

/** Restores a native window after temporary slideshow display placement. */
export function restoreWindowPlacement(
  win: Window,
  snapshot: NativeWindowPlacementSnapshot | null,
): void {
  if (!snapshot) return;
  try {
    const nativeWindow = getNativeWindow(win);
    if (!nativeWindow) return;
    if (nativeWindow.isMaximized?.()) nativeWindow.unmaximize?.();
    nativeWindow.setBounds({ ...snapshot.bounds }, false);
    if (snapshot.maximized) nativeWindow.maximize?.();
  } catch {
    // Display topology may change while presenting; cleanup remains best-effort.
  }
}
