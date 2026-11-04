import { afterEach, describe, expect, it, vi } from "vitest";
import { PagePreviewService } from "../PagePreviewService";
import { describePrintPages, selectPrintablePages } from "../printPages";
import type { PageFrame } from "../frames";

afterEach(() => vi.restoreAllMocks());
/** Creates an EA boundary with real service queue/cache behavior and deterministic crop contents. */
function fixture(): {
  service: PagePreviewService;
  ea: ExcalidrawAutomate;
  png: ReturnType<typeof vi.fn>;
  frames: PageFrame[];
  setScene: (elements: ExcalidrawElement[]) => void;
} {
  const frames = [0, 1, 2].map((i) => ({
    id: String(i),
    type: "frame",
    name: String(i),
    frameRole: "marker",
    x: i * 1000,
    y: 0,
    width: 300,
    height: 400,
  })) as PageFrame[];
  let scene = [
    ...frames,
    { id: "content", type: "rectangle", x: 20, y: 20, width: 30, height: 30, strokeColor: "red" },
  ] as ExcalidrawElement[];
  const png = vi.fn(async () => new Blob(["png"]));
  const ea = {
    getViewElements: () => scene,
    getElementsIntersectionArea: (
      elements: ExcalidrawElement[],
      area: { x: number; width: number },
    ) => elements.filter((el) => el.x >= area.x && el.x < area.x + area.width),
    getElementsInArea: (elements: ExcalidrawElement[], frame: PageFrame) =>
      elements.filter((el) => el.x >= frame.x && el.x < frame.x + frame.width),
    createViewPNG: png,
  } as unknown as ExcalidrawAutomate;
  const api = {
    getAppState: () => ({ theme: "light", viewBackgroundColor: "#ffffff" }),
  } as unknown as ExcalidrawAPI;
  return {
    service: new PagePreviewService(ea, api),
    ea,
    png,
    frames,
    setScene: (elements) => {
      scene = elements;
    },
  };
}

describe("wizard page previews", () => {
  it("reuses concurrent and warm crops; selection and margins do not participate in the cache key", async () => {
    const f = fixture();
    await Promise.all([f.service.get(f.frames[0]!), f.service.get(f.frames[0]!)]);
    await f.service.get(f.frames[0]!);
    expect(f.png).toHaveBeenCalledOnce();
    expect(f.png.mock.calls[0]![0]).toMatchObject({
      exportArea: { x: 0, y: 0, width: 300, height: 400 },
      scale: 1.2,
    });
    f.service.clear();
  });
  it("ignores outside edits and frame renames; redraws changed local content", async () => {
    const f = fixture();
    await f.service.get(f.frames[0]!);
    const scene = f.ea.getViewElements();
    f.setScene([
      ...scene,
      { id: "outside", type: "rectangle", x: 9000, y: 0, width: 10, height: 10 },
    ] as ExcalidrawElement[]);
    await f.service.get({ ...f.frames[0]!, name: "new title" });
    expect(f.png).toHaveBeenCalledOnce();
    f.setScene(
      scene.map((el) =>
        el.id === "content" ? ({ ...el, strokeColor: "blue" } as ExcalidrawElement) : el,
      ),
    );
    await f.service.get(f.frames[0]!);
    expect(f.png).toHaveBeenCalledTimes(2);
    f.service.clear();
  });
  it("bounds concurrency at two, cancels queued crops, and rejects publication after close", async () => {
    const f = fixture();
    const finish: Array<(blob: Blob) => void> = [];
    f.png.mockImplementation(() => new Promise<Blob>((resolve) => finish.push(resolve)));
    const created = vi.spyOn(URL, "createObjectURL");
    const pending = f.frames.map((frame) => f.service.get(frame));
    await Promise.resolve();
    await Promise.resolve();
    expect(f.png).toHaveBeenCalledTimes(2);
    f.service.clear();
    finish.forEach((resolve) => resolve(new Blob(["png"])));
    expect(await Promise.all(pending)).toEqual([undefined, undefined, undefined]);
    expect(created).not.toHaveBeenCalled();
  });
  it("releases cached object URLs on close", async () => {
    const f = fixture();
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const preview = await f.service.get(f.frames[0]!);
    f.service.clear();
    expect(revoke).toHaveBeenCalledWith(preview!.objectUrl);
  });
  it("shares selection/count classification with the PDF exporter", () => {
    const f = fixture();
    const plan = describePrintPages(f.ea, f.ea.getViewElements(), true);
    expect(selectPrintablePages(plan, "1, 3-", false).map((frame) => frame.id)).toEqual(["0"]);
    expect(selectPrintablePages(plan, "1, 3-", true).map((frame) => frame.id)).toEqual(["0", "2"]);
    expect(() => selectPrintablePages(plan, "3-1", false)).toThrow("INVALID_PAGE_RANGE");
  });
});
