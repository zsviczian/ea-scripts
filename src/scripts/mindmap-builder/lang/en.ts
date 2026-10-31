export const en = {
  requiresNewerVersion: "Please update the Excalidraw plugin to version {version} or higher.",
  launchFailed: "Mindmap Builder could not start. See the developer console for details.",
  // Notices
  NOTICE_SELECT_NODE_TO_COPY: "Select a node to copy.",
  NOTICE_MAP_CUT: "Map cut to clipboard.",
  NOTICE_BRANCH_CUT: "Branch cut to clipboard.",
  NOTICE_MAP_COPIED: "Map copied as markdown.",
  NOTICE_BRANCH_COPIED: "Branch copied as bullet list.",
  NOTICE_MERMAID_COPIED: "Copied as a Mermaid mindmap.",
  NOTICE_MERMAID_INVALID: "Cannot paste this Mermaid mindmap. Use one root and indent its children.",
  LABEL_COPY_MERMAID: "Mermaid mindmap",
  DESC_COPY_MERMAID: "Copy the selected branch, including its children, as a Mermaid code block.",
  BUTTON_COPY_MERMAID: "Copy as Mermaid",
  MERMAID_EMPTY_NODE: "Untitled node",
  NOTICE_CLIPBOARD_EMPTY: "Clipboard is empty.",
  NOTICE_PASTE_ABORTED: "Paste aborted. Clipboard does not start with a Markdown list or header.",
  NOTICE_NO_LIST: "No valid Markdown list found on clipboard.",
  NOTICE_PASTE_START: "Pasiting, please wait, this can take a while...",
  NOTICE_PASTE_COMPLETE: "Paste complete.",
  NOTICE_BRANCH_PASTE_INVALID: "Cannot paste this branch: its Mindmap connections are invalid.",
  NOTICE_BRANCH_PASTE_FAILED:
    "Branch paste could not finish. Any pasted elements remain in the drawing. Check the drawing before retrying.",
  NOTICE_ACTION_REQUIRES_ARROWS: "This action requires Arrow Keys. Only modifiers can be changed.",
  NOTICE_CONFLICT_WITH_ACTION: 'Conflict with "{action}"',
  NOTICE_OBSIDIAN_HOTKEY_CONFLICT:
    '⚠️ Obsidian Hotkey Conflict!\n\nThis key overrides:\n"{command}"',
  NOTICE_GLOBAL_HOTKEY_CONFLICT: '⚠️ Global Hotkey Conflict!\n\nThis key overrides:\n"{command}"',
  NOTICE_NO_HEADINGS: "No headings found in the linked file.",
  NOTICE_CANNOT_EDIT_MULTILINE:
    "Cannot edit multi-line nodes directly.\nDouble-click the element in Excalidraw to edit, then run auto re-arrange map to update the layout.",
  NOTICE_CANNOT_MOVE_PINNED: "Cannot move pinned nodes. Unpin the node first.",
  NOTICE_CANNOT_MOVE_ROOT: "Cannot move the root node.",
  NOTICE_CANNOT_PRMOTE_L1: "Cannot promote Level 1 nodes.",
  NOTICE_CANNOT_DEMOTE: "Cannot demote node. No previous sibling to attach to.",
  NOTICE_SELECT_NODE_CONTAINING_LINK: "Select a node containing a link.",
  NOTICE_CANNOT_DEMOTE_NO_SIBLING_TO_ACCEPT: "Cannot demote: No sibling found to accept this node.",
  NOTICE_CANNOT_DEMOTE_NO_VALID_SIBLING: "Cannot demote: No valid sibling to attach to.",
  NOTICE_CANNOT_DEMOTE_CROSS_SIDE_NOT_ALLOWED: "Cannot demote: Cross-side demotion is not allowed.",
  NOTICE_CANNOT_MOVE_AUTO_LAYOUT_DISABLED:
    "Cannot move nodes when Auto-Layout is disabled. Enable Auto-Layout first.",
  NOTICE_BRANCH_WIDTH_MANUAL_OVERRIDE:
    "Branch width were not updated because some branch widths were manually modified.",
  NOTICE_CANNOT_CHANGE_MASTER_ROOT: "The master root cannot be converted.",
  NOTICE_SUBMAP_ROOT_ADDED: "Submap root enabled.",
  NOTICE_SUBMAP_ROOT_REMOVED: "Submap root removed. Children now follow the parent map layout.",
  CONFIRM_REMOVE_SUBMAP_ROOT:
    "Change this submap root back to a normal node?\n\nIt will lose its local layout metadata, and its children will be rearranged by the parent root's layout logic.",

  // Action labels (display only)
  ACTION_LABEL_ADD: "Add Child",
  ACTION_LABEL_ADD_SIBLING_AFTER: "Add Next Sibling",
  ACTION_LABEL_ADD_SIBLING_BEFORE: "Add Prev Sibling",
  ACTION_LABEL_ADD_FOLLOW: "Add + follow",
  ACTION_LABEL_ADD_FOLLOW_FOCUS: "Add + follow + focus",
  ACTION_LABEL_ADD_FOLLOW_ZOOM: "Add + follow + zoom",
  ACTION_LABEL_SORT_ORDER: "Change Order/Promote Node",
  ACTION_LABEL_EDIT: "Edit node",
  ACTION_LABEL_PIN: "Pin/Unpin",
  ACTION_LABEL_BOX: "Box/Unbox",
  ACTION_LABEL_TOGGLE_GROUP: "Group/Ungroup Single Branch",
  ACTION_LABEL_COPY: "Copy",
  ACTION_LABEL_CUT: "Cut",
  ACTION_LABEL_PASTE: "Paste",
  ACTION_LABEL_IMPORT_OUTLINE: "Import Outline",
  ACTION_LABEL_ZOOM: "Cycle Zoom",
  ACTION_LABEL_FOCUS: "Focus (center) node",
  ACTION_LABEL_NAVIGATE: "Navigate",
  ACTION_LABEL_NAVIGATE_ZOOM: "Navigate & zoom",
  ACTION_LABEL_NAVIGATE_FOCUS: "Navigate & focus",
  ACTION_LABEL_FOLD: "Fold/Unfold Branch",
  ACTION_LABEL_FOLD_L1: "Fold/Unfold to Level 1",
  ACTION_LABEL_FOLD_ALL: "Fold/Unfold Branch Recursively",
  ACTION_LABEL_DOCK_UNDOCK: "Dock/Undock",
  ACTION_LABEL_HIDE: "Dock & hide",
  ACTION_LABEL_REARRANGE: "Rearrange Map",
  ACTION_LABEL_TOGGLE_SUBMAP_ROOT: "Start/End Submap Root",
  ACTION_LABEL_TOGGLE_CHECKBOX: "Toggle Checkbox Status",
  ACTION_LABEL_CALENDAR: "Task Calendar & Priority",
  ACTION_LABEL_TOGGLE_EMBED: "Toggle Embed/Link",

  // Tooltips (shared)
  PIN_TOOLTIP_PINNED: "This element is pinned. Click to unpin the location of the selected element",
  PIN_TOOLTIP_UNPINNED:
    "This element is not pinned. Click to pin the location of the selected element",
  TOGGLE_GROUP_TOOLTIP_GROUP: 'Group this branch. Only available if "Group Branches" is disabled',
  TOGGLE_GROUP_TOOLTIP_UNGROUP:
    'Ungroup this branch. Only available if "Group Branches" is disabled',
  TOOLTIP_EDIT_NODE: "Edit text of selected node",
  TOOLTIP_PIN_INIT: "Pin/Unpin location of a node. When pinned nodes won't get auto-arranged",
  TOOLTIP_REFRESH: "Auto rearrange map",
  TOOLTIP_DOCK: "Dock to Sidepanel",
  TOOLTIP_UNDOCK: "Undock to Floating Modal",
  TOOLTIP_ZOOM_CYCLE: "Cycle element zoom",
  TOOLTIP_TOGGLE_GROUP_BTN:
    'Toggle grouping/ungrouping of a branch. Only available if "Group Branches" is disabled.',
  TOOLTIP_TOGGLE_BOX: "Toggle node box",
  TOOLTIP_TOGGLE_BOUNDARY: "Toggle subtree boundary",
  TOOLTIP_TOGGLE_FLOATING_EXTRAS: "Toggle extra controls",
  TOOLTIP_CONFIGURE_PALETTE: "Configure custom color palette for branches",
  TOOLTIP_CONFIGURE_LAYOUT: "Configure layout settings",
  TOOLTIP_MOVE_UP: "Move Up",
  TOOLTIP_MOVE_DOWN: "Move Down",
  TOOLTIP_EDIT_COLOR: "Edit",
  TOOLTIP_DELETE_COLOR: "Delete",
  TOOLTIP_OPEN_PALETTE_PICKER: "Open Palette Picker",
  TOOLTIP_FOLD_BRANCH: "Fold/Unfold selected branch",
  TOOLTIP_FOLD_L1_BRANCH: "Fold/Unfold children (Level 1)",
  TOOLTIP_FOLD_ALL: "Fold/Unfold Branch Recursively",
  TOOLTIP_IMPORT_OUTLINE: "Import headings from linked file as child nodes",
  TOOLTIP_RESET_TO_DEFAULT: "Reset to default",
  TOOLTIP_SUBMAP_ROOT_ADD: "Start submap from selected node",
  TOOLTIP_SUBMAP_ROOT_REMOVE: "Convert submap root back to a normal node",
  TOOLTIP_TOGGLE_CHECKBOX: "Toggle task checkbox status",
  TOOLTIP_CALENDAR: "Configure Task Date & Priority",
  TOOLTIP_TOGGLE_EMBED: "Toggle node between Embed and Link",

  // Buttons and labels
  DOCK_TITLE: "Mind Map Builder",
  HELP_SUMMARY: "Help",
  INPUT_PLACEHOLDER: "Concept... type [[ to insert link",
  ONTOLOGY_PLACEHOLDER: "Ontology (Arrow Label)",
  BUTTON_COPY: "Copy",
  BUTTON_CUT: "Cut",
  BUTTON_PASTE: "Paste",
  TITLE_ADD_SIBLING: `Add sibling with {modifier}+Enter`,
  TITLE_ADD_FOLLOW: "Add and follow",
  TITLE_COPY: "Copy branch as text",
  TITLE_CUT: "Cut branch as text",
  TITLE_PASTE: "Paste Markdown or a copied Mindmap branch",
  LABEL_ZOOM_LEVEL: "Zoom Level",
  LABEL_GROWTH_STRATEGY: "Growth Strategy",
  LABEL_FILL_SWEEP: "Fill Sweep Angle",
  DESC_FILL_SWEEP:
    "Distribute nodes across the full Max Sweep Angle immediately, rather than growing the arc gradually as nodes are added.",
  LABEL_ARROW_TYPE: "Curved Connectors",
  LABEL_AUTO_LAYOUT: "Auto-Layout",
  LABEL_GROUP_BRANCHES: "Group Branches",
  LABEL_BOX_CHILD_NODES: "Box Child Nodes",
  LABEL_ROUNDED_CORNERS: "Rounded Corners",
  LABEL_USE_SCENE_STROKE: "Use scene stroke style",
  DESC_USE_SCENE_STROKE:
    "Use the latest stroke style (solid, dashed, dotted) from the scene, or always use solid style for branches.",
  LABEL_BRANCH_SCALE: "Branch Scale",
  LABEL_BASE_WIDTH: "Base Thickness",
  LABEL_MULTICOLOR_BRANCHES: "Multicolor Branches",
  LABEL_MAX_WRAP_WIDTH: "Max Wrap Width",
  LABEL_CENTER_TEXT: "Center text",
  DESC_CENTER_TEXT: "Toggle off: align nodes to right/left depending; Toggle on: center the text.",
  LABEL_FONT_SIZES: "Font Sizes",
  HOTKEY_SECTION_TITLE: "Hotkey Configuration",
  HOTKEY_HINT:
    "These hotkeys may override some Obsidian defaults. They're Local (⌨️) by default, active only when the MindMap input field is focused. Use the 🌐/🎨/⌨️ toggle to change hotkey scope: 🌐 Overrides Obsidian hotkeys whenever an Excalidraw tab is visible, 🎨 Overrides Obsidian hotkeys whenever Excalidraw is focused, ⌨️ Local (input focused).",
  RECORD_HOTKEY_PROMPT: "Press hotkey...",
  ARIA_SCOPE_INPUT: "Local: Active only when MindMap Input is focused",
  ARIA_SCOPE_EXCALIDRAW: "Excalidraw: Active whenever MindMap Input or Excalidraw is focused",
  ARIA_SCOPE_GLOBAL:
    "Global: Active everywhere in Obsidian, whenever the Excalidraw view is visible",
  ARIA_RESTORE_DEFAULT: "Restore default",
  ARIA_CUSTOMIZE_HOTKEY: "Customize this hotkey",
  ARIA_OVERRIDE_COMMAND: "Overrides Obsidian command:\n{command}",

  // Palette manager
  MODAL_PALETTE_TITLE: "Mindmap Branch Palette",
  LABEL_ENABLE_CUSTOM_PALETTE: "Enable Custom Palette",
  DESC_ENABLE_CUSTOM_PALETTE: "Use these colors instead of auto-generated ones.",
  LABEL_RANDOMIZE_ORDER: "Randomize Order",
  DESC_RANDOMIZE_ORDER: "Pick colors randomly instead of sequentially.",
  HEADING_ADD_NEW_COLOR: "Add New Color",
  HEADING_EDIT_COLOR: "Edit Color",
  LABEL_SELECT_COLOR: "Select Color",
  BUTTON_CANCEL_EDIT: "Cancel Edit",
  BUTTON_ADD_COLOR: "Add Color",
  BUTTON_UPDATE_COLOR: "Update Color",

  // Layout configuration
  MODAL_LAYOUT_TITLE: "Layout Configuration",
  // Section Headers
  SECTION_GENERAL: "General Spacing",
  SECTION_RADIAL: "Radial Layout (Clockwise)",
  SECTION_DIRECTIONAL: "Directional Layout (Left/Right)",
  SECTION_VERTICAL: "Vertical Maps (Up/Down)",
  SECTION_VISUALS: "Visual Elements",
  SECTION_MANUAL: "Manual Mode Behavior",
  LAYOUT_RESET: "Reset All to Default",
  LAYOUT_SAVE: "Save & Close",
  // Radial Strings
  RADIAL_ASPECT_RATIO: "Ellipse Aspect Ratio",
  DESC_RADIAL_ASPECT_RATIO:
    "Controls the shape. < 1.0 is tall/narrow (0.7 = portrait). 1.0 is circular. > 1.0 is wide (landscape).",
  RADIAL_POLE_GAP_BONUS: "Pole Gap Bonus",
  DESC_RADIAL_POLE_GAP_BONUS:
    "Increases spacing between nodes at the Top and Bottom. Higher values push nodes further along the arc.",
  RADIAL_START_ANGLE: "Start Angle",
  DESC_RADIAL_START_ANGLE:
    "Where the first node appears (Degrees). 270 is North, 0 is East, 90 is South.",
  RADIAL_MAX_SWEEP: "Max Sweep Angle",
  DESC_RADIAL_MAX_SWEEP:
    "Total arc available to fill. 360 uses full circle. Lower values leave a gap between the first and last node.",
  // Others
  GAP_X: "Gap X",
  DESC_LAYOUT_GAP_X: "Horizontal distance between parent and child nodes.",
  GAP_Y: "Gap Y",
  DESC_LAYOUT_GAP_Y:
    "Vertical distance between sibling nodes. Also used as the base gap for Radial layouts.",
  GAP_MULTIPLIER: "Gap Multiplier",
  DESC_LAYOUT_GAP_MULTIPLIER:
    "Vertical spacing for 'leaf' nodes (no children), relative to font size. Low: list-like stacking. High: standard tree spacing.",
  DIRECTIONAL_ARC_SPAN_RADIANS: "Directional Arc-span Radians",
  DESC_LAYOUT_ARC_SPAN:
    "Curvature of the child list. Low (0.5): Flatter, list-like. High (2.0): Curved, organic, but risk of overlap.",
  ROOT_RADIUS_FACTOR: "Root Radius Factor",
  DESC_LAYOUT_ROOT_RADIUS:
    "Multiplier for the Root node's bounding box to determine initial radius.",
  MIN_RADIUS: "Minimum Radius",
  DESC_LAYOUT_MIN_RADIUS:
    "The absolute minimum distance from the root center to the first level of nodes.",
  RADIUS_PADDING_PER_NODE: "Radius Padding per Node",
  DESC_LAYOUT_RADIUS_PADDING: "Extra radius added per child node to accommodate dense maps.",
  GAP_MULTIPLIER_RADIAL: "Radial-layout Gap Multiplier",
  DESC_LAYOUT_GAP_RADIAL: "Angular spacing multiplier for Radial mode.",
  GAP_MULTIPLIER_DIRECTIONAL: "Vertical-layout Gap Multiplier",
  DESC_LAYOUT_GAP_DIRECTIONAL:
    "Spacing multiplier for Right-facing and Left-facing top level branches",
  INDICATOR_OFFSET: "Fold Indicator Offset",
  DESC_LAYOUT_INDICATOR_OFFSET: "Distance of the '...' fold indicator from the node.",
  INDICATOR_OPACITY: "Fold Indicator Opacity",
  DESC_LAYOUT_INDICATOR_OPACITY: "Opacity of the '...' fold indicator (0-100).",
  CONTAINER_PADDING: "Container Padding",
  DESC_LAYOUT_CONTAINER_PADDING:
    "Padding inside the box when 'Box Child Nodes' or 'Box/Unbox' is used.",
  MAX_SEGMENT_LENGTH: "Boundary Line Precision",
  DESC_LAYOUT_BOUNDARY_LINE_PRECISION:
    "Boundary smoothing precision. Smaller values are more precise (30 = Precise), larger values are rougher (200 = Rough).",
  VERTICAL_SUBTREE_WIDTH_BLEND_SINGLE: "Subtree Width Blend (Single-sided)",
  DESC_VERTICAL_SUBTREE_WIDTH_BLEND_SINGLE:
    "How strongly one-sided submaps (Right-facing / Left-facing) reserve horizontal sibling space in vertical maps. High impact.",
  VERTICAL_SUBTREE_WIDTH_BLEND_DUAL: "Subtree Width Blend (Dual-sided)",
  DESC_VERTICAL_SUBTREE_WIDTH_BLEND_DUAL:
    "How strongly dual-sided submaps (Right-Left) reserve horizontal sibling space in vertical maps. High impact.",
  VERTICAL_SUBTREE_SMOOTH_THRESHOLD_MULTIPLIER: "Subtree Smooth Threshold Multiplier",
  DESC_VERTICAL_SUBTREE_SMOOTH_THRESHOLD_MULTIPLIER:
    "Starts smooth compression after this multiple of Gap Y to avoid spacing jumps when adding more children. Usually subtle unless the map is large.",
  VERTICAL_SUBTREE_SMOOTH_MIN_SCALE: "Subtree Smooth Minimum Scale",
  DESC_VERTICAL_SUBTREE_SMOOTH_MIN_SCALE:
    "Minimum compression scale used by the vertical subtree width smoother. Higher values preserve more width. Usually subtle unless the map is large.",
  HORIZONTAL_L1_SOFTCAP_THRESHOLD: "Horizontal L1 Soft Cap Threshold",
  DESC_HORIZONTAL_L1_SOFTCAP_THRESHOLD:
    "Soft cap (px) before Up/Down Level-1 subtree widths are compressed. Medium to high impact on large maps.",
  HORIZONTAL_L1_COMPRESSION_MIN_SCALE: "Horizontal L1 Compression Min Scale",
  DESC_HORIZONTAL_L1_COMPRESSION_MIN_SCALE:
    "Minimum compression scale for Up/Down Level-1 width compression. Higher values preserve more width. Medium impact after soft cap is reached.",
  VERTICAL_COMPACT_PARENT_CHILD_GAP_RATIO: "Compact Parent-Child Gap Ratio",
  DESC_VERTICAL_COMPACT_PARENT_CHILD_GAP_RATIO:
    "In compact vertical subtrees, uses this fraction of Gap X for parent-child distance. Very high visible impact.",
  DIRECTIONAL_CROSS_AXIS_RATIO: "Directional Cross-axis Ratio",
  DESC_DIRECTIONAL_CROSS_AXIS_RATIO:
    "Cross-axis radius ratio for directional arc layouts (0.2 = flatter arcs, 1.0 = rounder arcs). High visual impact on L1 spread.",
  MANUAL_GAP_MULTIPLIER: "Manual-layout Gap Multiplier",
  DESC_LAYOUT_MANUAL_GAP: "Spacing multiplier when adding nodes while Auto-Layout is disabled.",
  MANUAL_JITTER_RANGE: "Manual-layout Jitter Range",
  DESC_LAYOUT_MANUAL_JITTER:
    "Random position offset when adding nodes while Auto-Layout is disabled.",

  CALENDAR_DATE_INDEX: "Date {index} of {total}",
  CALENDAR_DATE_LABEL: "Date",
  CALENDAR_DATE_TYPE: "Date Type",
  CALENDAR_PRIORITY: "Priority",
  CALENDAR_RECURRENCE: "Recurrence",
  CALENDAR_RECURRENCE_PLACEHOLDER: "every day",
  CALENDAR_RECURRENCE_DESC:
    'e.g., \'every day\', \'every 2 weeks\' <br><a href="https://publish.obsidian.md/tasks/Getting+Started/Recurring+Tasks" target="_blank" tabindex="-1">Tasks recurrence docs</a>',
  CALENDAR_INJECT_LINK: "Inject node link",
  CALENDAR_INJECT_LINK_DESC: "Adds a link to the node at the end of the task.",
  CALENDAR_ALIAS_PLACEHOLDER: "Alias",
  CALENDAR_BTN_CANCEL: "Cancel",
  CALENDAR_BTN_TASK_ONLY: "Task Only",
  CALENDAR_BTN_ADD_DATE_TASK: "Add Date & Task",

  CALENDAR_PRIORITY_HIGHEST: "Highest",
  CALENDAR_PRIORITY_HIGH: "High",
  CALENDAR_PRIORITY_MEDIUM: "Medium",
  CALENDAR_PRIORITY_NORMAL: "Normal",
  CALENDAR_PRIORITY_LOW: "Low",
  CALENDAR_PRIORITY_LOWEST: "Lowest",

  CALENDAR_DATETYPE_DUE: "Due",
  CALENDAR_DATETYPE_START: "Start",
  CALENDAR_DATETYPE_SCHEDULED: "Scheduled",
  CALENDAR_DATETYPE_CREATED: "Created",
  CALENDAR_DATETYPE_DONE: "Done",
  CALENDAR_DATETYPE_CANCELLED: "Cancelled",

  // Presets
  PRESET_LABEL: "Preset",
  PRESET_DEFAULT: "Default",
  PRESET_UNSAVED: "Custom / Unlinked",
  PRESET_BTN_SAVE: "Save to Preset",
  PRESET_BTN_DELETE: "Delete Preset",
  PRESET_BTN_NEW: "Create New Preset",
  PRESET_BTN_APPLY: "Apply Preset to Map",
  PRESET_WARNING_MODIFIED: "Map settings differ from preset.",
  PROMPT_NEW_PRESET_NAME: "New preset name:",
  NOTICE_PRESET_DELETED: "Preset deleted.",
  NOTICE_PRESET_SAVED: "Preset saved.",
  NOTICE_PRESET_APPLIED: "Preset applied.",

  // Misc
  INPUT_TITLE_PASTE_ROOT: "Mindmap Builder Paste",
  INSTRUCTIONS:
    "> [!Tip]\n" +
    ">🚀 Become a MindMap Builder Pro with the Official [MindMap Builder Course](https://www.visual-thinking-workshop.com/mindmap)!\n" +
    "\n" +
    "- **ENTER**: Add a child node and stay on the current parent for rapid entry. " +
    "If you press enter when the input field is empty the focus will move to the child node that was most recently added. " +
    "Pressing enter subsequent times will iterate through the new child's siblings\n" +
    "- **Hotkeys**: See configuration at the bottom of the sidepanel\n" +
    "- **Dock/Undock**: You can dock/undock the input field using the dock/undock button or the configured hotkey\n" +
    "- **Folding**: Fold/Unfold buttons only appear when the input is docked; when undocked, use the folding hotkeys.\n" +
    "- **ESC**: Docks the floating input field without activating the side panel\n" +
    "- **Coloring**: First level branches get unique colors (Multicolor mode). Descendants inherit parent's color.\n" +
    "- **Grouping**:\n" +
    '  - Enabling "Group Branches" recursively groups sub-trees from leaves up to the first level.\n' +
    "- **Copy/Paste**: Builder Copy exports Markdown. To preserve links, images, and grouped notes, use native canvas copy, select the destination parent, then use Builder Paste. With no parent selected, the copied branch becomes an independent map.\n" +
    "\n" +
    "😍 If you find this script helpful, please [buy me a coffee ☕](https://ko-fi.com/zsolt).",
};

export type MindmapTranslationKey = keyof typeof en;
