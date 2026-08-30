/**
 * @file slideshowSettings.ts
 * @overview Persistent slideshow configuration and its script-settings modal.
 */

import type { SlideshowTranslator } from "./lang";
import type { SlideshowConfig } from "./types";

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

export type SlideshowLaunchMode = "beginning" | "resume" | "presenter" | "current";

export interface SlideshowLaunchPreferences {
  mode: SlideshowLaunchMode;
  startFullscreen: boolean;
}

const LAUNCH_MODE_SETTING = "slideshowLaunchMode";
const START_FULLSCREEN_SETTING = "slideshowStartFullscreen";

/** Reads the user's most recently selected presentation launch behavior. */
export function loadSlideshowLaunchPreferences(
  ea: ExcalidrawAutomate,
): SlideshowLaunchPreferences {
  const getSettings = (ea as ExcalidrawAutomate & {
    getScriptSettings?: () => Record<string, unknown>;
  }).getScriptSettings;
  const settings = typeof getSettings === "function" ? getSettings.call(ea) : {};
  const rawMode = settings[LAUNCH_MODE_SETTING];
  const mode: SlideshowLaunchMode =
    rawMode === "resume" || rawMode === "presenter" || rawMode === "current"
      ? rawMode
      : "beginning";
  return {
    mode,
    startFullscreen:
      typeof settings[START_FULLSCREEN_SETTING] === "boolean"
        ? (settings[START_FULLSCREEN_SETTING] as boolean)
        : true,
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
    [LAUNCH_MODE_SETTING]: preferences.mode,
    [START_FULLSCREEN_SETTING]: preferences.startFullscreen,
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
