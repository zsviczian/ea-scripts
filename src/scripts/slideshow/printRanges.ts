/** Parses one-based output-page ranges without allocating an array for large endpoints. */
export function parsePrintRanges(value: string): { first: number; last: number }[] {
  if (!value.trim()) return [];
  return value.split(/[;,]/).map((part) => {
    const match = /^\s*(\d+)\s*(?:-\s*(\d*)\s*)?$/.exec(part);
    if (!match) throw new Error("INVALID_PRINT_RANGE");
    const first = Number(match[1]);
    const last = match[2] === undefined ? first : match[2] === "" ? Infinity : Number(match[2]);
    if (
      !Number.isSafeInteger(first) ||
      first < 1 ||
      (last !== Infinity && !Number.isSafeInteger(last)) ||
      last < first
    )
      throw new Error("INVALID_PRINT_RANGE");
    return { first, last };
  });
}

/** Selects final PDF pages in their original order, counting notes continuation pages. */
export function selectPrintPages<T>(pages: T[], range: string): T[] {
  const ranges = parsePrintRanges(range);
  return ranges.length === 0
    ? pages
    : pages.filter((_, index) =>
        ranges.some(({ first, last }) => index + 1 >= first && index + 1 <= last),
      );
}
