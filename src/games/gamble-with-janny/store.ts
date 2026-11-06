import { create } from "zustand";
import { useApp } from "../../stores/app";
import type { BetResult, GState, Tone } from "./types";
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
/** The casino's local state, which isn't shared through the host. */
interface CasinoState {
  feed: FeedItem[];
  fx: Fx | null;
  toast: string;
  /** Net result of a bet whose animation is still playing, hidden from the HUD so it doesn't spoil the outcome. */
  hold: number;
}
const EMPTY: CasinoState = { feed: [], fx: null, toast: "", hold: 0 };
export const useCasino = create<CasinoState>(() => EMPTY);
export const resetCasino = () => {
  useCasino.setState(EMPTY);
  for (const k of Object.keys(positions)) delete positions[k];
};
/** Non-reactive remote player positions (updated at ~10Hz, read by Phaser). */
export const positions: Record<string, { x: number; y: number }> = {};
/** The state the host published. */
export const gameState = () => useApp.getState().gameState as GState | null;
export const useGame = <T>(pick: (g: GState | null) => T) =>
  useApp((s) => pick(s.gameState as GState | null));
const BEST_KEY = "hub-best";
export const bestFloor = () => {
  try {
    const n = Number(localStorage.getItem(BEST_KEY) ?? "0");
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
};
export const saveBest = (n: number) => {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    /* ignore */
  }
};
