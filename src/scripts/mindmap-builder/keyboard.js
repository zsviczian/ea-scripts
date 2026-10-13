/**
 * @file keyboard.js
 * @overview Hotkey configuration, conflict checks, and keyboard dispatch.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createKeyboard(runtimeContext) {
  let disposed = false;
  let popRootScope = () => {};
  const ownedKeydownCleanups = new Set();

  /** Releases this invocation's registrations even if its window alias was replaced. */
  const removeObsidianHotkeyOverrides = () => popRootScope();

  /** Stops delayed callbacks and releases listeners owned by this keyboard instance. */
  const disposeKeyboard = () => {
    disposed = true;
    removeObsidianHotkeyOverrides();
    ownedKeydownCleanups.forEach((cleanup) => cleanup());
  };
  const getObsidianConflict = (h) => {
    if (!h) return null;
    const normalize = (s) => s.toLowerCase().replace("key", "").replace("digit", "");
    const sortMods = (m) => [...m].sort().join(",");
    const keysToCheck = h.isNavigation
      ? ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]
      : [h.code ? h.code : h.key];
    const targetMods = sortMods(h.modifiers);
    const commands = app.commands.listCommands();
    for (const cmd of commands) {
      const hotkeys =
        app.hotkeyManager.getHotkeys(cmd.id) || app.hotkeyManager.getDefaultHotkeys(cmd.id);
      if (!hotkeys) continue;
      for (const hk of hotkeys) {
        const hkKey = normalize(hk.key);
        const hkMods = sortMods(hk.modifiers);
        for (const targetKeyRaw of keysToCheck) {
          if (normalize(targetKeyRaw) === hkKey && targetMods === hkMods) {
            return cmd.name;
          }
        }
      }
    }
    return null;
  };

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
  function updateUserHotkeys() {
    let dirty = false;
    const defaultByAction = new Map(runtimeContext.DEFAULT_HOTKEYS.map((d) => [d.action, d]));
    // These properties dictate script logic and should never be overridden by user settings
    const structuralKeys = ["isInputOnly", "requiresNode", "isNavigation", "hidden"];
    const userByAction = new Map();
    for (const u of runtimeContext.userHotkeys) {
      if (u && typeof u.action === "string" && defaultByAction.has(u.action)) {
        userByAction.set(u.action, u);
      } else if (u && u.action) {
        // user action no longer exists in DEFAULT => dropped
        dirty = true;
      }
    }
    const next = [];
    for (const d of runtimeContext.DEFAULT_HOTKEYS) {
      const u = userByAction.get(d.action);
      if (!u) {
        next.push(structuredClone ? structuredClone(d) : JSON.parse(JSON.stringify(d)));
        dirty = true;
        continue;
      }
      const cleaned = {
        action: d.action,
      };
      for (const key of Object.keys(d)) {
        if (key === "action") continue;
        // Always inherit structural properties directly from defaults
        if (structuralKeys.includes(key)) {
          cleaned[key] = d[key];
          continue; // Do NOT mark dirty just because this key is missing in the user config
        }
        if (Object.prototype.hasOwnProperty.call(u, key)) {
          cleaned[key] = u[key];
        } else {
          cleaned[key] = d[key];
          dirty = true;
        }
      }
      for (const key of Object.keys(u)) {
        if (key === "action") continue;
        // If the user object has a structural key (e.g. from an older version's save),
        // mark as dirty so we flush a cleaned version back to disk.
        if (structuralKeys.includes(key)) {
          dirty = true;
        } else if (!Object.prototype.hasOwnProperty.call(d, key)) {
          dirty = true;
          break;
        }
      }
      next.push(cleaned);
    }
    runtimeContext.userHotkeys = next;
    return dirty;
  }

  const getHotkeyDefByAction = (action) =>
    runtimeContext.userHotkeys.find((h) => h.action === action);

  const getHotkeyDisplayString = (h) => {
    const parts = [];
    if (h.modifiers.includes("Ctrl")) parts.push("Ctrl");
    if (h.modifiers.includes("Meta")) parts.push("Cmd");
    if (h.modifiers.includes("Mod")) parts.push(runtimeContext.isMac ? "Cmd" : "Ctrl");
    if (h.modifiers.includes("Alt")) parts.push(runtimeContext.isMac ? "Opt" : "Alt");
    if (h.modifiers.includes("Shift")) parts.push("Shift");
    if (h.code) parts.push(h.code.replace("Key", "").replace("Digit", ""));
    else if (h.key === "ArrowKeys") parts.push("Arrow");
    else if (h.key === " ") parts.push("Space");
    else parts.push(h.key);
    return parts.join(" + ");
  };

  const getActionHotkeyString = (action) =>
    `(${getHotkeyDisplayString(getHotkeyDefByAction(action))})`;

  // Generate the runtime HOTKEYS array used by getActionFromEvent
  const generateRuntimeHotkeys = () => {
    const runtimeKeys = [];
    runtimeContext.userHotkeys.forEach((h) => {
      if (h.isNavigation) {
        ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].forEach((key) => {
          runtimeKeys.push({
            action: h.action,
            key,
            modifiers: h.modifiers,
            scope: h.scope,
            requiresNode: h.requiresNode,
            isInputOnly: h.isInputOnly,
          });
        });
      } else {
        runtimeKeys.push(h);
      }
    });
    return runtimeKeys;
  };

  /**
   * Returns the current scope context for the hotkey
   **/
  const getHotkeyContext = (event) => {
    if (disposed || !runtimeContext.ea.sidepanelTab || !runtimeContext.isViewSet()) {
      return runtimeContext.SCOPE.none;
    }
    const currentWindow =
      runtimeContext.isUndocked && runtimeContext.floatingInputModal
        ? runtimeContext.ea.targetView?.ownerWindow
        : runtimeContext.sidepanelWindow;
    const activeElement = event?.target ?? currentWindow?.document?.activeElement;
    if (
      (runtimeContext.inputEl && activeElement === runtimeContext.inputEl) ||
      (runtimeContext.ontologyEl && activeElement === runtimeContext.ontologyEl)
    ) {
      return runtimeContext.SCOPE.input;
    }
    const leaf = app.workspace.activeLeaf;
    if (!leaf) return runtimeContext.SCOPE.none;
    if (
      runtimeContext.ea.targetView.leaf === leaf ||
      (runtimeContext.ea.getSidepanelLeaf() === leaf && runtimeContext.ea.sidepanelTab.isVisible())
    ) {
      return runtimeContext.SCOPE.excalidraw;
    }
    if (runtimeContext.ea.targetView.leaf.isVisible()) {
      return runtimeContext.SCOPE.global;
    }
    return runtimeContext.SCOPE.none;
  };

  // ---------------------------------------------------------------------------
  // Focus Management & UI State
  // ---------------------------------------------------------------------------
  const registerKeydownHandler = (host, handler) => {
    if (disposed || !runtimeContext.ea.sidepanelTab) return;
    runtimeContext.removeKeydownHandlers();
    if (!window.MindmapBuilder) return; //Mindmap Builder has closed
    if (!window.MindmapBuilder.keydownHandlers) {
      window.MindmapBuilder.keydownHandlers = [];
    }
    host.addEventListener("keydown", handler, true);
    const cleanup = () => {
      host.removeEventListener("keydown", handler, true);
      ownedKeydownCleanups.delete(cleanup);
    };
    ownedKeydownCleanups.add(cleanup);
    window.MindmapBuilder.keydownHandlers.push(cleanup);
  };

  const registerObsidianHotkeyOverrides = () => {
    // A queued focus callback can outlive onClose and a newer script invocation.
    removeObsidianHotkeyOverrides();
    if (disposed || !runtimeContext.ea.sidepanelTab) return;
    const keymapScope = app.keymap.getRootScope();
    if (getHotkeyContext() === runtimeContext.SCOPE.none) return;
    // Scope stops scanning after an explicit-key handler, even if it returns undefined.
    // A wildcard can fall through to Obsidian's handlers when live focus no longer qualifies.
    const handler = keymapScope.register(null, null, (event) =>
      canOverrideObsidianHotkey(event) ? true : undefined,
    );
    const registry = window.MindmapBuilder;
    const release = () => {
      keymapScope.unregister(handler);
      if (registry?.popObsidianHotkeyScope === release) {
        delete registry.popObsidianHotkeyScope;
      }
      if (popRootScope === release) popRootScope = () => {};
    };
    popRootScope = release;
    try {
      const index = keymapScope.keys.indexOf(handler);
      if (index !== -1) keymapScope.keys.splice(index, 1);
      keymapScope.keys.unshift(handler);
      if (registry) registry.popObsidianHotkeyScope = release;
    } catch (error) {
      release();
      throw error;
    }
  };

  const updateKeyHandlerLocation = () => {
    // Attach to the appropriate window based on state
    if (runtimeContext.isUndocked) {
      // Floating: Input is reparented to targetView's window
      if (runtimeContext.ea.targetView && runtimeContext.ea.targetView.ownerWindow) {
        registerKeydownHandler(runtimeContext.ea.targetView.ownerWindow, handleKeydown);
      }
    } else {
      // Docked: Input is in the sidepanel's window
      if (runtimeContext.sidepanelWindow) {
        registerKeydownHandler(runtimeContext.sidepanelWindow, handleKeydown);
      }
    }
  };

  /**
   * Resolves a keyboard event to a configured action depending on modifier keys and settings.
   *
   * @param {KeyboardEvent} e - The keyboard event.
   * @returns {object} - { action, scope, requiresNode } or empty object if no match.
   */
  const getActionFromEvent = (e) => {
    const isMod = e.ctrlKey || e.metaKey;
    const match = runtimeContext.RUNTIME_HOTKEYS.find((h) => {
      const keyMatch = h.code ? e.code === h.code : e.key === h.key;
      if (!keyMatch) return false;
      const hasMod =
        h.modifiers.includes("Mod") || h.modifiers.includes("Ctrl") || h.modifiers.includes("Meta");
      const hasShift = h.modifiers.includes("Shift");
      const hasAlt = h.modifiers.includes("Alt");
      return isMod === hasMod && e.shiftKey === hasShift && e.altKey === hasAlt;
    });
    return match
      ? {
          action: match.action,
          scope: match.scope ?? runtimeContext.SCOPE.none,
          requiresNode: match.requiresNode,
          isInputOnly: match.isInputOnly,
        }
      : {};
  };

  /** Mirrors dispatch eligibility before shadowing an Obsidian shortcut. */
  const canOverrideObsidianHotkey = (event) => {
    if (disposed || event.isComposing || event.keyCode === 229 || runtimeContext.isRecordingHotkey)
      return false;
    if (!runtimeContext.ea.targetView?.leaf.isVisible()) return false;
    const state = runtimeContext.getAppState();
    if (
      !state ||
      state.editingTextElement ||
      state.selectedLinearElement?.isEditing ||
      state.showHyperlinkPopup === "editor"
    )
      return false;
    if (runtimeContext.linkSuggester?.isBlockingKeys()) return false;
    const { action, scope, requiresNode, isInputOnly } = getActionFromEvent(event);
    const context = getHotkeyContext(event);
    if (!action || context < scope || (isInputOnly && context !== runtimeContext.SCOPE.input))
      return false;
    if (requiresNode && !runtimeContext.getMindmapNodeFromSelection()) return false;
    if (action === runtimeContext.ACTION_UNDO && runtimeContext.lastCommittedTransaction === null)
      return false;
    if (
      (action === runtimeContext.ACTION_REDO_Z || action === runtimeContext.ACTION_REDO_Y) &&
      runtimeContext.redoAvailable === null
    )
      return false;
    return true;
  };

  /**
   * Main keydown handler.
   * Dispatches actions (add, edit, navigate, fold, etc.) based on hotkey settings.
   *
   * @param {KeyboardEvent} e
   */
  const handleKeydown = (e) => {
    if (disposed || !runtimeContext.ea.sidepanelTab) return;
    // Fix for IME (Korean, Chinese, Japanese, etc.) composition issues
    // Prevents "Enter" from triggering actions when it's just confirming a character selection
    if (e.isComposing || e.keyCode === 229) return;
    if (runtimeContext.isRecordingHotkey) return;
    if (!runtimeContext.ea.targetView || !runtimeContext.ea.targetView.leaf.isVisible()) return;
    const currentWindow =
      runtimeContext.isUndocked && runtimeContext.floatingInputModal
        ? runtimeContext.ea.targetView?.ownerWindow
        : runtimeContext.sidepanelWindow;
    if (!currentWindow) return;
    const st = runtimeContext.getAppState();
    if (
      !st ||
      !!st.editingTextElement ||
      !!st.selectedLinearElement?.isEditing ||
      st.showHyperlinkPopup === "editor"
    )
      return;
    if (runtimeContext.linkSuggester?.isBlockingKeys()) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (
      e.key === "Escape" &&
      !runtimeContext.isUndocked &&
      runtimeContext.inputEl.ownerDocument.activeElement !== runtimeContext.inputEl
    ) {
      return;
    }
    let { action, scope, requiresNode, isInputOnly } = getActionFromEvent(e);
    if (!action && !["Tab", "Enter"].includes(e.key)) return;
    let context = getHotkeyContext(e);
    // Local Tab handling for floating modal to keep focus cycling inside
    if (
      !action &&
      runtimeContext.isUndocked &&
      runtimeContext.floatingInputModal &&
      e.key === "Tab"
    ) {
      const modalEl = runtimeContext.floatingInputModal.modalEl;
      if (!modalEl) return;
      const activeEl = modalEl.ownerDocument.activeElement;
      if (!modalEl.contains(activeEl)) return;
      const selector = ["input:not([disabled])", "div:not([style*='not-allowed'])"].join(",");
      const focusables = Array.from(modalEl.querySelectorAll(selector)).filter((el) => {
        if (el.tabIndex === -1 || el.hidden) return false;
        return el.offsetParent !== null || el.getClientRects().length > 0;
      });
      if (focusables.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        const active = modalEl.ownerDocument.activeElement;
        let idx = focusables.indexOf(active);
        if (idx === -1) idx = 0;
        idx = e.shiftKey
          ? idx === 0
            ? focusables.length - 1
            : idx - 1
          : idx === focusables.length - 1
            ? 0
            : idx + 1;
        focusables[idx].focus();
      }
      return;
    }
    if (
      e.key === "Enter" &&
      context === runtimeContext.SCOPE.excalidraw &&
      ((runtimeContext.isUndocked && runtimeContext.floatingInputModal) ||
        !runtimeContext.isUndocked)
    ) {
      const modalEl = runtimeContext.isUndocked
        ? runtimeContext.floatingInputModal.modalEl
        : runtimeContext.ea.sidepanelTab.containerEl;
      const activeEl = modalEl?.ownerDocument.activeElement;
      action = activeEl?.getAttribute("action");
      if (!action) return;
      context = runtimeContext.SCOPE.input;
    }
    if (!action || context < scope || (isInputOnly && context !== runtimeContext.SCOPE.input))
      return;
    // Verify active node requirement
    if (requiresNode && !runtimeContext.getMindmapNodeFromSelection()) {
      return;
    }
    // Verify transaction state for Undo
    if (action === runtimeContext.ACTION_UNDO && runtimeContext.lastCommittedTransaction === null) {
      return;
    }
    // Verify transaction state for Redo
    if (
      (action === runtimeContext.ACTION_REDO_Z || action === runtimeContext.ACTION_REDO_Y) &&
      runtimeContext.redoAvailable === null
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    runtimeContext.performAction(action, e);
  };

  const addSibling = async (event, insertAfter = true) => {
    if (!runtimeContext.inputEl.value) return;
    const dir = insertAfter ? 1 : -1;
    const allElementsForSibling = runtimeContext.ea.getViewElements();
    const selectedForSibling = runtimeContext.getMindmapNodeFromSelection();
    if (!selectedForSibling) {
      await runtimeContext.addNode(
        runtimeContext.inputEl.value,
        true,
        false,
        null,
        null,
        null,
        runtimeContext.ontologyEl.value,
      );
    } else {
      const info = runtimeContext.getHierarchy(selectedForSibling, allElementsForSibling);
      const root = allElementsForSibling.find((el) => el.id === info.rootId);
      const parentOfSelected = runtimeContext.getParentNode(
        selectedForSibling.id,
        allElementsForSibling,
      );
      const rootMode = root.customData?.growthMode || runtimeContext.currentModalGrowthMode;
      const isVertical = ["Up-facing", "Down-facing", "Up-Down"].includes(rootMode);
      // If parent exists, add to that parent (Sibling).
      // If no parent (Root was selected), add to selected (Child).
      const targetParent = parentOfSelected ?? selectedForSibling;
      // Default position: slightly lower to ensure correct Y-sort order in directional maps
      let pos = {
        x:
          selectedForSibling.x +
          (isVertical && insertAfter ? selectedForSibling.width : 0) +
          (isVertical ? dir : 0),
        y:
          selectedForSibling.y +
          (!isVertical && insertAfter ? selectedForSibling.height : 0) +
          (!isVertical ? dir : 0),
      };
      // Specific logic for Radial L1 nodes:
      // Position must be calculated via angle offset because triggerGlobalLayout sorts
      // L1 nodes in Radial maps clockwise by angle, not by Y-coordinate.
      if (
        parentOfSelected &&
        parentOfSelected.id === root.id &&
        root.customData?.growthMode === "Radial"
      ) {
        const rb = runtimeContext.getNodeBox(root, allElementsForSibling);
        const rc = {
          x: rb.minX + rb.width / 2,
          y: rb.minY + rb.height / 2,
        };
        const sc = {
          x: selectedForSibling.x + selectedForSibling.width / 2,
          y: selectedForSibling.y + selectedForSibling.height / 2,
        };
        // Calculate the current angle and distance, then increment angle slightly (~5.7 degrees)
        const angle = Math.atan2(sc.y - rc.y, sc.x - rc.x) + dir * 0.2;
        const dist = Math.hypot(sc.x - rc.x, sc.y - rc.y);
        pos = {
          x: rc.x + Math.cos(angle) * dist - selectedForSibling.width / 2,
          y: rc.y + Math.sin(angle) * dist - selectedForSibling.height / 2,
        };
      }
      runtimeContext.selectNodeInView(targetParent);
      await runtimeContext.addNode(
        runtimeContext.inputEl.value,
        false,
        false,
        null,
        null,
        pos,
        runtimeContext.ontologyEl.value,
      );
    }
    runtimeContext.inputEl.value = "";
    runtimeContext.ontologyEl.value = "";
    runtimeContext.updateUI();
    await runtimeContext.performAction(runtimeContext.ACTION_ADD, event); // Move selection to new node
  };
  runtimeContext.ea.registerCleanup?.(disposeKeyboard);
  return {
    removeObsidianHotkeyOverrides,
    disposeKeyboard,
    getObsidianConflict,
    updateUserHotkeys,
    getHotkeyDefByAction,
    getHotkeyDisplayString,
    getActionHotkeyString,
    generateRuntimeHotkeys,
    getHotkeyContext,
    registerKeydownHandler,
    registerObsidianHotkeyOverrides,
    updateKeyHandlerLocation,
    getActionFromEvent,
    handleKeydown,
    addSibling,
  };
}
