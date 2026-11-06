import { isBool, isNum, isRec, isStr } from "./guards";
import type { Env, Player, Status } from "../types/net";

/**
 * Peers are untrusted, so every inbound message is checked here before the party sees it.
 * Returns the message when it is well formed and null otherwise.
 * This covers the party protocol only: the party passes `state` and `m` to the running game's validators.
 */
const STATUSES: Status[] = ["idle", "connecting", "lobby", "playing", "error"];

const isPlayer = (x: unknown): x is Player =>
  isRec(x) && isStr(x.id) && isStr(x.name, 32) && isBool(x.ready);
const isPlayers = (x: unknown): x is Player[] =>
  Array.isArray(x) && x.length <= 16 && x.every(isPlayer);

export function parseEnv(raw: unknown): Env | null {
  if (!isRec(raw) || !isStr(raw.sid) || !isNum(raw.v)) return null;
  const m = raw;
  const ok = (() => {
    switch (m.t) {
      case "PLAYER_JOIN":
        return isStr(m.name, 64);
      case "PLAYER_LEAVE":
        return isStr(m.id);
      case "PLAYER_READY":
        return isBool(m.ready);
      case "GAME_START":
      case "GAME_STATE":
      case "ACTION":
      case "EVENT":
      case "PRIVATE":
      case "PEER":
        return true;
      case "RETURN_TO_LOBBY":
        return isPlayers(m.players);
      case "ERROR":
        return isStr(m.msg, 200);
      case "CHAT_SEND":
        return isStr(m.text, 500);
      case "CHAT":
        return isStr(m.from) && isStr(m.text, 500);
      case "STATE_SNAPSHOT":
        return (
          isPlayers(m.players) &&
          isStr(m.hostId) &&
          isStr(m.gameId) &&
          STATUSES.includes(m.status as Status)
        );
      default:
        return false;
    }
  })();
  return ok ? (raw as unknown as Env) : null;
}
