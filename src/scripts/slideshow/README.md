# Slideshow

Converts the active Excalidraw drawing into a slideshow presentation. The built
script is emitted to `build/slideshow/slideshow.md`.

[Watch the Slideshow 3.0 walkthrough](https://www.youtube.com/watch?v=JwgtCrIVeEU)

![Slideshow example](https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/master/images/scripts-slideshow-2.jpg)

## Presentation paths

- Select an arrow or line to use its consecutive point pairs as slides.
- With no selection, a previously hidden presentation path is reused.
- If no line path is available, frames are shown in alphabetical title order.

## Keyboard shortcuts and modifier keys

- **Forward:** Arrow Down, Arrow Right, or Space
- **Backward:** Arrow Up or Arrow Left
- **Finish:** Backspace or Escape
- **Edit current line-path slide:** E
- **Toggle fullscreen:** F
- **Return to the current slide:** Home
- **Go to the final slide:** End
- **Run in a window:** Hold Alt/Option while launching the script.
- **Continue from the last slide:** Hold Shift while launching the script. This
  state lasts for the current Obsidian session and can be combined with
  Alt/Option.

## Source structure

- `main.ts` validates the host, exposes the configuration constants at the top
  of the generated script, and preserves the legacy double-click scheduler.
- `SlideshowController.ts` owns presentation lifecycle, navigation, fullscreen,
  and drawing restoration.
- `PresentationControls.ts` owns the toolbar, slide picker, fading, and dragging.
- `presentationPath.ts` resolves the currently active legacy presentation path.
- `slideshowMetadata.ts` validates schema-v2 metadata, reads legacy line metadata,
  reconciles stable line-slide records, and performs safe slideshow-namespace writes.
- `SlideDeck.ts` builds the canonical ordered frame/line deck and contains pure
  reorder/normalization helpers used by the upcoming sorter.
- `printToPdf.ts` owns PDF page generation.
- `types.ts` contains slideshow domain types, schema contracts, and element guards.

## Localization

The `lang/` folder demonstrates the workspace convention with localized startup
and host-validation messages in English, German, Spanish, French, Russian, and
Simplified Chinese. The rest of Slideshow's UI remains unchanged for now; this is
intentionally a small adoption sample, not a full translation.

## Testing

The checkpoint-1 model harness was migrated without adding new slideshow cases to
`__tests__/checkpoint1.test.ts`. Run it with `npm run test:slideshow`, or run all
current and future script suites with `npm test`.

Reusable geometry, timer, and notice helpers live in `src/sharedUtils` so future
scripts can consume them without depending on slideshow-specific modules.
