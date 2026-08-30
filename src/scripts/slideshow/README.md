# Slideshow

Converts the active Excalidraw drawing into a slideshow presentation. The built
script is emitted to `build/slideshow/slideshow.md`.

[Watch the Slideshow 3.0 walkthrough](https://www.youtube.com/watch?v=JwgtCrIVeEU)

![Slideshow example](https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/master/images/scripts-slideshow-2.jpg)

## Launch behavior

- A normal invocation starts the slideshow after the existing short delay.
- A double invocation cancels that delayed start and opens/focuses the **Slideshow** sidepanel.
- The presentation toolbar's settings button ends the active presentation and opens the sidepanel.
- The sidepanel is non-persistent and follows the most recently focused Excalidraw drawing through its lifecycle hooks.

## Presentation paths and slide order

- Select an arrow or line to use its consecutive point pairs as slides.
- With no selection, a previously remembered presentation path is reused.
- If no line path is available, frames are used.
- If both frames and a remembered/selected line path are available, the sidepanel shows a presentation-type dropdown. Frame and line configurations remain independent, and **Start presentation** runs the type currently selected in the sidepanel.
- Frames without slideshow metadata retain alphabetical ordering.
- The first sorter mutation writes explicit normalized `order` metadata; after that, frame renames do not change presentation order.
- Excluded frames remain visible and editable in the sorter, but are omitted from presentation and PDF output.

## Slide sorter

The sidepanel shows a title, thumbnail, and controls for every slide. Titles occupy their own top row so long frame names remain readable.

- Desktop: drag rows to reorder them.
- All platforms: use the up/down buttons or `Alt+Arrow Up/Down`.
- `Arrow Up/Down`: move sorter focus.
- `Enter`: zoom the drawing editor to the focused slide.
- `Space`: toggle inclusion for frame slides.
- `N`: expand and focus presenter notes for the selected slide.
- `A`: reserved for the Checkpoint 3 animation editor.

Line slides reorder consecutive point pairs in absolute scene coordinates and normalize the line origin afterward. Stable line-slide metadata records are reordered in the same transaction so presenter notes remain attached to the correct slide. Reordering is disabled when the presentation line/arrow has an active start or end binding.

## Presenter notes

Each sorter row can own Markdown presenter notes. Use the notes icon on that row to expand/collapse its editor directly beneath the slide instead of using a shared editor at the bottom of the sorter.

- Frame notes are stored in `frame.customData.slideshow.notes`.
- Line-slide notes are stored in the corresponding stable record on the presentation-path element.
- Notes save after a short debounce and are flushed on blur, slide changes, panel close, and presentation start.
- Empty notes are removed rather than persisted as empty strings.

The separate presenter popout and rendered Markdown notes are planned for Checkpoint 4.

## Thumbnails

`SlidePreviewService` exports the drawing once as SVG for a visual scene fingerprint and crops per-slide clones in the sidepanel's current owner document. The export is anchored to the full scene bounds with an invisible sizing element so hidden frame chrome cannot shift the crop origin. Preview navigation assumes a fixed 1920×1080 presentation viewport. Slideshow metadata-only changes do not invalidate the visual SVG cache.

## Presentation and PDF behavior

Presentation navigation, the toolbar slide picker, and PDF export consume the canonical visible deck. Frame order and exclusions therefore match the sorter. The presentation slide picker labels entries as `Title (current/total)`. Starting from the sidepanel returns focus to the drawing leaf before keyboard handlers are installed, so arrow-key navigation is immediately active. PDF pages use the normal fully visible scene state; animation-aware final-state rendering is completed with the animation runtime in Checkpoint 3.

## Keyboard shortcuts and modifier keys during presentation

- **Forward:** Arrow Down, Arrow Right, or Space
- **Backward:** Arrow Up or Arrow Left
- **Finish:** Backspace or Escape
- **Edit current line-path slide:** E
- **Toggle fullscreen:** F
- **Return to the current slide:** Home
- **Go to the final slide:** End
- **Run in a window:** Hold Alt/Option while launching the script.
- **Continue from the last slide:** Hold Shift while launching the script. This state lasts for the current Obsidian session and can be combined with Alt/Option.

## Source structure

- `main.ts`: delayed single-click / double-click bootstrap.
- `slideshowLauncher.ts`: shared sidepanel and presentation launch orchestration.
- `SlideshowController.ts`: presentation lifecycle, navigation, fullscreen, and restoration.
- `PresentationControls.ts`: presentation toolbar and slide picker.
- `presentationPath.ts`: non-mutating canonical deck resolution plus presentation setup.
- `slideshowMetadata.ts`: schema validation, migration, reconciliation, and safe metadata writes.
- `SlideDeck.ts`: canonical ordered frame/line deck and pure point-pair ordering helpers.
- `slideDeckMutations.ts`: undoable sorter metadata/geometry transactions.
- `SlideshowSidepanel.ts`: drawing-aware sidepanel lifecycle and refresh orchestration.
- `SlideSorter.ts`: rows, drag/drop, keyboard controls, inclusion, and notes UI.
- `SlidePreviewService.ts`: cached whole-scene SVG export and slide cropping.
- `printToPdf.ts`: PDF page generation from the canonical visible slide rectangles.
- `styles.ts`: sidepanel/sorter CSS.
- `types.ts`: slideshow domain contracts and host-facing types.

## Localization

English remains the typed source of truth. Existing German, Spanish, French, Russian, and Simplified Chinese startup translations are retained; new Checkpoint 2 strings fall back to English until translated.

## Testing

Run slideshow tests with:

```bash
npm run test:slideshow
```

Run the full workspace gate with:

```bash
npm run check
```

Checkpoint 1 covers schema/deck foundations. Checkpoint 2 adds focused coverage for frame reorder normalization, exclusions, frame/line notes, line point-pair metadata coupling, bound-line safety, canonical presentation consumption, all-excluded prevention, and metadata-insensitive thumbnail fingerprints.
