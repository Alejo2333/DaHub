import { lazy } from "react";
import { isRec, isStr } from "../../multiplayer/guards";
import type { GameModule, GameNet } from "../../types/game";
import { MAPS, MATERIALS, fieldAt, moveBody, segHit, segRect, spawnY, surfaceBelow, type Body, type MapDefinition, type MaterialId } from "./maps";

export type { Body } from "./maps";

/* ───────────── Shared constants (used by host and UI) ───────────── */

export const TICK_MS = 1000 / 30;
export const GRAVITY = 0.8;
export const PW = 11; // player half-width
export const PH = 20; // player half-height
export const GUN_Y = -4; // gun pivot relative to player centre
export const MAX_HP = 100;
export const MAX_FUEL = 100;
export const MAX_NADES = 3;
export const KILLS_TO_WIN = 20;
export const MATCH_TICKS = 30 * 60 * 5;
export const RESPAWN_TICKS = 90;
export const BLAST_RADIUS = 110;
/** Dash: how many ticks it lasts, its speed, and the cooldown between dashes. */
export const DASH_TICKS = 7;
export const DASH_SPEED = 16;
export const DASH_COOLDOWN = 45;
export const VOTE_TICKS = 30 * 20;
export const PICKUP_TICKS = 30 * 20;
/** A vote for "surprise me". */
export const RANDOM_MAP = -1;
export const mapAt = (i: number): MapDefinition => MAPS[i] ?? MAPS[0]!;

export type WeaponKind = "bullet" | "beam" | "rocket";
export interface WeaponDef {
  name: string;
  kind: WeaponKind;
  /** Pistol: magazine size. Pickups: total ammo, no reloads. */
  ammo: number;
  cooldown: number;
  reload: number;
  dmg: number;
  pellets: number;
  spread: number;
  speed: number;
  /** Ticks a bullet or rocket lives (range = speed x life). Beams use it as range in px. */
  life: number;
  recoil: number;
  /** Headshot multiplier. */
  head: number;
  blurb: string;
}
/** Everyone starts with the pistol (index 0); the rest are pickups. */
export const PISTOL = 0, SHOTGUN = 1, SMG = 2, SNIPER = 3, LASER = 4, BAZOOKA = 5, RIFLE = 6;
/** Kill-feed id for grenades. */
export const NADE = 100;
export const WEAPONS: readonly WeaponDef[] = [
  { name: "Pistol", kind: "bullet", ammo: 12, cooldown: 7, reload: 36, dmg: 15, pellets: 1, spread: 0.02, speed: 40, life: 22, recoil: 0.6, head: 1.75, blurb: "Your sidearm. Accurate, infinite magazines." },
  { name: "Shotgun", kind: "bullet", ammo: 16, cooldown: 20, reload: 0, dmg: 9, pellets: 7, spread: 0.15, speed: 36, life: 12, recoil: 2.5, head: 1.25, blurb: "Seven pellets. Devastating up close." },
  { name: "SMG", kind: "bullet", ammo: 90, cooldown: 2, reload: 0, dmg: 6, pellets: 1, spread: 0.1, speed: 40, life: 16, recoil: 0.15, head: 1.5, blurb: "Bullet hose. Shreds at short range." },
  { name: "Sniper", kind: "bullet", ammo: 6, cooldown: 42, reload: 0, dmg: 72, pellets: 1, spread: 0.002, speed: 95, life: 32, recoil: 4, head: 2, blurb: "One shot, one kill if you hit the head." },
  { name: "Laser", kind: "beam", ammo: 150, cooldown: 1, reload: 0, dmg: 2.4, pellets: 1, spread: 0, speed: 0, life: 1100, recoil: 0, head: 1.5, blurb: "Continuous energy beam. Hold fire and sweep it across them." },
  { name: "Bazooka", kind: "rocket", ammo: 4, cooldown: 40, reload: 0, dmg: 95, pellets: 1, spread: 0, speed: 15, life: 90, recoil: 5, head: 1, blurb: "Rockets with splash damage. Try a rocket jump." },
  { name: "Rifle", kind: "bullet", ammo: 90, cooldown: 4, reload: 0, dmg: 11, pellets: 1, spread: 0.035, speed: 42, life: 24, recoil: 0.3, head: 1.5, blurb: "Full-auto assault rifle. Reliable all-rounder." },
];
export const weapon = (i: number): WeaponDef => WEAPONS[i] ?? WEAPONS[0]!;
export const weaponName = (i: number) => (i === NADE ? "Grenade" : weapon(i).name);

/** How often a new weapon drops in, how long it stays, and how many can lie around at once. */
export const DROP_EVERY = 30 * 5;
export const DROP_TTL = 30 * 30;
export const dropCap = (players: number) => Math.min(8, 2 + players);
/** Weapons that can drop (everything except the rifle you always carry). */
export const DROPPABLE = [RIFLE, SHOTGUN, SMG, SNIPER, LASER, BAZOOKA] as const;

/** A random standing spot on a platform or the ground, clear of solids, or null if the try failed. */
export function randomSpot(m: MapDefinition, rand = Math.random): { x: number; y: number } | null {
  let x: number, y: number;
  if (m.platforms.length && rand() < 0.6) {
    const pl = m.platforms[Math.floor(rand() * m.platforms.length)]!.r;
    if (pl[2] < 50) return null;
    x = pl[0] + 20 + rand() * (pl[2] - 40); y = pl[1];
  } else {
    x = 60 + rand() * (m.w - 120); y = spawnY(m, { x });
  }
  const cy = y - PH - 1;
  const blocked = m.platforms.some(({ r }) => x + PW > r[0] && x - PW < r[0] + r[2] && cy + PH > r[1] && cy - PH < r[1] + r[3]);
  const roof = m.terrain.ceil ? fieldAt(m.terrain.ceil, x) : -Infinity;
  if (blocked || cy - PH < roof + 4 || y > fieldAt(m.terrain.ground, x) + 1) return null;
  return { x, y };
}

/* ───────────── Network types ───────────── */

/** w: weapon in hand, ammo: its ammo. mag: rifle magazine. sl: slot (0 rifle, 1 pickup). sw/sa: pickup weapon (-1 none) and its ammo. ht/fl: ticks since dealing a hit / firing. */
export interface PSnap extends Body {
  a: number; hp: number; fuel: number; w: number; ammo: number; rl: number;
  n: number; dead: number; k: number; d: number; j: boolean;
  mag: number; sl: number; sw: number; sa: number; ht: number; fl: number;
  /** ds: dash ticks left, dc: dash cooldown ticks left. */
  ds: number; dc: number;
  /** hs: ticks since you landed a headshot, hh: ticks since you took one. */
  hs: number; hh: number;
}
const P_NUM_KEYS = ["x", "y", "vx", "vy", "a", "hp", "fuel", "w", "ammo", "rl", "n", "dead", "k", "d", "mag", "sl", "sw", "sa", "ht", "fl", "ds", "dc", "hs", "hh"] as const;
/** k: 0 blast, 1 spark, 2 blood, 3 death puff, 4 pickup sparkle, 5 rocket smoke, 6 dash puff. t: ticks left. */
export interface Fx { x: number; y: number; k: number; t: number }
export const FX_TTL = [18, 6, 8, 20, 16, 14, 12];
/** A bullet in flight; w says which gun fired it (for the tracer). */
export interface Shot extends Body { w: number }
/** A weapon lying on the ground. y: the surface it rests on. t: ticks until it vanishes. */
export interface Drop { x: number; y: number; w: number; t: number }
/** A laser beam, drawn for a few ticks. */
export interface Beam { x: number; y: number; x2: number; y2: number; t: number }
/** w: weapon index, 2 = grenade. */
export interface Kill { k: string; v: string; w: number }

/** What every player can see. The host sends it every tick. */
export interface MilState {
  /** 0: choosing a map, 1: fighting. */
  ph: 0 | 1;
  /** Index into MAPS. */
  m: number;
  /** Player id → map index they voted for, or RANDOM_MAP. */
  votes: Record<string, number>;
  /** Ticks left in the vote. */
  vt: number;
  /** One entry per pickup spawn of the map: ticks until it's back, 0 = ready. */
  pk: number[];
  /** Weapons lying around, waiting to be picked up. */
  wd: Drop[];
  p: Record<string, PSnap>;
  b: Shot[]; // bullets
  g: Body[]; // grenades
  r: Body[]; // rockets
  bm: Beam[]; // laser beams
  fx: Fx[];
  feed: Kill[];
  time: number; // ticks left
  winner: string | null;
}
export interface Input { l: boolean; r: boolean; j: boolean; f: boolean; a: number }
/** What a player can ask the host to do. START and REMATCH are host-only. */
export type MilAction =
  | ({ t: "IN" } & Input)
  | { t: "NADE" } | { t: "SWAP" } | { t: "RELOAD" } | { t: "DASH" } | { t: "SLOT"; s: number }
  | { t: "VOTE"; m: number }
  | { t: "START"; m?: number }
  | { t: "REMATCH"; same: boolean };

/* ───────────── Simulation (host only) ───────────── */

interface P extends Body {
  a: number; hp: number; fuel: number; mag: number; sl: number; sw: number; sa: number; rl: number; n: number;
  dead: number; k: number; d: number; j: boolean; ht: number; fl: number;
  ds: number; dc: number; ddx: number; ddy: number; hs: number; hh: number;
  in: Input; cd: number; nadeCd: number; calm: number; on: MaterialId | null;
}
const held = (p: P) => (p.sl === 1 && p.sw >= 0 ? p.sw : PISTOL);
interface Bullet extends Body { o: string; dmg: number; life: number; w: number }
interface Rocket extends Body { o: string; life: number }
interface Nade extends Body { o: string; fuse: number }

const r1 = (n: number) => Math.round(n * 10) / 10;
const validMap = (m: number) => Number.isInteger(m) && m >= RANDOM_MAP && m < MAPS.length;
const randomMap = () => Math.floor(Math.random() * MAPS.length);

/** Most votes wins; ties and "random" votes are settled by chance. */
export function tally(votes: Record<string, number>): number {
  const count = new Map<number, number>();
  for (const v of Object.values(votes)) count.set(v, (count.get(v) ?? 0) + 1);
  let best: number[] = [], top = 0;
  for (const [m, c] of count) {
    if (c > top) { best = [m]; top = c; } else if (c === top) best.push(m);
  }
  const pick = best[Math.floor(Math.random() * best.length)];
  return pick === undefined || pick === RANDOM_MAP ? randomMap() : pick;
}

function createSim(hostId: string, roster: () => string[]) {
  const players: Record<string, P> = {};
  let bullets: Bullet[] = [], nades: Nade[] = [], rockets: Rocket[] = [], beams: Beam[] = [], fx: Fx[] = [];
  const feed: Kill[] = [];
  let ph: 0 | 1 = 0, mi = 0, map = mapAt(0), votes: Record<string, number> = {}, vt = VOTE_TICKS;
  let pk: number[] = [], drops: Drop[] = [], dropIn = 60;
  let time = MATCH_TICKS, winner: string | null = null;
  const addFx = (x: number, y: number, k: number) => { fx.push({ x, y, k, t: FX_TTL[k] ?? 10 }); };

  /** Respawn at the point farthest from living enemies (with some randomness). */
  function spawn(id: string, p: P) {
    const foes = Object.entries(players).filter(([o, q]) => o !== id && !q.dead).map(([, q]) => q);
    let bx = map.w / 2, by = spawnY(map, { x: bx }), score = -1;
    for (const s of map.spawns) {
      const sy = spawnY(map, s);
      const near = foes.length ? Math.min(...foes.map((q) => Math.hypot(q.x - s.x, q.y - sy))) : 0;
      const v = near + Math.random() * 200;
      if (v > score) { bx = s.x; by = sy; score = v; }
    }
    Object.assign(p, {
      x: bx, y: by - PH - 1, vx: 0, vy: 0, hp: MAX_HP, fuel: MAX_FUEL,
      mag: weapon(PISTOL).ammo, sl: 0, sw: -1, sa: 0, rl: 0, n: MAX_NADES, dead: 0, j: false, cd: 0, nadeCd: 0, calm: 0, on: null, ht: 0, fl: 0, ds: 0, dc: 0, hs: 0, hh: 0,
    });
  }

  function join(id: string): P {
    const p: P = {
      x: 0, y: 0, vx: 0, vy: 0, a: 0, hp: MAX_HP, fuel: MAX_FUEL, mag: 0, sl: 0, sw: -1, sa: 0, rl: 0, n: 0,
      dead: 0, k: 0, d: 0, j: false, in: { l: false, r: false, j: false, f: false, a: 0 },
      cd: 0, nadeCd: 0, calm: 0, on: null, ht: 0, fl: 0, ds: 0, dc: 0, ddx: 0, ddy: 0, hs: 0, hh: 0,
    };
    spawn(id, p);
    players[id] = p;
    return p;
  }

  /** Loads a map and starts a fresh round. Player ids (and so their looks) carry over. */
  function begin(m: number) {
    mi = m === RANDOM_MAP ? randomMap() : m;
    map = mapAt(mi);
    ph = 1; votes = {}; vt = 0;
    bullets = []; nades = []; rockets = []; beams = []; fx = []; feed.length = 0;
    pk = map.pickups.map(() => 0);
    drops = []; dropIn = 60;
    for (let i = 0; i < 2; i++) dropWeapon();
    time = MATCH_TICKS; winner = null;
    for (const id of Object.keys(players)) delete players[id];
    for (const id of roster()) join(id);
  }

  function toVote() {
    ph = 0; votes = {}; vt = VOTE_TICKS; winner = null;
    bullets = []; nades = []; rockets = []; beams = []; fx = []; feed.length = 0; drops = [];
    for (const id of Object.keys(players)) delete players[id];
  }

  /** Drops a random weapon at a random free spot (or the given weapon at the given spot). */
  function dropWeapon(w?: number, at?: { x: number; y: number }) {
    let spot = at ?? null;
    for (let i = 0; !spot && i < 12; i++) {
      const s = randomSpot(map);
      if (s && !drops.some((d) => Math.hypot(d.x - s.x, d.y - s.y) < 160)) spot = s;
    }
    if (!spot) return;
    const kind = w ?? DROPPABLE[Math.floor(Math.random() * DROPPABLE.length)]!;
    drops.push({ x: spot.x, y: spot.y, w: kind, t: DROP_TTL });
    addFx(spot.x, spot.y - 16, 4);
  }

  function damage(id: string, amount: number, from: string, w: number, kx: number, ky: number, head = false) {
    const q = players[id];
    if (!q || q.dead || winner) return;
    q.hp -= amount; q.calm = 0; q.vx += kx; q.vy += ky;
    const shooter = players[from];
    if (shooter && from !== id) { shooter.ht = 6; if (head) shooter.hs = 6; }
    if (head) q.hh = 6;
    if (q.hp > 0) return;
    q.hp = 0; q.dead = RESPAWN_TICKS; q.j = false; q.d++;
    if (q.sw >= 0 && q.sa > 0) {
      const gy = surfaceBelow(map, q.x, q.y + PH);
      if (gy < map.h) dropWeapon(q.sw, { x: q.x, y: gy });
      q.sw = -1; q.sa = 0; q.sl = 0;
    }
    addFx(q.x, q.y, 3);
    feed.push({ k: from, v: id, w });
    if (feed.length > 5) feed.shift();
    const killer = players[from];
    if (killer && from !== id) {
      killer.k++;
      if (killer.k >= KILLS_TO_WIN) winner = from;
    }
  }

  function explode(x: number, y: number, o: string, w: number, dmg: number, radius: number) {
    addFx(x, y, 0);
    for (const [id, q] of Object.entries(players)) {
      if (q.dead) continue;
      const dx = q.x - x, dy = q.y - y, dist = Math.hypot(dx, dy);
      if (dist >= radius) continue;
      const f = 1 - dist / radius, ux = dist ? dx / dist : 0, uy = dist ? dy / dist : -1;
      const self = id === o; // your own blast hurts less but throws you further: rocket jumps
      const kb = self ? 1.4 : 1;
      damage(id, dmg * f * (self ? 0.45 : 1), o, w, ux * 12 * f * kb, (uy * 12 * f - 4 * f) * kb);
    }
  }

  function fire(id: string, p: P) {
    const wi = held(p), wp = weapon(wi);
    if (wi === PISTOL) p.mag--; else p.sa--;
    p.cd = wp.cooldown; p.fl = 3;
    const c = Math.cos(p.a), s = Math.sin(p.a), gy = p.y + GUN_Y;
    if (wp.kind === "beam") {
      const L = wp.life;
      let t = segHit(map, p.x, gy, c * L, s * L) ?? 1, hit: string | null = null;
      for (const [qid, q] of Object.entries(players)) {
        if (qid === id || q.dead) continue;
        const h = segRect(p.x, gy, c * L, s * L, q.x - PW, q.y - PH, PW * 2, PH * 2);
        if (h !== null && h < t) { t = h; hit = qid; }
      }
      const hx = p.x + c * L * t, hy = gy + s * L * t;
      beams.push({ x: p.x + c * 24, y: gy + s * 24, x2: hx, y2: hy, t: 2 });
      if (t < 1) addFx(hx, hy, hit ? 2 : 1);
      if (hit) { const q = players[hit]!, head = hy < q.y - PH + 14; damage(hit, wp.dmg * (head ? wp.head : 1), id, wi, c * 0.6, s * 0.6, head); }
    } else if (wp.kind === "rocket") {
      rockets.push({ x: p.x + c * 14, y: gy + s * 14, vx: c * wp.speed, vy: s * wp.speed, o: id, life: wp.life });
    } else {
      for (let i = 0; i < wp.pellets; i++) {
        const a = p.a + (Math.random() * 2 - 1) * wp.spread;
        bullets.push({ x: p.x, y: gy, vx: Math.cos(a) * wp.speed, vy: Math.sin(a) * wp.speed, o: id, dmg: wp.dmg, life: wp.life, w: wi });
      }
    }
    p.vx -= c * wp.recoil;
    p.vy -= s * wp.recoil * 0.4;
    if (wi !== PISTOL && p.sa <= 0) { p.sw = -1; p.sa = 0; p.sl = 0; p.cd = 10; } // out of ammo: back to the pistol
  }

  /** Returns true if the change should be published right away. */
  function action(from: string, a: MilAction): boolean {
    if (a.t === "VOTE") {
      if (ph !== 0 || !validMap(a.m)) return false;
      votes[from] = a.m;
      return true;
    }
    if (a.t === "START") {
      if (from !== hostId || ph !== 0) return false;
      begin(a.m !== undefined && validMap(a.m) ? a.m : tally(votes));
      return true;
    }
    if (a.t === "REMATCH") {
      if (from !== hostId || !winner) return false;
      if (a.same) begin(mi); else toVote();
      return true;
    }
    if (ph !== 1 || winner) return false;
    const p = players[from] ?? join(from);
    if (a.t === "IN") { p.in = { l: a.l, r: a.r, j: a.j, f: a.f, a: a.a }; return false; }
    if (p.dead) return false;
    if (a.t === "SWAP" || a.t === "SLOT") {
      const want = a.t === "SLOT" ? (a.s ? 1 : 0) : p.sl ? 0 : 1;
      if (want === p.sl || (want === 1 && p.sw < 0)) return false;
      p.sl = want; p.cd = 8;
    }
    else if (a.t === "DASH") {
      if (p.dc > 0) return false;
      // Dash where you're steering (diagonally up if flying), or toward your aim if you're not pressing anything.
      let dx = (p.in.r ? 1 : 0) - (p.in.l ? 1 : 0), dy = p.in.j ? -0.7 : 0;
      if (!dx && !dy) dx = Math.cos(p.a) >= 0 ? 1 : -1;
      const len = Math.hypot(dx, dy);
      p.ddx = dx / len; p.ddy = dy / len; p.ds = DASH_TICKS; p.dc = DASH_COOLDOWN;
      addFx(p.x, p.y + PH - 4, 6);
    }
    else if (a.t === "RELOAD") { if (!p.rl && p.mag < weapon(PISTOL).ammo) { p.rl = weapon(PISTOL).reload; p.sl = 0; } }
    else if (a.t === "NADE" && p.n > 0 && !p.nadeCd) {
      const c = Math.cos(p.a), s = Math.sin(p.a);
      nades.push({ x: p.x + c * 10, y: p.y + GUN_Y + s * 10, vx: c * 13 + p.vx * 0.5, vy: s * 13 + p.vy * 0.5 - 2, o: from, fuse: 50 });
      p.n--; p.nadeCd = 15;
    }
    return false;
  }

  function collect(p: P) {
    map.pickups.forEach((s, i) => {
      if (pk[i]) return;
      const y = spawnY(map, s) - 14;
      if (Math.abs(p.x - s.x) > PW + 14 || Math.abs(p.y - y) > PH + 14) return;
      if (s.kind === 0) {
        if (p.hp >= MAX_HP) return;
        p.hp = Math.min(MAX_HP, p.hp + 50);
      } else {
        const full = p.n >= MAX_NADES && p.mag >= weapon(PISTOL).ammo && (p.sw < 0 || p.sa >= weapon(p.sw).ammo);
        if (full) return;
        p.mag = weapon(PISTOL).ammo; p.rl = 0; p.n = MAX_NADES;
        if (p.sw >= 0) p.sa = weapon(p.sw).ammo;
      }
      pk[i] = PICKUP_TICKS;
      addFx(s.x, y, 4);
    });
    drops = drops.filter((d) => {
      const y = d.y - 16;
      if (Math.abs(p.x - d.x) > PW + 16 || Math.abs(p.y - y) > PH + 16) return true;
      if (p.sw === d.w && p.sa >= weapon(d.w).ammo) return true;
      p.sw = d.w; p.sa = weapon(d.w).ammo; p.sl = 1; p.cd = Math.max(p.cd, 6);
      addFx(d.x, y, 4);
      return false;
    });
  }

  /** Returns true if the state should be published. */
  function step(): boolean {
    if (ph === 0) {
      const ids = roster();
      if (ids.length && ids.every((id) => votes[id] !== undefined) && vt > 60) vt = 60; // everyone voted: start shortly
      if (--vt <= 0) { begin(tally(votes)); return true; }
      return vt % 5 === 0;
    }
    if (winner) return false;
    for (const [id, p] of Object.entries(players)) {
      if (p.dead) { if (--p.dead === 0) spawn(id, p); continue; }
      const i = p.in, dir = (i.r ? 1 : 0) - (i.l ? 1 : 0);
      if (p.dc > 0) p.dc--;
      if (p.ds > 0) {
        // Dashing: fixed velocity, no gravity, then keep a little momentum.
        p.ds--;
        p.vx = p.ddx * DASH_SPEED * (p.ds ? 1 : 0.5); p.vy = p.ddy * DASH_SPEED * (p.ds ? 1 : 0.3);
        p.j = false;
      } else {
        p.vx += (dir * 6 - p.vx) * (p.on ? MATERIALS[p.on].friction : 0.1);
        p.j = i.j && p.fuel > 0;
        if (p.j) { p.vy -= 1.75; p.fuel = Math.max(0, p.fuel - 1.1); }
        else p.fuel = Math.min(MAX_FUEL, p.fuel + (p.on ? 2 : 0.3));
        p.vy = Math.max(-9, Math.min(16, p.vy + GRAVITY));
      }
      p.on = moveBody(map, p, PW, PH, 0);
      p.a = i.a;
      if (p.cd > 0) p.cd--;
      if (p.nadeCd > 0) p.nadeCd--;
      if (p.ht > 0) p.ht--;
      if (p.hs > 0) p.hs--;
      if (p.hh > 0) p.hh--;
      if (p.fl > 0) p.fl--;
      if (p.rl > 0) { if (--p.rl === 0) p.mag = weapon(PISTOL).ammo; }
      if (i.f && !p.cd) {
        if (p.sl === 1 && p.sw >= 0) fire(id, p);
        else if (!p.rl) {
          if (p.mag > 0) fire(id, p);
          else p.rl = weapon(PISTOL).reload; // auto-reload on empty
        }
      }
      if (++p.calm > 90) p.hp = Math.min(MAX_HP, p.hp + 0.4); // regen after 3s without damage
      collect(p);
      if (p.y > map.h + 100) damage(id, 999, id, NADE, 0, 0);
    }
    for (let i = 0; i < pk.length; i++) if (pk[i]! > 0) pk[i]!--;
    drops = drops.filter((d) => --d.t > 0);
    if (--dropIn <= 0) {
      dropIn = DROP_EVERY + Math.floor(Math.random() * 60);
      if (drops.length < dropCap(Object.keys(players).length)) dropWeapon();
    }

    bullets = bullets.filter((b) => {
      let t = segHit(map, b.x, b.y, b.vx, b.vy) ?? 1, hit: string | null = null;
      for (const [id, q] of Object.entries(players)) {
        if (id === b.o || q.dead) continue;
        const s = segRect(b.x, b.y, b.vx, b.vy, q.x - PW, q.y - PH, PW * 2, PH * 2);
        if (s !== null && s < t) { t = s; hit = id; }
      }
      if (t < 1) {
        const hx = b.x + b.vx * t, hy = b.y + b.vy * t;
        addFx(hx, hy, hit ? 2 : 1);
        if (hit) {
          const q = players[hit];
          const head = q ? hy < q.y - PH + 14 : false;
          const kick = b.w === SNIPER ? 0.08 : 0.03;
          damage(hit, b.dmg * (head ? weapon(b.w).head : 1), b.o, b.w, b.vx * kick, b.vy * kick, head);
        }
        return false;
      }
      b.x += b.vx; b.y += b.vy;
      return --b.life > 0;
    });

    nades = nades.filter((n) => {
      n.vy = Math.min(16, n.vy + GRAVITY);
      if (moveBody(map, n, 4, 4, 0.45)) n.vx *= 0.8;
      if (--n.fuse > 0) return true;
      explode(n.x, n.y, n.o, NADE, 95, BLAST_RADIUS);
      return false;
    });

    rockets = rockets.filter((r) => {
      let t = segHit(map, r.x, r.y, r.vx, r.vy) ?? 1;
      for (const [id, q] of Object.entries(players)) {
        if (id === r.o || q.dead) continue;
        const s = segRect(r.x, r.y, r.vx, r.vy, q.x - PW, q.y - PH, PW * 2, PH * 2);
        if (s !== null && s < t) t = s;
      }
      if (t < 1 || --r.life <= 0) {
        const k = Math.min(t, 1) * 0.95; // explode just in front of the wall, not inside it
        explode(r.x + r.vx * k, r.y + r.vy * k, r.o, BAZOOKA, weapon(BAZOOKA).dmg, 100);
        return false;
      }
      if (r.life % 2 === 0) addFx(r.x, r.y, 5);
      r.x += r.vx; r.y += r.vy;
      return true;
    });
    beams = beams.filter((b) => --b.t > 0);

    fx = fx.filter((f) => --f.t > 0);

    if (--time <= 0 && !winner) {
      const ranked = Object.entries(players).sort(([, a], [, b]) => b.k - a.k || a.d - b.d);
      if (ranked[0]) winner = ranked[0][0];
      else time = MATCH_TICKS;
    }
    return true;
  }

  /** A compact, rounded copy of the state for the network. */
  function snapshot(): MilState {
    const p: Record<string, PSnap> = {};
    for (const [id, q] of Object.entries(players))
      p[id] = {
        x: r1(q.x), y: r1(q.y), vx: r1(q.vx), vy: r1(q.vy), a: Math.round(q.a * 100) / 100,
        hp: Math.ceil(q.hp), fuel: Math.round(q.fuel), w: held(q), ammo: held(q) === PISTOL ? q.mag : q.sa, rl: q.rl,
        n: q.n, dead: q.dead, k: q.k, d: q.d, j: q.j, mag: q.mag, sl: q.sl, sw: q.sw, sa: q.sa, ht: q.ht, fl: q.fl, ds: q.ds, dc: q.dc, hs: q.hs, hh: q.hh,
      };
    const body = (b: Body) => ({ x: r1(b.x), y: r1(b.y), vx: r1(b.vx), vy: r1(b.vy) });
    return {
      ph, m: mi, votes: { ...votes }, vt, pk: [...pk], wd: drops.map((d) => ({ x: r1(d.x), y: r1(d.y), w: d.w, t: d.t })),
      p, b: bullets.map((b) => ({ ...body(b), w: b.w })), g: nades.map(body), r: rockets.map(body),
      bm: beams.map((b) => ({ x: r1(b.x), y: r1(b.y), x2: r1(b.x2), y2: r1(b.y2), t: b.t })),
      fx: fx.map((f) => ({ x: r1(f.x), y: r1(f.y), k: f.k, t: f.t })),
      feed: feed.map((f) => ({ ...f })), time, winner,
    };
  }

  return {
    action, step, snapshot,
    leave: (id: string) => { delete players[id]; delete votes[id]; },
  };
}

/* ───────────── Network guards + host ───────────── */

const fin = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const nums = (o: unknown, keys: readonly string[]) => isRec(o) && keys.every((k) => fin(o[k]));
const list = (x: unknown, keys: readonly string[], max: number) =>
  Array.isArray(x) && x.length <= max && x.every((o) => nums(o, keys));
const BODY = ["x", "y", "vx", "vy"] as const;

const net: GameNet<MilState, MilAction> = {
  // Other players are untrusted, so check the shape of everything they send.
  isState: (x): x is MilState =>
    isRec(x) &&
    (x.ph === 0 || x.ph === 1) &&
    fin(x.m) &&
    isRec(x.votes) &&
    Object.keys(x.votes).length <= 32 &&
    Object.values(x.votes).every(fin) &&
    fin(x.vt) &&
    Array.isArray(x.pk) && x.pk.length <= 32 && x.pk.every(fin) &&
    list(x.wd, ["x", "y", "w", "t"], 32) &&
    isRec(x.p) &&
    Object.values(x.p).every((q) => nums(q, P_NUM_KEYS) && typeof (q as { j?: unknown }).j === "boolean") &&
    list(x.b, [...BODY, "w"], 600) &&
    list(x.g, BODY, 60) &&
    list(x.r, BODY, 60) &&
    list(x.bm, ["x", "y", "x2", "y2", "t"], 120) &&
    list(x.fx, ["x", "y", "k", "t"], 400) &&
    Array.isArray(x.feed) &&
    x.feed.length <= 10 &&
    x.feed.every((f) => isRec(f) && isStr(f.k) && isStr(f.v) && fin(f.w)) &&
    fin(x.time) &&
    (x.winner === null || isStr(x.winner)),
  isAction: (x): x is MilAction =>
    isRec(x) &&
    ((x.t === "IN" && ["l", "r", "j", "f"].every((k) => typeof x[k] === "boolean") && fin(x.a)) ||
      x.t === "NADE" || x.t === "SWAP" || x.t === "RELOAD" || x.t === "DASH" ||
      (x.t === "SLOT" && fin(x.s)) ||
      (x.t === "VOTE" && fin(x.m)) ||
      (x.t === "START" && (x.m === undefined || fin(x.m))) ||
      (x.t === "REMATCH" && typeof x.same === "boolean")),
  // The rules run here, in the host's browser only.
  createHost(ctx) {
    const sim = createSim(ctx.selfId, () => ctx.players().map((p) => p.id));
    const timer = setInterval(() => { if (sim.step()) ctx.publish(); }, TICK_MS);
    return {
      state: () => sim.snapshot(),
      onAction(from, action) { if (sim.action(from, action)) ctx.publish(); },
      onPlayerLeave(id) { sim.leave(id); ctx.publish(); },
      dispose() { clearInterval(timer); },
    };
  },
};

/* ───────────── Module ───────────── */

const cover =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fb0ff"/><stop offset="1" stop-color="#eaf7ff"/></linearGradient></defs><rect width="320" height="240" fill="url(#s)"/><circle cx="262" cy="46" r="20" fill="#fff3b0"/><path d="M0 150 L60 90 L110 140 L170 70 L240 135 L290 95 L320 120 V240 H0Z" fill="#9ab7cf"/><path d="M0 190 Q40 170 80 185 T160 180 T240 186 T320 178 V240 H0Z" fill="#4b7a55"/><path d="M0 212 Q80 196 160 206 T320 204 V240 H0Z" fill="#8a5a3b" stroke="#2e1d14" stroke-width="3"/><path d="M0 212 Q80 196 160 206 T320 204 V214 Q240 216 160 216 T0 222Z" fill="#7cc850" stroke="#2e1d14" stroke-width="3"/><g stroke="#2a1d16" stroke-width="2.5"><rect x="128" y="104" width="12" height="26" rx="3" fill="#5b6170"/><polygon points="129,130 139,130 134,162" fill="#ffb703"/><rect x="138" y="100" width="28" height="30" rx="5" fill="#e63946"/><circle cx="152" cy="86" r="13" fill="#e9b98f"/><path d="M139 85a13 13 0 0 1 26 0z" fill="#8d2a33"/><rect x="156" y="104" width="44" height="8" rx="2" fill="#333"/></g></svg>`,
  );

const game: GameModule = {
  id: "batas-militar",
  title: "Batas Militar",
  tagline: "Fly, shoot, frag. Six arenas. First to 20 wins.",
  cover,
  minPlayers: 1,
  maxPlayers: 6,
  category: "Action",
  tags: ["Multiplayer"],
  description: "A 2D jetpack deathmatch across six illustrated arenas: forest, caverns, desert, highlands, factory and jungle ruins. Vote on the map, burn fuel to fly, start with a pistol, grab rifles, shotguns, SMGs, sniper rifles, laser guns and bazookas, and lob grenades around cover.",
  howTo: [
    "Everyone votes on the arena first. The host can also pick it directly.",
    `First to ${KILLS_TO_WIN} kills wins, or the top score when the 5-minute clock runs out.`,
    "Your jetpack refuels fastest while you're standing on something. Ice is slippery.",
    "Weapons drop in at random spots: Rifle, Shotgun, SMG, Sniper, Laser and Bazooka. Walk over one to grab it. Kill someone to make them drop theirs.",
    "Grab medkits for health and ammo crates for a full reload and grenades.",
    "Headshots do 50% more damage. Health regenerates after 3 seconds out of combat.",
  ],
  controls: [
    "A/D or ←/→: move · W/Space/↑: jetpack",
    "Mouse: aim · Click: fire · Right-click or G: grenade",
    "Shift: dash · 1/2, Q or mouse wheel: switch weapon · R: reload",
    "Tab: scoreboard",
    "Touch: left stick moves (push up to fly), right stick aims and fires",
  ],
  Component: lazy(() => import("./ui/Militia")),
  net,
};
export default game;
