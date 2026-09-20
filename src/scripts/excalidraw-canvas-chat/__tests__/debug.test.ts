import { afterEach, describe, expect, it, vi } from "vitest";
import { debugError, debugLog } from "../debug";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Canvas Chat debug logging", () => {
  it("writes structured diagnostics as one copy-friendly string", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    debugLog(true, "tool frame_elements result", { ok: true, summary: "Created frame." });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]).toHaveLength(1);
    expect(typeof log.mock.calls[0]?.[0]).toBe("string");
    expect(log.mock.calls[0]?.[0]).toContain('"ok": true');
  });

  it("writes errors as one string too", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    debugError(true, "turn failed", new Error("boom"), { round: 1 });

    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]).toHaveLength(1);
    expect(typeof error.mock.calls[0]?.[0]).toBe("string");
    expect(error.mock.calls[0]?.[0]).toContain("boom");
  });
});
