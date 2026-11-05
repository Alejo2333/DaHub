import type { BetReq, GameKind } from "../../../types/net";
import {
  CRASH,
  CUP_PAYS,
  DICE_PAYS,
  HOT_MACHINES_BONUS,
  HOT_MACHINES_MAX_LEVEL,
  ROULETTE_PAYS,
  SLOT_SYMBOLS,
  SLOT_TWO_OF_FIRST_PAYS,
  VAULT_LOCK_CHANCE,
  VAULT_PAYS,
  WHEEL_SEGMENTS,
} from "./odds";
import { bestRtp, SIMPLE, simpleOdds, simpleOf } from "./simple";
/** The numbers themselves are set in odds.ts. */
export const SYMBOLS = SLOT_SYMBOLS.map((s) => s.icon),
  SYM_W = SLOT_SYMBOLS.map((s) => s.weight),
  SYM_PAY = SLOT_SYMBOLS.map((s) => s.pays);
export const WHEEL = WHEEL_SEGMENTS;
export const REDS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
/** Games whose wins are scaled by the Hot Machines upgrade. Roulette & crash are excluded so no stack can reach EV > 1. */
export const BOOSTABLE: GameKind[] = ["slots", "dice", "wheel"];
export const DICE_PAY = DICE_PAYS;
export const CUP_PAY = CUP_PAYS;
/** Vault Cracker: more locks means a bigger payout, and all of them must open. */
export const LOCK_CHANCE = VAULT_LOCK_CHANCE,
  VAULT_PAY = VAULT_PAYS;
/** Hot Machines reaches a table-driven game only if its best bet stays under RTP 1 at the upgrade's top level. */
export const isBoostable = (game: GameKind) => {
  const s = simpleOf(game);
  return s
    ? bestRtp(s) * (1 + HOT_MACHINES_BONUS * HOT_MACHINES_MAX_LEVEL) < 1
    : BOOSTABLE.includes(game);
};

const pct = (r: number, digits = 0) =>
  `${Number((r * 100).toFixed(digits))}%`;
/** Shows one RTP, or a range when bets differ. */
const rtpRange = (rtps: number[], digits = 0) => {
  const lo = pct(Math.min(...rtps), digits),
    hi = pct(Math.max(...rtps), digits);
  return lo === hi ? lo : `${lo}–${hi}`;
};
const slotsRtp = () => {
  const total = SYM_W.reduce((a, b) => a + b, 0),
    first = SYM_W[0]! / total;
  const threes = SYM_W.reduce(
    (a, w, i) => a + (w / total) ** 3 * SYM_PAY[i]!,
    0,
  );
  return threes + 3 * first ** 2 * (1 - first) * SLOT_TWO_OF_FIRST_PAYS;
};
const wheelText = () => {
  const counts = new Map<number, number>();
  for (const m of WHEEL) counts.set(m, (counts.get(m) ?? 0) + 1);
  const parts = [...counts]
    .sort(([a], [b]) => a - b)
    .map(([m, n]) => `${n}× ${m}x`);
  const rtp = WHEEL.reduce((a, b) => a + b, 0) / WHEEL.length;
  return `${WHEEL.length} segments: ${parts.join(", ")}. RTP ${pct(rtp, 1)}.`;
};
const vaultRtps = Object.entries(VAULT_PAY).map(
  ([k, p]) => p * LOCK_CHANCE ** Number(k.slice(1)),
);
/** The odds text players see. It is built from odds.ts so it can't drift from the real numbers. */
export const ODDS = {
  ...Object.fromEntries(
    Object.entries(SIMPLE).map(([k, g]) => [k, simpleOdds(g)]),
  ),
  slots: `3 match: ${SLOT_SYMBOLS.map((s) => `${s.icon}${s.pays}x`).join(" ")}. Exactly two ${SYMBOLS[0]} returns ${SLOT_TWO_OF_FIRST_PAYS}x. RTP ≈ ${pct(slotsRtp())}.`,
  roulette: `Red/Black/Odd/Even/Low/High ${ROULETTE_PAYS.outside}x. Dozens ${ROULETTE_PAYS.dozen}x. Single number ${ROULETTE_PAYS.number}x. 0 loses all outside bets. RTP ≈ ${rtpRange(
    [
      (ROULETTE_PAYS.outside * 18) / 37,
      (ROULETTE_PAYS.dozen * 12) / 37,
      ROULETTE_PAYS.number / 37,
    ],
    1,
  )}.`,
  dice: `Over 7 / Under 7 pay ${DICE_PAY.over === DICE_PAY.under ? `${DICE_PAY.over}x` : `${DICE_PAY.over}x / ${DICE_PAY.under}x`}. Exactly 7 pays ${DICE_PAY.seven}x, Doubles pay ${DICE_PAY.doubles}x. RTP ${rtpRange(
    [
      (DICE_PAY.over * 15) / 36,
      (DICE_PAY.under * 15) / 36,
      (DICE_PAY.seven * 6) / 36,
      (DICE_PAY.doubles * 6) / 36,
    ],
  )}.`,
  wheel: wheelText(),
  crash: `The multiplier climbs until it crashes, up to ${CRASH.maxMultiplier}x. Cash out before it does. Win chance at multiplier m is ${pct(CRASH.rtp)}/m. RTP ${pct(CRASH.rtp)}.`,
  cups: `Find the coin under one of three cups. A correct pick pays ${CUP_PAY}x. RTP ≈ ${pct(CUP_PAY / 3)}.`,
  vault: `Each lock opens ${pct(LOCK_CHANCE)} of the time, and all must open. ${Object.entries(
    VAULT_PAY,
  )
    .map(([k, p]) => {
      const n = Number(k.slice(1));
      return `${n} lock${n > 1 ? "s" : ""} ${p}x`;
    })
    .join(", ")}. RTP ≈ ${rtpRange(vaultRtps)}.`,
} as Record<GameKind, string>;

/** Crash: the multiplier reached after `ms` of flight. Doubles roughly every 5 seconds, capped at the configured maximum. */
export const crashMult = (ms: number) =>
  Math.min(CRASH.maxMultiplier, 1.07 ** (Math.max(0, ms) / 500));
/** Crash: how long a flight lasts before reaching `point`. Inverse of crashMult. */
export const crashMs = (point: number) =>
  (Math.log(point) / Math.log(1.07)) * 500;
/** Crash: draw the hidden crash point. P(point >= m) = rtp/m, so (1 - rtp) of flights crash instantly at 1.00x. */
export const drawCrash = (rng: () => number) =>
  Math.min(
    CRASH.maxMultiplier,
    Math.max(1, Math.floor((CRASH.rtp * 100) / (1 - rng())) / 100),
  );

const pick = (w: number[], r: number) => {
  let t = r * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    t -= w[i]!;
    if (t < 0) return i;
  }
  return w.length - 1;
};
const rouletteMult = (c: string, n: number): number | null => {
  if (c.startsWith("n:")) {
    const t = Number(c.slice(2));
    if (c.length < 3 || !Number.isInteger(t) || t < 0 || t > 36) return null;
    return t === n ? ROULETTE_PAYS.number : 0;
  }
  const inPlay = n > 0,
    outside = ROULETTE_PAYS.outside,
    dozen = ROULETTE_PAYS.dozen;
  switch (c) {
    case "red":
      return inPlay && REDS.has(n) ? outside : 0;
    case "black":
      return inPlay && !REDS.has(n) ? outside : 0;
    case "odd":
      return inPlay && n % 2 === 1 ? outside : 0;
    case "even":
      return inPlay && n % 2 === 0 ? outside : 0;
    case "low":
      return inPlay && n <= 18 ? outside : 0;
    case "high":
      return n > 18 ? outside : 0;
    case "d1":
      return inPlay && n <= 12 ? dozen : 0;
    case "d2":
      return n > 12 && n <= 24 ? dozen : 0;
    case "d3":
      return n > 24 ? dozen : 0;
    default:
      return null;
  }
};
export interface Outcome {
  payout: number;
  roll: unknown;
  detail: string;
}
/** Instant games only. Crash runs as a live flight on the Ledger. */
export function resolve(
  req: BetReq,
  rng: () => number,
  boost = 0,
): Outcome | null {
  const w = req.wager;
  let o: Outcome | null = null;
  const s = simpleOf(req.game);
  if (s) {
    const opt = s.options.find((x) => x.id === String(req.choice));
    if (!opt) return null;
    const i = pick(
      s.faces.map((f) => f.w),
      rng(),
    );
    o = {
      payout: Math.floor(w * opt.pays[i]!),
      roll: i,
      detail: s.faces[i]!.face,
    };
  } else
    switch (req.game) {
      case "slots": {
        const r = [0, 1, 2].map(() => pick(SYM_W, rng()));
        let m = 0;
        if (r[0] === r[1] && r[1] === r[2]) m = SYM_PAY[r[0]!]!;
        else if (r.filter((x) => x === 0).length === 2)
          m = SLOT_TWO_OF_FIRST_PAYS;
        o = {
          payout: Math.floor(w * m),
          roll: r,
          detail: r.map((i) => SYMBOLS[i]).join(" "),
        };
        break;
      }
      case "roulette": {
        const n = Math.floor(rng() * 37),
          m = rouletteMult(String(req.choice), n);
        if (m === null) return null;
        o = {
          payout: Math.floor(w * m),
          roll: n,
          detail: `Ball landed on ${n}`,
        };
        break;
      }
      case "dice": {
        const a = 1 + Math.floor(rng() * 6),
          b = 1 + Math.floor(rng() * 6),
          s = a + b,
          c = String(req.choice);
        const win =
          c === "over"
            ? s > 7
            : c === "under"
              ? s < 7
              : c === "seven"
                ? s === 7
                : c === "doubles"
                  ? a === b
                  : null;
        if (win === null) return null;
        o = {
          payout: win
            ? Math.floor(w * DICE_PAY[c as keyof typeof DICE_PAY])
            : 0,
          roll: [a, b],
          detail: `Rolled ${a} + ${b} = ${s}`,
        };
        break;
      }
      case "wheel": {
        const i = Math.floor(rng() * WHEEL.length),
          m = WHEEL[i]!;
        o = { payout: Math.floor(w * m), roll: i, detail: `Wheel hit ${m}x` };
        break;
      }
      case "cups": {
        const c = String(req.choice);
        if (c !== "0" && c !== "1" && c !== "2") return null;
        const coin = Math.floor(rng() * 3);
        o = {
          payout: Number(c) === coin ? Math.floor(w * CUP_PAY) : 0,
          roll: coin,
          detail: `The coin was under cup ${coin + 1}`,
        };
        break;
      }
      case "vault": {
        const c = String(req.choice),
          pay = Object.hasOwn(VAULT_PAY, c) ? VAULT_PAY[c] : undefined;
        if (!pay) return null;
        const target = Number(c.slice(1));
        let opened = 0;
        while (opened < target && rng() < LOCK_CHANCE) opened++;
        o = {
          payout: opened === target ? Math.floor(w * pay) : 0,
          roll: { opened, target },
          detail: `Cracked ${opened} of ${target} locks`,
        };
        break;
      }
      default:
        return null;
    }
  if (o.payout > w && isBoostable(req.game))
    o.payout = Math.floor(o.payout * (1 + HOT_MACHINES_BONUS * boost));
  return o;
}
