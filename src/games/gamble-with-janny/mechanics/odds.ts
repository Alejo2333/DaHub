import type { SimpleKind } from "../types";

/**
 * EVERY GAME'S ODDS AND PAYOUTS LIVE HERE.
 *
 * - A payout is a multiple of the wager: 2 returns double the bet, 0 loses it, and 1 refunds it.
 * - A weight is a relative chance. [3, 1] means the first result is three times as likely, or 75%.
 * - RTP is the share of bets paid back over time. 0.9 means the house keeps 10%.
 *
 * The odds shown to players are generated from these numbers, so they update on their own.
 * `npm test` fails if a change gives the players the edge, or drops a table game's RTP to 80% or less.
 *
 * The host's browser draws every result, so restart or redeploy for changes to take effect.
 */

// ---------------------------------------------------------------- Slots
/** Each reel draws one symbol by weight. Three of a kind pays `pays`. */
export const SLOT_SYMBOLS = [
  { icon: "🍒", weight: 40, pays: 5 },
  { icon: "🍋", weight: 30, pays: 8 },
  { icon: "🔔", weight: 20, pays: 15 },
  { icon: "7️⃣", weight: 8, pays: 40 },
  { icon: "💎", weight: 2, pays: 100 },
];
/** Paid when exactly two reels show the first symbol above. */
export const SLOT_TWO_OF_FIRST_PAYS = 0.5;

// ---------------------------------------------------------------- Roulette
/** The wheel is always 37 numbers, 0 to 36, so only the payouts change the odds. */
export const ROULETTE_PAYS = {
  /** Red, black, odd, even, low and high. Win chance 18/37. */
  outside: 2,
  /** One of the three dozens. Win chance 12/37. */
  dozen: 3,
  /** A single number. Win chance 1/37. */
  number: 36,
};

// ---------------------------------------------------------------- Dice
/** Two six-sided dice, so only the payouts change the odds. */
export const DICE_PAYS = {
  /** Win chance 15/36. */
  over: 2.2,
  /** Win chance 15/36. */
  under: 2.2,
  /** Win chance 6/36. */
  seven: 5,
  /** Win chance 6/36. */
  doubles: 5,
};

// ---------------------------------------------------------------- Lucky Wheel
/**
 * One entry per segment, each equally likely. Change a value to change the odds.
 * Adding or removing a segment also means updating WHEEL_ORDER in ui/wheelLayout.ts.
 */
export const WHEEL_SEGMENTS = [
  0, 0, 0, 0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5, 1.5, 1.5, 1.5, 1.5, 2, 2, 5,
];

// ---------------------------------------------------------------- Crash
export const CRASH = {
  /**
   * Win chance at multiplier m is rtp / m, so raising it makes every flight last longer on average.
   * Instant crashes at 1.00x happen (1 - rtp) of the time.
   */
  rtp: 0.95,
  /** Flights always end by this multiplier. */
  maxMultiplier: 100,
};

// ---------------------------------------------------------------- Shell Game
/** The coin is under one of three cups, so win chance is always 1/3. */
export const CUP_PAYS = 2.8;

// ---------------------------------------------------------------- Vault Cracker
/** The chance each lock opens. All of the chosen locks must open. */
export const VAULT_LOCK_CHANCE = 0.7;
/** The payout for choosing 1, 2, 3 or 4 locks. */
export const VAULT_PAYS: Record<string, number> = {
  v1: 1.3,
  v2: 1.85,
  v3: 2.65,
  v4: 3.75,
};

// ---------------------------------------------------------------- Progression
/** The chips a team starts with, and the debt due on floor 1. Later floors' debts don't depend on these. */
export const START_CHIPS = 1200;
export const FIRST_FLOOR_DEBT = 1300;
/**
 * Chips given to the team after clearing a floor, as a share of the next floor's debt.
 * This is the main difficulty setting: higher makes runs easier, and 0 turns the payday off.
 */
export const FLOOR_PAYDAY = 0.45;

// ---------------------------------------------------------------- Bonuses and team votes
/** Hot Machines upgrade: extra winnings per level, and how many levels it can be bought. */
export const HOT_MACHINES_BONUS = 0.04;
export const HOT_MACHINES_MAX_LEVEL = 2;
/** A machine that is "running hot" multiplies its wins by this. */
export const HOT_EVENT_WIN = 1.1;
/** Janny's dare: the chance the team wins the flip. */
export const DARE_WIN_CHANCE = 0.48;
/** Shakedown: the chance a team that refuses to pay gets away with it. */
export const SHAKEDOWN_ESCAPE_CHANCE = 0.5;

// ---------------------------------------------------------------- Table games
export interface SimpleOption {
  id: string;
  label: string;
  /** What this bet pays on each result, in the same order as `faces`. */
  pays: number[];
}
export interface SimpleOdds {
  faces: { face: string; w: number }[];
  /** A single option means there is nothing to choose: the player just bets. */
  options: SimpleOption[];
}
/** The possible results, each written as ["name", weight]. */
const faces = (...f: [string, number][]) => f.map(([face, w]) => ({ face, w }));
/** No choice to make: one payout per result. */
const play = (...pays: number[]): SimpleOption[] => [
  { id: "play", label: "Play", pays },
];
/** The player picks a result, and each pick pays only on its own result. */
const eachFace = (labels: string[], pays: number[]): SimpleOption[] =>
  labels.map((label, i) => ({
    id: `o${i}`,
    label,
    pays: pays.map((p, j) => (j === i ? p : 0)),
  }));

/**
 * Each game draws one result by weight, and the player's bet says what that result pays.
 * Every `pays` list needs one number per result.
 */
export const TABLE_GAME_ODDS: Record<SimpleKind, SimpleOdds> = {
  coin: {
    faces: faces(["🪙 Heads", 50], ["🦅 Tails", 50]),
    options: eachFace(["Heads", "Tails"], [1.9, 1.9]),
  },
  // The result names show the payout, so change them together.
  scratch: {
    faces: faces(["⬜ Blank", 72], ["✨ 2x", 20], ["🌟 5x", 7], ["💫 20x", 1]),
    options: play(0, 2, 5, 20),
  },
  darts: {
    faces: faces(
      ["💨 Miss", 49],
      ["⚪ Outer ring", 30],
      ["🔵 Inner ring", 18],
      ["🎯 Bullseye", 3],
    ),
    options: play(0, 1, 2, 7),
  },
  rps: {
    faces: faces(
      ["✊ Janny threw rock", 1],
      ["✋ Janny threw paper", 1],
      ["✌️ Janny threw scissors", 1],
    ),
    options: [
      { id: "rock", label: "Rock", pays: [1, 0, 1.8] },
      { id: "paper", label: "Paper", pays: [1.8, 1, 0] },
      { id: "scissors", label: "Scissors", pays: [0, 1.8, 1] },
    ],
  },
  highcard: {
    faces: faces(["🂠 Low card", 6], ["🂡 High card", 6], ["🅰️ Ace", 1]),
    options: eachFace(["Low 2–7", "High 8–K", "Ace"], [2, 2, 12]),
  },
  claw: {
    faces: faces(
      ["💨 Empty claw", 55],
      ["🧦 Toy", 30],
      ["🧸 Plush", 12],
      ["👑 Golden prize", 3],
    ),
    options: play(0, 1.2, 3, 6),
  },
  ringtoss: {
    faces: faces(
      ["💨 Miss", 55],
      ["🍾 Near bottle", 30],
      ["🥂 Far bottle", 12],
      ["🏆 Gold bottle", 3],
    ),
    options: play(0, 1.5, 2.5, 4),
  },
  derby: {
    faces: faces(
      ["🐎 Ironhoof", 40],
      ["🐴 Sunny", 25],
      ["🦄 Glitter", 18],
      ["🫏 Stubborn", 12],
      ["🐢 Long Shot", 5],
    ),
    options: eachFace(
      ["Ironhoof", "Sunny", "Glitter", "Stubborn", "Long Shot"],
      [2.2, 3.6, 5, 7.5, 18],
    ),
  },
  bowling: {
    faces: faces(
      ["🕳️ Gutter", 40],
      ["🎳 A few pins", 30],
      ["➗ Spare", 20],
      ["💥 Strike", 10],
    ),
    options: play(0, 0.5, 1.5, 5),
  },
  penalty: {
    faces: faces(
      ["🧤 Keeper dived left", 1],
      ["🧤 Keeper stayed centre", 1],
      ["🧤 Keeper dived right", 1],
    ),
    options: [
      { id: "left", label: "Left", pays: [0, 1.4, 1.4] },
      { id: "centre", label: "Centre", pays: [1.4, 0, 1.4] },
      { id: "right", label: "Right", pays: [1.4, 1.4, 0] },
    ],
  },
  bingo: {
    faces: faces(
      ["🔵 B", 1],
      ["🟢 I", 1],
      ["🟡 N", 1],
      ["🟠 G", 1],
      ["🔴 O", 1],
    ),
    options: eachFace(["B", "I", "N", "G", "O"], [4.6, 4.6, 4.6, 4.6, 4.6]),
  },
  fishing: {
    faces: faces(
      ["🥾 Old boot", 50],
      ["🐟 Minnow", 30],
      ["🐠 Bass", 15],
      ["🐋 Whale", 5],
    ),
    options: play(0, 1.2, 2.2, 4),
  },
  balloon: {
    faces: faces(
      ["💥 Popped early", 20],
      ["💥 Popped halfway", 30],
      ["💥 Popped late", 30],
      ["🎈 It held", 20],
    ),
    options: [
      { id: "small", label: "Small pump", pays: [0, 1.15, 1.15, 1.15] },
      { id: "big", label: "Big pump", pays: [0, 0, 1.85, 1.85] },
      { id: "huge", label: "Huge pump", pays: [0, 0, 0, 4.6] },
    ],
  },
  // The result names show the payout, so change them together.
  pegdrop: {
    faces: faces(
      ["🔻 0.2x", 30],
      ["🔻 0.5x", 30],
      ["🔻 1x", 20],
      ["🔻 2x", 15],
      ["🔻 4x", 5],
    ),
    options: play(0.2, 0.5, 1, 2, 4),
  },
  colorwheel: {
    faces: faces(
      ["🔴 Red", 45],
      ["🔵 Blue", 30],
      ["🟢 Green", 20],
      ["🟡 Gold", 5],
    ),
    options: eachFace(["Red", "Blue", "Green", "Gold"], [2, 3, 4.5, 18]),
  },
  chest: {
    faces: faces(
      ["🕸️ Empty", 50],
      ["🪙 Coins", 25],
      ["💎 Gems", 20],
      ["👑 Crown", 5],
    ),
    options: play(0, 1, 2, 5),
  },
  dial: {
    faces: faces(
      ["🔢 1–25", 1],
      ["🔢 26–50", 1],
      ["🔢 51–75", 1],
      ["🔢 76–100", 1],
    ),
    options: [
      { id: "low", label: "1–50", pays: [1.85, 1.85, 0, 0] },
      { id: "high", label: "51–100", pays: [0, 0, 1.85, 1.85] },
      { id: "first", label: "1–25", pays: [3.7, 0, 0, 0] },
      { id: "last", label: "76–100", pays: [0, 0, 0, 3.7] },
    ],
  },
};
