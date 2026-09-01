/** A size-aware least-recently-used cache with deterministic disposal. */
export class ByteBudgetLruCache<Key, Value> {
  private readonly values = new Map<Key, { value: Value; size: number }>();
  private totalSize = 0;

  public constructor(
    private readonly maximumSize: number,
    private readonly dispose?: (value: Value) => void,
  ) {}

  public get size(): number {
    return this.totalSize;
  }

  public get(key: Key): Value | undefined {
    const entry = this.values.get(key);
    if (!entry) return undefined;
    this.values.delete(key);
    this.values.set(key, entry);
    return entry.value;
  }

  public set(key: Key, value: Value, size: number): void {
    this.delete(key);
    const normalizedSize = Math.max(0, Math.trunc(size));
    this.values.set(key, { value, size: normalizedSize });
    this.totalSize += normalizedSize;
    while (this.totalSize > this.maximumSize && this.values.size > 1) {
      const oldest = this.values.keys().next().value as Key | undefined;
      if (oldest === undefined) break;
      this.delete(oldest);
    }
  }

  public delete(key: Key): boolean {
    const entry = this.values.get(key);
    if (!entry) return false;
    this.values.delete(key);
    this.totalSize -= entry.size;
    this.dispose?.(entry.value);
    return true;
  }

  public clear(): void {
    for (const entry of this.values.values()) this.dispose?.(entry.value);
    this.values.clear();
    this.totalSize = 0;
  }
}
