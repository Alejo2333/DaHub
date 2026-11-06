import {
  isBool,
  isIds,
  isNum,
  isRec,
  isStr,
} from "../../../multiplayer/guards";
import {
  GAME_KINDS,
  PRANK_KINDS,
  type Action,
  type BetReq,
  type Event,
  type GameKind,
  type GState,
  type Peer,
  type PrankKind,
} from "../types";

/** Peers are untrusted, so every casino message is checked here before the game sees it. */
const isKind = (x: unknown): x is GameKind =>
  GAME_KINDS.includes(x as GameKind);
const isBet = (x: unknown): x is BetReq =>
  isRec(x) &&
  isStr(x.id) &&
  isKind(x.game) &&
  isNum(x.wager) &&
  (isStr(x.choice, 16) || isNum(x.choice));
const isEvent_ = (x: unknown) =>
  isRec(x) &&
  (x.kind === "hot" || x.kind === "cut") &&
  isKind(x.machine) &&
  isNum(x.until);
const isVote = (x: unknown) =>
  isRec(x) &&
  (x.kind === "dare" || x.kind === "shakedown" || x.kind === "deal") &&
  isNum(x.until) &&
  isIds(x.yes) &&
  isIds(x.no);
const isPrank = (x: unknown) =>
  isRec(x) &&
  PRANK_KINDS.includes(x.kind as PrankKind) &&
  isStr(x.target) &&
  (x.until === null || isNum(x.until));

export function isState(x: unknown): x is GState {
  if (!isRec(x) || !isRec(x.stats) || !isRec(x.upgrades)) return false;
  const s = x.stats;
  return (
    (x.phase === "playing" ||
      x.phase === "upgrades" ||
      x.phase === "final" ||
      x.phase === "won" ||
      x.phase === "over") &&
    [
      x.balance,
      x.quota,
      x.floor,
      x.timeLeft,
      x.shield,
      x.markers,
      x.bonus,
      x.payday,
      s.bets,
      s.won,
      s.lost,
      s.peak,
      s.biggest,
    ].every(isNum) &&
    isBool(x.loanUsed) &&
    (x.ending === null || x.ending === "free" || x.ending === "owner") &&
    Object.values(x.upgrades).every(isNum) &&
    Array.isArray(x.machines) &&
    x.machines.every(isKind) &&
    (x.event === null || isEvent_(x.event)) &&
    (x.vote === null || isVote(x.vote)) &&
    isNum(x.luck) &&
    isNum(x.reroll) &&
    isRec(x.bought) &&
    Object.values(x.bought).every(isNum) &&
    Array.isArray(x.pranks) &&
    x.pranks.length <= 64 &&
    x.pranks.every(isPrank)
  );
}

export function isAction(m: unknown): m is Action {
  if (!isRec(m)) return false;
  switch (m.t) {
    case "BET_REQUEST":
      return isBet(m.req);
    case "CRASH_CASHOUT":
    case "UPGRADE_PURCHASE":
      return isStr(m.id);
    case "PAY_DEBT":
    case "TAKE_LOAN":
    case "NEXT_FLOOR":
    case "WALK_AWAY":
    case "BUYOUT":
      return true;
    case "VOTE_CAST":
      return isBool(m.yes);
    case "SHOP_BUY":
      return isStr(m.id) && (m.target === undefined || isStr(m.target));
    default:
      return false;
  }
}

export function isEvent(m: unknown): m is Event {
  if (!isRec(m)) return false;
  switch (m.t) {
    case "BET_RESULT":
      return (
        isStr(m.id) &&
        (m.err === undefined || isStr(m.err, 200)) &&
        (m.res === undefined ||
          (isRec(m.res) &&
            isStr(m.res.id) &&
            isStr(m.res.from) &&
            isKind(m.res.game) &&
            isNum(m.res.wager) &&
            isNum(m.res.payout) &&
            isNum(m.res.net) &&
            isStr(m.res.detail, 200)))
      );
    case "CRASH_LIVE":
      return isStr(m.id);
    case "NOTICE":
      return (
        isStr(m.text, 200) &&
        (m.tone === "win" || m.tone === "lose" || m.tone === "info")
      );
    default:
      return false;
  }
}

export function isPeer(m: unknown): m is Peer {
  if (!isRec(m)) return false;
  if (m.t === "PLAYER_MOVE") return isNum(m.x) && isNum(m.y);
  return m.t === "MACHINE_INTERACT" && isKind(m.machine);
}
