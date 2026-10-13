# Native branch paste — issue #2996

The existing Paste button/hotkey recognizes Excalidraw clipboard JSON containing
Builder nodes or structural branch arrows. Markdown and ordinary single-element
paste keep their existing dispatch paths. No plugin or Excalidraw component API
change is required.

The attachment concept follows the requester's [reference helper](https://gist.github.com/letmesignup/d53b2ab675a356180ea24ca206bb934b),
which attaches an already-pasted subtree. This implementation performs native
paste first, automatically uses the selected destination, and supports a forest
of copied branches. Missing external structural connectors and their labels are
omitted; cycles, duplicate IDs and multiple structural parents are rejected.

`branchClipboard.ts` validates graphs without mutating clipboard data.
`branchPaste.js` owns native paste, temporary transport markers, cancellation and
attachment. Native paste regenerates normal element/group/binding IDs and imports
the clipboard's files. Source-to-pasted ID markers repair Builder boundary/fold
references. Copied whole-map roots become additional roots when attached; ordinary
branches inherit destination layout. Copied styles, links, notes, submaps and pins
are retained. Disabled auto-layout is not enabled. A folded destination unfolds.

The native completion subscription, timeout and pointer-gesture cancellation are
operation scoped. A drawing switch, sidepanel close, EA destruction or new user
gesture cancels further attachment. A failed attachment leaves native-pasted
content intact. Focus is restored only when the operation remains in its original
drawing and was not cancelled.

Native history captures transport metadata before onChange. `pasteMetadata.js`
therefore retains an EA-owned scene subscription for each affected drawing to
remove resurrected markers and repair references during Undo/Redo. It retains ID
mappings, not clipboard contents. Subscriptions are disposed on sidepanel close
and EA cleanup; destroyed APIs are pruned when another drawing is observed. A
new invocation can reconstruct mappings from restored tags when Builder reopens
after a native Undo performed while it was closed. This is not
a global clipboard or keyboard listener.

Native canvas Undo/Redo can require multiple steps. Builder's input Undo follows
native history until the pasted roots disappear, stopping before preceding edits.
Redo replays the measured number of steps. `branchHistory.ts` bounds that traversal
and stops when the API is destroyed; scene-version checks prevent grouping after
intervening drawing edits.

Focused tests cover whitespace-tolerant dispatch, graph validation, container
normalization, omitted external connectors, file preservation, ID remapping,
attachment, independent maps/submaps, overlapping calls, timeout, teardown,
drawing switches, marker restoration and bounded history traversal.

Manual release coverage: copy a full folded branch with a boundary and grouped
notes, paste under a folded destination, and check unfolding/Undo/Redo. Repeat with
pins and nested submaps. Check Windows modifiers and physical mobile clipboard,
focus and touch separately. Native macOS results are recorded in the plugin's
RefactorPlan action log; desktop testing does not establish physical mobile behavior.
