import {
  getRelaySockets,
  joinRoom,
  selfId,
  type JoinRoomConfig,
} from "trystero/nostr";
import type { Env } from "../types/net";
export { selfId };
export interface Room {
  send: (e: Env, to?: string) => void;
  leave: () => void;
}
/** Pinned because Trystero's default list includes relays that are down or reject its events. Each of these delivered a test offer. */
const RELAY_URLS = [
  "nos.lol",
  "nostr.sathoarder.com",
  "relay.mostro.network",
  "nostr.data.haus",
  "yabu.me/v2",
].map((h) => "wss://" + h);
/** True if at least one signalling relay is connected. */
export const relayConnected = () =>
  Object.values(getRelaySockets() as Record<string, WebSocket>).some(
    (s) => s.readyState === WebSocket.OPEN,
  );
/** Typed, game-agnostic Trystero wrapper. One data channel ("m") carries every typed message. */
export function openRoom(
  code: string,
  onMsg: (e: Env, from: string) => void,
  onJoin: (id: string) => void,
  onLeave: (id: string) => void,
): Room {
  const turnUrls = ((import.meta.env.VITE_TURN_URL as string | undefined) ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  const turnConfig = turnUrls.length
    ? [
        {
          urls: turnUrls,
          username: import.meta.env.VITE_TURN_USER as string,
          credential: import.meta.env.VITE_TURN_PASS as string,
        },
      ]
    : [];
  const config: JoinRoomConfig = {
    appId: (import.meta.env.VITE_APP_ID as string) || "lucky-debt-hub-v1",
    relayConfig: { urls: RELAY_URLS },
    turnConfig,
  };
  const room = joinRoom(config, "ld-" + code);
  const action = room.makeAction("m");
  action.onMessage = (e, { peerId }) => onMsg(e as unknown as Env, peerId);
  room.onPeerJoin = onJoin;
  room.onPeerLeave = onLeave;
  return {
    send: (e, to) => {
      void action.send(e as never, to ? { target: to } : undefined);
    },
    leave: () => {
      void room.leave();
    },
  };
}
