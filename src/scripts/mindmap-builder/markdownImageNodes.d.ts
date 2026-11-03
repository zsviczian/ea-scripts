import type { LocalMarkdownImage } from "./markdownImages";
/** Entry boundary only; rendering runs against the live EA and owning drawing. */
export function addLocalMarkdownImage(
  ea: object,
  image: LocalMarkdownImage,
  x: number,
  y: number,
): Promise<string>;
