import type { Keymap, Scope } from "obsidian";

/** Owns the exact recording scope, including cancellation and exceptional exits. */
export class HotkeyRecorder {
  private finish: (() => void) | null = null;

  constructor(
    private readonly keymap: Pick<Keymap, "pushScope" | "popScope">,
    private readonly createScope: () => Scope,
  ) {}

  /** Starts one recording, releasing the previous session before pushing a new scope. */
  start(onKey: (event: KeyboardEvent) => void, onFinish: () => void): void {
    this.cancel();
    const scope = this.createScope();
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (this.finish === finish) this.finish = null;
      try {
        this.keymap.popScope(scope);
      } finally {
        onFinish();
      }
    };
    this.finish = finish;
    try {
      scope.register(null, null, (event) => {
        if (finished) return undefined;
        if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return false;
        try {
          onKey(event);
        } finally {
          finish();
        }
        return false;
      });
      this.keymap.pushScope(scope);
    } catch (error) {
      finish();
      throw error;
    }
  }

  /** Idempotently releases the recording scope from its original window's stack. */
  cancel(): void {
    this.finish?.();
  }
}
