/**
 * @file nodeStyles.js
 * @overview node Styles implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */
import { fitTextContainer } from "./textContainers";

/** Creates this subsystem against the invocation-owned context. */
export function createNodeStyles(runtimeContext) {
  /**
   * Toggles the pinned state of the selected node.
   * Pinned nodes are not moved by auto-layout.
   */
  const togglePin = async () => {
    if (!runtimeContext.isViewSet()) return;
    const sel = runtimeContext.getMindmapNodeFromSelection();
    if (sel) {
      const boundTextElement = runtimeContext.ea.getBoundTextElement(sel, true)?.sceneElement;
      const newPinnedState = !(sel.customData?.isPinned === true);
      runtimeContext.ea.copyViewElementsToEAforEditing(
        boundTextElement ? [sel, boundTextElement] : [sel],
      );
      runtimeContext.ea.addAppendUpdateCustomData(sel.id, {
        isPinned: newPinnedState,
      });
      if (
        boundTextElement &&
        !newPinnedState &&
        boundTextElement.customData?.hasOwnProperty("isPinned")
      ) {
        runtimeContext.ea.addAppendUpdateCustomData(boundTextElement.id, {
          isPinned: undefined,
        });
      }
      await runtimeContext.addElementsToView({
        captureUpdate: runtimeContext.autoLayoutDisabled ? "IMMEDIATELY" : "EVENTUALLY",
      });
      if (!runtimeContext.autoLayoutDisabled) await runtimeContext.refreshMapLayout();
      runtimeContext.selectNodeInView(sel);
      runtimeContext.updateUI();
    }
  };

  const toggleCheckboxStatus = async () => {
    if (!runtimeContext.isViewSet()) return;
    let targetText = "";
    let isInputEl = false;
    let textElId = null;
    let sel = null;
    if (runtimeContext.inputEl && runtimeContext.inputEl.value.trim() !== "") {
      targetText = runtimeContext.inputEl.value;
      isInputEl = true;
    } else {
      sel = runtimeContext.getMindmapNodeFromSelection();
      if (!sel) return;
      const all = runtimeContext.ea.getViewElements();
      const info = runtimeContext.getHierarchy(sel, all);
      if (info.rootId === sel.id) return; // General rule: no effect on root node
      textElId = sel.type === "text" ? sel.id : null;
      if (!textElId && sel.boundElements) {
        const boundText = sel.boundElements.find((be) => be.type === "text");
        if (boundText) textElId = boundText.id;
      }
      if (!textElId) return;
      const textEl = all.find((el) => el.id === textElId);
      if (!textEl) return;
      targetText = textEl.rawText;
    }
    const taskRegex = /^- \[([ xX])\] (.*)/s; // Regex to catch '- [ ] ' or '- [x] ' including newlines
    const match = targetText.match(taskRegex);
    let newText = "";
    if (match) {
      const status = match[1];
      const content = match[2];
      if (status === " ") {
        newText = `- [x] ${content}`; // Complete it
      } else {
        newText = `${content}`; // Remove task
      }
    } else {
      newText = `- [ ] ${targetText}`; // Not a task -> make it a task
    }
    if (isInputEl) {
      runtimeContext.inputEl.value = newText;
      runtimeContext.updateUI();
    } else {
      const all = runtimeContext.ea.getViewElements();
      const textEl = all.find((el) => el.id === textElId);
      runtimeContext.ea.copyViewElementsToEAforEditing([textEl]);
      const eaEl = runtimeContext.ea.getElement(textEl.id);
      eaEl.rawText = newText;
      eaEl.text = newText;
      eaEl.originalText = newText;
      runtimeContext.ea.refreshTextElementSize(eaEl.id);
      await runtimeContext.addElementsToView({
        captureUpdate: runtimeContext.autoLayoutDisabled ? "IMMEDIATELY" : "EVENTUALLY",
      });
      if (eaEl.containerId) {
        const updatedContainer = runtimeContext.ea
          .getViewElements()
          .find((el) => el.id === eaEl.containerId);
        if (updatedContainer) runtimeContext.api().updateContainerSize([updatedContainer]);
      }
      if (!runtimeContext.autoLayoutDisabled) {
        const info = runtimeContext.getHierarchy(sel, runtimeContext.ea.getViewElements());
        await runtimeContext.triggerGlobalLayout(info.rootId);
      }
    }
  };

  /**
   * Toggles the selected node between an embed (![[...]]) and a link ([[...|alias]]).
   * Cleans the markdown '# ' characters when mapping the section name to the alias.
   */
  const toggleEmbedStatus = async () => {
    if (!runtimeContext.isViewSet()) return;
    const sel = runtimeContext.getMindmapNodeFromSelection();
    if (!sel) return;
    const all = runtimeContext.ea.getViewElements();
    const visualNode = sel.containerId ? all.find((el) => el.id === sel.containerId) : sel;
    const nodeText = runtimeContext.getTextFromNode(all, visualNode, true, true).trim();
    // Match: ! (optional) | [[ | NoteName#SectionName | | Alias (optional) | ]]
    const linkRegex = /^(!?)\[\[([^\]]+?#([^\]|]+))(?:\|[^\]]*)?\]\]$/;
    const match = nodeText.match(linkRegex);
    if (!match) return;
    const isEmbed = match[1] === "!";
    const linkCore = match[2];
    const sectionRef = match[3];
    let newText = "";
    if (isEmbed) {
      // Strip leading markdown heading characters (e.g. '### ') for the alias
      const alias = sectionRef.replace(/^#+\s*/, "").trim();
      newText = `[[${linkCore}|${alias}]]`;
    } else {
      newText = `![[${linkCore}]]`;
    }
    // Hack into the established edit flow
    runtimeContext.editingNodeId = sel.id;
    runtimeContext.inputEl.value = newText;
    // Preserve ontology
    const incomingArrow = all.find(
      (a) => a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === sel.id,
    );
    runtimeContext.ontologyEl.value = incomingArrow
      ? runtimeContext.ea.getBoundTextElement(incomingArrow, true)?.sceneElement?.rawText || ""
      : "";
    // Delegate the heavy lifting of completely recreating elements & mappings to commitEdit()
    await runtimeContext.commitEdit();
  };

  /**
   * Toggles a bounding box around the selected text element (node).
   * Creates a container if one doesn't exist, or removes it if it does.
   * @param {string} shape - "rectangle" | "ellipse" | "diamond"
   */
  const toggleBox = async (shape = "rectangle") => {
    if (!runtimeContext.isViewSet()) return;
    let sel = runtimeContext.getMindmapNodeFromSelection();
    if (!sel) return;
    sel = runtimeContext.ea.getBoundTextElement(sel, true).sceneElement;
    if (!sel) return;
    let oldBindId, newBindId, finalElId;
    const hasContainer = !!sel.containerId;
    const ids = hasContainer ? [sel.id, sel.containerId] : [sel.id];
    const allElements = runtimeContext.ea.getViewElements();
    const arrowsToUpdate = allElements.filter(
      (el) =>
        el.type === "arrow" &&
        (ids.includes(el.startBinding?.elementId) || ids.includes(el.endBinding?.elementId)),
    );
    if (hasContainer) {
      const containerId = (oldBindId = sel.containerId);
      finalElId = newBindId = sel.id;
      const container = allElements.find((el) => el.id === containerId);
      runtimeContext.ea.copyViewElementsToEAforEditing(arrowsToUpdate.concat(sel, container));
      const textEl = runtimeContext.ea.getElement(sel.id);
      // Transfer all custom data from the container back to the text element
      const dataToCopy = {
        ...(container.customData || {}),
      };
      runtimeContext.ea.addAppendUpdateCustomData(textEl.id, dataToCopy);
      textEl.containerId = null;
      textEl.boundElements = []; //not null because I will add bound arrows a bit further down
      runtimeContext.ea.getElement(containerId).isDeleted = true;
    } else {
      runtimeContext.ea.copyViewElementsToEAforEditing(arrowsToUpdate.concat(sel));
      const depth = runtimeContext.getHierarchy(sel, allElements)?.depth || 0;
      oldBindId = sel.id;
      let rectId;
      if (shape === "ellipse") {
        rectId = runtimeContext.ea.addEllipse(
          sel.x - runtimeContext.padding,
          sel.y - runtimeContext.padding,
          sel.width + runtimeContext.padding * 2,
          sel.height + runtimeContext.padding * 2,
        );
      } else if (shape === "diamond") {
        rectId = runtimeContext.ea.addDiamond(
          sel.x - runtimeContext.padding,
          sel.y - runtimeContext.padding,
          sel.width + runtimeContext.padding * 2,
          sel.height + runtimeContext.padding * 2,
        );
      } else {
        rectId = runtimeContext.ea.addRect(
          sel.x - runtimeContext.padding,
          sel.y - runtimeContext.padding,
          sel.width + runtimeContext.padding * 2,
          sel.height + runtimeContext.padding * 2,
        );
      }
      finalElId = newBindId = rectId;
      const rect = runtimeContext.ea.getElement(rectId);
      // Transfer all custom data from the text element to the new container
      const dataToCopy = {
        ...(sel.customData || {}),
      };
      runtimeContext.ea.addAppendUpdateCustomData(rectId, dataToCopy);
      rect.strokeColor = runtimeContext.ea.getCM(sel.strokeColor).stringRGB();
      rect.strokeWidth = runtimeContext.getStrokeWidthForDepth(depth);
      rect.roughness = runtimeContext.getAppState().currentItemRoughness;
      rect.roundness = runtimeContext.roundedCorners
        ? {
            type: 3,
          }
        : null;
      rect.backgroundColor = "transparent";
      const textEl = runtimeContext.ea.getElement(sel.id);
      textEl.containerId = rectId;
      textEl.boundElements = null;
      rect.boundElements = [
        {
          type: "text",
          id: sel.id,
        },
      ];
      rect.groupIds = sel.groupIds ? [...sel.groupIds] : [];
      const settingsRoot = runtimeContext.getSettingsRootNode(sel, allElements);
      const config = runtimeContext.getRootConfigForNode(settingsRoot);
      fitTextContainer({
        container: rect,
        textElement: textEl,
        renderedText: textEl.originalText,
        maxWidth: config.maxWrapWidth,
        padding: config.layoutSettings.CONTAINER_PADDING,
        preserveCenter: true,
        lib: ExcalidrawLib,
      });
    }
    runtimeContext.ea
      .getElements()
      .filter((el) => el.type === "arrow")
      .forEach((a) => {
        if (a.startBinding?.elementId === oldBindId) {
          a.startBinding.elementId = newBindId;
          runtimeContext.ea.getElement(newBindId).boundElements.push({
            type: "arrow",
            id: a.id,
          });
        }
        if (a.endBinding?.elementId === oldBindId) {
          a.endBinding.elementId = newBindId;
          runtimeContext.ea.getElement(newBindId).boundElements.push({
            type: "arrow",
            id: a.id,
          });
        }
      });
    runtimeContext.ea.getElement(oldBindId).boundElements = [];
    delete runtimeContext.ea.getElement(oldBindId).customData;
    await runtimeContext.addElementsToView({
      captureUpdate: runtimeContext.autoLayoutDisabled ? "IMMEDIATELY" : "EVENTUALLY",
    });
    if (!hasContainer) {
      const textElement = runtimeContext.ea.getViewElements().find((el) => el.id === sel.id);
      const idx = runtimeContext.ea.getViewElements().indexOf(textElement);
      runtimeContext.ea.moveViewElementToZIndex(textElement.containerId, idx);
    }
    if (!hasContainer) {
      runtimeContext
        .api()
        .updateContainerSize([
          runtimeContext.ea.getViewElements().find((el) => el.id === newBindId),
        ]);
    }
    runtimeContext.selectNodeInView(finalElId);
    if (!runtimeContext.autoLayoutDisabled) await runtimeContext.refreshMapLayout();
    runtimeContext.updateUI();
  };
  return { togglePin, toggleCheckboxStatus, toggleEmbedStatus, toggleBox };
}
