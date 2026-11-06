import type { SimpleKind } from "../types";
import { TABLE_GAME_ODDS, type SimpleOdds, type SimpleOption } from "./odds";

/**
 * Table-driven games: draw one weighted face, and the player's option says what each face pays.
 * Adding a game here and in odds.ts gives it payouts, odds text, a betting panel and machine art.
 */
export type { SimpleOption };
export interface SimpleGame extends SimpleOdds {
  label: string;
  icon: string;
  style: "cabinet" | "table" | "booth";
  color: number;
}

export const SIMPLE: Record<SimpleKind, SimpleGame> = {
  coin: {
    label: "Coin Toss",
    icon: "🪙",
    style: "table",
    color: 0xffd24d,
    ...TABLE_GAME_ODDS.coin,
  },
  scratch: {
    label: "Scratch Card",
    icon: "🎟️",
    style: "cabinet",
    color: 0x7ce0c3,
    ...TABLE_GAME_ODDS.scratch,
  },
  darts: {
    label: "Dart Throw",
    icon: "🎯",
    style: "booth",
    color: 0xff6b5e,
    ...TABLE_GAME_ODDS.darts,
  },
  rps: {
    label: "Rock Paper Janny",
    icon: "✊",
    style: "table",
    color: 0xc58cff,
    ...TABLE_GAME_ODDS.rps,
  },
  highcard: {
    label: "High Card",
    icon: "🃏",
    style: "table",
    color: 0x6fb7ff,
    ...TABLE_GAME_ODDS.highcard,
  },
  claw: {
    label: "Claw Machine",
    icon: "🧸",
    style: "cabinet",
    color: 0xff9ed8,
    ...TABLE_GAME_ODDS.claw,
  },
  ringtoss: {
    label: "Ring Toss",
    icon: "⭕",
    style: "booth",
    color: 0x8fe36f,
    ...TABLE_GAME_ODDS.ringtoss,
  },
  derby: {
    label: "Derby Dash",
    icon: "🐎",
    style: "table",
    color: 0xe0a15c,
    ...TABLE_GAME_ODDS.derby,
  },
  bowling: {
    label: "Bowling Lane",
    icon: "🎳",
    style: "table",
    color: 0x5ec8ff,
    ...TABLE_GAME_ODDS.bowling,
  },
  penalty: {
    label: "Penalty Kick",
    icon: "⚽",
    style: "booth",
    color: 0x4fd18b,
    ...TABLE_GAME_ODDS.penalty,
  },
  bingo: {
    label: "Bingo Ball",
    icon: "🔵",
    style: "cabinet",
    color: 0x5f8bff,
    ...TABLE_GAME_ODDS.bingo,
  },
  fishing: {
    label: "Fishing Hole",
    icon: "🎣",
    style: "booth",
    color: 0x4dc3d8,
    ...TABLE_GAME_ODDS.fishing,
  },
  balloon: {
    label: "Balloon Pump",
    icon: "🎈",
    style: "cabinet",
    color: 0xff6f91,
    ...TABLE_GAME_ODDS.balloon,
  },
  pegdrop: {
    label: "Peg Drop",
    icon: "🔻",
    style: "cabinet",
    color: 0xb9e05c,
    ...TABLE_GAME_ODDS.pegdrop,
  },
  colorwheel: {
    label: "Colour Spin",
    icon: "🌈",
    style: "booth",
    color: 0xff8a4d,
    ...TABLE_GAME_ODDS.colorwheel,
  },
  chest: {
    label: "Treasure Chest",
    icon: "🧰",
    style: "table",
    color: 0xe6b84d,
    ...TABLE_GAME_ODDS.chest,
  },
  dial: {
    label: "Safe Dial",
    icon: "🔢",
    style: "cabinet",
    color: 0x9fb4d8,
    ...TABLE_GAME_ODDS.dial,
  },
};

export const simpleOf = (game: string): SimpleGame | undefined =>
  Object.hasOwn(SIMPLE, game) ? SIMPLE[game as SimpleKind] : undefined;
/** Average return of one option. 1 means the bet breaks even over time. */
export const optionRtp = (g: SimpleGame, o: SimpleOption) => {
  const total = g.faces.reduce((a, f) => a + f.w, 0);
  return g.faces.reduce((a, f, i) => a + (f.w / total) * (o.pays[i] ?? 0), 0);
};
/** The best-returning option, which is what limits how far a game's wins can be boosted. */
export const bestRtp = (g: SimpleGame) =>
  Math.max(...g.options.map((o) => optionRtp(g, o)));
export function simpleOdds(g: SimpleGame) {
  const total = g.faces.reduce((a, f) => a + f.w, 0),
    pct = (n: number) => `${Math.round((n / total) * 100)}%`;
  const rtp = `RTP ≈ ${Math.round(bestRtp(g) * 100)}%.`;
  if (g.options.length === 1)
    return `${g.faces.map((f, i) => `${f.face.replace(/^\S+\s/, "")} ${pct(f.w)} pays ${g.options[0]!.pays[i]}x`).join(", ")}. ${rtp}`;
  return `${g.options.map((o) => `${o.label} pays up to ${Math.max(...o.pays)}x`).join(", ")}. ${rtp}`;
}
