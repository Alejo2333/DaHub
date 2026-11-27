/**
 * Client-side visual effects: explosions, sniper tracers and laser beams.
 * Purely cosmetic — the host decides hits and damage. Particles are pooled and drawn from
 * pre-rendered gradient sprites, so a big explosion costs a few dozen drawImage calls.
 */
import { BAZOOKA, BLAST_RADIUS, LASER, PISTOL, RIFLE, SHOTGUN, SMG, SNIPER } from "..";
import { segHit, surfaceBelow, type MapDefinition } from "../maps";
import type { G } from "./art";

const enum K { Fire, Smoke, Debris, Spark, Flash, Ring, Scorch, Trail, Ember, Dust, Blood, Gib, Splat, Mist, MFlash, Wisp, Casing, Num }
interface Part {
  k: K; x: number; y: number; vx: number; vy: number;
  age: number; life: number; r: number; rot: number; vr: number;
  x2: number; y2: number; shade: number;
  /** Gibs: which body part, its colour hue, and whether it has come to rest. */
  part: number; hue: number; rest: boolean;
  /** Muzzle flashes and casings: angle and weapon. Damage numbers: text. */
  a: number; w: number; txt: string;
}

const MAX = 900;
const parts: Part[] = [];
const pool: Part[] = [];

function add(k: K, x: number, y: number, o: Partial<Part> = {}) {
  if (parts.length >= MAX) return;
  const p = pool.pop() ?? ({} as Part);
  p.k = k; p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.age = 0; p.life = 1; p.r = 10; p.rot = 0; p.vr = 0; p.x2 = x; p.y2 = y; p.shade = 0; p.part = 0; p.hue = 0; p.rest = false; p.a = 0; p.w = 0; p.txt = "";
  Object.assign(p, o);
  parts.push(p);
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/* ───────── Sprites ───────── */

let sprites: Record<"hot" | "fire" | "smoke" | "glow" | "redGlow" | "blood" | "wisp", HTMLCanvasElement> | null = null;
function blob(stops: [number, string][]) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!, gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}
function sp() {
  sprites ??= {
    hot: blob([[0, "rgba(255,255,240,1)"], [0.25, "rgba(255,236,150,0.95)"], [0.55, "rgba(255,170,40,0.55)"], [1, "rgba(255,120,20,0)"]]),
    fire: blob([[0, "rgba(255,190,80,1)"], [0.35, "rgba(250,110,20,0.9)"], [0.7, "rgba(190,45,10,0.45)"], [1, "rgba(120,20,5,0)"]]),
    smoke: blob([[0, "rgba(58,53,50,0.95)"], [0.5, "rgba(48,44,42,0.65)"], [1, "rgba(40,38,36,0)"]]),
    wisp: blob([[0, "rgba(215,212,205,0.7)"], [0.55, "rgba(200,198,192,0.35)"], [1, "rgba(190,190,190,0)"]]),
    blood: blob([[0, "rgba(150,10,10,0.75)"], [0.6, "rgba(120,5,5,0.35)"], [1, "rgba(90,0,0,0)"]]),
    glow: blob([[0, "rgba(255,255,255,1)"], [0.3, "rgba(255,240,200,0.6)"], [1, "rgba(255,200,120,0)"]]),
    redGlow: blob([[0, "rgba(255,230,230,1)"], [0.25, "rgba(255,40,40,0.8)"], [1, "rgba(160,0,0,0)"]]),
  };
  return sprites;
}
function stamp(g: G, img: HTMLCanvasElement, x: number, y: number, r: number, a: number) {
  if (a <= 0.01 || r <= 0.5) return;
  g.globalAlpha = Math.min(1, a);
  g.drawImage(img, x - r, y - r, r * 2, r * 2);
}

/* ───────── Spawners ───────── */

/** A grenade or rocket explosion: flash, fireball, shockwave, smoke, debris, sparks and a scorch mark. */
export function explode(m: MapDefinition, x: number, y: number, scale = 1) {
  const R = BLAST_RADIUS * scale;
  add(K.Flash, x, y, { life: 0.14, r: R * 1.6 });
  add(K.Ring, x, y, { life: 0.38, r: R * 1.25 });
  const gy = surfaceBelow(m, x, y - 4);
  if (gy - y < R * 0.8) add(K.Scorch, x, gy, { life: 7, r: R * 0.55 });
  // Fireball: a cluster of hot blobs that expand, rise and cool.
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(40, 240) * scale;
    add(K.Fire, x + Math.cos(a) * rnd(0, 18), y + Math.sin(a) * rnd(0, 14), { vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8 - rnd(20, 80), life: rnd(0.4, 0.85), r: rnd(24, 46) * scale });
  }
  // Smoke billows, starting inside the fireball and outliving it.
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(10, 110) * scale;
    add(K.Smoke, x + Math.cos(a) * rnd(0, 30), y + Math.sin(a) * rnd(0, 20), { vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - rnd(25, 60), life: rnd(1.8, 3.2), r: rnd(26, 46) * scale, shade: rnd(0, 0.4), age: -rnd(0.05, 0.25) });
  }
  // Debris chunks, thrown mostly upward.
  for (let i = 0; i < 12; i++) {
    const a = -Math.PI / 2 + rnd(-1.3, 1.3), s = rnd(220, 520) * scale;
    add(K.Debris, x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.9, 1.6), r: rnd(3, 6), rot: rnd(0, 6), vr: rnd(-14, 14), shade: Math.random() });
  }
  // Sparks.
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(250, 700) * scale;
    add(K.Spark, x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 100, life: rnd(0.25, 0.6) });
  }
}

/** Called every frame for each sniper round in flight: a lingering red trail that sheds embers. */
export function sniperTrail(x: number, y: number, vx: number, vy: number, k: number) {
  const len = Math.hypot(vx, vy) || 1, ux = vx / len, uy = vy / len;
  add(K.Trail, x - vx * 1.2, y - vy * 1.2, { x2: x, y2: y, life: 0.7 });
  for (let i = 0; i < 3 * k; i++) {
    const t = Math.random() * 1.2;
    add(K.Ember, x - vx * t, y - vy * t, { vx: -uy * rnd(-60, 60) + ux * rnd(-20, 40), vy: ux * rnd(-60, 60) + uy * rnd(-20, 40) - 10, life: rnd(0.3, 0.8), r: rnd(1, 2.4) });
  }
}

let gore = true;
export const setGore = (on: boolean) => { gore = on; };
export const goreOn = () => gore;
let world: MapDefinition | null = null;

/** A small spray of blood where a bullet hits someone. */
export function bloodHit(x: number, y: number, n = 5) {
  if (!gore) return;
  for (let i = 0; i < n; i++) add(K.Blood, x, y, { vx: rnd(-120, 120), vy: rnd(-180, 40), life: rnd(0.5, 1), r: rnd(1.2, 2.4) });
  add(K.Mist, x, y, { life: 0.35, r: 10 });
}

/** A soldier bursts apart: helmet, limbs, torso and jetpack chunks with blood trails, a red mist and splats. */
export function gib(x: number, y: number, hue: number, vx: number, vy: number) {
  if (!gore) return;
  add(K.Mist, x, y, { life: 0.6, r: 34 });
  add(K.Mist, x, y - 8, { life: 0.8, r: 24, vy: -20 });
  for (let i = 0; i < 46; i++) {
    const a = Math.random() * Math.PI * 2, s = rnd(80, 420);
    add(K.Blood, x + rnd(-6, 6), y + rnd(-10, 10), { vx: Math.cos(a) * s + vx * 20, vy: Math.sin(a) * s - 160 + vy * 20, life: rnd(0.7, 1.4), r: rnd(1.4, 3.4) });
  }
  // part: 0 helmet, 1 arm, 2 leg, 3 torso, 4 jetpack, 5 meat chunk
  for (const part of [0, 1, 1, 2, 2, 3, 4, 5, 5, 5]) {
    const a = -Math.PI / 2 + rnd(-1.4, 1.4), s = rnd(180, 420);
    add(K.Gib, x + rnd(-6, 6), y + rnd(-12, 8), { part, hue, vx: Math.cos(a) * s + vx * 25, vy: Math.sin(a) * s + vy * 15, life: rnd(4, 6), rot: rnd(0, 6), vr: rnd(-16, 16), r: part === 5 ? rnd(2.5, 4) : 1 });
  }
}

function splat(x: number, y: number, r: number) {
  add(K.Splat, x, y, { life: rnd(7, 10), r, rot: Math.random() * 1000 });
}

/** Draws one body chunk at the origin. */
function drawGib(g: G, part: number, hue: number, r: number) {
  g.lineWidth = 1; g.strokeStyle = "#1a0d0a";
  const uniform = `hsl(${hue} 55% 40%)`;
  g.beginPath();
  switch (part) {
    case 0: g.arc(0, 0, 8, Math.PI, 0); g.closePath(); g.fillStyle = `hsl(${hue} 45% 30%)`; break; // helmet
    case 1: g.roundRect(-6, -2.2, 12, 4.4, 2); g.fillStyle = uniform; break; // arm
    case 2: g.roundRect(-3, -6, 6, 12, 2); g.fillStyle = "#2b2d42"; break; // leg
    case 3: g.roundRect(-8, -7, 16, 13, 3); g.fillStyle = uniform; break; // torso
    case 4: g.roundRect(-4, -8, 8, 15, 2); g.fillStyle = "#5b6170"; break; // jetpack
    default: g.ellipse(0, 0, r * 1.4, r, 0, 0, Math.PI * 2); g.fillStyle = "#8a1010"; break; // chunk
  }
  g.fill(); g.stroke();
  if (part > 0 && part < 4) { // torn, bloody end
    g.beginPath(); g.arc(part === 2 ? 0 : -5, part === 2 ? -5 : 0, 2.6, 0, Math.PI * 2); g.fillStyle = "#b01515"; g.fill();
  }
}

/** Flash shape per gun: cone length and width, number of spikes, glow radius, side jets (muzzle brake). */
const FLASH: Record<number, { len: number; wid: number; spikes: number; glow: number; side?: boolean }> = {
  [PISTOL]: { len: 15, wid: 8, spikes: 4, glow: 22 },
  [RIFLE]: { len: 26, wid: 9, spikes: 4, glow: 30 },
  [SMG]: { len: 17, wid: 7, spikes: 3, glow: 20 },
  [SHOTGUN]: { len: 34, wid: 20, spikes: 6, glow: 46 },
  [SNIPER]: { len: 42, wid: 11, spikes: 2, glow: 54, side: true },
  [BAZOOKA]: { len: 24, wid: 18, spikes: 0, glow: 40 },
};

/**
 * Everything a gun does visually when it fires, from its pivot (gx, gy), aim angle and muzzle distance:
 * the flash, gun smoke, sparks, a backblast for rockets, and an ejected casing.
 */
export function fireFx(gx: number, gy: number, a: number, w: number, mz: number) {
  if (w === LASER) return;
  const c = Math.cos(a), s = Math.sin(a);
  const mx = gx + c * mz, my = gy + s * mz;
  add(K.MFlash, mx, my, { a, w, life: w === SNIPER || w === SHOTGUN ? 0.085 : 0.06, shade: Math.random() });
  const puffs = w === SHOTGUN || w === SNIPER ? 5 : w === BAZOOKA ? 3 : 2;
  for (let i = 0; i < puffs; i++)
    add(K.Wisp, mx + c * rnd(0, 8), my + s * rnd(0, 8), { vx: c * rnd(20, 90) + rnd(-10, 10), vy: s * rnd(20, 90) - rnd(10, 30), life: rnd(0.5, 1.1), r: rnd(4, 8) * (w === SHOTGUN ? 1.4 : 1) });
  if (w === SHOTGUN) for (let i = 0; i < 8; i++) {
    const sa = a + rnd(-0.35, 0.35), sp = rnd(300, 700);
    add(K.Spark, mx, my, { vx: Math.cos(sa) * sp, vy: Math.sin(sa) * sp, life: rnd(0.08, 0.2) });
  }
  if (w === SNIPER) for (const side of [-1, 1]) add(K.Wisp, mx, my, { vx: -s * side * rnd(60, 110), vy: c * side * rnd(60, 110) - 20, life: 0.7, r: 6 });
  if (w === BAZOOKA) {
    // Backblast out of the rear of the tube.
    const bx = gx - c * 22, by = gy - s * 22;
    for (let i = 0; i < 6; i++) add(K.Fire, bx, by, { vx: -c * rnd(120, 260) + rnd(-30, 30), vy: -s * rnd(120, 260) + rnd(-30, 30), life: rnd(0.12, 0.25), r: rnd(8, 14) });
    for (let i = 0; i < 6; i++) add(K.Smoke, bx, by, { vx: -c * rnd(40, 140) + rnd(-20, 20), vy: -s * rnd(40, 140) - rnd(10, 30), life: rnd(0.9, 1.6), r: rnd(10, 18), shade: 0.6 });
    return;
  }
  // Ejected casing: up and back out of the ejection port (mirrored when facing left).
  const up = c >= 0 ? 1 : -1, nx = s * up, ny = -c * up;
  add(K.Casing, gx + c * 5, gy + s * 5 - 3, {
    w, a: rnd(0, 6), vr: rnd(-30, 30), life: rnd(2.5, 3.5),
    vx: nx * rnd(110, 190) - c * rnd(30, 90), vy: ny * rnd(110, 190) - s * rnd(30, 90),
    age: w === SHOTGUN ? -0.32 : w === SNIPER ? -0.55 : 0, // shotgun and sniper eject when the pump/bolt cycles
  });
}

/** A bullet hitting a wall or the ground: sparks and a puff of dust. */
export function impact(x: number, y: number) {
  for (let i = 0; i < 5; i++) add(K.Spark, x, y, { vx: rnd(-260, 260), vy: rnd(-320, 60), life: rnd(0.1, 0.25) });
  add(K.Dust, x, y, { vx: rnd(-20, 20), vy: rnd(-40, -10), life: rnd(0.35, 0.6), r: rnd(3, 6) });
  add(K.Wisp, x, y, { vy: -20, life: 0.5, r: 5 });
}

/** A floating damage number. mine: you dealt it. */
export function damageNumber(x: number, y: number, n: number, mine: boolean, head = false) {
  add(K.Num, x + rnd(-6, 6), y, { vy: -70, vx: rnd(-15, 15), life: head ? 1.1 : 0.9, txt: String(Math.round(n)) + (head ? "!" : ""), part: mine ? 1 : 0, r: head ? 1.7 : n >= 40 ? 1.5 : 1 });
}

function drawFlash(g: G, p: Part, f: number) {
  const o = FLASH[p.w];
  if (!o) return;
  const k = 1 - f, jit = 0.75 + 0.5 * p.shade, L = o.len * jit * (0.7 + 0.3 * k), W = o.wid * (0.8 + 0.4 * p.shade);
  g.save(); g.translate(p.x, p.y); g.rotate(p.a);
  // Light bloom is additive; the flame itself is painted normally so it stays orange on bright maps.
  g.globalCompositeOperation = "lighter";
  stamp(g, sp().glow, 4, 0, o.glow * (0.6 + 0.4 * k), k * 0.45);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = Math.min(1, k * 1.3);
  const cone = (len: number, wid: number, col0: string, col1: string) => {
    const gr = g.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, col0); gr.addColorStop(1, col1);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -wid * 0.35); g.quadraticCurveTo(len * 0.45, -wid, len, 0); g.quadraticCurveTo(len * 0.45, wid, 0, wid * 0.35); g.closePath(); g.fill();
  };
  cone(L, W, "rgba(255,140,30,0.95)", "rgba(230,60,10,0)");
  cone(L * 0.8, W * 0.75, "rgba(255,200,60,1)", "rgba(255,120,20,0)");
  // Jagged spikes around the cone, different every shot.
  g.fillStyle = "rgba(255,170,50,0.9)";
  for (let i = 0; i < o.spikes; i++) {
    const sa = ((i + 0.5) / o.spikes - 0.5) * 1.8 + (p.shade - 0.5) * 0.4, sl = L * (0.3 + 0.35 * ((p.shade * 7 + i * 0.37) % 1));
    g.beginPath(); g.moveTo(0, -1.2); g.lineTo(Math.cos(sa) * sl, Math.sin(sa) * sl); g.lineTo(0, 1.2); g.closePath(); g.fill();
  }
  if (o.side) for (const sd of [-1, 1]) {
    g.save(); g.rotate(sd * Math.PI / 2); cone(L * 0.45, W * 0.7, "rgba(255,200,110,0.9)", "rgba(255,100,30,0)"); g.restore();
  }
  cone(L * 0.5, W * 0.45, "rgba(255,255,235,1)", "rgba(255,235,150,0)");
  g.restore();
}

function drawCasing(g: G, p: Part, f: number) {
  g.globalAlpha = Math.min(1, (p.life - p.age) / 0.6);
  g.save(); g.translate(p.x, p.y); g.rotate(p.a);
  if (p.w === SHOTGUN) {
    g.fillStyle = "#b8231c"; g.fillRect(-2.6, -1.3, 4, 2.6);
    g.fillStyle = "#d9a441"; g.fillRect(1.4, -1.4, 1.4, 2.8);
  } else {
    const len = p.w === SNIPER ? 5.6 : p.w === SMG || p.w === PISTOL ? 2.8 : 3.6, wid = p.w === SNIPER ? 1.8 : 1.3;
    g.fillStyle = "#d9a441"; g.fillRect(-len / 2, -wid / 2, len, wid);
    g.fillStyle = "#fff0b0"; g.fillRect(-len / 2, -wid / 2, len, 0.5);
    g.fillStyle = "#8a6420"; g.fillRect(len / 2 - 0.8, -wid / 2, 0.8, wid);
  }
  g.restore();
  void f;
}

export function dashPuff(x: number, y: number, dir: number) {
  for (let i = 0; i < 8; i++) add(K.Dust, x + rnd(-8, 8), y, { vx: -dir * rnd(40, 140), vy: -rnd(10, 50), life: rnd(0.3, 0.6), r: rnd(5, 10) });
}

/* ───────── Laser beam (drawn every frame from the shooter, so it is continuous) ───────── */

export function laserBeam(g: G, m: MapDefinition, x: number, y: number, a: number, t: number, targets: readonly { x: number; y: number }[]) {
  const L = 1100, c = Math.cos(a), s = Math.sin(a);
  let k = segHit(m, x, y, c * L, s * L) ?? 1;
  for (const p of targets) {
    // Cheap circle test against other players so the beam visibly stops on them.
    const px = p.x - x, py = p.y - y, along = px * c + py * s;
    if (along <= 0 || along / L >= k) continue;
    if (Math.abs(px * s - py * c) < 14) k = along / L;
  }
  const ex = x + c * L * k, ey = y + s * L * k;
  const wob = 1 + 0.18 * Math.sin(t * 40) + 0.1 * Math.sin(t * 73);
  g.save();
  g.globalCompositeOperation = "lighter";
  g.lineCap = "round";
  g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey);
  g.strokeStyle = "rgba(40,180,255,0.18)"; g.lineWidth = 16 * wob; g.stroke();
  g.strokeStyle = "rgba(60,220,255,0.45)"; g.lineWidth = 7 * wob; g.stroke();
  g.strokeStyle = "rgba(235,255,255,0.95)"; g.lineWidth = 2.2; g.stroke();
  // Energy ripples travelling along the beam.
  const dist = L * k;
  g.fillStyle = "rgba(200,250,255,0.8)";
  for (let d = (t * 900) % 60; d < dist; d += 60) g.fillRect(x + c * d - 1.5, y + s * d - 1.5, 3, 3);
  const S = sp();
  stamp(g, S.glow, ex, ey, 16 * wob, 0.9);
  stamp(g, S.glow, x, y, 9 * wob, 0.7);
  g.restore();
  if (k < 1 && Math.random() < 0.7) add(K.Spark, ex, ey, { vx: rnd(-160, 160) - c * 120, vy: rnd(-200, 40) - s * 120, life: rnd(0.15, 0.35) });
}

/** Red aiming laser for anyone holding a sniper, so you know you're being lined up. */
export function sniperSight(g: G, m: MapDefinition, x: number, y: number, a: number, t: number) {
  const L = 1600, c = Math.cos(a), s = Math.sin(a);
  const k = segHit(m, x, y, c * L, s * L) ?? 1, ex = x + c * L * k, ey = y + s * L * k;
  const pulse = 0.75 + 0.25 * Math.sin(t * 8);
  g.save();
  g.lineCap = "round";
  const gr = g.createLinearGradient(x, y, ex, ey);
  gr.addColorStop(0, `rgba(255,40,40,${0.55 * pulse})`); gr.addColorStop(1, `rgba(255,40,40,${0.2 * pulse})`);
  g.beginPath(); g.moveTo(x, y); g.lineTo(ex, ey);
  g.strokeStyle = gr; g.lineWidth = 1.2; g.stroke();
  g.globalCompositeOperation = "lighter";
  if (k < 1) stamp(g, sp().redGlow, ex, ey, 7 * pulse, 0.9);
  g.restore();
}

/* ───────── Update + draw ───────── */

let lastT = 0;
/** Scorch marks go under everything; call before drawing players. */
export function drawUnder(g: G) {
  for (const p of parts) {
    if (p.k === K.Splat) {
      // Irregular blood pool, seeded by p.rot so it keeps its shape.
      const a = Math.min(1, (p.life - p.age) / 2) * 0.85;
      g.save(); g.translate(p.x, p.y); g.scale(1, 0.3);
      g.fillStyle = `rgba(120,8,8,${a})`;
      g.beginPath();
      for (let i = 0; i < 9; i++) {
        const ang = (i / 9) * Math.PI * 2, rr = p.r * (0.6 + 0.4 * Math.abs(Math.sin(p.rot + i * 1.7)));
        g.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
      g.closePath(); g.fill();
      g.fillStyle = `rgba(160,20,20,${a * 0.8})`;
      g.beginPath(); g.arc(-p.r * 0.2, -p.r * 0.15, p.r * 0.35, 0, Math.PI * 2); g.fill();
      g.restore();
      continue;
    }
    if (p.k !== K.Scorch) continue;
    const a = Math.min(1, (p.life - p.age) / 2) * 0.5;
    g.save(); g.translate(p.x, p.y); g.scale(1, 0.22);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, p.r);
    gr.addColorStop(0, `rgba(15,10,8,${a})`); gr.addColorStop(0.6, `rgba(30,20,12,${a * 0.6})`); gr.addColorStop(1, "rgba(30,20,12,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, p.r, 0, Math.PI * 2); g.fill();
    g.restore();
  }
}

/** Advances and draws every effect particle. Call after drawing players. */
export function drawOver(g: G, t: number, m?: MapDefinition) {
  if (m) world = m;
  const dt = lastT ? Math.min(0.05, Math.max(0, t - lastT)) : 0.016;
  lastT = t;
  const S = sp();
  // Update (swap-remove dead particles back into the pool).
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]!;
    p.age += dt;
    if (p.age >= p.life) { pool.push(p); parts[i] = parts[parts.length - 1]!; parts.pop(); continue; }
    if (p.age < 0) continue;
    switch (p.k) {
      case K.Fire: p.vx *= 1 - 3.5 * dt; p.vy = p.vy * (1 - 3 * dt) - 60 * dt; break;
      case K.Smoke: p.vx *= 1 - 1.2 * dt; p.vy = p.vy * (1 - 1.2 * dt) - 18 * dt; break;
      case K.Debris:
        p.vy += 900 * dt; p.rot += p.vr * dt;
        if (Math.random() < 0.35) add(K.Smoke, p.x, p.y, { life: 0.5, r: 4, vy: -10, shade: 0.5 });
        break;
      case K.Spark: case K.Ember: p.vx *= 1 - 2 * dt; p.vy += (p.k === K.Spark ? 500 : 60) * dt; break;
      case K.Dust: p.vx *= 1 - 4 * dt; p.vy *= 1 - 3 * dt; break;
      case K.Mist: p.vy -= 10 * dt; break;
      case K.Wisp: p.vx *= 1 - 2 * dt; p.vy = p.vy * (1 - 2 * dt) - 14 * dt; break;
      case K.Num: p.vy *= 1 - 2.5 * dt; break;
      case K.Casing:
        if (p.rest) { p.vx = p.vy = 0; break; }
        p.vy += 1100 * dt; p.a += p.vr * dt;
        if (world && p.vy > 0) {
          const gy = surfaceBelow(world, p.x, p.y - 2);
          if (p.y + p.vy * dt >= gy - 1) {
            p.y = gy - 1;
            if (p.vy > 120) { p.vy *= -0.45; p.vx *= 0.6; p.vr *= -0.6; }
            else { p.rest = true; p.vx = p.vy = 0; p.a = Math.round(p.a / Math.PI) * Math.PI; }
          }
        }
        break;
      case K.Blood:
        p.vy += 900 * dt;
        if (world && p.vy > 0) {
          const gy = surfaceBelow(world, p.x, p.y - 2);
          if (p.y + p.vy * dt >= gy) { if (Math.random() < 0.35) splat(p.x, gy, rnd(4, 10)); p.age = p.life; continue; }
        }
        break;
      case K.Gib:
        if (p.rest) { p.vx = p.vy = 0; break; }
        p.vy += 1000 * dt; p.rot += p.vr * dt;
        if (Math.random() < 0.5) add(K.Blood, p.x, p.y, { vx: rnd(-20, 20), vy: rnd(-20, 20), life: 0.6, r: rnd(1, 2) });
        if (world && p.vy > 0) {
          const gy = surfaceBelow(world, p.x, p.y - 2);
          if (p.y + p.vy * dt >= gy - 3) {
            p.y = gy - 3;
            if (p.vy > 220) { p.vy *= -0.35; p.vx *= 0.6; p.vr *= 0.5; splat(p.x, gy, rnd(6, 12)); }
            else { p.rest = true; p.vx = p.vy = 0; p.vr = 0; splat(p.x, gy, rnd(8, 14)); }
          }
        }
        break;
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  // Draw: smoke first (normal blending), then additive fire and light.
  for (const p of parts) {
    if (p.age < 0) continue;
    const f = p.age / p.life;
    if (p.k === K.Smoke) {
      const a = Math.min(1, p.age * 5) * (1 - f) * (1 - p.shade * 0.4);
      stamp(g, S.smoke, p.x, p.y, p.r * (1 + f * 2.2), a);
    } else if (p.k === K.Dust) {
      g.globalAlpha = (1 - f) * 0.5; g.fillStyle = "#d8c8a8";
      g.beginPath(); g.arc(p.x, p.y, p.r * (1 + f), 0, Math.PI * 2); g.fill();
    } else if (p.k === K.Debris) {
      g.globalAlpha = Math.min(1, (1 - f) * 3);
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = p.shade > 0.5 ? "#3b2f26" : "#57504a";
      g.fillRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4);
      g.restore();
    } else if (p.k === K.Blood) {
      g.globalAlpha = Math.min(1, (1 - f) * 3); g.fillStyle = "#a10e0e";
      g.beginPath(); g.ellipse(p.x, p.y, p.r * 1.3, p.r, Math.atan2(p.vy, p.vx), 0, Math.PI * 2); g.fill();
    } else if (p.k === K.Wisp) {
      stamp(g, S.wisp, p.x, p.y, p.r * (1 + f * 2.5), (1 - f) * 0.8);
    } else if (p.k === K.MFlash) {
      drawFlash(g, p, f);
    } else if (p.k === K.Casing) {
      drawCasing(g, p, f);
    } else if (p.k === K.Mist) {
      stamp(g, S.blood, p.x, p.y, p.r * (1 + f * 1.5), (1 - f) * 0.9);
    } else if (p.k === K.Gib) {
      g.globalAlpha = Math.min(1, (p.life - p.age) / 0.8);
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); drawGib(g, p.part, p.hue, p.r); g.restore();
    } else if (p.k === K.Trail) {
      // The sniper trail: dark smoke core first, glow added below.
      g.globalAlpha = (1 - f) * 0.35; g.strokeStyle = "#3a1010"; g.lineWidth = 5 + f * 8; g.lineCap = "round";
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x2, p.y2); g.stroke();
    }
  }
  g.globalCompositeOperation = "lighter";
  for (const p of parts) {
    if (p.age < 0) continue;
    const f = p.age / p.life;
    switch (p.k) {
      case K.Fire: {
        const r = p.r * (0.7 + f * 1.6);
        stamp(g, S.fire, p.x, p.y, r, (1 - f) * 0.95);
        stamp(g, S.hot, p.x, p.y, r * 0.75, Math.max(0, 1 - f * 2.4));
        break;
      }
      case K.Flash: stamp(g, S.glow, p.x, p.y, p.r * (0.6 + f * 0.6), (1 - f) * 1.2); break;
      case K.Ring:
        g.globalAlpha = (1 - f) * 0.7; g.strokeStyle = "#fff4dc"; g.lineWidth = 6 * (1 - f) + 1;
        g.beginPath(); g.arc(p.x, p.y, p.r * Math.sqrt(f), 0, Math.PI * 2); g.stroke();
        break;
      case K.Spark: {
        const sp2 = 0.03;
        g.globalAlpha = 1 - f; g.strokeStyle = f < 0.4 ? "#fff3c4" : "#ffab3d"; g.lineWidth = 1.6; g.lineCap = "round";
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * sp2, p.y - p.vy * sp2); g.stroke();
        break;
      }
      case K.Ember: stamp(g, S.redGlow, p.x, p.y, p.r * 3, 1 - f); break;
      case K.Trail:
        g.lineCap = "round";
        g.globalAlpha = (1 - f) * 0.55; g.strokeStyle = "#ff2020"; g.lineWidth = 6 * (1 - f) + 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x2, p.y2); g.stroke();
        g.globalAlpha = (1 - f) * 0.9; g.strokeStyle = "#ffb0a0"; g.lineWidth = 1.2;
        g.stroke();
        break;
    }
  }
  g.globalCompositeOperation = "source-over";
  g.textAlign = "center";
  for (const p of parts) {
    if (p.k !== K.Num) continue;
    const f = p.age / p.life, pop = f < 0.15 ? 1 + (0.15 - f) * 4 : 1;
    g.globalAlpha = Math.min(1, (1 - f) * 2.5);
    g.font = `900 ${Math.round(13 * p.r * pop)}px sans-serif`;
    g.lineWidth = 3.5; g.strokeStyle = "rgba(0,0,0,0.85)"; g.strokeText(p.txt, p.x, p.y);
    g.fillStyle = p.r > 1 ? "#ff5a4a" : p.part ? "#ffe066" : "#ffffff"; g.fillText(p.txt, p.x, p.y);
  }
  g.globalAlpha = 1;
}

/** Drops every particle, e.g. when the map changes. */
export function clearFx() { pool.push(...parts); parts.length = 0; }
