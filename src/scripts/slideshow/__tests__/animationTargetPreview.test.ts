import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { AnimationTargetPreviewService } from "../AnimationTargetPreviewService";

/** Makes one group plus an unrelated visual, so target isolation can be asserted. */
function fixture(): {
  service: AnimationTargetPreviewService; scope: { rect: { x1: number; y1: number; x2: number; y2: number } };
  doc: Document; createViewPNG: Mock<() => Promise<Blob>>; elements: ExcalidrawElement[];
  state: { theme: "light" | "dark"; viewBackgroundColor: string };
} {
  const elements = [
    { id: "box", type: "rectangle", x: 20, y: 20, width: 400, height: 100, opacity: 70,
      groupIds: ["group"], boundElements: [{ id: "text", type: "text" }] },
    { id: "text", type: "text", x: 30, y: 30, width: 200, height: 50, opacity: 100,
      groupIds: ["group"], containerId: "box" },
    { id: "other", type: "ellipse", x: 20, y: 100, width: 20, height: 20, opacity: 100, groupIds: [] },
  ] as unknown as ExcalidrawElement[];
  const createViewPNG = vi.fn(async () => new Blob(["preview"]));
  const ea = { getViewElements: () => elements, createViewPNG,
    getBoundingBox: () => ({ topX: 20, topY: 20, width: 400, height: 100 }),
  } as unknown as ExcalidrawAutomate;
  const state: { theme: "light" | "dark"; viewBackgroundColor: string } = { theme: "light", viewBackgroundColor: "#fff8ed" };
  const service = new AnimationTargetPreviewService(ea, { getAppState: () => state } as ExcalidrawAPI);
  const scope = { rect: { x1: 0, y1: 0, x2: 500, y2: 200 } };
  const doc = { createElement: () => ({ style: {} }) } as unknown as Document;
  return { service, scope, doc, createViewPNG, elements, state };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("animation target thumbnails", () => {
  it("exports the group and bound text once at bounded resolution, sharing it across rows", async () => {
    const { service, scope, doc, createViewPNG, elements } = fixture();
    const createUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:preview");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const before = structuredClone(elements);
    let relevant = true;
    const oldRow = service.createPreview(scope, [{ type: "group", id: "group" }], doc, () => relevant);
    relevant = false;
    const newRow = service.createPreview(scope, [{ type: "group", id: "group" }], doc, () => true);
    expect(await oldRow).toBeNull();
    expect((await newRow)?.src).toBe("blob:preview");
    expect(createViewPNG).toHaveBeenCalledOnce();
    const options = (createViewPNG.mock.calls[0] as unknown as [Parameters<ExcalidrawAutomate["createViewPNG"]>[0]])[0]!;
    expect(options.elementsOverride?.map(({ id }) => id)).toEqual(["box", "text"]);
    expect(options.scale! * 408).toBeLessThanOrEqual(160);
    expect(elements).toEqual(before);
    await service.createPreview(scope, [{ type: "group", id: "group" }], doc, () => true);
    expect(createUrl).toHaveBeenCalledOnce();
    service.destroy();
    expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:preview");
  });

  it("discards a running export after the editor is destroyed without allocating a URL", async () => {
    const { service, scope, doc, createViewPNG } = fixture();
    let resolve: (blob: Blob) => void = () => undefined;
    createViewPNG.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const createUrl = vi.spyOn(URL, "createObjectURL");
    const preview = service.createPreview(scope, [{ type: "element", id: "box" }], doc, () => true);
    await Promise.resolve();
    service.destroy();
    resolve(new Blob(["late"]));
    expect(await preview).toBeNull();
    expect(createUrl).not.toHaveBeenCalled();
  });

  it("keeps target thumbnails visible during a transient animation preview", async () => {
    const { service, scope, doc, createViewPNG, elements } = fixture();
    const hidden = elements[0]!;
    elements[0] = { ...hidden, opacity: 0 };
    await service.createPreview(scope, [{ type: "element", id: "box" }], doc, () => true, new Map([["box", 70]]));
    const options = (createViewPNG.mock.calls[0] as unknown as [Parameters<ExcalidrawAutomate["createViewPNG"]>[0]])[0]!;
    expect(options.elementsOverride?.find(({ id }) => id === "box")?.opacity).toBe(70);
    expect(elements[0].opacity).toBe(0);
    service.destroy();
  });

  it("attaches cached thumbnails after the replacement row mounts", async () => {
    const { service, scope, doc } = fixture();
    const targets = [{ type: "element" as const, id: "box" }];
    await service.createPreview(scope, targets, doc, () => true);
    let mounted = false;
    const preview = service.createPreview(scope, targets, doc, () => mounted);
    mounted = true;
    expect(await preview).not.toBeNull();
    service.destroy();
  });

  it("exports the scene background and invalidates cached thumbnails when its color changes", async () => {
    const { service, scope, doc, createViewPNG, state } = fixture();
    const targets = [{ type: "element" as const, id: "box" }];
    await service.createPreview(scope, targets, doc, () => true);
    const options = (createViewPNG.mock.calls[0] as unknown as [Parameters<ExcalidrawAutomate["createViewPNG"]>[0]])[0]!;
    expect(options.withBackground).toBe(true);
    state.viewBackgroundColor = "#e3fafc";
    await service.createPreview(scope, targets, doc, () => true);
    expect(createViewPNG).toHaveBeenCalledTimes(2);
    service.destroy();
  });

  it("uses the drawing theme for the PNG and the fork's dark background color for letterboxing", async () => {
    const filter = vi.fn(() => "rgb(34, 29, 20)");
    vi.stubGlobal("window", { ExcalidrawLib: { applyDarkModeFilter: filter } });
    const { service, scope, doc, createViewPNG, state } = fixture();
    const targets = [{ type: "element" as const, id: "box" }];
    const light = await service.createPreview(scope, targets, doc, () => true);
    expect(light?.style.backgroundColor).toBe("#fff8ed");
    state.theme = "dark";
    const dark = await service.createPreview(scope, targets, doc, () => true);
    expect(dark?.style.backgroundColor).toBe("rgb(34, 29, 20)");
    expect(filter).toHaveBeenCalledWith("#fff8ed");
    const options = (createViewPNG.mock.calls[1] as unknown as [Parameters<ExcalidrawAutomate["createViewPNG"]>[0]])[0]!;
    expect(options).toMatchObject({ withBackground: true, theme: "dark" });
    state.theme = "light";
    await service.createPreview(scope, targets, doc, () => true);
    expect(createViewPNG).toHaveBeenCalledTimes(2);
    service.destroy();
  });

  it("discards an export whose scene background changed while it was running", async () => {
    const { service, scope, doc, createViewPNG, state } = fixture();
    let finish: (blob: Blob) => void = () => undefined;
    createViewPNG.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const createUrl = vi.spyOn(URL, "createObjectURL");
    const targets = [{ type: "element" as const, id: "box" }];
    const stale = service.createPreview(scope, targets, doc, () => true);
    await Promise.resolve();
    state.viewBackgroundColor = "#e3fafc";
    finish(new Blob(["old background"]));
    expect(await stale).toBeNull();
    expect(createUrl).not.toHaveBeenCalled();
    expect(await service.createPreview(scope, targets, doc, () => true)).not.toBeNull();
    service.destroy();
  });
});
