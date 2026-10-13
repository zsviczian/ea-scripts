# Maintaining Mindmap Builder

`main.ts` is the bootstrap, `run.ts` owns version checking and resident-sidepanel activation, and `lang/` owns the translation catalogs. The implementation moved from the plugin repository's `ea-scripts/Mindmap Builder.js.md` is split into 38 import-safe subsystem modules. `runtime.js` composes those modules and retains the per-invocation state and settings initialization. The algorithms, settings keys, public `window.MindMapBuilderAPI`, lifecycle hooks, timers, and DOM behavior are preserved. Initialization now returns the sidepanel creation promise so bootstrap failures can be reported.

| Responsibility | Modules |
| --- | --- |
| Configuration and saved settings | `configuration.js`, `settings.js` |
| Scene structure and selection | `graph.js`, `selection.js`, `grouping.js` |
| Layout | `layoutMetrics.js`, `horizontalLayout.js`, `verticalLayout.js`, `firstLevelLayout.js`, `layout.js` |
| Visual details | `arrows.js`, `boundaries.js`, `decorations.js`, `colors.js`, `folding.js` |
| Node operations | `nodes.js`, `nodeOrder.js`, `nodeStyles.js`, `nodeEditing.js`, `transactions.js` |
| Text and Markdown | `textParsing.js`, `markdownImport.js`, `markdownExport.js` |
| Keyboard actions and tasks | `keyboard.js`, `HotkeyRecorder.ts`, `actions.js`, `tasks.js` |
| Controls and modal classes | `inputUi.js`, `inputControls.js`, `sidepanelControls.js`, `helpUi.js`, `PaletteManagerModal.js`, `LayoutConfigModal.js` |
| UI lifetime and public API | `styles.js`, `floatingInput.js`, `lifecycle.js`, `sidepanelLifecycle.js`, `publicApi.js` |

Factories bind each subsystem to one invocation-owned context. The context uses explicit getters and setters into the original closure, so changing a settings object, selection, transaction state, input control, or owning window remains visible to every subsystem. Do not destructure mutable context properties into snapshots. The modal factories bind their classes to the invocation's `ea.FloatingModal` base and translator. Imports do not access Obsidian globals, construct UI, or register listeners. A separately tested close guard in `keyboard.js` stops delayed callbacks after their host sidepanel is detached, preventing a null-tab exception and preventing obsolete callbacks from popping a newer runtime's hotkey scope.

This is a mechanical module extraction, not a completed TypeScript conversion. `runtime.d.ts` types the entry boundary; `graph.d.ts` and `layoutMetrics.d.ts` expose narrow typed surfaces for callers and focused tests. TypeScript and the workspace's TypeScript ESLint configuration do not check the JavaScript implementation bodies. Do not use those declarations as evidence that the implementation is fully typed. Convert individual subsystems in separate, behavior-tested checkpoints. Existing DOM styling and window-global cleanup patterns also need their own lifecycle review; this move does not certify those patterns against current authoring guidance.

English and the existing simplified/traditional Chinese catalogs were preserved. German, Spanish, French, and Russian catalogs currently use English fallback. Use the shared translator and add maintained translations to these script-local files.

Run `npm run check` and `npm run build` in the EA Scripts workspace. From the sibling plugin checkout, `npm run mindmap` rebuilds the workspace and copies the resulting Markdown and preview to the existing published paths. Keep the published name **Mindmap Builder** to preserve script settings, command IDs, and sidepanel restoration. Update the directory-info mtime and script-store checks with publication changes.

Update `VERSION` in `main.ts` for a script release; the template's build timestamp is recorded separately. The deployment helper is a convenience for copying artifacts, not a second build/compression pipeline. It accepts an alternative workspace path with `npm run mindmap -- /path/to/ea-scripts`. See [Validation.md](Validation.md) for migration checks and [HotkeyCleanup.md](HotkeyCleanup.md) for the Enter interception investigation and follow-up fixes.

The previous deployment helper stripped everything before `const removeKeydownHandlers`, minified the body with Terser, compressed it with LZString, and generated a separate activation/decompression wrapper. The new build bundles source directly. Since plugin 2.27.0, `ScriptEngine.getCompiledScript()` caches the executable by path, mtime, and size and invalidates it on edit, rename, or deletion. Warm file execution does not read or compile the file. Raw source execution (`executeScript`) remains uncached. Compression only reduces transfer/storage size and potentially first-compile cost on old plugin versions; it adds decompression and a second compilation on cold launch. It is unnecessary for current hotkey activation.

Validate cold launch, repeated hotkey activation, switching drawings, close/reopen and restored sidepanels. Check adding/reordering/folding nodes, Markdown import/export, undo and save/reopen. Highest risk: lifecycle assumptions in the retained runtime, especially floating-input docking and keyboard handler ownership across main-window/popout migration. Test both windows on desktop; Windows/macOS and physical mobile touch remain separate gates. Desktop emulation does not prove mobile touch behavior.
