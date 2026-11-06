import {
  nameOf,
  selfId,
  sendAction,
  sendToPeers,
} from "../../../multiplayer/party";
import type { ClientHooks } from "../../../types/game";
import { positions, resetCasino, useCasino } from "../store";
import type {
  Action,
  BetReq,
  BetResult,
  Event,
  GameKind,
  Peer,
  Tone,
} from "../types";

const BET_TIMEOUT = 8000,
  FLIGHT_TIMEOUT = 60000;
interface Pending {
  resolve: (r: BetResult) => void;
  reject: (e: Error) => void;
  onLive?: () => void;
  timer: ReturnType<typeof setTimeout>;
}
const pending = new Map<string, Pending>();
let feedId = 0,
  fxN = 0;
const send = (a: Action) => sendAction(a);

export const addFeed = (text: string, tone: Tone = "info") =>
  useCasino.setState((s) => ({
    feed: [{ id: ++feedId, text, tone }, ...s.feed].slice(0, 6),
  }));
/** Fires the casino effects and feed line for a finished bet. The bettor's own panel calls this once its animation lands. */
export function announceResult(r: BetResult) {
  addFeed(
    `${nameOf(r.from)} · ${r.game}: ${r.net >= 0 ? "+" : ""}${r.net}`,
    r.net > 0 ? "win" : r.net < 0 ? "lose" : "info",
  );
  useCasino.setState({ fx: { n: ++fxN, result: r } });
}
/** Settles the promise returned by sendBet. Unknown ids are ignored. */
function settle(id: string, res: BetResult | null, err?: string) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  clearTimeout(p.timer);
  if (res) p.resolve(res);
  else p.reject(new Error(err ?? "Bet rejected."));
}

/** Places a bet. Resolves with the result, or rejects with a message to show the player. For crash, `onLive` fires when the flight starts. */
export function sendBet(req: BetReq, onLive?: () => void): Promise<BetResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => settle(req.id, null, "The host did not respond. Try again."),
      BET_TIMEOUT,
    );
    pending.set(req.id, { resolve, reject, onLive, timer });
    send({ t: "BET_REQUEST", req });
  });
}
export const cashOut = (id: string) => send({ t: "CRASH_CASHOUT", id });
export const buyUpgrade = (id: string) => send({ t: "UPGRADE_PURCHASE", id });
export const payDebt = () => send({ t: "PAY_DEBT" });
export const takeLoan = () => send({ t: "TAKE_LOAN" });
export const castVote = (yes: boolean) => send({ t: "VOTE_CAST", yes });
export const buyItem = (id: string, target?: string) =>
  send({ t: "SHOP_BUY", id, target });
export const nextFloor = () => send({ t: "NEXT_FLOOR" });
export const walkAway = () => send({ t: "WALK_AWAY" });
export const buyout = () => send({ t: "BUYOUT" });

const toPeers = (m: Peer) => sendToPeers(m);
export const sendMove = (x: number, y: number) =>
  toPeers({ t: "PLAYER_MOVE", x, y });
export function announceMachine(machine: GameKind) {
  toPeers({ t: "MACHINE_INTERACT", machine });
  addFeed(`${nameOf(selfId)} sat at ${machine}`);
}

export const client: ClientHooks<Event, Peer> = {
  onStart: resetCasino,
  onStop() {
    for (const id of [...pending.keys()])
      settle(id, null, "Disconnected from the party.");
    resetCasino();
  },
  onEvent(e) {
    switch (e.t) {
      case "BET_RESULT":
        if (e.err) {
          if (e.id === "upgrade") useCasino.setState({ toast: e.err });
          else settle(e.id, null, e.err);
        } else if (e.res) {
          const r = e.res;
          // The bettor's panel announces its own result when the animation finishes.
          if (pending.has(r.id)) settle(r.id, r);
          else if (r.from !== selfId) announceResult(r);
        }
        break;
      case "CRASH_LIVE": {
        const p = pending.get(e.id);
        if (!p) break;
        p.onLive?.();
        clearTimeout(p.timer);
        p.timer = setTimeout(
          () => settle(e.id, null, "Lost contact with the host."),
          FLIGHT_TIMEOUT,
        );
        break;
      }
      case "NOTICE":
        addFeed(e.text, e.tone);
        break;
    }
  },
  onPeer(from, m) {
    if (m.t === "PLAYER_MOVE") positions[from] = { x: m.x, y: m.y };
    else addFeed(`${nameOf(from)} sat at ${m.machine}`);
  },
  onPlayerLeave(id) {
    delete positions[id];
  },
};
