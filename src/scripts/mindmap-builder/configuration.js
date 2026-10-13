/**
 * @file configuration.js
 * @overview configuration implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createConfiguration(runtimeContext) {
  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  const VALUE_SETS = Object.freeze({
    SCOPE: Object.freeze({
      input: 3,
      excalidraw: 2,
      global: 1,
      none: 0,
    }),
    FONT_SCALE: Object.freeze(["Use scene fontsize", "Fibonacci Scale", "Normal Scale"]),
    GROWTH: Object.freeze([
      "Radial",
      "Right-facing",
      "Left-facing",
      "Right-Left",
      "Up-facing",
      "Down-facing",
      "Up-Down",
    ]),
    ZOOM: Object.freeze(["Low", "Medium", "High"]),
    ARROW: Object.freeze(["curved", "straight"]),
    BRANCH_SCALE: Object.freeze(["Hierarchical", "Uniform"]),
  });

  const FONT_SCALE_TYPES = VALUE_SETS.FONT_SCALE;

  const GROWTH_TYPES = VALUE_SETS.GROWTH;

  const ZOOM_TYPES = VALUE_SETS.ZOOM;

  const SCOPE = VALUE_SETS.SCOPE;

  const ARROW_TYPES = VALUE_SETS.ARROW;

  const BRANCH_SCALE_TYPES = VALUE_SETS.BRANCH_SCALE;

  const ZOOM_LEVELS = Object.freeze({
    Low: { desktop: 0.1, mobile: 0.2 },
    Medium: { desktop: 0.25, mobile: 0.35 },
    High: { desktop: 0.5, mobile: 0.6 },
  });

  const K_WIDTH = "Max Text Width";

  const K_FONTSIZE = "Font Sizes";

  const K_BOX = "Box Children";

  const K_ROUND = "Rounded Corners";

  const K_BRANCH_SCALE = "Branch Scale Style";

  const K_BASE_WIDTH = "Base Stroke Width";

  const K_GROWTH = "Growth Mode";

  const K_MULTICOLOR = "Multicolor Mode";

  const K_UNDOCKED = "Is Undocked";

  const K_GROUP = "Group Branches";

  const K_ARROWSTROKE = "Arrow Stroke Style";

  const K_CENTERTEXT = "Center text in nodes?";

  const K_ZOOM = "Preferred Zoom Level";

  const K_HOTKEYS = "Hotkeys";

  const K_PALETTE = "Custom Palette";

  const K_LAYOUT = "Layout Config";

  const K_ARROW_TYPE = "Arrow Type";

  const K_FILL_SWEEP = "Fill Sweep";

  const K_INJECT_LINK = "Inject Node Link";

  const K_LINK_ALIAS = "Node Link Alias";

  const K_PRESETS = "Map Presets";

  const K_ACTIVE_PRESET = "Active Preset";

  // ---------------------------------------------------------------------------
  // Layout & Geometry Settings
  // ---------------------------------------------------------------------------
  const LAYOUT_METADATA = {
    // --- General ---
    GAP_X: {
      section: "SECTION_GENERAL",
      def: 120,
      min: 10,
      max: 400,
      step: 10,
      desc: runtimeContext.t("DESC_LAYOUT_GAP_X"),
      name: runtimeContext.t("GAP_X"),
    },
    GAP_Y: {
      section: "SECTION_GENERAL",
      def: 25,
      min: 5,
      max: 150,
      step: 5,
      desc: runtimeContext.t("DESC_LAYOUT_GAP_Y"),
      name: runtimeContext.t("GAP_Y"),
    },
    GAP_MULTIPLIER: {
      section: "SECTION_GENERAL",
      def: 0.6,
      min: 0.1,
      max: 3.0,
      step: 0.1,
      desc: runtimeContext.t("DESC_LAYOUT_GAP_MULTIPLIER"),
      name: runtimeContext.t("GAP_MULTIPLIER"),
    },
    // --- Radial (New & Updated) ---
    ROOT_RADIUS_FACTOR: {
      section: "SECTION_GENERAL",
      def: 0.8,
      min: 0.5,
      max: 2.0,
      step: 0.1,
      desc: runtimeContext.t("DESC_LAYOUT_ROOT_RADIUS"),
      name: runtimeContext.t("ROOT_RADIUS_FACTOR"),
    },
    MIN_RADIUS: {
      section: "SECTION_GENERAL",
      def: 350,
      min: 30,
      max: 800,
      step: 10,
      desc: runtimeContext.t("DESC_LAYOUT_MIN_RADIUS"),
      name: runtimeContext.t("MIN_RADIUS"),
    },
    RADIAL_ASPECT_RATIO: {
      section: "SECTION_RADIAL",
      def: 0.7,
      min: 0.5,
      max: 2.0,
      step: 0.1,
      desc: runtimeContext.t("DESC_RADIAL_ASPECT_RATIO"),
      name: runtimeContext.t("RADIAL_ASPECT_RATIO"),
    },
    RADIAL_POLE_GAP_BONUS: {
      section: "SECTION_RADIAL",
      def: 2.0,
      min: 0.0,
      max: 5.0,
      step: 0.1,
      desc: runtimeContext.t("DESC_RADIAL_POLE_GAP_BONUS"),
      name: runtimeContext.t("RADIAL_POLE_GAP_BONUS"),
    },
    RADIAL_START_ANGLE: {
      section: "SECTION_RADIAL",
      def: 280,
      min: 0,
      max: 360,
      step: 10,
      desc: runtimeContext.t("DESC_RADIAL_START_ANGLE"),
      name: runtimeContext.t("RADIAL_START_ANGLE"),
    },
    RADIAL_MAX_SWEEP: {
      section: "SECTION_RADIAL",
      def: 340,
      min: 90,
      max: 360,
      step: 10,
      desc: runtimeContext.t("DESC_RADIAL_MAX_SWEEP"),
      name: runtimeContext.t("RADIAL_MAX_SWEEP"),
    },
    // --- Directional ---
    DIRECTIONAL_ARC_SPAN_RADIANS: {
      section: "SECTION_DIRECTIONAL",
      def: 1.0,
      min: 0.1,
      max: 3.14,
      step: 0.1,
      desc: runtimeContext.t("DESC_LAYOUT_ARC_SPAN"),
      name: runtimeContext.t("DIRECTIONAL_ARC_SPAN_RADIANS"),
    },
    GAP_MULTIPLIER_DIRECTIONAL: {
      section: "SECTION_DIRECTIONAL",
      def: 1.5,
      min: 1.0,
      max: 3.0,
      step: 0.1,
      desc: runtimeContext.t("DESC_LAYOUT_GAP_DIRECTIONAL"),
      name: runtimeContext.t("GAP_MULTIPLIER_DIRECTIONAL"),
    },
    RADIUS_PADDING_PER_NODE: {
      section: "SECTION_DIRECTIONAL",
      def: 7,
      min: 0,
      max: 20,
      step: 1,
      desc: runtimeContext.t("DESC_LAYOUT_RADIUS_PADDING"),
      name: runtimeContext.t("RADIUS_PADDING_PER_NODE"),
    },
    // --- Vertical Maps (Up/Down) ---
    VERTICAL_SUBTREE_WIDTH_BLEND_SINGLE: {
      section: "SECTION_VERTICAL",
      def: 0.35,
      min: 0.05,
      max: 1.2,
      step: 0.05,
      desc: runtimeContext.t("DESC_VERTICAL_SUBTREE_WIDTH_BLEND_SINGLE"),
      name: runtimeContext.t("VERTICAL_SUBTREE_WIDTH_BLEND_SINGLE"),
    },
    VERTICAL_SUBTREE_WIDTH_BLEND_DUAL: {
      section: "SECTION_VERTICAL",
      def: 0.6,
      min: 0.1,
      max: 1.4,
      step: 0.05,
      desc: runtimeContext.t("DESC_VERTICAL_SUBTREE_WIDTH_BLEND_DUAL"),
      name: runtimeContext.t("VERTICAL_SUBTREE_WIDTH_BLEND_DUAL"),
    },
    VERTICAL_SUBTREE_SMOOTH_THRESHOLD_MULTIPLIER: {
      section: "SECTION_VERTICAL",
      def: 6.0,
      min: 0.5,
      max: 20.0,
      step: 0.5,
      desc: runtimeContext.t("DESC_VERTICAL_SUBTREE_SMOOTH_THRESHOLD_MULTIPLIER"),
      name: runtimeContext.t("VERTICAL_SUBTREE_SMOOTH_THRESHOLD_MULTIPLIER"),
    },
    VERTICAL_SUBTREE_SMOOTH_MIN_SCALE: {
      section: "SECTION_VERTICAL",
      def: 240,
      min: 10,
      max: 1600,
      step: 10,
      desc: runtimeContext.t("DESC_VERTICAL_SUBTREE_SMOOTH_MIN_SCALE"),
      name: runtimeContext.t("VERTICAL_SUBTREE_SMOOTH_MIN_SCALE"),
    },
    HORIZONTAL_L1_SOFTCAP_THRESHOLD: {
      section: "SECTION_VERTICAL",
      def: 560,
      min: 20,
      max: 3000,
      step: 20,
      desc: runtimeContext.t("DESC_HORIZONTAL_L1_SOFTCAP_THRESHOLD"),
      name: runtimeContext.t("HORIZONTAL_L1_SOFTCAP_THRESHOLD"),
    },
    HORIZONTAL_L1_COMPRESSION_MIN_SCALE: {
      section: "SECTION_VERTICAL",
      def: 240,
      min: 10,
      max: 1600,
      step: 10,
      desc: runtimeContext.t("DESC_HORIZONTAL_L1_COMPRESSION_MIN_SCALE"),
      name: runtimeContext.t("HORIZONTAL_L1_COMPRESSION_MIN_SCALE"),
    },
    VERTICAL_COMPACT_PARENT_CHILD_GAP_RATIO: {
      section: "SECTION_VERTICAL",
      def: 0.55,
      min: 0.05,
      max: 1.3,
      step: 0.05,
      desc: runtimeContext.t("DESC_VERTICAL_COMPACT_PARENT_CHILD_GAP_RATIO"),
      name: runtimeContext.t("VERTICAL_COMPACT_PARENT_CHILD_GAP_RATIO"),
    },
    DIRECTIONAL_CROSS_AXIS_RATIO: {
      section: "SECTION_VERTICAL",
      def: 0.2,
      min: 0.05,
      max: 1.2,
      step: 0.05,
      desc: runtimeContext.t("DESC_DIRECTIONAL_CROSS_AXIS_RATIO"),
      name: runtimeContext.t("DIRECTIONAL_CROSS_AXIS_RATIO"),
    },
    // --- Visuals ---
    INDICATOR_OFFSET: {
      section: "SECTION_VISUALS",
      def: 10,
      min: 5,
      max: 50,
      step: 5,
      desc: runtimeContext.t("DESC_LAYOUT_INDICATOR_OFFSET"),
      name: runtimeContext.t("INDICATOR_OFFSET"),
    },
    INDICATOR_OPACITY: {
      section: "SECTION_VISUALS",
      def: 40,
      min: 10,
      max: 100,
      step: 10,
      desc: runtimeContext.t("DESC_LAYOUT_INDICATOR_OPACITY"),
      name: runtimeContext.t("INDICATOR_OPACITY"),
    },
    CONTAINER_PADDING: {
      section: "SECTION_VISUALS",
      def: 10,
      min: 0,
      max: 50,
      step: 2,
      desc: runtimeContext.t("DESC_LAYOUT_CONTAINER_PADDING"),
      name: runtimeContext.t("CONTAINER_PADDING"),
    },
    MAX_SEGMENT_LENGTH: {
      section: "SECTION_VISUALS",
      def: 80,
      min: 30,
      max: 200,
      step: 10,
      desc: runtimeContext.t("DESC_LAYOUT_BOUNDARY_LINE_PRECISION"),
      name: runtimeContext.t("MAX_SEGMENT_LENGTH"),
    },
    // --- Manual Mode ---
    MANUAL_GAP_MULTIPLIER: {
      section: "SECTION_MANUAL",
      def: 1.3,
      min: 1.0,
      max: 2.0,
      step: 0.1,
      desc: runtimeContext.t("DESC_LAYOUT_MANUAL_GAP"),
      name: runtimeContext.t("MANUAL_GAP_MULTIPLIER"),
    },
    MANUAL_JITTER_RANGE: {
      section: "SECTION_MANUAL",
      def: 300,
      min: 0,
      max: 400,
      step: 10,
      desc: runtimeContext.t("DESC_LAYOUT_MANUAL_JITTER"),
      name: runtimeContext.t("MANUAL_JITTER_RANGE"),
    },
  };

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------
  const COLOR_CONTRAST_MIN = 2.5;

  const COLOR_DISTINCT_THRESHOLD = 40;

  const HUE_STEP_BASE = 15;

  const HUE_STEP_JITTER = 4;

  const SAT_BASE = 75;

  const SAT_JITTER = 10;

  const LIGHT_BASE_DARK = 65;

  const LIGHT_JITTER_DARK = 10;

  const LIGHT_BASE_LIGHT = 36;

  const LIGHT_JITTER_LIGHT = 8;

  // ---------------------------------------------------------------------------
  // UI & Interaction Constants
  // ---------------------------------------------------------------------------
  const WRAP_WIDTH_MIN = 100;

  const WRAP_WIDTH_MAX = 600;

  const WRAP_WIDTH_STEP = 10;

  const FLOAT_MODAL_OPACITY = 0.8;

  const FLOAT_MODAL_OFFSET = 5;

  const FLOAT_MODAL_MAX_HEIGHT = "calc(2 * var(--size-4-4) + 12px + var(--input-height))";

  const NOTICE_DURATION_CONFLICT = 6000;

  const NOTICE_DURATION_GLOBAL_CONFLICT = 10000;

  // ---------------------------------------------------------------------------
  // Map Presets State & Helpers
  // ---------------------------------------------------------------------------
  const LAYOUT_DEFAULTS = {};

  const IMAGE_TYPES = [
    "jpeg",
    "jpg",
    "png",
    "gif",
    "svg",
    "webp",
    "bmp",
    "ico",
    "jtif",
    "tif",
    "jfif",
    "avif",
  ];

  const EMBEDED_OBJECT_WIDTH_ROOT = 400;

  const EMBEDED_OBJECT_WIDTH_CHILD = 180;

  // ------------------------------------------------
  // HOTKEY SUPPORT FUNCTIONS
  // ------------------------------------------------
  const ACTION_ADD = "Add";

  const ACTION_ADD_SIBLING_AFTER = "Add Next Sibling";

  const ACTION_ADD_SIBLING_BEFORE = "Add Prev Sibling";

  const ACTION_ADD_FOLLOW = "Add + follow";

  const ACTION_ADD_FOLLOW_FOCUS = "Add + follow + focus";

  const ACTION_ADD_FOLLOW_ZOOM = "Add + follow + zoom";

  const ACTION_SORT_ORDER = "Change Order/Promote Node";

  const ACTION_EDIT = "Edit node";

  const ACTION_TOGGLE_CHECKBOX = "Toggle Checkbox";

  const ACTION_CALENDAR = "Calendar";

  const ACTION_PIN = "Pin/Unpin";

  const ACTION_BOX = "Box/Unbox";

  const ACTION_TOGGLE_GROUP = "Group/Ungroup Single Branch";

  const ACTION_COPY = "Copy";

  const ACTION_CUT = "Cut";

  const ACTION_PASTE = "Paste";

  const ACTION_IMPORT_OUTLINE = "Import Outline from Linked File";

  const ACTION_ZOOM = "Cycle Zoom";

  const ACTION_FOCUS = "Focus (center) node";

  const ACTION_NAVIGATE = "Navigate";

  const ACTION_NAVIGATE_ZOOM = "Navigate & zoom";

  const ACTION_NAVIGATE_FOCUS = "Navigate & focus";

  const ACTION_FOLD = "Fold/Unfold Branch";

  const ACTION_FOLD_L1 = "Fold/Unfold to Level 1";

  const ACTION_FOLD_ALL = "Fold/Unfold Branch Recursively";

  const ACTION_TOGGLE_BOUNDARY = "Toggle Boundary";

  const ACTION_TOGGLE_SUBMAP_ROOT = "Toggle Submap Root";

  const ACTION_TOGGLE_EMBED = "Toggle Embed/Link";

  const ACTION_DOCK_UNDOCK = "Dock/Undock";

  const ACTION_HIDE = "Dock & hide";

  const ACTION_REARRANGE = "Rearrange Map";

  const ACTION_TOGGLE_FLOATING_EXTRAS = "Toggle Floating Extra Buttons";

  const ACTION_UNDO = "Undo";

  const ACTION_REDO_Z = "Redo (Ctrl-Shift-Z)";

  const ACTION_REDO_Y = "Redo (Ctrl-Y)";

  const ACTION_LABEL_KEYS = {
    [ACTION_ADD]: "ACTION_LABEL_ADD",
    [ACTION_ADD_SIBLING_AFTER]: "ACTION_LABEL_ADD_SIBLING_AFTER",
    [ACTION_ADD_SIBLING_BEFORE]: "ACTION_LABEL_ADD_SIBLING_BEFORE",
    [ACTION_ADD_FOLLOW]: "ACTION_LABEL_ADD_FOLLOW",
    [ACTION_ADD_FOLLOW_FOCUS]: "ACTION_LABEL_ADD_FOLLOW_FOCUS",
    [ACTION_ADD_FOLLOW_ZOOM]: "ACTION_LABEL_ADD_FOLLOW_ZOOM",
    [ACTION_SORT_ORDER]: "ACTION_LABEL_SORT_ORDER",
    [ACTION_EDIT]: "ACTION_LABEL_EDIT",
    [ACTION_TOGGLE_CHECKBOX]: "ACTION_LABEL_TOGGLE_CHECKBOX",
    [ACTION_CALENDAR]: "ACTION_LABEL_CALENDAR",
    [ACTION_PIN]: "ACTION_LABEL_PIN",
    [ACTION_BOX]: "ACTION_LABEL_BOX",
    [ACTION_TOGGLE_GROUP]: "ACTION_LABEL_TOGGLE_GROUP",
    [ACTION_COPY]: "ACTION_LABEL_COPY",
    [ACTION_CUT]: "ACTION_LABEL_CUT",
    [ACTION_PASTE]: "ACTION_LABEL_PASTE",
    [ACTION_IMPORT_OUTLINE]: "ACTION_LABEL_IMPORT_OUTLINE",
    [ACTION_ZOOM]: "ACTION_LABEL_ZOOM",
    [ACTION_FOCUS]: "ACTION_LABEL_FOCUS",
    [ACTION_NAVIGATE]: "ACTION_LABEL_NAVIGATE",
    [ACTION_NAVIGATE_ZOOM]: "ACTION_LABEL_NAVIGATE_ZOOM",
    [ACTION_NAVIGATE_FOCUS]: "ACTION_LABEL_NAVIGATE_FOCUS",
    [ACTION_FOLD]: "ACTION_LABEL_FOLD",
    [ACTION_FOLD_L1]: "ACTION_LABEL_FOLD_L1",
    [ACTION_FOLD_ALL]: "ACTION_LABEL_FOLD_ALL",
    [ACTION_TOGGLE_BOUNDARY]: "TOOLTIP_TOGGLE_BOUNDARY",
    [ACTION_TOGGLE_SUBMAP_ROOT]: "ACTION_LABEL_TOGGLE_SUBMAP_ROOT",
    [ACTION_TOGGLE_EMBED]: "ACTION_LABEL_TOGGLE_EMBED",
    [ACTION_DOCK_UNDOCK]: "ACTION_LABEL_DOCK_UNDOCK",
    [ACTION_HIDE]: "ACTION_LABEL_HIDE",
    [ACTION_REARRANGE]: "ACTION_LABEL_REARRANGE",
    [ACTION_TOGGLE_FLOATING_EXTRAS]: "TOOLTIP_TOGGLE_FLOATING_EXTRAS",
    [ACTION_UNDO]: "Undo",
    [ACTION_REDO_Z]: "Redo",
    [ACTION_REDO_Y]: "Redo",
  };

  // Default configuration
  // scope may be "input" | "excalidraw" | "global"
  // - input: the hotkey only works if the inputEl has focus
  // - excalidraw: the hotkey works when either the inputEl has focus or the sidepanelView leaf or the Excalidraw leaf is active
  // - global: the hotkey works across obsidian, when ever the Excalidraw view in ea.targetView is visible, i.e. the hotkey works even if the user is active in a leaf like pdf viewer, markdown note, open next to Excalidraw.
  // - none: ea.targetView not set or Excalidraw leaf not visible
  const DEFAULT_HOTKEYS = [
    // Creation - Enter based
    {
      action: ACTION_ADD,
      key: "Enter",
      modifiers: [],
      scope: SCOPE.input,
      isInputOnly: true,
      requiresNode: false,
    },
    {
      action: ACTION_ADD_SIBLING_AFTER,
      key: "Enter",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: true,
      requiresNode: false,
    },
    {
      action: ACTION_ADD_SIBLING_BEFORE,
      key: "Enter",
      modifiers: ["Alt", "Shift"],
      scope: SCOPE.input,
      isInputOnly: true,
      requiresNode: false,
    },
    {
      action: ACTION_ADD_FOLLOW,
      key: "Enter",
      modifiers: ["Mod", "Alt"],
      scope: SCOPE.input,
      isInputOnly: true,
      requiresNode: false,
    },
    {
      action: ACTION_ADD_FOLLOW_FOCUS,
      key: "Enter",
      modifiers: ["Mod"],
      scope: SCOPE.input,
      isInputOnly: true,
      requiresNode: false,
    },
    {
      action: ACTION_ADD_FOLLOW_ZOOM,
      key: "Enter",
      modifiers: ["Mod", "Shift"],
      scope: SCOPE.input,
      isInputOnly: true,
      requiresNode: false,
    },
    //Window
    {
      action: ACTION_DOCK_UNDOCK,
      key: "Enter",
      modifiers: ["Shift"],
      scope: SCOPE.input,
      isInputOnly: true,
      requiresNode: false,
    },
    {
      action: ACTION_HIDE,
      key: "Escape",
      modifiers: [],
      scope: SCOPE.excalidraw,
      isInputOnly: true,
      requiresNode: false,
    },
    // Edit
    {
      action: ACTION_EDIT,
      code: "KeyE",
      modifiers: ["Mod"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    // Structure Modifiers
    {
      action: ACTION_TOGGLE_CHECKBOX,
      code: "KeyL",
      modifiers: ["Mod"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_CALENDAR,
      code: "KeyD",
      modifiers: ["Alt", "Mod"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: false,
    },
    {
      action: ACTION_PIN,
      code: "KeyP",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_BOX,
      code: "KeyB",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_TOGGLE_BOUNDARY,
      code: "KeyB",
      modifiers: ["Alt", "Shift"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_TOGGLE_SUBMAP_ROOT,
      code: "KeyJ",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_TOGGLE_GROUP,
      code: "KeyG",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_TOGGLE_EMBED,
      code: "KeyE",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    // Clipboard (Alt to distinguish from text editing)
    {
      action: ACTION_COPY,
      code: "KeyC",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_CUT,
      code: "KeyX",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_PASTE,
      code: "KeyV",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: false,
    },
    {
      action: ACTION_IMPORT_OUTLINE,
      code: "KeyI",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    // View Actions
    {
      action: ACTION_REARRANGE,
      code: "KeyR",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_ZOOM,
      code: "KeyZ",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_FOCUS,
      code: "KeyF",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: false,
    },
    //Navigation
    {
      action: ACTION_NAVIGATE,
      key: "ArrowKeys",
      modifiers: ["Alt"],
      isNavigation: true,
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_NAVIGATE_ZOOM,
      key: "ArrowKeys",
      modifiers: ["Alt", "Shift"],
      isNavigation: true,
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_NAVIGATE_FOCUS,
      key: "ArrowKeys",
      modifiers: ["Alt", "Mod"],
      isNavigation: true,
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_SORT_ORDER,
      code: "ArrowKeys",
      modifiers: ["Mod"],
      isNavigation: true,
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_FOLD,
      code: "Digit1",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_FOLD_L1,
      code: "Digit2",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    {
      action: ACTION_FOLD_ALL,
      code: "Digit3",
      modifiers: ["Alt"],
      scope: SCOPE.input,
      isInputOnly: false,
      requiresNode: true,
    },
    // Undo / Redo
    {
      action: ACTION_UNDO,
      key: "z",
      modifiers: ["Mod"],
      scope: SCOPE.excalidraw,
      isInputOnly: false,
      hidden: true,
      requiresNode: false,
    },
    {
      action: ACTION_REDO_Z,
      key: "z",
      modifiers: ["Mod", "Shift"],
      scope: SCOPE.excalidraw,
      isInputOnly: false,
      hidden: true,
      requiresNode: false,
    },
    {
      action: ACTION_REDO_Y,
      key: "y",
      modifiers: ["Mod"],
      scope: SCOPE.excalidraw,
      isInputOnly: false,
      hidden: true,
      requiresNode: false,
    },
  ];

  const MAP_ROOT_CUSTOMDATA_KEYS = [
    "isAdditionalRoot",
    "growthMode",
    "autoLayoutDisabled",
    "arrowType",
    "fontsizeScale",
    "multicolor",
    "boxChildren",
    "roundedCorners",
    "maxWrapWidth",
    "isSolidArrow",
    "centerText",
    "fillSweep",
    "branchScale",
    "baseStrokeWidth",
    "layoutSettings",
  ];

  const MINDMAP_FOCUS_STYLE_ID = "excalidraw-mindmap-focus-style";
  return {
    VALUE_SETS,
    FONT_SCALE_TYPES,
    GROWTH_TYPES,
    ZOOM_TYPES,
    SCOPE,
    ARROW_TYPES,
    BRANCH_SCALE_TYPES,
    ZOOM_LEVELS,
    K_WIDTH,
    K_FONTSIZE,
    K_BOX,
    K_ROUND,
    K_BRANCH_SCALE,
    K_BASE_WIDTH,
    K_GROWTH,
    K_MULTICOLOR,
    K_UNDOCKED,
    K_GROUP,
    K_ARROWSTROKE,
    K_CENTERTEXT,
    K_ZOOM,
    K_HOTKEYS,
    K_PALETTE,
    K_LAYOUT,
    K_ARROW_TYPE,
    K_FILL_SWEEP,
    K_INJECT_LINK,
    K_LINK_ALIAS,
    K_PRESETS,
    K_ACTIVE_PRESET,
    LAYOUT_METADATA,
    COLOR_CONTRAST_MIN,
    COLOR_DISTINCT_THRESHOLD,
    HUE_STEP_BASE,
    HUE_STEP_JITTER,
    SAT_BASE,
    SAT_JITTER,
    LIGHT_BASE_DARK,
    LIGHT_JITTER_DARK,
    LIGHT_BASE_LIGHT,
    LIGHT_JITTER_LIGHT,
    WRAP_WIDTH_MIN,
    WRAP_WIDTH_MAX,
    WRAP_WIDTH_STEP,
    FLOAT_MODAL_OPACITY,
    FLOAT_MODAL_OFFSET,
    FLOAT_MODAL_MAX_HEIGHT,
    NOTICE_DURATION_CONFLICT,
    NOTICE_DURATION_GLOBAL_CONFLICT,
    LAYOUT_DEFAULTS,
    IMAGE_TYPES,
    EMBEDED_OBJECT_WIDTH_ROOT,
    EMBEDED_OBJECT_WIDTH_CHILD,
    ACTION_ADD,
    ACTION_ADD_SIBLING_AFTER,
    ACTION_ADD_SIBLING_BEFORE,
    ACTION_ADD_FOLLOW,
    ACTION_ADD_FOLLOW_FOCUS,
    ACTION_ADD_FOLLOW_ZOOM,
    ACTION_SORT_ORDER,
    ACTION_EDIT,
    ACTION_TOGGLE_CHECKBOX,
    ACTION_CALENDAR,
    ACTION_PIN,
    ACTION_BOX,
    ACTION_TOGGLE_GROUP,
    ACTION_COPY,
    ACTION_CUT,
    ACTION_PASTE,
    ACTION_IMPORT_OUTLINE,
    ACTION_ZOOM,
    ACTION_FOCUS,
    ACTION_NAVIGATE,
    ACTION_NAVIGATE_ZOOM,
    ACTION_NAVIGATE_FOCUS,
    ACTION_FOLD,
    ACTION_FOLD_L1,
    ACTION_FOLD_ALL,
    ACTION_TOGGLE_BOUNDARY,
    ACTION_TOGGLE_SUBMAP_ROOT,
    ACTION_TOGGLE_EMBED,
    ACTION_DOCK_UNDOCK,
    ACTION_HIDE,
    ACTION_REARRANGE,
    ACTION_TOGGLE_FLOATING_EXTRAS,
    ACTION_UNDO,
    ACTION_REDO_Z,
    ACTION_REDO_Y,
    ACTION_LABEL_KEYS,
    DEFAULT_HOTKEYS,
    MAP_ROOT_CUSTOMDATA_KEYS,
    MINDMAP_FOCUS_STYLE_ID,
  };
}
