# Migration validation — 2026-10-13

## Mermaid clipboard checkpoint — 2026-10-31

Mermaid paste accepts a complete fenced code block or plain `mindmap` outline. The sidepanel has a separate **Copy as Mermaid** button; floating controls, Markdown copy, and the existing copy hotkey retain their behavior. Shape interpretation is confined to Mermaid input. Ellipse/circle and diamond/hexagon mappings are documented in the README.

Automated coverage includes detection, indentation, supported shape delimiters and IDs, Markdown/wiki-link ambiguity, label escaping and line breaks, invalid roots rejected before scene writes, attaching to a selected node, folded descendants, nested submaps, visual ordering, and unchanged Markdown copy. The build and focused tests pass. Workspace typechecking matches the baseline (363 diagnostics); broad lint and tests retain their existing unrelated failures.

Manual validation still required: paste the README example with and without a selected node, check ellipse/diamond text sizing and arrow bindings, undo/redo, save/reopen, and copy the selected branch into a Mermaid renderer. Check **Copy as Mermaid** enabling/disabling when switching drawings and docking/undocking the input; it must remain in the sidepanel. Highest risk is shape sizing and selection ownership in the live editor. Cover the main window and a popout separately on Windows/macOS, and verify the sidepanel button and clipboard permissions on a physical mobile device. No live Obsidian validation is claimed for this checkpoint.

The sizing follow-up reproduces premature ellipse/diamond wrapping and oversized rectangular padding through the real node factory with a structural EA host. `textContainers.ts` sizes the inscribed text area using the fork's `getBoundTextMaxWidth()` contract and native font measurement/wrapping. It applies Builder's padding, computes the matching native text position before the scene write, preserves raw links and explicit line breaks, and keeps an edited container's center. Creation, sidepanel editing and box conversion use the same calculation. Short labels, long wrapped labels, legacy wrapping and rotated containers have focused coverage. The fork and plugin runtime sources are unchanged. Retest the reported Project Launch/Social Media/Email Campaign example in the main window and a popout; double-click labels to confirm unchanged wrapping/position, then check sidepanel editing, Box/Unbox, undo and save/reopen. Real font loading and mobile WebView metrics remain manual gates.

The preset startup follow-up restores the saved active preset before creating roots; missing or removed preset names fall back to Default. Initial defaults and corrected names are marked for saving, and hotkey initialization preserves earlier settings changes. Preset application and new roots retain a complete configuration snapshot, including the palette. Tests run real runtime initialization, new-root creation, Mermaid import and selection UI against structural hosts, and cover the first preset application to a modified map. Manual check: save a Default preset with a distinctive growth strategy, close/restart Builder, then create and paste new maps without touching the dropdown. Select another preset once, reopen Builder, and verify the dropdown and warning. Existing selected maps must keep their own settings. Test main-window and popout activation separately; no native Obsidian validation is claimed for this follow-up.

The script was moved into 38 import-safe JavaScript subsystem modules, with typed bootstrap/launcher code and script-local translation catalogs. The module map is in [CONTRIBUTING.md](CONTRIBUTING.md). This checkpoint does not claim a full TypeScript conversion.

## Source preservation and focused checks

- Structural AST comparison checked 243 extracted statements before the lifecycle correction: all were equivalent after reversing the explicit context-accessor substitutions and normalizing formatting/object-key syntax. The final implementation preserves 241 of those statements and deliberately changes the two hotkey-lifetime functions described below.
- Two regression tests first reproduced the null-sidepanel exception and an obsolete callback popping a newer runtime's hotkey scope. `keyboard.js` now returns before either action when the owning EA no longer has a sidepanel.
- All 23 Mindmap Builder tests passed, covering launcher reuse/version gating, catalogs/placeholders, traversal/cycles/submap roots/project membership, live layout settings/folds/pinned nodes/order, and detached-sidepanel callbacks.
- Focused TypeScript ESLint passed without warnings. The full TypeScript diagnostic output exactly matches a baseline configuration excluding Mindmap Builder: 365 unrelated errors, zero in the new script.
- `npm run build` in EA Scripts, `npm run mindmap` in the plugin, and the plugin's production `npm run build` passed. The copied Markdown and preview match the workspace output. Script-store checks passed.

## Native macOS runtime

Tested in the existing `excalidraw-test` vault using Obsidian 1.14.4 and its installed Excalidraw 2.29.0. No plugin runtime was deployed for this script check. The temporary script ran through the real Script Engine with a normal manual execution lifetime; CLI eval only orchestrated the test.

Final published script: **600,868 bytes**.

SHA-256: `fc277266442fd9a451859cd09f974c6248e88536d31d0c0a7511bad59624fabe`.

Passed: cold script launch and sidepanel readiness; root/child/grandchild creation; vertical and radial layout; fold/unfold; Markdown import/export; save; rebinding between drawings; direct-popout activation, node creation and save; undo/redo; saved-drawing reopen; sidepanel close and fresh runtime reopen. The final run captured no JavaScript errors. Exact temporary scripts/drawings, sidepanels, EA instances, settings entries, counters, and hook overrides were cleaned up.

Twenty repeated activations retained the same API and host EA. Script reads stayed at 2 and compilations at 1: **zero additional reads or compilations** during the repeated calls. The read count includes setup/sidepanel reads, not just the compilation loader. The timing samples measure completion of `executeScriptFile`, not actual UI paint; the cold call also returns before the synchronous template bootstrap's asynchronous sidepanel work finishes. No paint/latency claim is inferred from those timings.

An intermediate repeat stalled during CLI popout readiness after a possible focus interruption. Only the owned CLI subprocess was stopped, cleanup succeeded, and the final repeat passed with a hard timeout on the CLI subprocess. Obsidian was not terminated.

## Remaining platform gates and repository backlog

The workspace-wide test suite has nine pre-existing failures in Canvas Chat and slideshow; the same failures reproduce with Mindmap Builder excluded. `npm run check` stops at the existing type errors. The plugin's broad `npm run code` reports 120 existing lint errors outside the touched release-notes file; focused release-notes lint passes.

Windows, physical mobile touch, floating-input dragging/docking, persisted sidepanel restoration across application restart, and moved-tab window migration remain separate manual gates. Highest risk is window/listener ownership in the preserved UI lifecycle, especially undocked input controls. Main-window and direct-popout checks do not establish those gates.

## Compression decision

The old generated wrapper was 149,357 bytes. The readable output is larger, but compression is unnecessary for modern hotkey activation: plugin 2.27.0 introduced file compilation caching, and the launcher still reuses the resident sidepanel before initializing subsystem state. Compression would retain only a transfer/storage advantage and legacy first-read/compile tradeoffs while adding a decompression/second-compilation path on cold launch. The script's historical 2.23.4 minimum is retained; recommend 2.27.0 or newer for cached execution.
