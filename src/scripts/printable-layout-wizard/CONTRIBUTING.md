# Authoring Printable Layout Wizard

Edit this source folder, then run from the `ea-scripts` repository:

```sh
npx vitest run src/scripts/printable-layout-wizard/__tests__
npm run check
npm run build
```

Copy `build/printable-layout-wizard/printable-layout-wizard.md` unchanged to
`obsidian-excalidraw-plugin/ea-scripts/Printable Layout Wizard.md`, update its
index description and directory mtime, and open the publication PR in that repo.
Keep its existing preview. Never edit the generated script by hand.

`main.ts` only launches `run.ts`. `WizardDialog.ts` owns the modal, serial settings
writes, operation guard, and rendering-state cleanup. `frames.ts`, `settings.ts`,
and `pageRanges.ts` are import-safe behavior modules. `printToPdf.ts` takes a
complete scene snapshot and crops selected frames without adding placeholders to
the live scene. Translation catalogs live under `lang/`.

The original settings keys, option values, marker/all-frame filter, alphabetical
ordering, frame geometry, rotate-once behavior, custom PDF sizing, margins, and
empty-page preference remain compatible. Missing settings are now filled
independently; unknown settings are preserved. The script requires Excalidraw
2.27.0 for the lifecycle-aware authoring baseline. Page ranges are dialog-local.

For real Obsidian main/popout tests, with the sibling plugin/fork/Extras checkouts
and the repository-owned vault already opened and trusted:

```sh
node src/scripts/printable-layout-wizard/testing/native.mjs
```

This builds and freezes fresh workspace artifacts, uses the plugin's native host
lock and guarded vault preparation, executes this exact built script, and restores
the declared baseline after fixture cleanup. It captures the `EA.createPDF`
submission to check actual SVG pages, without opening a native Save dialog or
printing a PDF. `native-evidence.json` records that boundary. These script cases
do not claim the plugin's complete canonical native profile.

The `--combination=/absolute/path` option is for an immediate diagnostic rerun
against a freshly prepared combination. It validates every frozen artifact and
requires all recorded source identities to match; it cannot reuse stale builds.

The highest-probability regression is wrong page numbering or cropping after
filtering. Manually export a PDF with a blank second frame, a renamed frame,
custom dimensions, images, and a range such as `1, 3-5, 9-`; inspect actual page
content and margins. Separately test save cancellation, frame undo/redo, main-window
and popout use on Windows/Linux, moving a tab while the wizard is open, and
physical mobile frame controls and range entry. PDF export itself remains desktop
only. These checks are separate from simulated input and captured submission.

Validation on 2026-11-03: 26 focused tests, scoped strict TypeScript, and script
lint pass (lint has advisory complexity/length warnings). The build succeeds.
The native frame-controls, main-window, and popout cases pass on macOS with
Excalidraw 2.29.1; cleanup, baseline restoration, and JavaScript-error checks pass.
The published bundle hash matches `native-evidence.json`.

The workspace-wide `npm run check` has 363 TypeScript errors and the complete
Vitest run has nine failures in Slideshow/Canvas Chat. Excluding this script
reproduces the same 363 errors and nine failures; this migration introduces no
additional failures in those checks. Keep these baseline limitations visible in
the source PR.
