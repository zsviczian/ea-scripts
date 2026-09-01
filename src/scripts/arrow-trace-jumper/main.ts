/*
 * ==============================================================================
 * SCRIPT OVERVIEW: Arrow Trace Jumper (Ultimate Edition)
 * ==============================================================================
 * DESCRIPTION & KEY FEATURES:
 * - Hotkey-First: Responds immediately to key commands without noticeable delay.
 * - Auto-Flipper: Menu follows the click (even when object selection is disabled).
 * - SHIELD: Ignores closed loops and does not interfere while drawing.
 * - SETTINGS TOGGLE: Uses standard icons (check-square / square).
 * - Bounding-Box Detection: Precise menu placement in the visible screen area.
 * ==============================================================================
 */

/**
 * Helper function: Checks if an element is a self-contained closed line or arrow.
 * An element is considered closed if the start and end points are virtually identical.
 * 
 * @param {Object} element - The Excalidraw element to check.
 * @returns {boolean} True if the distance between start and end is < 1 pixel.
 */
function isClosedLine(element) {
    if (!element.points || element.points.length < 2) return false;
    
    const pts = element.points;
    const start = pts[0];
    const end = pts[pts.length - 1];

    const distance = Math.hypot(end[0] - start[0], end[1] - start[1]);
    return distance < 1;
}

/**
 * Helper function: Checks if a given world point currently lies within the visible viewport.
 * 
 * @param {number} x - X coordinate in the world.
 * @param {number} y - Y coordinate in the world.
 * @param {Object} appState - The current state of the Excalidraw application (Zoom, Scroll, Dimensions).
 * @returns {boolean} True if the point lies within the visible area (including padding).
 */
function isPointInViewport(x, y, appState) {
    const zoom = appState.zoom.value;
    
    // Calculate the boundaries of the current viewport in world coordinates
    const minX = -appState.scrollX;
    const minY = -appState.scrollY;
    const maxX = minX + (appState.width / zoom);
    const maxY = minY + (appState.height / zoom);

    // 20 pixels tolerance to the edge for clean and fault-tolerant detection
    const padding = 20 / zoom;

    return (
        x >= minX + padding &&
        x <= maxX - padding &&
        y >= minY + padding &&
        y <= maxY - padding
    );
}

/**
 * Main initialization of the script. 
 * Sets up instant action (hotkey) as well as background monitoring (autostart, context menu, auto-flipper).
 */
async function init() {
    const api = ea.getExcalidrawAPI();
    
    // --------------------------------------------------------------------------
    // 0. LOAD / INITIALIZE SCRIPT SETTINGS
    // --------------------------------------------------------------------------
    let scriptSettings = ea.getScriptSettings() || {};
    if (scriptSettings.selectConnectedObject === undefined) {
        scriptSettings.selectConnectedObject = true; // Default value: ON
        ea.setScriptSettings(scriptSettings);
    }
    
    // --------------------------------------------------------------------------
    // 1. INSTANT ACTION: Manual execution via hotkey
    // --------------------------------------------------------------------------
    if (api) {
        const appState = api.getAppState();
        // Check if exactly a single line element is selected in selection mode
        if (!appState.multiElement && appState.activeTool.type === "selection") {
            const selectedElements = ea.getViewSelectedElements();
            if (selectedElements.length === 1) {
                const el = selectedElements[0];
                if ((el.type === "arrow" || el.type === "line") && !isClosedLine(el)) {
                    executeJump(el);
                }
            }
        }
    }

    // --------------------------------------------------------------------------
    // 2. BACKGROUND ACTION: Autostart & Event Registration
    // --------------------------------------------------------------------------
    const autostart = await ea.registerAutostart();
    
    if (autostart === "allow") {
        
        // A) Register context menu provider (buttons for the element menu)
        if (window.unregisterArrowTraceJumper) {
            window.unregisterArrowTraceJumper();
        }

        window.unregisterArrowTraceJumper = ea.registerElementActionProvider((element) => {
            // Only show for open arrows and lines
            if (element.type !== "arrow" && element.type !== "line") return [];
            if (isClosedLine(element)) return [];

            // BUTTON SHIELD: Hides the icons while drawing or editing
            const currentApi = ea.getExcalidrawAPI();
            if (currentApi) {
                const appState = currentApi.getAppState();
                if (appState.activeTool.type !== "selection" || 
                    appState.multiElement || 
                    appState.editingLinearElement) {
                    return []; 
                }
            }

            // Determine current settings status for icon labeling
            let currentSettings = ea.getScriptSettings() || {};
            let isSelectTargetOn = currentSettings.selectConnectedObject !== false;

            const iconOn = "check-square"; 
            const iconOff = "square";

            // Provide action buttons: 1. Main action (jumping), 2. Settings toggle
            return [
                {
                    id: "btn-arrow-trace-jumper",
                    title: "Jump to other end",
                    icon: "fast-forward",
                    action: () => executeJump(element)
                },
                {
                    id: "btn-arrow-trace-jumper-settings",
                    title: isSelectTargetOn 
                        ? "Jumper Setting: Select connected object at target (Current: ON)" 
                        : "Jumper Setting: Select connected object at target (Current: OFF)",
                    icon: isSelectTargetOn ? iconOn : iconOff,
                    action: () => {
                        // 1. Toggle value and save persistently
                        currentSettings.selectConnectedObject = !isSelectTargetOn;
                        ea.setScriptSettings(currentSettings);
                        
                        // 2. Display Obsidian notice
                        const NoticeObj = window.Notice || (window as any).require("obsidian").Notice;
                        new NoticeObj("Jumper: Select target object is now " + (currentSettings.selectConnectedObject ? "ON" : "OFF"));
                        
                        // 3. UI Reset: Forces Excalidraw to redraw the context menu
                        if (currentApi) {
                            const selected = currentApi.getAppState().selectedElementIds;
                            currentApi.updateScene({ appState: { selectedElementIds: {} } });
                            setTimeout(() => {
                                currentApi.updateScene({ appState: { selectedElementIds: selected } });
                            }, 20);
                        }
                    }
                }
            ];
        });

        // B) Auto-Flipper Guard (listens for clicks to automatically re-orient arrows)
        const excalidrawContainer = document.querySelector('.excalidraw-container');
        
        if (window.jumperPointerObserver && excalidrawContainer) {
            excalidrawContainer.removeEventListener("pointerdown", window.jumperPointerObserver);
        }
        
        window.jumperPointerObserver = (evt) => {
             setTimeout(() => {
                 const currentApi = ea.getExcalidrawAPI();
                 if (!currentApi) return;
                 const appState = currentApi.getAppState();

                 // GUARD SHIELD: Abort on active editing actions
                 if (appState.activeTool.type !== "selection" || 
                     appState.multiElement || 
                     appState.draggingElement || 
                     appState.resizingElement || 
                     appState.editingLinearElement) {
                     return; 
                 }

                 const currentSelection = ea.getViewSelectedElements();
                 if (currentSelection.length === 1 && (currentSelection[0].type === "arrow" || currentSelection[0].type === "line")) {
                     const el = currentSelection[0];
                     if (!isClosedLine(el)) {
                        checkAndFlipArrow(el);
                     }
                 }
             }, 50);
        };
        
        if (excalidrawContainer) {
            excalidrawContainer.addEventListener('pointerdown', window.jumperPointerObserver);
        }
    }
}

/**
 * Checks the visibility of arrow ends in the viewport and flips the arrow if necessary,
 * so that the logical target lies within the visible area.
 * 
 * @param {Object} arrow - The arrow or line element to check.
 */
function checkAndFlipArrow(arrow) {
    const api = ea.getExcalidrawAPI();
    const appState = api.getAppState();
    
    // Determine absolute world coordinates for start and end points
    const pts = arrow.points;
    const startPoint = { x: arrow.x + pts[0][0], y: arrow.y + pts[0][1] };
    const endPoint = { x: arrow.x + pts[pts.length - 1][0], y: arrow.y + pts[pts.length - 1][1] };

    const isStartVisible = isPointInViewport(startPoint.x, startPoint.y, appState);
    const isEndVisible = isPointInViewport(endPoint.x, endPoint.y, appState);

    let flip = false;

    // Decision logic for automatic rotation
    if (isEndVisible && !isStartVisible) {
        flip = true; // End point is visible, start point outside -> Flip
    } else if (!isEndVisible && isStartVisible) {
        flip = false; // Start point is visible, end point outside -> Keep
    } else {
        // Fallback: If both are in the viewport or both outside, proximity to the screen center wins
        const zoom = appState.zoom.value;
        const viewportCenterX = (appState.width / 2) / zoom - appState.scrollX;
        const viewportCenterY = (appState.height / 2) / zoom - appState.scrollY;

        const distStart = Math.hypot(startPoint.x - viewportCenterX, startPoint.y - viewportCenterY);
        const distEnd = Math.hypot(endPoint.x - viewportCenterX, endPoint.y - viewportCenterY);
        
        if (distEnd < distStart) {
            flip = true;
        }
    }

    // If rotation is required, update geometry and bindings
    if (flip) {
        const newOriginX = arrow.x + pts[pts.length - 1][0];
        const newOriginY = arrow.y + pts[pts.length - 1][1];
        
        const newPoints = pts.reverse().map(p => [
            (arrow.x + p[0]) - newOriginX,
            (arrow.y + p[1]) - newOriginY
        ]);

        const elements = ea.getViewElements().map(e => {
            if (e.id === arrow.id) {
                return {
                    ...e,
                    x: newOriginX,
                    y: newOriginY,
                    points: newPoints,
                    startBinding: arrow.endBinding,
                    endBinding: arrow.startBinding,
                    startArrowhead: arrow.endArrowhead,
                    endArrowhead: arrow.startArrowhead
                };
            }
            return e;
        });

        api.updateScene({ elements: elements });
    }
}

/**
 * Core function: Executes the jump to the other end of the arrow.
 * Includes viewport detection, the switch for connected objects, and moving the view.
 * 
 * @param {Object} passedArrow - The selected source arrow.
 */
function executeJump(passedArrow) {
    const api = ea.getExcalidrawAPI();
    const allElements = ea.getViewElements();

    // Ensure we use the latest element from the scene
    const arrow = allElements.find(e => e.id === passedArrow.id) || passedArrow;

    /**
     * Internal helper function to determine anchor points (considering attached objects).
     */
    function getAnchorData(binding, pointOffset, isStart) {
        let el = null;
        if (binding && binding.elementId) {
            el = allElements.find(e => e.id === binding.elementId);
        }
        if (el) {
            return { cx: el.x + el.width / 2, cy: el.y + el.height / 2, element: el, isStart };
        } else {
            return { cx: arrow.x + pointOffset[0], cy: arrow.y + pointOffset[1], element: null, isStart };
        }
    }

    const pts = arrow.points;
    const startData = getAnchorData(arrow.startBinding, pts[0], true);
    const endData = getAnchorData(arrow.endBinding, pts[pts.length - 1], false);

    const appState = api.getAppState();
    
    const isStartVisible = isPointInViewport(startData.cx, startData.cy, appState);
    const isEndVisible = isPointInViewport(endData.cx, endData.cy, appState);

    let targetData;

    // Logic: Jump primarily to the end that is currently NOT visible in the viewport
    if (isStartVisible && !isEndVisible) {
        targetData = endData;
    } else if (!isStartVisible && isEndVisible) {
        targetData = startData;
    } else {
        // Fallback: Distance comparison to the screen center
        const zoom = appState.zoom.value;
        const viewportCenterX = (appState.width / 2) / zoom - appState.scrollX;
        const viewportCenterY = (appState.height / 2) / zoom - appState.scrollY;

        const distStart = Math.hypot(startData.cx - viewportCenterX, startData.cy - viewportCenterY);
        const distEnd = Math.hypot(endData.cx - viewportCenterX, endData.cy - viewportCenterY);
        
        targetData = distStart < distEnd ? endData : startData;
    }

    // Calculate new scroll position to center the target
    const newScrollX = (appState.width / 2) / appState.zoom.value - targetData.cx;
    const newScrollY = (appState.height / 2) / appState.zoom.value - targetData.cy;

    // --------------------------------------------------------------------------
    // SETTINGS SWITCH: Should a connected object be selected or the arrow flipped?
    // --------------------------------------------------------------------------
    let currentSettings = ea.getScriptSettings() || {};
    let isSelectTargetOn = currentSettings.selectConnectedObject !== false;

    const shouldSelectConnectedElement = targetData.element && isSelectTargetOn;

    let updatedElements = allElements;
    // If NO connected object should be selected and we jump to the start end, invert arrow
    if (!shouldSelectConnectedElement && !targetData.isStart) {
        const newOriginX = arrow.x + pts[pts.length - 1][0];
        const newOriginY = arrow.y + pts[pts.length - 1][1];
        
        const newPoints = pts.slice().reverse().map(p => [
            (arrow.x + p[0]) - newOriginX,
            (arrow.y + p[1]) - newOriginY
        ]);

        updatedElements = allElements.map(e => {
            if (e.id === arrow.id) {
                return {
                    ...e,
                    x: newOriginX,
                    y: newOriginY,
                    points: newPoints,
                    startBinding: arrow.endBinding,
                    endBinding: arrow.startBinding,
                    startArrowhead: arrow.endArrowhead,
                    endArrowhead: arrow.startArrowhead
                };
            }
            return e;
        });
    }

    // Determine which ID should be marked afterwards
    const selectedIds = {};
    if (shouldSelectConnectedElement) {
        selectedIds[targetData.element.id] = true;
    } else {
        selectedIds[arrow.id] = true;
    }

    // Step 1: Update scene (shift viewport, temporarily clear selection)
    api.updateScene({
        elements: updatedElements,
        appState: {
            scrollX: newScrollX,
            scrollY: newScrollY,
            selectedElementIds: {}
        }
    });

    // Step 2: After a short delay (50ms), highlight the target object or arrow
    setTimeout(() => {
        api.updateScene({
            appState: { selectedElementIds: selectedIds }
        });
    }, 50);
}

// Run script
init();