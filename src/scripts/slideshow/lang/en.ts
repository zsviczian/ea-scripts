export const en = {
  requiresNewerVersion:
    "This script requires a newer version of Excalidraw. Please install the latest version.",
  noActiveView: "Open an Excalidraw drawing before starting the slideshow.",
  cannotAccessView: "Could not access the active Excalidraw view.",
  noPresentationPath: "Select the line or arrow for the presentation path or add frames.",
  selectedPathOverridesHidden:
    "Using the selected line instead of the hidden presentation path. Run the slideshow without selecting an element to use the hidden path.",
  allFramesExcluded: "All frame slides are excluded. Include at least one frame before presenting.",
  sidepanelTitle: "Slideshow",
  startPresentation: "Start presentation",
  refreshSlides: "Refresh slides",
  noSlides: "No slideshow is available in this drawing.",
  noActiveDrawing: "Focus an Excalidraw drawing to edit its slideshow.",
  frameDeck: "Frame slideshow",
  lineDeck: "Line slideshow",
  slideCount: "{count} slides",
  visibleSlideCount: "{visible} of {total} included",
  dragSlide: "Drag to reorder slide",
  moveSlideUp: "Move slide up",
  moveSlideDown: "Move slide down",
  includeSlide: "Include slide in presentation",
  excludeSlide: "Exclude slide from presentation",
  notesPresent: "Presenter notes available",
  animationCount: "{count} animation steps",
  editAnimations: "Edit animations",
  animationCheckpoint3: "Animation editing will be available in Checkpoint 3.",
  notesHeading: "Presenter notes",
  notesPlaceholder: "Add presenter notes for this slide…",
  notesHint: "Notes support Markdown and are saved automatically.",
  lineReorderBound:
    "This presentation path has a bound start or end. Unbind both endpoints before reordering line slides.",
  lineAnimationUnsupported:
    "Element animation currently requires frame-based slides because frames provide stable slide membership.",
  reorderFailed: "Could not reorder the slide.",
  metadataSaveFailed: "Could not save slideshow metadata.",
  zoomSlide: "Zoom editor to this slide",
  slideLabel: "Slide {number}",
  slideNumberAndTitle: "{number}. {title}",
  openSlideshowPanel: "Open slideshow panel",
  openPanelEndsPresentation: "End presentation and open slideshow panel",
  previousSlide: "Previous slide",
  nextSlide: "Next slide",
  navigateToSlide: "Navigate to slide",
  toggleLaser: "Toggle laser pointer and panning mode",
  refocusSlide: "Re-focus current slide (shortcut: HOME)",
  toggleFullscreen:
    "Toggle fullscreen. Hold ALT/OPT when starting the presentation to start windowed. (shortcut: F)",
  pathVisibility:
    "Arrow visibility. ON: hidden after presentation, OFF: visible after presentation",
  editSlide: "Edit slide",
  printPdf:
    "Print to PDF\nClick to print slides at {width}x{height}\nHold SHIFT to print the presentation as displayed",
  endPresentation: "End presentation",
  pathWillRemainHidden:
    "The presentation path will remain hidden after the presentation. Next time, start the slideshow without selecting the line.",
  invalidSlide: "The slideshow presentation path does not contain a valid slide.",
  generatingImage:
    "Generating image. This can take longer depending on drawing size and device speed.",
  generatingSlide: "Generating slide {number}",
  creatingPdf: "Creating PDF document",
  presenterViewCheckpoint4: "Presenter view will be available in Checkpoint 4.",
} as const;

export type SlideshowTranslationKey = keyof typeof en;
