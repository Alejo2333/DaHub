import type { BetReq, BetResult, GState } from "../../../types/net";
import { crashMult, drawCrash, resolve } from "./payouts";
export const START_BALANCE = 1000,
  BASE_QUOTA = 2000,
  ROUND_SECONDS = 300,
  MIN_BET = 10;
/** Loan shark: chips now in exchange for a bigger debt, once per floor. */
export const LOAN_CHIPS = 300,
  LOAN_DEBT = 500;
/** Chips per second left on the clock when the debt is paid early. */
export const EARLY_BONUS = 2;
export const UPGRADES: Record<
  string,
  { name: string; desc: string; cost: number; max: number; icon: string }
> = {
  time: {
    name: "Extra Time",
    desc: "+30s on every floor",
    cost: 300,
    max: 3,
    icon: "⏱️",
  },
  payout: {
    name: "Hot Machines",
    desc: "+4% on winning slots, dice and wheel",
    cost: 400,
    max: 2,
    icon: "🔥",
  },
  debt: {
    name: "Debt Relief",
    desc: "-10% quota",
    cost: 350,
    max: 3,
    icon: "📉",
  },
  shield: {
    name: "Loss Shield",
    desc: "Refunds 50% of your next losing bet",
    cost: 250,
    max: 3,
    icon: "🛡️",
  },
  chips: {
    name: "Chip Loan",
    desc: "+400 chips (once per run)",
    cost: 300,
    max: 1,
    icon: "💰",
  },
};
export const quotaFor = (floor: number, debt: number) =>
  Math.round((BASE_QUOTA * 1.5 ** (floor - 1) * (1 - 0.1 * debt)) / 10) * 10;
export const roundTime = (u: Record<string, number>) =>
  ROUND_SECONDS + 30 * (u.time ?? 0);
export const newGame = (): GState => ({
  phase: "playing",
  balance: START_BALANCE,
  quota: BASE_QUOTA,
  floor: 1,
  timeLeft: ROUND_SECONDS,
  upgrades: {},
  shield: 0,
  loanUsed: false,
  bonus: 0,
  stats: { bets: 0, won: 0, lost: 0, peak: START_BALANCE, biggest: 0 },
});
export interface Flight {
  id: string;
  from: string;
  wager: number;
  point: number;
  start: number;
}
/** Host-side authoritative wallet. NOT tamper-proof: a peer host can edit its own memory. Fictional chips only. */
export class Ledger {
  g = newGame();
  seen = new Set<string>();
  flights = new Map<string, Flight>();
  constructor(
    public rng: () => number = () =>
      crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32,
    public now: () => number = () => Date.now(),
  ) {}
  /** Shared checks for every wager. Returns an error message, or null when the wager is allowed. */
  private check(req: BetReq): string | null {
    const g = this.g;
    if (g.phase !== "playing") return "The round is not active.";
    if (this.seen.has(req.id)) return "Duplicate transaction ignored.";
    this.seen.add(req.id);
    if (!Number.isInteger(req.wager) || req.wager < MIN_BET)
      return `Minimum wager is ${MIN_BET} chips.`;
    if (req.wager > g.balance) return "Not enough chips in the shared wallet.";
    return null;
  }
  /** Books a finished bet, and ends the run if the team is broke with nothing left to save it. */
  private record(net: number) {
    const s = this.g.stats;
    s.bets++;
    if (net > 0) {
      s.won += net;
      s.biggest = Math.max(s.biggest, net);
    } else s.lost -= net;
    s.peak = Math.max(s.peak, this.g.balance);
    this.checkBroke();
  }
  private checkBroke() {
    const g = this.g;
    if (
      g.phase === "playing" &&
      g.balance < MIN_BET &&
      g.loanUsed &&
      this.flights.size === 0
    )
      g.phase = "over";
  }
  bet(req: BetReq): { res?: BetResult; err?: string } {
    const g = this.g,
      err = this.check(req);
    if (err) return { err };
    const o = resolve(req, this.rng, g.upgrades.payout ?? 0);
    if (!o) return { err: "Invalid bet." };
    let payout = o.payout,
      net = payout - req.wager,
      shielded = false;
    if (net < 0 && g.shield > 0) {
      const r = Math.floor(-net * 0.5);
      payout += r;
      net += r;
      g.shield--;
      shielded = true;
    }
    g.balance += net;
    this.record(net);
    return {
      res: {
        id: req.id,
        from: "",
        game: req.game,
        wager: req.wager,
        payout,
        net,
        roll: o.roll,
        detail: o.detail,
        shielded,
      },
    };
  }
  /** Crash: takes the wager now and starts a flight with a hidden crash point. */
  launch(req: BetReq, from: string): { flight?: Flight; err?: string } {
    const err = this.check(req);
    if (err) return { err };
    this.g.balance -= req.wager;
    const flight = {
      id: req.id,
      from,
      wager: req.wager,
      point: drawCrash(this.rng),
      start: this.now(),
    };
    this.flights.set(req.id, flight);
    return { flight };
  }
  /** Crash: ends a flight. `mult` is what it cashed out at, or null if it crashed. */
  private land(f: Flight, mult: number | null): BetResult {
    const g = this.g;
    this.flights.delete(f.id);
    let payout = mult === null ? 0 : Math.floor(f.wager * mult),
      net = payout - f.wager,
      shielded = false;
    if (net < 0 && g.shield > 0) {
      const r = Math.floor(-net * 0.5);
      payout += r;
      net += r;
      g.shield--;
      shielded = true;
    }
    g.balance += payout;
    this.record(net);
    const detail =
      mult === null
        ? `Crashed at ${f.point.toFixed(2)}x`
        : `Cashed out at ${mult.toFixed(2)}x (crash ${f.point.toFixed(2)}x)`;
    return {
      id: f.id,
      from: f.from,
      game: "crash",
      wager: f.wager,
      payout,
      net,
      roll: f.point,
      detail,
      shielded,
    };
  }
  /** Crash: the player's cash-out, judged on the host's clock. Too late means the flight already crashed. */
  cashOut(id: string, from: string): { res?: BetResult; err?: string } {
    const f = this.flights.get(id);
    if (!f || f.from !== from) return { err: "That flight is over." };
    const m = Math.floor(crashMult(this.now() - f.start) * 100) / 100;
    return { res: this.land(f, m >= f.point ? null : m) };
  }
  bust(id: string): BetResult | null {
    const f = this.flights.get(id);
    return f ? this.land(f, null) : null;
  }
  /** Cashes out flights at their current multiplier (round end, or the player disconnected). */
  cashAll(from?: string): BetResult[] {
    return [...this.flights.values()]
      .filter((f) => from === undefined || f.from === from)
      .map((f) => this.cashOut(f.id, f.from).res!);
  }
  private clearFloor(bonus: number) {
    const g = this.g;
    g.balance += bonus - g.quota;
    g.bonus = bonus;
    g.floor++;
    g.phase = "upgrades";
    g.quota = quotaFor(g.floor, g.upgrades.debt ?? 0);
  }
  /** One second of round time. Returns the transition that happened, if any. */
  tick(): "floor" | "over" | null {
    const g = this.g;
    if (g.phase !== "playing") return null;
    if (--g.timeLeft > 0) return null;
    if (g.balance >= g.quota) {
      this.clearFloor(0);
      return "floor";
    }
    g.phase = "over";
    return "over";
  }
  /** Pays the debt before time runs out. Unused seconds become bonus chips. Returns the bonus, or null if not allowed. */
  payDebt(): number | null {
    const g = this.g;
    if (g.phase !== "playing" || g.balance < g.quota) return null;
    const bonus = g.timeLeft * EARLY_BONUS;
    this.clearFloor(bonus);
    return bonus;
  }
  takeLoan(): boolean {
    const g = this.g;
    if (g.phase !== "playing" || g.loanUsed) return false;
    g.loanUsed = true;
    g.balance += LOAN_CHIPS;
    g.quota += LOAN_DEBT;
    g.stats.peak = Math.max(g.stats.peak, g.balance);
    return true;
  }
  buy(id: string): string | null {
    const g = this.g,
      u = Object.hasOwn(UPGRADES, id) ? UPGRADES[id] : undefined;
    if (!u || g.phase !== "upgrades")
      return "Upgrades are only available between floors.";
    if ((g.upgrades[id] ?? 0) >= u.max) return "Upgrade maxed out.";
    if (g.balance < u.cost) return "Not enough chips.";
    g.balance -= u.cost;
    g.upgrades[id] = (g.upgrades[id] ?? 0) + 1;
    if (id === "shield") g.shield++;
    if (id === "chips") g.balance += 400;
    if (id === "debt") g.quota = quotaFor(g.floor, g.upgrades.debt ?? 0);
    return null;
  }
  nextFloor(): boolean {
    const g = this.g;
    if (g.phase !== "upgrades") return false;
    g.phase = "playing";
    g.timeLeft = roundTime(g.upgrades);
    g.loanUsed = false;
    g.bonus = 0;
    return true;
  }
}
