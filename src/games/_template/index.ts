import { lazy } from "react";
import { isRec, isStr } from "../../multiplayer/guards";
import type { GameModule, GameNet } from "../../types/game";

/**
 * A complete multiplayer game: first to 10 taps wins. Copy this folder to start a new game.
 * It isn't in the registry, so it never appears in the hub, but the party tests play it, so it always works.
 */
export const TAPS_TO_WIN = 10;

/** What every player can see. The host sends it whenever it changes. */
export interface TapState {
  taps: Record<string, number>;
  winner: string | null;
}
/** What a player can ask the host to do. */
export type TapAction = { t: "TAP" };

const isCount = (x: unknown) => Number.isInteger(x) && (x as number) >= 0;
const net: GameNet<TapState, TapAction> = {
  // Other players are untrusted, so check the shape of everything they send.
  isState: (x): x is TapState =>
    isRec(x) &&
    isRec(x.taps) &&
    Object.values(x.taps).every(isCount) &&
    (x.winner === null || isStr(x.winner)),
  isAction: (x): x is TapAction => isRec(x) && x.t === "TAP",
  // The rules run here, in the host's browser only.
  createHost(ctx) {
    const state: TapState = { taps: {}, winner: null };
    return {
      state: () => state,
      onAction(from, action) {
        if (action.t !== "TAP" || state.winner) return;
        state.taps[from] = (state.taps[from] ?? 0) + 1;
        if (state.taps[from] >= TAPS_TO_WIN) state.winner = from;
        ctx.publish();
      },
      onPlayerLeave(id) {
        delete state.taps[id];
        ctx.publish();
      },
      dispose() {
        // Stop any timers here. This game has none.
      },
    };
  },
};

const cover =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect width="320" height="240" fill="#1b2a4a"/><circle cx="160" cy="120" r="70" fill="#ff4d6d"/></svg>`,
  );
const game: GameModule = {
  id: "tap-race",
  title: "Tap Race",
  tagline: "First to 10 taps wins.",
  cover,
  minPlayers: 1,
  maxPlayers: 6,
  category: "Party",
  tags: ["Multiplayer"],
  description: "Tap faster than your friends.",
  howTo: [`Tap the button. The first player to ${TAPS_TO_WIN} taps wins.`],
  controls: ["Click or tap the button"],
  Component: lazy(() => import("./ui/TapRace")),
  net,
};
export default game;
