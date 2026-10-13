# Enter interception investigation — 2026-10-13

The reported incident cannot be attributed to one specific scope without inspecting that live session. A pre-existing bug matching **ordinary typing works but Enter stops working after the UI is gone** was reproduced in the named test vault.

## Confirmed mechanism

The inline link suggester pushes a scope containing an Enter handler that returns `false`, consuming Enter even with an empty suggestion list. Previously, `InlineLinkSuggester.close()` popped it only when the dropdown was still connected. Removing the dropdown or its parent first left the scope active. Mindmap Builder also replaced inputs during docking without closing the previous suggester, and did not close it in its sidepanel close hook.

The native reproduction opened suggestions, detached the dropdown, and called `close()`. Before the fix, the scope remained active and its empty Enter handler returned `false`. After deploying the fix, the same reproduction released the scope. The conditional pop and missing script cleanup also exist in the original pre-extraction source.

An awaited heading/block/frame lookup could reopen suggestions after close, and a previous close timer could clear key blocking for a newer session. The plugin now invalidates pending lookups on close and scopes the timer to the suggestion generation.

## Script cleanup

- Close the previous suggester before replacing/removing inputs, docking, migration, and sidepanel teardown.
- Keep the ontology input reference inside the invocation instead of an implicit global.
- `HotkeyRecorder` owns the exact pushed scope, cancels previous recording sessions, and releases it on cancellation, close, EA destruction, and exceptional exits. The old recorder reused a mutable scope handle and did not cancel on sidepanel close.
- Root hotkey overrides and DOM keyboard listeners have instance-owned EA cleanup. Their window alias is no longer their sole cleanup handle.
- A wildcard root handler checks live focus and dispatch eligibility on each event and falls through to Obsidian otherwise. Input-only actions remain input-only. An explicit-key handler returning `undefined` still stops Scope's scan, so it cannot provide that fallback.

## Validation

All 29 Mindmap Builder tests and five plugin suggester tests pass. Two root-scope regressions failed before the fix: changing focus without a blur event still shadowed Markdown's Enter handler, and losing the window alias prevented EA cleanup. Suggester tests cover detached/nested scopes, repeated close, pending lookup completion, and old timers.

Focused lint and both builds pass. The full EA check still stops at 365 unrelated type errors, with none in Mindmap Builder. `npm install` restored the plugin's declared Excalidraw 0.18.143 package from an installed 0.18.140 without dependency/lockfile changes. The guarded plugin-only smoke passed and deployed only to `excalidraw-test`.

On macOS with Obsidian 1.14.4 / Excalidraw 2.29.0, the original migration scenarios passed, including direct-popout editing, undo/redo, save/reopen, and close/reopen. Additional checks started two recordings consecutively, closed the sidepanel, and verified restoration of the original scope. Opening suggestions, undocking/docking, and switching to a disposable Markdown note allowed native CDP Enter to insert a newline before and after closing Mindmap Builder. The final error buffer was empty; exact fixtures/controllers/hooks were cleaned up. An initial drawing-creation CLI timeout cleaned up successfully; the warmed retry passed.

Final script SHA-256: `4fdd700d5480e0012c06e680cb633ef39f1e2bb863b8bc46af20cf6f9c00363e`.

Restart Obsidian once before retesting an already affected session: an old orphaned scope may no longer have a reachable cleanup handle. Use both the rebuilt script and updated plugin. Physical mobile, Windows, and recording in a migrated/undocked popout remain separate manual gates.
