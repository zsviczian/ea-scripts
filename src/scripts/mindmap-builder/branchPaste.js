/** @file branchPaste.js
 * @overview Native element-preserving paste followed by Builder branch attachment.
 */
import {
  analyzeBranchClipboard,
  markBranchClipboard,
  remapBranchMetadata,
} from "./branchClipboard";
import { createPasteMetadataCleanup } from "./pasteMetadata.js";

/** Owns one native paste at a time, including its completion subscription and cancellation. */
export function createBranchPaste(ctx) {
  let pending = null;
  const metadata = createPasteMetadataCleanup();
  const cancelBranchPaste = () => pending?.cancel();
  const disposeBranchPaste = () => {
    cancelBranchPaste();
    metadata.dispose();
  };
  ctx.ea.registerCleanup?.(disposeBranchPaste);
  const watchPasteMetadata = () => metadata.watch(ctx.api());
  watchPasteMetadata();
  const isBranchPasteBusy = () => pending !== null;

  const pasteBranch = async (payload, parent) => {
    const analysis = analyzeBranchClipboard(payload);
    if (analysis.kind === "none") return false;
    if (pending) return true;
    if (analysis.kind === "invalid") {
      new ctx.Notice(ctx.t("NOTICE_BRANCH_PASTE_INVALID"));
      return true;
    }
    const view = ctx.ea.targetView;
    const api = ctx.api();
    const filePath = view.file?.path;
    const win = view.ownerWindow;
    const marker = `__mindmapPaste_${ctx.ea.generateElementId()}`;
    const transport = markBranchClipboard(payload, analysis.elements, marker);
    const sources = new Map(analysis.elements.map((e) => [e.id, e]));
    const op = { cancelled: false, cancel: () => {}, transportActive: true, idMap: new Map() };
    pending = op;
    const alive = () =>
      !op.cancelled &&
      ctx.isViewSet() &&
      ctx.ea.sidepanelTab &&
      ctx.ea.targetView === view &&
      view.file?.path === filePath &&
      ctx.api() === api &&
      !api.isDestroyed;
    let pasted = [];
    // A new user gesture cancels attachment before another action can share the EA workbench.
    const gestureDocuments = new Set(
      [view.ownerDocument, ctx.sidepanelWindow?.document].filter(Boolean),
    );
    gestureDocuments.forEach((doc) =>
      doc.addEventListener?.("pointerdown", cancelBranchPaste, true),
    );
    try {
      metadata.track(api, marker, op);
      if (!alive() || api.getAppState().viewModeEnabled || api.getAppState().editingTextElement)
        throw new Error("paste unavailable");
      // Validate the destination chain before insertion; never attach to a malformed graph.
      if (parent) {
        const all = ctx.ea.getViewElements();
        const seen = new Set();
        let cursor = parent;
        while (cursor) {
          if (seen.has(cursor.id)) throw new Error("cyclic destination");
          seen.add(cursor.id);
          const incoming = all.filter(
            (e) =>
              e.type === "arrow" && e.customData?.isBranch && e.endBinding?.elementId === cursor.id,
          );
          if (incoming.length > 1) throw new Error("multiple destination parents");
          cursor = incoming.length
            ? all.find((e) => e.id === incoming[0].startBinding?.elementId)
            : null;
        }
      }
      const container = view.contentEl.querySelector(".excalidraw");
      const canvas =
        container?.querySelector("canvas.excalidraw__canvas.interactive") ??
        container?.querySelector("canvas");
      if (!container || !canvas) throw new Error("canvas unavailable");
      const rect = canvas.getBoundingClientRect();
      let point = null;
      for (const [rx, ry] of [
        [0.5, 0.5],
        [0.75, 0.5],
        [0.25, 0.5],
        [0.5, 0.75],
      ]) {
        const x = rect.left + rect.width * rx,
          y = rect.top + rect.height * ry;
        if (view.ownerDocument.elementFromPoint(x, y) === canvas) {
          point = { x, y };
          break;
        }
      }
      if (!point) throw new Error("canvas obscured");
      ctx.linkSuggester?.close();
      container.focus({ preventScroll: true });
      // Update native paste's cursor without firing a canvas pointer gesture or changing tools.
      container.dispatchEvent(
        new win.PointerEvent("pointermove", {
          bubbles: true,
          clientX: point.x,
          clientY: point.y,
          pointerType: "mouse",
        }),
      );
      const data = new win.DataTransfer();
      data.setData("text/plain", JSON.stringify(transport));
      const event = new win.ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      });
      pasted = await new Promise((resolve, reject) => {
        let unsubscribe = () => {};
        let timer;
        let settled = false;
        const finish = (elements, error) => {
          if (settled) return;
          settled = true;
          unsubscribe();
          win.clearTimeout(timer);
          if (error) reject(error);
          else resolve(elements);
        };
        op.cancel = () => {
          op.cancelled = true;
          finish([], new Error("paste cancelled"));
        };
        unsubscribe = api.onChange((elements) => {
          if (!alive()) {
            op.cancel();
            return;
          }
          const inserted = elements.filter((e) => !e.isDeleted && e.customData?.[marker]);
          if (inserted.length === transport.elements.length) finish(inserted);
        });
        timer = win.setTimeout(() => finish([], new Error("native paste timeout")), 5000);
        try {
          container.dispatchEvent(event);
        } catch (error) {
          finish([], error);
        }
      });
      op.cancel = () => {
        op.cancelled = true;
      };
      if (!alive()) throw new Error("drawing changed");
      const idMap = (op.idMap = new Map(pasted.map((e) => [e.customData[marker], e.id])));
      if (idMap.size !== transport.elements.length) throw new Error("ambiguous pasted IDs");
      const all = ctx.ea.getViewElements();
      const destination = parent ? all.find((e) => e.id === parent.id && !e.isDeleted) : null;
      if (parent && !destination) throw new Error("destination removed");
      ctx.ea.clear();
      ctx.ea.copyViewElementsToEAforEditing(pasted);
      for (const e of pasted) {
        const source = sources.get(e.customData[marker]);
        ctx.ea.getElement(e.id).customData = remapBranchMetadata(e, source, idMap, marker);
      }
      const roots = analysis.rootIds.map((id) => ctx.ea.getElement(idMap.get(id)));
      if (destination) {
        ctx.ea.copyViewElementsToEAforEditing([destination]);
        const editedParent = ctx.ea.getElement(destination.id);
        const settingsRoot = ctx.getSettingsRootNode(destination, all);
        const cfg = ctx.getRootConfigForNode(settingsRoot);
        const depth = ctx.getDepthFromAncestor(destination.id, settingsRoot.id, all) + 1;
        const siblings = ctx.getChildrenNodes(destination.id, all);
        let order = Math.max(0, ...siblings.map(ctx.getMindmapOrder)) + 1;
        if (editedParent.customData?.isFolded) {
          ctx.ea.addAppendUpdateCustomData(destination.id, { isFolded: false });
        }
        for (const root of roots) {
          // A copied whole map keeps its local layout as an additional root.
          if (root.customData?.growthMode) root.customData.isAdditionalRoot = true;
          root.customData = { ...root.customData, mindmapOrder: order++ };
          ctx.ea.style.strokeColor =
            root.strokeColor && root.strokeColor !== "transparent"
              ? root.strokeColor
              : destination.strokeColor;
          ctx.ea.style.strokeWidth = ctx.calculateStrokeWidth(
            depth,
            cfg.baseStrokeWidth,
            cfg.branchScale,
          );
          ctx.ea.style.strokeStyle = cfg.isSolidArrow
            ? "solid"
            : ctx.getAppState().currentItemStrokeStyle;
          ctx.ea.style.roughness = destination.roughness;
          const arrowId = ctx.ea.addArrow(
            [
              [destination.x + destination.width / 2, destination.y + destination.height / 2],
              [root.x + root.width / 2, root.y + root.height / 2],
            ],
            {
              startObjectId: destination.id,
              endObjectId: root.id,
              startArrowHead: null,
              endArrowHead: null,
            },
          );
          const arrow = ctx.ea.getElement(arrowId);
          arrow.customData = { ...arrow.customData, isBranch: true };
          for (const node of [editedParent, root]) {
            node.boundElements = [
              ...(node.boundElements || []).filter((b) => b.id !== arrowId),
              { id: arrowId, type: "arrow" },
            ];
          }
          const vertical = ["Up-facing", "Down-facing", "Up-Down"].includes(cfg.growthMode);
          const radial = cfg.growthMode === "Radial" && destination.id === settingsRoot.id;
          const right = root.x + root.width / 2 >= destination.x + destination.width / 2;
          const below = root.y + root.height / 2 >= destination.y + destination.height / 2;
          ctx.withRootLayoutContext(settingsRoot, () =>
            ctx.configureArrow({
              arrowId,
              startId: destination.id,
              endId: root.id,
              isChildRight: root.x + root.width / 2 >= destination.x + destination.width / 2,
              isChildBelow: root.y + root.height / 2 >= destination.y + destination.height / 2,
              layoutDirection: vertical ? "vertical" : "horizontal",
              isRadial: radial,
              coordinates: {
                sX:
                  vertical || radial
                    ? destination.x + destination.width / 2
                    : destination.x + (right ? destination.width : 0),
                sY: vertical
                  ? destination.y + (below ? destination.height : 0)
                  : destination.y + destination.height / 2,
                eX: vertical ? root.x + root.width / 2 : root.x + (right ? 0 : root.width),
                eY: vertical ? root.y + (below ? 0 : root.height) : root.y + root.height / 2,
              },
            }),
          );
        }
      } else {
        for (const root of roots) {
          if (!root.customData?.growthMode) ctx.initializeRootCustomData(root.id);
        }
      }
      // Native paste is its own history entry. Never include preceding Builder work in grouped undo.
      ctx.currentTransactionAccumulator = 0;
      ctx.lastCommittedTransaction = null;
      ctx.redoAvailable = null;
      await ctx.addElementsToView({ captureUpdate: "IMMEDIATELY" });
      if (!alive()) return true;
      if (destination) {
        ctx.selectNodeInView(destination);
        // Restore visibility when pasting into a folded parent, including existing children.
        const elements = ctx.ea.getViewElements();
        if (destination.customData?.isFolded) {
          const pastedIds = new Set(pasted.map((e) => e.id));
          ctx.ea.copyViewElementsToEAforEditing(
            ctx
              .getMindmapProjectElements(ctx.getHierarchy(destination, elements).rootId, elements)
              .filter((e) => !pastedIds.has(e.id)),
          );
          ctx.updateBranchVisibility(
            destination.id,
            false,
            ctx.ea.getElements(),
            true,
            ctx.getHierarchy(destination, elements).rootId,
          );
          await ctx.addElementsToView({ captureUpdate: "EVENTUALLY" });
        }
        if (
          alive() &&
          !ctx.getRootConfigForNode(ctx.getSettingsRootNode(destination, elements))
            .autoLayoutDisabled
        )
          await ctx.triggerGlobalLayout(
            ctx.getHierarchy(destination, elements).rootId,
            false,
            true,
          );
      } else {
        ctx.selectNodeInView(roots[0]);
      }
      new ctx.Notice(ctx.t("NOTICE_PASTE_COMPLETE"));
      // Builder undo stops when these pasted roots disappear; it cannot reach preceding edits.
      // Canvas undo remains the native sequence of paste/attachment/layout entries.
      ctx.currentTransactionAccumulator = 0;
      ctx.lastCommittedTransaction = {
        steps: 0,
        branchPasteIds: roots.map((root) => root.id),
        version: ExcalidrawLib.getSceneVersion(api.getSceneElements()),
      };
      ctx.redoAvailable = null;
    } catch (error) {
      if (!op.cancelled && ctx.ea.targetView === view) {
        console.error("Mindmap Builder branch paste:", error);
        new ctx.Notice(ctx.t("NOTICE_BRANCH_PASTE_FAILED"));
      }
    } finally {
      gestureDocuments.forEach((doc) =>
        doc.removeEventListener?.("pointerdown", cancelBranchPaste, true),
      );
      op.transportActive = false;
      op.cancel = () => {};
      metadata.repair(api);
      if (pending === op) pending = null;
      if (
        !op.cancelled &&
        ctx.ea.targetView === view &&
        ctx.api() === api &&
        ctx.ea.sidepanelTab &&
        !api.isDestroyed
      ) {
        ctx.ea.clear();
        ctx.focusInputEl();
      }
    }
    return true;
  };
  return {
    pasteBranch,
    cancelBranchPaste,
    disposeBranchPaste,
    isBranchPasteBusy,
    watchPasteMetadata,
  };
}
