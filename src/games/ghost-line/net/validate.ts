import { isNum, isRec, isStr } from "../../../multiplayer/guards";
import {
  MOVES,
  type Action,
  type Move,
  type Peer,
  type RaceState,
} from "../types";

export const isState = (x: unknown): x is RaceState =>
  isRec(x) &&
  (x.phase === "countdown" || x.phase === "racing" || x.phase === "results") &&
  isNum(x.clock) &&
  isNum(x.seed) &&
  Array.isArray(x.finishes) &&
  x.finishes.length <= 16 &&
  x.finishes.every((f) => isRec(f) && isStr(f.id) && isNum(f.ms));
export const isAction = (x: unknown): x is Action =>
  isRec(x) && x.t === "FINISH";
export const isPeer = (x: unknown): x is Peer =>
  isRec(x) &&
  x.t === "POSE" &&
  isNum(x.x) &&
  isNum(x.y) &&
  isNum(x.p) &&
  MOVES.includes(x.move as Move);
