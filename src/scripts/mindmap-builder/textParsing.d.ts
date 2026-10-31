/** Narrow entry boundary; JavaScript implementation bodies remain outside TypeScript checking. */
export function createTextParsing(context: object): {
  trimText: (text: string) => string;
  parseText: (text: string) => Promise<string>;
};
