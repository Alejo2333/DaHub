import type { HostContext, HostGame } from "../../../types/game";
import { buildCourse } from "../mechanics/course";
import type { Action, RaceState } from "../types";

export const COUNTDOWN = 3,
  RACE_LIMIT = 180,
  /** A moment to see yourself cross the line before the results cover the screen. */
  RESULTS_DELAY = 1500;

/** The referee, which runs in the host's browser. It starts the race and records times. */
export function createHost(ctx: HostContext): HostGame<RaceState, Action> {
  const seed = crypto.getRandomValues(new Uint32Array(1))[0]!,
    minMs = buildCourse(seed).minMs;
  const state: RaceState = {
    phase: "countdown",
    clock: COUNTDOWN,
    seed,
    finishes: [],
  };
  let startedAt = 0,
    closing: ReturnType<typeof setTimeout> | undefined;
  const end = () => {
    clearInterval(ticker);
    clearTimeout(closing);
    state.phase = "results";
    ctx.publish();
  };
  /** Ends the race once nobody is left running. `leaving` is a player about to leave the roster. */
  const checkDone = (leaving?: string) => {
    const running = ctx
      .players()
      .filter(
        (p) => p.id !== leaving && !state.finishes.some((f) => f.id === p.id),
      );
    if (state.phase === "racing" && !running.length && !closing)
      closing = setTimeout(end, RESULTS_DELAY);
  };
  const ticker = setInterval(() => {
    state.clock--;
    if (state.phase === "countdown" && state.clock <= 0) {
      state.phase = "racing";
      state.clock = RACE_LIMIT;
      startedAt = Date.now();
    } else if (state.phase === "racing" && state.clock <= 0) return end();
    ctx.publish();
  }, 1000);
  return {
    state: () => state,
    onAction(from, action) {
      if (action.t !== "FINISH" || state.phase !== "racing") return;
      if (state.finishes.some((f) => f.id === from)) return;
      const ms = Date.now() - startedAt;
      // Nobody can honestly be this fast.
      if (ms < minMs) return;
      state.finishes.push({ id: from, ms });
      ctx.publish();
      checkDone();
    },
    onPlayerLeave(id) {
      state.finishes = state.finishes.filter((f) => f.id !== id);
      ctx.publish();
      checkDone(id);
    },
    dispose() {
      clearInterval(ticker);
      clearTimeout(closing);
    },
  };
}
