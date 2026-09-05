## Source structure

- `main.ts`: executable bootstrap that loads persisted slideshow configuration.
- `slideshowSettings.ts`: default configuration, script-settings persistence, validation, and the settings modal.
- `run.ts`: autostart registration and later manual-invocation routing.
- `slideshowLauncher.ts`: shared sidepanel and presentation launch orchestration.
- `slideshowRuntime.ts`: shared temporary per-view contexts, controllers, and slide progress.
- `SlideshowController.ts`: presentation lifecycle, hierarchical slide/build navigation, fullscreen/display placement, presenter synchronization, and restoration.
- `AnimationEditor.ts`: frame target capture, step editing/reordering, and previews.
- `AnimationRuntime.ts`: target resolution, timed builds, transient effects, and guaranteed restoration.
- `PresentationControls.ts`: presentation toolbar and slide picker.
- `presentationPath.ts`: non-mutating canonical deck resolution plus presentation setup.
- `slideshowMetadata.ts`: schema validation, migration, reconciliation, and safe metadata writes.
- `SlideDeck.ts`: canonical ordered frame/line deck and pure point-pair ordering helpers.
- `slideDeckMutations.ts`: undoable sorter metadata/geometry transactions.
- `SlideshowSidepanel.ts`: drawing-aware sidepanel lifecycle and refresh orchestration.
- `PresenterViewController.ts`: desktop popout lifecycle, current/next-animation previews, Markdown notes, display placement, and presenter navigation.
- `desktopDisplays.ts`: best-effort desktop monitor discovery, target selection, window placement, and restoration.
- `presentationState.ts`: pure authoritative presenter-state construction shared with the presentation controller.
- `SlideSorter.ts`: rows, drag/drop, keyboard controls, frame/line inclusion, notes, and animation entry UI.
- `SlidePreviewService.ts`: lazy, byte-budgeted, area-bounded PNG preview generation.
- `printToPdf.ts`: page-local SVG generation from canonical visible slide rectangles.
- `styles.ts`: sidepanel/sorter CSS.
- `types.ts`: slideshow domain contracts and host-facing types.

## Localization

English remains the typed source of truth. Existing German, Spanish, French, Russian, and Simplified Chinese translations are retained; new strings fall back to English until translated.

## Testing

Run slideshow tests with:

```bash
npm run test:slideshow
```

Run the full workspace gate with:

```bash
npm run check
```