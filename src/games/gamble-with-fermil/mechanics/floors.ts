import type { GameKind, VoteKind } from "../../../types/net";
import { HOT_EVENT_WIN, SHAKEDOWN_ESCAPE_CHANCE } from "./odds";
import { SIMPLE } from "./simple";

const simpleLabels = Object.fromEntries(
  Object.entries(SIMPLE).map(([k, g]) => [k, g.label]),
);
export const GAME_LABELS = {
  slots: "Slots",
  roulette: "Roulette",
  dice: "Dice",
  wheel: "Lucky Wheel",
  crash: "Crash",
  cups: "Shell Game",
  vault: "Vault Cracker",
  ...simpleLabels,
} as Record<GameKind, string>;

export interface FloorRule {
  name: string;
  desc: string;
  /** The machines in this floor's room. Each game lives on exactly one floor. */
  games: GameKind[];
  /** Multiplies winning payouts on the named machines. */
  wins?: Partial<Record<GameKind, number>>;
  /** Multiplies upgrade prices in the shop before this floor. */
  shop?: number;
  /** Seconds added to this floor's clock. */
  clock?: number;
  minBet?: number;
}
/** One entry per floor. The last entry is the buyout floor. Keep `wins` low enough that no machine reaches RTP 1 for a whole floor. */
export const FLOORS: FloorRule[] = [
  {
    name: "Opening Night",
    desc: "No house rules yet.",
    games: ["slots", "wheel", "crash", "coin"],
  },
  {
    name: "Steady Hands",
    desc: "Dart Throw wins pay +5%.",
    games: ["cups", "scratch", "darts", "rps"],
    wins: { darts: 1.05 },
  },
  {
    name: "Fire Sale",
    desc: "Upgrades cost 30% less, but the clock is 60s shorter.",
    games: ["dice", "highcard", "claw", "ringtoss"],
    shop: 0.7,
    clock: -60,
  },
  {
    name: "High Rollers",
    desc: "Minimum bet is 50 chips.",
    games: ["roulette", "derby", "bowling", "penalty"],
    minBet: 50,
  },
  {
    name: "Tight Locks",
    desc: "Vault Cracker wins pay 20% less.",
    games: ["vault", "bingo", "fishing", "balloon"],
    wins: { vault: 0.8 },
  },
  {
    name: "Last Call",
    desc: "The clock is 60s shorter.",
    games: ["pegdrop", "colorwheel", "chest", "dial"],
    clock: -60,
  },
];
export const ruleFor = (floor: number) =>
  FLOORS[Math.min(Math.max(floor, 1), FLOORS.length) - 1]!;
export const machinesFor = (floor: number): GameKind[] => [
  ...ruleFor(floor).games,
];

export const HOT_WIN = HOT_EVENT_WIN;
export const VOTES: Record<
  VoteKind,
  { title: string; desc: (floor: number) => string; yes: string; no: string }
> = {
  dare: {
    title: "Fermil's dare",
    desc: () =>
      "Flip for the wallet: gain 25% or lose 25%. The house has a small edge.",
    yes: "Take the dare",
    no: "Pass",
  },
  shakedown: {
    title: "Shakedown",
    desc: () =>
      `The collector wants 10% of the wallet. Refuse and there is a ${Math.round((1 - SHAKEDOWN_ESCAPE_CHANCE) * 100)}% chance they take 20%.`,
    yes: "Pay 10%",
    no: "Refuse",
  },
  deal: {
    title: "Side deal",
    desc: (f) =>
      `Take ${200 * f} chips now and add ${300 * f} to this floor's debt.`,
    yes: "Shake on it",
    no: "Walk away",
  },
};
