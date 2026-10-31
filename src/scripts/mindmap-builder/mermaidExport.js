/** @file Selected-branch Mermaid export, bound to one Builder invocation. */
import { formatMermaidNode } from "./mermaid";

/** Creates a read-only export action without sharing view state across invocations. */
export function createMermaidExport(runtimeContext) {
  /** Copies the selected node and all descendants, including folded branches and submaps. */
  const copyMapAsMermaid = async () => {
    if (!runtimeContext.isViewSet()) return;
    runtimeContext.ensureNodeSelected();
    const selected = runtimeContext.getMindmapNodeFromSelection();
    if (!selected) {
      new runtimeContext.Notice(runtimeContext.t("NOTICE_SELECT_NODE_TO_COPY"));
      return;
    }
    const all = runtimeContext.ea.getViewElements();
    const { rootId } = runtimeContext.getHierarchy(selected, all);
    const root = all.find((node) => node.id === rootId);
    const defaultMode = root?.customData?.growthMode || runtimeContext.currentModalGrowthMode;
    const lines = ["```mermaid", "mindmap"];
    const visited = new Set();
    const visit = (node, depth, inheritedMode) => {
      if (visited.has(node.id)) return;
      visited.add(node.id);
      const rawText = runtimeContext.getTextFromNode(all, node, true) || "";
      const text = rawText.trim() ? rawText : runtimeContext.t("MERMAID_EMPTY_NODE");
      lines.push(`${"  ".repeat(depth + 1)}${formatMermaidNode(text, node.type, visited.size)}`);
      const mode = node.customData?.isAdditionalRoot
        ? node.customData.growthMode || inheritedMode
        : inheritedMode;
      const children = [...runtimeContext.getChildrenNodes(node.id, all)];
      const center = { x: node.x + node.width / 2, y: node.y + node.height / 2 };
      children.sort((a, b) => {
        if (mode === "Radial") {
          return runtimeContext.getAngleFromCenter(center, { x: a.x + a.width / 2, y: a.y + a.height / 2 }) -
            runtimeContext.getAngleFromCenter(center, { x: b.x + b.width / 2, y: b.y + b.height / 2 });
        }
        if (mode === "Right-Left" && (node.id === rootId || node.customData?.isAdditionalRoot)) {
          const sideA = a.x + a.width / 2 > center.x ? 0 : 1;
          const sideB = b.x + b.width / 2 > center.x ? 0 : 1;
          if (sideA !== sideB) return sideA - sideB;
        }
        return ["Up-facing", "Down-facing", "Up-Down"].includes(mode) ? a.x - b.x : a.y - b.y;
      });
      children.forEach((child) => visit(child, depth + 1, mode));
    };
    visit(selected, 0, defaultMode);
    lines.push("```");
    const text = lines.join("\n") + "\n";
    await navigator.clipboard.writeText(text);
    new runtimeContext.Notice(runtimeContext.t("NOTICE_MERMAID_COPIED"));
    return text;
  };
  return { copyMapAsMermaid };
}
