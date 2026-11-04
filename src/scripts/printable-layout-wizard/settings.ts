/** Stable persisted keys and values from the original published script. */
export const PAGE_SIZES = [
  "A0",
  "A1",
  "A2",
  "A3",
  "A4",
  "A5",
  "A6",
  "Letter",
  "Legal",
  "Tabloid",
  "Ledger",
] as const;
export const MARGINS = { none: 0, tiny: 10, normal: 60 } as const;
export const KEYS = {
  size: "Page size",
  orientation: "Page orientation",
  margin: "Print-margin",
  lock: "Lock frame after it is created",
  zoom: "Should zoom after adding page",
  close: "Should close after adding page",
  empty: "Print empty pages",
  markers: "Print only marker frames",
} as const;
export type Preference = keyof typeof KEYS;
export interface SettingValue {
  value: string | boolean;
  valueset?: readonly string[];
  valueSet?: readonly string[];
  [key: string]: unknown;
}
export type WizardSettings = Record<string, unknown> &
  Record<(typeof KEYS)[Preference], SettingValue>;

/** Fills missing defaults and repairs legacy valueSet casing, preserving unfamiliar settings. */
export function loadSettings(stored: object): WizardSettings {
  const settings = structuredClone(stored) as WizardSettings;
  const defaults = {
    size: { value: "A4", valueset: PAGE_SIZES },
    orientation: { value: "portrait", valueset: ["portrait", "landscape"] },
    margin: { value: "none", valueset: Object.keys(MARGINS) },
    lock: { value: true },
    zoom: { value: false },
    close: { value: false },
    empty: { value: false },
    markers: { value: true },
  };
  for (const key of Object.keys(KEYS) as Preference[]) {
    const name = KEYS[key];
    settings[name] ??= defaults[key];
    if (settings[name].valueSet) {
      settings[name].valueset = settings[name].valueSet;
      delete settings[name].valueSet;
    }
  }
  return settings;
}
