/** Narrow entry boundary; JavaScript implementation bodies remain outside TypeScript checking. */
export function parseLatexInput(input: string): string | null;

export function createTextParsing(context: object): {
  trimText: (text: string) => string;
  parseText: (text: string) => Promise<string>;
  getTextFromNode: (all: object[], node: object, getRaw?: boolean, shortPath?: boolean) => string;
};
