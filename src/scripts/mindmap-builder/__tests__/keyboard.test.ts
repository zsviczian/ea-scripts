import { afterEach, expect, it, vi } from "vitest";
import { createKeyboard } from "../keyboard.js";

afterEach(() => vi.unstubAllGlobals());

/** Models a delayed focus callback after its EA's sidepanel has been detached. */
function detachedHost(): Record<string, unknown> {
  const activeLeaf = {};
  vi.stubGlobal("app", {
    workspace: { activeLeaf },
    keymap: { getRootScope: vi.fn() },
  });
  vi.stubGlobal("ontologyEl", {});
  return {
    isViewSet: () => true,
    SCOPE: { none: 0, input: 3, excalidraw: 2, global: 1 },
    ea: {
      sidepanelTab: null,
      targetView: { leaf: { isVisible: () => true } },
      getSidepanelLeaf: () => activeLeaf,
    },
    sidepanelWindow: { document: { activeElement: null } },
    inputEl: {},
  };
}

it("returns no hotkey scope after the host sidepanel has closed", () => {
  expect(createKeyboard(detachedHost()).getHotkeyContext()).toBe(0);
});

it("does not pop a newer runtime's scope from an obsolete delayed callback", () => {
  const context = detachedHost();
  const popScope = vi.fn();
  vi.stubGlobal("window", { MindmapBuilder: { popObsidianHotkeyScope: popScope } });
  createKeyboard(context).registerObsidianHotkeyOverrides();
  expect(popScope).not.toHaveBeenCalled();
});

interface ScopeHandler {
  key: string | null;
  func: (event: KeyboardEvent) => unknown;
}

/** Implements Scope's verified fall-through rule, including explicit-key undefined returns. */
class TestScope {
  keys: ScopeHandler[] = [];

  register(
    _modifiers: string[] | null,
    key: string | null,
    func: ScopeHandler["func"],
  ): ScopeHandler {
    const handler = { key, func };
    this.keys.push(handler);
    return handler;
  }

  unregister(handler: ScopeHandler): void {
    this.keys = this.keys.filter((candidate) => candidate !== handler);
  }

  handleKey(event: KeyboardEvent): unknown {
    for (const handler of this.keys) {
      if (handler.key !== null && handler.key !== event.key) continue;
      const result = handler.func(event);
      if (result !== undefined || handler.key !== null) return result;
    }
    return undefined;
  }
}

/** Builds a focused input host with a real-shaped root scope and EA cleanup lane. */
function activeHost(): {
  context: Record<string, unknown>;
  scope: TestScope;
  document: { activeElement: object };
  cleanups: (() => void)[];
} {
  const scope = new TestScope();
  const input = {};
  const document = { activeElement: input };
  const leaf = { isVisible: () => true };
  const cleanups: (() => void)[] = [];
  vi.stubGlobal("window", { MindmapBuilder: { keydownHandlers: [] } });
  vi.stubGlobal("ontologyEl", {});
  vi.stubGlobal("app", { workspace: { activeLeaf: leaf }, keymap: { getRootScope: () => scope } });
  const context = {
    isViewSet: () => true,
    isRecordingHotkey: false,
    SCOPE: { none: 0, input: 3, excalidraw: 2, global: 1 },
    ea: {
      sidepanelTab: { isVisible: () => true },
      targetView: { leaf },
      getSidepanelLeaf: () => ({}),
      registerCleanup: (cleanup: () => void) => cleanups.push(cleanup),
    },
    sidepanelWindow: { document },
    inputEl: input,
    getAppState: () => ({}),
    RUNTIME_HOTKEYS: [{ action: "add", key: "Enter", modifiers: [], scope: 3, isInputOnly: true }],
  };
  return { context, scope, document, cleanups };
}

/** Creates the unmodified Enter event consumed by Obsidian's root scope. */
function enter(target: object): KeyboardEvent {
  return {
    key: "Enter",
    code: "Enter",
    target,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

it("lets Markdown's Enter handler run when focus moves without a blur callback", () => {
  const host = activeHost();
  const markdownEnter = vi.fn(() => false);
  host.scope.register([], "Enter", markdownEnter);
  createKeyboard(host.context).registerObsidianHotkeyOverrides();
  expect(host.scope.handleKey(enter(host.document.activeElement))).toBe(true);
  const markdownEditor = {};
  host.document.activeElement = markdownEditor;
  expect(host.scope.handleKey(enter(markdownEditor))).toBe(false);
  expect(markdownEnter).toHaveBeenCalledOnce();
});

it("releases exact owned root handlers on EA destruction even if the window alias is lost", () => {
  const host = activeHost();
  const original = host.scope.register([], "Enter", () => false);
  createKeyboard(host.context).registerObsidianHotkeyOverrides();
  vi.stubGlobal("window", { MindmapBuilder: { keydownHandlers: [] } });
  host.cleanups.forEach((cleanup) => cleanup());
  expect(host.scope.keys).toEqual([original]);
});
