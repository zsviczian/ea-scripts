import type { SlideDeckChoices } from "./presentationPath";
import type { PresentationSourceKey } from "./types";

/** Creates disambiguated presentation labels without changing stored presentation names. */
export function getPresentationSourceLabels(
  choices: SlideDeckChoices,
  frameLabel: string,
  defaultLineLabel: string,
): Array<{ key: PresentationSourceKey; label: string }> {
  const result: Array<{ key: PresentationSourceKey; label: string }> = [];
  if (choices.frame)
    result.push({ key: "frame", label: choices.frame.deck.name?.trim() || frameLabel });
  const bases = choices.lines.map((line) => line.name?.trim() || defaultLineLabel);
  const totals = new Map<string, number>();
  for (const base of bases) totals.set(base, (totals.get(base) ?? 0) + 1);
  const seen = new Map<string, number>();
  choices.lines.forEach((line, index) => {
    const base = bases[index] ?? defaultLineLabel;
    const ordinal = (seen.get(base) ?? 0) + 1;
    seen.set(base, ordinal);
    result.push({
      key: line.key,
      label: (totals.get(base) ?? 0) > 1 ? `${base} (${ordinal})` : base,
    });
  });
  return result;
}
