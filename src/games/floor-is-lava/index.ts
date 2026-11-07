import { lazy } from "react";
import { isRec, isStr } from "../../multiplayer/guards";
import type { GameModule, GameNet } from "../../types/game";
import { COUNTDOWN, ENDED, START_TOP, lavaAt } from "./map";

export type Phase = "waiting" | "countdown" | "playing" | "ended";
export interface FlPlayer { x: number; y: number; z: number; ry: number; alive: boolean; dt: number; px: number; pz: number; pn: number; pw: number; by: string; kl: string }
/** t = ms in current phase, pt = ms of play time (frozen after the round ends). */
export interface FlState {
  phase: Phase; round: number; seed: number; t: number; pt: number
  winner: string | null; order: string[]; players: Record<string, FlPlayer>
}
export type FlAction = { t: "JOIN" } | { t: "RESTART" } | { t: "PUSH"; to: string } | { t: "POS"; x: number; y: number; z: number; ry: number };

const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isPlayer = (p: unknown) =>
  isRec(p) && num(p.x) && num(p.y) && num(p.z) && num(p.ry) && num(p.dt) && num(p.px) && num(p.pz) && num(p.pn) && num(p.pw) && typeof p.by === "string" && typeof p.kl === "string" && typeof p.alive === "boolean";
const seedOf = () => Math.floor(Math.random() * 2147483647);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

const net: GameNet<FlState, FlAction> = {
  isState: (x): x is FlState =>
    isRec(x) && ["waiting", "countdown", "playing", "ended"].includes(x.phase as string) &&
    num(x.round) && num(x.seed) && num(x.t) && num(x.pt) &&
    (x.winner === null || isStr(x.winner)) &&
    Array.isArray(x.order) && x.order.every(isStr) &&
    isRec(x.players) && Object.values(x.players).every(isPlayer),
  isAction: (x): x is FlAction =>
    isRec(x) && (x.t === "JOIN" || x.t === "RESTART" || (x.t === "PUSH" && isStr(x.to)) ||
      (x.t === "POS" && num(x.x) && num(x.y) && num(x.z) && num(x.ry))),
  createHost(ctx) {
    const st: FlState = { phase: "waiting", round: 0, seed: seedOf(), t: 0, pt: 0, winner: null, order: [], players: {} };
    let last = Date.now();
    const lastPush: Record<string, number> = {};
    const hits: Record<string, number[]> = {}, lastHit: Record<string, { from: string; at: number }> = {};
    const count = () => Object.keys(st.players).length;
    /** Start a new round (countdown) if at least 2 players joined. */
    const begin = () => {
      st.t = 0; st.pt = 0; st.winner = null;
      for (const k of Object.keys(hits)) delete hits[k];
      for (const k of Object.keys(lastHit)) delete lastHit[k];
      if (count() < 2) { st.phase = "waiting"; st.order = []; return; }
      st.round++; st.seed = seedOf(); st.phase = "countdown";
      st.order = Object.keys(st.players).sort();
      for (const id of st.order) Object.assign(st.players[id], { alive: true, dt: 0, x: 0, y: START_TOP, z: 0, px: 0, pz: 0, pw: 1, by: "", kl: "" });
    };
    const tick = () => {
      const now = Date.now(); st.t += now - last; last = now;
      if (st.phase === "waiting") { if (count() >= 2) begin(); }
      else if (st.phase === "countdown") { if (st.t >= COUNTDOWN) { st.phase = "playing"; st.t = 0; } }
      else if (st.phase === "playing") {
        const lv = lavaAt(st.t); let a = 0, who = "";
        for (const id of st.order) {
          const p = st.players[id];
          if (!p || !p.alive) continue;
          if (p.y < lv) { p.alive = false; p.dt = st.t; const lh = lastHit[id]; p.kl = lh && Date.now() - lh.at < 5000 ? lh.from : ""; } else { a++; who = id; }
        }
        if ((st.order.length >= 2 && a <= 1) || a === 0) {
          st.phase = "ended"; st.pt = st.t; st.t = 0; st.winner = a === 1 ? who : null;
        }
      } else if (st.t >= ENDED) begin();
      ctx.publish();
    };
    const timer = setInterval(tick, 100);
    return {
      state: () => st,
      onAction(from, a) {
        if (a.t === "JOIN") {
          if (!st.players[from]) st.players[from] = { x: 0, y: START_TOP, z: 0, ry: 0, alive: st.phase === "waiting", dt: 0, px: 0, pz: 0, pn: 0, pw: 1, by: "", kl: "" };
        } else if (a.t === "RESTART") {
          if (st.phase === "ended") begin();
        } else if (a.t === "PUSH") {
          // Shove: pusher and target must be alive, close together, and the pusher off cooldown.
          const me = st.players[from], tg = st.players[a.to], now = Date.now();
          if (!me || !tg || from === a.to || !me.alive || !tg.alive || st.phase === "countdown") return;
          if (now - (lastPush[from] ?? 0) < 700) return;
          const dx = tg.x - me.x, dz = tg.z - me.z, d = Math.hypot(dx, dz);
          if (d > 2.8 || Math.abs(tg.y - me.y) > 2.5) return;
          lastPush[from] = now;
          tg.px = d > 0.01 ? dx / d : 1; tg.pz = d > 0.01 ? dz / d : 0; tg.pn++;
          // Knockback stacks: every hit taken within 4s makes the next shove stronger (max x2.2).
          const hs = (hits[a.to] = (hits[a.to] ?? []).filter(t => now - t < 4000)); hs.push(now);
          tg.pw = Math.min(2.2, 1 + 0.3 * (hs.length - 1)); tg.by = from; lastHit[a.to] = { from, at: now };
        } else {
          const p = st.players[from];
          if (p && p.alive) { p.x = clamp(a.x, -400, 400); p.y = clamp(a.y, -50, 400); p.z = clamp(a.z, -400, 400); p.ry = a.ry; }
        }
      },
      onPlayerLeave(id) { delete st.players[id]; delete lastPush[id]; delete hits[id]; delete lastHit[id]; },
      dispose() { clearInterval(timer); },
    };
  },
};

const cover =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4dabf7"/><stop offset="1" stop-color="#d0ebff"/></linearGradient><linearGradient id="l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd43b"/><stop offset=".5" stop-color="#ff6b1a"/><stop offset="1" stop-color="#c92a2a"/></linearGradient></defs><rect width="320" height="240" fill="url(#s)"/><rect y="180" width="320" height="60" fill="url(#l)"/><rect x="30" y="150" width="70" height="14" rx="3" fill="#51cf66"/><rect x="125" y="115" width="60" height="14" rx="3" fill="#ff5d8f"/><rect x="210" y="80" width="70" height="14" rx="3" fill="#ffd43b"/><rect x="236" y="48" width="14" height="32" rx="2" fill="#b197fc"/><text x="160" y="228" font-family="Arial Black,sans-serif" font-size="26" text-anchor="middle" fill="#fff" stroke="#7a1d00" stroke-width="2">FLOOR IS LAVA</text></svg>`,
  );
const game: GameModule = {
  id: "floor-is-lava",
  title: "Floor Is Lava",
  tagline: "Climb the platforms. Don't touch the lava.",
  cover,
  minPlayers: 2,
  maxPlayers: 12,
  category: "Party",
  tags: ["Multiplayer", "3D"],
  description: "Jump across floating platforms while the lava keeps rising. Last survivor wins.",
  howTo: ["Jump up the platforms, stairs and bridges.", "Shove rivals off the platforms - hits within 4s stack, so a dogpile launches them further. Touch the lava and you're out.", "The last player alive wins the round."],
  controls: ["WASD to move", "Space to jump", "E / F / click to shove (auto-aims at the nearest rival in front of you, 0.7s cooldown)", "Mouse to look (click the game to capture it)"],
  Component: lazy(() => import("./ui/FloorIsLava")),
  net,
};
export default game;
