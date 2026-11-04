# Printable Layout Wizard migration

| Checkpoint | Outcome | Validation |
| --- | --- | --- |
| Modular authoring | Thin bootstrap; typed frame, settings, dialog, and PDF modules; script-local catalogs and original preview | Focused behavior tests, scoped strict TypeScript, generated bundle |
| Preview and UI follow-up | Restored bordered tabs, adaptive wide selectors, full-width first-frame action, equal frame controls; visible-only print previews and fixed export/count footer | 35 focused tests, 48 slideshow contract comparisons, native layout and PNG pixel parity |
| Page selection | Validated single pages, closed/open ranges, stable alphabetical numbering before empty-page filtering | Parser/export tests and real host dialog scenarios |

2026-11-03: Migrated the published single-file script into the authoring workspace.
Retained persisted setting names and values, frame naming/placement/rotation,
marker filtering, complete-scene vector rendering and per-SVG PDF dimensions.
Preferences save through a serialized writer when changed. Dialog cleanup restores
frame rendering and unregisters its EA lifecycle callback. Added page-range input,
localized hints/errors, and an explicit numbered frame list. Readable output is
built for the separate plugin publication PR.

The highest-risk workflows and remaining platform/manual gates are listed in
`CONTRIBUTING.md`. Focused script evidence is distinct from repository-wide
regression readiness.

2026-11-04: Restored the earlier dialog structure and added cached page previews
with shared inclusion/count logic. Extracted only slideshow visual fingerprints
and the unchanged area-PNG export contract into sharedUtils; sorter, queue and
cache lifetimes remain unchanged. Native screenshot review caught the export
footer being pushed out of view; pinned the action/count row and repeated the
main/popout tests. Slideshow retains the exact seven baseline test failures, with
169 passing before and after extraction; contract and actual PNG parity pass.

Manual risk checks: verify real PDF margins/crops and Save cancellation; scroll a
large preview list while editing frames, and close during decoding. Repeat on
Windows/Linux main/popout and physical mobile (controls and scrolling). See the
validation boundaries in CONTRIBUTING.md; native tests capture PDF submission.
