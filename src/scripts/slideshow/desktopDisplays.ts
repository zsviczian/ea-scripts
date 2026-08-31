/**
 * @file desktopDisplays.ts
 * @overview Best-effort Electron display discovery and native-window placement.
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
  windowId: number | null;
  sourceDisplayId: number | null;
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
  readonly id?: number;
  getBounds(): { x: number; y: number; width: number; height: number };
  setBounds(bounds: { x: number; y: number; width: number; height: number }, animate?: boolean): void;
  getTitle?(): string;
  getId?(): number;
  isMaximized?(): boolean;
  maximize?(): void;
  unmaximize?(): void;
  isFullScreen?(): boolean;
}

interface ElectronRemoteLike {
  getCurrentWindow(): ElectronBrowserWindowLike;
  BrowserWindow?: {
    getAllWindows(): ElectronBrowserWindowLike[];
    fromId?(id: number): ElectronBrowserWindowLike | null;
  };
  screen?: ElectronScreenLike;
}

type ElectronRendererWindow = Window & {
  electron?: { remote?: ElectronRemoteLike };
  require?: (moduleName: string) => unknown;
};

interface WindowGeometryLike {
  screenX: number;
  screenY: number;
  outerWidth: number;
  outerHeight: number;
}

const DEVICE_KEY_STORAGE = "excalidraw-slideshow-device-key";


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

function geometryForWindow(win: Window): WindowGeometryLike {
  return {
    screenX: Number.isFinite(win.screenX) ? win.screenX : 0,
    screenY: Number.isFinite(win.screenY) ? win.screenY : 0,
    outerWidth: Number.isFinite(win.outerWidth) ? Math.max(win.outerWidth, 1) : 1,
    outerHeight: Number.isFinite(win.outerHeight) ? Math.max(win.outerHeight, 1) : 1,
  };
}

function geometryScore(
  candidate: { getBounds(): { x: number; y: number; width: number; height: number } },
  geometry: WindowGeometryLike,
): number {
  const bounds = candidate.getBounds();
  return (
    Math.abs(bounds.x - geometry.screenX) * 2 +
    Math.abs(bounds.y - geometry.screenY) * 2 +
    Math.abs(bounds.width - geometry.outerWidth) +
    Math.abs(bounds.height - geometry.outerHeight)
  );
}

/** Chooses the native Electron window whose bounds most closely match one DOM window. */
export function chooseClosestNativeWindow<
  T extends { getBounds(): { x: number; y: number; width: number; height: number } },
>(windows: readonly T[], geometry: WindowGeometryLike): T | null {
  if (windows.length === 0) return null;
  let best: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of windows) {
    const score = geometryScore(candidate, geometry);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}

/**
 * Resolves the native window for a DOM Window.
 *
 * @electron/remote.getCurrentWindow() is preferred because it is bound to the renderer that owns
 * the DOM window. Geometry matching is only used when the current-window result clearly belongs
 * to another renderer (which can happen through older Obsidian bridge shims).
 */
function getNativeWindow(win: Window): ElectronBrowserWindowLike | null {
  const remote = getRemote(win);
  if (!remote) return null;
  try {
    const current = remote.getCurrentWindow();
    const candidates = remote.BrowserWindow?.getAllWindows?.() ?? [];
    if (candidates.length === 0) return current;
    const geometry = geometryForWindow(win);
    const closest = chooseClosestNativeWindow(candidates, geometry);
    if (!closest) return current;
    const currentScore = geometryScore(current, geometry);
    const closestScore = geometryScore(closest, geometry);
    // Keep renderer affinity unless another native window is materially closer to this DOM window.
    return closestScore + 80 < currentScore ? closest : current;
  } catch {
    try {
      return remote.getCurrentWindow();
    } catch {
      return null;
    }
  }
}

function getNativeWindowId(window: ElectronBrowserWindowLike): number | null {
  const propertyId = window.id;
  if (typeof propertyId === "number" && Number.isFinite(propertyId)) return propertyId;
  const legacyId = window.getId?.();
  return typeof legacyId === "number" && Number.isFinite(legacyId) ? legacyId : null;
}

function getNativeWindowById(
  remote: ElectronRemoteLike,
  id: number | null,
): ElectronBrowserWindowLike | null {
  if (id === null) return null;
  try {
    const direct = remote.BrowserWindow?.fromId?.(id);
    if (direct) return direct;
    return (
      remote.BrowserWindow
        ?.getAllWindows?.()
        .find((candidate) => getNativeWindowId(candidate) === id) ?? null
    );
  } catch {
    return null;
  }
}

/** Captures the current native placement without moving the window. */
export function captureWindowPlacement(win: Window): NativeWindowPlacementSnapshot | null {
  try {
    const remote = getRemote(win);
    const screen = remote?.screen;
    if (!remote || !screen) {
      return null;
    }
    const nativeWindow = getNativeWindow(win);
    if (!nativeWindow) {
      return null;
    }
    const bounds = nativeWindow.getBounds();
    const snapshot: NativeWindowPlacementSnapshot = {
      windowId: getNativeWindowId(nativeWindow),
      sourceDisplayId: screen.getDisplayMatching(bounds).id,
      bounds: { ...bounds },
      maximized: nativeWindow.isMaximized?.() ?? false,
    };
    return snapshot;
  } catch {
    return null;
  }
}

function nativeWindowIdentity(window: ElectronBrowserWindowLike): string {
  const id = getNativeWindowId(window);
  if (id !== null) return `id:${id}`;
  const bounds = window.getBounds();
  return `title:${window.getTitle?.() ?? ""}|${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
}

/**
 * Reports whether two DOM windows resolve to the same native BrowserWindow.
 * null means identity could not be established and callers should fail safe rather than move either window.
 */
export function resolveSameNativeWindow(host: Window, candidate: Window): boolean | null {
  const hostNative = getNativeWindow(host);
  const candidateNative = getNativeWindow(candidate);
  if (!hostNative || !candidateNative) return null;
  if (hostNative === candidateNative) return true;
  const hostId = getNativeWindowId(hostNative);
  const candidateId = getNativeWindowId(candidateNative);
  if (hostId !== null && candidateId !== null) return hostId === candidateId;
  return nativeWindowIdentity(hostNative) === nativeWindowIdentity(candidateNative);
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

/** Returns a stable local device key used to namespace display settings in script settings. */
export function getSlideshowDeviceKey(win: Window): string {
  try {
    const existing = win.localStorage?.getItem(DEVICE_KEY_STORAGE)?.trim();
    if (existing) return existing;
    const generated =
      typeof win.crypto?.randomUUID === "function"
        ? win.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    win.localStorage?.setItem(DEVICE_KEY_STORAGE, generated);
    return generated;
  } catch {
    // A deterministic fallback is better than losing preferences if localStorage is unavailable.
    const nav = win.navigator;
    return `fallback-${nav.platform || "desktop"}-${nav.userAgent.length}`;
  }
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

/** Waits until the DOM window's native BrowserWindow is reported on the requested display. */
export async function waitForWindowOnDisplay(
  win: Window,
  displayId: number,
  timeoutMs = 2000,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started <= timeoutMs) {
    if (getCurrentDisplayId(win) === displayId) {
      return true;
    }
    await new Promise<void>((resolve) => win.setTimeout(resolve, 75));
  }
  return false;
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
    if (!remote || !screen) {
      return null;
    }
    const target = screen.getAllDisplays().find((display) => display.id === displayId);
    if (!target) {
      return null;
    }
    const nativeWindow = getNativeWindow(win);
    if (!nativeWindow) {
      return null;
    }
    const currentBounds = nativeWindow.getBounds();
    const currentDisplay = screen.getDisplayMatching(currentBounds);
    const windowId = getNativeWindowId(nativeWindow);
    if (currentDisplay.id === displayId && !moveIfAlreadyOnDisplay) {
      return null;
    }
    const snapshot: NativeWindowPlacementSnapshot = {
      windowId,
      sourceDisplayId: currentDisplay.id,
      bounds: { ...currentBounds },
      maximized: nativeWindow.isMaximized?.() ?? false,
    };
    if (snapshot.maximized) nativeWindow.unmaximize?.();
    const area = target.workArea ?? target.bounds;
    const requestedBounds = fillWorkArea
      ? { ...area }
      : {
          x: area.x + Math.round(area.width * 0.08),
          y: area.y + Math.round(area.height * 0.08),
          width: Math.max(Math.round(area.width * 0.84), 480),
          height: Math.max(Math.round(area.height * 0.84), 360),
        };
    nativeWindow.setBounds(requestedBounds, false);
    const actual = nativeWindow.getBounds();
    return snapshot;
  } catch {
    return null;
  }
}

function rectsOverlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function safeRestoreBounds(
  snapshot: NativeWindowPlacementSnapshot,
  displays: readonly ElectronDisplayLike[],
  primary: ElectronDisplayLike,
): { x: number; y: number; width: number; height: number } {
  if (displays.some((display) => rectsOverlap(snapshot.bounds, display.bounds))) {
    return { ...snapshot.bounds };
  }
  const source = displays.find((display) => display.id === snapshot.sourceDisplayId) ?? primary;
  const area = source.workArea ?? source.bounds;
  const width = Math.min(Math.max(snapshot.bounds.width, 480), area.width);
  const height = Math.min(Math.max(snapshot.bounds.height, 360), area.height);
  return {
    x: area.x + Math.max(0, Math.round((area.width - width) / 2)),
    y: area.y + Math.max(0, Math.round((area.height - height) / 2)),
    width,
    height,
  };
}

function resolveCapturedNativeWindow(
  win: Window,
  snapshot: NativeWindowPlacementSnapshot,
): { remote: ElectronRemoteLike; screen: ElectronScreenLike; nativeWindow: ElectronBrowserWindowLike } | null {
  const remote = getRemote(win);
  const screen = remote?.screen;
  if (!remote || !screen) return null;
  const nativeWindow =
    getNativeWindowById(remote, snapshot.windowId) ??
    (snapshot.windowId === null ? getNativeWindow(win) : null);
  return nativeWindow ? { remote, screen, nativeWindow } : null;
}

function applyRestorePlacement(
  screen: ElectronScreenLike,
  nativeWindow: ElectronBrowserWindowLike,
  snapshot: NativeWindowPlacementSnapshot,
): { x: number; y: number; width: number; height: number } {
  const requested = safeRestoreBounds(
    snapshot,
    screen.getAllDisplays(),
    screen.getPrimaryDisplay(),
  );
  if (nativeWindow.isMaximized?.()) nativeWindow.unmaximize?.();
  nativeWindow.setBounds(requested, false);
  if (snapshot.maximized) nativeWindow.maximize?.();
  return requested;
}

function placementNeedsRepair(
  screen: ElectronScreenLike,
  nativeWindow: ElectronBrowserWindowLike,
  snapshot: NativeWindowPlacementSnapshot,
): boolean {
  const bounds = nativeWindow.getBounds();
  const displays = screen.getAllDisplays();
  const visible = displays.some((display) => rectsOverlap(bounds, display.bounds));
  if (!visible) return true;
  if (snapshot.sourceDisplayId === null) return false;
  return screen.getDisplayMatching(bounds).id !== snapshot.sourceDisplayId;
}

/** Restores the exact native window captured by moveWindowToDisplay, never a geometry-rematched peer. */
export function restoreWindowPlacement(
  win: Window,
  snapshot: NativeWindowPlacementSnapshot | null,
): void {
  if (!snapshot) return;
  try {
    const resolved = resolveCapturedNativeWindow(win, snapshot);
    if (!resolved) {
      return;
    }
    const { screen, nativeWindow } = resolved;
    applyRestorePlacement(screen, nativeWindow, snapshot);
  } catch {
    // Best-effort desktop window restoration.
  }
}

/**
 * Restores a moved/fullscreen host after macOS has finished its native fullscreen transition.
 *
 * Safari/Electron's DOM fullscreen promise can resolve before macOS has finished moving the native
 * window out of its fullscreen Space. The OS can therefore overwrite a correct setBounds call a
 * fraction of a second later. This helper waits for native fullscreen to clear, restores once, then
 * watches briefly and repairs only if the captured window drifts off its original display or fully
 * off-screen.
 */
export async function restoreWindowPlacementStable(
  win: Window,
  snapshot: NativeWindowPlacementSnapshot | null,
  timeoutMs = 2400,
  monitorMs = 900,
): Promise<void> {
  if (!snapshot) return;
  const resolved = resolveCapturedNativeWindow(win, snapshot);
  if (!resolved) {
    return;
  }
  const { screen, nativeWindow } = resolved;
  const started = Date.now();
  while (nativeWindow.isFullScreen?.() && Date.now() - started < timeoutMs) {
    await new Promise<void>((resolve) => win.setTimeout(resolve, 75));
  }

  restoreWindowPlacement(win, snapshot);
  const monitorStarted = Date.now();
  while (Date.now() - monitorStarted < monitorMs) {
    await new Promise<void>((resolve) => win.setTimeout(resolve, 125));
    if (nativeWindow.isFullScreen?.()) continue;
    if (!placementNeedsRepair(screen, nativeWindow, snapshot)) continue;
    applyRestorePlacement(screen, nativeWindow, snapshot);
  }
}
