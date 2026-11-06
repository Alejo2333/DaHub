import { describe, expect, it } from "vitest";
import { SIMPLE_KINDS, type SimpleKind } from "../types";
import { WHEEL_ORDER } from "../ui/wheelLayout";
import { newGame, quotaFor } from "./engine";
import { FLOORS } from "./floors";
import {
  CRASH,
  CUP_PAYS,
  DARE_WIN_CHANCE,
  DICE_PAYS,
  FIRST_FLOOR_DEBT,
  FLOOR_PAYDAY,
  HOT_MACHINES_BONUS,
  HOT_MACHINES_MAX_LEVEL,
  ROULETTE_PAYS,
  SHAKEDOWN_ESCAPE_CHANCE,
  SLOT_SYMBOLS,
  SLOT_TWO_OF_FIRST_PAYS,
  START_CHIPS,
  VAULT_LOCK_CHANCE,
  VAULT_PAYS,
  WHEEL_SEGMENTS,
} from "./odds";
import { bestRtp, optionRtp, SIMPLE } from "./simple";
import { ODDS, isBoostable } from "./payouts";

/**
 * These check the real numbers in odds.ts, so a failure here means a change has unbalanced the game.
 * Rebalancing freely is fine as long as they pass.
 */
const FULL_UPGRADE = 1 + HOT_MACHINES_BONUS * HOT_MACHINES_MAX_LEVEL;

describe("every game favours the house", () => {
  it("slots, including the Hot Machines upgrade", () => {
    const total = SLOT_SYMBOLS.reduce((a, s) => a + s.weight, 0),
      first = SLOT_SYMBOLS[0]!.weight / total;
    const rtp =
      SLOT_SYMBOLS.reduce((a, s) => a + (s.weight / total) ** 3 * s.pays, 0) +
      3 * first ** 2 * (1 - first) * SLOT_TWO_OF_FIRST_PAYS;
    expect(rtp * FULL_UPGRADE).toBeLessThan(1);
  });
  it("lucky wheel, including the Hot Machines upgrade", () => {
    const rtp =
      WHEEL_SEGMENTS.reduce((a, b) => a + b, 0) / WHEEL_SEGMENTS.length;
    expect(rtp * FULL_UPGRADE).toBeLessThan(1);
  });
  it("dice, including the Hot Machines upgrade", () => {
    expect((DICE_PAYS.over * 15) / 36).toBeLessThan(1 / FULL_UPGRADE);
    expect((DICE_PAYS.under * 15) / 36).toBeLessThan(1 / FULL_UPGRADE);
    expect((DICE_PAYS.seven * 6) / 36).toBeLessThan(1 / FULL_UPGRADE);
    expect((DICE_PAYS.doubles * 6) / 36).toBeLessThan(1 / FULL_UPGRADE);
  });
  it("roulette", () => {
    expect((ROULETTE_PAYS.outside * 18) / 37).toBeLessThan(1);
    expect((ROULETTE_PAYS.dozen * 12) / 37).toBeLessThan(1);
    expect(ROULETTE_PAYS.number / 37).toBeLessThan(1);
  });
  it("crash", () => {
    expect(CRASH.rtp).toBeGreaterThan(0);
    expect(CRASH.rtp).toBeLessThan(1);
    expect(CRASH.maxMultiplier).toBeGreaterThan(1);
  });
  it("shell game", () => expect(CUP_PAYS / 3).toBeLessThan(1));
  it("vault cracker", () => {
    for (const [k, p] of Object.entries(VAULT_PAYS))
      expect(p * VAULT_LOCK_CHANCE ** Number(k.slice(1)), k).toBeLessThan(1);
  });
  it("Janny's dare", () => expect(DARE_WIN_CHANCE).toBeLessThan(0.5));
  it("table games, on every bet", () => {
    for (const k of SIMPLE_KINDS) {
      const g = SIMPLE[k];
      for (const o of g.options) {
        const bet = `${k}/${o.id}`;
        expect(optionRtp(g, o), bet).toBeLessThan(1);
        expect(optionRtp(g, o), bet).toBeGreaterThan(0.8);
      }
    }
  });
  it("Hot Machines never lifts a table game past RTP 1", () => {
    for (const k of SIMPLE_KINDS)
      if (isBoostable(k))
        expect(bestRtp(SIMPLE[k]) * FULL_UPGRADE, k).toBeLessThan(1);
  });
  it("floor rules never lift a table game past RTP 1", () => {
    for (const floor of FLOORS)
      for (const [k, wins] of Object.entries(floor.wins ?? {})) {
        const kind = k as SimpleKind,
          g = SIMPLE[kind];
        if (g && wins > 1)
          expect(
            bestRtp(g) * wins * (isBoostable(kind) ? FULL_UPGRADE : 1),
            k,
          ).toBeLessThan(1);
      }
  });
});

describe("the odds are set up correctly", () => {
  it("every table bet has one payout per result", () => {
    for (const k of SIMPLE_KINDS)
      for (const o of SIMPLE[k].options)
        expect(o.pays, `${k}/${o.id}`).toHaveLength(SIMPLE[k].faces.length);
  });
  it("weights and payouts are never negative", () => {
    for (const k of SIMPLE_KINDS) {
      for (const f of SIMPLE[k].faces)
        expect(f.w, `${k}: ${f.face}`).toBeGreaterThan(0);
      for (const o of SIMPLE[k].options)
        for (const p of o.pays)
          expect(p, `${k}/${o.id}`).toBeGreaterThanOrEqual(0);
    }
    for (const s of SLOT_SYMBOLS) expect(s.weight, s.icon).toBeGreaterThan(0);
  });
  it("chances are between 0 and 1", () => {
    for (const c of [
      VAULT_LOCK_CHANCE,
      DARE_WIN_CHANCE,
      SHAKEDOWN_ESCAPE_CHANCE,
    ]) {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
  it("the payday is not negative", () =>
    expect(FLOOR_PAYDAY).toBeGreaterThanOrEqual(0));
  it("floor 1 can't be cleared without winning a bet", () =>
    expect(START_CHIPS).toBeLessThan(FIRST_FLOOR_DEBT));
  it("a game starts with the configured chips and debt", () => {
    const g = newGame();
    expect(g.balance).toBe(START_CHIPS);
    expect(g.quota).toBe(quotaFor(1, 0));
  });
  it("the wheel layout covers every segment", () =>
    expect([...WHEEL_ORDER].sort((a, b) => a - b)).toEqual(
      WHEEL_SEGMENTS.map((_, i) => i),
    ));
  it("the odds text shows the configured numbers", () => {
    expect(ODDS.cups).toContain(`${CUP_PAYS}x`);
    expect(ODDS.roulette).toContain(`${ROULETTE_PAYS.number}x`);
    expect(ODDS.crash).toContain(`${CRASH.maxMultiplier}x`);
  });
});
