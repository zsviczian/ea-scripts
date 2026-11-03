# Printable Layout Wizard migration

| Checkpoint | Outcome | Validation |
| --- | --- | --- |
| Modular authoring | Thin bootstrap; typed frame, settings, dialog, and PDF modules; script-local catalogs and original preview | Focused behavior tests, scoped strict TypeScript, generated bundle |
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
