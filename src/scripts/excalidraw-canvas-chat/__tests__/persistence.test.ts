import { describe, expect, it } from "vitest";
import { appendMessage, createThread, loadChatStore, saveChatStore } from "../persistence";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  public get length(): number { return this.values.size; }
  public clear(): void { this.values.clear(); }
  public getItem(key: string): string | null { return this.values.get(key) ?? null; }
  public key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  public removeItem(key: string): void { this.values.delete(key); }
  public setItem(key: string, value: string): void { this.values.set(key, value); }
}

describe("Canvas Chat persistence", () => {
  it("round-trips a chat thread through local storage", () => {
    const storage = new MemoryStorage();
    const store = { version: 1 as const, activeThreadId: null, threads: [] };
    const thread = createThread(store, new Date("2026-09-19T10:00:00Z"));
    appendMessage(thread, "user", "Improve this diagram", new Date("2026-09-19T10:01:00Z"));
    saveChatStore(storage, store);
    const loaded = loadChatStore(storage);
    expect(loaded.activeThreadId).toBe(thread.id);
    expect(loaded.threads[0]?.title).toBe("Improve this diagram");
    expect(loaded.threads[0]?.messages[0]?.content).toBe("Improve this diagram");
  });
});
