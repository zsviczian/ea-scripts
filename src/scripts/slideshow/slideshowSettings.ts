/**
 * @file slideshowSettings.ts
 * @overview Persistent slideshow configuration and its script-settings modal.
 */

import type { SlideshowTranslator } from "./lang";
import type { PresentationPathType, SlideshowConfig } from "./types";

export const DEFAULT_SLIDESHOW_CONFIG: SlideshowConfig = {
  transitionStepCount: 100,
  transitionDelay: 1000,
  frameSleep: 1,
  editZoomOut: 0.7,
  fadeLevel: 0.1,
  printSlideWidth: 1920,
  printSlideHeight: 1080,
  maxZoom: 30,
};

const CONFIG_KEYS = Object.keys(DEFAULT_SLIDESHOW_CONFIG) as Array<keyof SlideshowConfig>;

export type SlideshowStartMode = "beginning" | "resume" | "current";
export type SlideshowWindowMode = "fullscreen" | "window";
export type SlideshowNotesMode = "slides" | "presenter";

export interface SlideshowLaunchPreferences {
  startMode: SlideshowStartMode;
  windowMode: SlideshowWindowMode;
  notesMode: SlideshowNotesMode;
  presentationType?: PresentationPathType;
}

export interface SlideshowDisplayPreferences {
  presentationDisplayId: number | null;
  presenterDisplayId: number | null;
  presentationDisplayIdentity?: string | null;
  presenterDisplayIdentity?: string | null;
}

const START_MODE_SETTING = "slideshowStartMode";
const WINDOW_MODE_SETTING = "slideshowWindowMode";
const NOTES_MODE_SETTING = "slideshowNotesMode";
const PRESENTATION_TYPE_SETTING = "slideshowPresentationType";
const DISPLAY_TARGETS_SETTING = "slideshowDisplayTargetsByDevice";
const DISPLAY_TARGETS_BY_CONFIGURATION_SETTING =
  "slideshowDisplayTargetsByDeviceConfiguration";
const PRESENTER_NOTES_FONT_SIZE_SETTING = "slideshowPresenterNotesFontSize";
const SORTER_THUMBNAIL_MAX_WIDTH_SETTING = "slideshowSorterThumbnailMaxWidth";
const LEGACY_LAUNCH_MODE_SETTING = "slideshowLaunchMode";
const LEGACY_START_FULLSCREEN_SETTING = "slideshowStartFullscreen";

export const DEFAULT_PRESENTER_NOTES_FONT_SIZE = 18;
export const DEFAULT_SORTER_THUMBNAIL_MAX_WIDTH = 280;

function readSettings(ea: ExcalidrawAutomate): Record<string, unknown> {
  const getSettings = (ea as ExcalidrawAutomate & {
    getScriptSettings?: () => Record<string, unknown>;
  }).getScriptSettings;
  return typeof getSettings === "function" ? getSettings.call(ea) : {};
}

/** Reads the user's most recently selected presentation launch behavior. */
export function loadSlideshowLaunchPreferences(
  ea: ExcalidrawAutomate,
): SlideshowLaunchPreferences {
  const settings = readSettings(ea);
  const legacyMode = settings[LEGACY_LAUNCH_MODE_SETTING];
  const rawStartMode = settings[START_MODE_SETTING];
  const startMode: SlideshowStartMode =
    rawStartMode === "resume" || rawStartMode === "current"
      ? rawStartMode
      : rawStartMode === "beginning"
        ? "beginning"
        : legacyMode === "resume" || legacyMode === "current"
          ? legacyMode
          : "beginning";
  const rawWindowMode = settings[WINDOW_MODE_SETTING];
  const windowMode: SlideshowWindowMode =
    rawWindowMode === "window" || rawWindowMode === "fullscreen"
      ? rawWindowMode
      : settings[LEGACY_START_FULLSCREEN_SETTING] === false
        ? "window"
        : "fullscreen";
  const rawNotesMode = settings[NOTES_MODE_SETTING];
  const notesMode: SlideshowNotesMode =
    rawNotesMode === "presenter" || rawNotesMode === "slides"
      ? rawNotesMode
      : legacyMode === "presenter"
        ? "presenter"
        : "slides";
  const rawPresentationType = settings[PRESENTATION_TYPE_SETTING];
  const presentationType: PresentationPathType | undefined =
    rawPresentationType === "frame" || rawPresentationType === "line"
      ? rawPresentationType
      : undefined;
  return {
    startMode,
    windowMode,
    notesMode,
    ...(presentationType ? { presentationType } : {}),
  };
}

/** Persists launch preferences without disturbing slideshow config or unrelated script settings. */
export async function saveSlideshowLaunchPreferences(
  ea: ExcalidrawAutomate,
  preferences: SlideshowLaunchPreferences,
): Promise<void> {
  const settings = ea.getScriptSettings();
  await ea.setScriptSettings({
    ...settings,
    [START_MODE_SETTING]: preferences.startMode,
    [WINDOW_MODE_SETTING]: preferences.windowMode,
    [NOTES_MODE_SETTING]: preferences.notesMode,
    ...(preferences.presentationType
      ? { [PRESENTATION_TYPE_SETTING]: preferences.presentationType }
      : {}),
  });
}

function asDisplayPreferences(value: unknown): SlideshowDisplayPreferences | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const normalizeId = (id: unknown): number | null | undefined => {
    if (id === null) return null;
    return typeof id === "number" && Number.isFinite(id) ? id : undefined;
  };
  const normalizeIdentity = (identity: unknown): string | null | undefined => {
    if (identity === null) return null;
    return typeof identity === "string" && identity.length > 0 ? identity : undefined;
  };
  const presentationDisplayId = normalizeId(record.presentationDisplayId);
  const presenterDisplayId = normalizeId(record.presenterDisplayId);
  if (presentationDisplayId === undefined || presenterDisplayId === undefined) return null;
  const presentationDisplayIdentity = normalizeIdentity(record.presentationDisplayIdentity);
  const presenterDisplayIdentity = normalizeIdentity(record.presenterDisplayIdentity);
  return {
    presentationDisplayId,
    presenterDisplayId,
    ...(presentationDisplayIdentity !== undefined ? { presentationDisplayIdentity } : {}),
    ...(presenterDisplayIdentity !== undefined ? { presenterDisplayIdentity } : {}),
  };
}

/** Reads monitor choices for one local device and, when supplied, one monitor configuration. */
export function loadSlideshowDisplayPreferences(
  ea: ExcalidrawAutomate,
  deviceKey: string,
  configurationKey?: string,
): SlideshowDisplayPreferences | null {
  const settings = readSettings(ea);
  if (configurationKey) {
    const configuredRaw = settings[DISPLAY_TARGETS_BY_CONFIGURATION_SETTING];
    if (configuredRaw && typeof configuredRaw === "object" && !Array.isArray(configuredRaw)) {
      const byDevice = (configuredRaw as Record<string, unknown>)[deviceKey];
      if (byDevice && typeof byDevice === "object" && !Array.isArray(byDevice)) {
        const configured = asDisplayPreferences(
          (byDevice as Record<string, unknown>)[configurationKey],
        );
        if (configured) return configured;
      }
    }
  }

  const legacyRaw = settings[DISPLAY_TARGETS_SETTING];
  if (!legacyRaw || typeof legacyRaw !== "object" || Array.isArray(legacyRaw)) return null;
  return asDisplayPreferences((legacyRaw as Record<string, unknown>)[deviceKey]);
}

/** Persists monitor choices independently for each local device and monitor configuration. */
export async function saveSlideshowDisplayPreferences(
  ea: ExcalidrawAutomate,
  deviceKey: string,
  preferences: SlideshowDisplayPreferences,
  configurationKey?: string,
): Promise<void> {
  const settings = ea.getScriptSettings();
  if (!configurationKey) {
    const existingRaw = settings[DISPLAY_TARGETS_SETTING];
    const existing =
      existingRaw && typeof existingRaw === "object" && !Array.isArray(existingRaw)
        ? (existingRaw as Record<string, unknown>)
        : {};
    await ea.setScriptSettings({
      ...settings,
      [DISPLAY_TARGETS_SETTING]: {
        ...existing,
        [deviceKey]: { ...preferences },
      },
    });
    return;
  }

  const existingRaw = settings[DISPLAY_TARGETS_BY_CONFIGURATION_SETTING];
  const existing =
    existingRaw && typeof existingRaw === "object" && !Array.isArray(existingRaw)
      ? (existingRaw as Record<string, unknown>)
      : {};
  const existingDeviceRaw = existing[deviceKey];
  const existingDevice =
    existingDeviceRaw &&
    typeof existingDeviceRaw === "object" &&
    !Array.isArray(existingDeviceRaw)
      ? (existingDeviceRaw as Record<string, unknown>)
      : {};
  await ea.setScriptSettings({
    ...settings,
    [DISPLAY_TARGETS_BY_CONFIGURATION_SETTING]: {
      ...existing,
      [deviceKey]: {
        ...existingDevice,
        [configurationKey]: { ...preferences },
      },
    },
  });
}

/** Reads the persisted presenter-notes font size in pixels. */
export function loadPresenterNotesFontSize(ea: ExcalidrawAutomate): number {
  const raw = readSettings(ea)[PRESENTER_NOTES_FONT_SIZE_SETTING];
  const value =
    typeof raw === "number" && Number.isFinite(raw) ? raw : DEFAULT_PRESENTER_NOTES_FONT_SIZE;
  return Math.min(48, Math.max(12, Math.round(value)));
}

/** Persists the presenter-notes font size without disturbing other script settings. */
export async function savePresenterNotesFontSize(
  ea: ExcalidrawAutomate,
  fontSize: number,
): Promise<void> {
  const value = Math.min(48, Math.max(12, Math.round(fontSize)));
  await ea.setScriptSettings({
    ...ea.getScriptSettings(),
    [PRESENTER_NOTES_FONT_SIZE_SETTING]: value,
  });
}

/** Reads the persisted maximum slide-sorter thumbnail width in pixels. */
export function loadSorterThumbnailMaxWidth(ea: ExcalidrawAutomate): number {
  const raw = readSettings(ea)[SORTER_THUMBNAIL_MAX_WIDTH_SETTING];
  const value =
    typeof raw === "number" && Number.isFinite(raw) ? raw : DEFAULT_SORTER_THUMBNAIL_MAX_WIDTH;
  return Math.min(520, Math.max(140, Math.round(value)));
}

/** Persists the maximum slide-sorter thumbnail width without disturbing other settings. */
export async function saveSorterThumbnailMaxWidth(
  ea: ExcalidrawAutomate,
  width: number,
): Promise<void> {
  const value = Math.min(520, Math.max(140, Math.round(width)));
  await ea.setScriptSettings({
    ...ea.getScriptSettings(),
    [SORTER_THUMBNAIL_MAX_WIDTH_SETTING]: value,
  });
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** Normalizes persisted values while retaining the historical defaults for missing data. */
export function normalizeSlideshowConfig(settings: Record<string, unknown>): SlideshowConfig {
  return {
    transitionStepCount: Math.max(
      1,
      Math.round(finiteNumber(settings.transitionStepCount, DEFAULT_SLIDESHOW_CONFIG.transitionStepCount)),
    ),
    transitionDelay: Math.max(
      1,
      finiteNumber(settings.transitionDelay, DEFAULT_SLIDESHOW_CONFIG.transitionDelay),
    ),
    frameSleep: Math.max(0, finiteNumber(settings.frameSleep, DEFAULT_SLIDESHOW_CONFIG.frameSleep)),
    editZoomOut: Math.max(
      0.05,
      finiteNumber(settings.editZoomOut, DEFAULT_SLIDESHOW_CONFIG.editZoomOut),
    ),
    fadeLevel: Math.min(
      1,
      Math.max(0, finiteNumber(settings.fadeLevel, DEFAULT_SLIDESHOW_CONFIG.fadeLevel)),
    ),
    printSlideWidth: Math.max(
      1,
      Math.round(finiteNumber(settings.printSlideWidth, DEFAULT_SLIDESHOW_CONFIG.printSlideWidth)),
    ),
    printSlideHeight: Math.max(
      1,
      Math.round(finiteNumber(settings.printSlideHeight, DEFAULT_SLIDESHOW_CONFIG.printSlideHeight)),
    ),
    maxZoom: Math.max(0.1, finiteNumber(settings.maxZoom, DEFAULT_SLIDESHOW_CONFIG.maxZoom)),
  };
}

/** Reads the active slideshow script's persisted configuration. */
export function loadSlideshowConfig(ea: ExcalidrawAutomate): SlideshowConfig {
  return normalizeSlideshowConfig(ea.getScriptSettings());
}

/** Persists only slideshow config keys while preserving any unrelated script settings. */
export async function saveSlideshowConfig(
  ea: ExcalidrawAutomate,
  config: SlideshowConfig,
): Promise<void> {
  const existing = ea.getScriptSettings();
  const next: Record<string, unknown> = { ...existing };
  for (const key of CONFIG_KEYS) next[key] = config[key];
  await ea.setScriptSettings(next);
}

/** Resets an in-memory slideshow configuration to the built-in defaults. */
export function resetSlideshowConfigToDefaults(config: SlideshowConfig): void {
  Object.assign(config, DEFAULT_SLIDESHOW_CONFIG);
}

function addNumberSetting(
  ea: ExcalidrawAutomate,
  container: HTMLElement,
  name: string,
  description: string,
  value: number,
  onChange: (value: number) => void,
): void {
  new ea.obsidian.Setting(container)
    .setName(name)
    .setDesc(description)
    .addText((text) => {
      text.inputEl.type = "number";
      text.inputEl.step = "any";
      text.setValue(String(value)).onChange((raw) => {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) onChange(parsed);
      });
    });
}

/** Opens the script-owned slideshow configuration modal. */
export function openSlideshowSettingsModal(
  ea: ExcalidrawAutomate,
  config: SlideshowConfig,
  t: SlideshowTranslator,
  onSaved: () => void,
): void {
  const modal = new ea.obsidian.Modal(app);
  modal.titleEl.setText(t("settingsTitle"));
  const draft: SlideshowConfig = { ...config };

  const renderContent = () => {
    const { contentEl } = modal;
    contentEl.empty();

    addNumberSetting(
      ea,
      contentEl,
      t("settingsTransitionStepCount"),
      t("settingsTransitionStepCountDesc"),
      draft.transitionStepCount,
      (value) => {
        draft.transitionStepCount = value;
      },
    );
    addNumberSetting(
      ea,
      contentEl,
      t("settingsTransitionDelay"),
      t("settingsTransitionDelayDesc"),
      draft.transitionDelay,
      (value) => {
        draft.transitionDelay = value;
      },
    );
    addNumberSetting(
      ea,
      contentEl,
      t("settingsFrameSleep"),
      t("settingsFrameSleepDesc"),
      draft.frameSleep,
      (value) => {
        draft.frameSleep = value;
      },
    );
    addNumberSetting(
      ea,
      contentEl,
      t("settingsEditZoomOut"),
      t("settingsEditZoomOutDesc"),
      draft.editZoomOut,
      (value) => {
        draft.editZoomOut = value;
      },
    );
    addNumberSetting(
      ea,
      contentEl,
      t("settingsFadeLevel"),
      t("settingsFadeLevelDesc"),
      draft.fadeLevel,
      (value) => {
        draft.fadeLevel = value;
      },
    );
    addNumberSetting(
      ea,
      contentEl,
      t("settingsPrintSlideWidth"),
      t("settingsPrintSlideWidthDesc"),
      draft.printSlideWidth,
      (value) => {
        draft.printSlideWidth = value;
      },
    );
    addNumberSetting(
      ea,
      contentEl,
      t("settingsPrintSlideHeight"),
      t("settingsPrintSlideHeightDesc"),
      draft.printSlideHeight,
      (value) => {
        draft.printSlideHeight = value;
      },
    );
    addNumberSetting(
      ea,
      contentEl,
      t("settingsMaxZoom"),
      t("settingsMaxZoomDesc"),
      draft.maxZoom,
      (value) => {
        draft.maxZoom = value;
      },
    );

    const actions = contentEl.createDiv({ cls: "modal-button-container" });
    const resetButton = actions.createEl("button", { text: t("settingsResetDefaults") });
    resetButton.addEventListener("click", () => {
      resetSlideshowConfigToDefaults(draft);
      renderContent();
    });
    const cancelButton = actions.createEl("button", { text: t("settingsCancel") });
    cancelButton.addEventListener("click", () => modal.close());
    const saveButton = actions.createEl("button", {
      text: t("settingsSave"),
      cls: "mod-cta",
    });
    saveButton.addEventListener("click", () => {
      void (async () => {
        try {
          const normalized = normalizeSlideshowConfig(
            draft as unknown as Record<string, unknown>,
          );
          await saveSlideshowConfig(ea, normalized);
          Object.assign(config, normalized);
          onSaved();
          modal.close();
          new Notice(t("settingsSaved"));
        } catch (error) {
          console.error("Slideshow settings save failed", error);
          new Notice(t("settingsSaveFailed"));
        }
      })();
    });
  };

  modal.onOpen = renderContent;
  modal.open();
}
