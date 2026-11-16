import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

import { buildFrameSlideDeck } from "../SlideDeck";
import { SlidePreviewService } from "../SlidePreviewService";
import { SlideSorter } from "../SlideSorter";
import { DEFAULT_SLIDESHOW_CONFIG } from "../slideshowSettings";
import { getPreviewAppearance } from "../previewAppearance";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Uses the actual preview service with a changing live drawing appearance. */
function fixture(): {
  service: SlidePreviewService; slide: ReturnType<typeof buildFrameSlideDeck>["slides"][number];
  doc: Document; state: { theme: "light" | "dark"; viewBackgroundColor: string };
  createViewPNG: Mock<ExcalidrawAutomate["createViewPNG"]>;
} {
  const frame = { id: "frame", type: "frame", name: "Slide", x: 0, y: 0, width: 400, height: 200 };
  const elements = [frame] as ExcalidrawElement[];
  const state: { theme: "light" | "dark"; viewBackgroundColor: string } = { theme: "light", viewBackgroundColor: "#fff8ed" };
  const createViewPNG = vi.fn<ExcalidrawAutomate["createViewPNG"]>(async () => new Blob(["PNG"]));
  const ea = { getViewElements: () => elements, getElementsIntersectionArea: () => elements, createViewPNG } as unknown as ExcalidrawAutomate;
  const api = { getAppState: () => state } as ExcalidrawAPI;
  const doc = { createElement: () => ({ style: {}, setAttribute: () => undefined }) } as unknown as Document;
  return { service: new SlidePreviewService(ea, api, DEFAULT_SLIDESHOW_CONFIG),
    slide: buildFrameSlideDeck([frame]).slides[0]!, doc, state, createViewPNG };
}

describe("scene preview appearance", () => {
  it("marks existing sorter images stale without removing them or exporting while previews are paused", () => {
    const bitmap = {};
    const host = { dataset: { slideId: "frame" } as Record<string, string>, firstElementChild: bitmap };
    const createPreview = vi.fn();
    const sorter = new SlideSorter({
      container: { ownerDocument: { defaultView: {} }, querySelectorAll: () => [host] },
      deck: buildFrameSlideDeck([]), previewRenderingEnabled: false,
      previewService: { createPreview },
    } as unknown as ConstructorParameters<typeof SlideSorter>[0]);
    sorter.invalidatePreviewAppearance();
    expect(host.dataset.previewDirty).toBe("true");
    expect(host.firstElementChild).toBe(bitmap);
    expect(createPreview).not.toHaveBeenCalled();
  });
  it("uses the fork's exact background transform only for the drawing's dark theme", () => {
    const filter = vi.fn(() => "#211a12");
    vi.stubGlobal("window", { ExcalidrawLib: { applyDarkModeFilter: filter } });
    expect(getPreviewAppearance({ theme: "light", viewBackgroundColor: "#fff8ed" })).toEqual({
      theme: "light", backgroundColor: "#fff8ed", key: "light|#fff8ed",
    });
    expect(filter).not.toHaveBeenCalled();
    expect(getPreviewAppearance({ theme: "dark", viewBackgroundColor: "#fff8ed" })).toEqual({
      theme: "dark", backgroundColor: "#211a12", key: "dark|#fff8ed",
    });
    expect(filter).toHaveBeenCalledExactlyOnceWith("#fff8ed");
  });

  it("refreshes slide PNGs and letterboxing for theme/background changes and reuses matching cached images", async () => {
    vi.stubGlobal("window", { ExcalidrawLib: { applyDarkModeFilter: () => "#211a12" } });
    const { service, slide, doc, state, createViewPNG } = fixture();
    const light = await service.createPreview(slide, doc);
    expect(light?.style.backgroundColor).toBe("#fff8ed");
    state.theme = "dark";
    const dark = await service.createPreview(slide, doc);
    expect(createViewPNG.mock.calls[1]?.[0]).toMatchObject({ withBackground: true, theme: "dark" });
    expect(dark?.style.backgroundColor).toBe("#211a12");
    expect(service.getBackgroundColor()).toBe("#211a12");
    state.theme = "light";
    expect((await service.createPreview(slide, doc))?.src).toBe(light?.src);
    expect(createViewPNG).toHaveBeenCalledTimes(2);
    state.viewBackgroundColor = "#e3fafc";
    expect((await service.createPreview(slide, doc))?.style.backgroundColor).toBe("#e3fafc");
    expect(createViewPNG).toHaveBeenCalledTimes(3);
    service.clear();
  });

  it("rejects a queued slide image rendered for an obsolete background", async () => {
    const { service, slide, doc, state, createViewPNG } = fixture();
    let finish: (blob: Blob) => void = () => undefined;
    createViewPNG.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const stale = service.createPreview(slide, doc);
    await Promise.resolve();
    state.viewBackgroundColor = "#e3fafc";
    finish(new Blob(["old background"]));
    expect(await stale).toBeNull();
    expect((await service.createPreview(slide, doc))?.style.backgroundColor).toBe("#e3fafc");
    service.clear();
  });
});
