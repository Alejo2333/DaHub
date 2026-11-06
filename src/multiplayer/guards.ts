/** Building blocks for checking messages from untrusted peers. Games use these in their own validators. */
export type Rec = Record<string, unknown>;
export const isRec = (x: unknown): x is Rec =>
  typeof x === "object" && x !== null && !Array.isArray(x);
export const isNum = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
export const isStr = (x: unknown, max = 64): x is string =>
  typeof x === "string" && x.length <= max;
export const isBool = (x: unknown): x is boolean => typeof x === "boolean";
/** A list of player ids. */
export const isIds = (x: unknown): x is string[] =>
  Array.isArray(x) && x.length <= 16 && x.every((i) => isStr(i));
