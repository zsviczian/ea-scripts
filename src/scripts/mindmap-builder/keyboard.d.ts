/** Narrow test surface for the legacy subsystem's detached-sidepanel guards. */
export function createKeyboard(context: Record<string, unknown>): {
  getHotkeyContext: () => number;
  registerObsidianHotkeyOverrides: () => void;
  removeObsidianHotkeyOverrides: () => void;
  handleKeydown: (event: KeyboardEvent) => void;
};
