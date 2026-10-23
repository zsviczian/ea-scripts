# Slideshow

Converts the active Excalidraw drawing into a slideshow presentation.

[![](https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/master/images/logo-slideshow-v4.png)](https://community.sketch-your-mind.com/slideshow)

To get the most out of the Slideshow script check out the [Slideshow mini-course](https://community.sketch-your-mind.com/slideshow) on the Sketch Your Mind Community.

![](https://youtu.be/7DDY8rRDzdU)

[Also watch the Excalidraw 2.27.0 update video](https://youtu.be/am2HOlbYsxI?t=272)

![Slideshow example](https://raw.githubusercontent.com/zsviczian/obsidian-excalidraw-plugin/master/images/scripts-slideshow-2.jpg)

[Slideshow mini-course](https://community.sketch-your-mind.com/slideshow)

## Launch behavior

- Slideshow requests Excalidraw Automate autostart permission. Its autostart pass only registers
  the view-local **Edit slideshow** element action; it never starts a presentation.
- Select a frame or line/arrow carrying slideshow metadata and use its Lucide presentation action
  to open/focus the **Slideshow** sidepanel for that element's frame or line deck.
- After a view is registered, invoking the script from its toolbar icon, Obsidian command, or
  hotkey starts that view's presentation. A normal invocation starts fullscreen; whether presenter
  notes open follows the persisted sidepanel setting. Shift resumes saved progress, Alt/Option
  starts windowed, and Cmd/Ctrl opens/focuses the Slideshow sidepanel instead of presenting.
  A selected frame or line/arrow overrides the saved source; with no relevant selection, the exact
  presentation source last chosen in the sidepanel for that drawing is used. A normal invocation
  while a presentation is active advances the existing controller. Shift re-resolves the selected or
  saved source and resumes that source's own continuation point.
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
- A line/arrow becomes a presentation source only after slideshow metadata is created for it. Merely selecting an ordinary line does not replace the sidepanel deck, but manually launching Slideshow with that line selected creates the presentation metadata and uses that line for the launch.
- When an ordinary line/arrow with at least one complete point pair is selected, the sidepanel shows a contextual **Create line presentation** action in the top toolbar.
- Every persisted line presentation has its own optional name. Use its ellipsis/settings action beside the deck summary to rename it or remove only its slideshow metadata. Removing presentation metadata never deletes the line itself and restores its original styling if the path had been persistently hidden.
- If presentation names collide, the selector disambiguates them only in the UI as `Name (1)`, `Name (2)`, and so on; element ids remain the stable identity. Unnamed paths use `Line presentation` with the same duplicate-numbering rule.
- When multiple sources exist, the presentation selector lists `Frames` plus every named line presentation independently. The selected source is persisted per drawing and becomes the manual-launch default whenever no frame or line/arrow is selected on the canvas. A selected frame or line/arrow overrides that default for the invocation.
- Frames without slideshow metadata retain alphabetical ordering.
- The first sorter mutation writes explicit normalized `order` metadata; after that, frame renames do not change presentation order.
- Excluded frame and line slides remain visible and editable in the sorter. Presentations omit them; PDF setup lets you choose visible slides or all slides.

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

PDF slides use area selection clipped to each slide's own rectangle through `ea.createViewSVG({ exportArea })`, but remain vector SVGs. Each page is self-contained and includes only image files referenced by elements intersecting that page instead of retaining the complete drawing behind a changed `viewBox`.

## Slideshow settings

The sidepanel cog opens a script-owned settings modal for transition timing, edit zoom, fade level, print/presentation dimensions, and maximum zoom. Values are persisted through Excalidraw Automate script settings, with the historical configuration values used as defaults. The sidepanel preview aspect ratio updates to match the configured print width and height.

The sidepanel also includes a small support link to [Ko-fi](https://ko-fi.com/zsolt).

## Presentation launch, displays, and PDF behavior

The sidepanel has one compact **Play** button. Launch behavior is configured independently through dropdowns instead of overloading the play action: **Start / Resume / Current**, **Fullscreen / Windowed**, and **Slides only / With Notes**. If multiple presentation sources exist, a separate presentation selector is shown. Changing a dropdown never starts the presentation; pressing Play uses the currently selected combination. These choices are persisted in script settings. The launch/display controls live in a collapsible **Presentation settings** section so the sorter can use most of the panel height. Launches hide the docked Excalidraw sidepanel and wait for both the drawing layout and Excalidraw viewport dimensions to settle before framing the first slide. A sidepanel in a separate popout stays open.

On desktop, display selectors are shown only when **With Notes** is selected. The default keeps the presentation on the current/primary display and chooses another display for presenter notes when available. Presentation and notes display selections are persisted in script settings under a stable local device key, allowing different machines that share the script settings to keep independent monitor choices.

Presenter placement is deliberately fail-safe. The host native-window placement is captured **before** a presenter popout is opened. After `openPopoutLeaf()`, Slideshow waits until Obsidian has actually migrated the presenter leaf into a DOM `Window` distinct from the host, then verifies that the two DOM windows resolve to different native Electron `BrowserWindow`s before moving either presenter window. If identity cannot be established unambiguously, presenter movement is skipped instead of risking moving the main Obsidian window. The host is then moved to the requested presentation display and fullscreen is requested only after Electron confirms the display transition. Native restoration uses Electron's `BrowserWindow.id`, waits for macOS native fullscreen to finish exiting, and briefly monitors the captured host for a late Sidecar/Spaces drift; only a window that moves off its original display or fully off-screen is repaired.

Display handling remains best-effort because Obsidian does not expose a first-class presentation-display API to scripts.
On Obsidian Mobile, presentations always use fullscreen mode, presenter view is unavailable, and the docked mobile navbar is hidden for the duration of the presentation. The presentation toolbar is centered and uses a compact slide picker on narrow screens.


Presentation navigation and the toolbar slide picker consume the canonical visible deck. The presentation slide picker labels entries as `Title (current/total)`. Starting from the sidepanel returns focus to the drawing leaf before keyboard handlers are installed, so arrow-key navigation is immediately active. PDF pages use the final fully built scene state: all animation targets are restored to their original opacity and no animation overlays are included.

## PDF printing and handouts

Select **Print slideshow to PDF** in the sidepanel or presentation toolbar to open floating print setup. Choose any available frame or named line/arrow slideshow; the current deck is selected initially. Printing preserves the sorter's slide order.

- **Print theme** offers **Light** and **Dark** for slides and handouts. Each time setup opens, it defaults to the drawing's current scene theme.
- Choose slides only, one slide with notes below it, or two/three slides with notes beside each slide per page.
- The **Print only visible slides** toggle is on by default. Turn it off to include excluded slides, including decks whose slides are all excluded.
- Choose the configured slide size, **A4**, **Letter**, **16:9**, or **Custom**, then select **Landscape** or **Portrait**. Width and height are editable in pixels (96 pixels per inch), from 320 to 14400 pixels. Holding Shift while opening setup starts with the current viewport dimensions.
- Each slide is clipped to its own rectangle and fitted intact inside its page or handout slot. Changing paper aspect ratio never pulls neighboring slides into the printout or splits a slide across pages. Handout slots retain the configured presentation aspect ratio.
- **Margins** offers **None** (default, edge-to-edge slides), **Minimal** (10 px), and **Normal** (60 px). Margins apply to slides and handouts without adding a second inset in the PDF exporter.
- Notes use Obsidian's Markdown renderer, preserving headings, emphasis, links, lists, tables, and code as formatted HTML. Long notes continue in another slot with the slide repeated.
- **Page ranges** accepts output-page selections such as `1-3;5;9-`; leave it blank for all pages. Ranges count final pages, including notes continuation pages, and preserve their original order.
- Confirmed print preferences (layout, visibility, page size, orientation/dimensions, margins, and page ranges) are saved in script settings and restored the next time print setup opens. The slideshow source initially follows the current drawing.

PDF creation uses Excalidraw's existing desktop PDF export and its normal save dialog.

## Export frame slides to Markdown

For frame decks, select the **Export frame slides to Markdown** file-down button beside Print. Enter a filename to create a note in the drawing's folder and open it in a new tab. Existing notes are never overwritten; cancelling creates nothing.

The note includes every frame slide in sorter order, including excluded slides. Each section contains the frame title, an embed such as `![[Folder/Drawing.excalidraw.md#^frame=Opening]]`, and the slide's original Markdown notes. Duplicate, unnamed, or unlinkable frame names use the frame ID in the same `#^frame=` syntax to keep the reference unambiguous. Line/arrow decks do not offer Markdown export.

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
  temporary runtime memory and is tracked independently for each presentation source in each
  concrete Excalidraw view, even when two views show the same file. It can be combined with
  Alt/Option.
- **Open the Slideshow sidepanel:** Hold Cmd on macOS or Ctrl on Windows/Linux while invoking the script.

