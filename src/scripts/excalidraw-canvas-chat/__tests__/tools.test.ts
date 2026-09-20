import { describe, expect, it } from "vitest";
import { executeTool } from "../tools";
import type { CanvasChatSettings } from "../types";

const settings: CanvasChatSettings = {
  version: 1,
  textModelId: "auto",
  imageModelId: "auto",
  maxResponseTokens: 1600,
  debugLogging: false,
};

describe("Canvas Chat semantic tools", () => {
  it("converts a normal frame to a marker frame and releases owned elements", async () => {
    const scene: Record<string, unknown>[] = [
      { id: "frame-1", type: "frame", version: 1, isDeleted: false, frameId: null, frameRole: undefined },
      { id: "child-1", type: "text", version: 1, isDeleted: false, frameId: "frame-1" },
    ];
    const workbench = new Map<string, Record<string, unknown>>();
    const ea = {
      targetView: {},
      getViewElements: () => scene,
      clear: () => workbench.clear(),
      copyViewElementsToEAforEditing: (elements: Record<string, unknown>[]) => {
        for (const element of elements) workbench.set(String(element.id), { ...element });
      },
      getElement: (id: string) => workbench.get(id),
      addElementsToView: async () => {
        for (const [id, editable] of workbench) {
          const index = scene.findIndex((element) => element.id === id);
          if (index >= 0) scene[index] = { ...scene[index], ...editable, version: Number(scene[index]?.version ?? 0) + 1 };
        }
        return true;
      },
    } as unknown as ExcalidrawAutomate;

    const result = await executeTool(ea, settings, {
      tool: "set_frame_role",
      args: { ids: ["frame-1"], role: "marker" },
    });

    expect(result.ok).toBe(true);
    expect(scene[0]?.frameRole).toBe("marker");
    expect(scene[1]?.frameId).toBe(null);
  });
  it("creates a visual template with real field lines, colored panels, and shape checkboxes", async () => {
    const scene: Record<string, unknown>[] = [];
    const workbench = new Map<string, Record<string, unknown>>();
    let counter = 0;
    const nextId = (prefix: string) => `${prefix}-${++counter}`;
    const add = (element: Record<string, unknown>) => {
      const id = String(element.id);
      workbench.set(id, element);
      return id;
    };
    const ea = {
      targetView: {},
      getViewElements: () => scene,
      getBoundingBox: (items: Record<string, unknown>[]) => {
        const minX = Math.min(...items.map((item) => Number(item.x ?? 0)));
        const minY = Math.min(...items.map((item) => Number(item.y ?? 0)));
        const maxX = Math.max(...items.map((item) => Number(item.x ?? 0) + Number(item.width ?? 0)));
        const maxY = Math.max(...items.map((item) => Number(item.y ?? 0) + Number(item.height ?? 0)));
        return { topX: minX, topY: minY, width: maxX - minX, height: maxY - minY };
      },
      getExcalidrawAPI: () => ({
        getAppState: () => ({ scrollX: 0, scrollY: 0, width: 1200, height: 900, zoom: { value: 1 } }),
      }),
      clear: () => workbench.clear(),
      addFrame: (x: number, y: number, width: number, height: number, name: string) => add({
        id: nextId("frame"), type: "frame", x, y, width, height, name, isDeleted: false, frameId: null,
        groupIds: [], strokeColor: "#1b1b1f", backgroundColor: "transparent",
      }),
      addText: (x: number, y: number, text: string) => add({
        id: nextId("text"), type: "text", x, y, width: Math.max(20, text.length * 8), height: 20, text,
        isDeleted: false, frameId: null, groupIds: [], strokeColor: "#1b1b1f", backgroundColor: "transparent",
      }),
      addLine: (points: [number, number][]) => {
        const xs = points.map((point) => point[0]);
        const ys = points.map((point) => point[1]);
        return add({
          id: nextId("line"), type: "line", x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs),
          height: Math.max(...ys) - Math.min(...ys), points, isDeleted: false, frameId: null, groupIds: [],
          strokeColor: "#1b1b1f", backgroundColor: "transparent",
        });
      },
      addRect: (x: number, y: number, width: number, height: number) => add({
        id: nextId("rect"), type: "rectangle", x, y, width, height, isDeleted: false, frameId: null, groupIds: [],
        strokeColor: "#1b1b1f", backgroundColor: "transparent",
      }),
      addEllipse: (x: number, y: number, width: number, height: number) => add({
        id: nextId("ellipse"), type: "ellipse", x, y, width, height, isDeleted: false, frameId: null, groupIds: [],
        strokeColor: "#1b1b1f", backgroundColor: "transparent",
      }),
      getElement: (id: string) => workbench.get(id),
      addElementsToFrame: (frameId: string, ids: string[]) => {
        for (const id of ids) {
          const element = workbench.get(id);
          if (element) element.frameId = frameId;
        }
      },
      addElementsToView: async () => {
        scene.splice(0, scene.length, ...[...workbench.values()].map((element) => ({ ...element })));
        return true;
      },
    } as unknown as ExcalidrawAutomate;

    const result = await executeTool(ea, settings, {
      tool: "create_visual_template",
      args: {
        title: "Meeting Notes",
        theme: "blue",
        fieldColumns: 3,
        fields: [
          { label: "Date" }, { label: "Time" }, { label: "Organizer" }, { label: "Attendees", span: 3 },
        ],
        sections: [
          { title: "Agenda", kind: "list", span: 2, items: ["Topic 1", "Topic 2", "Topic 3"] },
          { title: "Notes", kind: "notes" },
          { title: "Action Items", kind: "checklist", items: ["Action — Owner — Due", "Action — Owner — Due"] },
        ],
        footerFields: [{ label: "Next meeting" }, { label: "Prep" }],
      },
    });

    expect(result.ok).toBe(true);
    expect(result.visualReviewSuggested).toBe(true);
    expect(result.changedIds?.length).toBeGreaterThan(15);
    expect(scene.some((element) => element.type === "rectangle" && element.backgroundColor === "#e7f5ff")).toBe(true);
    expect(scene.some((element) => element.type === "line")).toBe(true);
    expect(scene.filter((element) => element.type === "rectangle").length).toBeGreaterThanOrEqual(3);
    expect(scene.filter((element) => element.type === "text").some((element) => String(element.text).includes("___"))).toBe(false);
    expect(scene.filter((element) => element.type === "text").some((element) => String(element.text).includes("[ ]"))).toBe(false);
    const frame = scene.find((element) => element.type === "frame");
    expect(frame).toBeTruthy();
    expect(scene.filter((element) => element.id !== frame?.id).every((element) => element.frameId === frame?.id)).toBe(true);
  });

});
