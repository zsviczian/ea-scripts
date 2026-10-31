/**
 * @file nodes.js
 * @overview nodes implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */
import { fitTextContainer } from "./textContainers";

/** Creates this subsystem against the invocation-owned context. */
export function createNodes(runtimeContext) {
  const addEmbeddableNode = ({ px = 0, py = 0, url, depth }) => {
    isWikiLink = url.startsWith("[[");
    const width = isWikiLink
      ? depth === 0
        ? runtimeContext.EMBEDED_OBJECT_WIDTH_ROOT
        : runtimeContext.EMBEDED_OBJECT_WIDTH_CHILD
      : runtimeContext.EMBEDED_OBJECT_WIDTH_CHILD;
    const height = isWikiLink ? width / 2 : 0; // Height 0 triggers auto-calculation based on aspect ratio
    const embeddableId = runtimeContext.ea.addEmbeddable(px, py, width, height, url);
    if (isWikiLink) {
      runtimeContext.ea.getElement(embeddableId).scale = depth === 0 ? [0.5, 0.5] : [0.3, 0.3];
    }
    return embeddableId;
  };

  const addImage = async ({
    pathOrFile,
    width,
    leftFacing = false,
    x = 0,
    y = 0,
    depth = 0,
  } = {}) => {
    const newNodeId = await runtimeContext.ea.addImage(x, y, pathOrFile);
    const el = runtimeContext.ea.getElement(newNodeId);
    const targetWidth =
      width ||
      (depth === 0
        ? runtimeContext.EMBEDED_OBJECT_WIDTH_ROOT
        : runtimeContext.EMBEDED_OBJECT_WIDTH_CHILD);
    const ratio = el.width / el.height;
    el.width = targetWidth;
    el.height = targetWidth / ratio;
    if (leftFacing) el.x = x - el.width;
    return newNodeId;
  };

  /**
   * Initializes the customData for a new Root node with the current global settings.
   */
  const initializeRootCustomData = (nodeId) => {
    runtimeContext.ea.addAppendUpdateCustomData(nodeId, {
      presetName: runtimeContext.activePresetName,
      growthMode: runtimeContext.currentModalGrowthMode,
      autoLayoutDisabled: false,
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
      customPalette: JSON.parse(JSON.stringify(runtimeContext.customPalette
        || { enabled: false, random: false, colors: [] })),
      layoutSettings: JSON.parse(JSON.stringify(runtimeContext.layoutSettings)),
    });
  };

  const addNode = async (
    text,
    follow = false,
    skipFinalLayout = false,
    batchModeAllElements = null,
    batchModeParent = null,
    pos = null,
    ontology = null,
    nodeShape = null,
  ) => {
    if (!runtimeContext.isViewSet()) return;
    if (!text || text.trim() === "") return;
    const preGenTextId = runtimeContext.ea.generateElementId();
    if (text.includes("__NODE_LINK_PLACEHOLDER__")) {
      const file = app.workspace.getActiveFile();
      const fileName = file ? file.basename : "";
      const linkStr = `[[${fileName}#^group=${preGenTextId}|${runtimeContext.nodeLinkAlias}]]`;
      text = text.replace("__NODE_LINK_PLACEHOLDER__", linkStr);
    }
    const st = runtimeContext.getAppState();
    const isBatchMode = batchModeAllElements !== null;
    let allElements = batchModeAllElements || runtimeContext.ea.getViewElements();
    let parent = batchModeParent;
    // custom parent is a non-mindmap node selected by the user to add a child to
    // custom parents need to receive relevant mindmap customData later during the addNode process
    let usingCustomParent = false;
    if (!isBatchMode) {
      parent = runtimeContext.getMindmapNodeFromSelection();
      if (!parent) {
        parent = runtimeContext.ea.getViewSelectedElement();
        usingCustomParent = !!parent;
      }
      if (parent?.containerId) {
        parent = allElements.find((el) => el.id === parent.containerId);
      }
      if (parent && parent.customData?.isFolded) {
        await runtimeContext.toggleFold("L0");
        allElements = runtimeContext.ea.getViewElements();
        parent = allElements.find((el) => el.id === parent.id);
      }
    }
    let newNodeId;
    let arrowId;
    // --- Image Detection ---
    const imageInfo = runtimeContext.parseImageInput(text);
    const embeddableUrl = runtimeContext.parseEmbeddableInput(text, imageInfo);
    const defaultNodeColor = runtimeContext.ea.getCM(st.viewBackgroundColor).invert().stringHEX({
      alpha: false,
    });
    let depth = 0,
      nodeColor = defaultNodeColor,
      rootId,
      nextSiblingOrder = 0;
    let settingsRoot = null;
    let rootCfgForAdd = null;
    if (parent) {
      const siblings = runtimeContext.getChildrenNodes(parent.id, allElements);
      nextSiblingOrder = Math.max(0, ...siblings.map(runtimeContext.getMindmapOrder)) + 1;
      settingsRoot =
        runtimeContext.getSettingsRootNode(parent, allElements) ||
        allElements.find((e) => e.id === runtimeContext.getHierarchy(parent, allElements).rootId);
      rootId = settingsRoot?.id;
      rootCfgForAdd = runtimeContext.getRootConfigForNode(settingsRoot);
      const parentDepthFromSettingsRoot = runtimeContext.getDepthFromAncestor(
        parent.id,
        rootId,
        allElements,
      );
      depth = parentDepthFromSettingsRoot + 1;
      const rootEl = settingsRoot;
      if (depth === 1) {
        if (rootCfgForAdd.multicolor) {
          const existingColors = runtimeContext
            .getChildrenNodes(parent.id, allElements)
            .map((n) => n.strokeColor);
          nodeColor = runtimeContext.getDynamicColor(existingColors);
        } else {
          nodeColor = rootEl.strokeColor;
        }
      } else {
        if (parent.type === "image" || parent.type === "embeddable") {
          const incomingArrow = allElements.find(
            (a) =>
              a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === parent.id,
          );
          nodeColor = incomingArrow
            ? incomingArrow.strokeColor
            : parent.strokeColor && parent.strokeColor.toLowerCase() !== "transparent"
              ? parent.strokeColor
              : defaultNodeColor;
        } else {
          nodeColor = parent.strokeColor;
        }
      }
      const effectiveMulticolor = rootCfgForAdd?.multicolor ?? runtimeContext.multicolor;
      const effectiveIsSolidArrow = rootCfgForAdd?.isSolidArrow ?? runtimeContext.isSolidArrow;
      // If multicolor is disabled AND "Use scene stroke style" is enabled (!effectiveIsSolidArrow)
      if (!effectiveMulticolor && !effectiveIsSolidArrow) {
        const parentStrokeColor = (parent.strokeColor || "transparent").toLowerCase();
        const isTransparent = parentStrokeColor === "transparent";
        let isSameAsBg = false;
        if (!isTransparent) {
          const parentColorCM = runtimeContext.ea.getCM(parent.strokeColor);
          const bgColorCM = runtimeContext.ea.getCM(st.viewBackgroundColor);
          if (parentColorCM && bgColorCM && parentColorCM.stringHEX() === bgColorCM.stringHEX()) {
            isSameAsBg = true;
          }
        }
        // If the parent's stroke is transparent or matches the view background,
        // invert the scene color for the new node and branch
        if (isTransparent || isSameAsBg) {
          nodeColor = runtimeContext.ea
            .getCM(st.viewBackgroundColor)
            .invert()
            .stringHEX({ alpha: false });
        }
      }
    }
    const fontScale = runtimeContext.getFontScale(
      rootCfgForAdd?.fontsizeScale ?? runtimeContext.fontsizeScale,
    );
    if (!isBatchMode) runtimeContext.ea.clear();
    runtimeContext.ea.style.fontFamily = st.currentItemFontFamily;
    runtimeContext.ea.style.fontSize = fontScale[Math.min(depth, fontScale.length - 1)];
    runtimeContext.ea.style.roundness =
      (rootCfgForAdd?.roundedCorners ?? runtimeContext.roundedCorners)
        ? {
            type: 3,
          }
        : null;
    const effectiveMaxWrap = rootCfgForAdd?.maxWrapWidth ?? runtimeContext.maxWidth;
    const maxTextWidth = depth === 0 ? Math.max(400, effectiveMaxWrap) : effectiveMaxWrap;
    const containerPadding = rootCfgForAdd?.layoutSettings?.CONTAINER_PADDING
      ?? runtimeContext.layoutSettings.CONTAINER_PADDING;
    let curMaxW = maxTextWidth;
    let renderedText = text;
    let metrics = {
      w: 0,
      h: 0,
    };
    let shouldWrap = false;
    let curMaxH = 0;
    if (!imageInfo?.isImagePath && !imageInfo?.imageFile && !embeddableUrl) {
      renderedText = (await runtimeContext.parseText(text)) ?? text;
      metrics = runtimeContext.ea.measureText(renderedText);
      shouldWrap = metrics.width > curMaxW;
      curMaxH = metrics.height;
      if (shouldWrap) {
        const res = await runtimeContext.getAdjustedMaxWidth(text, curMaxW);
        curMaxW = res.width;
        curMaxH = res.height;
      }
    }
    if (!parent) {
      runtimeContext.ea.style.strokeColor = runtimeContext.multicolor
        ? defaultNodeColor
        : st.currentItemStrokeColor;
      if (imageInfo?.isImagePath) {
        newNodeId = await addImage({
          pathOrFile: imageInfo.path,
          width: imageInfo.width,
          depth,
        });
        // Attach the URL to the element's link so we can trace it back
        if (imageInfo.isExternalImage && newNodeId) {
          const el = runtimeContext.ea.getElement(newNodeId);
          if (el && !el.link) el.link = imageInfo.path;
        }
      } else if (imageInfo?.imageFile) {
        newNodeId = await addImage({
          pathOrFile: imageInfo.imageFile,
          width: imageInfo.width,
          depth,
        });
      } else if (embeddableUrl) {
        newNodeId = addEmbeddableNode({
          url: embeddableUrl,
          depth: 0,
        });
      } else {
        runtimeContext.ea.style.fillStyle = "solid";
        runtimeContext.ea.style.backgroundColor = st.viewBackgroundColor;
        runtimeContext.ea.style.strokeWidth = runtimeContext.getStrokeWidthForDepth(0);
        runtimeContext.ea.style.roughness = runtimeContext.getAppState().currentItemRoughness;
        newNodeId = runtimeContext.ea.addText(
          0,
          0,
          text,
          {
            box: nodeShape ?? "rectangle",
            boxPadding: containerPadding,
            textAlign: "center",
            textVerticalAlign: "middle",
            // Use a distinct color representation so the frame can be recolored separately from text
            boxStrokeColor: runtimeContext.ea
              .getCM(runtimeContext.ea.style.strokeColor)
              .stringRGB(),
            // An explicit width prevents EA's rectangular box shortcut from
            // wrapping/shrinking an ellipse or diamond before we size it.
            width: shouldWrap ? curMaxW : Math.ceil(metrics.width),
            height: curMaxH,
            autoResize: !shouldWrap,
          },
          preGenTextId,
        );
        fitTextContainer({
          container: runtimeContext.ea.getElement(newNodeId),
          textElement: runtimeContext.ea.getElement(preGenTextId),
          renderedText,
          maxWidth: maxTextWidth,
          padding: containerPadding,
          lib: ExcalidrawLib,
        });
        runtimeContext.ea.style.backgroundColor = "transparent";
      }
      initializeRootCustomData(newNodeId);
      rootId = newNodeId;
    } else {
      runtimeContext.ea.style.strokeColor = nodeColor;
      const rootEl = allElements.find((e) => e.id === rootId);
      const rootBox = runtimeContext.getNodeBox(rootEl, allElements);
      const mode =
        rootCfgForAdd?.growthMode ||
        rootEl.customData?.growthMode ||
        runtimeContext.currentModalGrowthMode;
      const rootCenter = {
        x: rootBox.minX + rootBox.width / 2,
        y: rootBox.minY + rootBox.height / 2,
      };
      const parentBox = runtimeContext.getNodeBox(parent, allElements);
      // Determine direction for initial offset to prevent visual jumping
      const isVerticalMode = ["Up-facing", "Down-facing", "Up-Down"].includes(mode);
      let targetSide = 1; // 1 = Right/Down, -1 = Left/Up
      if (depth === 1) {
        if (mode === "Left-facing" || mode === "Up-facing") targetSide = -1;
        else if (mode === "Right-facing" || mode === "Down-facing") targetSide = 1;
        else if (mode === "Right-Left" || mode === "Up-Down") {
          const siblings = runtimeContext.getChildrenNodes(parent.id, allElements);
          const idx = siblings.length; // Index of the new node being added
          if (idx < 2) targetSide = 1;
          else if (idx < 4) targetSide = -1;
          else targetSide = idx % 2 === 0 ? 1 : -1;
        } else {
          // Default to parent side or Right for Radial/Fallback layouts
          if (isVerticalMode) {
            const parentCenterY = parentBox.minY + parentBox.height / 2;
            targetSide = parentCenterY > rootCenter.y ? 1 : -1;
          } else {
            const parentCenterX = parentBox.minX + parentBox.width / 2;
            targetSide = parentCenterX > rootCenter.x ? 1 : -1;
          }
        }
      } else {
        // Deep nodes follow parent's side
        if (isVerticalMode) {
          const parentCenterY = parentBox.minY + parentBox.height / 2;
          targetSide = parentCenterY > rootCenter.y ? 1 : -1;
        } else {
          const parentCenterX = parentBox.minX + parentBox.width / 2;
          targetSide = parentCenterX > rootCenter.x ? 1 : -1;
        }
      }
      let side = targetSide;
      let px = parentBox.minX,
        py = parentBox.minY;
      if (isVerticalMode) {
        const offset = side === 1 ? rootBox.height * 2 : -rootBox.height;
        px = parentBox.minX + parentBox.width / 2 - (shouldWrap ? curMaxW : metrics.width) / 2;
        py = parentBox.minY + offset;
        // If pos is provided (e.g. from Add Sibling), override placement.
        // This maintains the "same side" logic because the originator's X is used.
        if (!runtimeContext.autoLayoutDisabled && pos) {
          px = pos.x;
          py = pos.y;
          side = py + metrics.height / 2 > rootCenter.y ? 1 : -1;
        } else if (!runtimeContext.autoLayoutDisabled) {
          // Ensure new node is placed below existing siblings to preserve visual order
          const siblings = runtimeContext.getChildrenNodes(parent.id, allElements);
          if (siblings.length > 0) {
            const sortedSiblings = siblings.sort((a, b) => a.x - b.x);
            const lastSibling = sortedSiblings[sortedSiblings.length - 1];
            const lastSiblingBox = runtimeContext.getNodeBox(lastSibling, allElements);
            px = lastSiblingBox.minX + lastSiblingBox.width + runtimeContext.layoutSettings.GAP_Y;
            py =
              parentBox.minY +
              (side === 1
                ? parentBox.height + runtimeContext.layoutSettings.GAP_X
                : -runtimeContext.layoutSettings.GAP_X - metrics.height);
          }
        } else if (runtimeContext.autoLayoutDisabled) {
          const manualGapY = Math.round(
            parentBox.height * runtimeContext.layoutSettings.MANUAL_GAP_MULTIPLIER,
          );
          const jitterX = (Math.random() - 0.5) * runtimeContext.layoutSettings.MANUAL_JITTER_RANGE;
          const jitterY = (Math.random() - 0.5) * runtimeContext.layoutSettings.MANUAL_JITTER_RANGE;
          px = parentBox.minX + parentBox.width / 2 - metrics.width / 2 + jitterX;
          py =
            side === 1
              ? parentBox.minY + parentBox.height + manualGapY + jitterY
              : parentBox.minY - manualGapY - metrics.height + jitterY;
        }
      } else {
        const offset = mode === "Radial" || side === 1 ? rootBox.width * 2 : -rootBox.width;
        px = parentBox.minX + offset;
        py = parentBox.minY;
        // If pos is provided (e.g. from Add Sibling), override placement.
        if (!runtimeContext.autoLayoutDisabled && pos) {
          px = pos.x;
          py = pos.y;
          side = px + (shouldWrap ? curMaxW : metrics.width) / 2 > rootCenter.x ? 1 : -1;
        } else if (!runtimeContext.autoLayoutDisabled) {
          // Ensure new node is placed below existing siblings to preserve visual order
          const siblings = runtimeContext.getChildrenNodes(parent.id, allElements);
          if (siblings.length > 0) {
            const sortedSiblings = siblings.sort((a, b) => a.y - b.y);
            const lastSibling = sortedSiblings[sortedSiblings.length - 1];
            const lastSiblingBox = runtimeContext.getNodeBox(lastSibling, allElements);
            py = lastSiblingBox.minY + lastSiblingBox.height + runtimeContext.layoutSettings.GAP_Y;
          }
        } else if (runtimeContext.autoLayoutDisabled) {
          const manualGapX = Math.round(
            parentBox.width * runtimeContext.layoutSettings.MANUAL_GAP_MULTIPLIER,
          );
          const jitterX = (Math.random() - 0.5) * runtimeContext.layoutSettings.MANUAL_JITTER_RANGE;
          const jitterY = (Math.random() - 0.5) * runtimeContext.layoutSettings.MANUAL_JITTER_RANGE;
          const nodeW = shouldWrap ? curMaxW : metrics.width;
          px =
            side === 1
              ? parentBox.minX + parentBox.width + manualGapX + jitterX
              : parentBox.minX - manualGapX - nodeW + jitterX;
          py = parentBox.minY + parentBox.height / 2 - metrics.height / 2 + jitterY;
        }
      }
      const effectiveCenterText = rootCfgForAdd?.centerText ?? runtimeContext.centerText;
      const effectiveBoxChildren = rootCfgForAdd?.boxChildren ?? runtimeContext.boxChildren;
      const effectiveArrowType = rootCfgForAdd?.arrowType ?? runtimeContext.arrowType;
      const effectiveIsSolidArrow = rootCfgForAdd?.isSolidArrow ?? runtimeContext.isSolidArrow;
      const effectiveBranchScale = rootCfgForAdd?.branchScale ?? runtimeContext.branchScale;
      const effectiveBaseStrokeWidth =
        rootCfgForAdd?.baseStrokeWidth ?? runtimeContext.baseStrokeWidth;
      const textAlign = effectiveCenterText
        ? "center"
        : isVerticalMode
          ? "center"
          : side === 1
            ? "left"
            : "right";
      const boxShape = nodeShape ?? (effectiveBoxChildren ? "rectangle" : false);
      if (imageInfo?.isImagePath) {
        newNodeId = await addImage({
          pathOrFile: imageInfo.path,
          width: imageInfo.width,
          leftFacing: side === -1 && !runtimeContext.autoLayoutDisabled,
          x: px,
          y: py,
          depth,
        });
        // Attach the URL to the element's link so we can trace it back
        if (imageInfo.isExternalImage && newNodeId) {
          const el = runtimeContext.ea.getElement(newNodeId);
          if (el && !el.link) el.link = imageInfo.path;
        }
      } else if (imageInfo?.imageFile) {
        newNodeId = await addImage({
          pathOrFile: imageInfo.imageFile,
          width: imageInfo.width,
          leftFacing: side === -1 && !runtimeContext.autoLayoutDisabled,
          x: px,
          y: py,
          depth,
        });
      } else if (embeddableUrl) {
        newNodeId = addEmbeddableNode({
          px,
          py,
          url: embeddableUrl,
          depth,
        });
        const el = runtimeContext.ea.getElement(newNodeId);
        if (side === -1 && !runtimeContext.autoLayoutDisabled) el.x = px - el.width;
      } else {
        runtimeContext.ea.style.strokeWidth = runtimeContext.calculateStrokeWidth(
          depth,
          effectiveBaseStrokeWidth,
          effectiveBranchScale,
        );
        runtimeContext.ea.style.roughness = runtimeContext.getAppState().currentItemRoughness;
        newNodeId = runtimeContext.ea.addText(
          px,
          py,
          text,
          {
            box: boxShape,
            boxPadding: containerPadding,
            textAlign,
            textVerticalAlign: "middle",
            width: shouldWrap ? curMaxW : boxShape ? Math.ceil(metrics.width) : undefined,
            height: boxShape || shouldWrap ? curMaxH : undefined,
            autoResize: !shouldWrap,
          },
          preGenTextId,
        );
        if (boxShape) {
          fitTextContainer({
            container: runtimeContext.ea.getElement(newNodeId),
            textElement: runtimeContext.ea.getElement(preGenTextId),
            renderedText,
            maxWidth: maxTextWidth,
            padding: containerPadding,
            lib: ExcalidrawLib,
          });
        }
      }
      if (depth === 1) {
        runtimeContext.ea.addAppendUpdateCustomData(newNodeId, {
          mindmapNew: !!pos ? false : true, // if position is provided a sibling is being added to a defined spot in the layout
          mindmapOrder: nextSiblingOrder,
        });
      } else {
        runtimeContext.ea.addAppendUpdateCustomData(newNodeId, {
          mindmapOrder: nextSiblingOrder,
        });
      }
      if (!runtimeContext.ea.getElement(parent.id)) {
        runtimeContext.ea.copyViewElementsToEAforEditing([parent]);
        parent = runtimeContext.ea.getElement(parent.id);
      }
      // if the custom parent is already in a hierarchy, then formally make it the next sibling
      if (depth > 1 && usingCustomParent && !parent.customData?.mindmapOrder) {
        runtimeContext.ea.addAppendUpdateCustomData(parent.id, {
          mindmapOrder: nextSiblingOrder,
        });
      }
      // else make the customParent the root of the new mindmap
      if (
        (depth === 0 || usingCustomParent) &&
        !parent.customData?.growthMode &&
        !parent.customData?.mindmapOrder
      ) {
        initializeRootCustomData(parent.id);
      }
      if (
        (parent.type === "image" || parent.type === "embeddable") &&
        typeof parent.customData?.mindmapOrder === "undefined"
      ) {
        runtimeContext.ea.addAppendUpdateCustomData(parent.id, {
          mindmapOrder: 0,
        });
      }
      runtimeContext.ea.style.strokeWidth = runtimeContext.calculateStrokeWidth(
        depth,
        effectiveBaseStrokeWidth,
        effectiveBranchScale,
      );
      runtimeContext.ea.style.roughness = runtimeContext.getAppState().currentItemRoughness;
      runtimeContext.ea.style.strokeStyle = effectiveIsSolidArrow
        ? "solid"
        : runtimeContext.getAppState().currentItemStrokeStyle;
      // Initial arrow creation (placeholder points)
      const startPoint = [
        parentBox.minX + parentBox.width / 2,
        parentBox.minY + parentBox.height / 2,
      ];
      arrowId = runtimeContext.ea.addArrow([startPoint, startPoint], {
        startObjectId: parent.id,
        endObjectId: newNodeId,
        startArrowHead: null,
        endArrowHead: null,
      });
      const eaArrow = runtimeContext.ea.getElement(arrowId);
      // Initialize Roundness based on arrow type
      if (effectiveArrowType === "curved") {
        eaArrow.roundness = {
          type: 2,
        };
      } else {
        eaArrow.roundness = null;
      }
      runtimeContext.ea.addAppendUpdateCustomData(arrowId, {
        isBranch: true,
      });
      if (ontology) {
        runtimeContext.addUpdateArrowLabel(eaArrow, ontology);
      }
      if (!runtimeContext.groupBranches && parent.groupIds?.length > 0) {
        const mindmapIds = runtimeContext.getBranchElementIds(
          parent.id,
          runtimeContext.ea.getViewElements(),
        );
        const { structuralGroupId } = runtimeContext.getStructuralGroupForNode(
          mindmapIds,
          allElements,
          rootId,
        );
        if (structuralGroupId) {
          const newNode = runtimeContext.ea.getElement(newNodeId);
          const newArrow = runtimeContext.ea.getElement(arrowId);
          if (newNode) newNode.groupIds = [structuralGroupId];
          if (newArrow) newArrow.groupIds = [structuralGroupId];
        }
      }
    }
    if (isBatchMode) {
      return runtimeContext.ea.getElement(newNodeId);
    }
    const hasImage = !!imageInfo?.imageFile || imageInfo?.isImagePath;
    await runtimeContext.addElementsToView({
      repositionToCursor: !parent,
      save: hasImage,
      captureUpdate: "EVENTUALLY",
    });
    if (rootId && (runtimeContext.autoLayoutDisabled || skipFinalLayout) && parent) {
      const allEls = runtimeContext.ea.getViewElements();
      const node = allEls.find((el) => el.id === newNodeId);
      const arrow = allEls.find(
        (a) =>
          a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === newNodeId,
      );
      runtimeContext.ea.copyViewElementsToEAforEditing(
        runtimeContext.groupBranches ? allEls : arrow ? [arrow] : [],
      );
      if (arrow) {
        const parentCenterX = parent.x + parent.width / 2;
        const childCenterX = node.x + node.width / 2;
        const isChildRight = childCenterX > parentCenterX;
        const sX = isChildRight ? parent.x + parent.width : parent.x;
        const sY = parent.y + parent.height / 2;
        const eX = isChildRight ? node.x : node.x + node.width;
        const eY = node.y + node.height / 2;
        runtimeContext.configureArrow({
          arrowId: arrow.id,
          isChildRight,
          startId: parent.id,
          endId: node.id,
          coordinates: {
            sX,
            sY,
            eX,
            eY,
          },
        });
      }
      if (runtimeContext.groupBranches) {
        runtimeContext.ea.getElements().forEach((el) => {
          if (el.groupIds) {
            el.groupIds = el.groupIds.filter((gid) => !runtimeContext.isMindmapGroup(gid, allEls));
          }
        });
        const l1Nodes = runtimeContext.getChildrenNodes(rootId, allEls);
        l1Nodes.forEach((l1) => runtimeContext.applyRecursiveGrouping(l1.id, allEls));
      } else {
        const { l1AncestorId } = runtimeContext.getHierarchy(parent, allEls);
        const bIds = runtimeContext.getBranchElementIds(l1AncestorId, allEls);
        const existingGroupedEl = allEls.find(
          (el) =>
            bIds.includes(el.id) &&
            el.id !== newNodeId &&
            el.id !== arrowId &&
            runtimeContext.getStructuralGroup(el, allEls, rootId),
        );
        const commonGroupId = existingGroupedEl
          ? runtimeContext.getStructuralGroup(existingGroupedEl, allEls, rootId)
          : null;
        if (commonGroupId) {
          const newIds = [newNodeId, arrowId].filter(Boolean);
          runtimeContext.ea.copyViewElementsToEAforEditing(
            allEls.filter((el) => newIds.includes(el.id)),
          );
          newIds.forEach((id) => {
            const el = runtimeContext.ea.getElement(id);
            if (el) el.groupIds = [commonGroupId];
          });
        }
      }
      await runtimeContext.addElementsToView({
        captureUpdate: "EVENTUALLY",
      });
    }
    const finalNode = runtimeContext.ea.getViewElements().find((el) => el.id === newNodeId);
    if (follow || !parent) {
      runtimeContext.selectNodeInView(finalNode);
    } else if (parent) {
      runtimeContext.selectNodeInView(parent);
    }
    if (!parent) {
      runtimeContext.zoomToFit();
    }
    runtimeContext.mostRecentlyAddedNodeID = finalNode.id;
    runtimeContext.focusInputEl();
    await runtimeContext.triggerGlobalLayout(rootId);
    return finalNode;
  };
  return { addEmbeddableNode, addImage, initializeRootCustomData, addNode };
}
