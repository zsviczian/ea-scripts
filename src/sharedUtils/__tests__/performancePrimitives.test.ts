import { describe, expect, it, vi } from "vitest";

import { AsyncTaskQueue } from "../AsyncTaskQueue";
import { ByteBudgetLruCache } from "../ByteBudgetLruCache";

describe("ByteBudgetLruCache", () => {
  it("evicts the least recently used values by byte budget", () => {
    const dispose = vi.fn();
    const cache = new ByteBudgetLruCache<string, string>(5, dispose);
    cache.set("a", "A", 2);
    cache.set("b", "B", 2);
    expect(cache.get("a")).toBe("A");
    cache.set("c", "C", 2);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe("A");
    expect(dispose).toHaveBeenCalledWith("B");
    expect(cache.size).toBe(4);
  });

  it("disposes all retained values when cleared", () => {
    const dispose = vi.fn();
    const cache = new ByteBudgetLruCache<string, string>(10, dispose);
    cache.set("a", "A", 3);
    cache.set("b", "B", 4);
    cache.clear();
    expect(dispose.mock.calls.flat()).toEqual(["A", "B"]);
    expect(cache.size).toBe(0);
  });
});

describe("AsyncTaskQueue", () => {
  it("serializes work and deduplicates a pending key", async () => {
    const queue = new AsyncTaskQueue<string>();
    const order: string[] = [];
    let release: (() => void) | undefined;
    const first = queue.enqueue("a", async () => {
      order.push("start-a");
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      order.push("end-a");
      return "a";
    });
    const duplicate = queue.enqueue("a", async () => "duplicate");
    const second = queue.enqueue("b", async () => {
      order.push("b");
      return "b";
    });
    await Promise.resolve();
    expect(first).toBe(duplicate);
    expect(order).toEqual(["start-a"]);
    release?.();
    await expect(first).resolves.toBe("a");
    await expect(second).resolves.toBe("b");
    expect(order).toEqual(["start-a", "end-a", "b"]);
  });

  it("invalidates queued work on clear", async () => {
    const queue = new AsyncTaskQueue<string>();
    let release: (() => void) | undefined;
    const first = queue.enqueue("a", async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return "a";
    });
    const stale = queue.enqueue("b", async () => "b");
    await Promise.resolve();
    queue.clear();
    release?.();
    await first;
    await expect(stale).resolves.toBeUndefined();
  });
});
