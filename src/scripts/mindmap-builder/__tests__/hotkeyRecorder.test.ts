import type { Scope } from "obsidian";
import { expect, it, vi } from "vitest";
import { HotkeyRecorder } from "../HotkeyRecorder";

/** Runs recording callbacks against an identity-preserving, nested scope stack. */
function recordingHarness(): {
  recorder: HotkeyRecorder;
  stack: Scope[];
  press: (key: string) => unknown;
} {
  const stack: Scope[] = [];
  const handlers = new Map<Scope, (event: KeyboardEvent) => unknown>();
  const keymap = {
    pushScope: (scope: Scope): void => {
      stack.push(scope);
    },
    popScope: (scope: Scope): void => {
      const index = stack.indexOf(scope);
      if (index !== -1) stack.splice(index, 1);
    },
  };
  const createScope = (): Scope => {
    const scope = {
      register: (_mods: null, _key: null, handler: (event: KeyboardEvent) => unknown): void => {
        handlers.set(scope as unknown as Scope, handler);
      },
    };
    return scope as unknown as Scope;
  };
  return {
    recorder: new HotkeyRecorder(keymap, createScope),
    stack,
    press: (key: string) => {
      const scope = stack.at(-1);
      if (!scope) throw new Error("No recording scope");
      return handlers.get(scope)?.({ key } as KeyboardEvent);
    },
  };
}

it("replaces a recording without leaving the previous scope below the new one", () => {
  const { recorder, stack, press } = recordingHarness();
  const firstFinished = vi.fn();
  const secondFinished = vi.fn();
  recorder.start(vi.fn(), firstFinished);
  recorder.start(vi.fn(), secondFinished);
  expect(firstFinished).toHaveBeenCalledOnce();
  expect(stack).toHaveLength(1);
  expect(press("Enter")).toBe(false);
  expect(stack).toHaveLength(0);
  expect(secondFinished).toHaveBeenCalledOnce();
});

it("releases a scope when updating a recorded hotkey throws", () => {
  const { recorder, stack, press } = recordingHarness();
  const finished = vi.fn();
  recorder.start(() => {
    throw new Error("Detached control");
  }, finished);
  expect(() => press("Enter")).toThrow("Detached control");
  expect(stack).toHaveLength(0);
  recorder.cancel();
  expect(finished).toHaveBeenCalledOnce();
});

it("keeps modifier-only input recording, then releases it on explicit cancellation", () => {
  const { recorder, stack, press } = recordingHarness();
  const onKey = vi.fn();
  recorder.start(onKey, vi.fn());
  expect(press("Shift")).toBe(false);
  expect(onKey).not.toHaveBeenCalled();
  expect(stack).toHaveLength(1);
  recorder.cancel();
  expect(stack).toHaveLength(0);
});

it("does not pop a new recording started by an earlier recording's callback", () => {
  const { recorder, stack, press } = recordingHarness();
  recorder.start(() => recorder.start(vi.fn(), vi.fn()), vi.fn());
  press("Enter");
  expect(stack).toHaveLength(1);
  recorder.cancel();
  expect(stack).toHaveLength(0);
});
