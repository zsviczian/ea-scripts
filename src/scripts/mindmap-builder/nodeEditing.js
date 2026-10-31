/**
 * @file nodeEditing.js
 * @overview node Editing implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */
import { fitTextContainer } from "./textContainers";

/** Creates this subsystem against the invocation-owned context. */
export function createNodeEditing(runtimeContext) {
  const startEditing = () => {
    const sel = runtimeContext.getMindmapNodeFromSelection();
    if (!sel) return;
    const all = runtimeContext.ea.getViewElements();
    const text = runtimeContext.getTextFromNode(all, sel, true, true);
    if (text.match(/\n/)) {
      new runtimeContext.Notice(
        `${runtimeContext.t("NOTICE_CANNOT_EDIT_MULTILINE")} ${runtimeContext.getActionHotkeyString(runtimeContext.ACTION_REARRANGE)}`,
        7000,
      );
      return;
    }
    const didToggle = runtimeContext.revealInputEl();
    setTimeout(
      () => {
        runtimeContext.inputEl.value = text;
        // Populate Ontology (Arrow Label)
        // Find incoming arrow
        const incomingArrow = all.find(
          (a) => a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === sel.id,
        );
        runtimeContext.ontologyEl.value =
          runtimeContext.ea.getBoundTextElement(incomingArrow, true)?.sceneElement?.rawText || "";
        runtimeContext.editingNodeId = sel.id;
        runtimeContext.updateUI();
        runtimeContext.inputEl.focus();
      },
      didToggle ? 200 : 0,
    );
  };

  const commitEdit = async () => {
    if (!runtimeContext.editingNodeId) return;
    const all = runtimeContext.ea.getViewElements();
    let targetNode = all.find((el) => el.id === runtimeContext.editingNodeId);
    if (!targetNode) return;
    // Identify visual node (container or element) for positioning
    const visualNode = targetNode.containerId
      ? all.find((el) => el.id === targetNode.containerId)
      : targetNode;
    // Identify text element within container
    let textElId = targetNode.id;
    if (targetNode.boundElements) {
      const boundText = targetNode.boundElements.find((be) => be.type === "text");
      if (boundText) textElId = boundText.id;
    }
    const textEl = all.find((el) => el.id === textElId && el.type === "text");
    // Get values from BOTH inputs
    const textInput = runtimeContext.inputEl.value;
    const ontologyInput = runtimeContext.ontologyEl.value;
    // Retrieve current text representation (raw, short path for images) to compare against input
    const currentText = runtimeContext.getTextFromNode(all, visualNode, true, true);
    // Find arrow pointing TO this node to check current ontology
    // We need this for diffing, and potentially for updating later
    const incomingArrow = all.find(
      (a) =>
        a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === targetNode.id, // Target node might be container
    );
    const currentOntology = incomingArrow
      ? runtimeContext.ea.getBoundTextElement(incomingArrow, true)?.sceneElement?.rawText || ""
      : "";
    const textChanged = textInput !== currentText;
    const ontologyChanged = ontologyInput !== currentOntology;
    // If nothing changed, exit early without modifying scene
    if (!textChanged && !ontologyChanged) {
      runtimeContext.editingNodeId = null;
      runtimeContext.inputEl.value = "";
      runtimeContext.ontologyEl.value = "";
      runtimeContext.updateUI();
      return;
    }
    const imageInfo = runtimeContext.parseImageInput(textInput);
    const embeddableUrl = runtimeContext.parseEmbeddableInput(textInput, imageInfo);
    let newType = "text";
    if (imageInfo?.isImagePath || imageInfo?.imageFile) newType = "image";
    else if (embeddableUrl) newType = "embeddable";
    // Check for type conversion (e.g. Text -> Image) or non-text update
    const isTypeChange = (textEl && newType !== "text") || (!textEl && newType !== targetNode.type);
    // Only consider it a non-text update (which requires recreation) if the text/path actually changed.
    // If only ontology changed on an image node, we treat it as a standard update (else block).
    const isNonTextUpdate = !textEl && newType === targetNode.type && textChanged;
    let containerToUpdate = null;
    if (isTypeChange || isNonTextUpdate) {
      // ---------------------------------------------------------
      // Path A: Recreate Element (Type change or Image path change)
      // ---------------------------------------------------------
      // 1. Calculate center position
      const cx = visualNode.x + visualNode.width / 2;
      const cy = visualNode.y + visualNode.height / 2;
      const info = runtimeContext.getHierarchy(visualNode, all);
      const depth = info.depth;
      let newNodeId;
      // 2. Create new element based on type
      // store/restore strokeColor (even if element type doesn't normally have a stroke color)
      const st = runtimeContext.getAppState();
      runtimeContext.ea.style.strokeColor = targetNode.strokeColor ?? st.currentItemStrokeColor;
      if (newType === "image") {
        if (imageInfo?.isImagePath) {
          newNodeId = await runtimeContext.addImage({
            pathOrFile: imageInfo.path,
            width: imageInfo.width,
            depth,
          });
          // Check for external image flag and append to link to preserve routing
          if (imageInfo.isExternalImage && newNodeId) {
            const el = runtimeContext.ea.getElement(newNodeId);
            if (el && !el.link) el.link = imageInfo.path;
          }
        } else {
          newNodeId = await runtimeContext.addImage({
            pathOrFile: imageInfo.imageFile,
            width: imageInfo.width,
            depth,
          });
        }
        const el = runtimeContext.ea.getElement(newNodeId);
        el.x = cx - el.width / 2;
        el.y = cy - el.height / 2;
      } else if (newType === "embeddable") {
        newNodeId = runtimeContext.addEmbeddableNode({
          url: embeddableUrl,
          depth,
        });
        const el = runtimeContext.ea.getElement(newNodeId);
        el.x = cx - el.width / 2;
        el.y = cy - el.height / 2;
      } else {
        // Back to Text
        if (runtimeContext.ea.style.strokeColor === "transparent")
          runtimeContext.ea.style.strokeColor = "black";
        runtimeContext.ea.style.fontFamily = st.currentItemFontFamily;
        const fontScale = runtimeContext.getFontScale(runtimeContext.fontsizeScale);
        runtimeContext.ea.style.fontSize = fontScale[Math.min(depth, fontScale.length - 1)];
        runtimeContext.ea.style.backgroundColor = "transparent";
        runtimeContext.ea.style.strokeWidth = runtimeContext.getStrokeWidthForDepth(depth);
        if (incomingArrow) {
          runtimeContext.ea.style.strokeColor = incomingArrow.strokeColor;
        }
        runtimeContext.ea.style.roughness = runtimeContext.getAppState().currentItemRoughness;
        const renderedText = await runtimeContext.parseText(textInput);
        const metrics = runtimeContext.ea.measureText(renderedText);
        const shouldWrap = metrics.width > runtimeContext.maxWidth;
        let finalWidth = Math.ceil(metrics.width);
        let finalHeight = metrics.height;
        let finalWrappedText = renderedText;
        if (shouldWrap) {
          const res = await runtimeContext.getAdjustedMaxWidth(textInput, runtimeContext.maxWidth);
          finalWidth = res.width;
          finalHeight = res.height;
          finalWrappedText = res.wrappedText;
        }
        newNodeId = runtimeContext.ea.addText(cx, cy, renderedText, {
          textAlign: "center",
          textVerticalAlign: "middle",
          box: runtimeContext.boxChildren ? "rectangle" : false,
          width: shouldWrap ? finalWidth : undefined,
          height: shouldWrap ? finalHeight : undefined,
          autoResize: runtimeContext.boxChildren ? false : !shouldWrap,
        });
        const newElement = runtimeContext.ea.getElement(newNodeId);
        containerToUpdate = runtimeContext.boxChildren ? newElement : null;
        // Explicitly overwrite raw, original and text properties to handle links correctly
        newTextElement = runtimeContext.boxChildren
          ? runtimeContext.ea.getElement(containerToUpdate.boundElements[0].id)
          : newElement;
        newTextElement.rawText = textInput;
        newTextElement.originalText = renderedText;
        newTextElement.text = finalWrappedText;
        if (!shouldWrap) {
          newTextElement.width = finalWidth;
          newTextElement.height = finalHeight;
        }
        if (containerToUpdate) {
          fitTextContainer({
            container: containerToUpdate,
            textElement: newTextElement,
            renderedText,
            maxWidth: runtimeContext.maxWidth,
            padding: runtimeContext.layoutSettings.CONTAINER_PADDING,
            preserveCenter: true,
            lib: ExcalidrawLib,
          });
        }
      }
      const newNode = runtimeContext.ea.getElement(newNodeId);
      // Scale decorations before deleting the old visual node
      runtimeContext.scaleDecorations(visualNode, newNode, all, info.rootId);
      // 3. Migrate custom data fields
      const keysToCopy = [
        "mindmapOrder",
        "isPinned",
        "growthMode",
        "autoLayoutDisabled",
        "isFolded",
        "foldIndicatorId",
        "foldState",
        "boundaryId",
        "fontsizeScale",
        "multicolor",
        "boxChildren",
        "roundedCorners",
        "maxWrapWidth",
        "isSolidArrow",
        "centerText",
        "arrowType",
        "fillSweep",
        "branchScale",
        "baseStrokeWidth",
        "layoutSettings",
      ];
      const dataToCopy = {};
      keysToCopy.forEach((k) => {
        if (visualNode.customData && visualNode.customData.hasOwnProperty(k)) {
          dataToCopy[k] = visualNode.customData[k];
        }
      });
      runtimeContext.ea.addAppendUpdateCustomData(newNodeId, dataToCopy);
      // 4. Migrate Decorations
      if (visualNode.groupIds && visualNode.groupIds.length > 0) {
        newNode.groupIds = [...visualNode.groupIds];
      }
      // 5. Rewire arrows and adjust cross-links
      const idsToReplace = [visualNode.id];
      if (textEl) idsToReplace.push(textEl.id);
      const connectedArrows = all.filter(
        (el) =>
          el.type === "arrow" &&
          (idsToReplace.includes(el.startBinding?.elementId) ||
            idsToReplace.includes(el.endBinding?.elementId)),
      );
      if (connectedArrows.length > 0) {
        runtimeContext.ea.copyViewElementsToEAforEditing(connectedArrows);
        const newBoundElements = [];
        connectedArrows.forEach((arrow) => {
          const eaArrow = runtimeContext.ea.getElement(arrow.id);
          let isConnected = false;
          // Calculate scale ratios for updating manual arrow points
          const ratioX = visualNode.width > 1 ? newNode.width / visualNode.width : 1;
          const ratioY = visualNode.height > 1 ? newNode.height / visualNode.height : 1;
          if (idsToReplace.includes(eaArrow.startBinding?.elementId)) {
            eaArrow.startBinding = {
              ...eaArrow.startBinding,
              elementId: newNodeId,
            };
            isConnected = true;
            // Scale start point relative to center
            if (eaArrow.points.length > 0) {
              const absX = arrow.x + arrow.points[0][0];
              const absY = arrow.y + arrow.points[0][1];
              const dx = absX - cx;
              const dy = absY - cy;
              const newAbsX = cx + dx * ratioX;
              const newAbsY = cy + dy * ratioY;
              eaArrow.points[0] = [
                eaArrow.points[0][0] + (newAbsX - absX),
                eaArrow.points[0][1] + (newAbsY - absY),
              ];
            }
          }
          if (idsToReplace.includes(eaArrow.endBinding?.elementId)) {
            eaArrow.endBinding = {
              ...eaArrow.endBinding,
              elementId: newNodeId,
            };
            isConnected = true;
            // --- Update Ontology for incoming arrow ---
            // Since we are rewiring, this is the arrow pointing TO the new node
            runtimeContext.addUpdateArrowLabel(eaArrow, ontologyInput);
            // Scale end point relative to center
            if (eaArrow.points.length > 0) {
              const lastIdx = eaArrow.points.length - 1;
              const absX = arrow.x + arrow.points[lastIdx][0];
              const absY = arrow.y + arrow.points[lastIdx][1];
              const dx = absX - cx;
              const dy = absY - cy;
              const newAbsX = cx + dx * ratioX;
              const newAbsY = cy + dy * ratioY;
              eaArrow.points[lastIdx] = [
                eaArrow.points[lastIdx][0] + (newAbsX - absX),
                eaArrow.points[lastIdx][1] + (newAbsY - absY),
              ];
            }
          }
          if (isConnected) {
            newBoundElements.push({
              type: "arrow",
              id: arrow.id,
            });
          }
        });
        if (newBoundElements.length > 0) {
          newNode.boundElements = [...(newNode.boundElements || []), ...newBoundElements];
        }
      }
      // 6. Remove old elements
      runtimeContext.ea.copyViewElementsToEAforEditing([visualNode]);
      runtimeContext.ea.getElement(visualNode.id).isDeleted = true;
      if (textEl && textEl.id !== visualNode.id) {
        runtimeContext.ea.copyViewElementsToEAforEditing([textEl]);
        runtimeContext.ea.getElement(textEl.id).isDeleted = true;
      }
      await runtimeContext.addElementsToView({
        captureUpdate: runtimeContext.autoLayoutDisabled ? "IMMEDIATELY" : "EVENTUALLY",
      });
      // Trigger global layout if enabled
      if (!runtimeContext.autoLayoutDisabled) {
        const newViewElements = runtimeContext.ea.getViewElements();
        const newViewNode = newViewElements.find((el) => el.id === newNodeId);
        if (newViewNode) {
          runtimeContext.selectNodeInView(newViewNode);
          const newInfo = runtimeContext.getHierarchy(newViewNode, newViewElements);
          await runtimeContext.triggerGlobalLayout(newInfo.rootId, false, true);
        }
      }
    } else {
      // ---------------------------------------------------------
      // Path B: Modify Existing Element
      // ---------------------------------------------------------
      // 1. Update Ontology (Incoming Arrow)
      // Only perform if ontology has changed and arrow exists
      if (ontologyChanged && incomingArrow) {
        runtimeContext.ea.copyViewElementsToEAforEditing([incomingArrow]);
        runtimeContext.addUpdateArrowLabel(
          runtimeContext.ea.getElement(incomingArrow.id),
          ontologyInput,
        );
      }
      // 2. Update Text Element Properties
      // Only perform if text has changed and it is a Text element (images/embeddables handled in Path A if content changes)
      if (textChanged && textEl) {
        runtimeContext.ea.copyViewElementsToEAforEditing([textEl]);
        const eaEl = runtimeContext.ea.getElement(textEl.id);
        const renderedText = await runtimeContext.parseText(textInput);
        eaEl.rawText = textInput;
        eaEl.originalText = renderedText;
        // Refresh family/size in case global settings changed, though this is optional
        runtimeContext.ea.style.fontFamily = eaEl.fontFamily;
        runtimeContext.ea.style.fontSize = eaEl.fontSize;
        const textContainer = all.find((el) => el.id === eaEl.containerId);
        if (textContainer && ["rectangle", "ellipse", "diamond"].includes(textContainer.type)) {
          runtimeContext.ea.copyViewElementsToEAforEditing([textContainer]);
          const settingsRoot = runtimeContext.getSettingsRootNode(textContainer, all);
          const config = runtimeContext.getRootConfigForNode(settingsRoot);
          fitTextContainer({
            container: runtimeContext.ea.getElement(textContainer.id),
            textElement: eaEl,
            renderedText,
            maxWidth: config.maxWrapWidth,
            padding: config.layoutSettings.CONTAINER_PADDING,
            preserveCenter: true,
            lib: ExcalidrawLib,
          });
        } else {
          const metrics = runtimeContext.ea.measureText(renderedText);
          const shouldWrap = metrics.width > runtimeContext.maxWidth;
          if (!shouldWrap) {
            eaEl.autoResize = true;
            eaEl.width = Math.ceil(metrics.width);
            eaEl.height = metrics.height;
            eaEl.text = renderedText;
          } else {
            eaEl.autoResize = false;
            const res = await runtimeContext.getAdjustedMaxWidth(textInput, runtimeContext.maxWidth);
            eaEl.width = res.width;
            eaEl.height = res.height;
            eaEl.text = res.wrappedText;
          }
        }
        runtimeContext.ea.refreshTextElementSize(eaEl.id);
      }
      // 3. Save Changes
      const hierarchyNode = textEl ? visualNode : null;
      await runtimeContext.addElementsToView({
        captureUpdate:
          !hierarchyNode || runtimeContext.autoLayoutDisabled ? "IMMEDIATELY" : "EVENTUALLY",
      }); //in case text was changed to image
      // 4. Update Container Size (if text changed and container exists)
      if (textChanged && textEl && textEl.containerId) {
        const container = runtimeContext.ea
          .getViewElements()
          .find((el) => el.id === textEl.containerId);
        if (container) {
          runtimeContext.api().updateContainerSize([container]);
        }
      }
      if (containerToUpdate) {
        runtimeContext.api().updateContainerSize([containerToUpdate]);
      }
      // 5. Trigger Layout (only if text changed, as that affects dimensions)
      if (textChanged && hierarchyNode && !runtimeContext.autoLayoutDisabled) {
        const info = runtimeContext.getHierarchy(
          hierarchyNode,
          runtimeContext.ea.getViewElements(),
        );
        await runtimeContext.triggerGlobalLayout(info.rootId);
      }
    }
    runtimeContext.editingNodeId = null;
    runtimeContext.inputEl.value = "";
    runtimeContext.ontologyEl.value = "";
  };
  return { startEditing, commitEdit };
}
