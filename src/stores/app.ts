import { create } from "zustand";
import type { BetResult, GState, Player, Status, Tone } from "../types/net";
const ls = (k: string, d: string) => {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
};
export interface FeedItem {
  id: number;
  text: string;
  tone: Tone;
}
/** A finished bet for the casino scene to celebrate. `n` changes each time so the scene can spot new ones. */
export interface Fx {
  n: number;
  result: BetResult;
}
/** `id` only ever increases, so the casino scene can spot new messages. */
export interface ChatLine {
  id: number;
  from: string;
  name: string;
  text: string;
}
export interface S {
  name: string;
  code: string;
  hostId: string;
  players: Player[];
  status: Status;
  error: string;
  sid: string;
  game: GState | null;
  feed: FeedItem[];
  chat: ChatLine[];
  fx: Fx | null;
  toast: string;
  /** Net result of a bet whose animation is still playing, hidden from the HUD so it doesn't spoil the outcome. */
  hold: number;
}
export const useApp = create<S>(() => ({
  name: ls("hub-name", "Player" + Math.floor(Math.random() * 900 + 100)),
  code: "",
  hostId: "",
  players: [],
  status: "idle",
  error: "",
  sid: "",
  game: null,
  feed: [],
  chat: [],
  fx: null,
  toast: "",
  hold: 0,
}));
export const saveName = (n: string) => {
  try {
    localStorage.setItem("hub-name", n);
  } catch {
    /* ignore */
  }
  useApp.setState({ name: n });
};
/** Non-reactive remote player positions (updated at ~10Hz, read by Phaser). */
export const positions: Record<string, { x: number; y: number }> = {};
export const bestFloor = () => {
  const n = Number(ls("hub-best", "0"));
  return Number.isFinite(n) ? n : 0;
};
export const saveBest = (n: number) => {
  try {
    localStorage.setItem("hub-best", String(n));
  } catch {
    /* ignore */
  }
};
