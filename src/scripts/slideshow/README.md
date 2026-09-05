# Slideshow

Converts the active Excalidraw drawing into a slideshow presentation. The built
script is emitted to `build/slideshow/slideshow.md`.

[Watch the Slideshow 3.0 walkthrough](https://www.youtube.com/watch?v=JwgtCrIVeEU) and the [Excalidraw 2.27.0 update video](https://youtu.be/am2HOlbYsxI?si=4UPdmFMJcpM6j9oR&t=272)

![Slideshow example](https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/master/images/scripts-slideshow-2.jpg)

## Launch behavior

- Slideshow requests Excalidraw Automate autostart permission. Its autostart pass only registers
  the view-local **Edit slideshow** element action; it never starts a presentation.
- Select a frame or line/arrow carrying slideshow metadata and use its Lucide presentation action
  to open/focus the **Slideshow** sidepanel for that element's frame or line deck.
- After a view is registered, invoking the script from its toolbar icon, Obsidian command, or
  hotkey starts that view's presentation. A normal invocation starts fullscreen; whether presenter
  notes open follows the persisted sidepanel setting. Shift resumes saved progress, Alt/Option
  starts windowed, and Cmd/Ctrl opens/focuses the Slideshow sidepanel instead of presenting.
  Invoking the script again while a presentation is active advances the existing controller unless
  Cmd/Ctrl is held, in which case the presentation ends and the sidepanel opens.
- Slideshow uses `utils.executionSource` so autostart remains registration-only while the very
  first manual toolbar, command, or hotkey invocation can start presenting immediately.
- The presentation toolbar's settings button ends the active presentation and opens the sidepanel.
  Presentation-source switching and presenter-view launch are intentionally configured from the
  sidepanel rather than duplicated on the compact presentation toolbar.
- The sidepanel is a single non-persistent instance. It follows the most recently focused
  Excalidraw drawing across main-window/popout contexts and shows an empty state for Markdown notes.

## Presentation sources and slide order

A drawing can contain one frame presentation plus any number of independent line/arrow presentations. The sidepanel keeps an explicit presentation-source selection; selecting ordinary canvas elements never changes which deck the sorter is editing.

- Frames form one presentation source when the drawing contains frames.
- A line/arrow becomes a presentation source only after slideshow metadata is created for it. Selecting an ordinary line does **not** implicitly turn it into a slideshow or replace the sidepanel deck.
- When an ordinary line/arrow with at least one complete point pair is selected, the sidepanel shows a contextual **Create line presentation** action in the top toolbar.
- Every persisted line presentation has its own optional name. Use its ellipsis/settings action beside the deck summary to rename it or remove only its slideshow metadata. Removing presentation metadata never deletes the line itself and restores its original styling if the path had been persistently hidden.
- If presentation names collide, the selector disambiguates them only in the UI as `Name (1)`, `Name (2)`, and so on; element ids remain the stable identity. Unnamed paths use `Line presentation` with the same duplicate-numbering rule.
- When multiple sources exist, the presentation selector lists `Frames` plus every named line presentation independently. Manual script launch prefers a selected **persisted** line presentation; otherwise frames are the default when available, then the first persisted line presentation.
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

On desktop, presenter view runs in a script-owned Obsidian popout. The presenter window shows the current slide, rendered Markdown notes, live animation progress, and the **next navigation state**. When another animation is pending, the large next preview shows that next animation state on the current slide; only after the slide is fully built does it preview the next visible slide. A layout toggle can devote approximately 85% of the window width to presenter notes, leaving a compact current/next preview rail for teleprompter-style use. Its Previous/Next controls and keyboard shortcuts call the same `SlideshowController` state machine as the floating presentation toolbar. Keyboard handling is scoped to the window that actually has focus and ignores repeated/default-prevented keydown events, preventing one key press from being interpreted twice. Closing only the presenter popout leaves the presentation running; ending the presentation closes the presenter popout as part of cleanup. Presenter view is disabled on mobile because Obsidian does not support popout windows there.

## Thumbnails

`SlidePreviewService` calculates each slide's configured `printSlideWidth` × `printSlideHeight` navigation rectangle and exports only elements intersecting that viewport. Sorter and presenter previews are bounded-resolution PNG blobs rather than full-scene SVG clones, so off-slide embedded images are not repeated in every thumbnail. Sorter previews are requested lazily with `IntersectionObserver` and rendered through a serialized queue. A byte-budgeted LRU cache owns object URLs and revokes them on eviction or drawing changes. Slideshow metadata-only changes do not invalidate visual previews.

PDF pages use the same area-selection and exact viewport anchoring through `ea.createViewSVG({ exportArea })`, but remain vector SVGs. Each page is self-contained and includes only image files referenced by elements intersecting that page instead of retaining the complete drawing behind a changed `viewBox`.

## Slideshow settings

The sidepanel cog opens a script-owned settings modal for transition timing, edit zoom, fade level, print/presentation dimensions, and maximum zoom. Values are persisted through Excalidraw Automate script settings, with the historical configuration values used as defaults. The sidepanel preview aspect ratio updates to match the configured print width and height.

The sidepanel also includes a small support link to [Ko-fi](https://ko-fi.com/zsolt).

## Presentation launch, displays, and PDF behavior

The sidepanel has one compact **Play** button. Launch behavior is configured independently through dropdowns instead of overloading the play action: **Start / Resume / Current**, **Fullscreen / Windowed**, and **Slides only / With Notes**. If multiple presentation sources exist, a separate presentation selector is shown. Changing a dropdown never starts the presentation; pressing Play uses the currently selected combination. These choices are persisted in script settings. The launch/display controls live in a collapsible **Presentation settings** section so the sorter can use most of the panel height. Windowed launches hide the entire Excalidraw sidepanel before presentation so the deck receives the full workspace width.

On desktop, display selectors are shown only when **With Notes** is selected. The default keeps the presentation on the current/primary display and chooses another display for presenter notes when available. Presentation and notes display selections are persisted in script settings under a stable local device key, allowing different machines that share the script settings to keep independent monitor choices.

Presenter placement is deliberately fail-safe. The host native-window placement is captured **before** a presenter popout is opened. After `openPopoutLeaf()`, Slideshow waits until Obsidian has actually migrated the presenter leaf into a DOM `Window` distinct from the host, then verifies that the two DOM windows resolve to different native Electron `BrowserWindow`s before moving either presenter window. If identity cannot be established unambiguously, presenter movement is skipped instead of risking moving the main Obsidian window. The host is then moved to the requested presentation display and fullscreen is requested only after Electron confirms the display transition. Native restoration uses Electron's `BrowserWindow.id`, waits for macOS native fullscreen to finish exiting, and briefly monitors the captured host for a late Sidecar/Spaces drift; only a window that moves off its original display or fully off-screen is repaired.

Display handling remains best-effort because Obsidian does not expose a first-class presentation-display API to scripts.
On Obsidian Mobile, presentations always use fullscreen mode, presenter view is unavailable, and the docked mobile navbar is hidden for the duration of the presentation. The presentation toolbar is centered and uses a compact slide picker on narrow screens.


Presentation navigation, the toolbar slide picker, and PDF export consume the canonical visible deck. Frame order and exclusions therefore match the sorter. The presentation slide picker labels entries as `Title (current/total)`. Starting from the sidepanel returns focus to the drawing leaf before keyboard handlers are installed, so arrow-key navigation is immediately active. PDF pages use the final fully built scene state: all animation targets are restored to their original opacity and no animation overlays are included.

## Keyboard shortcuts and modifier keys during presentation

- **Forward:** Arrow Down, Arrow Right, or Space
- **Backward:** Arrow Up or Arrow Left
- **Finish:** Backspace or Escape
- **Edit current line-path slide:** E
- **Toggle fullscreen:** F
- **Return to the current slide:** Home
- **Go to the final slide:** End
- **Normal script invocation:** start fullscreen. Slides-only vs presenter notes follows the sidepanel setting.
- **Run in a window:** Hold Alt/Option while launching the script.
- **Resume from the last slide:** Hold Shift while launching the script. Progress is held only in
  temporary runtime memory and is tracked independently for each concrete Excalidraw view, even
  when two views show the same file. It can be combined with Alt/Option.
- **Open the Slideshow sidepanel:** Hold Cmd on macOS or Ctrl on Windows/Linux while invoking the script.

