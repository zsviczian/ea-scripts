import { createSettings } from "./settings.js";
import { createTextParsing } from "./textParsing.js";
import { createGraph } from "./graph.js";
import { createSelection } from "./selection.js";
import { createColors } from "./colors.js";
import { createFolding } from "./folding.js";
import { createDecorations } from "./decorations.js";
import { createNavigation } from "./navigation.js";
import { createLayoutMetrics } from "./layoutMetrics.js";
import { createGrouping } from "./grouping.js";
import { createBoundaries } from "./boundaries.js";
import { createArrows } from "./arrows.js";
import { createHorizontalLayout } from "./horizontalLayout.js";
import { createVerticalLayout } from "./verticalLayout.js";
import { createFirstLevelLayout } from "./firstLevelLayout.js";
import { createLayout } from "./layout.js";
import { createNodes } from "./nodes.js";
import { createMarkdownExport } from "./markdownExport.js";
import { createMarkdownImport } from "./markdownImport.js";
import { createNodeOrder } from "./nodeOrder.js";
import { createNodeStyles } from "./nodeStyles.js";
import { createKeyboard } from "./keyboard.js";
import { createInputUi } from "./inputUi.js";
import { createNodeEditing } from "./nodeEditing.js";
import { createHelpUi } from "./helpUi.js";
import { createPaletteManagerModal } from "./PaletteManagerModal.js";
import { createLayoutConfigModal } from "./LayoutConfigModal.js";
import { createInputControls } from "./inputControls.js";
import { createSidepanelControls } from "./sidepanelControls.js";
import { createStyles } from "./styles.js";
import { createFloatingInput } from "./floatingInput.js";
import { createTasks } from "./tasks.js";
import { createActions } from "./actions.js";
import { createLifecycle } from "./lifecycle.js";
import { createTransactions } from "./transactions.js";
import { createConfiguration } from "./configuration.js";
import { installMindmapPublicApi } from "./publicApi.js";
import { openMindmapSidepanel } from "./sidepanelLifecycle.js";

/**
 * @file runtime.js
 * @overview Import-safe legacy Mindmap Builder implementation.
 * Kept as JavaScript for the mechanical authoring-workspace migration; see CONTRIBUTING.md.
 */

/** Initializes the existing mindmap implementation for one script EA. */
export async function initializeMindmapBuilder(ea, utils, VERSION, t) {
  const { Notice } = ea.obsidian;
  // Getter/setter bridge preserves the original closure's live state and initialization order.
  const runtimeContext = {
    get ACTION_ADD() {
      return ACTION_ADD;
    },
    get ACTION_ADD_FOLLOW() {
      return ACTION_ADD_FOLLOW;
    },
    get ACTION_ADD_FOLLOW_FOCUS() {
      return ACTION_ADD_FOLLOW_FOCUS;
    },
    get ACTION_ADD_FOLLOW_ZOOM() {
      return ACTION_ADD_FOLLOW_ZOOM;
    },
    get ACTION_ADD_SIBLING_AFTER() {
      return ACTION_ADD_SIBLING_AFTER;
    },
    get ACTION_ADD_SIBLING_BEFORE() {
      return ACTION_ADD_SIBLING_BEFORE;
    },
    get ACTION_BOX() {
      return ACTION_BOX;
    },
    get ACTION_CALENDAR() {
      return ACTION_CALENDAR;
    },
    get ACTION_COPY() {
      return ACTION_COPY;
    },
    get ACTION_CUT() {
      return ACTION_CUT;
    },
    get ACTION_DOCK_UNDOCK() {
      return ACTION_DOCK_UNDOCK;
    },
    get ACTION_EDIT() {
      return ACTION_EDIT;
    },
    get ACTION_FOCUS() {
      return ACTION_FOCUS;
    },
    get ACTION_FOLD() {
      return ACTION_FOLD;
    },
    get ACTION_FOLD_ALL() {
      return ACTION_FOLD_ALL;
    },
    get ACTION_FOLD_L1() {
      return ACTION_FOLD_L1;
    },
    get ACTION_HIDE() {
      return ACTION_HIDE;
    },
    get ACTION_IMPORT_OUTLINE() {
      return ACTION_IMPORT_OUTLINE;
    },
    get ACTION_NAVIGATE() {
      return ACTION_NAVIGATE;
    },
    get ACTION_NAVIGATE_FOCUS() {
      return ACTION_NAVIGATE_FOCUS;
    },
    get ACTION_NAVIGATE_ZOOM() {
      return ACTION_NAVIGATE_ZOOM;
    },
    get ACTION_PASTE() {
      return ACTION_PASTE;
    },
    get ACTION_PIN() {
      return ACTION_PIN;
    },
    get ACTION_REARRANGE() {
      return ACTION_REARRANGE;
    },
    get ACTION_REDO_Y() {
      return ACTION_REDO_Y;
    },
    get ACTION_REDO_Z() {
      return ACTION_REDO_Z;
    },
    get ACTION_SORT_ORDER() {
      return ACTION_SORT_ORDER;
    },
    get ACTION_TOGGLE_BOUNDARY() {
      return ACTION_TOGGLE_BOUNDARY;
    },
    get ACTION_TOGGLE_CHECKBOX() {
      return ACTION_TOGGLE_CHECKBOX;
    },
    get ACTION_TOGGLE_EMBED() {
      return ACTION_TOGGLE_EMBED;
    },
    get ACTION_TOGGLE_FLOATING_EXTRAS() {
      return ACTION_TOGGLE_FLOATING_EXTRAS;
    },
    get ACTION_TOGGLE_GROUP() {
      return ACTION_TOGGLE_GROUP;
    },
    get ACTION_TOGGLE_SUBMAP_ROOT() {
      return ACTION_TOGGLE_SUBMAP_ROOT;
    },
    get ACTION_UNDO() {
      return ACTION_UNDO;
    },
    get ACTION_ZOOM() {
      return ACTION_ZOOM;
    },
    get activePresetName() {
      return activePresetName;
    },
    set activePresetName(value) {
      activePresetName = value;
    },
    get addElementsToView() {
      return addElementsToView;
    },
    get addEmbeddableNode() {
      return addEmbeddableNode;
    },
    get addImage() {
      return addImage;
    },
    get addNode() {
      return addNode;
    },
    get addSibling() {
      return addSibling;
    },
    get addUpdateArrowLabel() {
      return addUpdateArrowLabel;
    },
    get api() {
      return api;
    },
    get applyPresetToGlobals() {
      return applyPresetToGlobals;
    },
    get applyPresetToMap() {
      return applyPresetToMap;
    },
    get applyRecursiveGrouping() {
      return applyRecursiveGrouping;
    },
    get ARROW_TYPES() {
      return ARROW_TYPES;
    },
    get arrowType() {
      return arrowType;
    },
    set arrowType(value) {
      arrowType = value;
    },
    get arrowTypeToggle() {
      return arrowTypeToggle;
    },
    set arrowTypeToggle(value) {
      arrowTypeToggle = value;
    },
    get autoLayoutDisabled() {
      return autoLayoutDisabled;
    },
    set autoLayoutDisabled(value) {
      autoLayoutDisabled = value;
    },
    get autoLayoutToggle() {
      return autoLayoutToggle;
    },
    set autoLayoutToggle(value) {
      autoLayoutToggle = value;
    },
    get baseStrokeWidth() {
      return baseStrokeWidth;
    },
    set baseStrokeWidth(value) {
      baseStrokeWidth = value;
    },
    get baseWidthSlider() {
      return baseWidthSlider;
    },
    set baseWidthSlider(value) {
      baseWidthSlider = value;
    },
    get bodyContainer() {
      return bodyContainer;
    },
    set bodyContainer(value) {
      bodyContainer = value;
    },
    get boundaryBtn() {
      return boundaryBtn;
    },
    set boundaryBtn(value) {
      boundaryBtn = value;
    },
    get boxBtn() {
      return boxBtn;
    },
    set boxBtn(value) {
      boxBtn = value;
    },
    get boxChildren() {
      return boxChildren;
    },
    set boxChildren(value) {
      boxChildren = value;
    },
    get boxToggle() {
      return boxToggle;
    },
    set boxToggle(value) {
      boxToggle = value;
    },
    get BRANCH_SCALE_TYPES() {
      return BRANCH_SCALE_TYPES;
    },
    get branchScale() {
      return branchScale;
    },
    set branchScale(value) {
      branchScale = value;
    },
    get branchScaleDropdown() {
      return branchScaleDropdown;
    },
    set branchScaleDropdown(value) {
      branchScaleDropdown = value;
    },
    get buildChildrenMap() {
      return buildChildrenMap;
    },
    get buildElementMap() {
      return buildElementMap;
    },
    get buildGroupToNodes() {
      return buildGroupToNodes;
    },
    get buildParentMap() {
      return buildParentMap;
    },
    get calculateStrokeWidth() {
      return calculateStrokeWidth;
    },
    get calendarBtn() {
      return calendarBtn;
    },
    set calendarBtn(value) {
      calendarBtn = value;
    },
    get cancelHotkeyRecording() {
      return cancelHotkeyRecording;
    },
    set cancelHotkeyRecording(value) {
      cancelHotkeyRecording = value;
    },
    get centerText() {
      return centerText;
    },
    set centerText(value) {
      centerText = value;
    },
    get centerToggle() {
      return centerToggle;
    },
    set centerToggle(value) {
      centerToggle = value;
    },
    get changeNodeOrder() {
      return changeNodeOrder;
    },
    get collectCrosslinkIds() {
      return collectCrosslinkIds;
    },
    get collectDecorationIds() {
      return collectDecorationIds;
    },
    get COLOR_CONTRAST_MIN() {
      return COLOR_CONTRAST_MIN;
    },
    get COLOR_DISTINCT_THRESHOLD() {
      return COLOR_DISTINCT_THRESHOLD;
    },
    get colorToggle() {
      return colorToggle;
    },
    set colorToggle(value) {
      colorToggle = value;
    },
    get commitEdit() {
      return commitEdit;
    },
    get configureArrow() {
      return configureArrow;
    },
    get copyBtn() {
      return copyBtn;
    },
    set copyBtn(value) {
      copyBtn = value;
    },
    get copyMapAsText() {
      return copyMapAsText;
    },
    get currentModalGrowthMode() {
      return currentModalGrowthMode;
    },
    set currentModalGrowthMode(value) {
      currentModalGrowthMode = value;
    },
    get currentTransactionAccumulator() {
      return currentTransactionAccumulator;
    },
    set currentTransactionAccumulator(value) {
      currentTransactionAccumulator = value;
    },
    get customPalette() {
      return customPalette;
    },
    set customPalette(value) {
      customPalette = value;
    },
    get cutBtn() {
      return cutBtn;
    },
    set cutBtn(value) {
      cutBtn = value;
    },
    get DEFAULT_HOTKEYS() {
      return DEFAULT_HOTKEYS;
    },
    get detailsEl() {
      return detailsEl;
    },
    set detailsEl(value) {
      detailsEl = value;
    },
    get diffMapConfig() {
      return diffMapConfig;
    },
    get dirty() {
      return dirty;
    },
    set dirty(value) {
      dirty = value;
    },
    get disableTabEvents() {
      return disableTabEvents;
    },
    set disableTabEvents(value) {
      disableTabEvents = value;
    },
    get dockBtn() {
      return dockBtn;
    },
    set dockBtn(value) {
      dockBtn = value;
    },
    get ea() {
      return ea;
    },
    get editBtn() {
      return editBtn;
    },
    set editBtn(value) {
      editBtn = value;
    },
    get editingNodeId() {
      return editingNodeId;
    },
    set editingNodeId(value) {
      editingNodeId = value;
    },
    get EMBEDED_OBJECT_WIDTH_CHILD() {
      return EMBEDED_OBJECT_WIDTH_CHILD;
    },
    get EMBEDED_OBJECT_WIDTH_ROOT() {
      return EMBEDED_OBJECT_WIDTH_ROOT;
    },
    get ensureNodeSelected() {
      return ensureNodeSelected;
    },
    get extractConfigFromGlobals() {
      return extractConfigFromGlobals;
    },
    get fillSweep() {
      return fillSweep;
    },
    set fillSweep(value) {
      fillSweep = value;
    },
    get fillSweepToggle() {
      return fillSweepToggle;
    },
    set fillSweepToggle(value) {
      fillSweepToggle = value;
    },
    get fillSweepToggleSetting() {
      return fillSweepToggleSetting;
    },
    set fillSweepToggleSetting(value) {
      fillSweepToggleSetting = value;
    },
    get FLOAT_MODAL_MAX_HEIGHT() {
      return FLOAT_MODAL_MAX_HEIGHT;
    },
    get FLOAT_MODAL_OFFSET() {
      return FLOAT_MODAL_OFFSET;
    },
    get FLOAT_MODAL_OPACITY() {
      return FLOAT_MODAL_OPACITY;
    },
    get floatingBoxBtn() {
      return floatingBoxBtn;
    },
    set floatingBoxBtn(value) {
      floatingBoxBtn = value;
    },
    get floatingGroupBtn() {
      return floatingGroupBtn;
    },
    set floatingGroupBtn(value) {
      floatingGroupBtn = value;
    },
    get floatingInputModal() {
      return floatingInputModal;
    },
    set floatingInputModal(value) {
      floatingInputModal = value;
    },
    get floatingZoomBtn() {
      return floatingZoomBtn;
    },
    set floatingZoomBtn(value) {
      floatingZoomBtn = value;
    },
    get focusBtn() {
      return focusBtn;
    },
    set focusBtn(value) {
      focusBtn = value;
    },
    get focusInputEl() {
      return focusInputEl;
    },
    get focusSelected() {
      return focusSelected;
    },
    get foldBtnAll() {
      return foldBtnAll;
    },
    set foldBtnAll(value) {
      foldBtnAll = value;
    },
    get foldBtnL0() {
      return foldBtnL0;
    },
    set foldBtnL0(value) {
      foldBtnL0 = value;
    },
    get foldBtnL1() {
      return foldBtnL1;
    },
    set foldBtnL1(value) {
      foldBtnL1 = value;
    },
    get FONT_SCALE_TYPES() {
      return FONT_SCALE_TYPES;
    },
    get fontSizeDropdown() {
      return fontSizeDropdown;
    },
    set fontSizeDropdown(value) {
      fontSizeDropdown = value;
    },
    get fontsizeScale() {
      return fontsizeScale;
    },
    set fontsizeScale(value) {
      fontsizeScale = value;
    },
    get generateRuntimeHotkeys() {
      return generateRuntimeHotkeys;
    },
    get getActionHotkeyString() {
      return getActionHotkeyString;
    },
    get getActionLabel() {
      return getActionLabel;
    },
    get getAdjustedMaxWidth() {
      return getAdjustedMaxWidth;
    },
    get getAngleFromCenter() {
      return getAngleFromCenter;
    },
    get getAppState() {
      return getAppState;
    },
    get getBoundaryHost() {
      return getBoundaryHost;
    },
    get getBranchElementIds() {
      return getBranchElementIds;
    },
    get getChildrenNodes() {
      return getChildrenNodes;
    },
    get getCommonGroupForElements() {
      return getCommonGroupForElements;
    },
    get getDecorationAndCrossLinkIdsForBranches() {
      return getDecorationAndCrossLinkIdsForBranches;
    },
    get getDepthFromAncestor() {
      return getDepthFromAncestor;
    },
    get getDynamicColor() {
      return getDynamicColor;
    },
    get getFontScale() {
      return getFontScale;
    },
    get getHierarchy() {
      return getHierarchy;
    },
    get getHotkeyDisplayString() {
      return getHotkeyDisplayString;
    },
    get getMasterRoots() {
      return getMasterRoots;
    },
    get getMindmapNodeFromSelection() {
      return getMindmapNodeFromSelection;
    },
    get getMindmapOrder() {
      return getMindmapOrder;
    },
    get getMindmapProjectElements() {
      return getMindmapProjectElements;
    },
    get getMostRecentlyAddedNode() {
      return getMostRecentlyAddedNode;
    },
    get getNodeBox() {
      return getNodeBox;
    },
    get getNodeMarkdownFile() {
      return getNodeMarkdownFile;
    },
    get getObsidianConflict() {
      return getObsidianConflict;
    },
    get getParentNode() {
      return getParentNode;
    },
    get getRootConfigForNode() {
      return getRootConfigForNode;
    },
    get getSettingsRootNode() {
      return getSettingsRootNode;
    },
    get initializeRootCustomData() {
      return initializeRootCustomData;
    },
    get updateBranchVisibility() {
      return updateBranchVisibility;
    },
    get getStrokeWidthForDepth() {
      return getStrokeWidthForDepth;
    },
    get getStructuralGroup() {
      return getStructuralGroup;
    },
    get getStructuralGroupForNode() {
      return getStructuralGroupForNode;
    },
    get getSubtreeHeight() {
      return getSubtreeHeight;
    },
    get getSubtreeWidth() {
      return getSubtreeWidth;
    },
    get getTextFromNode() {
      return getTextFromNode;
    },
    get getVal() {
      return getVal;
    },
    get getVerticalPlacementWidth() {
      return getVerticalPlacementWidth;
    },
    get getZoom() {
      return getZoom;
    },
    get groupBranches() {
      return groupBranches;
    },
    set groupBranches(value) {
      groupBranches = value;
    },
    get GROWTH_TYPES() {
      return GROWTH_TYPES;
    },
    get handleCanvasPointerDown() {
      return handleCanvasPointerDown;
    },
    get handleKeydown() {
      return handleKeydown;
    },
    get helpContainer() {
      return helpContainer;
    },
    set helpContainer(value) {
      helpContainer = value;
    },
    get HUE_STEP_BASE() {
      return HUE_STEP_BASE;
    },
    get HUE_STEP_JITTER() {
      return HUE_STEP_JITTER;
    },
    get ignoreFocusChanges() {
      return ignoreFocusChanges;
    },
    set ignoreFocusChanges(value) {
      ignoreFocusChanges = value;
    },
    get IMAGE_TYPES() {
      return IMAGE_TYPES;
    },
    get importOutline() {
      return importOutline;
    },
    get importOutlineBtn() {
      return importOutlineBtn;
    },
    set importOutlineBtn(value) {
      importOutlineBtn = value;
    },
    get importTextToMap() {
      return importTextToMap;
    },
    get inferDirectionalGrowthMode() {
      return inferDirectionalGrowthMode;
    },
    get injectNodeLink() {
      return injectNodeLink;
    },
    set injectNodeLink(value) {
      injectNodeLink = value;
    },
    get inputContainer() {
      return inputContainer;
    },
    set inputContainer(value) {
      inputContainer = value;
    },
    get ontologyEl() {
      return ontologyEl;
    },
    set ontologyEl(value) {
      ontologyEl = value;
    },
    get inputEl() {
      return inputEl;
    },
    set inputEl(value) {
      inputEl = value;
    },
    get inputRow() {
      return inputRow;
    },
    set inputRow(value) {
      inputRow = value;
    },
    get isExcaliBrainView() {
      return isExcaliBrainView;
    },
    get isFloatingPanelExpanded() {
      return isFloatingPanelExpanded;
    },
    set isFloatingPanelExpanded(value) {
      isFloatingPanelExpanded = value;
    },
    get isMac() {
      return isMac;
    },
    get isMindmapGroup() {
      return isMindmapGroup;
    },
    get isOntologyFocused() {
      return isOntologyFocused;
    },
    set isOntologyFocused(value) {
      isOntologyFocused = value;
    },
    get isRecordingHotkey() {
      return isRecordingHotkey;
    },
    set isRecordingHotkey(value) {
      isRecordingHotkey = value;
    },
    get isSolidArrow() {
      return isSolidArrow;
    },
    set isSolidArrow(value) {
      isSolidArrow = value;
    },
    get isStructuralElement() {
      return isStructuralElement;
    },
    get isUndocked() {
      return isUndocked;
    },
    set isUndocked(value) {
      isUndocked = value;
    },
    get isViewSet() {
      return isViewSet;
    },
    get K_ACTIVE_PRESET() {
      return K_ACTIVE_PRESET;
    },
    get K_ARROW_TYPE() {
      return K_ARROW_TYPE;
    },
    get K_ARROWSTROKE() {
      return K_ARROWSTROKE;
    },
    get K_BASE_WIDTH() {
      return K_BASE_WIDTH;
    },
    get K_BOX() {
      return K_BOX;
    },
    get K_BRANCH_SCALE() {
      return K_BRANCH_SCALE;
    },
    get K_CENTERTEXT() {
      return K_CENTERTEXT;
    },
    get K_FILL_SWEEP() {
      return K_FILL_SWEEP;
    },
    get K_FONTSIZE() {
      return K_FONTSIZE;
    },
    get K_GROUP() {
      return K_GROUP;
    },
    get K_GROWTH() {
      return K_GROWTH;
    },
    get K_HOTKEYS() {
      return K_HOTKEYS;
    },
    get K_INJECT_LINK() {
      return K_INJECT_LINK;
    },
    get K_LAYOUT() {
      return K_LAYOUT;
    },
    get K_LINK_ALIAS() {
      return K_LINK_ALIAS;
    },
    get K_MULTICOLOR() {
      return K_MULTICOLOR;
    },
    get K_PALETTE() {
      return K_PALETTE;
    },
    get K_PRESETS() {
      return K_PRESETS;
    },
    get K_ROUND() {
      return K_ROUND;
    },
    get K_UNDOCKED() {
      return K_UNDOCKED;
    },
    get K_WIDTH() {
      return K_WIDTH;
    },
    get K_ZOOM() {
      return K_ZOOM;
    },
    get lastCommittedTransaction() {
      return lastCommittedTransaction;
    },
    set lastCommittedTransaction(value) {
      lastCommittedTransaction = value;
    },
    get lastFocusedInput() {
      return lastFocusedInput;
    },
    set lastFocusedInput(value) {
      lastFocusedInput = value;
    },
    get LAYOUT_DEFAULTS() {
      return LAYOUT_DEFAULTS;
    },
    get LAYOUT_METADATA() {
      return LAYOUT_METADATA;
    },
    get layoutChildrenAsAdditionalRoot() {
      return layoutChildrenAsAdditionalRoot;
    },
    get LayoutConfigModal() {
      return LayoutConfigModal;
    },
    get layoutL1Nodes() {
      return layoutL1Nodes;
    },
    get layoutSettings() {
      return layoutSettings;
    },
    set layoutSettings(value) {
      layoutSettings = value;
    },
    get layoutSubtree() {
      return layoutSubtree;
    },
    get layoutSubtreeVertical() {
      return layoutSubtreeVertical;
    },
    get LIGHT_BASE_DARK() {
      return LIGHT_BASE_DARK;
    },
    get LIGHT_BASE_LIGHT() {
      return LIGHT_BASE_LIGHT;
    },
    get LIGHT_JITTER_DARK() {
      return LIGHT_JITTER_DARK;
    },
    get LIGHT_JITTER_LIGHT() {
      return LIGHT_JITTER_LIGHT;
    },
    get linkSuggester() {
      return linkSuggester;
    },
    set linkSuggester(value) {
      linkSuggester = value;
    },
    get MAP_ROOT_CUSTOMDATA_KEYS() {
      return MAP_ROOT_CUSTOMDATA_KEYS;
    },
    get mapPresets() {
      return mapPresets;
    },
    set mapPresets(value) {
      mapPresets = value;
    },
    get maxWidth() {
      return maxWidth;
    },
    set maxWidth(value) {
      maxWidth = value;
    },
    get MINDMAP_FOCUS_STYLE_ID() {
      return MINDMAP_FOCUS_STYLE_ID;
    },
    get mostRecentlyAddedNodeID() {
      return mostRecentlyAddedNodeID;
    },
    set mostRecentlyAddedNodeID(value) {
      mostRecentlyAddedNodeID = value;
    },
    get mostRecentlySelectedNodeID() {
      return mostRecentlySelectedNodeID;
    },
    set mostRecentlySelectedNodeID(value) {
      mostRecentlySelectedNodeID = value;
    },
    get moveCrossLinks() {
      return moveCrossLinks;
    },
    get moveDecorations() {
      return moveDecorations;
    },
    get multicolor() {
      return multicolor;
    },
    set multicolor(value) {
      multicolor = value;
    },
    get navigateMap() {
      return navigateMap;
    },
    get nodeLinkAlias() {
      return nodeLinkAlias;
    },
    set nodeLinkAlias(value) {
      nodeLinkAlias = value;
    },
    get Notice() {
      return Notice;
    },
    get NOTICE_DURATION_CONFLICT() {
      return NOTICE_DURATION_CONFLICT;
    },
    get NOTICE_DURATION_GLOBAL_CONFLICT() {
      return NOTICE_DURATION_GLOBAL_CONFLICT;
    },
    get openCalendarModal() {
      return openCalendarModal;
    },
    get padding() {
      return padding;
    },
    get PaletteManagerModal() {
      return PaletteManagerModal;
    },
    get panelExpandBtn() {
      return panelExpandBtn;
    },
    set panelExpandBtn(value) {
      panelExpandBtn = value;
    },
    get parseEmbeddableInput() {
      return parseEmbeddableInput;
    },
    get parseImageInput() {
      return parseImageInput;
    },
    get parseText() {
      return parseText;
    },
    get pasteElementToMap() {
      return pasteElementToMap;
    },
    get cancelBranchPaste() {
      return cancelBranchPaste;
    },
    get disposeBranchPaste() {
      return disposeBranchPaste;
    },
    get watchPasteMetadata() {
      return watchPasteMetadata;
    },
    get isBranchPasteBusy() {
      return isBranchPasteBusy;
    },
    get performAction() {
      return performAction;
    },
    get pinBtn() {
      return pinBtn;
    },
    set pinBtn(value) {
      pinBtn = value;
    },
    get presetApplyBtn() {
      return presetApplyBtn;
    },
    set presetApplyBtn(value) {
      presetApplyBtn = value;
    },
    get presetDropdown() {
      return presetDropdown;
    },
    set presetDropdown(value) {
      presetDropdown = value;
    },
    get presetPlusBtn() {
      return presetPlusBtn;
    },
    set presetPlusBtn(value) {
      presetPlusBtn = value;
    },
    get presetSaveBtn() {
      return presetSaveBtn;
    },
    set presetSaveBtn(value) {
      presetSaveBtn = value;
    },
    get presetTrashBtn() {
      return presetTrashBtn;
    },
    set presetTrashBtn(value) {
      presetTrashBtn = value;
    },
    get presetWarningEl() {
      return presetWarningEl;
    },
    set presetWarningEl(value) {
      presetWarningEl = value;
    },
    get reconnectArrow() {
      return reconnectArrow;
    },
    get redoAvailable() {
      return redoAvailable;
    },
    set redoAvailable(value) {
      redoAvailable = value;
    },
    get refreshBtn() {
      return refreshBtn;
    },
    set refreshBtn(value) {
      refreshBtn = value;
    },
    get refreshMapLayout() {
      return refreshMapLayout;
    },
    get refreshPresetDropdown() {
      return refreshPresetDropdown;
    },
    get registerKeydownHandler() {
      return registerKeydownHandler;
    },
    get registerObsidianHotkeyOverrides() {
      return registerObsidianHotkeyOverrides;
    },
    get removeObsidianHotkeyOverrides() {
      return removeObsidianHotkeyOverrides;
    },
    get disposeKeyboard() {
      return disposeKeyboard;
    },
    get registerStyles() {
      return registerStyles;
    },
    get removeEventListeners() {
      return removeEventListeners;
    },
    get removeGroupFromElements() {
      return removeGroupFromElements;
    },
    get removeKeydownHandlers() {
      return removeKeydownHandlers;
    },
    get removeStyles() {
      return removeStyles;
    },
    get renderBody() {
      return renderBody;
    },
    get renderHelp() {
      return renderHelp;
    },
    get renderInput() {
      return renderInput;
    },
    get revealInputEl() {
      return revealInputEl;
    },
    get roundedCorners() {
      return roundedCorners;
    },
    set roundedCorners(value) {
      roundedCorners = value;
    },
    get roundToggle() {
      return roundToggle;
    },
    set roundToggle(value) {
      roundToggle = value;
    },
    get RUNTIME_HOTKEYS() {
      return RUNTIME_HOTKEYS;
    },
    set RUNTIME_HOTKEYS(value) {
      RUNTIME_HOTKEYS = value;
    },
    get SAT_BASE() {
      return SAT_BASE;
    },
    get SAT_JITTER() {
      return SAT_JITTER;
    },
    get saveSettings() {
      return saveSettings;
    },
    get scaleDecorations() {
      return scaleDecorations;
    },
    get SCOPE() {
      return SCOPE;
    },
    get selectNodeInView() {
      return selectNodeInView;
    },
    get setVal() {
      return setVal;
    },
    get sidepanelWindow() {
      return sidepanelWindow;
    },
    set sidepanelWindow(value) {
      sidepanelWindow = value;
    },
    get sortChildrenStable() {
      return sortChildrenStable;
    },
    get sortL1NodesBasedOnVisualSequence() {
      return sortL1NodesBasedOnVisualSequence;
    },
    get startEditing() {
      return startEditing;
    },
    get storedZoom() {
      return storedZoom;
    },
    set storedZoom(value) {
      storedZoom = value;
    },
    get strategyDropdown() {
      return strategyDropdown;
    },
    set strategyDropdown(value) {
      strategyDropdown = value;
    },
    get strokeToggle() {
      return strokeToggle;
    },
    set strokeToggle(value) {
      strokeToggle = value;
    },
    get submapRootBtn() {
      return submapRootBtn;
    },
    set submapRootBtn(value) {
      submapRootBtn = value;
    },
    get t() {
      return t;
    },
    get toggleBoundary() {
      return toggleBoundary;
    },
    get toggleBox() {
      return toggleBox;
    },
    get toggleBranchGroup() {
      return toggleBranchGroup;
    },
    get toggleCheckboxBtn() {
      return toggleCheckboxBtn;
    },
    set toggleCheckboxBtn(value) {
      toggleCheckboxBtn = value;
    },
    get toggleCheckboxStatus() {
      return toggleCheckboxStatus;
    },
    get toggleDock() {
      return toggleDock;
    },
    get toggleEmbedBtn() {
      return toggleEmbedBtn;
    },
    set toggleEmbedBtn(value) {
      toggleEmbedBtn = value;
    },
    get toggleEmbedStatus() {
      return toggleEmbedStatus;
    },
    get toggleFloatingExtras() {
      return toggleFloatingExtras;
    },
    set toggleFloatingExtras(value) {
      toggleFloatingExtras = value;
    },
    get toggleFold() {
      return toggleFold;
    },
    get toggleGroupBtn() {
      return toggleGroupBtn;
    },
    set toggleGroupBtn(value) {
      toggleGroupBtn = value;
    },
    get togglePin() {
      return togglePin;
    },
    get toggleSubmapRoot() {
      return toggleSubmapRoot;
    },
    get triggerGlobalLayout() {
      return triggerGlobalLayout;
    },
    get uiUpdateTimer() {
      return uiUpdateTimer;
    },
    set uiUpdateTimer(value) {
      uiUpdateTimer = value;
    },
    get updateBranchStrokes() {
      return updateBranchStrokes;
    },
    get updateKeyHandlerLocation() {
      return updateKeyHandlerLocation;
    },
    get updateL1Arrow() {
      return updateL1Arrow;
    },
    get updateNodeBoundary() {
      return updateNodeBoundary;
    },
    get updateRootNodeCustomData() {
      return updateRootNodeCustomData;
    },
    get updateUI() {
      return updateUI;
    },
    get userHotkeys() {
      return userHotkeys;
    },
    set userHotkeys(value) {
      userHotkeys = value;
    },
    get utils() {
      return utils;
    },
    get VERSION() {
      return VERSION;
    },
    get widthSlider() {
      return widthSlider;
    },
    set widthSlider(value) {
      widthSlider = value;
    },
    get withRootLayoutContext() {
      return withRootLayoutContext;
    },
    get WRAP_WIDTH_MAX() {
      return WRAP_WIDTH_MAX;
    },
    get WRAP_WIDTH_MIN() {
      return WRAP_WIDTH_MIN;
    },
    get WRAP_WIDTH_STEP() {
      return WRAP_WIDTH_STEP;
    },
    get ZOOM_LEVELS() {
      return ZOOM_LEVELS;
    },
    get ZOOM_TYPES() {
      return ZOOM_TYPES;
    },
    get zoomBtn() {
      return zoomBtn;
    },
    set zoomBtn(value) {
      zoomBtn = value;
    },
    get zoomLevel() {
      return zoomLevel;
    },
    set zoomLevel(value) {
      zoomLevel = value;
    },
    get zoomToFit() {
      return zoomToFit;
    },
  };

  const { removeKeydownHandlers, removeEventListeners, handleCanvasPointerDown } =
    createLifecycle(runtimeContext);

  /**
   * Removes all event listeners and specific hooks attached to the window or workspace.
   */

  if (!window.MindmapBuilder) {
    window.MindmapBuilder = {
      keydownHandlers: [],
    };
  } else {
    removeEventListeners();
  }

  const api = () => ea?.getExcalidrawAPI();
  const getAppState = () => api()?.getAppState();
  const isViewSet = () => ea.targetView && ea.targetView._loaded;

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------
  const {
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
  } = createConfiguration(runtimeContext);

  const {
    getZoom,
    fontScale,
    getFontScale,
    getVal,
    saveSettings,
    setVal,
    extractConfigFromGlobals,
    normalizeMapConfig,
    diffMapConfig,
    applyPresetToGlobals,
    applyPresetToMap,
    refreshPresetDropdown,
    calculateStrokeWidth,
    getStrokeWidthForDepth,
    inferDirectionalGrowthMode,
    getRootConfigForNode,
    withRootLayoutContext,
    updateRootNodeCustomData,
    updateBranchStrokes,
  } = createSettings(runtimeContext);

  let dirty = false;

  let injectNodeLink = getVal(K_INJECT_LINK, true);
  let nodeLinkAlias = getVal(K_LINK_ALIAS, "(…)");

  const isExcaliBrainView = () => {
    if (!ea.targetView || !ea.targetView.file) return false;
    const eb = app.plugins.plugins["excalibrain"];
    return eb && eb.settings?.excalibrainFilepath === ea.targetView.file.path;
  };

  let layoutSettings = getVal(K_LAYOUT, {
    value: {},
    hidden: true,
  });
  let layoutSettingsDirty = false;

  Object.keys(LAYOUT_METADATA).forEach((k) => {
    const val = layoutSettings[k];
    const def = LAYOUT_METADATA[k].def;
    if (val === undefined || val === null || typeof val !== "number" || !Number.isFinite(val)) {
      layoutSettings[k] = def;
      layoutSettingsDirty = true;
    }
  });

  if (layoutSettingsDirty) {
    setVal(K_LAYOUT, layoutSettings, true);
  }

  let arrowType = getVal(K_ARROW_TYPE, {
    value: "curved",
    valueset: ARROW_TYPES,
  });
  let maxWidth = parseInt(getVal(K_WIDTH, 450));
  if (isNaN(maxWidth)) maxWidth = 450;
  let fontsizeScale = getVal(K_FONTSIZE, {
    value: "Normal Scale",
    valueset: FONT_SCALE_TYPES,
  });
  let boxChildren = getVal(K_BOX, false);
  let roundedCorners = getVal(K_ROUND, false);
  let multicolor = getVal(K_MULTICOLOR, true);
  let groupBranches = getVal(K_GROUP, false);
  let currentModalGrowthMode = getVal(K_GROWTH, {
    value: "Right-Left",
    valueset: GROWTH_TYPES,
  });
  let isUndocked = getVal(K_UNDOCKED, false);
  let isSolidArrow = getVal(K_ARROWSTROKE, true);
  let centerText = getVal(K_CENTERTEXT, true);
  let autoLayoutDisabled = false;
  let zoomLevel = getVal(K_ZOOM, {
    value: "Medium",
    valueset: ZOOM_TYPES,
  });
  let customPalette = getVal(K_PALETTE, {
    value: {
      enabled: false,
      random: false,
      colors: [],
    },
    hidden: true,
  });
  let fillSweep = getVal(K_FILL_SWEEP, false);
  let editingNodeId = null;
  let mostRecentlySelectedNodeID = null;

  // Undo/Redo tracking
  let currentTransactionAccumulator = 0;
  let lastCommittedTransaction = null; // { steps: number, version: number }
  let redoAvailable = null; // { steps: number, version: number } - state after a batched undo

  // -----------------------------------------------------------
  // Cleanup an migration of old settings values
  // -----------------------------------------------------------
  if (
    !ea
      .getScriptSettingValue(K_FONTSIZE, {
        value: "Normal Scale",
        valueset: FONT_SCALE_TYPES,
      })
      .hasOwnProperty("valueset")
  ) {
    ea.setScriptSettingValue(K_FONTSIZE, {
      value: fontsizeScale,
      valueset: FONT_SCALE_TYPES,
    });
    dirty = true;
  }

  if (
    !ea
      .getScriptSettingValue(K_GROWTH, {
        value: "Right-Left",
        valueset: GROWTH_TYPES,
      })
      .hasOwnProperty("valueset")
  ) {
    ea.setScriptSettingValue(K_GROWTH, {
      value: currentModalGrowthMode,
      valueset: GROWTH_TYPES,
    });
    dirty = true;
  }

  const settingsTemp = ea.getScriptSettings();
  if (settingsTemp && settingsTemp.hasOwnProperty("Is Minimized")) {
    delete settingsTemp["Is Minimized"];
    dirty = true;
  }

  let branchScale = getVal(K_BRANCH_SCALE, {
    value: "Hierarchical",
    valueset: BRANCH_SCALE_TYPES,
  });
  let baseStrokeWidth = parseFloat(
    getVal(K_BASE_WIDTH, {
      value: 6,
    }),
  );
  if (isNaN(baseStrokeWidth)) baseStrokeWidth = 6;

  Object.keys(LAYOUT_METADATA).forEach((k) => (LAYOUT_DEFAULTS[k] = LAYOUT_METADATA[k].def));

  let mapPresets = getVal(K_PRESETS, {
    value: {
      Default: extractConfigFromGlobals(),
    },
    hidden: true,
  });

  // Safeguard against corrupted or undefined settings
  if (!mapPresets || typeof mapPresets !== "object") {
    mapPresets = {};
  }

  let activePresetName = getVal(K_ACTIVE_PRESET, "Default");

  // Make sure Default is always available
  if (!mapPresets["Default"]) {
    mapPresets["Default"] = extractConfigFromGlobals();
    setVal(K_PRESETS, mapPresets, true);
  }

  /**
   * Normalizes a map configuration object, supplying standard defaults for any missing properties.
   * Ensures that legacy presets or maps lacking newer schema keys are safely comparable.
   *
   * @param {Object} c - The configuration object to normalize.
   * @returns {Object} A fully populated configuration object.
   */

  /**
   * Compares two map configuration objects to determine if their visual settings differ.
   * Accounts for missing legacy properties and floating point inaccuracies in layout metadata.
   *
   * @param {Object} c1 - The first configuration object (usually the preset).
   * @param {Object} c2 - The second configuration object (usually the map's current state).
   * @returns {boolean} True if the configurations differ, false otherwise.
   */

  /**
   * Applies the specified preset's configuration to the active global variables.
   *
   * @param {string} presetName - The name of the preset to apply.
   */

  /**
   * Refreshes the dropdown list of available map presets.
   * Exclusively populates valid preset names without an ambiguous empty state.
   */

  /**
   * Pure calculation logic for stroke width.
   */

  /**
   * Calculates the stroke width for a branch based on depth and style.
   * Uses global settings.
   */

  const ownerWindow = ea.targetView?.ownerWindow;
  const isMac = ea.DEVICE.isMacOS || ea.DEVICE.isIOS;

  //special trim function that returns trimmed text, including trimming a bullet point of the bullet
  const {
    trimText,
    parseText,
    parseImageInput,
    parseEmbeddableInput,
    getAdjustedMaxWidth,
    getNodeMarkdownFile,
    getTextFromNode,
  } = createTextParsing(runtimeContext);

  const getActionLabel = (action) => t(ACTION_LABEL_KEYS[action] ?? action);

  // Load hotkeys from settings or use default
  // IMPORTANT: Use JSON.parse/stringify to create a deep copy of defaults.
  // Otherwise, modifying userHotkeys modifies DEFAULT_HOTKEYS in memory, breaking the isModified check until restart.
  let userHotkeys = getVal(K_HOTKEYS, {
    value: JSON.parse(JSON.stringify(DEFAULT_HOTKEYS)),
    hidden: true,
  });
  let isRecordingHotkey = false;
  let cancelHotkeyRecording = null;

  const {
    getObsidianConflict,
    updateUserHotkeys,
    getHotkeyDefByAction,
    getHotkeyDisplayString,
    getActionHotkeyString,
    generateRuntimeHotkeys,
    getHotkeyContext,
    registerKeydownHandler,
    registerObsidianHotkeyOverrides,
    removeObsidianHotkeyOverrides,
    disposeKeyboard,
    updateKeyHandlerLocation,
    getActionFromEvent,
    handleKeydown,
    addSibling,
  } = createKeyboard(runtimeContext);

  /**
   * Sync userHotkeys to DEFAULT_HOTKEYS by action.
   * - Drops user actions not in DEFAULT
   * - Adds missing actions from DEFAULT
   * - Structural attributes (isInputOnly, requiresNode, isNavigation, hidden)
   *   ALWAYS come from DEFAULT_HOTKEYS and are excluded from the saved state.
   * - For existing actions:
   *    - keeps user values for configurable keys (modifiers, key, code, scope)
   *    - adds missing keys from DEFAULT
   *    - removes keys not in DEFAULT
   **/

  dirty = updateUserHotkeys();

  // Merge defaults in case new actions were added in an update
  if (userHotkeys.length !== DEFAULT_HOTKEYS.length) {
    const merged = [...userHotkeys];
    DEFAULT_HOTKEYS.forEach((d) => {
      if (!merged.find((u) => u.action === d.action)) merged.push(JSON.parse(JSON.stringify(d)));
    });
    userHotkeys = merged;
  }

  let RUNTIME_HOTKEYS = generateRuntimeHotkeys();

  /**
   * Returns the current scope context for the hotkey
   **/

  const { getInstructions, renderHelp } = createHelpUi(runtimeContext);

  // addElementsToView with different defaults compared to EA
  const { addElementsToView } = createTransactions(runtimeContext);

  const {
    selectNodeInView,
    getBoundaryHost,
    getMindmapNodeFromSelection,
    ensureNodeSelected,
    getMostRecentlyAddedNode,
  } = createSelection(runtimeContext);

  const {
    buildParentMap,
    getParentNode,
    buildElementMap,
    buildChildrenMap,
    getChildrenNodes,
    buildGroupToNodes,
    getMasterRoots,
    getHierarchy,
    getSettingsRootNode,
    getDepthFromAncestor,
    getBranchElementIds,
    getMindmapProjectElements,
  } = createGraph(runtimeContext);

  /**
   * Retrieves the parent node of a specific element.
   */

  /**
   * Returns the IDs of root nodes in the scene
   * - A root node is defined as a node with `growthMode` that has only outgoing branch arrows, or no branch arrows at all.
   * @returns {string[]} An array of root node IDs.
   */

  /**
   * Traverses up the tree to find the root and depth.
   */

  /**
   * Returns the nearest configuration root for the selected node.
   * - Additional roots (`isAdditionalRoot`) act as local configuration roots.
   * - If none is found on the path, the master root is returned.
   */

  /**
   * Returns depth from a specific ancestor.
   * If the ancestor is not found, it safely falls back to absolute hierarchy depth.
   */

  /**
   * Temporarily applies map/root settings for layout calculations, then restores globals.
   * This allows nested additional roots to layout with their own strategy.
   */

  const { getAngleFromCenter, getConvexHull, updateNodeBoundary, toggleBoundary } =
    createBoundaries(runtimeContext);

  const { randInt, getDynamicColor } = createColors(runtimeContext);

  /**
   * Manages the "..." fold indicator text element.
   * Creates it if missing and show=true, hides it if show=false.
   * Updates its position relative to the parent node.
   *
   * @param {ExcalidrawElement} node - The parent node.
   * @param {boolean} show - Whether to show the fold indicator.
   * @param {ExcalidrawElement[]} allElements - All elements in the scene.
   */
  const { manageFoldIndicator, setElementVisibility, updateBranchVisibility, toggleFold } =
    createFolding(runtimeContext);

  /**
   * Toggles visibility of an element by manipulating opacity and locked state.
   * Saves the original state to customData for restoration.
   *
   * @param {ExcalidrawElement} el - The element to update.
   * @param {boolean} hide - Whether to hide the element.
   */

  /**
   * Recursively updates the visibility of a branch based on fold state.
   * Handles nodes, connectors, grouped decorations, cross-links, and boundaries.
   *
   * @param {string} nodeId - The ID of the current node.
   * @param {boolean} parentHidden - Whether the parent is hidden (inherited visibility).
   * @param {ExcalidrawElement[]} allElements - All elements in the scene.
   * @param {boolean} isRootOfFold - Whether this node is the root of the fold operation (always visible itself).
   */

  /**
   * Toggles the folded state of the selected node's branch.
   * Supports different modes: L0 (direct children), L1 (grandchildren), ALL (recursive).
   *
   * @param {string} mode - "L0" | "L1" | "ALL"
   */

  // ---------------------------------------------------------------------------
  // 3. Layout & Grouping Engine
  // ---------------------------------------------------------------------------
  const { moveCrossLinks, moveDecorations, scaleDecorations } = createDecorations(runtimeContext);

  /**
   * Intelligent scaling for decorations when a node changes size.
   * Uses "Edge Anchoring":
   * - Elements inside the node (like text in a box) scale relative to the center.
   * - Elements outside the node (like stickers/icons above) anchor to the nearest edge
   *   to preserve the visual gap, preventing them from flying away when the node grows significantly.
   */

  let storedZoom = {
    elementID: undefined,
    level: undefined,
  };
  const { nextZoomLevel, zoomToFit, focusSelected, navigateMap } = createNavigation(runtimeContext);

  const {
    getMindmapOrder,
    getNodeBox,
    sortChildrenStable,
    getSubtreeHeight,
    getSubtreeWidth,
    getVerticalPlacementWidth,
  } = createLayoutMetrics(runtimeContext);

  /**
   * Determines if an element is part of the mindmap structure.
   */
  const {
    isStructuralElement,
    getViewGroupElements,
    getCommonGroupForElements,
    isMindmapGroup,
    collectCrosslinkIds,
    collectDecorationIds,
    getStructuralGroup,
    applyRecursiveGrouping,
    getStructuralGroupForNode,
    getStructuralGroupsForNode,
    removeGroupFromElements,
    getDecorationAndCrossLinkIdsForBranches,
    toggleBranchGroup,
  } = createGrouping(runtimeContext);

  /**
   * A group is considered a "Mindmap Group" if it contains at least 2 structural elements.
   * Groups with only 1 structural element (e.g. a Node grouped with a Sticker) are treated as decoration.
   */

  /**
   * Finds the first group ID in the element's group stack that qualifies as a Mindmap Group.
   */

  const { addEmbeddableNode, addImage, initializeRootCustomData, addNode } =
    createNodes(runtimeContext);

  /**
   * Recursively updates the stroke width of a subtree.
   * Checks if the existing arrow matches the 'old' calculated width.
   * If it does, updates to 'new' width. If not, assumes manual override and skips.
   */

  const { addUpdateArrowLabel, configureArrow, updateL1Arrow, reconnectArrow } =
    createArrows(runtimeContext);

  /**
   * Layout entrypoint for nodes marked as additional roots.
   * The node position itself is controlled by the parent/root layout pass.
   * Only its descendants are laid out using this node's local root settings.
   */
  const { layoutChildrenAsAdditionalRoot, layoutSubtree } = createHorizontalLayout(runtimeContext);

  const { layoutSubtreeVertical } = createVerticalLayout(runtimeContext);

  const {
    radialL1Distribution,
    verticalL1Distribution,
    horizontalL1Distribution,
    layoutL1Nodes,
    sortL1NodesBasedOnVisualSequence,
  } = createFirstLevelLayout(runtimeContext);

  /**
   * Unified layout function for Level 1 nodes.
   * Uses a Vertical Ellipse for Radial mode. Ensures nodes are distributed across
   * the ellipse to prevent wrap-around overlap and maintain correct facing.
   * Returns true if layout logic was executed.
   */

  /**
   * Sorts Level 1 nodes based on their current visual position and updates their mindmapOrder.
   * For Radial maps, sorting is done by angle. For others, by Y-coordinate.
   * Newly added nodes (mindmapNew) are always appended to the end of the visual sequence.
   * Returns true if any order was actually updated.
   **/

  /**
   * Main layout execution function.
   * Calculates positions for a tree rooted at rootId and moves elements.
   *
   * @param {string} rootId - ID of the root node.
   * @param {boolean} forceUngroup - Force ungrouping of branches before layout.
   * @param {boolean} mustHonorMindmapOrder - If true, enforces the current mindmapOrder over visual position.
   */
  const { triggerGlobalLayout, refreshMapLayout } = createLayout(runtimeContext);

  // ---------------------------------------------------------------------------
  // 4. Add Node Logic
  // ---------------------------------------------------------------------------
  let mostRecentlyAddedNodeID;

  /**
   * Initializes the customData for a new Root node with the current global settings.
   */

  /**
   * Checks if a node text contains exactly one wiki link to a markdown file and returns that TFile.
   */

  /**
   * Generates a hierarchy of links based on the headings in the target file.
   */
  const {
    importOutline,
    importTextToMap,
    pasteListToMap,
    pasteElementToMap,
    cancelBranchPaste,
    disposeBranchPaste,
    watchPasteMetadata,
    isBranchPasteBusy,
  } = createMarkdownImport(runtimeContext);

  /**
// Extracts text from a node, handling text elements, images, and embeddables.
**/

  /**
// Copies the selected tree or branch to the clipboard as Markdown text.
// Now supports extracting Submaps into separate ## Headings referenced by ![[#Links]]
**/
  const { copyMapAsText } = createMarkdownExport(runtimeContext);

  /**
// Core logic to parse a list string and add nodes to the map.
// Now dynamically links "## Submap" definitions to their "![[#Submap]]" embed nodes.
**/

  /**
// Pastes a Markdown list from clipboard into the map, converting it to nodes.
**/

  /**
   * Intelligent paste dispatcher. Parses clipboard for Element JSON / Raw Images,
   * translates them to Markdown strings, and passes them to `addNode()`.
   */

  /**
   * Reconnects an arrow from one element to another.
   * Updates the arrow's binding (start or end) and maintains the boundElements arrays
   * of both the old and new parent nodes to ensure consistency.
   *
   * @param {ExcalidrawElement} currentBindingElement - The node to disconnect from.
   * @param {ExcalidrawElement} newBindingElement - The node to connect to.
   * @param {ExcalidrawElement} arrow - The arrow element to rewire.
   * @param {string} side - "start" or "end". Defaults to "start".
   */

  /**
   * Recursively updates the font size of a subtree based on the new depth level.
   * Only updates if the current font size matches the default for its *previous* depth,
   * preserving user customizations.
   * Also updates the ontology label (if present) on the incoming arrow to be half the node's new size.
   */
  const {
    updateSubtreeFontSize,
    updateSubtreeStrokeWidth,
    updateSubtreeColor,
    toggleSubmapRoot,
    changeNodeOrder,
  } = createNodeOrder(runtimeContext);

  /**
   * Recursively updates the stroke width of a subtree based on the new depth level.
   * Only updates if the current width matches the default for its *previous* depth.
   */

  /**
   * Recursively updates the color of a subtree.
   * Acts as a flood-fill: only updates children that matched the old parent color.
   *
   * @param {string} nodeId - Current node ID
   * @param {string} oldColor - The color we are replacing (the color the branch used to be)
   * @param {string} newColor - The color we are applying
   * @param {ExcalidrawElement[]} allElements - Scene elements
   */

  /**
   * Toggles whether the selected node acts as an additional local root (submap root).
   * - Master root (no incoming isBranch connector) cannot be converted.
   * - Enabling submap root copies current map settings and assigns a directional growth mode
   *   inferred from the node position relative to its parent.
   * - Disabling submap root removes local layout metadata so descendants follow parent-root logic.
   */

  /**
   * Navigates the mindmap using arrow keys.
   * Handles different layout modes (Radial, Directional) and folds.
   *
   * @param {object} params
   * @param {string} params.key - "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight"
   * @param {boolean} params.zoom - whether to zoom to the new node
   * @param {boolean} params.focus - whether to focus the new node
   */

  /**
   * Triggers a layout refresh for the tree containing the selected element.
   */

  /**
   * Collects all node IDs and arrow IDs belonging to a branch.
   * Includes "isBranch" arrows and internal non-mindmap arrows.
   **/

  /**
   *
   * @param {*} nodeId
   * @param {*} workbenchEls ExcalidrawAutomate elements on the workbench
   * @returns the group ID if a structural mindmap group exists for the branch, else null
   */

  /**
   *
   * @param {*} nodeId
   * @param {*} workbenchEls ExcalidrawAutomate elements on the workbench
   * @returns the group ID if a structural mindmap group exists for the branch, else null
   */

  /**
   *
   * @param {*} groupId
   * @param {*} workbenchEls ExcalidrawAutomate elements on the workbench
   */

  /**
   * Identifies all elements belonging to a specific mindmap tree to optimize performance on large canvases.
   * This includes nodes, branch arrows, crosslinks, decorations, boundaries, and bound text.
   */

  /**
   * Toggles a single flat group for the selected branch.
   **/

  /**
   * Toggles the pinned state of the selected node.
   * Pinned nodes are not moved by auto-layout.
   */
  const { togglePin, toggleCheckboxStatus, toggleEmbedStatus, toggleBox } =
    createNodeStyles(runtimeContext);

  /**
   * Toggles the selected node between an embed (![[...]]) and a link ([[...|alias]]).
   * Cleans the markdown '# ' characters when mapping the section name to the alias.
   */

  const padding = layoutSettings.CONTAINER_PADDING;
  /**
   * Toggles a bounding box around the selected text element (node).
   * Creates a container if one doesn't exist, or removes it if it does.
   * @param {string} shape - "rectangle" | "ellipse" | "diamond"
   */

  /**
   * Toggles a visual boundary polygon around the selected node's subtree.
   */

  let detailsEl, inputEl, ontologyEl, inputRow, bodyContainer, strategyDropdown;
  let lastFocusedInput = null;
  let isOntologyFocused = false;
  let ignoreFocusChanges = false;
  let autoLayoutToggle, linkSuggester, arrowTypeToggle;
  let fontSizeDropdown, boxToggle, roundToggle, strokeToggle;
  let branchScaleDropdown, baseWidthSlider;
  let colorToggle, widthSlider, centerToggle;
  let fillSweepToggleSetting, fillSweepToggle;
  let pinBtn, refreshBtn, cutBtn, copyBtn, boxBtn, dockBtn, editBtn;
  let toggleGroupBtn, zoomBtn, focusBtn, boundaryBtn, calendarBtn;
  let submapRootBtn;
  let foldBtnL0, foldBtnL1, foldBtnAll;
  let floatingGroupBtn, floatingBoxBtn, floatingZoomBtn;
  let panelExpandBtn, importOutlineBtn, toggleCheckboxBtn, toggleEmbedBtn;
  let isFloatingPanelExpanded = false;
  let toggleFloatingExtras = null;
  let inputContainer;
  let helpContainer;
  let floatingInputModal = null;
  let sidepanelWindow;
  let disableTabEvents = false;
  let presetDropdown, presetWarningEl, presetSaveBtn, presetTrashBtn, presetPlusBtn, presetApplyBtn;

  const { revealInputEl, focusInputEl, setButtonDisabled, disableUI, updateUI } =
    createInputUi(runtimeContext);

  /**
   * Synchronizes the sidepanel UI elements with the state of the currently selected map node,
   * or the active global variables if no node is selected.
   *
   * Unconditionally sets the values on the Obsidian UI components to ensure that preset
   * applications and external script changes are immediately and accurately reflected in the panel.
   *
   * @param {ExcalidrawElement} [sel] - The currently selected node element. If omitted, attempts to find the active mindmap node from the current canvas selection.
   */

  const { startEditing, commitEdit } = createNodeEditing(runtimeContext);

  // ---------------------------------------------------------------------------
  // 8. Custom Colors: Palette Manager Modal
  // ---------------------------------------------------------------------------
  const { PaletteManagerModal } = createPaletteManagerModal(runtimeContext);

  // ---------------------------------------------------------------------------
  // 9. Layout Configuration Manager
  // ---------------------------------------------------------------------------
  const { LayoutConfigModal } = createLayoutConfigModal(runtimeContext);

  // ---------------------------------------------------------------------------
  // 10. Render Functions
  // ---------------------------------------------------------------------------
  const { renderInput } = createInputControls(runtimeContext);

  /**
   * Renders the main settings body and UI actions for the sidepanel.
   * Includes the preset dropdown block for saving, deleting, applying, and creating named configurations.
   *
   * @param {HTMLElement} contentEl - The parent DOM element to render into.
   */
  const { renderBody } = createSidepanelControls(runtimeContext);

  const { registerStyles, removeStyles } = createStyles(runtimeContext);

  // ---------------------------------------------------------------------------
  // Docking & Floating Input Management
  // ---------------------------------------------------------------------------
  /**
   * silent === true: sidepanel is not revealed after docking
   * forceDock === true: if input is undocked, docking happens even if no ExcalidrawView is present
   * saveSetting === true: the dock/undock status is saved to settings. When input is docked because
   *   the ExcalidrawView was closed or when the user presses ESC to finish mindmapping, next time
   *   Mindmap Builder is started it should remember the user preference
   *
   **/
  const { toggleDock } = createFloatingInput(runtimeContext);

  /**
   * Resolves a keyboard event to a configured action depending on modifier keys and settings.
   *
   * @param {KeyboardEvent} e - The keyboard event.
   * @returns {object} - { action, scope, requiresNode } or empty object if no match.
   */

  /**
   * Main keydown handler.
   * Dispatches actions (add, edit, navigate, fold, etc.) based on hotkey settings.
   *
   * @param {KeyboardEvent} e
   */

  // Helper for retrieving Tasks plugin configuration and formats
  const { getTasksUiOptions, parseTasksData, cleanTasksString, openCalendarModal } =
    createTasks(runtimeContext);

  const { performAction } = createActions(runtimeContext);

  // ---------------------------------------------------------------------------
  // 11. Public Puppeteering API (minimal-impact wrappers)
  // ---------------------------------------------------------------------------
  installMindmapPublicApi(runtimeContext);

  let uiUpdateTimer = null;

  /**
   * Throttled handler for canvas clicks (pointer down).
   * Updates the UI to reflect the new selection.
   *
   * @param {PointerEvent} e
   */

  /* --- Initialization Logic --- */
  /* --- Initialization Logic --- */
  ea.registerCleanup?.(() => {
    cancelHotkeyRecording?.();
    linkSuggester?.close();
    disposeKeyboard();
    removeEventListeners();
    if (uiUpdateTimer) clearTimeout(uiUpdateTimer);
  });
  return openMindmapSidepanel(runtimeContext);
}
