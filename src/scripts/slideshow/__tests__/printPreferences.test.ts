import { describe, expect, it, vi } from "vitest";
import { parsePrintRanges, selectPrintPages } from "../printRanges";
import { loadPrintPreferences, savePrintPreferences } from "../printPreferences";

describe("print page ranges", () => {
  it("accepts the requested syntax, open ranges, whitespace, and overlaps in output order", () => {
    const pages = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(selectPrintPages(pages, "1-3;5;9-")).toEqual([1, 2, 3, 5, 9, 10, 11, 12]);
    expect(selectPrintPages(pages, " 5 ; 2-4,3 ")).toEqual([2, 3, 4, 5]);
    expect(selectPrintPages(pages, "")).toBe(pages);
    expect(selectPrintPages(pages, "100-")).toEqual([]);
    expect(selectPrintPages(pages, "1-9007199254740991")).toEqual(pages);
  });
  it.each(["0", "3-1", "1;;2", ";1", "-3", "1.5", "1--2", "a", "9007199254740992"])(
    "rejects malformed range %s",
    (range) => {
      expect(() => parsePrintRanges(range)).toThrow("INVALID_PRINT_RANGE");
    },
  );
});

describe("print preferences", () => {
  it("round-trips every print choice and preserves unrelated script settings", async () => {
    let settings = { unrelated: "keep" } as Record<string, unknown>;
    const ea = {
      getScriptSettings: () => settings,
      setScriptSettings: vi.fn(async (value) => {
        settings = value;
      }),
    };
    const defaults = loadPrintPreferences(ea as never, 1920, 1080);
    const preferences = {
      ...defaults,
      layout: "handout-3" as const,
      visibleOnly: false,
      margin: "normal" as const,
      preset: "A4" as const,
      width: 794.56,
      height: 1122.56,
      pageRanges: "1-3;5;9-",
    };
    await savePrintPreferences(ea as never, preferences);
    expect(loadPrintPreferences(ea as never, 1920, 1080)).toEqual(preferences);
    expect(settings.unrelated).toBe("keep");
    expect(settings).not.toHaveProperty("sourceKey");
  });
  it("ignores corrupt saved values and retains safe defaults", () => {
    const ea = {
      getScriptSettings: () => ({
        slideshowPrintPreferences: {
          layout: "bad",
          visibleOnly: "false",
          margin: "-1",
          width: 1,
          height: Infinity,
          preset: "bad",
          pageRanges: "3-1",
        },
      }),
    };
    expect(loadPrintPreferences(ea as never, 1920, 1080)).toEqual({
      layout: "slides",
      visibleOnly: true,
      margin: "none",
      width: 1920,
      height: 1080,
      preset: "configured",
      pageRanges: "",
    });
  });
});
