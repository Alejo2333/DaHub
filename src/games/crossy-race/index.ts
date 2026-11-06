import { lazy } from "react";
import { isRec } from "../../multiplayer/guards";
import type { GameModule, GameNet } from "../../types/game";

export const TICK_MS = 100;
export const BOARD_WIDTH = 9;
export const VIEW_ROWS = 14;
export const FINISH_ROW = 20;
export const TOTAL_ROUNDS = 4;
export const ROUND_BREAK_TICKS = 30;
export const RESPAWN_TICKS = 10;
const CAR_COLLISION_RADIUS = 0.68;
const LOG_COLLISION_RADIUS = 1;

export interface Row {
  y: number;
  kind: "grass" | "road" | "water";
  direction: 1 | -1;
  /** Obstacle movement rate in cells per second. */
  speed: number;
  items: number[];
}

export interface PlayerState {
  x: number;
  y: number;
  alive: boolean;
  best: number;
}

export interface CrossyState {
  tick: number;
  phase: "racing" | "intermission" | "finished";
  round: number;
  intermissionTicks: number;
  roundWinners: string[];
  winners: string[];
  rows: Row[];
  players: Record<string, PlayerState>;
  scores: Record<string, number>;
  roundWins: Record<string, number>;
  totalRows: Record<string, number>;
}

export type CrossyAction = { t: "MOVE"; dir: "up" | "down" | "left" | "right" };

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isRow = (x: unknown): x is Row =>
  isRec(x) && isNum(x.y) && Number.isInteger(x.y) && x.y >= 0 &&
  (x.kind === "grass" || x.kind === "road" || x.kind === "water") &&
  (x.direction === 1 || x.direction === -1) &&
  isNum(x.speed) && x.speed >= 0 && Array.isArray(x.items) &&
  x.items.every((item) => isNum(item) && item >= 0 && item < BOARD_WIDTH);
const isPlayerState = (x: unknown): x is PlayerState =>
  isRec(x) && isNum(x.x) && isNum(x.y) &&
  x.x >= 0 && x.x < BOARD_WIDTH &&
  Number.isInteger(x.y) && x.y >= 0 && x.y <= FINISH_ROW &&
  typeof x.alive === "boolean" && isNum(x.best) && x.best >= 0;
const isScoreMap = (x: unknown): x is Record<string, number> =>
  isRec(x) && Object.values(x).every((score) => isNum(score) && score >= 0);

const net: GameNet<CrossyState, CrossyAction> = {
  isState: (x): x is CrossyState =>
    isRec(x) && isNum(x.tick) && Number.isInteger(x.tick) && x.tick >= 0 &&
    (x.phase === "racing" || x.phase === "intermission" || x.phase === "finished") &&
    isNum(x.round) && Number.isInteger(x.round) && x.round >= 1 && x.round <= TOTAL_ROUNDS &&
    isNum(x.intermissionTicks) && Number.isInteger(x.intermissionTicks) && x.intermissionTicks >= 0 &&
    Array.isArray(x.roundWinners) && x.roundWinners.every((id) => typeof id === "string") &&
    Array.isArray(x.winners) && x.winners.every((id) => typeof id === "string") &&
    Array.isArray(x.rows) && x.rows.every(isRow) &&
    isRec(x.players) && Object.values(x.players).every(isPlayerState) &&
    isScoreMap(x.scores) && isScoreMap(x.roundWins) && isScoreMap(x.totalRows),
  isAction: (x): x is CrossyAction =>
    isRec(x) && x.t === "MOVE" &&
    (x.dir === "up" || x.dir === "down" || x.dir === "left" || x.dir === "right"),
  createHost(ctx) {
    const state: CrossyState = {
      tick: 0,
      phase: "racing",
      round: 1,
      intermissionTicks: 0,
      roundWinners: [],
      winners: [],
      rows: [],
      players: {},
      scores: {},
      roundWins: {},
      totalRows: {},
    };
    let timer: ReturnType<typeof setInterval> | null = null;
    const lastMove = new Map<string, number>();
    const respawnAt = new Map<string, number>();

    const rng = (seed: number) => {
      let s = seed | 0 || 1;
      return () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 0x100000000;
      };
    };
    const newMapRandom = () => rng(Math.floor(Math.random() * 0x7fffffff) || 1);
    let mapRandom = newMapRandom();
    const makeRow = (y: number, r: () => number): Row => {
      if (y === 0) return { y, kind: "grass", direction: 1, speed: 0, items: [] };
      if (y === FINISH_ROW) return { y, kind: "grass", direction: 1, speed: 0, items: [] };
      const roll = r();
      if (roll < 0.45) return { y, kind: "grass", direction: 1, speed: 0, items: [] };
      const dir: 1 | -1 = r() < 0.5 ? 1 : -1;
      if (roll < 0.85) {
        const speed = 0.9 + r() * 0.65;
        const count = 2 + Math.floor(r() * 2);
        const offset = r() * BOARD_WIDTH / count;
        const items = Array.from(
          { length: count },
          (_, index) => wrap(offset + index * BOARD_WIDTH / count),
        );
        return { y, kind: "road", direction: dir, speed, items };
      }
      const speed = 0.3 + r() * 0.35;
      const count = 2;
      const offset = r() * BOARD_WIDTH / count;
      const items = Array.from(
        { length: count },
        (_, index) => wrap(offset + index * BOARD_WIDTH / count),
      );
      return { y, kind: "water", direction: dir, speed, items };
    };
    const ensureRows = (upTo: number) => {
      while (state.rows.length === 0 || state.rows[state.rows.length - 1].y < upTo) {
        const nextY = state.rows.length === 0 ? 0 : state.rows[state.rows.length - 1].y + 1;
        state.rows.push(makeRow(nextY, mapRandom));
      }
    };
    const wrap = (x: number) => ((x % BOARD_WIDTH) + BOARD_WIDTH) % BOARD_WIDTH;
    const startNextRound = () => {
      state.round += 1;
      state.phase = "racing";
      state.intermissionTicks = 0;
      state.roundWinners = [];
      state.rows = [];
      mapRandom = newMapRandom();
      respawnAt.clear();
      for (const p of Object.values(state.players)) {
        p.x = Math.floor(BOARD_WIDTH / 2);
        p.y = 0;
        p.alive = true;
      }
      ensureRows(VIEW_ROWS);
    };
    const finishRound = (id: string) => {
      state.roundWinners = [id];
      state.roundWins[id] = (state.roundWins[id] ?? 0) + 1;
      state.scores[id] = Math.max(state.scores[id] ?? 0, state.players[id]!.best);
      if (state.round === TOTAL_ROUNDS) {
        state.phase = "finished";
        const standings = Object.keys(state.roundWins).sort((a, b) =>
          (state.roundWins[b] ?? 0) - (state.roundWins[a] ?? 0) ||
          (state.totalRows[b] ?? 0) - (state.totalRows[a] ?? 0),
        );
        const champion = standings[0];
        state.winners = champion
          ? standings.filter((playerId) =>
              state.roundWins[playerId] === state.roundWins[champion] &&
              state.totalRows[playerId] === state.totalRows[champion],
            )
          : [];
        if (timer) clearInterval(timer);
        timer = null;
      } else {
        state.phase = "intermission";
        state.intermissionTicks = ROUND_BREAK_TICKS;
      }
    };

    const step = () => {
      state.tick++;
      if (state.phase === "finished") return;
      if (state.phase === "intermission") {
        state.intermissionTicks -= 1;
        if (state.intermissionTicks <= 0) startNextRound();
        ctx.publish();
        return;
      }
      const deltaSeconds = TICK_MS / 1000;
      for (const row of state.rows) {
        if (row.kind === "grass") continue;
        row.items = row.items.map((x) => wrap(x + row.direction * row.speed * deltaSeconds));
      }
      for (const [id, p] of Object.entries(state.players)) {
        if (!p.alive) continue;
        const row = state.rows.find((r) => r.y === p.y);
        if (!row) continue;
        const px = wrap(p.x);
        if (row.kind === "road") {
          const hit = row.items.some((cx) => {
            const d = Math.abs(wrap(cx - px + BOARD_WIDTH / 2) - BOARD_WIDTH / 2);
            return d < CAR_COLLISION_RADIUS;
          });
          if (hit) { p.alive = false; state.scores[id] = Math.max(state.scores[id] ?? 0, p.best); }
        } else if (row.kind === "water") {
          const onLog = row.items.some((lx) => {
            const d = Math.abs(wrap(lx - px + BOARD_WIDTH / 2) - BOARD_WIDTH / 2);
            return d < LOG_COLLISION_RADIUS;
          });
          if (onLog) p.x = wrap(p.x + row.direction * row.speed * deltaSeconds);
          else {
            p.alive = false;
            respawnAt.set(id, state.tick + RESPAWN_TICKS);
            state.scores[id] = Math.max(state.scores[id] ?? 0, p.best);
          }
        }
        if (!p.alive && row.kind === "road") {
          respawnAt.set(id, state.tick + RESPAWN_TICKS);
          state.scores[id] = Math.max(state.scores[id] ?? 0, p.best);
        }
        p.best = Math.max(p.best, p.y);
      }
      for (const [id, p] of Object.entries(state.players)) {
        if (!p.alive && state.tick >= (respawnAt.get(id) ?? Infinity)) {
          p.alive = true;
          p.x = Math.floor(BOARD_WIDTH / 2);
          p.y = 0;
          respawnAt.delete(id);
        }
      }
      const maxY = Math.max(0, ...Object.values(state.players).map((p) => p.y));
      ensureRows(maxY + VIEW_ROWS);
      ctx.publish();
    };
    timer = setInterval(step, TICK_MS);
    ensureRows(VIEW_ROWS);

    return {
      state: () => state,
      onAction(from, action) {
        if (action.t !== "MOVE" || state.phase !== "racing") return;
        const now = Date.now();
        if (now - (lastMove.get(from) ?? -Infinity) < TICK_MS || !Number.isFinite(now)) return;
        if (!state.players[from]) {
          state.players[from] = {
            x: Math.floor(BOARD_WIDTH / 2),
            y: 0,
            alive: true,
            best: 0,
          };
          state.scores[from] = state.scores[from] ?? 0;
          state.roundWins[from] = state.roundWins[from] ?? 0;
          state.totalRows[from] = state.totalRows[from] ?? 0;
        }
        const p = state.players[from];
        if (!p.alive) return;
        lastMove.set(from, now);
        if (action.dir === "up") {
          p.y += 1;
          state.totalRows[from] = (state.totalRows[from] ?? 0) + 1;
        }
        else if (action.dir === "down") p.y = Math.max(0, p.y - 1);
        else if (action.dir === "left") p.x = wrap(p.x - 1);
        else if (action.dir === "right") p.x = wrap(p.x + 1);
        p.best = Math.max(p.best, p.y);
        state.scores[from] = Math.max(state.scores[from] ?? 0, p.best);
        if (p.y >= FINISH_ROW) {
          p.y = FINISH_ROW;
          finishRound(from);
        }
        ctx.publish();
      },
      onPlayerLeave(id) {
        delete state.players[id];
        lastMove.delete(id);
        respawnAt.delete(id);
        ctx.publish();
      },
      dispose() { if (timer) clearInterval(timer); timer = null; },
    };
  },
};

const cover = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><rect width="320" height="240" fill="#7ec850"/><rect y="90" width="320" height="60" fill="#444"/><rect x="40" y="105" width="50" height="30" fill="#e63946"/><rect x="180" y="105" width="50" height="30" fill="#1d3557"/><circle cx="160" cy="200" r="14" fill="#fff"/></svg>`,
);

const game: GameModule = {
  id: "crossy-race",
  title: "Crossy Race",
  tagline: "Win four rounds. Don't get flattened.",
  cover,
  minPlayers: 1,
  maxPlayers: 6,
  category: "Arcade",
  tags: ["Multiplayer", "Race"],
  description: "Race through traffic in four rounds. Dodge cars, ride logs, and finish first to win each round.",
  howTo: [
    `Reach row ${FINISH_ROW} before the other racers to win a round.`,
    "Avoid cars on roads - you'll get flattened.",
    "On water, stand on logs or you'll drown.",
    `Race four rounds. Most round wins takes the match; total rows breaks a tie.`,
  ],
  controls: ["Arrow keys / WASD"],
  Component: lazy(() => import("./ui/CrossyRace")),
  net,
};
export default game;
