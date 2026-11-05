import type {
  BetReq,
  BetResult,
  GameKind,
  GState,
  Prank,
  PrankKind,
  Tone,
  VoteKind,
} from "../../../types/net";
import { GAME_LABELS, HOT_WIN, machinesFor, ruleFor } from "./floors";
import {
  DARE_WIN_CHANCE,
  FIRST_FLOOR_DEBT,
  FLOOR_PAYDAY,
  HOT_MACHINES_BONUS,
  HOT_MACHINES_MAX_LEVEL,
  SHAKEDOWN_ESCAPE_CHANCE,
  START_CHIPS,
} from "./odds";
import { crashMult, drawCrash, resolve } from "./payouts";
import {
  BRIBE_CUT,
  CLOCK_SECONDS,
  isItem,
  LUCK_CHARGES,
  LUCK_WIN,
  PRANK_SECONDS,
  SHOP_ITEMS,
  type ItemId,
} from "./shop";
export const START_BALANCE = START_CHIPS,
  /** What later floors' debts grow from. Floor 1's own debt is FIRST_FLOOR_DEBT in odds.ts. */
  BASE_QUOTA = 1500,
  ROUND_SECONDS = 300,
  MIN_BET = 10;
/** After this floor the team chooses: walk out free, or play one more floor to buy the casino. */
export const FINAL_FLOOR = 5,
  BUYOUT_MULT = 2;
/** Fermil's marker: chips now for a bigger debt, once per floor. Each marker also adds to every later floor's debt. */
export const LOAN_CHIPS = 300,
  LOAN_DEBT = 500,
  MARKER_INTEREST = 100;
/** Chips per second left on the clock when the debt is paid early. */
export const EARLY_BONUS = 2;
/** Chaos timing, in seconds. No new chaos starts too near the end of a floor, so an event can't outlast the clock. */
export const FIRST_CHAOS = 45,
  CHAOS_GAP = 40,
  CHAOS_CUTOFF = 45,
  EVENT_SECONDS = 30,
  VOTE_SECONDS = 20;
/** These never run hot, because they sit too close to RTP 1 with upgrades. */
const NEVER_HOT: GameKind[] = ["dice", "roulette", "crash"];
const VOTE_KINDS: VoteKind[] = ["dare", "shakedown", "deal"];
export interface ChaosNews {
  text: string;
  tone: Tone;
}
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
    desc: `+${Math.round(HOT_MACHINES_BONUS * 100)}% on wins at most machines`,
    cost: 400,
    max: HOT_MACHINES_MAX_LEVEL,
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
export const quotaFor = (floor: number, debt: number, markers = 0) => {
  const buyout = floor > FINAL_FLOOR ? BUYOUT_MULT : 1;
  const start = floor <= 1 ? FIRST_FLOOR_DEBT : BASE_QUOTA * 1.4 ** (floor - 1);
  const base = start * buyout * (1 - 0.1 * debt);
  return Math.round(base / 10) * 10 + markers * MARKER_INTEREST;
};
/** Chips given before a floor. It follows the base debt, so debt relief and markers don't change it. */
export const paydayFor = (floor: number) =>
  Math.round((quotaFor(floor, 0) * FLOOR_PAYDAY) / 10) * 10;
export const roundTime = (u: Record<string, number>, floor = 1) =>
  ROUND_SECONDS + 30 * (u.time ?? 0) + (ruleFor(floor).clock ?? 0);
export const minBetFor = (floor: number) => ruleFor(floor).minBet ?? MIN_BET;
export const upgradeCost = (id: string, floor: number) =>
  Math.round(UPGRADES[id]!.cost * (ruleFor(floor).shop ?? 1));
/** Sketchy Shop price. It follows the floor's base debt, so bribes and markers don't change it. */
export const itemCost = (id: ItemId, floor: number) =>
  Math.round((quotaFor(floor, 0) * SHOP_ITEMS[id].price) / 10) * 10;
export const newGame = (): GState => ({
  phase: "playing",
  balance: START_BALANCE,
  quota: quotaFor(1, 0),
  floor: 1,
  timeLeft: ROUND_SECONDS,
  upgrades: {},
  shield: 0,
  loanUsed: false,
  markers: 0,
  ending: null,
  bonus: 0,
  payday: 0,
  stats: { bets: 0, won: 0, lost: 0, peak: START_BALANCE, biggest: 0 },
  machines: machinesFor(1),
  event: null,
  vote: null,
  luck: 0,
  reroll: 0,
  bought: {},
  pranks: [],
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
  /** Seconds until the next vote or room event. */
  nextChaos = FIRST_CHAOS;
  constructor(
    public rng: () => number = () =>
      crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32,
    public now: () => number = () => Date.now(),
  ) {}
  /** Shared checks for every wager. Returns an error message, or null when the wager is allowed. */
  private check(req: BetReq, from: string): string | null {
    const g = this.g;
    if (g.phase !== "playing") return "The round is not active.";
    if (this.seen.has(req.id)) return "Duplicate transaction ignored.";
    this.seen.add(req.id);
    if (this.prankOn(from, "cuffs"))
      return "You're in handcuffs! Someone's messing with you.";
    if (
      !g.machines.includes(req.game) ||
      (g.event?.kind === "cut" && g.event.machine === req.game)
    )
      return "This machine is closed right now.";
    const min = minBetFor(g.floor);
    if (!Number.isInteger(req.wager) || req.wager < min)
      return `Minimum wager is ${min} chips.`;
    if (req.wager > g.balance) return "Not enough chips in the shared wallet.";
    return null;
  }
  /** Applies the floor rule and any hot-machine event to a winning payout. */
  private scaleWin(game: GameKind, payout: number, wager: number) {
    if (payout <= wager) return payout;
    const g = this.g,
      hot = g.event?.kind === "hot" && g.event.machine === game ? HOT_WIN : 1;
    return Math.floor(payout * (ruleFor(g.floor).wins?.[game] ?? 1) * hot);
  }
  /** The prank currently on a player, if any. Timed pranks stop counting once their time is up. */
  private prankOn(target: string, kind: PrankKind) {
    const g = this.g;
    return g.pranks.find(
      (p) =>
        p.target === target &&
        p.kind === kind &&
        (p.until === null || g.timeLeft > p.until),
    );
  }
  private spendPrank(prank: Prank) {
    this.g.pranks = this.g.pranks.filter((p) => p !== prank);
  }
  /** Floor rule and hot machine first, then shop items. Returns the payout and notes for the result line. */
  private applyWinEffects(
    game: GameKind,
    payout: number,
    wager: number,
    from: string,
  ) {
    const g = this.g,
      notes: string[] = [];
    let p = this.scaleWin(game, payout, wager);
    if (p > wager && g.luck > 0) {
      g.luck--;
      p = Math.floor(p * LUCK_WIN);
      notes.push("Rabbit's Foot +25%");
    }
    const curse = this.prankOn(from, "curse");
    if (p > wager && curse) {
      this.spendPrank(curse);
      p = wager + Math.floor((p - wager) / 2);
      notes.push("Cursed Coin halved it");
    }
    return { payout: p, notes };
  }
  /** Butterfingers: doubles the wager, up to what the wallet holds. */
  private fumbledWager(wager: number, from: string) {
    return this.prankOn(from, "butter")
      ? Math.min(wager * 2, this.g.balance)
      : wager;
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
      g.balance < minBetFor(g.floor) &&
      g.loanUsed &&
      this.flights.size === 0
    )
      g.phase = "over";
  }
  bet(asked: BetReq, from = ""): { res?: BetResult; err?: string } {
    const g = this.g,
      err = this.check(asked, from);
    if (err) return { err };
    const req = { ...asked, wager: this.fumbledWager(asked.wager, from) },
      boost = g.upgrades.payout ?? 0;
    let o = resolve(req, this.rng, boost);
    if (!o) return { err: "Invalid bet." };
    const notes: string[] = [],
      butter = this.prankOn(from, "butter");
    if (butter) {
      this.spendPrank(butter);
      notes.push("Butterfingers doubled your bet");
    }
    if (o.payout < req.wager && g.reroll > 0) {
      g.reroll--;
      o = resolve(req, this.rng, boost)!;
      notes.push("Marked Cards redrew it");
    }
    const won = this.applyWinEffects(req.game, o.payout, req.wager, from);
    notes.push(...won.notes);
    let payout = won.payout,
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
        detail: [o.detail, ...notes].join(" · "),
        shielded,
      },
    };
  }
  /** Crash: takes the wager now and starts a flight with a hidden crash point. */
  launch(req: BetReq, from: string): { flight?: Flight; err?: string } {
    const err = this.check(req, from);
    if (err) return { err };
    const wager = this.fumbledWager(req.wager, from),
      butter = this.prankOn(from, "butter");
    if (butter) this.spendPrank(butter);
    this.g.balance -= wager;
    const flight = {
      id: req.id,
      from,
      wager,
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
    const won =
      mult === null
        ? { payout: 0, notes: [] as string[] }
        : this.applyWinEffects(
            "crash",
            Math.floor(f.wager * mult),
            f.wager,
            f.from,
          );
    let payout = won.payout,
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
    const detail = [
      mult === null
        ? `Crashed at ${f.point.toFixed(2)}x`
        : `Cashed out at ${mult.toFixed(2)}x (crash ${f.point.toFixed(2)}x)`,
      ...won.notes,
    ].join(" · ");
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
    g.event = null;
    g.vote = null;
    g.pranks = [];
    g.bought = {};
    g.machines = machinesFor(g.floor);
    if (g.floor > FINAL_FLOOR + 1) {
      g.phase = "won";
      g.ending = "owner";
      return;
    }
    g.phase = g.floor > FINAL_FLOOR ? "final" : "upgrades";
    g.quota = quotaFor(g.floor, g.upgrades.debt ?? 0, g.markers);
    if (g.phase === "upgrades") this.givePayday();
  }
  private givePayday() {
    const g = this.g;
    g.payday = paydayFor(g.floor);
    g.balance += g.payday;
    g.stats.peak = Math.max(g.stats.peak, g.balance);
  }
  /** Final choice: keep the chips and leave. Ends the run as a win. */
  walkAway(): boolean {
    const g = this.g;
    if (g.phase !== "final") return false;
    g.phase = "won";
    g.ending = "free";
    return true;
  }
  /** Final choice: take on the buyout floor. The payday comes only now, so walking away can't collect it. */
  buyout(): boolean {
    const g = this.g;
    if (g.phase !== "final") return false;
    g.phase = "upgrades";
    this.givePayday();
    return true;
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
    g.markers++;
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
    const cost = upgradeCost(id, g.floor);
    if (g.balance < cost) return "Not enough chips.";
    g.balance -= cost;
    g.upgrades[id] = (g.upgrades[id] ?? 0) + 1;
    if (id === "shield") g.shield++;
    if (id === "chips") g.balance += 400;
    if (id === "debt")
      g.quota = quotaFor(g.floor, g.upgrades.debt ?? 0, g.markers);
    return null;
  }
  nextFloor(): boolean {
    const g = this.g;
    if (g.phase !== "upgrades") return false;
    g.phase = "playing";
    g.timeLeft = roundTime(g.upgrades, g.floor);
    g.loanUsed = false;
    g.bonus = 0;
    g.payday = 0;
    this.nextChaos = FIRST_CHAOS;
    return true;
  }
  /** Sketchy Shop purchase, paid from the team wallet. Pranks need a target. Returns an error message, or null. */
  buyItem(id: string, from: string, target?: string): string | null {
    const g = this.g;
    if (g.phase !== "playing") return "The shop is only open during a floor.";
    if (!isItem(id)) return "The dealer doesn't sell that.";
    const item = SHOP_ITEMS[id];
    if (item.prank && (!target || target === from))
      return "Pick a friend to prank.";
    if ((g.bought[id] ?? 0) >= item.stock) return "Sold out on this floor.";
    const cost = itemCost(id, g.floor);
    if (g.balance < cost) return "Not enough chips.";
    g.bought[id] = (g.bought[id] ?? 0) + 1;
    if (item.prank) {
      const kind = id as PrankKind,
        secs = PRANK_SECONDS[kind];
      g.pranks = g.pranks.filter(
        (p) => p.until === null || g.timeLeft > p.until,
      );
      g.pranks.push({
        kind,
        target: target!,
        until: secs === undefined ? null : g.timeLeft - secs,
      });
    } else if (id === "charm") g.luck += LUCK_CHARGES;
    else if (id === "marked") g.reroll++;
    else if (id === "bribe") g.quota = Math.round(g.quota * (1 - BRIBE_CUT));
    else this.addTime(CLOCK_SECONDS);
    this.adjust(-cost);
    return null;
  }
  /** Adds to the clock. Everything timed counts down the same clock, so it moves too and keeps its length. */
  private addTime(secs: number) {
    const g = this.g;
    g.timeLeft += secs;
    if (g.event) g.event.until += secs;
    if (g.vote) g.vote.until += secs;
    for (const p of g.pranks) if (p.until !== null) p.until += secs;
  }
  /** Moves the wallet outside a bet (votes and room events), then checks whether that broke the team. */
  private adjust(net: number) {
    const g = this.g,
      s = g.stats;
    g.balance += net;
    if (net > 0) s.won += net;
    else s.lost -= net;
    s.peak = Math.max(s.peak, g.balance);
    this.checkBroke();
  }
  private pick<T>(list: T[]): T {
    return list[Math.floor(this.rng() * list.length)]!;
  }
  /** One second of chaos: closes finished events and votes, or starts something new. Returns what to announce. */
  chaosTick(players: number): ChaosNews | null {
    const g = this.g;
    if (g.phase !== "playing") return null;
    if (g.vote) return this.decideVote(players);
    if (g.event) {
      if (g.timeLeft > g.event.until) return null;
      const { kind, machine } = g.event;
      g.event = null;
      return {
        text: `${GAME_LABELS[machine]} is ${kind === "cut" ? "back open" : "back to normal"}`,
        tone: "info",
      };
    }
    if (--this.nextChaos > 0 || g.timeLeft < CHAOS_CUTOFF) return null;
    this.nextChaos = CHAOS_GAP + Math.floor(this.rng() * CHAOS_GAP);
    return this.rng() < 0.4 ? this.startVote() : this.roomEvent();
  }
  private startVote(): ChaosNews {
    const g = this.g,
      kind = this.pick(VOTE_KINDS);
    g.vote = { kind, until: g.timeLeft - VOTE_SECONDS, yes: [], no: [] };
    return { text: "Fermil wants a team vote", tone: "info" };
  }
  private roomEvent(): ChaosNews {
    const g = this.g,
      roll = this.pick(["hot", "cut", "spill", "pickpocket"] as const);
    if (roll === "hot" || roll === "cut") {
      const machine = this.pick(
        roll === "hot"
          ? g.machines.filter((m) => !NEVER_HOT.includes(m))
          : g.machines,
      );
      g.event = { kind: roll, machine, until: g.timeLeft - EVENT_SECONDS };
      return roll === "hot"
        ? {
            text: `${GAME_LABELS[machine]} is running hot: wins pay +${Math.round((HOT_WIN - 1) * 100)}%`,
            tone: "win",
          }
        : {
            text: `Power cut: ${GAME_LABELS[machine]} is closed for ${EVENT_SECONDS}s`,
            tone: "lose",
          };
    }
    if (roll === "spill") {
      const found = Math.round(g.quota * 0.05);
      this.adjust(found);
      return { text: `A whale spilled their chips: +${found}`, tone: "win" };
    }
    const taken = Math.floor(g.balance * 0.05);
    this.adjust(-taken);
    return { text: `Pickpocket! -${taken}`, tone: "lose" };
  }
  /** Records a vote. Each player votes once. */
  castVote(id: string, yes: boolean): boolean {
    const v = this.g.vote;
    if (
      !v ||
      this.g.phase !== "playing" ||
      v.yes.includes(id) ||
      v.no.includes(id)
    )
      return false;
    (yes ? v.yes : v.no).push(id);
    return true;
  }
  /** Settles the vote once a majority is reached or time is up. A tie or no votes counts as no. */
  decideVote(players: number): ChaosNews | null {
    const g = this.g,
      v = g.vote;
    if (!v) return null;
    const yes = v.yes.length,
      no = v.no.length;
    if (yes * 2 <= players && no * 2 < players && g.timeLeft > v.until)
      return null;
    g.vote = null;
    return this.applyVote(v.kind, yes > no);
  }
  private applyVote(kind: VoteKind, passed: boolean): ChaosNews {
    const g = this.g;
    if (kind === "dare") {
      if (!passed)
        return { text: "The team passed on Fermil's dare", tone: "info" };
      const swing = Math.floor(g.balance * 0.25),
        won = this.rng() < DARE_WIN_CHANCE;
      this.adjust(won ? swing : -swing);
      return won
        ? { text: `The team won the dare: +${swing}`, tone: "win" }
        : { text: `The team lost the dare: -${swing}`, tone: "lose" };
    }
    if (kind === "shakedown") {
      if (passed) {
        const fee = Math.floor(g.balance * 0.1);
        this.adjust(-fee);
        return { text: `The team paid the collector: -${fee}`, tone: "lose" };
      }
      if (this.rng() < SHAKEDOWN_ESCAPE_CHANCE)
        return { text: "The team refused and got away with it", tone: "win" };
      const taken = Math.floor(g.balance * 0.2);
      this.adjust(-taken);
      return {
        text: `The team refused and the collector took ${taken}`,
        tone: "lose",
      };
    }
    if (!passed)
      return { text: "The team walked away from the side deal", tone: "info" };
    const chips = 200 * g.floor;
    g.quota += 300 * g.floor;
    this.adjust(chips);
    return {
      text: `Side deal done: +${chips}, debt +${300 * g.floor}`,
      tone: "info",
    };
  }
}
