import type { HostContext, HostGame } from "../../../types/game";
import { Ledger, type ChaosNews } from "../mechanics/engine";
import { crashMs } from "../mechanics/payouts";
import { SHOP_ITEMS, type ItemId } from "../mechanics/shop";
import type { Action, BetReq, BetResult, Event, GState } from "../types";

/** The casino's rules, which run in the host's browser only. */
export function createHost(ctx: HostContext<Event>): HostGame<GState, Action> {
  const ledger = new Ledger(),
    flightTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const { nameOf } = ctx;
  const refuse = (to: string, id: string, err: string) =>
    ctx.sendTo(to, { t: "BET_RESULT", id, err });

  /** Broadcasts finished bets, then the state, which also tells everyone if those bets ended the run. */
  function publish(results: BetResult[]) {
    if (!results.length) return;
    for (const res of results) {
      clearTimeout(flightTimers.get(res.id));
      flightTimers.delete(res.id);
      ctx.emit({ t: "BET_RESULT", id: res.id, res });
    }
    ctx.publish();
  }
  /** Sends the state (with game over, if the chaos broke the team), then the feed line. */
  function announceChaos(news: ChaosNews | null) {
    if (!news) return;
    ctx.publish();
    ctx.emit({ t: "NOTICE", text: news.text, tone: news.tone });
  }
  function tick() {
    // Flights can't outlive the round, so they cash out on its final second.
    if (ledger.g.phase === "playing" && ledger.g.timeLeft <= 1)
      publish(ledger.cashAll());
    if (ledger.g.phase !== "playing") return;
    const r = ledger.tick();
    ctx.publish();
    if (r !== "floor" && r !== "over")
      announceChaos(ledger.chaosTick(ctx.players().length));
  }
  function bet(from: string, req: BetReq) {
    if (req.game === "crash") {
      const { flight, err } = ledger.launch(req, from);
      if (!flight) return refuse(from, req.id, err ?? "Bet rejected.");
      ctx.sendTo(from, { t: "CRASH_LIVE", id: flight.id });
      flightTimers.set(
        flight.id,
        setTimeout(() => {
          const res = ledger.bust(flight.id);
          if (res) publish([res]);
        }, crashMs(flight.point)),
      );
      ctx.publish();
      return;
    }
    const { res, err } = ledger.bet(req, from);
    if (!res) return refuse(from, req.id, err ?? "Bet rejected.");
    res.from = from;
    publish([res]);
  }
  function cashOut(from: string, id: string) {
    const { res } = ledger.cashOut(id, from); // No flight means it already crashed, and the bettor has been told.
    if (res) publish([res]);
  }
  function buyUpgrade(from: string, id: string) {
    const err = ledger.buy(id);
    if (err) return refuse(from, "upgrade", err);
    ctx.publish();
    ctx.emit({
      t: "NOTICE",
      text: `${nameOf(from)} bought an upgrade`,
      tone: "info",
    });
  }
  function payDebt(from: string) {
    if (ledger.g.phase !== "playing" || ledger.g.balance < ledger.g.quota)
      return;
    publish(ledger.cashAll());
    const bonus = ledger.payDebt();
    if (bonus === null) return;
    ctx.publish();
    ctx.emit({
      t: "NOTICE",
      text: `${nameOf(from)} paid the debt early · +${bonus} bonus`,
      tone: "win",
    });
  }
  function takeLoan(from: string) {
    if (!ledger.takeLoan()) return;
    ctx.publish();
    ctx.emit({
      t: "NOTICE",
      text: `${nameOf(from)} took Janny's marker`,
      tone: "lose",
    });
  }
  function vote(from: string, yes: boolean) {
    if (!ledger.castVote(from, yes)) return;
    const news = ledger.decideVote(ctx.players().length);
    if (news) announceChaos(news);
    else ctx.publish();
  }
  /** Pranks are anonymous on purpose: the team sees who got hit, not who paid for it. */
  function shop(from: string, id: string, target?: string) {
    if (target !== undefined && !ctx.players().some((p) => p.id === target))
      return refuse(from, "upgrade", "That player is not here.");
    const err = ledger.buyItem(id, from, target);
    if (err) return refuse(from, "upgrade", err);
    ctx.publish();
    const item = SHOP_ITEMS[id as ItemId];
    ctx.emit(
      item.prank
        ? {
            t: "NOTICE",
            text: `Someone slipped ${nameOf(target!)} a ${item.name}!`,
            tone: "lose",
          }
        : {
            t: "NOTICE",
            text: `${nameOf(from)} bought ${item.name} from the dealer`,
            tone: "win",
          },
    );
  }

  const ticker = setInterval(tick, 1000);
  return {
    state: () => ledger.g,
    onAction(from, a) {
      switch (a.t) {
        case "BET_REQUEST":
          return bet(from, a.req);
        case "CRASH_CASHOUT":
          return cashOut(from, a.id);
        case "UPGRADE_PURCHASE":
          return buyUpgrade(from, a.id);
        case "PAY_DEBT":
          return payDebt(from);
        case "TAKE_LOAN":
          return takeLoan(from);
        case "VOTE_CAST":
          return vote(from, a.yes);
        case "SHOP_BUY":
          return shop(from, a.id, a.target);
      }
      // The rest are the host's decisions.
      if (from !== ctx.selfId) return;
      const done =
        a.t === "NEXT_FLOOR"
          ? ledger.nextFloor()
          : a.t === "WALK_AWAY"
            ? ledger.walkAway()
            : ledger.buyout();
      if (done) ctx.publish();
    },
    onPlayerLeave(id) {
      publish(ledger.cashAll(id));
      ctx.emit({
        t: "NOTICE",
        text: `${nameOf(id)} left the party`,
        tone: "info",
      });
    },
    dispose() {
      clearInterval(ticker);
      for (const t of flightTimers.values()) clearTimeout(t);
      flightTimers.clear();
    },
  };
}
