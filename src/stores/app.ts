import { create } from "zustand";
import type { Player, Status } from "../types/net";
const ls = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
/** `id` only ever increases, so a game scene can spot new messages. */
export interface ChatLine {
  id: number;
  from: string;
  name: string;
  text: string;
}
/** The party's state, which every game shares. A game keeps its own extras in its own store. */
export interface S {
  name: string;
  code: string;
  /** The game this party is playing. Empty until a joining player hears from the host. */
  gameId: string;
  hostId: string;
  players: Player[];
  status: Status;
  error: string;
  sid: string;
  /** The running game's state, from its `HostGame.state()`. Each game casts it to its own type. */
  gameState: unknown;
  chat: ChatLine[];
}
export const useApp = create<S>(() => ({
  name: ls("hub-name", "Player" + Math.floor(Math.random() * 900 + 100)),
  code: "",
  gameId: "",
  hostId: "",
  players: [],
  status: "idle",
  error: "",
  sid: "",
  gameState: null,
  chat: [],
}));
export const saveName = (n: string) => {
  try {
    localStorage.setItem("hub-name", n);
  } catch {
    /* ignore */
  }
  useApp.setState({ name: n });
};
