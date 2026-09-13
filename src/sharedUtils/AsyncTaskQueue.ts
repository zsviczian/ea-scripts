/** Runs expensive asynchronous work with bounded concurrency and invalidates stale queued tasks. */
export class AsyncTaskQueue<Key> {
  private generation = 0;
  private activeCount = 0;
  private readonly pending = new Map<Key, Promise<unknown>>();
  private readonly waiting: Array<{
    generation: number;
    isRelevant: () => boolean;
    task: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  private readonly idleResolvers = new Set<() => void>();

  public constructor(private readonly concurrency = 1) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError("AsyncTaskQueue concurrency must be a positive integer.");
    }
  }

  public enqueue<Value>(
    key: Key,
    task: () => Promise<Value>,
    isRelevant: () => boolean = () => true,
  ): Promise<Value | undefined> {
    const existing = this.pending.get(key) as Promise<Value | undefined> | undefined;
    if (existing) return existing;
    const generation = this.generation;
    let resolveResult: (value: Value | undefined) => void = () => undefined;
    let rejectResult: (reason?: unknown) => void = () => undefined;
    const result = new Promise<Value | undefined>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    this.pending.set(key, result);
    this.waiting.push({
      generation,
      isRelevant,
      task,
      resolve: resolveResult as (value: unknown) => void,
      reject: rejectResult,
    });
    const removePending = (): void => {
      if (this.pending.get(key) === result) this.pending.delete(key);
      this.resolveIdleIfNeeded();
    };
    void result.then(removePending, removePending);
    this.pump();
    return result;
  }

  public clear(): void {
    this.generation += 1;
    this.pending.clear();
    for (const waiting of this.waiting.splice(0)) waiting.resolve(undefined);
    this.resolveIdleIfNeeded();
  }

  public async idle(): Promise<void> {
    if (this.activeCount === 0 && this.waiting.length === 0) return;
    await new Promise<void>((resolve) => this.idleResolvers.add(resolve));
  }

  private pump(): void {
    while (this.activeCount < this.concurrency && this.waiting.length > 0) {
      const next = this.waiting.shift();
      if (!next) break;
      if (next.generation !== this.generation) {
        next.resolve(undefined);
        continue;
      }
      try {
        if (!next.isRelevant()) {
          next.resolve(undefined);
          continue;
        }
      } catch (error) {
        next.reject(error);
        continue;
      }
      this.activeCount += 1;
      void Promise.resolve()
        .then(next.task)
        .then(next.resolve, next.reject)
        .finally(() => {
          this.activeCount -= 1;
          this.pump();
          this.resolveIdleIfNeeded();
        });
    }
    this.resolveIdleIfNeeded();
  }

  private resolveIdleIfNeeded(): void {
    if (this.activeCount !== 0 || this.waiting.length !== 0) return;
    for (const resolve of this.idleResolvers) resolve();
    this.idleResolvers.clear();
  }
}
