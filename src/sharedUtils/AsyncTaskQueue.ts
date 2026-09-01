/** Serializes expensive asynchronous work and invalidates stale queued tasks. */
export class AsyncTaskQueue<Key> {
  private tail: Promise<void> = Promise.resolve();
  private generation = 0;
  private readonly pending = new Map<Key, Promise<unknown>>();

  public enqueue<Value>(
    key: Key,
    task: () => Promise<Value>,
    isRelevant: () => boolean = () => true,
  ): Promise<Value | undefined> {
    const existing = this.pending.get(key) as Promise<Value | undefined> | undefined;
    if (existing) return existing;
    const generation = this.generation;
    const result = this.tail.then(async () => {
      if (generation !== this.generation || !isRelevant()) return undefined;
      return await task();
    });
    this.pending.set(key, result);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    const removePending = (): void => {
      if (this.pending.get(key) === result) this.pending.delete(key);
    };
    void result.then(removePending, removePending);
    return result;
  }

  public clear(): void {
    this.generation += 1;
    this.pending.clear();
  }

  public async idle(): Promise<void> {
    await this.tail;
  }
}
