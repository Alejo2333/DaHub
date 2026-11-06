export const MOVES = [
  "idle",
  "run",
  "jump",
  "fall",
  "land",
  "roll",
  "slide",
  "vault",
  "climb",
  "stumble",
  "bonk",
  "respawn",
  "finish",
] as const;
export type Move = (typeof MOVES)[number];

export interface Finish {
  id: string;
  ms: number;
}
/** What every player sees. The host publishes it when it changes, not every frame. */
export interface RaceState {
  phase: "countdown" | "racing" | "results";
  /** Seconds before the start while counting down, then seconds left in the race. */
  clock: number;
  /** Everyone builds the same course from this. */
  seed: number;
  finishes: Finish[];
}
export type Action = { t: "FINISH" };
/** A runner's position and animation, sent straight to the other players. `t` is what the animator needs for that move. */
export type Peer = { t: "POSE"; x: number; y: number; move: Move; p: number };
