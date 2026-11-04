import { describe, expect, it } from "vitest";
import { parsePageRanges, selectPages } from "../pageRanges";
import { adjacentPage, getFrames, nextPageName, type PageFrame } from "../frames";
import { KEYS, loadSettings } from "../settings";
import { createWizardTranslator } from "../lang";

/** Minimal scene fixture; production selection does not depend on unrelated drawing properties. */
function frame(name: string, role = "marker"): PageFrame {
  return {
    id: name,
    name,
    type: "frame",
    frameRole: role,
    x: -100,
    y: 200,
    width: 300,
    height: 500,
  } as PageFrame;
}

describe("printable page ranges", () => {
  const pages = Array.from({ length: 12 }, (_, i) => i + 1);
  it("supports the requested single, closed, and open-ended range", () => {
    expect(selectPages(pages, "1, 3-5, 9-")).toEqual([1, 3, 4, 5, 9, 10, 11, 12]);
  });
  it("keeps canonical order and deduplicates overlapping ranges", () => {
    expect(selectPages(pages, "9-; 3-5; 4; 1; 3-4")).toEqual([1, 3, 4, 5, 9, 10, 11, 12]);
  });
  it("prints all for blank or whitespace", () => {
    expect(selectPages(pages, " \t")).toEqual(pages);
    expect(selectPages([], "")).toEqual([]);
  });
  it("clips out-of-bounds endpoints without allocating huge arrays", () => {
    expect(selectPages(pages, "11-9007199254740991")).toEqual([11, 12]);
    expect(selectPages(pages, "50-")).toEqual([]);
  });
  it.each([
    "0",
    "-3",
    "5-3",
    "1,,3",
    "1,",
    "a",
    "1.5",
    "1-2-3",
    "9007199254740992",
    "1-9007199254740992",
    "1 3",
    "-",
    "1e2",
  ])("rejects invalid input %s", (value) => {
    expect(() => parsePageRanges(value)).toThrow("INVALID_PAGE_RANGE");
  });
  it("numbers eligible frames alphabetically before empty pages are skipped", () => {
    const list = getFrames(
      [frame("03"), frame("01"), frame("02"), frame("ordinary", "normal")],
      true,
    );
    expect(selectPages(list, "2-").map((item) => item.name)).toEqual(["02", "03"]);
    expect(getFrames([frame("03"), frame("ordinary", "normal")], false)).toHaveLength(2);
  });
});
describe("migrated frame and preference behavior", () => {
  it("preserves numeric naming and rotation geometry in all directions", () => {
    expect(nextPageName([frame("Page 09"), frame("03")])).toBe("10");
    expect(nextPageName([])).toBe("01");
    expect(adjacentPage(frame("01"), "right", false)).toEqual({
      x: 200,
      y: 200,
      width: 300,
      height: 500,
    });
    expect(adjacentPage(frame("01"), "left", true)).toEqual({
      x: -600,
      y: 200,
      width: 500,
      height: 300,
    });
    expect(adjacentPage(frame("01"), "up", true)).toEqual({
      x: -100,
      y: -100,
      width: 500,
      height: 300,
    });
    expect(adjacentPage(frame("01"), "down", false)).toEqual({
      x: -100,
      y: 700,
      width: 300,
      height: 500,
    });
  });
  it("retains old values, unknown settings, and fixes old valueset spelling independently", () => {
    const stored = {
      [KEYS.size]: { value: "A5", valueSet: ["A5"] },
      [KEYS.empty]: { value: true },
      companion: { value: 42 },
    };
    const settings = loadSettings(stored);
    expect(settings[KEYS.size]).toEqual({ value: "A5", valueset: ["A5"] });
    expect(settings[KEYS.empty].value).toBe(true);
    expect(settings[KEYS.markers].value).toBe(true);
    expect(settings.companion).toEqual({ value: 42 });
    expect(stored[KEYS.size].valueSet).toEqual(["A5"]);
  });
  it("falls back to English for untranslated labels", () => {
    expect(createWizardTranslator("fr")("pages")).toBe("Pages");
    expect(createWizardTranslator("missing")("pages")).toBe("Pages");
  });
});
