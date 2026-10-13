/**
 * @file publicApi.js
 * @overview The existing window.MindMapBuilderAPI contract and its validation wrappers.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function installMindmapPublicApi(runtimeContext) {
  // ---------------------------------------------------------------------------
  // 11. Public Puppeteering API (minimal-impact wrappers)
  // ---------------------------------------------------------------------------
  (() => {
    // Note: ACTION_CALENDAR is deliberately not published in the MindMap Builder API.
    // It is a UI-driven feature meant for quick manual input. Programmatic scripts
    // can simply author or modify the text element's rawText directly rather than
    // invoking the Calendar UI dialog.
    const MMError = {
      NOT_READY: "NOT_READY",
      NO_VIEW: "NO_VIEW",
      INVALID_VIEW: "INVALID_VIEW",
      INVALID_NODE: "INVALID_NODE",
      NO_SELECTION: "NO_SELECTION",
      NO_ROOT: "NO_ROOT",
      AUTO_LAYOUT_DISABLED: "AUTO_LAYOUT_DISABLED",
      INVALID_ACTION: "INVALID_ACTION",
      INVALID_ARGUMENT: "INVALID_ARGUMENT",
      OPERATION_FAILED: "OPERATION_FAILED",
    };
    const mmOk = (data) => ({
      ok: true,
      data,
    });
    const mmErr = (code, message, details) => ({
      ok: false,
      error:
        details === undefined
          ? {
              code,
              message,
            }
          : {
              code,
              message,
              details,
            },
    });
    const requireView = () => {
      if (!runtimeContext.isViewSet()) return mmErr(MMError.NO_VIEW, "No active ExcalidrawView");
      return null;
    };
    const findNodeById = (nodeId) => {
      const all = runtimeContext.ea.getViewElements();
      return all.find((el) => el.id === nodeId);
    };
    const resolveNode = (nodeId) => {
      const viewErr = requireView();
      if (viewErr) return viewErr;
      if (nodeId) {
        const node = findNodeById(nodeId);
        if (!node) return mmErr(MMError.INVALID_NODE, `Node not found: ${nodeId}`);
        return mmOk(node);
      }
      const sel = runtimeContext.getMindmapNodeFromSelection();
      if (!sel) return mmErr(MMError.NO_SELECTION, "No mindmap node selected");
      return mmOk(sel);
    };
    const getNodeOntology = (node, allElements) => {
      const incomingArrow = allElements.find(
        (a) => a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === node.id,
      );
      return incomingArrow
        ? runtimeContext.ea.getBoundTextElement(incomingArrow, true)?.sceneElement?.rawText || ""
        : "";
    };
    const extractMapConfig = (rootNode) => ({
      growthMode: rootNode.customData?.growthMode || runtimeContext.currentModalGrowthMode,
      autoLayoutDisabled: rootNode.customData?.autoLayoutDisabled === true,
      arrowType: rootNode.customData?.arrowType ?? runtimeContext.arrowType,
      fontsizeScale: rootNode.customData?.fontsizeScale ?? runtimeContext.fontsizeScale,
      multicolor:
        typeof rootNode.customData?.multicolor === "boolean"
          ? rootNode.customData.multicolor
          : runtimeContext.multicolor,
      boxChildren:
        typeof rootNode.customData?.boxChildren === "boolean"
          ? rootNode.customData.boxChildren
          : runtimeContext.boxChildren,
      roundedCorners:
        typeof rootNode.customData?.roundedCorners === "boolean"
          ? rootNode.customData.roundedCorners
          : runtimeContext.roundedCorners,
      maxWrapWidth:
        typeof rootNode.customData?.maxWrapWidth === "number"
          ? rootNode.customData.maxWrapWidth
          : runtimeContext.maxWidth,
      isSolidArrow:
        typeof rootNode.customData?.isSolidArrow === "boolean"
          ? rootNode.customData.isSolidArrow
          : runtimeContext.isSolidArrow,
      centerText:
        typeof rootNode.customData?.centerText === "boolean"
          ? rootNode.customData.centerText
          : runtimeContext.centerText,
      fillSweep:
        typeof rootNode.customData?.fillSweep === "boolean"
          ? rootNode.customData.fillSweep
          : runtimeContext.fillSweep,
      branchScale: rootNode.customData?.branchScale ?? runtimeContext.branchScale,
      baseStrokeWidth:
        typeof rootNode.customData?.baseStrokeWidth === "number"
          ? rootNode.customData.baseStrokeWidth
          : runtimeContext.baseStrokeWidth,
      layoutSettings: JSON.parse(
        JSON.stringify(rootNode.customData?.layoutSettings ?? runtimeContext.layoutSettings),
      ),
    });
    const API_ACTIONS = {
      ADD: runtimeContext.ACTION_ADD,
      ADD_SIBLING_AFTER: runtimeContext.ACTION_ADD_SIBLING_AFTER,
      ADD_SIBLING_BEFORE: runtimeContext.ACTION_ADD_SIBLING_BEFORE,
      ADD_FOLLOW: runtimeContext.ACTION_ADD_FOLLOW,
      ADD_FOLLOW_FOCUS: runtimeContext.ACTION_ADD_FOLLOW_FOCUS,
      ADD_FOLLOW_ZOOM: runtimeContext.ACTION_ADD_FOLLOW_ZOOM,
      EDIT: runtimeContext.ACTION_EDIT,
      TOGGLE_CHECKBOX: runtimeContext.ACTION_TOGGLE_CHECKBOX,
      PIN: runtimeContext.ACTION_PIN,
      BOX: runtimeContext.ACTION_BOX,
      TOGGLE_EMBED: runtimeContext.ACTION_TOGGLE_EMBED,
      TOGGLE_BOUNDARY: runtimeContext.ACTION_TOGGLE_BOUNDARY,
      TOGGLE_SUBMAP_ROOT: runtimeContext.ACTION_TOGGLE_SUBMAP_ROOT,
      TOGGLE_GROUP: runtimeContext.ACTION_TOGGLE_GROUP,
      FOLD: runtimeContext.ACTION_FOLD,
      FOLD_L1: runtimeContext.ACTION_FOLD_L1,
      FOLD_ALL: runtimeContext.ACTION_FOLD_ALL,
      COPY: runtimeContext.ACTION_COPY,
      CUT: runtimeContext.ACTION_CUT,
      PASTE: runtimeContext.ACTION_PASTE,
      ZOOM: runtimeContext.ACTION_ZOOM,
      FOCUS: runtimeContext.ACTION_FOCUS,
      NAVIGATE: runtimeContext.ACTION_NAVIGATE,
      NAVIGATE_ZOOM: runtimeContext.ACTION_NAVIGATE_ZOOM,
      NAVIGATE_FOCUS: runtimeContext.ACTION_NAVIGATE_FOCUS,
      SORT_ORDER: runtimeContext.ACTION_SORT_ORDER,
      REARRANGE: runtimeContext.ACTION_REARRANGE,
      DOCK_UNDOCK: runtimeContext.ACTION_DOCK_UNDOCK,
      HIDE: runtimeContext.ACTION_HIDE,
      UNDO: runtimeContext.ACTION_UNDO,
      REDO_Z: runtimeContext.ACTION_REDO_Z,
      REDO_Y: runtimeContext.ACTION_REDO_Y,
    };
    const API_ERROR_DOC = {
      [MMError.NOT_READY]: "MindMapBuilder runtime is not initialized",
      [MMError.NO_VIEW]: "No active ExcalidrawView is set",
      [MMError.INVALID_VIEW]: "The provided view is missing or not an ExcalidrawView",
      [MMError.INVALID_NODE]: "The provided node id does not exist in the active view",
      [MMError.NO_SELECTION]: "No mindmap node is currently selected",
      [MMError.NO_ROOT]: "Unable to resolve a root/settings root for the selected node",
      [MMError.AUTO_LAYOUT_DISABLED]: "The map has auto-layout disabled",
      [MMError.INVALID_ACTION]: "The provided action is unknown",
      [MMError.INVALID_ARGUMENT]: "One or more arguments are invalid",
      [MMError.OPERATION_FAILED]: "The underlying operation failed at runtime",
    };
    const API_METHOD_SPEC = {
      ready: {
        summary: "Returns whether the API runtime is initialized",
        params: [],
        returns: "boolean",
      },
      listMethods: {
        summary: "Returns the list of public method names",
        params: [],
        returns: "MMResult<{methods:string[]}>",
      },
      getErrorCodes: {
        summary: "Returns known error codes and their meaning",
        params: [],
        returns: "MMResult<{errors:Record<string,string>}>",
      },
      spec: {
        summary: "Returns machine-readable API metadata for agents",
        params: [],
        returns:
          "MMResult<{version:string,actions:string[],errors:Record<string,string>,methods:object}>",
      },
      help: {
        summary: "Returns method docs for one method or the full API",
        params: [
          {
            name: "method",
            type: "string",
            required: false,
          },
          {
            name: "format",
            type: "string",
            required: false,
            enum: ["object", "text"],
          },
        ],
        returns: "MMResult<object|string>",
      },
      validate: {
        summary: "Validates arguments against the API method contract",
        params: [
          {
            name: "method",
            type: "string",
            required: true,
          },
          {
            name: "args",
            type: "any",
            required: false,
          },
        ],
        returns: "MMResult<{valid:boolean,errors:string[],normalizedArgs:object}>",
      },
      getCapabilities: {
        summary: "Returns available actions and methods",
        params: [],
        returns: "{actions:string[],methods:string[]}",
      },
      setView: {
        summary: "Sets the active ExcalidrawView context",
        params: [
          {
            name: "view",
            type: "object",
            required: true,
          },
        ],
        returns: "MMResult<{view:ExcalidrawView|null,filePath:string|null}>",
      },
      getView: {
        summary: "Gets the current ExcalidrawView and filepath",
        params: [],
        returns: "MMResult<{view:ExcalidrawView|null,filePath:string|null}>",
      },
      getSelection: {
        summary: "Returns selected node id and selected element ids",
        params: [],
        returns: "MMResult<{nodeId:string|null,elementIds:string[]}>",
      },
      selectNode: {
        summary: "Selects a node by id or current selected node when omitted",
        params: [
          {
            name: "nodeId",
            type: "string",
            required: false,
          },
        ],
        returns: "MMResult<{nodeId:string}>",
      },
      setInputFieldDockStatus: {
        summary: "Forces docked/undocked input mode and applies matching sidepanel visibility",
        params: [
          {
            name: "isDocked",
            type: "boolean",
            required: true,
          },
        ],
        returns:
          "Promise<MMResult<{isDocked:boolean,isUndocked:boolean,sidepanelVisible:boolean}>>",
      },
      getMindMapRoots: {
        summary: "Returns top-level mindmap root node ids",
        params: [],
        returns: "MMResult<{rootIds:string[]}>",
      },
      getMapInfo: {
        summary: "Returns hierarchy info for a node or current selection",
        params: [
          {
            name: "nodeId",
            type: "string",
            required: false,
          },
        ],
        returns: "MMResult<{nodeId:string,rootId:string,settingsRootId:string,depth:number}>",
      },
      getNodeText: {
        summary: "Returns node text and ontology",
        params: [
          {
            name: "nodeId",
            type: "string",
            required: false,
          },
        ],
        returns: "MMResult<{nodeId:string,text:string,ontology:string}>",
      },
      performAction: {
        summary: "Runs one built-in mindmap action",
        params: [
          {
            name: "action",
            type: "string",
            required: true,
            enum: Object.values(API_ACTIONS),
          },
          {
            name: "event",
            type: "object",
            required: false,
          },
        ],
        returns: "Promise<MMResult<void>>",
      },
      refreshMapLayout: {
        summary: "Refreshes map layout from the selected node or provided node id",
        params: [
          {
            name: "nodeId",
            type: "string",
            required: false,
          },
        ],
        returns: "Promise<MMResult<{rootId:string}>>",
      },
      addNode: {
        summary: "Adds a node under selected node or a provided parent",
        params: [
          {
            name: "text",
            type: "string",
            required: true,
          },
          {
            name: "parentId",
            type: "string",
            required: false,
          },
          {
            name: "ontology",
            type: "string",
            required: false,
          },
          {
            name: "follow",
            type: "boolean",
            required: false,
          },
          {
            name: "position",
            type: "string",
            required: false,
          },
        ],
        returns: "Promise<MMResult<{nodeId:string,arrowId:string|undefined,rootId:string}>>",
      },
      importMarkdown: {
        summary: "Imports markdown bullet hierarchy into map",
        params: [
          {
            name: "markdown",
            type: "string",
            required: true,
          },
          {
            name: "parentId",
            type: "string",
            required: false,
          },
        ],
        returns: "Promise<MMResult<{addedNodeIds:string[],rootId:string|null}>>",
      },
      exportMarkdown: {
        summary: "Exports selected branch to markdown through clipboard",
        params: [
          {
            name: "nodeId",
            type: "string",
            required: false,
          },
          {
            name: "cut",
            type: "boolean",
            required: false,
          },
        ],
        returns: "Promise<MMResult<{markdown:string}>>",
      },
      toggleSubmapRoot: {
        summary: "Toggles or forces additional-root state on node",
        params: [
          {
            name: "nodeId",
            type: "string",
            required: false,
          },
          {
            name: "enabled",
            type: "boolean",
            required: false,
          },
        ],
        returns: "Promise<MMResult<{nodeId:string,enabled:boolean}>>",
      },
      getMapConfig: {
        summary: "Returns effective map config for node/root",
        params: [
          {
            name: "nodeId",
            type: "string",
            required: false,
          },
        ],
        returns: "MMResult<{rootId:string,settingsRootId:string,config:object}>",
      },
      setMapConfig: {
        summary: "Patches map config and optionally relayouts",
        params: [
          {
            name: "patch",
            type: "object",
            required: true,
          },
          {
            name: "nodeId",
            type: "string",
            required: false,
          },
          {
            name: "relayout",
            type: "boolean",
            required: false,
          },
        ],
        returns: "Promise<MMResult<{rootId:string,settingsRootId:string}>>",
      },
      getBranchElementIds: {
        summary: "Returns branch element ids with optional decorations/crosslinks",
        params: [
          {
            name: "nodeId",
            type: "string",
            required: true,
          },
          {
            name: "includeDecorations",
            type: "boolean",
            required: false,
          },
          {
            name: "includeCrosslinks",
            type: "boolean",
            required: false,
          },
        ],
        returns: "MMResult<{ids:string[]}>",
      },
      getProjectElementIds: {
        summary: "Returns all project element ids for a root",
        params: [
          {
            name: "rootId",
            type: "string",
            required: true,
          },
        ],
        returns: "MMResult<{ids:string[]}>",
      },
      getElementIdsByRole: {
        summary: "Returns role-based element id groups for a root",
        params: [
          {
            name: "rootId",
            type: "string",
            required: true,
          },
        ],
        returns:
          "MMResult<{nodes:string[],branchArrows:string[],crossLinks:string[],boundaries:string[],decorations:string[],boundTexts:string[]}>",
      },
      getGlobalConfig: {
        summary: "Returns the global map and layout configurations, including custom color palette",
        params: [],
        returns: "MMResult<{config:object}>",
      },
      setGlobalConfig: {
        summary: "Updates the global map and layout configurations and persists them",
        params: [
          {
            name: "patch",
            type: "object",
            required: true,
          },
        ],
        returns: "Promise<MMResult<{success:boolean}>>",
      },
      getConfigSchema: {
        summary: "Returns the schema, allowed values, and definitions for map configurations",
        params: [],
        returns: "MMResult<{schema:object}>",
      },
    };
    const cloneJSON = (value) => JSON.parse(JSON.stringify(value));
    const normalizeValidationArgs = (method, args) => {
      const spec = API_METHOD_SPEC[method];
      if (!spec) return null;
      if (args === undefined || args === null) return {};
      if (Array.isArray(args)) {
        const out = {};
        spec.params.forEach((p, idx) => {
          if (idx < args.length) out[p.name] = args[idx];
        });
        return out;
      }
      if (typeof args === "object")
        return {
          ...args,
        };
      if (spec.params.length === 1)
        return {
          [spec.params[0].name]: args,
        };
      return null;
    };
    const isTypeMatch = (value, type) => {
      if (type === "any") return true;
      if (type === "array") return Array.isArray(value);
      if (type === "object")
        return value !== null && typeof value === "object" && !Array.isArray(value);
      return typeof value === type;
    };
    const validateMethodArgs = (method, args) => {
      const spec = API_METHOD_SPEC[method];
      if (!spec) {
        return {
          valid: false,
          errors: [`Unknown method: ${method}`],
          normalizedArgs: {},
        };
      }
      const normalizedArgs = normalizeValidationArgs(method, args);
      if (normalizedArgs === null) {
        return {
          valid: false,
          errors: [
            "Arguments must be an object, an array of positional values, or a single value for single-parameter methods",
          ],
          normalizedArgs: {},
        };
      }
      const errors = [];
      spec.params.forEach((p) => {
        const v = normalizedArgs[p.name];
        if (p.required && (v === undefined || v === null || (p.type === "string" && v === ""))) {
          errors.push(`Missing required parameter: ${p.name}`);
          return;
        }
        if (v !== undefined && v !== null && !isTypeMatch(v, p.type)) {
          errors.push(
            `Invalid type for ${p.name}: expected ${p.type}, got ${Array.isArray(v) ? "array" : typeof v}`,
          );
        }
        if (p.enum && v !== undefined && v !== null && !p.enum.includes(v)) {
          errors.push(`Invalid value for ${p.name}: ${v}`);
        }
      });
      return {
        valid: errors.length === 0,
        errors,
        normalizedArgs,
      };
    };
    const buildHelpText = (methodName, doc) => {
      const params = doc.params.map((p) => {
        const req = p.required ? "required" : "optional";
        const enumValues = p.enum ? ` | enum: ${p.enum.join(", ")}` : "";
        return `- ${p.name}: ${p.type} (${req})${enumValues}`;
      });
      const paramsText = params.length ? params.join("\n") : "- (none)";
      return [
        `${methodName}`,
        `${doc.summary}`,
        "Parameters:",
        paramsText,
        `Returns: ${doc.returns}`,
      ].join("\n");
    };
    const API = {
      version: "1.0.0",
      Actions: Object.freeze(API_ACTIONS),
      Errors: Object.freeze(MMError),
      ready: () => !!runtimeContext.ea,
      listMethods: () =>
        mmOk({
          methods: Object.keys(API_METHOD_SPEC),
        }),
      getErrorCodes: () =>
        mmOk({
          errors: cloneJSON(API_ERROR_DOC),
        }),
      spec: () =>
        mmOk({
          version: API.version,
          actions: Object.values(API_ACTIONS),
          errors: cloneJSON(API_ERROR_DOC),
          methods: cloneJSON(API_METHOD_SPEC),
        }),
      help: (method, format = "object") => {
        if (method !== undefined && (typeof method !== "string" || method.trim() === "")) {
          return mmErr(
            MMError.INVALID_ARGUMENT,
            "help expects method to be a non-empty string when provided",
          );
        }
        if (!["object", "text"].includes(format)) {
          return mmErr(MMError.INVALID_ARGUMENT, "help format must be 'object' or 'text'");
        }
        if (!method) {
          if (format === "text") {
            const lines = Object.keys(API_METHOD_SPEC).map(
              (name) => `${name}: ${API_METHOD_SPEC[name].summary}`,
            );
            return mmOk([`MindMapBuilder API v${API.version}`, ...lines].join("\n"));
          }
          return mmOk({
            version: API.version,
            methods: cloneJSON(API_METHOD_SPEC),
            actions: Object.values(API_ACTIONS),
            errors: cloneJSON(API_ERROR_DOC),
          });
        }
        const doc = API_METHOD_SPEC[method];
        if (!doc) {
          return mmErr(MMError.INVALID_ARGUMENT, `Unknown method: ${method}`);
        }
        if (format === "text") return mmOk(buildHelpText(method, doc));
        return mmOk({
          method,
          ...cloneJSON(doc),
        });
      },
      validate: (method, args) => {
        if (typeof method !== "string" || method.trim() === "") {
          return mmErr(MMError.INVALID_ARGUMENT, "validate requires a method name");
        }
        const result = validateMethodArgs(method, args);
        return mmOk(result);
      },
      getCapabilities: () => ({
        actions: Object.values(API_ACTIONS),
        methods: Object.keys(API),
      }),
      setView: (view) => {
        if (!view) return mmErr(MMError.INVALID_VIEW, "setView expects an ExcalidrawView object");
        const isValid = !!runtimeContext.ea?.isExcalidrawView(view);
        if (!isValid)
          return mmErr(MMError.INVALID_VIEW, "setView expects an ExcalidrawView object");
        try {
          runtimeContext.ea.setView(view);
          runtimeContext.ea.clear();
          runtimeContext.ensureNodeSelected();
          runtimeContext.updateUI();
          return mmOk({
            view: runtimeContext.ea.targetView,
            filePath: runtimeContext.ea.targetView?.file?.path || null,
          });
        } catch (e) {
          return mmErr(MMError.OPERATION_FAILED, "Failed to set view", e);
        }
      },
      getView: () =>
        mmOk({
          view: runtimeContext.ea.targetView || null,
          filePath: runtimeContext.ea.targetView?.file?.path || null,
        }),
      getSelection: () => {
        const viewErr = requireView();
        if (viewErr) return viewErr;
        return mmOk({
          nodeId: runtimeContext.getMindmapNodeFromSelection()?.id || null,
          elementIds: runtimeContext.ea.getViewSelectedElements().map((e) => e.id),
        });
      },
      selectNode: (nodeId) => {
        const nodeRes = resolveNode(nodeId);
        if (!nodeRes.ok) return nodeRes;
        runtimeContext.selectNodeInView(nodeRes.data);
        runtimeContext.performAction(runtimeContext.ACTION_FOCUS);
        runtimeContext.updateUI(nodeRes.data);
        return mmOk({
          nodeId: nodeRes.data.id,
        });
      },
      setInputFieldDockStatus: async ({ isDocked } = {}) => {
        const viewErr = requireView();
        if (viewErr) return viewErr;
        if (typeof isDocked !== "boolean") {
          return mmErr(
            MMError.INVALID_ARGUMENT,
            "setInputFieldDockStatus requires a boolean isDocked",
          );
        }
        try {
          const sidepanelLeaf = runtimeContext.ea.getSidepanelLeaf?.();
          const isSidepanelVisible = !!sidepanelLeaf?.isVisible?.();
          if (isDocked) {
            if (runtimeContext.isUndocked) {
              await runtimeContext.performAction(runtimeContext.ACTION_DOCK_UNDOCK);
            } else if (!isSidepanelVisible && sidepanelLeaf) {
              app.workspace.revealLeaf(sidepanelLeaf);
            }
          } else {
            if (!runtimeContext.isUndocked) {
              await runtimeContext.performAction(runtimeContext.ACTION_DOCK_UNDOCK);
            } else if (isSidepanelVisible) {
              runtimeContext.ea.toggleSidepanelView();
            }
          }
          const finalSidepanelLeaf = runtimeContext.ea.getSidepanelLeaf?.();
          const sidepanelVisible = !!finalSidepanelLeaf?.isVisible?.();
          return mmOk({
            isDocked: !runtimeContext.isUndocked,
            isUndocked: runtimeContext.isUndocked,
            sidepanelVisible,
          });
        } catch (e) {
          return mmErr(MMError.OPERATION_FAILED, "setInputFieldDockStatus failed", e);
        }
      },
      getMindMapRoots: () => {
        const viewErr = requireView();
        if (viewErr) return viewErr;
        return mmOk({
          rootIds: runtimeContext.getMasterRoots(),
        });
      },
      getMapInfo: (nodeId) => {
        const nodeRes = resolveNode(nodeId);
        if (!nodeRes.ok) return nodeRes;
        const node = nodeRes.data;
        const all = runtimeContext.ea.getViewElements();
        const info = runtimeContext.getHierarchy(node, all);
        const settingsRoot = runtimeContext.getSettingsRootNode(node, all);
        return mmOk({
          nodeId: node.id,
          rootId: info.rootId,
          settingsRootId: settingsRoot?.id || info.rootId,
          depth: info.depth,
        });
      },
      getNodeText: (nodeId) => {
        const nodeRes = resolveNode(nodeId);
        if (!nodeRes.ok) return nodeRes;
        const node = nodeRes.data;
        const all = runtimeContext.ea.getViewElements();
        return mmOk({
          nodeId: node.id,
          text: runtimeContext.getTextFromNode(all, node, true, true),
          ontology: getNodeOntology(node, all),
        });
      },
      performAction: async (action, event = {}) => {
        const viewErr = requireView();
        if (viewErr) return viewErr;
        if (!action || !Object.values(API_ACTIONS).includes(action)) {
          return mmErr(MMError.INVALID_ACTION, `Unknown action: ${action}`);
        }
        try {
          await runtimeContext.performAction(action, event);
          return mmOk(undefined);
        } catch (e) {
          return mmErr(MMError.OPERATION_FAILED, "performAction failed", e);
        }
      },
      refreshMapLayout: async (nodeId) => {
        const viewErr = requireView();
        if (viewErr) return viewErr;
        let sel = null;
        if (nodeId) {
          const node = findNodeById(nodeId);
          if (!node) return mmErr(MMError.INVALID_NODE, `Node not found: ${nodeId}`);
          sel = node;
        }
        try {
          await runtimeContext.refreshMapLayout(sel);
          const target = sel || runtimeContext.getMindmapNodeFromSelection();
          if (!target) return mmErr(MMError.NO_SELECTION, "No selected node for layout refresh");
          const info = runtimeContext.getHierarchy(target, runtimeContext.ea.getViewElements());
          return mmOk({
            rootId: info.rootId,
          });
        } catch (e) {
          return mmErr(MMError.OPERATION_FAILED, "refreshMapLayout failed", e);
        }
      },
      addNode: async ({ text, parentId, ontology, follow = false, position } = {}) => {
        const viewErr = requireView();
        if (viewErr) return viewErr;
        if (!text || typeof text !== "string") {
          return mmErr(MMError.INVALID_ARGUMENT, "addNode requires non-empty text");
        }
        if (parentId) {
          const parent = findNodeById(parentId);
          if (!parent) return mmErr(MMError.INVALID_NODE, `Parent node not found: ${parentId}`);
          runtimeContext.selectNodeInView(parent);
        }
        try {
          const node = await runtimeContext.addNode(
            text,
            follow,
            false,
            null,
            null,
            position || null,
            ontology ?? null,
          );
          if (!node) return mmErr(MMError.OPERATION_FAILED, "Failed to create node");
          const all = runtimeContext.ea.getViewElements();
          const info = runtimeContext.getHierarchy(node, all);
          const arrow = all.find(
            (a) =>
              a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === node.id,
          );
          return mmOk({
            nodeId: node.id,
            arrowId: arrow?.id,
            rootId: info.rootId,
          });
        } catch (e) {
          return mmErr(MMError.OPERATION_FAILED, "addNode failed", e);
        }
      },
      importMarkdown: async ({ markdown, parentId } = {}) => {
        const viewErr = requireView();
        if (viewErr) return viewErr;
        if (typeof markdown !== "string" || markdown.trim() === "") {
          return mmErr(
            MMError.INVALID_ARGUMENT,
            "importMarkdown requires a non-empty markdown string",
          );
        }
        if (parentId) {
          const parent = findNodeById(parentId);
          if (!parent) return mmErr(MMError.INVALID_NODE, `Parent node not found: ${parentId}`);
          runtimeContext.selectNodeInView(parent);
        }
        const beforeIds = new Set(runtimeContext.ea.getViewElements().map((e) => e.id));
        try {
          await runtimeContext.importTextToMap(markdown);
          const after = runtimeContext.ea.getViewElements();
          const addedNodeIds = after
            .filter((e) => !beforeIds.has(e.id) && e.type !== "arrow" && !e.customData?.isBoundary)
            .map((e) => e.id);
          let rootId = null;
          if (parentId) {
            const parent = after.find((e) => e.id === parentId);
            rootId = parent ? runtimeContext.getHierarchy(parent, after).rootId : null;
          } else if (addedNodeIds.length > 0) {
            const n = after.find((e) => e.id === addedNodeIds[0]);
            rootId = n ? runtimeContext.getHierarchy(n, after).rootId : null;
          }
          return mmOk({
            addedNodeIds,
            rootId,
          });
        } catch (e) {
          return mmErr(MMError.OPERATION_FAILED, "importMarkdown failed", e);
        }
      },
      exportMarkdown: async ({ nodeId, cut = false } = {}) => {
        const viewErr = requireView();
        if (viewErr) return viewErr;
        if (nodeId) {
          const node = findNodeById(nodeId);
          if (!node) return mmErr(MMError.INVALID_NODE, `Node not found: ${nodeId}`);
          runtimeContext.selectNodeInView(node);
        }
        try {
          const markdown = await runtimeContext.copyMapAsText(!!cut, false);
          return mmOk({
            markdown,
          });
        } catch (e) {
          return mmErr(MMError.OPERATION_FAILED, "exportMarkdown failed", e);
        }
      },
      toggleSubmapRoot: async ({ nodeId, enabled } = {}) => {
        const nodeRes = resolveNode(nodeId);
        if (!nodeRes.ok) return nodeRes;
        const node = nodeRes.data;
        const current = node.customData?.isAdditionalRoot === true;
        if (typeof enabled === "boolean" && enabled === current) {
          return mmOk({
            nodeId: node.id,
            enabled: current,
          });
        }
        runtimeContext.selectNodeInView(node);
        try {
          await runtimeContext.toggleSubmapRoot();
          const updated = findNodeById(node.id);
          return mmOk({
            nodeId: node.id,
            enabled: updated?.customData?.isAdditionalRoot === true,
          });
        } catch (e) {
          return mmErr(MMError.OPERATION_FAILED, "toggleSubmapRoot failed", e);
        }
      },
      getMapConfig: (nodeId) => {
        const nodeRes = resolveNode(nodeId);
        if (!nodeRes.ok) return nodeRes;
        const node = nodeRes.data;
        const all = runtimeContext.ea.getViewElements();
        const info = runtimeContext.getHierarchy(node, all);
        const settingsRoot = runtimeContext.getSettingsRootNode(node, all);
        if (!settingsRoot) return mmErr(MMError.NO_ROOT, "Could not resolve settings root");
        return mmOk({
          rootId: info.rootId,
          settingsRootId: settingsRoot.id,
          config: extractMapConfig(settingsRoot),
        });
      },
      setMapConfig: async ({ patch, nodeId, relayout = true } = {}) => {
        const nodeRes = resolveNode(nodeId);
        if (!nodeRes.ok) return nodeRes;
        const node = nodeRes.data;
        if (!patch || typeof patch !== "object") {
          return mmErr(MMError.INVALID_ARGUMENT, "setMapConfig requires a patch object");
        }
        try {
          runtimeContext.selectNodeInView(node);
          const info = await runtimeContext.updateRootNodeCustomData(
            {
              ...patch,
            },
            node,
          );
          if (!info) return mmErr(MMError.OPERATION_FAILED, "Failed to update map config");
          if (relayout) await runtimeContext.refreshMapLayout(node);
          return mmOk({
            rootId: info.rootId,
            settingsRootId: info.settingsRootId,
          });
        } catch (e) {
          return mmErr(MMError.OPERATION_FAILED, "setMapConfig failed", e);
        }
      },
      getBranchElementIds: ({
        nodeId,
        includeDecorations = true,
        includeCrosslinks = true,
      } = {}) => {
        const viewErr = requireView();
        if (viewErr) return viewErr;
        if (!nodeId) return mmErr(MMError.INVALID_ARGUMENT, "getBranchElementIds requires nodeId");
        const node = findNodeById(nodeId);
        if (!node) return mmErr(MMError.INVALID_NODE, `Node not found: ${nodeId}`);
        const all = runtimeContext.ea.getViewElements();
        let ids = runtimeContext.getBranchElementIds(nodeId, all);
        if (includeDecorations || includeCrosslinks) {
          const info = runtimeContext.getHierarchy(node, all);
          const extras = runtimeContext.getDecorationAndCrossLinkIdsForBranches(
            ids,
            all,
            info.rootId,
          );
          if (!includeDecorations || !includeCrosslinks) {
            const extraEls = extras.map((id) => all.find((e) => e.id === id)).filter(Boolean);
            const filteredExtra = extraEls.filter((e) => {
              if (e.type === "arrow") return includeCrosslinks;
              return includeDecorations;
            });
            ids = ids.concat(filteredExtra.map((e) => e.id));
          } else {
            ids = ids.concat(extras);
          }
        }
        return mmOk({
          ids: Array.from(new Set(ids)),
        });
      },
      getProjectElementIds: (rootId) => {
        const viewErr = requireView();
        if (viewErr) return viewErr;
        if (!rootId) return mmErr(MMError.INVALID_ARGUMENT, "getProjectElementIds requires rootId");
        const all = runtimeContext.ea.getViewElements();
        const root = all.find((e) => e.id === rootId);
        if (!root) return mmErr(MMError.INVALID_NODE, `Root not found: ${rootId}`);
        const project = runtimeContext.getMindmapProjectElements(rootId, all);
        return mmOk({
          ids: project.map((e) => e.id),
        });
      },
      getElementIdsByRole: (rootId) => {
        const viewErr = requireView();
        if (viewErr) return viewErr;
        if (!rootId) return mmErr(MMError.INVALID_ARGUMENT, "getElementIdsByRole requires rootId");
        const all = runtimeContext.ea.getViewElements();
        const root = all.find((e) => e.id === rootId);
        if (!root) return mmErr(MMError.INVALID_NODE, `Root not found: ${rootId}`);
        const branchIds = runtimeContext.getBranchElementIds(rootId, all);
        const decorationAndCrossLinkIds = runtimeContext.getDecorationAndCrossLinkIdsForBranches(
          branchIds,
          all,
          rootId,
        );
        const project = runtimeContext.getMindmapProjectElements(rootId, all);
        const nodes = branchIds
          .map((id) => all.find((e) => e.id === id))
          .filter((e) => e && e.type !== "arrow" && !e.customData?.isBoundary)
          .map((e) => e.id);
        const boundaries = project.filter((e) => e.customData?.isBoundary).map((e) => e.id);
        const branchArrows = project
          .filter((e) => e.type === "arrow" && e.customData?.isBranch)
          .map((e) => e.id);
        const crossLinks = project
          .filter((e) => e.type === "arrow" && !e.customData?.isBranch)
          .map((e) => e.id);
        const boundTexts = project
          .filter((e) => e.type === "text")
          .filter((t) => {
            if (t.containerId) return true;
            return project.some((el) => el.boundElements?.some((be) => be.id === t.id));
          })
          .map((e) => e.id);
        const decorationSet = new Set(decorationAndCrossLinkIds);
        const roleSet = new Set([
          ...nodes,
          ...boundaries,
          ...branchArrows,
          ...crossLinks,
          ...boundTexts,
        ]);
        const decorations = project
          .filter(
            (e) => decorationSet.has(e.id) || (!roleSet.has(e.id) && !branchIds.includes(e.id)),
          )
          .filter((e) => !crossLinks.includes(e.id) && !boundaries.includes(e.id))
          .map((e) => e.id);
        return mmOk({
          nodes: Array.from(new Set(nodes)),
          branchArrows: Array.from(new Set(branchArrows)),
          crossLinks: Array.from(new Set(crossLinks)),
          boundaries: Array.from(new Set(boundaries)),
          decorations: Array.from(new Set(decorations)),
          boundTexts: Array.from(new Set(boundTexts)),
        });
      },
      getGlobalConfig: () => {
        return mmOk({
          config: {
            growthMode: runtimeContext.currentModalGrowthMode,
            autoLayoutDisabled: runtimeContext.autoLayoutDisabled,
            arrowType: runtimeContext.arrowType,
            fontsizeScale: runtimeContext.fontsizeScale,
            multicolor: runtimeContext.multicolor,
            boxChildren: runtimeContext.boxChildren,
            roundedCorners: runtimeContext.roundedCorners,
            maxWrapWidth: runtimeContext.maxWidth,
            isSolidArrow: runtimeContext.isSolidArrow,
            centerText: runtimeContext.centerText,
            fillSweep: runtimeContext.fillSweep,
            branchScale: runtimeContext.branchScale,
            baseStrokeWidth: runtimeContext.baseStrokeWidth,
            customPalette: cloneJSON(runtimeContext.customPalette),
            layoutSettings: cloneJSON(runtimeContext.layoutSettings),
          },
        });
      },
      setGlobalConfig: async ({ patch } = {}) => {
        if (!patch || typeof patch !== "object") {
          return mmErr(MMError.INVALID_ARGUMENT, "setGlobalConfig requires a patch object");
        }
        try {
          let requiresSave = false;
          if (patch.growthMode && runtimeContext.GROWTH_TYPES.includes(patch.growthMode)) {
            runtimeContext.currentModalGrowthMode = patch.growthMode;
            runtimeContext.setVal(runtimeContext.K_GROWTH, patch.growthMode);
            requiresSave = true;
          }
          if (typeof patch.autoLayoutDisabled === "boolean") {
            // This is a session-level global setting, it does not persist across restarts
            runtimeContext.autoLayoutDisabled = patch.autoLayoutDisabled;
          }
          if (patch.arrowType && runtimeContext.ARROW_TYPES.includes(patch.arrowType)) {
            runtimeContext.arrowType = patch.arrowType;
            runtimeContext.setVal(runtimeContext.K_ARROW_TYPE, patch.arrowType);
            requiresSave = true;
          }
          if (
            patch.fontsizeScale &&
            runtimeContext.FONT_SCALE_TYPES.includes(patch.fontsizeScale)
          ) {
            runtimeContext.fontsizeScale = patch.fontsizeScale;
            runtimeContext.setVal(runtimeContext.K_FONTSIZE, patch.fontsizeScale);
            requiresSave = true;
          }
          if (patch.branchScale && runtimeContext.BRANCH_SCALE_TYPES.includes(patch.branchScale)) {
            runtimeContext.branchScale = patch.branchScale;
            runtimeContext.setVal(runtimeContext.K_BRANCH_SCALE, patch.branchScale);
            requiresSave = true;
          }
          if (typeof patch.multicolor === "boolean") {
            runtimeContext.multicolor = patch.multicolor;
            runtimeContext.setVal(runtimeContext.K_MULTICOLOR, patch.multicolor);
            requiresSave = true;
          }
          if (typeof patch.boxChildren === "boolean") {
            runtimeContext.boxChildren = patch.boxChildren;
            runtimeContext.setVal(runtimeContext.K_BOX, patch.boxChildren);
            requiresSave = true;
          }
          if (typeof patch.roundedCorners === "boolean") {
            runtimeContext.roundedCorners = patch.roundedCorners;
            runtimeContext.setVal(runtimeContext.K_ROUND, patch.roundedCorners);
            requiresSave = true;
          }
          if (typeof patch.maxWrapWidth === "number") {
            runtimeContext.maxWidth = patch.maxWrapWidth;
            runtimeContext.setVal(runtimeContext.K_WIDTH, patch.maxWrapWidth);
            requiresSave = true;
          }
          if (typeof patch.isSolidArrow === "boolean") {
            runtimeContext.isSolidArrow = patch.isSolidArrow;
            runtimeContext.setVal(runtimeContext.K_ARROWSTROKE, patch.isSolidArrow);
            requiresSave = true;
          }
          if (typeof patch.centerText === "boolean") {
            runtimeContext.centerText = patch.centerText;
            runtimeContext.setVal(runtimeContext.K_CENTERTEXT, patch.centerText);
            requiresSave = true;
          }
          if (typeof patch.fillSweep === "boolean") {
            runtimeContext.fillSweep = patch.fillSweep;
            runtimeContext.setVal(runtimeContext.K_FILL_SWEEP, patch.fillSweep);
            requiresSave = true;
          }
          if (typeof patch.baseStrokeWidth === "number") {
            runtimeContext.baseStrokeWidth = patch.baseStrokeWidth;
            runtimeContext.setVal(runtimeContext.K_BASE_WIDTH, patch.baseStrokeWidth);
            requiresSave = true;
          }
          if (patch.customPalette && typeof patch.customPalette === "object") {
            runtimeContext.customPalette = {
              ...runtimeContext.customPalette,
              ...patch.customPalette,
            };
            runtimeContext.setVal(runtimeContext.K_PALETTE, runtimeContext.customPalette, true);
            requiresSave = true;
          }
          if (patch.layoutSettings && typeof patch.layoutSettings === "object") {
            // Additional layer of merging to ensure we don't accidentally erase other layout keys
            runtimeContext.layoutSettings = {
              ...runtimeContext.layoutSettings,
              ...patch.layoutSettings,
            };
            runtimeContext.setVal(runtimeContext.K_LAYOUT, runtimeContext.layoutSettings, true);
            requiresSave = true;
          }
          if (requiresSave) {
            await runtimeContext.saveSettings();
            runtimeContext.updateUI(); // Reflect changes in the sidepanel
          }
          return mmOk({ success: true });
        } catch (e) {
          return mmErr(MMError.OPERATION_FAILED, "setGlobalConfig failed", e);
        }
      },
      getConfigSchema: () => {
        const schema = {
          growthMode: { type: "string", valueset: runtimeContext.GROWTH_TYPES },
          autoLayoutDisabled: { type: "boolean" },
          arrowType: { type: "string", valueset: runtimeContext.ARROW_TYPES },
          fontsizeScale: { type: "string", valueset: runtimeContext.FONT_SCALE_TYPES },
          branchScale: { type: "string", valueset: runtimeContext.BRANCH_SCALE_TYPES },
          multicolor: { type: "boolean" },
          boxChildren: { type: "boolean" },
          roundedCorners: { type: "boolean" },
          maxWrapWidth: { type: "number" },
          isSolidArrow: { type: "boolean" },
          centerText: { type: "boolean" },
          fillSweep: { type: "boolean" },
          baseStrokeWidth: { type: "number" },
          customPalette: {
            type: "object",
            properties: {
              enabled: { type: "boolean" },
              random: { type: "boolean" },
              colors: { type: "array", items: "string (hex color)" },
            },
          },
          layoutSettings: {},
        };
        // Auto-extract boundaries and descriptions from internal layout metadata
        Object.keys(runtimeContext.LAYOUT_METADATA).forEach((key) => {
          const meta = runtimeContext.LAYOUT_METADATA[key];
          schema.layoutSettings[key] = {
            type: "number",
            default: meta.def,
            min: meta.min,
            max: meta.max,
            step: meta.step,
            description: meta.desc,
          };
        });
        return mmOk({ schema });
      },
    };
    window.MindMapBuilderAPI = API;
    console.log(
      "window.MindMapBuilderAPI initialized. For documentation visit: https://github.com/zsviczian/obsidian-excalidraw-plugin/blob/master/docs/ea-script-docs/MindMapBuilderAPI.md",
      API,
    );
  })();
}
