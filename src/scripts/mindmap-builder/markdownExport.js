/**
 * @file markdownExport.js
 * @overview markdown Export implementation extracted from Mindmap Builder.
 * Context accessors retain live per-invocation state; no plugin/view singleton is introduced.
 */

/** Creates this subsystem against the invocation-owned context. */
export function createMarkdownExport(runtimeContext) {
  /**
// Copies the selected tree or branch to the clipboard as Markdown text.
// Now supports extracting Submaps into separate ## Headings referenced by ![[#Links]]
**/
  const copyMapAsText = async (cut = false, toClipboard = true) => {
    if (!runtimeContext.isViewSet()) return;
    runtimeContext.ensureNodeSelected();
    const sel = runtimeContext.getMindmapNodeFromSelection();
    if (!sel) {
      new runtimeContext.Notice(runtimeContext.t("NOTICE_SELECT_NODE_TO_COPY"));
      return;
    }
    const all = runtimeContext.ea.getViewElements();
    const info = runtimeContext.getHierarchy(sel, all);
    const isRootSelected = info.rootId === sel.id;
    const parentNode = runtimeContext.getParentNode(sel.id, all);
    // Retrieve root to determine growthMode for sorting logic
    const root = all.find((el) => el.id === info.rootId);
    const defaultMode = root?.customData?.growthMode || runtimeContext.currentModalGrowthMode;
    const elementsToDelete = [];
    const useTab = app.vault.getConfig("useTab");
    const tabSize = app.vault.getConfig("tabSize");
    const indentVal = useTab ? "\t" : " ".repeat(tabSize);
    // --- Crosslink & Block Reference Logic ---
    const branchIds = new Set(runtimeContext.getBranchElementIds(sel.id, all));
    const nodeBlockRefs = new Map(); // NodeID -> "^blockId"
    const nodeOutgoingLinks = new Map(); // NodeID -> ["text representation", ...]
    // Find arrows within this branch that are NOT structural branch arrows
    const crossLinkArrows = all.filter(
      (el) =>
        el.type === "arrow" &&
        !el.customData?.isBranch &&
        branchIds.has(el.startBinding?.elementId) &&
        branchIds.has(el.endBinding?.elementId),
    );
    const hasCrosslinks = crossLinkArrows.length > 0;
    // Use Loose List (empty lines) if crosslinks exist to support block refs, else Tight List
    const lineSeparator = hasCrosslinks ? "\n\n" : "\n";
    if (hasCrosslinks) {
      crossLinkArrows.forEach((arrow) => {
        const startId = arrow.startBinding.elementId;
        const endId = arrow.endBinding.elementId;
        // Generate block ref for destination if not exists
        if (!nodeBlockRefs.has(endId)) {
          nodeBlockRefs.set(endId, "^" + runtimeContext.ea.generateElementId().substring(0, 8));
        }
        // Record outgoing link for source
        if (!nodeOutgoingLinks.has(startId)) {
          nodeOutgoingLinks.set(startId, []);
        }
        // Check for label on the arrow
        const boundTextId = arrow.boundElements?.find((be) => be.type === "text")?.id;
        const labelTextElement = boundTextId ? all.find((el) => el.id === boundTextId) : null;
        const refString = nodeBlockRefs.get(endId);
        let linkText;
        if (labelTextElement && labelTextElement.rawText) {
          // Replace newlines with spaces for inline dataview field compatibility
          const label = labelTextElement.rawText.replace(/\n/g, " ");
          linkText = `(${label}:: [[#${refString}|*]])`;
        } else {
          linkText = `[[#${refString}|*]]`;
        }
        nodeOutgoingLinks.get(startId).push(linkText);
        if (cut) elementsToDelete.push(arrow);
      });
    }
    const submapsQueue = [];
    const buildList = (nodeId, depth = 0, isSubmapChild = false, isPrintRoot = false) => {
      const node = all.find((e) => e.id === nodeId);
      if (!node) return "";
      if (cut) {
        elementsToDelete.push(node);
        node.boundElements?.forEach((be) => {
          const boundEl = all.find((e) => e.id === be.id);
          if (boundEl) elementsToDelete.push(boundEl);
        });
        if (node.customData?.foldIndicatorId) {
          const ind = all.find((e) => e.id === node.customData.foldIndicatorId);
          if (ind) elementsToDelete.push(ind);
        }
        // Remove boundary if cutting
        if (node.customData?.boundaryId) {
          const boundary = all.find((e) => e.id === node.customData.boundaryId);
          if (boundary) elementsToDelete.push(boundary);
        }
      }
      let str = "";
      let text = runtimeContext.getTextFromNode(all, node, true);
      let ontologyStr = "";
      // Fetch ontology if it's not the absolute root, or if it's a child within a submap layout
      if (!isRootSelected || depth > 0 || isSubmapChild) {
        const incomingArrow = all.find(
          (a) => a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === nodeId,
        );
        if (incomingArrow) {
          const boundTextEl = runtimeContext.ea.getBoundTextElement(
            incomingArrow,
            true,
          ).sceneElement;
          if (boundTextEl && boundTextEl.rawText) {
            // Replace newlines with spaces so it stays on one line
            ontologyStr = boundTextEl.rawText.replace(/\n/g, " ") + ":: ";
            if (cut) elementsToDelete.push(boundTextEl);
          }
        }
      }
      // --- Append Metadata Suffixes ---
      let refSuffixes = "";
      if (nodeOutgoingLinks.has(nodeId))
        refSuffixes += ` ${nodeOutgoingLinks.get(nodeId).join(" ")}`;
      if (node.customData?.boundaryId) refSuffixes += " #boundary";
      if (nodeBlockRefs.has(nodeId)) refSuffixes += ` ${nodeBlockRefs.get(nodeId)}`;
      // --- Extract Task Info ---
      let isTask = false;
      let taskPrefix = "";
      const taskMatch = text.match(/^- \[[ xX]\] /);
      if (taskMatch) {
        isTask = true;
        taskPrefix = taskMatch[0]; // Retain "- [ ] " or "- [x] "
        text = text.substring(taskPrefix.length); // Strip it temporarily for clean assembly
      }
      // --- Submap Extraction Logic ---
      // If this node is an additional root AND it's not the immediate element we are printing the section for
      if (!isPrintRoot && node.customData?.isAdditionalRoot) {
        let submapTitle = text;
        // Clean up Image strings to use as clean anchor links
        if (submapTitle.startsWith("![[") && submapTitle.endsWith("]]")) {
          submapTitle = submapTitle.slice(3, -2).split("|")[0];
        } else if (submapTitle.startsWith("![") && submapTitle.endsWith(")")) {
          submapTitle = "Submap " + nodeId.substring(0, 4);
        }
        const linkText = `![[#${submapTitle}]]`;
        const repeatCount = Math.max(0, depth - (isRootSelected ? 1 : 0));
        let currentIndent = isSubmapChild ? indentVal.repeat(depth) : indentVal.repeat(repeatCount);
        // Inject task prefix if available
        if (isTask) {
          str += `${currentIndent}${taskPrefix}${ontologyStr}${linkText}${refSuffixes}${lineSeparator}`;
        } else {
          str += `${currentIndent}- ${ontologyStr}${linkText}${refSuffixes}${lineSeparator}`;
        }
        submapsQueue.push({
          id: nodeId,
          title: submapTitle,
        });
        return str; // Do not recurse into children here; they belong in the ## section
      }
      if (depth === 0 && isRootSelected && !isSubmapChild) {
        str += `# ${taskPrefix}${ontologyStr}${text}${refSuffixes}${lineSeparator}`;
      } else {
        const repeatCount = Math.max(0, depth - (isRootSelected ? 1 : 0));
        let currentIndent = isSubmapChild ? indentVal.repeat(depth) : indentVal.repeat(repeatCount);
        if (isTask) {
          str += `${currentIndent}${taskPrefix}${ontologyStr}${text}${refSuffixes}${lineSeparator}`;
        } else {
          str += `${currentIndent}- ${ontologyStr}${text}${refSuffixes}${lineSeparator}`;
        }
      }
      // --- Visual Sorting Logic ---
      let children = runtimeContext.getChildrenNodes(nodeId, all);
      const parentCenter = {
        x: node.x + node.width / 2,
        y: node.y + node.height / 2,
      };
      // Honor local submap modes
      const mode = node.customData?.isAdditionalRoot ? node.customData.growthMode : defaultMode;
      if (mode === "Radial") {
        children.sort((a, b) => {
          const centerA = {
            x: a.x + a.width / 2,
            y: a.y + a.height / 2,
          };
          const centerB = {
            x: b.x + b.width / 2,
            y: b.y + b.height / 2,
          };
          return (
            runtimeContext.getAngleFromCenter(parentCenter, centerA) -
            runtimeContext.getAngleFromCenter(parentCenter, centerB)
          );
        });
      } else if (mode === "Right-Left" && nodeId === info.rootId) {
        const right = [];
        const left = [];
        children.forEach((child) => {
          const childCx = child.x + child.width / 2;
          if (childCx > parentCenter.x) right.push(child);
          else left.push(child);
        });
        right.sort((a, b) => a.y - b.y);
        left.sort((a, b) => a.y - b.y);
        children = [...right, ...left];
      } else {
        children.sort((a, b) => a.y - b.y);
      }
      children.forEach((c) => {
        if (cut) {
          const arrow = all.find(
            (a) =>
              a.type === "arrow" &&
              a.customData?.isBranch &&
              a.startBinding?.elementId === nodeId &&
              a.endBinding?.elementId === c.id,
          );
          if (arrow) elementsToDelete.push(arrow);
        }
        // Children of a printRoot are not the printRoot
        str += buildList(c.id, depth + 1, isSubmapChild, false);
      });
      return str;
    };
    let md = buildList(sel.id, 0, false, true);
    // --- Process Queued Submaps ---
    const processedSubmaps = new Set();
    // Add divider if submaps exist
    if (submapsQueue.length > 0) {
      md += `\n---\n`;
    }
    while (submapsQueue.length > 0) {
      const submapObj = submapsQueue.shift();
      if (processedSubmaps.has(submapObj.id)) continue;
      processedSubmaps.add(submapObj.id);
      md += `\n## ${submapObj.title}\n`;
      const submapNode = all.find((e) => e.id === submapObj.id);
      let children = runtimeContext.getChildrenNodes(submapObj.id, all);
      const parentCenter = {
        x: submapNode.x + submapNode.width / 2,
        y: submapNode.y + submapNode.height / 2,
      };
      const mode = submapNode.customData?.growthMode || defaultMode;
      if (mode === "Radial") {
        children.sort((a, b) => {
          const centerA = {
            x: a.x + a.width / 2,
            y: a.y + a.height / 2,
          };
          const centerB = {
            x: b.x + b.width / 2,
            y: b.y + b.height / 2,
          };
          return (
            runtimeContext.getAngleFromCenter(parentCenter, centerA) -
            runtimeContext.getAngleFromCenter(parentCenter, centerB)
          );
        });
      } else if (mode === "Right-Left") {
        const right = [];
        const left = [];
        children.forEach((child) => {
          const childCx = child.x + child.width / 2;
          if (childCx > parentCenter.x) right.push(child);
          else left.push(child);
        });
        right.sort((a, b) => a.y - b.y);
        left.sort((a, b) => a.y - b.y);
        children = [...right, ...left];
      } else {
        children.sort((a, b) => a.y - b.y);
      }
      children.forEach((c) => {
        if (cut) {
          const arrow = all.find(
            (a) =>
              a.type === "arrow" &&
              a.customData?.isBranch &&
              a.startBinding?.elementId === submapObj.id &&
              a.endBinding?.elementId === c.id,
          );
          if (arrow) elementsToDelete.push(arrow);
        }
        md += buildList(c.id, 0, true, false);
      });
    }
    if (toClipboard) await navigator.clipboard.writeText(md);
    if (cut) {
      const incomingArrow = all.find(
        (a) => a.type === "arrow" && a.customData?.isBranch && a.endBinding?.elementId === sel.id,
      );
      if (incomingArrow) elementsToDelete.push(incomingArrow);
      runtimeContext.ea.deleteViewElements(elementsToDelete);
      if (parentNode) {
        const remainingChildren = runtimeContext.getChildrenNodes(
          parentNode.id,
          runtimeContext.ea.getViewElements(),
        );
        if (remainingChildren.length === 0) {
          runtimeContext.ea.copyViewElementsToEAforEditing([parentNode]);
          runtimeContext.ea.addAppendUpdateCustomData(parentNode.id, {
            isFolded: false,
            foldIndicatorId: undefined,
          });
          if (parentNode.customData?.foldIndicatorId) {
            const indicator = runtimeContext.ea
              .getViewElements()
              .find((el) => el.id === parentNode.customData.foldIndicatorId);
            if (indicator) runtimeContext.ea.deleteViewElements([indicator]);
          }
          await runtimeContext.addElementsToView({
            captureUpdate: "EVENTUALLY",
          });
        }
        runtimeContext.selectNodeInView(parentNode);
      }
      runtimeContext.triggerGlobalLayout(info.rootId);
      new runtimeContext.Notice(
        isRootSelected ? runtimeContext.t("NOTICE_MAP_CUT") : runtimeContext.t("NOTICE_BRANCH_CUT"),
      );
    } else {
      new runtimeContext.Notice(
        isRootSelected
          ? runtimeContext.t("NOTICE_MAP_COPIED")
          : runtimeContext.t("NOTICE_BRANCH_COPIED"),
      );
    }
    return md;
  };
  return { copyMapAsText };
}
