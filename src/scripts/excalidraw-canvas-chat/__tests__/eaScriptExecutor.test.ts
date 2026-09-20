import { describe, expect, it } from "vitest";
import { executeEAScript } from "../eaScriptExecutor";

describe("Canvas Chat generated EA script execution", () => {
  it("runs a self-contained EA mutation and reports changed element ids", async () => {
    const scene: Record<string, unknown>[] = [{ id: "frame-1", type: "frame", version: 1, isDeleted: false, frameRole: undefined }];
    const workbench = new Map<string, Record<string, unknown>>();
    const ea = {
      targetView: {},
      getViewElements: () => scene,
      getExcalidrawAPI: () => ({}),
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

    const result = await executeEAScript(ea, `
      const frame = ea.getViewElements()[0];
      ea.clear();
      ea.copyViewElementsToEAforEditing([frame]);
      ea.getElement(frame.id).frameRole = "marker";
      await ea.addElementsToView();
      return { frameId: frame.id, frameRole: "marker" };
    `);

    expect(scene[0]?.frameRole).toBe("marker");
    expect(result).toContain('"changed":["frame-1"]');
    expect(result).toContain('"frameRole":"marker"');
  });
});
