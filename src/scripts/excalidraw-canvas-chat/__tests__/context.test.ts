import { describe, expect, it } from "vitest";
import { compactElement, inspectLayout, inspectScene, spatialClusters } from "../context";

function frame(id: string, frameRole?: "marker"): ExcalidrawElement {
  return {
    id,
    type: "frame",
    x: 0,
    y: 0,
    width: 100,
    height: 80,
    name: "Slide",
    frameRole,
    isDeleted: false,
    frameId: null,
    groupIds: [],
    strokeColor: "#1b1b1f",
    backgroundColor: "transparent",
  } as unknown as ExcalidrawElement;
}

describe("Canvas Chat compact scene inspection", () => {
  it("exposes semantic frameRole", () => {
    expect(compactElement(frame("normal"))).toMatchObject({ id: "normal", frameRole: "normal" });
    expect(compactElement(frame("marker", "marker"))).toMatchObject({ id: "marker", frameRole: "marker" });
  });

  it("supports structured type filters and type:frame query syntax", () => {
    const elements = [
      frame("frame-1"),
      {
        id: "text-1",
        type: "text",
        x: 0,
        y: 0,
        width: 20,
        height: 20,
        text: "hello",
        isDeleted: false,
        frameId: null,
        groupIds: [],
        strokeColor: "#1b1b1f",
        backgroundColor: "transparent",
      } as unknown as ExcalidrawElement,
    ];
    const ea = {
      targetView: {},
      getViewElements: () => elements,
      getViewSelectedElements: () => [],
    } as unknown as ExcalidrawAutomate;

    const byQuery = JSON.parse(inspectScene(ea, "all", 20, "type:frame")) as { total: number; elements: { id: string }[] };
    const byTypes = JSON.parse(inspectScene(ea, "all", 20, "", ["frame"])) as { total: number; elements: { id: string }[] };
    expect(byQuery.total).toBe(1);
    expect(byQuery.elements[0]?.id).toBe("frame-1");
    expect(byTypes.total).toBe(1);
  });

  it("can inspect only a requested scene area", () => {
    const elements = [
      frame("frame-1"),
      {
        id: "text-near",
        type: "text",
        x: 20,
        y: 20,
        width: 40,
        height: 20,
        text: "near",
        isDeleted: false,
        frameId: null,
        groupIds: [],
        strokeColor: "#1b1b1f",
        backgroundColor: "transparent",
      },
      {
        id: "text-far",
        type: "text",
        x: 800,
        y: 800,
        width: 40,
        height: 20,
        text: "far",
        isDeleted: false,
        frameId: null,
        groupIds: [],
        strokeColor: "#1b1b1f",
        backgroundColor: "transparent",
      },
    ] as unknown as ExcalidrawElement[];
    const ea = {
      targetView: {},
      getViewElements: () => elements,
      getViewSelectedElements: () => [],
    } as unknown as ExcalidrawAutomate;
    const result = JSON.parse(inspectScene(ea, "all", 20, "", [], false, { x: 0, y: 0, width: 200, height: 200 })) as {
      elements: { id: string }[];
    };
    expect(result.elements.map((element) => element.id)).toContain("text-near");
    expect(result.elements.map((element) => element.id)).not.toContain("text-far");
  });

  it("reports coarse regions and text overlap diagnostics without full point geometry", () => {
    const elements = [
      {
        id: "a",
        type: "text",
        x: 0,
        y: 0,
        width: 120,
        height: 40,
        text: "Alpha",
        isDeleted: false,
        frameId: null,
        groupIds: [],
        strokeColor: "#1b1b1f",
        backgroundColor: "transparent",
      },
      {
        id: "b",
        type: "text",
        x: 20,
        y: 10,
        width: 120,
        height: 40,
        text: "Beta",
        isDeleted: false,
        frameId: null,
        groupIds: [],
        strokeColor: "#1b1b1f",
        backgroundColor: "transparent",
      },
      {
        id: "c",
        type: "rectangle",
        x: 1000,
        y: 1000,
        width: 100,
        height: 80,
        isDeleted: false,
        frameId: null,
        groupIds: [],
        strokeColor: "#1b1b1f",
        backgroundColor: "transparent",
      },
    ] as unknown as ExcalidrawElement[];
    const ea = {
      targetView: {},
      getViewElements: () => elements,
      getViewSelectedElements: () => [],
      getBoundingBox: (items: ExcalidrawElement[]) => {
        const minX = Math.min(...items.map((item) => item.x));
        const minY = Math.min(...items.map((item) => item.y));
        const maxX = Math.max(...items.map((item) => item.x + item.width));
        const maxY = Math.max(...items.map((item) => item.y + item.height));
        return { topX: minX, topY: minY, width: maxX - minX, height: maxY - minY };
      },
      getExcalidrawAPI: () => ({
        getAppState: () => ({ scrollX: 0, scrollY: 0, width: 800, height: 600, zoom: { value: 1 } }),
      }),
    } as unknown as ExcalidrawAutomate;
    const layout = JSON.parse(inspectLayout(ea, "all", [], 20)) as {
      potentialOverlaps: { a: string; b: string }[];
      regions: unknown[];
    };
    expect(layout.potentialOverlaps).toEqual(expect.arrayContaining([expect.objectContaining({ a: "a", b: "b" })]));
    expect(layout.regions.length).toBeGreaterThanOrEqual(2);
    expect(spatialClusters(elements).length).toBeGreaterThanOrEqual(2);
  });
  it("distinguishes intentional panel containment from real collisions and reports visual anti-patterns", () => {
    const elements = [
      {
        id: "panel-a", type: "rectangle", x: 0, y: 0, width: 300, height: 200,
        isDeleted: false, frameId: null, groupIds: [], strokeColor: "#74c0fc", backgroundColor: "#e7f5ff",
      },
      {
        id: "title-a", type: "text", x: 20, y: 20, width: 90, height: 20, text: "Notes",
        isDeleted: false, frameId: null, groupIds: [], strokeColor: "#1b1b1f", backgroundColor: "transparent",
      },
      {
        id: "panel-b", type: "rectangle", x: 240, y: 20, width: 180, height: 160,
        isDeleted: false, frameId: null, groupIds: [], strokeColor: "#74c0fc", backgroundColor: "#e7f5ff",
      },
      {
        id: "field", type: "text", x: 20, y: 230, width: 220, height: 20, text: "Date: ____________",
        isDeleted: false, frameId: null, groupIds: [], strokeColor: "#1b1b1f", backgroundColor: "transparent",
      },
      {
        id: "panel-c", type: "rectangle", x: 0, y: 270, width: 200, height: 100,
        isDeleted: false, frameId: null, groupIds: [], strokeColor: "#74c0fc", backgroundColor: "#e7f5ff",
      },
    ] as unknown as ExcalidrawElement[];
    const ea = {
      targetView: {},
      getViewElements: () => elements,
      getViewSelectedElements: () => [],
      getBoundingBox: (items: ExcalidrawElement[]) => {
        const minX = Math.min(...items.map((item) => item.x));
        const minY = Math.min(...items.map((item) => item.y));
        const maxX = Math.max(...items.map((item) => item.x + item.width));
        const maxY = Math.max(...items.map((item) => item.y + item.height));
        return { topX: minX, topY: minY, width: maxX - minX, height: maxY - minY };
      },
      getExcalidrawAPI: () => ({
        getAppState: () => ({ scrollX: 0, scrollY: 0, width: 800, height: 600, zoom: { value: 1 } }),
      }),
    } as unknown as ExcalidrawAutomate;

    const layout = JSON.parse(inspectLayout(ea, "all", [], 20)) as {
      collisions: { a: string; b: string; kind: string }[];
      containments: { container: string; child: string }[];
      textAntiPatterns: { id: string; issue: string }[];
      visualHierarchy: { lowColorHierarchy: boolean };
      qualityGate: string;
    };
    expect(layout.containments).toContainEqual({ container: "panel-a", child: "title-a" });
    expect(layout.collisions).toEqual(expect.arrayContaining([
      expect.objectContaining({ a: "panel-a", b: "panel-b", kind: "shape-shape" }),
    ]));
    expect(layout.collisions.some((item) => item.a === "panel-a" && item.b === "title-a")).toBe(false);
    expect(layout.textAntiPatterns).toContainEqual(expect.objectContaining({ id: "field", issue: "underscore-placeholder" }));
    expect(layout.visualHierarchy.lowColorHierarchy).toBe(true);
    expect(layout.qualityGate).toBe("fail");
  });

});
