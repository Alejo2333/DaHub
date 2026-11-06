import { openRoom, relayConnected, selfId, type Room } from "./room";
import { parseEnv } from "./validate";
import { useApp } from "../stores/app";
import type { GameModule, HostContext, HostGame } from "../types/game";
import type { Env, Msg } from "../types/net";
export { selfId };
export const MAX_CHAT = 120;
const CHAT_GAP = 400,
  CHAT_HISTORY = 50;
const JOIN_TIMEOUT = 30000;
/**
 * Rooms, the roster, ready checks, chat, sessions and message versions, for any game.
 * Nothing in this folder imports from `games/`: the running game is passed in and reached through `GameModule.net`.
 */
type FindGame = (id: string) => GameModule | undefined;
let room: Room | null = null,
  v = 0,
  lastV = -1,
  chatId = 0,
  /** The game this party plays. */
  active: GameModule | null = null,
  findGame: FindGame | null = null,
  /** The authoritative game. Only the host has one, and only during a game. */
  host: HostGame<unknown, unknown> | null = null,
  /** Whether this client's `onStart` has run without its `onStop`. */
  clientOn = false;
let jt: ReturnType<typeof setTimeout> | undefined;
const lastChat = new Map<string, number>();
const st = useApp.getState,
  set = useApp.setState;
export const isHost = () => st().hostId === selfId;
export const newId = () => crypto.randomUUID();
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
export const nameOf = (id: string) =>
  id === selfId
    ? st().name
    : (st().players.find((p) => p.id === id)?.name ?? "Someone");

function startClient() {
  if (clientOn) return;
  clientOn = true;
  active?.net.client?.onStart?.();
}
function stopClient() {
  if (!clientOn) return;
  clientOn = false;
  active?.net.client?.onStop?.();
}
function stopGame() {
  host?.dispose();
  host = null;
  stopClient();
}
const fail = (error: string) => {
  cleanup();
  set({
    status: "error",
    error,
    gameId: "",
    gameState: null,
    players: [],
    hostId: "",
    sid: "",
  });
};
function cleanup() {
  clearTimeout(jt);
  stopGame();
  lastChat.clear();
  room?.leave();
  room = null;
  active = null;
  findGame = null;
}
/** Host broadcast: bumps the version, sends to peers, then applies locally through the same code path. */
function bc(m: Msg) {
  v++;
  const e = { ...clone(m), sid: st().sid, v } as Env;
  room?.send(e);
  handle(e, selfId);
}
const snap = () =>
  bc({
    t: "STATE_SNAPSHOT",
    players: st().players,
    hostId: st().hostId,
    status: st().status,
    gameId: st().gameId,
    state: host?.state() ?? null,
  });
function priv(to: string, m: Msg) {
  const e = { ...clone(m), sid: st().sid, v: 0 } as Env;
  if (to === selfId) handle(e, selfId);
  else room?.send(e, to);
}
/** Sends a request to the host, or runs it directly if this client is the host. */
function toHost(m: Msg, run: () => void) {
  if (isHost()) run();
  else room?.send({ ...m, sid: st().sid, v: 0 } as Env, st().hostId);
}
/** What the running game's host logic uses to reach the players. */
const hostContext: HostContext<unknown> = {
  selfId,
  players: () => st().players,
  nameOf,
  publish: () => {
    if (host) bc({ t: "GAME_STATE", state: host.state() });
  },
  emit: (m) => bc({ t: "EVENT", m }),
  sendTo: (id, m) => priv(id, { t: "PRIVATE", m }),
};

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const newCode = () =>
  [...crypto.getRandomValues(new Uint8Array(6))]
    .map((b) => CODE_CHARS[b % CODE_CHARS.length])
    .join("");
export const cleanCode = (c: string) =>
  c
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 8);

function open(name: string, code: string, role: "host" | "join") {
  v = 0;
  lastV = -1;
  const c = cleanCode(code);
  set({
    name,
    code: c,
    error: "",
    sid: "",
    gameId: active?.id ?? "",
    gameState: null,
    chat: [],
    players: [],
    hostId: role === "host" ? selfId : "",
    status: "connecting",
  });
  try {
    room = openRoom(
      c,
      onRecv,
      (id) => {
        if (!isHost())
          room?.send({ t: "PLAYER_JOIN", name: st().name, sid: "", v: 0 }, id);
      },
      onLeave,
    );
    return true;
  } catch (e) {
    fail("Could not open the room: " + String(e));
    return false;
  }
}
/** Opens a new party for this game, with this client as the host. */
export function hostParty(game: GameModule, name: string) {
  cleanup();
  active = game;
  if (open(name, newCode(), "host"))
    set({ players: [{ id: selfId, name, ready: true }], status: "lobby" });
}
/** Joins a party by code. The host says which game it's playing, and `find` looks it up (normally `getGame` from the registry). */
export function joinParty(code: string, name: string, find: FindGame) {
  cleanup();
  findGame = find;
  if (!open(name, code, "join")) return;
  jt = setTimeout(() => {
    if (st().status === "connecting")
      fail(
        relayConnected()
          ? "No host answered. Check the room code and that the host still has the party page open (refreshing it ends the party). If both are right, your network may be blocking the connection."
          : "Could not reach the matchmaking servers. Check your connection or disable any VPN or ad blocker.",
      );
  }, JOIN_TIMEOUT);
}
export const leave = () => {
  cleanup();
  set({
    status: "idle",
    players: [],
    hostId: "",
    gameId: "",
    gameState: null,
    sid: "",
    code: "",
  });
};
function onLeave(id: string) {
  if (clientOn) active?.net.client?.onPlayerLeave?.(id);
  if (!isHost()) {
    if (id === st().hostId) fail("The host left, so this session has ended.");
    return;
  }
  if (!st().players.some((p) => p.id === id)) return;
  host?.onPlayerLeave?.(id);
  set((s) => ({ players: s.players.filter((p) => p.id !== id) }));
  bc({ t: "PLAYER_LEAVE", id });
  snap();
}
export function setReady(ready: boolean) {
  if (!isHost())
    room?.send({ t: "PLAYER_READY", ready, sid: "", v: 0 }, st().hostId);
}
export function startGame() {
  const s = st();
  if (
    !isHost() ||
    !active ||
    s.status !== "lobby" ||
    s.players.length < active.minPlayers ||
    !s.players.every((p) => p.ready)
  )
    return;
  set({ sid: newId(), status: "playing" });
  host = active.net.createHost(hostContext);
  bc({ t: "GAME_START", state: host.state() });
}
export function returnToLobby() {
  if (!isHost()) return;
  host?.dispose();
  host = null;
  const players = st().players.map((p) => ({ ...p, ready: p.id === selfId }));
  set({ players, status: "lobby" });
  bc({ t: "RETURN_TO_LOBBY", players });
  set({ sid: "" });
}

/** Asks the host to do something for the running game. The host's `onAction` decides whether it's allowed. */
export function sendAction<Action>(action: Action) {
  toHost({ t: "ACTION", m: action }, () => host?.onAction(selfId, action));
}
/** Sends straight to the other players, for cosmetic things like movement. The host doesn't check these, and they aren't sent back to you. */
export function sendToPeers<Peer>(message: Peer) {
  if (st().status === "playing")
    room?.send({ t: "PEER", m: message, sid: st().sid, v: 0 });
}

/** Removes control characters and limits the length, without cutting an emoji in half. */
const cleanChat = (text: string) =>
  [...text.replace(/[\u0000-\u001f\u007f]/g, " ").trim()]
    .slice(0, MAX_CHAT)
    .join("")
    .trim();
/** Chat goes through the host, which vouches for who said it and limits how fast each player can post. */
export function sendChat(text: string) {
  const clean = cleanChat(text);
  if (clean)
    toHost({ t: "CHAT_SEND", text: clean }, () => hostChat(selfId, clean));
}
function hostChat(from: string, text: string) {
  const clean = cleanChat(text),
    now = Date.now();
  if (!clean || now - (lastChat.get(from) ?? -Infinity) < CHAT_GAP) return;
  lastChat.set(from, now);
  bc({ t: "CHAT", from, text: clean });
}

function onRecv(raw: unknown, from: string) {
  const e = parseEnv(raw);
  if (e) handle(e, from);
}
function handle(e: Env, from: string) {
  const s = st(),
    net = active?.net;
  if (e.t === "PEER") {
    if (e.sid === s.sid && from !== selfId && clientOn && net?.isPeer?.(e.m))
      net.client?.onPeer?.(from, e.m);
    return;
  }
  if (isHost() && from !== selfId) {
    // inbound requests, host only
    if (e.t === "PLAYER_JOIN") {
      if (s.players.some((p) => p.id === from)) return;
      const max = active?.maxPlayers ?? 0;
      if (s.players.length >= max)
        return priv(from, {
          t: "ERROR",
          msg: `This party is full (${max}/${max}).`,
        });
      set({
        players: [
          ...s.players,
          {
            id: from,
            name: e.name.trim().slice(0, 16) || "Player",
            ready: false,
          },
        ],
      });
      snap();
      return;
    }
    if (!s.players.some((p) => p.id === from)) return; // only party members may act
    switch (e.t) {
      case "PLAYER_READY":
        set({
          players: s.players.map((p) =>
            p.id === from ? { ...p, ready: e.ready } : p,
          ),
        });
        snap();
        return;
      case "CHAT_SEND":
        hostChat(from, e.text);
        return;
      case "ACTION":
        if (e.sid === s.sid && net?.isAction(e.m)) host?.onAction(from, e.m);
        return;
    }
    return;
  }
  // Only the host we joined may send state. The very first snapshot is what tells us who that is.
  const knownHost = from === selfId || (s.hostId !== "" && from === s.hostId);
  const joining = s.hostId === "" && s.status === "connecting";
  const fromHost =
    knownHost ||
    (joining &&
      (e.t === "ERROR" || (e.t === "STATE_SNAPSHOT" && e.hostId === from)));
  if (!fromHost) return;
  if (e.t === "STATE_SNAPSHOT" && e.hostId !== s.hostId && !joining) return;
  if (e.t === "ERROR") {
    fail(e.msg);
    return;
  }
  if (e.t === "PRIVATE") {
    if (e.sid === s.sid && clientOn && isEvent(e.m, from))
      net?.client?.onEvent?.(e.m);
    return;
  }
  if (e.v <= lastV) return; // stale or duplicate
  if (e.t !== "STATE_SNAPSHOT" && e.t !== "GAME_START" && e.sid !== s.sid)
    return; // other session
  if (e.t === "STATE_SNAPSHOT") {
    if (joining) {
      active = findGame?.(e.gameId) ?? null;
      if (!active)
        return fail(
          "This party is playing a game your copy of the site doesn't have. Refresh the page and try again.",
        );
    } else if (e.gameId !== s.gameId) return;
    if (e.state !== null && !isState(e.state, from)) return;
  }
  if ((e.t === "GAME_START" || e.t === "GAME_STATE") && !isState(e.state, from))
    return;
  if (e.t === "EVENT" && !isEvent(e.m, from)) return;
  lastV = e.v;
  switch (e.t) {
    case "STATE_SNAPSHOT":
      clearTimeout(jt);
      set({
        players: e.players,
        hostId: e.hostId,
        status: e.status,
        sid: e.sid,
        gameId: e.gameId,
        gameState: e.state,
      });
      if (e.status === "playing") startClient();
      else stopClient();
      break;
    case "GAME_START":
      stopClient();
      set({ sid: e.sid, status: "playing", gameState: e.state });
      startClient();
      break;
    case "GAME_STATE":
      set({ gameState: e.state });
      break;
    case "EVENT":
      if (clientOn) active?.net.client?.onEvent?.(e.m);
      break;
    case "CHAT": {
      const line = {
        id: ++chatId,
        from: e.from,
        name: nameOf(e.from),
        text: e.text,
      };
      set((x) => ({ chat: [...x.chat, line].slice(-CHAT_HISTORY) }));
      break;
    }
    case "PLAYER_LEAVE":
      set((x) => ({ players: x.players.filter((p) => p.id !== e.id) }));
      break;
    case "RETURN_TO_LOBBY":
      stopClient();
      set({ status: "lobby", gameState: null, sid: "", players: e.players });
      break;
  }
}
/** The host's own messages were built by its own game, so only other people's need checking. */
const isState = (x: unknown, from: string) =>
  from === selfId || !!active?.net.isState(x);
const isEvent = (x: unknown, from: string) =>
  from === selfId || !!active?.net.isEvent?.(x);
if (typeof window !== "undefined")
  window.addEventListener("beforeunload", () => room?.leave());
