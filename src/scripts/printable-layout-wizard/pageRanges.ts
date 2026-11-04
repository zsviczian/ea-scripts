/** A one-based inclusive interval; an omitted end extends through the final frame. */
export interface PageRange {
  first: number;
  last: number;
}

/** Validates selection syntax without expanding potentially huge endpoints. */
export function parsePageRanges(value: string): PageRange[] {
  if (!value.trim()) return [];
  return value.split(/[;,]/).map((part) => {
    const match = /^\s*(\d+)\s*(?:-\s*(\d*)\s*)?$/.exec(part);
    if (!match) throw new Error("INVALID_PAGE_RANGE");
    const first = Number(match[1]);
    const last = match[2] === undefined ? first : match[2] === "" ? Infinity : Number(match[2]);
    if (
      !Number.isSafeInteger(first) ||
      first < 1 ||
      (last !== Infinity && !Number.isSafeInteger(last)) ||
      last < first
    )
      throw new Error("INVALID_PAGE_RANGE");
    return { first, last };
  });
}

/** Selects once in canonical frame order, before the caller skips empty frames. */
export function selectPages<T>(pages: readonly T[], value: string): T[] {
  const ranges = parsePageRanges(value);
  return pages.filter(
    (_, index) =>
      ranges.length === 0 ||
      ranges.some(({ first, last }) => index + 1 >= first && index + 1 <= last),
  );
}
