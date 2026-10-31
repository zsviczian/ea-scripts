/** Narrow entry boundary; JavaScript implementation bodies remain outside TypeScript checking. */
export function createSettings(context: object): {
  initializePresets: () => void;
  applyPresetToGlobals: (name: string) => void;
  applyPresetToMap: (name: string, selected: object) => Promise<void>;
  extractConfigFromGlobals: () => Record<string, unknown>;
  diffMapConfig: (first: object, second: object) => boolean;
  refreshPresetDropdown: () => void;
  saveSettings: () => Promise<void>;
  setVal: (key: string, value: unknown, hidden?: boolean) => void;
};
export function resolvePresetName(presets: object, name: unknown): string;
