import { lazy } from "react";
import { isRec, isStr } from "../../multiplayer/guards";
import type { GameModule, GameNet } from "../../types/game";
import {
  GUN_KEYS, LIVES, MAPS, MAX_FIGHTERS, NADE, SHIELD, SK,
  type BrawlState, type BSnap, type CSnap, type Ev, type MatchSnap, type PSnap, type SSnap,
} from "./shared";
import { createMatch, type Match } from "./sim";

/**
 * Sky Scrap Brawl, built on the multiplayer template: 2 to 6 players knock each other off
 * floating platforms.
 *
 * The host's browser runs the whole simulation at 60 Hz and publishes a snapshot 20 times a second.
 * Everyone else only sends their keys. Particles are rebuilt on each client from snapshot events.
 */
export type { BrawlState } from "./shared";
/** What a player can ask the host to do. */
export type BrawlAction =
  | { t: "JOIN" } // "I have the game open": sent on mount and repeated until the host lists you
  | { t: "START" } // start or restart a match
  | { t: "IN"; h: number; p: number }; // held-key bits and new press bits (see KEY and PRESS)

const TICK = 1000 / 60, PUBLISH_EVERY = 3; // 60 Hz simulation, 20 Hz snapshots

// Other players are untrusted, so check the shape of everything they send.
const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const int = (x: unknown, lo: number, hi: number) => Number.isInteger(x) && (x as number) >= lo && (x as number) <= hi;
const flag = (x: unknown) => x === 0 || x === 1;
const arr = <T>(x: unknown, max: number, each: (v: unknown) => v is T): x is T[] => Array.isArray(x) && x.length <= max && x.every(each);
const isGun = (x: unknown) => GUN_KEYS.includes(x as never);
const isP = (x: unknown): x is PSnap =>
  isRec(x) && int(x.u, 0, 1e9) && int(x.r, 0, MAX_FIGHTERS - 1) && (x.id === null || isStr(x.id)) &&
  [x.x, x.y, x.vx, x.w, x.wk, x.ice, x.ia, x.jet, x.gh].every(fin) && (x.f === 1 || x.f === -1) &&
  int(x.l, 0, LIVES) && isGun(x.g) && (x.a === -1 || int(x.a, 0, 99)) && int(x.n, 0, NADE.n) &&
  [x.s, x.c, x.fl, x.th, x.gr, x.sp].every(flag) && int(x.sh, 0, SHIELD) &&
  Array.isArray(x.st) && x.st.length === 6 && x.st.every(fin);
const isB = (x: unknown): x is BSnap =>
  isRec(x) && int(x.i, 0, 1e9) && [x.x, x.y, x.vx, x.vy, x.l, x.a].every(fin) && (x.k === "grenade" || isGun(x.k)) && flag(x.c);
const isC = (x: unknown): x is CSnap =>
  isRec(x) && int(x.i, 0, 1e9) && [x.x, x.y, x.to, x.sw, x.bt].every(fin) && flag(x.ld) && isGun(x.g);
const isS = (x: unknown): x is SSnap =>
  isRec(x) && int(x.i, 0, 1e9) && [x.x, x.y, x.l, x.ph, x.a].every(fin) && SK.includes(x.k as never);
const isE = (x: unknown): x is Ev =>
  Array.isArray(x) && x.length >= 2 && x.length <= 10 && int(x[0], 0, 1e12) && isStr(x[1]) &&
  x.slice(1).every((v) => fin(v) || (isStr(v) && v.length <= 24));
const isMatch = (x: unknown): x is MatchSnap =>
  isRec(x) && int(x.mid, 0, 1e9) && int(x.m, 0, MAPS.length - 1) && fin(x.t) && int(x.win, -1, MAX_FIGHTERS - 1) &&
  typeof x.over === "boolean" && arr(x.P, 64, isP) && arr(x.B, 400, isB) && arr(x.C, 8, isC) && arr(x.S, 8, isS) && arr(x.E, 3000, isE);
const press = (x: unknown) => int(x, 0, 31);

const net: GameNet<BrawlState, BrawlAction> = {
  isState: (x): x is BrawlState =>
    isRec(x) && (x.ph === "wait" || x.ph === "play" || x.ph === "over") &&
    arr(x.j, 32, (v): v is string => isStr(v)) && (x.mt === undefined || isMatch(x.mt)),
  isAction: (x): x is BrawlAction =>
    isRec(x) &&
    (x.t === "JOIN" || x.t === "START" ||
      (x.t === "IN" && press(x.h) && int(x.p, 0, 7))),
  // The rules run here, in the host's browser only.
  createHost(ctx) {
    let phase: BrawlState["ph"] = "wait", joined: string[] = [];
    let match: Match | null = null, mid = 0, timer: ReturnType<typeof setInterval> | undefined, last = 0, tick = 0;
    // Snapshots are rebuilt on every publish and never mutated afterwards.
    const build = (): BrawlState => ({ ph: phase, j: [...joined], ...(match ? { mt: match.snap() } : {}) });
    let snap = build();
    const publish = () => { snap = build(); ctx.publish(); };
    const stop = () => { if (timer !== undefined) clearInterval(timer); timer = undefined; };
    const loop = () => {
      if (!match) return;
      const now = performance.now(), dt = Math.min((now - last) / 1000, 1 / 30);
      last = now;
      match.step(dt);
      if (match.over) { phase = "over"; stop(); publish(); return; }
      if (++tick % PUBLISH_EVERY === 0) publish();
    };
    const start = () => {
      if (phase === "play" || joined.length < 2) return;
      stop();
      match = createMatch(joined.slice(0, MAX_FIGHTERS), ++mid);
      phase = "play"; last = performance.now(); tick = 0;
      timer = setInterval(loop, TICK);
      publish();
    };
    return {
      state: () => snap,
      onAction(from, action) {
        if (action.t === "JOIN") {
          if (!joined.includes(from)) { joined.push(from); publish(); }
        } else if (action.t === "IN") {
          if (phase === "play") match?.input(from, action.h, action.p);
        } else if (action.t === "START") {
          if (joined.includes(from)) start();
        }
      },
      onPlayerLeave(id) {
        joined = joined.filter((j) => j !== id);
        match?.leave(id);
        publish();
      },
      dispose() {
        stop();
      },
    };
  },
};

const cover =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8701f"/><stop offset="1" stop-color="#f4b24a"/></linearGradient></defs><rect width="320" height="240" fill="url(#s)"/><path d="M0 170 L70 110 L130 160 L200 90 L270 150 L320 120 V240 H0Z" fill="#c9802a"/><g stroke="#140e26" stroke-width="4"><rect x="40" y="150" width="240" height="14" rx="3" fill="#8a5426"/><rect x="90" y="96" width="140" height="12" rx="3" fill="#8a5426"/><rect x="104" y="112" width="26" height="22" rx="7" fill="#ff8a2b"/><circle cx="117" cy="98" r="15" fill="#ffd9b0"/><rect x="190" y="112" width="26" height="22" rx="7" fill="#45b8e8"/><circle cx="203" cy="98" r="15" fill="#ffd9b0"/></g></svg>`,
  );
const game: GameModule = {
  id: "sky-scrap-brawl",
  title: "Sky Scrap Brawl",
  tagline: "Knock your friends off the map.",
  cover,
  minPlayers: 2,
  maxPlayers: MAX_FIGHTERS,
  category: "Party",
  tags: ["Multiplayer"],
  description: "A platform brawler for 2 to 6 players. 10 lives each, random map. Last one standing wins.",
  howTo: [
    "Shoot and bomb the others off the platforms. The more you hit someone, the further they fly.",
    "You carry 3 grenades, refilled on respawn. The blast throws everyone near it, including you.",
    "Glowing orbs give skills: Jetpack, Speed, Clone, Ghost and Shield.",
    "Falling crates give a random gun: Boomstick, Rattler, Freezer, Revolver, Sniper or Rifle.",
    "Revolver and Sniper shots are always critical hits, and any critical hit has a 15% chance to 1 TAP an enemy off the map.",
    "The last fighter with lives left wins.",
  ],
  controls: ["Move: A/D or arrows", "Jump (twice): W or Up", "Drop down: S or Down", "Fire: Space or J (hold)", "Grenade: G or K", "Fullscreen: F", "On touch screens: the on-screen buttons"],
  Component: lazy(() => import("./ui/SkyScrapBrawl")),
  net,
};
export default game;
