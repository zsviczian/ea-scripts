# Slideshow

Converts the active Excalidraw drawing into a slideshow presentation. The built
script is emitted to `build/slideshow/slideshow.md`.

[Watch the Slideshow 3.0 walkthrough](https://www.youtube.com/watch?v=JwgtCrIVeEU)

![Slideshow example](https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/master/images/scripts-slideshow-2.jpg)

## Launch behavior

- Slideshow requests Excalidraw Automate autostart permission. Its autostart pass only registers
  the view-local **Edit slideshow** element action; it never starts a presentation.
- Select a frame or line/arrow carrying slideshow metadata and use its Lucide presentation action
  to open/focus the **Slideshow** sidepanel for that element's frame or line deck.
- After a view is registered, invoking the script from its toolbar icon, Obsidian command, or
  hotkey starts that view's presentation. Invoking it again while that presentation is active
  advances the existing controller instead of creating another instance.
- Slideshow uses `utils.executionSource` so autostart remains registration-only while the very
  first manual toolbar, command, or hotkey invocation can start presenting immediately.
- The presentation toolbar's settings button ends the active presentation and opens the sidepanel.
- The sidepanel is a single non-persistent instance. It follows the most recently focused
  Excalidraw drawing across main-window/popout contexts and shows an empty state for Markdown notes.

## Presentation paths and slide order

- Select an arrow or line to use its consecutive point pairs as slides.
- With no selection, a previously remembered presentation path is reused.
- If no line path is available, frames are used.
- If both frames and a remembered/selected line path are available, the sidepanel shows a presentation-type dropdown. Frame and line configurations remain independent, and **Start presentation** runs the type currently selected in the sidepanel. A separate presentation button starts from the currently selected included slide for quick animation testing.
- Frames without slideshow metadata retain alphabetical ordering.
- The first sorter mutation writes explicit normalized `order` metadata; after that, frame renames do not change presentation order.
- Excluded frame and line slides remain visible and editable in the sorter, but are omitted from presentation and PDF output.

## Slide sorter

The sidepanel shows a title, thumbnail, and controls for every slide. Titles occupy their own top row so long frame names remain readable.

- Desktop: drag rows to reorder them.
- All platforms: use the up/down buttons or `Alt+Arrow Up/Down`.
- `Arrow Up/Down`: move sorter focus.
- `Enter`: zoom the drawing editor to the focused slide.
- `Space`: toggle inclusion for frame or line slides.
- `N`: expand and focus presenter notes for the selected slide.
- `A`: open the animation editor for a frame slide.

Line slides reorder consecutive point pairs in absolute scene coordinates and normalize the line origin afterward. Stable line-slide metadata records are reordered in the same transaction so presenter notes and inclusion state remain attached to the correct slide. Reordering is disabled when the presentation line/arrow has an active start or end binding.

## Appearance sequence and animation

Frame slides support a build sequence stored on the frame's slideshow metadata. Open the sorter, choose a frame, and use the sparkles action (or `A`) to expand the animation editor directly beneath that slide. The frame is selected and zoomed to fit when editing starts. Select elements or groups in the drawing, then add or update steps with these effects:

- **Appear:** restore the target instantly.
- **Fade:** animate from transparent to the element's original opacity.
- **Slide in:** animate an SVG overlay from the chosen direction.
- **Zoom in:** animate an SVG overlay from approximately 5% scale at the target center.

Steps can trigger on presenter advance or sequentially after a delay. Fade, slide, and zoom default to 350 ms; timed steps default to a 1000 ms delay. Steps can be reordered with drag/drop, buttons, or `Alt+Arrow Up/Down`, previewed, edited, and deleted. Editor previews position SVG motion overlays in the drawing host coordinate space, matching presentation geometry even when the Excalidraw leaf is offset by sidepanels or other workspace chrome.

Groups are stored by group ID and resolved dynamically when the presentation runs. Bound text and its container are treated as one visual unit. Marker frames do not own their contents, so animation eligibility is determined by geometric overlap between each element rectangle and the marker-frame rectangle rather than by `frameId`. Adding a target that already belongs to another animation step moves it to the new step instead of creating conflicting builds.

Presentation navigation is hierarchical: Forward reveals the next pending build before advancing the slide; Backward reverses the most recently completed build before moving to the previous slide. Previous slides entered while navigating backward start fully built, while direct jumps enter the destination in its initial build state. Timed callbacks and animation frames are invalidated on navigation and exit. Temporary scene changes use `captureUpdate: "NEVER"`; real elements are changed only through opacity, while slide/zoom motion uses disposable SVG overlays. Any interruption or presentation exit explicitly restores every animated target to its final/original visibility before cleanup.

Animation editing remains frame-only because frames provide stable geometric slide boundaries. Line slides support ordering, notes, and inclusion/exclusion but not element animation.

## Presenter notes

Each sorter row can own Markdown presenter notes. Use the notes icon on that row to expand/collapse its editor directly beneath the slide instead of using a shared editor at the bottom of the sorter.

- Frame notes are stored in `frame.customData.slideshow.notes`.
- Line-slide notes are stored in the corresponding stable record on the presentation-path element.
- Notes save after a short debounce and are flushed on blur, slide changes, panel close, and presentation start.
- Empty notes are removed rather than persisted as empty strings.
- Each persisted notes edit is followed by an immediate drawing `forceSave(true)` so the metadata is written to disk, not merely left dirty in memory.

On desktop, the presenter-view button starts/attaches to the active presentation in a script-owned Obsidian popout. The presenter window shows the current slide, a larger next-visible-slide preview, rendered Markdown notes, and live animation progress. Its Previous/Next controls and keyboard shortcuts call the same `SlideshowController` state machine as the floating presentation toolbar, so focusing the presenter window does not disable navigation. Closing only the presenter popout leaves the presentation running; ending the presentation closes the presenter popout as part of cleanup. Presenter view is disabled on mobile because Obsidian does not support popout windows there.

## Thumbnails

`SlidePreviewService` exports the drawing once as SVG for a visual scene fingerprint and crops per-slide clones in the sidepanel's current owner document. The export is anchored to the full scene bounds with an invisible sizing element so hidden frame chrome cannot shift the crop origin. Preview navigation uses the configured `printSlideWidth` × `printSlideHeight` viewport, and the preview container uses the same aspect ratio. Slideshow metadata-only changes do not invalidate the visual SVG cache.

## Slideshow settings

The sidepanel cog opens a script-owned settings modal for transition timing, edit zoom, fade level, print/presentation dimensions, and maximum zoom. Values are persisted through Excalidraw Automate script settings, with the historical configuration values used as defaults. The sidepanel preview aspect ratio updates to match the configured print width and height.

The sidepanel also includes a small support link to [Ko-fi](https://ko-fi.com/zsolt).

## Presentation and PDF behavior

Presentation navigation, the toolbar slide picker, and PDF export consume the canonical visible deck. Frame order and exclusions therefore match the sorter. The presentation slide picker labels entries as `Title (current/total)`. Starting from the sidepanel returns focus to the drawing leaf before keyboard handlers are installed, so arrow-key navigation is immediately active. PDF pages use the final fully built scene state: all animation targets are restored to their original opacity and no animation overlays are included.

## Keyboard shortcuts and modifier keys during presentation

- **Forward:** Arrow Down, Arrow Right, or Space
- **Backward:** Arrow Up or Arrow Left
- **Finish:** Backspace or Escape
- **Edit current line-path slide:** E
- **Toggle fullscreen:** F
- **Return to the current slide:** Home
- **Go to the final slide:** End
- **Run in a window:** Hold Alt/Option while launching the script.
- **Continue from the last slide:** Hold Shift while launching the script. Progress is held only in
  temporary runtime memory and is tracked independently for each concrete Excalidraw view, even
  when two views show the same file. It can be combined with Alt/Option.

## Source structure

- `main.ts`: executable bootstrap that loads persisted slideshow configuration.
- `slideshowSettings.ts`: default configuration, script-settings persistence, validation, and the settings modal.
- `run.ts`: autostart registration and later manual-invocation routing.
- `slideshowLauncher.ts`: shared sidepanel and presentation launch orchestration.
- `slideshowRuntime.ts`: shared temporary per-view contexts, controllers, and slide progress.
- `SlideshowController.ts`: presentation lifecycle, hierarchical slide/build navigation, fullscreen, and restoration.
- `AnimationEditor.ts`: frame target capture, step editing/reordering, and previews.
- `AnimationRuntime.ts`: target resolution, timed builds, transient effects, and guaranteed restoration.
- `PresentationControls.ts`: presentation toolbar and slide picker.
- `presentationPath.ts`: non-mutating canonical deck resolution plus presentation setup.
- `slideshowMetadata.ts`: schema validation, migration, reconciliation, and safe metadata writes.
- `SlideDeck.ts`: canonical ordered frame/line deck and pure point-pair ordering helpers.
- `slideDeckMutations.ts`: undoable sorter metadata/geometry transactions.
- `SlideshowSidepanel.ts`: drawing-aware sidepanel lifecycle and refresh orchestration.
- `PresenterViewController.ts`: desktop popout lifecycle, current/next previews, Markdown notes, and presenter navigation.
- `presentationState.ts`: pure authoritative presenter-state construction shared with the presentation controller.
- `SlideSorter.ts`: rows, drag/drop, keyboard controls, frame/line inclusion, notes, and animation entry UI.
- `SlidePreviewService.ts`: cached whole-scene SVG export and slide cropping.
- `printToPdf.ts`: PDF page generation from the canonical visible slide rectangles.
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

Checkpoint 1 covers schema/deck foundations. Checkpoint 2 adds focused coverage for sorter behavior, ordering, exclusions, notes, presentation consumption, previews, launch routing, and per-view runtime state. Checkpoint 3 covers frame animation target capture/resolution, bound text and groups, conflict reconciliation, animation metadata persistence, hierarchical runtime reveal/reverse/restoration, and line-slide exclusion. Checkpoint 4 adds the desktop presenter popout, synchronized navigation/build state, Markdown notes, current/next previews, and popout teardown handling.
