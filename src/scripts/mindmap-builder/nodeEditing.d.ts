/** Narrow entry boundary; JavaScript implementation bodies remain outside TypeScript checking. */
export function createNodeEditing(context: object): {
  startEditing: () => void;
  commitEdit: () => Promise<void>;
};
