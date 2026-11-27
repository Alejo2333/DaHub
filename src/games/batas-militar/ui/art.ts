/**
 * Procedural cartoon artwork for the arenas: terrain, platforms, decorations and backdrops.
 * Every painter is deterministic (seeded), so the same thing can be painted into several cache tiles and line up.
 * Style rules: bold dark outlines, two-tone shading (shadow bottom-right, highlight top-left), no neon.
 */
import {
  MATERIALS, fieldAt, rng,
  type BackdropKind, type DecoKind, type DecorationDefinition, type MapDefinition, type PlatformDefinition, type Pt, type TerrainMaterial,
} from "../maps";

export type G = CanvasRenderingContext2D;
export type Box = readonly [number, number, number, number]; // x0, y0, x1, y1

export const INK = "#2a1d16";
const TAU = Math.PI * 2;

/* ───────────── Colour helpers ───────────── */

const memo = new Map<string, string>();
const rgbOf = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Blend two #rrggbb colours. The result is #rrggbb too, so calls can be chained. */
export function mix(a: string, b: string, k: number): string {
  const key = a + b + k;
  let out = memo.get(key);
  if (!out) {
    const x = rgbOf(a), y = rgbOf(b);
    out = "#" + x.map((v, i) => Math.round(v + (y[i]! - v) * k).toString(16).padStart(2, "0")).join("");
    memo.set(key, out);
  }
  return out;
}
export const lighten = (c: string, k: number) => mix(c, "#ffffff", k);
export const darken = (c: string, k: number) => mix(c, "#000000", k);
export const rgba = (c: string, a: number) => { const [r, g, b] = rgbOf(c); return `rgba(${r},${g},${b},${a})`; };

/* ───────────── Path helpers ───────────── */

/** A closed, smooth outline through the points. */
export function smooth(g: G, pts: readonly Pt[]) {
  const n = pts.length;
  const mid = (i: number): Pt => { const a = pts[i % n]!, b = pts[(i + 1) % n]!; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const m0 = mid(0);
  g.moveTo(m0[0], m0[1]);
  for (let i = 1; i <= n; i++) { const p = pts[i % n]!, m = mid(i); g.quadraticCurveTo(p[0], p[1], m[0], m[1]); }
  g.closePath();
}
/** Irregular blob around an ellipse. */
export function blobPts(cx: number, cy: number, rx: number, ry: number, n: number, jit: number, r: () => number, flatBottom = false): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.3, k = 1 - jit + r() * jit * 2;
    let y = cy + Math.sin(a) * ry * k;
    if (flatBottom) y = Math.min(y, cy + ry * 0.55);
    out.push([cx + Math.cos(a) * rx * k, y]);
  }
  return out;
}
function ink(g: G, w = 2.5, c = INK) {
  g.lineWidth = w; g.strokeStyle = c; g.lineJoin = "round"; g.lineCap = "round"; g.stroke();
}
function fillInk(g: G, fill: string, w = 2.5, c = INK) { g.fillStyle = fill; g.fill(); ink(g, w, c); }
function rrect(g: G, x: number, y: number, w: number, h: number, r: number | number[]) {
  g.beginPath(); g.roundRect(x, y, w, h, r);
}
/** Cartoon cluster of circles: outlined as one shape, shaded in three tones. */
function puffs(g: G, cs: readonly (readonly [number, number, number])[], dark: string, mid: string, light: string, outline = 5) {
  g.beginPath();
  for (const [x, y, r] of cs) { g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU); }
  ink(g, outline);
  g.fillStyle = dark; g.fill();
  g.beginPath();
  for (const [x, y, r] of cs) { g.moveTo(x - r * 0.1 + r * 0.86, y - r * 0.12); g.arc(x - r * 0.1, y - r * 0.12, r * 0.86, 0, TAU); }
  g.fillStyle = mid; g.fill();
  g.beginPath();
  for (const [x, y, r] of cs) { g.moveTo(x - r * 0.3 + r * 0.42, y - r * 0.36); g.arc(x - r * 0.3, y - r * 0.36, r * 0.42, 0, TAU); }
  g.fillStyle = light; g.fill();
}

/* ───────────── Terrain ───────────── */

interface Speck { x: number; y: number; r: number; c: number }
interface Pebble { x: number; y: number; r: number; seed: number }
export interface TerrainArt { specks: Speck[]; pebbles: Pebble[]; rockFill: string; ceilSpecks: Speck[]; top: number }

/** Precomputes texture detail for the ground and ceiling, once per map. */
export function prepTerrain(m: MapDefinition): TerrainArt {
  const r = rng(hash(m.id));
  const mat = MATERIALS[m.terrain.mat];
  const specks: Speck[] = [], pebbles: Pebble[] = [], ceilSpecks: Speck[] = [];
  for (let x = 0; x < m.w; x += 14) {
    const top = fieldAt(m.terrain.ground, x);
    for (let d = mat.topH + 8; top + d < m.h + 40; d += 16 + r() * 10)
      specks.push({ x: x + r() * 14, y: top + d + r() * 8, r: 1.2 + r() * 2.4, c: r() < 0.6 ? 0 : 1 });
    if (r() < 0.12) pebbles.push({ x: x + r() * 14, y: top + mat.topH + 30 + r() * 180, r: 7 + r() * 13, seed: (r() * 1e9) | 0 });
    if (m.terrain.ceil) {
      const bot = fieldAt(m.terrain.ceil, x);
      for (let d = 10; bot - d > -40; d += 16 + r() * 10)
        ceilSpecks.push({ x: x + r() * 14, y: bot - d - r() * 8, r: 1.2 + r() * 2.4, c: r() < 0.6 ? 0 : 1 });
    }
  }
  const rockBase = m.terrain.mat === "sand" ? "#c98d55" : m.terrain.mat === "snow" ? "#8b9db3" : "#8f949b";
  const top = Math.min(...m.terrain.ground.map((p) => p[1]));
  return { specks, pebbles, ceilSpecks, top, rockFill: mix(rockBase, mat.body, 0.3) };
}

export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const span = (pts: readonly Pt[], x0: number, x1: number) => {
  let a = 0, b = pts.length - 1;
  while (a < b && pts[a + 1]![0] < x0) a++;
  while (b > a && pts[b - 1]![0] > x1) b--;
  return [a, b] as const;
};

/** Lower edge of a surface cap: rounded scallops, like a cartoon grass or snow overhang. */
const capDepth = (x: number, topH: number, snow: boolean) =>
  topH + (snow ? 4 * Math.abs(Math.sin(x * 0.09)) + 3 * Math.abs(Math.sin(x * 0.031)) : 3.5 * Math.abs(Math.sin((x * Math.PI) / 15)));

function surfaceCap(g: G, pts: readonly Pt[], a: number, b: number, mat: TerrainMaterial, snow: boolean) {
  g.beginPath();
  g.moveTo(pts[a]![0], pts[a]![1]);
  for (let i = a + 1; i <= b; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  const x0 = pts[a]![0], x1 = pts[b]![0];
  for (let x = x1; x >= x0 - 0.1; x -= 5) g.lineTo(x, fieldAt(pts, x) + capDepth(x, mat.topH, snow));
  g.closePath();
  g.fillStyle = mat.top; g.fill();
  ink(g, 2.5, mat.topDark);
  // Highlight just under the rim, then the bold outline along the walkable edge.
  g.beginPath();
  g.moveTo(pts[a]![0], pts[a]![1] + 3);
  for (let i = a + 1; i <= b; i++) g.lineTo(pts[i]![0], pts[i]![1] + 3);
  ink(g, 2.5, lighten(mat.top, 0.35));
  g.beginPath();
  g.moveTo(pts[a]![0], pts[a]![1]);
  for (let i = a + 1; i <= b; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  ink(g, 3.5, mat.outline);
}

function tufts(g: G, x0: number, x1: number, at: (x: number) => number, dark: string, light: string, seed: number) {
  const r = rng(seed);
  g.beginPath();
  const lit = new Path2D();
  for (let x = x0 + 4; x < x1 - 4; x += 9 + r() * 10) {
    const y = at(x) + 1, h = 5 + r() * 6;
    const path = r() < 0.5 ? g : lit;
    path.moveTo(x - 4, y); path.lineTo(x - 2, y - h); path.lineTo(x, y - 2); path.lineTo(x + 2, y - h * 0.8); path.lineTo(x + 4, y);
  }
  g.fillStyle = dark; g.fill();
  g.fillStyle = light; g.fill(lit);
}

function paintGround(g: G, m: MapDefinition, art: TerrainArt, box: Box) {
  const pts = m.terrain.ground, mat = MATERIALS[m.terrain.mat], snow = m.terrain.mat === "snow";
  const [a, b] = span(pts, box[0] - 30, box[2] + 30);
  const bottom = m.h + 60;
  const minY = art.top; // map-wide, so every cache tile gets the same gradient
  g.save();
  g.beginPath();
  g.moveTo(pts[a]![0], bottom);
  for (let i = a; i <= b; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  g.lineTo(pts[b]![0], bottom);
  g.closePath();
  const grad = g.createLinearGradient(0, minY, 0, minY + 320);
  grad.addColorStop(0, mat.body); grad.addColorStop(1, mat.dark);
  g.fillStyle = grad; g.fill();
  g.clip();
  // Strata following the surface.
  for (const [d, w] of [[64, 4], [150, 5], [260, 6]] as const) {
    g.beginPath();
    let pen = false;
    for (let x = Math.floor(pts[a]![0] / 8) * 8; x <= pts[b]![0]; x += 8) {
      const on = Math.sin(x * 0.011 + d) > -0.35;
      const y = fieldAt(pts, x) + d + Math.sin(x * 0.02 + d) * 6;
      if (on && !pen) g.moveTo(x, y); else if (on) g.lineTo(x, y);
      pen = on;
    }
    ink(g, w, rgba(mat.dark, 0.45));
  }
  // Specks (two tones), batched into two paths.
  const lightP = new Path2D(), darkP = new Path2D();
  for (const s of art.specks) {
    if (s.x < box[0] - 4 || s.x > box[2] + 4 || s.y < box[1] - 4 || s.y > box[3] + 4) continue;
    const p = s.c ? lightP : darkP;
    p.moveTo(s.x + s.r, s.y); p.ellipse(s.x, s.y, s.r, s.r * 0.7, 0, 0, TAU);
  }
  g.fillStyle = mat.speck; g.fill(lightP);
  g.fillStyle = rgba(mat.dark, 0.7); g.fill(darkP);
  // Embedded rocks.
  for (const p of art.pebbles) {
    if (p.x + p.r < box[0] || p.x - p.r > box[2] || p.y + p.r < box[1] || p.y - p.r > box[3]) continue;
    pebble(g, p.x, p.y, p.r, p.seed, art.rockFill);
  }
  // Roots under grass.
  if (mat.tufts) {
    const r = rng(hash(m.id) ^ 77);
    g.beginPath();
    for (let x = 0; x < m.w; x += 60 + r() * 90) {
      const l = 16 + r() * 22, s = r() < 0.5 ? -1 : 1;
      if (x < box[0] - 40 || x > box[2] + 40) continue;
      const y = fieldAt(pts, x) + mat.topH;
      g.moveTo(x, y); g.quadraticCurveTo(x + s * 8, y + l * 0.5, x + s * 3, y + l);
      g.moveTo(x + s * 5, y + l * 0.45); g.lineTo(x + s * 13, y + l * 0.7);
    }
    ink(g, 2, rgba(mat.outline, 0.55));
  }
  // Ambient shadow under the cap.
  g.beginPath();
  g.moveTo(pts[a]![0], pts[a]![1] + mat.topH + 7);
  for (let i = a + 1; i <= b; i++) g.lineTo(pts[i]![0], pts[i]![1] + mat.topH + 7);
  ink(g, 9, rgba(mat.dark, 0.35));
  g.restore();
  surfaceCap(g, pts, a, b, mat, snow);
  if (mat.tufts) tufts(g, pts[a]![0], pts[b]![0], (x) => fieldAt(pts, x), mat.topDark, lighten(mat.top, 0.2), hash(m.id) ^ 5);
}

function paintCeiling(g: G, m: MapDefinition, art: TerrainArt, box: Box) {
  const pts = m.terrain.ceil;
  if (!pts) return;
  const mat = MATERIALS[m.terrain.ceilMat ?? m.terrain.mat];
  const [a, b] = span(pts, box[0] - 30, box[2] + 30);
  g.save();
  g.beginPath();
  g.moveTo(pts[a]![0], -60);
  for (let i = a; i <= b; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  g.lineTo(pts[b]![0], -60);
  g.closePath();
  const grad = g.createLinearGradient(0, 0, 0, 280);
  grad.addColorStop(0, mat.dark); grad.addColorStop(1, mat.body);
  g.fillStyle = grad; g.fill();
  g.clip();
  const lightP = new Path2D(), darkP = new Path2D();
  for (const s of art.ceilSpecks) {
    if (s.x < box[0] - 4 || s.x > box[2] + 4 || s.y < box[1] - 4 || s.y > box[3] + 4) continue;
    const p = s.c ? lightP : darkP;
    p.moveTo(s.x + s.r, s.y); p.ellipse(s.x, s.y, s.r, s.r * 0.7, 0, 0, TAU);
  }
  g.fillStyle = mat.speck; g.fill(lightP);
  g.fillStyle = rgba(mat.dark, 0.7); g.fill(darkP);
  // Drippy darker underside band.
  g.beginPath();
  g.moveTo(pts[a]![0], pts[a]![1]);
  for (let i = a + 1; i <= b; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  for (let x = pts[b]![0]; x >= pts[a]![0]; x -= 6) g.lineTo(x, fieldAt(pts, x) - 10 - 5 * Math.abs(Math.sin(x * 0.07)));
  g.closePath();
  g.fillStyle = rgba(mat.dark, 0.8); g.fill();
  g.restore();
  g.beginPath();
  g.moveTo(pts[a]![0], pts[a]![1] - 3);
  for (let i = a + 1; i <= b; i++) g.lineTo(pts[i]![0], pts[i]![1] - 3);
  ink(g, 2, rgba(mat.speck, 0.6));
  g.beginPath();
  g.moveTo(pts[a]![0], pts[a]![1]);
  for (let i = a + 1; i <= b; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  ink(g, 3.5, mat.outline);
}

function pebble(g: G, x: number, y: number, rad: number, seed: number, fill: string) {
  const r = rng(seed);
  const pts = blobPts(x, y, rad, rad * 0.75, 7, 0.22, r);
  g.beginPath(); smooth(g, pts);
  fillInk(g, fill, 2.2);
  g.beginPath();
  g.ellipse(x - rad * 0.3, y - rad * 0.3, rad * 0.4, rad * 0.22, -0.4, 0, TAU);
  g.fillStyle = lighten(fill, 0.3); g.fill();
}

/* ───────────── Platforms ───────────── */

function platRock(g: G, p: PlatformDefinition, seed: number) {
  const [x, y, w, h] = p.r, mat = MATERIALS[p.mat], r = rng(seed);
  const snow = p.mat === "snow", ice = p.mat === "ice";
  const pts: Pt[] = [[x + 7, y], [x + w - 7, y], [x + w, y + 6], [x + w - 2, y + h * 0.55]];
  const n = Math.max(3, Math.round(w / 34));
  for (let i = 0; i <= n; i++) {
    const t = i / n, cx = x + w - 8 - t * (w - 16);
    const bulge = 1 - Math.abs(t - 0.5) * 1.1; // deepest in the middle
    pts.push([cx, y + h * (0.6 + 0.4 * bulge) - r() * h * 0.12]);
  }
  pts.push([x + 2, y + h * 0.55], [x, y + 6]);
  g.save();
  g.beginPath();
  g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    if (i < 3) g.lineTo(a[0], a[1]); else g.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  g.closePath();
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, ice ? rgba(mat.body, 0.95) : mat.body);
  grad.addColorStop(1, ice ? rgba(mat.dark, 0.95) : mat.dark);
  g.fillStyle = grad; g.fill();
  ink(g, 3.2, mat.outline);
  g.clip();
  if (ice) {
    g.beginPath();
    for (let i = 0; i < 3; i++) { const sx = x + w * (0.2 + i * 0.28); g.moveTo(sx, y + 4); g.lineTo(sx + 16, y + h); }
    ink(g, 6, "rgba(255,255,255,0.35)");
  } else {
    g.beginPath();
    for (let i = 0; i < w / 10; i++) { const sx = x + r() * w, sy = y + mat.topH + 6 + r() * (h - mat.topH); g.moveTo(sx + 2.2, sy); g.ellipse(sx, sy, 2.2, 1.6, 0, 0, TAU); }
    g.fillStyle = mat.speck; g.fill();
    g.beginPath();
    g.moveTo(x, y + h * 0.62); g.bezierCurveTo(x + w * 0.3, y + h * 0.5, x + w * 0.6, y + h * 0.75, x + w, y + h * 0.58);
    ink(g, 3, rgba(mat.dark, 0.5));
    if (w > 120) pebble(g, x + w * (0.25 + r() * 0.5), y + h * 0.62, Math.min(10, h * 0.2), seed + 3, mix(mat.body, "#a0a4aa", 0.45));
  }
  g.restore();
  // Cap.
  g.beginPath();
  g.moveTo(x + 2, y + 3); g.quadraticCurveTo(x + 2, y, x + 8, y);
  g.lineTo(x + w - 8, y); g.quadraticCurveTo(x + w - 2, y, x + w - 2, y + 3);
  for (let cx = x + w - 2; cx >= x + 2; cx -= 4) g.lineTo(cx, y + capDepth(cx, mat.topH, snow));
  g.closePath();
  g.fillStyle = mat.top; g.fill();
  ink(g, 2.2, mat.topDark);
  g.beginPath(); g.moveTo(x + 8, y + 3); g.lineTo(x + w - 8, y + 3); ink(g, 2.5, lighten(mat.top, 0.4));
  g.beginPath(); g.moveTo(x + 3, y + 2); g.quadraticCurveTo(x + 3, y, x + 8, y); g.lineTo(x + w - 8, y); g.quadraticCurveTo(x + w - 3, y, x + w - 3, y + 2);
  ink(g, 3.2, mat.outline);
  if (mat.tufts) tufts(g, x + 4, x + w - 4, () => y, mat.topDark, lighten(mat.top, 0.2), seed);
}

function platPlank(g: G, p: PlatformDefinition, seed: number) {
  const [x, y, w, h] = p.r, mat = MATERIALS[p.mat], r = rng(seed);
  rrect(g, x, y, w, h, 3);
  fillInk(g, mat.body, 2.8, mat.outline);
  g.save(); g.clip();
  g.fillStyle = mat.top; g.fillRect(x, y, w, h * 0.45);
  g.beginPath();
  let bx = x;
  while (bx < x + w - 10) { bx += 24 + r() * 14; if (bx < x + w - 6) { g.moveTo(bx, y); g.lineTo(bx, y + h); } }
  ink(g, 2, mat.dark);
  g.beginPath();
  for (let gx = x + 6; gx < x + w - 6; gx += 18 + r() * 14) { g.moveTo(gx, y + h * 0.6); g.lineTo(gx + 8 + r() * 6, y + h * 0.6); }
  ink(g, 1.2, rgba(mat.dark, 0.7));
  g.restore();
  g.beginPath();
  for (let nx = x + 6; nx < x + w; nx += 26) { g.moveTo(nx + 1.4, y + h / 2); g.arc(nx, y + h / 2, 1.4, 0, TAU); }
  g.fillStyle = "#3b2c22"; g.fill();
}

function platGirder(g: G, p: PlatformDefinition) {
  const [x, y, w, h] = p.r, mat = MATERIALS[p.mat];
  const plate = Math.max(4, h * 0.24);
  g.beginPath();
  const step = h * 1.3;
  for (let gx = x; gx < x + w - 1; gx += step) {
    const ex = Math.min(x + w, gx + step);
    g.moveTo(gx, y + plate); g.lineTo(ex, y + h - plate);
    g.moveTo(ex, y + plate); g.lineTo(gx, y + h - plate);
    g.moveTo(gx, y); g.lineTo(gx, y + h);
  }
  ink(g, 5, mat.outline); ink(g, 3, mat.body);
  for (const py of [y, y + h - plate]) {
    rrect(g, x, py, w, plate, 1.5);
    fillInk(g, py === y ? mat.top : mat.topDark, 2.4, mat.outline);
  }
  g.beginPath(); g.moveTo(x + 2, y + 1.5); g.lineTo(x + w - 2, y + 1.5); ink(g, 1.4, lighten(mat.top, 0.5));
  g.beginPath();
  for (let rx = x + 8; rx < x + w - 4; rx += 20) { g.moveTo(rx + 1.3, y + plate / 2); g.arc(rx, y + plate / 2, 1.3, 0, TAU); }
  g.fillStyle = mat.dark; g.fill();
  // Hazard stripes on the ends.
  for (const ex of [x, x + w - 14]) {
    g.save(); rrect(g, ex, y, 14, plate, 1); g.clip();
    g.fillStyle = "#f2c230"; g.fillRect(ex, y, 14, plate);
    g.beginPath();
    for (let s = -10; s < 20; s += 6) { g.moveTo(ex + s, y + plate); g.lineTo(ex + s + plate, y); }
    ink(g, 2.6, "#2a2a2a");
    g.restore();
  }
}

function platBlock(g: G, p: PlatformDefinition, seed: number) {
  const [x, y, w, h] = p.r, mat = MATERIALS[p.mat], r = rng(seed);
  const masonry = p.mat === "masonry";
  rrect(g, x, y, w, h, 4);
  g.fillStyle = mat.dark; g.fill();
  g.save(); g.clip();
  if (masonry) {
    const rowH = Math.max(14, Math.min(20, h / Math.max(1, Math.round(h / 18))));
    let row = 0;
    for (let ry = y + mat.topH - 2; ry < y + h; ry += rowH, row++) {
      let bx = x - (row % 2 ? 18 : 0);
      while (bx < x + w) {
        const bw = 30 + r() * 22;
        rrect(g, bx + 1.5, ry + 1.5, bw - 3, rowH - 3, 3);
        g.fillStyle = mix(mat.body, r() < 0.5 ? "#ffffff" : "#5a5040", r() * 0.14); g.fill();
        g.fillStyle = rgba(lighten(mat.body, 0.4), 0.6); g.fillRect(bx + 3, ry + 2.5, bw - 8, 2);
        bx += bw;
      }
    }
    g.beginPath();
    for (let i = 0; i < w / 90; i++) { const cx = x + r() * w, cy = y + h * 0.4 + r() * h * 0.5; g.moveTo(cx, cy); g.lineTo(cx + 6, cy + 7); g.lineTo(cx + 3, cy + 13); }
    ink(g, 1.6, mat.outline);
  } else {
    g.fillStyle = mat.body; g.fillRect(x, y, w, h);
    g.fillStyle = mat.top; g.fillRect(x, y, w, mat.topH + 2);
    g.beginPath();
    for (let px = x + 70 + r() * 40; px < x + w - 20; px += 80 + r() * 50) { g.moveTo(px, y + mat.topH + 2); g.lineTo(px, y + h); }
    ink(g, 2, mat.dark);
    g.beginPath();
    for (let i = 0; i < w / 50; i++) { const cx = x + r() * w, cy = y + 6 + r() * h; g.moveTo(cx + 5, cy); g.ellipse(cx, cy, 5 + r() * 9, 2 + r() * 3, 0, 0, TAU); }
    g.fillStyle = rgba(mat.dark, 0.35); g.fill();
    g.beginPath();
    for (let px = x + 10; px < x + w; px += 40) { g.moveTo(px + 1.5, y + h - 6); g.arc(px, y + h - 6, 1.5, 0, TAU); }
    g.fillStyle = mat.dark; g.fill();
  }
  g.restore();
  rrect(g, x, y, w, h, 4);
  ink(g, 3.2, mat.outline);
  g.beginPath(); g.moveTo(x + 4, y + 2.5); g.lineTo(x + w - 4, y + 2.5); ink(g, 2, lighten(mat.top, 0.35));
  if (masonry) {
    // Moss cap with drips and tufts.
    g.beginPath();
    g.moveTo(x + 2, y + 2); g.quadraticCurveTo(x + 2, y, x + 6, y); g.lineTo(x + w - 6, y); g.quadraticCurveTo(x + w - 2, y, x + w - 2, y + 2);
    for (let cx = x + w - 2; cx >= x + 2; cx -= 4) g.lineTo(cx, y + mat.topH - 2 + 3 * Math.abs(Math.sin(cx * 0.2)) + (Math.sin(cx * 0.05 + seed) > 0.8 ? 9 : 0));
    g.closePath();
    fillInk(g, mat.top, 2, mat.topDark);
    tufts(g, x + 4, x + w - 4, () => y, mat.topDark, lighten(mat.top, 0.2), seed);
  }
}

const CONTAINER = ["#b5523b", "#3b78a8", "#4f8a4b", "#c98b2b"];
function platContainer(g: G, p: PlatformDefinition, seed: number) {
  const [x, y, w, h] = p.r, c = CONTAINER[seed % CONTAINER.length]!;
  rrect(g, x, y, w, h, 3);
  g.fillStyle = c; g.fill();
  g.save(); g.clip();
  for (let rx = x + 6; rx < x + w - 4; rx += 8) {
    g.fillStyle = lighten(c, 0.15); g.fillRect(rx, y + 5, 3, h - 10);
    g.fillStyle = darken(c, 0.2); g.fillRect(rx + 3, y + 5, 2, h - 10);
  }
  g.fillStyle = darken(c, 0.3); g.fillRect(x, y, w, 5); g.fillRect(x, y + h - 5, w, 5);
  g.fillStyle = lighten(c, 0.3); g.fillRect(x, y, w, 2);
  g.fillStyle = "rgba(255,255,255,0.7)"; g.fillRect(x + w * 0.25, y + h * 0.35, w * 0.3, 6);
  g.restore();
  g.beginPath();
  g.moveTo(x + w - 22, y + 5); g.lineTo(x + w - 22, y + h - 5); g.moveTo(x + w - 12, y + 5); g.lineTo(x + w - 12, y + h - 5);
  ink(g, 2, darken(c, 0.45));
  rrect(g, x, y, w, h, 3);
  ink(g, 3, INK);
}

export function paintPlatform(g: G, p: PlatformDefinition, seed: number) {
  if (p.style === "plank") platPlank(g, p, seed);
  else if (p.style === "girder") platGirder(g, p);
  else if (p.style === "block") platBlock(g, p, seed);
  else if (p.style === "container") platContainer(g, p, seed);
  else platRock(g, p, seed);
}

/* ───────────── Decorations ───────────── */

export interface DecoCtx {
  m: MapDefinition;
  ground: (x: number) => number;
  ceil: (x: number) => number;
  snowy: boolean;
  dry: boolean;
  cave: boolean;
}
export function decoCtx(m: MapDefinition): DecoCtx {
  return {
    m,
    ground: (x) => fieldAt(m.terrain.ground, x),
    ceil: (x) => (m.terrain.ceil ? fieldAt(m.terrain.ceil, x) : 0),
    snowy: m.terrain.mat === "snow",
    dry: m.terrain.mat === "sand",
    cave: !!m.terrain.ceil,
  };
}

/** Decorations that move every frame. They are never baked into the terrain cache. */
export const ANIMATED: ReadonlySet<DecoKind> = new Set(["tallgrass", "flag", "fan", "lamp", "beacon", "torch", "waterfall", "pool", "vine"]);
/** Big plants drawn from cached sprites, so they can sway. */
export const SWAYS: ReadonlySet<DecoKind> = new Set(["tree", "pine", "palm", "jungleTree"]);
const HANGS: ReadonlySet<DecoKind> = new Set(["stalactite", "icicle", "vine", "lamp"]);

/** Where a decoration is anchored. */
export function decoBase(d: DecorationDefinition, c: DecoCtx): number {
  if (d.y !== undefined) return d.y + (d.dy ?? 0);
  if (HANGS.has(d.k)) return c.ceil(d.x) + (d.dy ?? 0);
  return c.ground(d.x) + 2 + (d.dy ?? 0);
}

/** Half-width and height above/below the anchor, at scale 1. */
const EXTENT: Partial<Record<DecoKind, readonly [number, number, number]>> = {
  tree: [110, 280, 6], pine: [62, 230, 6], palm: [120, 240, 6], jungleTree: [150, 330, 8],
  bush: [44, 52, 4], fern: [46, 50, 4], rock: [32, 34, 6], crate: [18, 34, 2], barrel: [15, 34, 2], sign: [26, 54, 2],
  hut: [80, 104, 4], cabin: [92, 132, 4], cactus: [36, 92, 2], stalagmite: [22, 76, 4], stalactite: [22, 4, 90],
  icicle: [14, 2, 44], iceSpike: [34, 70, 4], crystal: [34, 70, 4], tank: [76, 250, 4], statue: [52, 150, 4],
  vent: [26, 26, 2], tallgrass: [22, 46, 2], flag: [8, 98, 2], fan: [36, 36, 36], lamp: [16, 6, 40], beacon: [9, 26, 2],
  torch: [16, 72, 2], vine: [30, 4, 110],
};

export function decoBounds(d: DecorationDefinition, c: DecoCtx): Box {
  const s = d.s ?? 1, y = decoBase(d, c), w = d.w ?? 0, h = d.h ?? 0;
  switch (d.k) {
    case "rope": return [d.x - 8, y - 46, d.x + w + 8, y + 18];
    case "caveBack": return [d.x - 6, y - 6, d.x + w + 6, y + h + 6];
    case "house": return [d.x - 14, y - 16, d.x + w + 14, Math.max(c.ground(d.x), c.ground(d.x + w)) + 10];
    case "pool": return [d.x - 6, y - 10, d.x + w + 6, y + 60];
    case "waterfall": return [d.x - 30, y - 10, d.x + w + 30, c.ground(d.x + w / 2) + 30];
    case "pipe": return w ? [d.x - 4, y - 18, d.x + w + 4, y + 18] : [d.x - 18, y - 4, d.x + 18, y + h + 4];
    case "pillar": return [d.x - 30, y - (h || 120) - 14, d.x + 30, y + 6];
    case "tower": return [d.x - 76, y - 118, d.x + 76, c.ground(d.x) + 8];
  }
  const e = EXTENT[d.k] ?? [40, 60, 6];
  return [d.x - e[0] * s, y - e[1] * s, d.x + e[0] * s, y + e[2] * s];
}

/** Paints one non-animated decoration (or an animated one at time t). */
export function paintDeco(g: G, d: DecorationDefinition, c: DecoCtx, seed: number, t = 0) {
  const s = d.s ?? 1, x = d.x, y = decoBase(d, c);
  g.save();
  if (d.flip) { g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }
  switch (d.k) {
    case "tree": tree(g, x, y, s, seed); break;
    case "pine": pine(g, x, y, s, seed, c.snowy); break;
    case "palm": palm(g, x, y, s); break;
    case "jungleTree": jungleTree(g, x, y, s, seed); break;
    case "bush": bush(g, x, y, s, seed, c); break;
    case "fern": fern(g, x, y, s); break;
    case "rock": rock(g, x, y, s, seed, c); break;
    case "crate": crate(g, x, y, s); break;
    case "barrel": barrel(g, x, y, s, seed); break;
    case "sign": sign(g, x, y, s, c); break;
    case "tower": tower(g, x, y, c.ground(x)); break;
    case "rope": rope(g, x, y, d.w ?? 100); break;
    case "hut": hut(g, x, y, s); break;
    case "house": house(g, x, y, d.w ?? 200, c); break;
    case "cabin": cabin(g, x, y, s); break;
    case "cactus": cactus(g, x, y, s); break;
    case "stalagmite": spike(g, x, y, s, seed, 1); break;
    case "stalactite": spike(g, x, y, s, seed, -1); break;
    case "icicle": icicles(g, x, y, s, seed); break;
    case "iceSpike": shards(g, x, y, s, seed, "#cfefff", "#7dbfe2", "#24506c"); break;
    case "crystal": shards(g, x, y, s, seed, seed % 2 ? "#8ff0ff" : "#c7a6ff", seed % 2 ? "#3fb5d6" : "#8462d6", "#1d2440"); break;
    case "tank": tank(g, x, y, s); break;
    case "pipe": pipe(g, x, y, d.w ?? 0, d.h ?? 0); break;
    case "pillar": pillar(g, x, y, d.h ?? 120, seed); break;
    case "statue": statue(g, x, y, s); break;
    case "caveBack": caveBack(g, x, y, d.w ?? 200, d.h ?? 100, seed, c); break;
    case "vent": vent(g, x, y); break;
    case "tallgrass": tallgrass(g, x, y, s, t, c); break;
    case "flag": flag(g, x, y, t); break;
    case "fan": fan(g, x, y, s, t); break;
    case "lamp": lamp(g, x, y, t); break;
    case "beacon": beacon(g, x, y, t); break;
    case "torch": torch(g, x, y, t); break;
    case "waterfall": waterfall(g, x, y, d.w ?? 40, c.ground(x + (d.w ?? 40) / 2), t); break;
    case "pool": pool(g, x, y, d.w ?? 200, c, t); break;
    case "vine": vine(g, x, y, s, t); break;
  }
  g.restore();
}

/** Steam puffs over vents: drawn per frame. */
export function steam(g: G, x: number, y: number, t: number) {
  g.beginPath();
  for (let k = 0; k < 4; k++) {
    const ph = (t * 0.45 + k / 4 + x * 0.001) % 1;
    const py = y - 20 - ph * 100, px = x + Math.sin(ph * 6 + k) * 9, r = 7 + ph * 20;
    g.moveTo(px + r, py); g.arc(px, py, r, 0, TAU);
  }
  g.fillStyle = "rgba(235,235,240,0.16)"; g.fill();
}

function tree(g: G, x: number, y: number, s: number, seed: number) {
  const r = rng(seed);
  g.translate(x, y); g.scale(s, s);
  g.beginPath();
  g.moveTo(-15, 2); g.quadraticCurveTo(-8, -60, -9, -150); g.lineTo(9, -150); g.quadraticCurveTo(8, -60, 15, 2); g.closePath();
  fillInk(g, "#7a4e2d", 3);
  g.beginPath(); g.moveTo(-4, -110); g.quadraticCurveTo(-30, -130, -46, -150); g.moveTo(5, -95); g.quadraticCurveTo(28, -120, 44, -140);
  ink(g, 9); ink(g, 5, "#7a4e2d");
  g.beginPath(); g.moveTo(-3, -20); g.lineTo(-5, -60); g.moveTo(4, -40); g.lineTo(3, -85); ink(g, 2, "#5a3820");
  const cs: [number, number, number][] = [[0, -175, 64], [-56, -150, 46], [58, -150, 48], [-34, -212, 46], [34, -214, 44], [0, -246, 36]];
  puffs(g, cs.map(([a, b, c]) => [a + (r() - 0.5) * 10, b + (r() - 0.5) * 10, c * (0.9 + r() * 0.2)] as const), "#3d7f2f", "#55a53c", "#7cc850");
  g.beginPath();
  for (let i = 0; i < 9; i++) { const a = r() * TAU, d = r() * 60; const lx = Math.cos(a) * d, ly = -180 + Math.sin(a) * d * 0.8; g.moveTo(lx + 4, ly); g.arc(lx, ly, 4, 0, Math.PI); }
  ink(g, 2, "#2f6a27");
}

function pine(g: G, x: number, y: number, s: number, seed: number, snowy: boolean) {
  const r = rng(seed);
  g.translate(x, y); g.scale(s, s);
  rrect(g, -8, -40, 16, 42, 3);
  fillInk(g, "#6b4426", 3);
  const tiers = [[0, 66, 70], [-50, 54, 64], [-96, 42, 58], [-138, 30, 52]] as const;
  const base = snowy ? "#2f5e4e" : "#2f6b45", shade = snowy ? "#244a3e" : "#24553a", lit = snowy ? "#3f7a63" : "#3f8a59";
  for (const [ty, hw, th] of tiers) {
    const by = ty - 24, top = by - th;
    g.beginPath();
    g.moveTo(0, top);
    g.lineTo(hw, by);
    for (let i = 1; i <= 6; i++) g.lineTo(hw - (hw * 2 * i) / 6 + (i % 2 ? hw / 6 : 0), by - (i % 2 ? 6 : 0) + r() * 2);
    g.closePath();
    fillInk(g, base, 3);
    g.beginPath(); g.moveTo(0, top + 4); g.lineTo(hw - 6, by - 2); g.lineTo(0, by - 4); g.closePath(); g.fillStyle = shade; g.fill();
    g.beginPath(); g.moveTo(-2, top + 8); g.lineTo(-hw * 0.55, by - 8); ink(g, 3, lit);
    if (snowy) {
      g.beginPath();
      g.moveTo(0, top - 1); g.lineTo(hw * 0.45, top + th * 0.42); g.quadraticCurveTo(hw * 0.2, top + th * 0.36, 0, top + th * 0.46); g.quadraticCurveTo(-hw * 0.2, top + th * 0.36, -hw * 0.45, top + th * 0.42); g.closePath();
      fillInk(g, "#f7fbff", 2, "#9fb0c4");
    }
  }
}

function palm(g: G, x: number, y: number, s: number) {
  g.translate(x, y); g.scale(s, s);
  g.beginPath();
  g.moveTo(-12, 2); g.quadraticCurveTo(-6, -110, 26, -200); g.lineTo(38, -196); g.quadraticCurveTo(10, -110, 12, 2); g.closePath();
  fillInk(g, "#a5733f", 3);
  g.beginPath();
  for (let i = 1; i < 12; i++) { const t = i / 12, cx = -0 + t * 30 - (1 - t) * 2, cy = -t * 198; g.moveTo(cx - 10 + t * 2, cy); g.lineTo(cx + 10 - t * 2, cy - 4); }
  ink(g, 2, "#6e4a24");
  const tx = 32, ty = -200;
  const fronds: [number, number][] = [[-120, 30], [-80, -10], [-30, -40], [40, -42], [96, -6], [130, 36], [70, 50], [-60, 46]];
  for (const [fx, fy] of fronds) {
    const ex = tx + fx, ey = ty + fy;
    const mx = tx + fx * 0.5, my = ty + fy * 0.4 - 30;
    const nx = -(ey - ty), ny = ex - tx, nl = Math.hypot(nx, ny) || 1, k = 13 / nl;
    g.beginPath();
    g.moveTo(tx, ty);
    g.quadraticCurveTo(mx + nx * k, my + ny * k, ex, ey);
    g.quadraticCurveTo(mx - nx * k * 0.6, my - ny * k * 0.6, tx, ty);
    fillInk(g, "#4a9a3a", 2.6);
    g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(mx, my, ex, ey); ink(g, 1.6, "#2f6a27");
  }
  g.beginPath();
  for (const [cx, cy] of [[24, -190], [36, -186], [30, -180]]) { g.moveTo(cx! + 7, cy!); g.arc(cx!, cy!, 7, 0, TAU); }
  fillInk(g, "#6b4a2a", 2.2);
}

function jungleTree(g: G, x: number, y: number, s: number, seed: number) {
  const r = rng(seed);
  g.translate(x, y); g.scale(s, s);
  g.beginPath();
  g.moveTo(-46, 2); g.quadraticCurveTo(-22, -10, -18, -40); g.lineTo(-14, -230); g.lineTo(14, -230); g.lineTo(18, -40); g.quadraticCurveTo(22, -10, 46, 2);
  g.quadraticCurveTo(20, -4, 8, -14); g.lineTo(0, 2); g.lineTo(-8, -14); g.quadraticCurveTo(-20, -4, -46, 2); g.closePath();
  fillInk(g, "#6d5a45", 3);
  g.beginPath(); g.moveTo(-6, -30); g.lineTo(-8, -200); g.moveTo(5, -50); g.lineTo(6, -180); ink(g, 2, "#4f4132");
  const cs: [number, number, number][] = [];
  for (let i = 0; i < 9; i++) cs.push([(i - 4) * 30 + (r() - 0.5) * 12, -250 - Math.cos((i - 4) / 3) * 40 + r() * 16, 38 + r() * 16]);
  puffs(g, cs, "#245c34", "#327a43", "#4f9a50");
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const vx = -110 + i * 44 + r() * 14, vy = -232, l = 50 + r() * 70;
    g.moveTo(vx, vy); g.quadraticCurveTo(vx + 8, vy + l * 0.5, vx + 2, vy + l);
  }
  ink(g, 2.5, "#2f6a2f");
}

function bush(g: G, x: number, y: number, s: number, seed: number, c: DecoCtx) {
  const r = rng(seed);
  g.translate(x, y); g.scale(s, s);
  const cs: [number, number, number][] = [[-22, -16, 18], [0, -26, 22], [22, -16, 18], [-8, -12, 16], [12, -12, 16]];
  const pal = c.snowy ? ["#3d6b5a", "#4f8670", "#6aa08a"] : ["#3d7f2f", "#55a53c", "#7cc850"];
  puffs(g, cs.map(([a, b, d]) => [a, b + 2, d * (0.92 + r() * 0.16)] as const), pal[0]!, pal[1]!, pal[2]!, 4);
  if (!c.snowy && !c.dry && r() < 0.6) {
    g.beginPath();
    for (let i = 0; i < 5; i++) { const bx = -24 + r() * 48, by = -28 + r() * 18; g.moveTo(bx + 2.6, by); g.arc(bx, by, 2.6, 0, TAU); }
    fillInk(g, "#d9483b", 1.4);
  }
}

function fern(g: G, x: number, y: number, s: number) {
  g.translate(x, y); g.scale(s, s);
  const fronds = [-1.25, -0.85, -0.45, 0, 0.45, 0.85, 1.25];
  for (const a of fronds) {
    const ex = Math.sin(a) * 44, ey = -Math.cos(a) * 44 - 4;
    const cx = Math.sin(a) * 30, cy = -48;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(cx, cy, ex, ey);
    ink(g, 5); ink(g, 3, "#3f8a3a");
    g.beginPath();
    for (let t = 0.25; t < 1; t += 0.15) {
      const px = 2 * (1 - t) * t * cx + t * t * ex, py = 2 * (1 - t) * t * cy + t * t * ey;
      const l = 9 * (1 - t * 0.6);
      g.moveTo(px + l, py); g.ellipse(px, py, l, 3, a + 0.7, 0, TAU);
    }
    fillInk(g, "#4f9e45", 1.6);
  }
}

function rock(g: G, x: number, y: number, s: number, seed: number, c: DecoCtx) {
  const r = rng(seed);
  const base = c.dry ? "#c98d55" : c.snowy ? "#8b9db3" : c.cave ? "#6f6478" : "#8f949b";
  const pts = blobPts(x, y - 14 * s, 30 * s, 20 * s, 8, 0.2, r, true);
  g.beginPath(); smooth(g, pts);
  fillInk(g, base, 3);
  g.beginPath();
  g.moveTo(x - 20 * s, y - 16 * s); g.lineTo(x - 4 * s, y - 30 * s); g.lineTo(x + 8 * s, y - 26 * s); g.lineTo(x - 6 * s, y - 14 * s); g.closePath();
  g.fillStyle = lighten(base, 0.28); g.fill();
  g.beginPath(); g.moveTo(x + 10 * s, y - 6 * s); g.lineTo(x + 16 * s, y - 16 * s); g.lineTo(x + 22 * s, y - 14 * s); ink(g, 2, darken(base, 0.35));
  if (c.snowy) { g.beginPath(); g.ellipse(x - 4 * s, y - 30 * s, 18 * s, 5 * s, 0, 0, TAU); fillInk(g, "#f7fbff", 2, "#9fb0c4"); }
  else if (!c.dry && !c.cave) { g.beginPath(); g.ellipse(x + 2 * s, y - 31 * s, 12 * s, 4 * s, 0.1, 0, TAU); g.fillStyle = "#6fae45"; g.fill(); }
}

function crate(g: G, x: number, y: number, s: number) {
  const w = 30 * s;
  rrect(g, x - w / 2, y - w, w, w, 3);
  fillInk(g, "#b07a43", 2.6);
  g.strokeStyle = "#7d522a"; g.lineWidth = 2;
  g.strokeRect(x - w / 2 + 4, y - w + 4, w - 8, w - 8);
  g.beginPath(); g.moveTo(x - w / 2 + 5, y - 5); g.lineTo(x + w / 2 - 5, y - w + 5); ink(g, 3.5, "#7d522a");
  g.fillStyle = "#d29a5c"; g.fillRect(x - w / 2 + 3, y - w + 2, w - 6, 2.5);
}

function barrel(g: G, x: number, y: number, s: number, seed: number) {
  const c = ["#b5452f", "#4f6f3a", "#3f6a8a"][seed % 3]!;
  const w = 22 * s, h = 32 * s;
  rrect(g, x - w / 2, y - h, w, h, 5 * s);
  fillInk(g, c, 2.6);
  g.fillStyle = lighten(c, 0.25); g.fillRect(x - w / 2 + 3, y - h + 3, 4 * s, h - 6);
  g.beginPath(); g.moveTo(x - w / 2, y - h * 0.3); g.lineTo(x + w / 2, y - h * 0.3); g.moveTo(x - w / 2, y - h * 0.72); g.lineTo(x + w / 2, y - h * 0.72);
  ink(g, 2.4, darken(c, 0.4));
  g.beginPath(); g.ellipse(x, y - h, w / 2 - 1, 3 * s, 0, 0, TAU); fillInk(g, darken(c, 0.15), 2);
}

function sign(g: G, x: number, y: number, s: number, c: DecoCtx) {
  g.translate(x, y); g.scale(s, s);
  rrect(g, -3, -50, 6, 50, 2); fillInk(g, "#7a4e2d", 2.4);
  rrect(g, -24, -54, 48, 24, 4); fillInk(g, c.snowy ? "#9a6534" : "#c48a4f", 2.6);
  g.beginPath(); g.moveTo(-14, -42); g.lineTo(8, -42); g.moveTo(2, -48); g.lineTo(9, -42); g.lineTo(2, -36);
  ink(g, 3.2, "#3a230f");
}

function tower(g: G, x: number, y: number, gy: number) {
  const L = x - 54, R = x + 54, wood = "#9a6534", dark = "#6e4421";
  g.beginPath();
  g.moveTo(L, y + 10); g.lineTo(L - 10, gy + 4); g.moveTo(R, y + 10); g.lineTo(R + 10, gy + 4);
  ink(g, 10); ink(g, 6, wood);
  g.beginPath();
  for (let by = y + 14; by < gy - 30; by += 80) {
    const k0 = (by - y) / (gy - y), k1 = Math.min(1, (by + 80 - y) / (gy - y));
    g.moveTo(L - 10 * k0, by); g.lineTo(R + 10 * k1, Math.min(gy, by + 80));
    g.moveTo(R + 10 * k0, by); g.lineTo(L - 10 * k1, Math.min(gy, by + 80));
  }
  ink(g, 6); ink(g, 3, dark);
  g.beginPath(); g.moveTo(L + 4, y); g.lineTo(L + 4, y - 74); g.moveTo(R - 4, y); g.lineTo(R - 4, y - 74);
  ink(g, 8); ink(g, 4.5, wood);
  g.beginPath(); g.moveTo(L + 4, y - 30); g.lineTo(R - 4, y - 30); ink(g, 6); ink(g, 3, wood);
  g.beginPath(); g.moveTo(L - 16, y - 70); g.lineTo(x, y - 112); g.lineTo(R + 16, y - 70); g.closePath();
  fillInk(g, "#7d8a4a", 3);
  g.beginPath(); g.moveTo(L - 10, y - 74); g.lineTo(R + 10, y - 74); ink(g, 2, "#5b6636");
}

function rope(g: G, x: number, y: number, w: number) {
  const post = (px: number) => { rrect(g, px - 4, y - 36, 8, 40, 2); fillInk(g, "#8a5a2f", 2.4); };
  post(x + 2); post(x + w - 2);
  g.beginPath();
  g.moveTo(x + 2, y - 32); g.quadraticCurveTo(x + w / 2, y - 6, x + w - 2, y - 32);
  ink(g, 4.5); ink(g, 2.4, "#d4b07a");
  g.beginPath();
  for (let px = x + 20; px < x + w - 14; px += 20) { const t = (px - x) / w, sag = y - 32 + 4 * 26 * t * (1 - t); g.moveTo(px, sag); g.lineTo(px, y); }
  ink(g, 1.8, "#a7864f");
}

function hut(g: G, x: number, y: number, s: number) {
  g.translate(x, y); g.scale(s, s);
  rrect(g, -62, -68, 124, 68, 3); fillInk(g, "#8a6a42", 3);
  g.beginPath(); for (let i = -48; i < 62; i += 16) { g.moveTo(i, -66); g.lineTo(i, -2); } ink(g, 1.6, "#5f4628");
  rrect(g, -12, -46, 24, 46, 3); fillInk(g, "#3b2c1e", 2.4);
  rrect(g, 22, -50, 26, 20, 2); fillInk(g, "#f2d27a", 2.4);
  g.beginPath(); g.moveTo(35, -50); g.lineTo(35, -30); g.moveTo(22, -40); g.lineTo(48, -40); ink(g, 2, INK);
  g.beginPath(); g.moveTo(-78, -64); g.lineTo(-40, -100); g.lineTo(78, -100); g.lineTo(80, -64); g.closePath();
  fillInk(g, "#5f7340", 3);
  g.beginPath(); for (let i = -50; i < 76; i += 12) { g.moveTo(i, -98); g.lineTo(i - 14, -66); } ink(g, 1.6, "#4a5a30");
  for (const sx of [-50, -34, 42, 58]) { g.beginPath(); g.ellipse(sx, -6, 10, 7, 0, 0, TAU); fillInk(g, "#c2a46b", 2.2); }
}

function house(g: G, x: number, y: number, w: number, c: DecoCtx) {
  const gy = Math.max(c.ground(x), c.ground(x + w)) + 6;
  const wall = "#d9a86a";
  rrect(g, x + 8, y, w - 16, gy - y, 4); fillInk(g, wall, 3);
  g.fillStyle = darken(wall, 0.12); g.fillRect(x + w - 40, y + 2, 30, gy - y - 4);
  g.fillStyle = "rgba(90,50,20,0.25)"; g.fillRect(x + 10, y + 2, w - 20, 10);
  for (const wx of [x + 40, x + w - 80]) {
    g.beginPath(); g.moveTo(wx, y + 70); g.lineTo(wx, y + 42); g.arc(wx + 18, y + 42, 18, Math.PI, 0); g.lineTo(wx + 36, y + 70); g.closePath();
    fillInk(g, "#3b2617", 2.6);
  }
  const dx = x + w / 2 - 22;
  g.beginPath(); g.moveTo(dx, gy); g.lineTo(dx, y + 72); g.arc(dx + 22, y + 72, 22, Math.PI, 0); g.lineTo(dx + 44, gy); g.closePath();
  fillInk(g, "#5a3a1f", 2.6);
  g.beginPath(); for (let bx = x + 24; bx < x + w - 16; bx += 34) { g.moveTo(bx, y + 18); g.lineTo(bx + 10, y + 18); } ink(g, 6); ink(g, 3.4, "#8a5a2f");
  g.beginPath(); g.moveTo(x + 30, y + 110); g.lineTo(x + 40, y + 124); g.lineTo(x + 36, y + 136); ink(g, 1.6, darken(wall, 0.4));
}

function cabin(g: G, x: number, y: number, s: number) {
  g.translate(x, y); g.scale(s, s);
  rrect(g, -72, -72, 144, 72, 4); fillInk(g, "#c9d3dc", 3);
  g.beginPath(); g.moveTo(-70, -48); g.lineTo(70, -48); g.moveTo(-70, -24); g.lineTo(70, -24); ink(g, 1.6, "#8d9aa6");
  g.fillStyle = "#d9483b"; g.fillRect(-70, -16, 140, 6);
  rrect(g, 30, -56, 28, 20, 3); fillInk(g, "#ffe08a", 2.4);
  rrect(g, -18, -50, 22, 50, 3); fillInk(g, "#6f7b87", 2.4);
  g.beginPath(); g.moveTo(-84, -70); g.lineTo(84, -70); g.lineTo(74, -88); g.lineTo(-74, -88); g.closePath(); fillInk(g, "#5d6873", 3);
  g.beginPath(); g.moveTo(-86, -84); for (let i = -86; i <= 86; i += 8) g.lineTo(i, -84 + (i % 16 ? 5 : 2)); g.lineTo(86, -96); g.quadraticCurveTo(0, -104, -86, -96); g.closePath();
  fillInk(g, "#f7fbff", 2.2, "#9fb0c4");
  g.beginPath(); g.moveTo(50, -96); g.lineTo(50, -126); ink(g, 4); ink(g, 2, "#8d9aa6");
  g.beginPath(); g.arc(50, -124, 12, Math.PI * 0.85, Math.PI * 1.85); g.closePath(); fillInk(g, "#e5ebf0", 2.4);
}

function cactus(g: G, x: number, y: number, s: number) {
  g.translate(x, y); g.scale(s, s);
  const green = "#5e9e48";
  const arm = (dir: number, h: number, up: number) => {
    g.beginPath();
    g.moveTo(0, -h); g.lineTo(dir * 18, -h); g.quadraticCurveTo(dir * 26, -h, dir * 26, -h - 8); g.lineTo(dir * 26, -h - up);
    ink(g, 17); ink(g, 11, green);
  };
  arm(-1, 34, 26); arm(1, 50, 22);
  rrect(g, -10, -88, 20, 90, 10); fillInk(g, green, 3);
  g.beginPath(); g.moveTo(-3, -80); g.lineTo(-3, -4); g.moveTo(4, -80); g.lineTo(4, -4); ink(g, 1.6, "#3f7a32");
  g.beginPath(); g.moveTo(-6, -82); g.lineTo(-6, -10); ink(g, 2, "#86c46a");
  g.beginPath(); g.arc(0, -90, 5, 0, TAU); fillInk(g, "#f07aa0", 2);
}

function spike(g: G, x: number, y: number, s: number, seed: number, dir: 1 | -1) {
  const r = rng(seed), h = (dir > 0 ? 70 : 84) * s, w = 20 * s;
  const tip = y - dir * h;
  g.beginPath();
  g.moveTo(x - w, y + dir * 2);
  g.quadraticCurveTo(x - w * 0.6, y - dir * h * 0.4, x - w * 0.12, tip + dir * 4);
  g.quadraticCurveTo(x, tip, x + w * 0.12, tip + dir * 4);
  g.quadraticCurveTo(x + w * 0.65, y - dir * h * 0.45, x + w, y + dir * 2);
  g.closePath();
  fillInk(g, "#7a6d84", 3, "#1e1826");
  g.save(); g.clip();
  g.beginPath();
  for (let k = 1; k < 4; k++) { const by = y - dir * h * k * 0.22 - dir * r() * 6; g.moveTo(x - w, by); g.quadraticCurveTo(x, by - dir * 5, x + w, by); }
  ink(g, 2, "#5c5066");
  g.beginPath(); g.moveTo(x - w * 0.55, y); g.quadraticCurveTo(x - w * 0.35, y - dir * h * 0.4, x - w * 0.08, tip + dir * 10); ink(g, 3, "#9d90a8");
  g.restore();
}

function icicles(g: G, x: number, y: number, s: number, seed: number) {
  const r = rng(seed);
  for (let i = -2; i <= 2; i++) {
    const ix = x + i * 6 * s, l = (16 + r() * 26) * s * (i === 0 ? 1.3 : 1), w = 4 * s;
    g.beginPath(); g.moveTo(ix - w, y); g.quadraticCurveTo(ix - w * 0.3, y + l * 0.6, ix, y + l); g.quadraticCurveTo(ix + w * 0.3, y + l * 0.6, ix + w, y); g.closePath();
    fillInk(g, "rgba(226,247,255,0.92)", 1.8, "#4f8db4");
    g.beginPath(); g.moveTo(ix - w * 0.4, y + 2); g.lineTo(ix - w * 0.1, y + l * 0.6); ink(g, 1.2, "#ffffff");
  }
}

function shards(g: G, x: number, y: number, s: number, seed: number, light: string, dark: string, outline: string) {
  const r = rng(seed);
  const list = [[-16, 34, -0.45], [16, 38, 0.4], [-6, 52, -0.12], [6, 66, 0.08]] as const;
  for (const [ox, h, a] of list) {
    const hh = h * s * (0.85 + r() * 0.3), w = 8 * s;
    g.save();
    g.translate(x + ox * s, y + 2); g.rotate(a);
    g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w, -hh * 0.75); g.lineTo(0, -hh); g.lineTo(w, -hh * 0.75); g.lineTo(w, 0); g.closePath();
    fillInk(g, dark, 2.4, outline);
    g.beginPath(); g.moveTo(-w, 0); g.lineTo(-w, -hh * 0.75); g.lineTo(0, -hh); g.lineTo(0, 0); g.closePath();
    g.fillStyle = light; g.fill();
    g.beginPath(); g.moveTo(-w * 0.55, -4); g.lineTo(-w * 0.55, -hh * 0.65); ink(g, 1.6, "rgba(255,255,255,0.8)");
    g.restore();
  }
}

function tank(g: G, x: number, y: number, s: number) {
  g.translate(x, y); g.scale(s, s);
  const c = "#7b8a8e";
  rrect(g, -70, -200, 140, 200, 6); fillInk(g, c, 3);
  g.beginPath(); g.ellipse(0, -200, 70, 24, 0, Math.PI, 0); g.closePath(); fillInk(g, lighten(c, 0.1), 3);
  g.fillStyle = darken(c, 0.15); g.fillRect(28, -198, 40, 196);
  g.fillStyle = lighten(c, 0.25); g.fillRect(-58, -196, 10, 192);
  g.beginPath(); for (const by of [-150, -90, -30]) { g.moveTo(-70, by); g.lineTo(70, by); } ink(g, 3, darken(c, 0.35));
  g.fillStyle = "#e7c64a"; g.fillRect(-70, -128, 140, 12);
  g.beginPath(); g.moveTo(-82, 0); g.lineTo(-82, -210); g.moveTo(-92, 0); g.lineTo(-92, -210);
  for (let ly = -10; ly > -210; ly -= 14) { g.moveTo(-92, ly); g.lineTo(-82, ly); }
  ink(g, 2.2, "#4a555a");
}

function pipe(g: G, x: number, y: number, w: number, h: number) {
  const c = "#6f7f86", t = 22;
  if (w) {
    rrect(g, x, y - t / 2, w, t, 4); fillInk(g, c, 2.6);
    g.fillStyle = lighten(c, 0.3); g.fillRect(x, y - t / 2 + 3, w, 4);
    g.fillStyle = darken(c, 0.25); g.fillRect(x, y + t / 2 - 6, w, 4);
    for (let fx = x + 90; fx < x + w; fx += 180) { rrect(g, fx - 6, y - t / 2 - 4, 12, t + 8, 2); fillInk(g, darken(c, 0.1), 2.4); }
  } else {
    rrect(g, x - t / 2, y, t, h, 4); fillInk(g, c, 2.6);
    g.fillStyle = lighten(c, 0.3); g.fillRect(x - t / 2 + 3, y, 4, h);
    g.fillStyle = darken(c, 0.25); g.fillRect(x + t / 2 - 6, y, 4, h);
    for (let fy = y + 80; fy < y + h; fy += 160) { rrect(g, x - t / 2 - 4, fy - 6, t + 8, 12, 2); fillInk(g, darken(c, 0.1), 2.4); }
  }
}

function pillar(g: G, x: number, y: number, h: number, seed: number) {
  const r = rng(seed), c = "#a39c86", w = 17, top = y - h;
  rrect(g, x - 26, y - 14, 52, 14, 2); fillInk(g, darken(c, 0.08), 2.6);
  g.beginPath();
  g.moveTo(x - w, y - 14); g.lineTo(x - w, top + 8);
  for (let i = 0; i <= 5; i++) g.lineTo(x - w + (i * w * 2) / 5, top + (i % 2 ? 0 : 6 + r() * 8));
  g.lineTo(x + w, y - 14); g.closePath();
  fillInk(g, c, 3);
  g.beginPath(); for (const fx of [-8, 0, 8]) { g.moveTo(x + fx, top + 14); g.lineTo(x + fx, y - 18); } ink(g, 2, darken(c, 0.25));
  g.fillStyle = lighten(c, 0.3); g.fillRect(x - w + 3, top + 12, 3, h - 30);
  g.beginPath(); g.ellipse(x - 4, top + 8, 16, 6, 0.1, 0, TAU); g.fillStyle = "#6fae45"; g.fill();
  g.beginPath(); g.moveTo(x + 6, top + 50); g.lineTo(x + 12, top + 62); g.lineTo(x + 8, top + 72); ink(g, 1.6, darken(c, 0.45));
}

function statue(g: G, x: number, y: number, s: number) {
  g.translate(x, y); g.scale(s, s);
  const c = "#9d977f";
  rrect(g, -46, -24, 92, 24, 3); fillInk(g, darken(c, 0.1), 3);
  rrect(g, -30, -92, 60, 70, 8); fillInk(g, c, 3);
  rrect(g, -40, -146, 80, 60, 14); fillInk(g, c, 3);
  g.fillStyle = darken(c, 0.15); g.fillRect(14, -142, 22, 52);
  g.beginPath(); g.moveTo(-28, -126); g.lineTo(-6, -122); g.moveTo(6, -122); g.lineTo(28, -126); ink(g, 4, darken(c, 0.45));
  g.beginPath(); g.roundRect(-22, -118, 14, 7, 3); g.roundRect(8, -118, 14, 7, 3); fillInk(g, "#2f2c24", 1.6);
  rrect(g, -16, -102, 32, 8, 3); fillInk(g, darken(c, 0.3), 2);
  g.beginPath(); g.moveTo(-18, -70); g.lineTo(18, -70); g.moveTo(-18, -54); g.lineTo(18, -54); ink(g, 2, darken(c, 0.3));
  g.beginPath(); g.ellipse(-10, -148, 26, 7, -0.1, 0, TAU); g.fillStyle = "#6fae45"; g.fill();
  g.beginPath(); g.moveTo(30, -140); g.quadraticCurveTo(40, -100, 34, -60); ink(g, 4); ink(g, 2.4, "#4f9a35");
}

function caveBack(g: G, x: number, y: number, w: number, h: number, seed: number, c: DecoCtx) {
  const r = rng(seed), mat = MATERIALS[c.m.terrain.mat];
  const metal = c.m.terrain.mat === "concrete";
  const grad = g.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, darken(mat.dark, 0.55)); grad.addColorStop(1, darken(mat.dark, 0.25));
  g.save();
  rrect(g, x, y, w, h + 40, [22, 22, 0, 0]);
  g.clip();
  g.fillStyle = grad; g.fillRect(x, y, w, h);
  caveInner(g, x, y, w, h, seed, c, metal, r, mat.dark);
  g.restore();
}

function caveInner(g: G, x: number, y: number, w: number, h: number, seed: number, c: DecoCtx, metal: boolean, r: () => number, dark: string) {
  if (metal) {
    g.beginPath(); for (let px = x + 60; px < x + w; px += 90) { g.moveTo(px, y); g.lineTo(px, y + h); } ink(g, 2, "rgba(0,0,0,0.35)");
    g.fillStyle = "#3b4148"; g.fillRect(x, y + 14, w, 8);
    g.fillStyle = "rgba(242,194,48,0.55)"; for (let px = x + 10; px < x + w; px += 36) g.fillRect(px, y + h - 12, 18, 6);
    return;
  }
  g.beginPath();
  for (let i = 0; i < w / 40; i++) { const bx = x + r() * w, by = y + r() * h; g.moveTo(bx + 14, by); g.ellipse(bx, by, 10 + r() * 16, 6 + r() * 8, 0, 0, TAU); }
  g.fillStyle = "rgba(0,0,0,0.25)"; g.fill();
  if (c.m.terrain.mat === "grass" || c.m.terrain.mat === "sand") {
    for (let px = x + 70; px < x + w - 40; px += 150) {
      g.beginPath(); g.moveTo(px, y + h); g.lineTo(px, y + 6); g.moveTo(px + 70, y + h); g.lineTo(px + 70, y + 6); g.moveTo(px - 8, y + 8); g.lineTo(px + 78, y + 8);
      ink(g, 9, "#1c120c"); ink(g, 5, "#7a5230");
    }
  } else if (c.m.terrain.mat === "snow") {
    g.fillStyle = "rgba(140,200,240,0.18)"; g.fillRect(x, y, w, h);
  }
  // Hanging rock lip along the top.
  g.beginPath(); g.moveTo(x, y);
  for (let px = x; px <= x + w; px += 12) g.lineTo(px, y + 4 + Math.abs(Math.sin(px * 0.13 + seed)) * 7);
  g.lineTo(x + w, y); g.closePath();
  g.fillStyle = dark; g.fill();
}

function vent(g: G, x: number, y: number) {
  rrect(g, x - 22, y - 20, 44, 20, 3); fillInk(g, "#6f7b87", 2.6);
  g.beginPath(); for (let vx = x - 16; vx <= x + 16; vx += 6) { g.moveTo(vx, y - 16); g.lineTo(vx, y - 4); } ink(g, 2, "#2c3238");
}

/* Animated decorations (drawn every frame, so keep them cheap). */

function tallgrass(g: G, x: number, y: number, s: number, t: number, c: DecoCtx) {
  const dark = c.dry ? "#a58a45" : "#3f8a2c", light = c.dry ? "#d8bb6a" : "#7cc850";
  const blades = 7;
  const outline = new Path2D(), a = new Path2D(), b = new Path2D();
  for (let i = 0; i < blades; i++) {
    const bx = x + (i - (blades - 1) / 2) * 5 * s, h = (24 + ((i * 7) % 3) * 8) * s;
    const sway = Math.sin(t * 2.1 + x * 0.05 + i * 0.7) * 6 * s;
    for (const p of [outline, i % 2 ? a : b]) { p.moveTo(bx, y); p.quadraticCurveTo(bx + sway * 0.3, y - h * 0.6, bx + sway, y - h); }
  }
  g.lineCap = "round";
  g.lineWidth = 5 * s; g.strokeStyle = INK; g.stroke(outline);
  g.lineWidth = 2.8 * s; g.strokeStyle = dark; g.stroke(a);
  g.strokeStyle = light; g.stroke(b);
}

function flag(g: G, x: number, y: number, t: number) {
  rrect(g, x - 2.5, y - 96, 5, 96, 2); fillInk(g, "#c9ccd1", 2);
  g.beginPath(); g.arc(x, y - 98, 4, 0, TAU); fillInk(g, "#e7c64a", 2);
  const top = y - 92, n = 8, L = 48;
  g.beginPath();
  g.moveTo(x + 2, top);
  for (let i = 1; i <= n; i++) g.lineTo(x + 2 + (i * L) / n, top + Math.sin(t * 4 - i * 0.7) * i * 0.7);
  for (let i = n; i >= 0; i--) g.lineTo(x + 2 + (i * L) / n, top + 28 + Math.sin(t * 4 - i * 0.7) * i * 0.7);
  g.closePath();
  fillInk(g, "#c8463a", 2.4);
  const mx = x + 2 + L * 0.45, my = top + 14 + Math.sin(t * 4 - 3.6) * 2.4;
  g.beginPath(); g.moveTo(mx - 8, my - 5); g.lineTo(mx, my + 3); g.lineTo(mx + 8, my - 5); ink(g, 3, "#f6e7c1");
}

function fan(g: G, x: number, y: number, s: number, t: number) {
  const R = 32 * s;
  rrect(g, x - R, y - R, R * 2, R * 2, 6 * s); fillInk(g, "#6f7b87", 3);
  g.beginPath(); g.arc(x, y, R * 0.82, 0, TAU); fillInk(g, "#22272c", 2.4);
  g.save(); g.translate(x, y); g.rotate(t * 7);
  g.beginPath();
  for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.moveTo(0, 0); g.quadraticCurveTo(R * 0.5, -R * 0.38, R * 0.76, -R * 0.1); g.quadraticCurveTo(R * 0.4, R * 0.1, 0, 0); }
  fillInk(g, "#a3afbb", 1.8);
  g.restore();
  g.beginPath(); g.arc(x, y, R * 0.14, 0, TAU); fillInk(g, "#d9483b", 1.8);
  g.beginPath(); for (let k = -2; k <= 2; k++) { g.moveTo(x - R * 0.8, y + k * R * 0.3); g.lineTo(x + R * 0.8, y + k * R * 0.3); } ink(g, 1, "rgba(200,210,220,0.35)");
}

/** Flicker in 0.6..1, stable for a given seed. */
export const flicker = (t: number, k: number) => 0.8 + 0.12 * Math.sin(t * 13 + k) + 0.08 * Math.sin(t * 31 + k * 2.3);

function lamp(g: G, x: number, y: number, t: number) {
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 12); ink(g, 2, "#2c3238");
  g.beginPath(); g.moveTo(x - 13, y + 24); g.lineTo(x - 6, y + 12); g.lineTo(x + 6, y + 12); g.lineTo(x + 13, y + 24); g.closePath();
  fillInk(g, "#4f5d4a", 2.2);
  const on = Math.sin(t * 9 + x) > -0.92;
  g.beginPath(); g.arc(x, y + 25, 5, 0, Math.PI); fillInk(g, on ? "#fff1b0" : "#8a8470", 1.6);
}

function beacon(g: G, x: number, y: number, t: number) {
  rrect(g, x - 3, y - 16, 6, 16, 2); fillInk(g, "#5d6873", 2);
  const on = (t * 0.8 + x * 0.001) % 1 < 0.5;
  g.beginPath(); g.arc(x, y - 18, 6, Math.PI, 0); g.closePath(); fillInk(g, on ? "#ff5a4a" : "#7a2a24", 2);
}

function torch(g: G, x: number, y: number, t: number) {
  g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 40); ink(g, 7); ink(g, 4, "#6b4426");
  g.beginPath(); g.moveTo(x - 10, y - 42); g.lineTo(x + 10, y - 42); g.lineTo(x + 6, y - 34); g.lineTo(x - 6, y - 34); g.closePath(); fillInk(g, "#4a4a4a", 2);
  const k = x * 0.37;
  const layers: [string, number, number][] = [["#e2512a", 1, 22], ["#f59a2a", 0.72, 16], ["#ffe08a", 0.42, 10]];
  for (const [c, sc, h] of layers) {
    const fh = h * (0.85 + 0.15 * Math.sin(t * 14 + k)) , sw = Math.sin(t * 9 + k) * 2.5;
    const w = 8 * sc;
    g.beginPath(); g.moveTo(x - w, y - 42); g.quadraticCurveTo(x - w, y - 42 - fh * 0.6, x + sw, y - 42 - fh); g.quadraticCurveTo(x + w, y - 42 - fh * 0.6, x + w, y - 42); g.closePath();
    g.fillStyle = c; g.fill();
  }
}

function waterfall(g: G, x: number, y: number, w: number, gy: number, t: number) {
  const len = gy - y;
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, "rgba(120,200,235,0.85)"); grad.addColorStop(0.5, "rgba(180,235,255,0.9)"); grad.addColorStop(1, "rgba(110,190,230,0.85)");
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w + 6, gy); g.lineTo(x - 6, gy); g.closePath(); g.fill();
  g.beginPath();
  for (let k = 0; k < 7; k++) {
    const lx = x + 5 + ((k * 13) % (w - 8));
    const off = (t * 260 + k * 97) % len;
    g.moveTo(lx, y + off); g.lineTo(lx + 1, Math.min(gy, y + off + 26 + (k % 3) * 8));
  }
  ink(g, 2.4, "rgba(255,255,255,0.75)");
  g.beginPath(); g.moveTo(x, y); g.lineTo(x - 6, gy); g.moveTo(x + w, y); g.lineTo(x + w + 6, gy); ink(g, 2.4, "#2f7fa8");
  g.beginPath();
  for (let k = 0; k < 6; k++) { const fx = x - 10 + (k * (w + 20)) / 5, r = 9 + 4 * Math.sin(t * 6 + k * 1.7); g.moveTo(fx + r, gy - 4); g.arc(fx, gy - 4, r, 0, TAU); }
  g.fillStyle = "rgba(255,255,255,0.85)"; g.fill();
}

function pool(g: G, x: number, y: number, w: number, c: DecoCtx, t: number) {
  g.beginPath();
  g.moveTo(x, y);
  for (let px = x; px <= x + w; px += 8) g.lineTo(px, y + Math.sin(t * 2 + px * 0.05) * 1.2);
  for (let px = x + w; px >= x; px -= 8) g.lineTo(px, Math.max(y, c.ground(px)) + 1);
  g.closePath();
  g.fillStyle = "rgba(60,150,180,0.62)"; g.fill();
  g.beginPath();
  for (let k = 0; k < 4; k++) {
    const ph = (t * 0.35 + k / 4) % 1, cx = x + w * (0.15 + 0.23 * k), rr = 6 + ph * 34;
    g.moveTo(cx + rr, y + 3); g.ellipse(cx, y + 3, rr, rr * 0.18, 0, 0, TAU);
  }
  ink(g, 1.4, "rgba(200,245,255,0.45)");
  g.beginPath(); g.moveTo(x + 6, y); g.lineTo(x + w - 6, y); ink(g, 2, "rgba(220,250,255,0.8)");
}

function vine(g: G, x: number, y: number, s: number, t: number) {
  const n = 8, L = 100 * s;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push([x + Math.sin(t * 1.3 + i * 0.45 + x * 0.01) * i * 0.9 * s, y + (i * L) / n]);
  g.beginPath(); g.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i <= n; i++) g.lineTo(pts[i]![0], pts[i]![1]);
  ink(g, 4.5); ink(g, 2.6, "#3f8a2c");
  g.beginPath();
  for (let i = 1; i <= n; i++) {
    const [px, py] = pts[i]!, sd = i % 2 ? 1 : -1;
    g.moveTo(px + sd * 12 * s, py); g.ellipse(px + sd * 6 * s, py, 6 * s, 3 * s, sd * 0.5, 0, TAU);
  }
  fillInk(g, "#55a53c", 1.4);
}

/* ───────────── Static scene (baked into the terrain cache) ───────────── */

export interface SceneItem { d: DecorationDefinition; seed: number; b: Box }
export interface Scene { m: MapDefinition; art: TerrainArt; c: DecoCtx; bg: SceneItem[]; fg: SceneItem[] }

const hit = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** Paints everything that never moves, culled to `box`: background props, terrain, platforms, props on the terrain. */
export function paintStatic(g: G, sc: Scene, box: Box) {
  for (const it of sc.bg) if (hit(it.b, box)) paintDeco(g, it.d, sc.c, it.seed);
  paintGround(g, sc.m, sc.art, box);
  paintCeiling(g, sc.m, sc.art, box);
  // Soft shadows cast on the ground by floating platforms.
  for (const p of sc.m.platforms) {
    const [x, y, w, h] = p.r, cx = x + w / 2, gy = sc.c.ground(cx), gap = gy - (y + h);
    if (gap < 8 || gap > 420 || !hit([x - 20, gy - 20, x + w + 20, gy + 20], box)) continue;
    const a = 0.22 * (1 - gap / 420);
    const grad = g.createRadialGradient(cx, gy, 0, cx, gy, w * 0.6);
    grad.addColorStop(0, `rgba(0,0,0,${a})`); grad.addColorStop(1, "rgba(0,0,0,0)");
    g.save(); g.translate(cx, gy); g.scale(1, 0.18); g.translate(-cx, -gy);
    g.fillStyle = grad; g.beginPath(); g.arc(cx, gy, w * 0.6, 0, TAU); g.fill();
    g.restore();
  }
  sc.m.platforms.forEach((p, i) => {
    const [x, y, w, h] = p.r;
    if (hit([x - 10, y - 20, x + w + 10, y + h + 10], box)) paintPlatform(g, p, hash(sc.m.id) + i * 7919);
  });
  for (const it of sc.fg) if (hit(it.b, box)) paintDeco(g, it.d, sc.c, it.seed);
}

/* ───────────── Backdrops (parallax strips) ───────────── */

/** Strip size in screen pixels at zoom 1. Strips repeat horizontally. */
export const STRIP_W = 1600;
export const stripH = (k: BackdropKind) => (k === "cave" ? 760 : 440);

/** Paints one repeating silhouette strip. Below the strip the layer continues in its flat colour. */
export function paintStrip(g: G, kind: BackdropKind, color: string, seed: number) {
  const W = STRIP_W, H = stripH(kind), r = rng(seed);
  const light = lighten(color, 0.16), dark = darken(color, 0.1);
  const wrap = (f: (dx: number) => void) => { for (const dx of [-W, 0, W]) f(dx); };
  g.fillStyle = color;
  g.lineJoin = "round";
  if (kind === "mountains" || kind === "snowpeaks") {
    const peaks = Array.from({ length: 7 }, (_, i) => ({ x: (i + r() * 0.6) * (W / 7), h: 150 + r() * 200, w: 160 + r() * 140 }));
    for (const p of peaks) wrap((dx) => {
      const px = p.x + dx, top = H - 120 - p.h;
      g.beginPath(); g.moveTo(px - p.w, H); g.lineTo(px - p.w * 0.15, top + 18); g.quadraticCurveTo(px, top - 4, px + p.w * 0.12, top + 16); g.lineTo(px + p.w, H); g.closePath();
      g.fillStyle = color; g.fill();
      g.beginPath(); g.moveTo(px - p.w * 0.12, top + 14); g.lineTo(px + p.w * 0.5, H); g.lineTo(px + p.w, H); g.lineTo(px + p.w * 0.12, top + 16); g.closePath();
      g.fillStyle = dark; g.fill();
      if (kind === "snowpeaks" || p.h > 300) {
        const sh = p.h * 0.32;
        g.beginPath(); g.moveTo(px - p.w * 0.15, top + 18);
        g.quadraticCurveTo(px, top - 4, px + p.w * 0.12, top + 16);
        g.lineTo(px + p.w * 0.12 + sh * 0.55, top + sh);
        for (let i = 4; i >= 0; i--) g.lineTo(px - p.w * 0.15 - sh * 0.5 + i * ((p.w * 0.27 + sh) / 4), top + sh - (i % 2 ? 14 : 0));
        g.closePath();
        g.fillStyle = kind === "snowpeaks" ? "#f4f8fd" : lighten(color, 0.45); g.fill();
      }
    });
  } else if (kind === "mesas") {
    const ms = Array.from({ length: 4 }, (_, i) => ({ x: (i + r() * 0.5) * (W / 4), w: 140 + r() * 160, h: 110 + r() * 140 }));
    for (const m of ms) wrap((dx) => {
      const x0 = m.x + dx, top = H - 110 - m.h;
      g.beginPath(); g.moveTo(x0 - 40, H); g.lineTo(x0, top + 10); g.lineTo(x0 + 6, top); g.lineTo(x0 + m.w - 6, top); g.lineTo(x0 + m.w, top + 10); g.lineTo(x0 + m.w + 50, H); g.closePath();
      g.fillStyle = color; g.fill();
      g.save(); g.clip();
      for (let by = top + 22; by < H; by += 26) { g.fillStyle = by % 52 < 26 ? light : dark; g.fillRect(x0 - 60, by, m.w + 120, 9); }
      g.fillStyle = darken(color, 0.15); g.fillRect(x0 + m.w * 0.65, top, m.w, H);
      g.restore();
    });
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) g.lineTo(x, H - 90 + Math.sin((x / W) * TAU * 3 + seed) * 14 + Math.sin((x / W) * TAU * 7) * 6);
    g.lineTo(W, H); g.closePath(); g.fillStyle = color; g.fill();
  } else if (kind === "dunes") {
    const ph = [r() * TAU, r() * TAU];
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 10) g.lineTo(x, H - 160 + Math.sin((x / W) * TAU * 2 + ph[0]!) * 50 + Math.sin((x / W) * TAU * 5 + ph[1]!) * 20);
    g.lineTo(W, H); g.closePath(); g.fillStyle = color; g.fill();
    g.save(); g.clip();
    g.beginPath();
    for (let x = 0; x <= W; x += 10) { const y = H - 160 + Math.sin((x / W) * TAU * 2 + ph[0]!) * 50 + Math.sin((x / W) * TAU * 5 + ph[1]!) * 20; x ? g.lineTo(x, y + 4) : g.moveTo(x, y + 4); }
    g.lineWidth = 6; g.strokeStyle = light; g.stroke();
    g.restore();
  } else if (kind === "forest" || kind === "jungle" || kind === "pines") {
    g.fillStyle = color; g.fillRect(0, H - 120, W, 120);
    const n = kind === "pines" ? 34 : 26;
    const items = Array.from({ length: n }, (_, i) => ({ x: (i + r()) * (W / n), h: 120 + r() * 140, w: 34 + r() * 30 }));
    for (const it of items) wrap((dx) => {
      const x = it.x + dx, base = H - 100;
      if (kind === "pines") {
        g.beginPath(); g.moveTo(x, base - it.h);
        for (let k = 1; k <= 4; k++) { const ty = base - it.h + (it.h * k) / 4; g.lineTo(x + it.w * (k / 4) * 0.9, ty); g.lineTo(x + it.w * (k / 4) * 0.45, ty - 6); }
        for (let k = 4; k >= 1; k--) { const ty = base - it.h + (it.h * k) / 4; g.lineTo(x - it.w * (k / 4) * 0.45, ty - 6); g.lineTo(x - it.w * (k / 4) * 0.9, ty); }
        g.closePath(); g.fillStyle = color; g.fill();
        g.beginPath(); g.moveTo(x, base - it.h); g.lineTo(x - it.w * 0.8, base); g.lineTo(x - it.w * 0.2, base); g.closePath(); g.fillStyle = light; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
      } else {
        const cy = base - it.h * 0.7, rr = it.w * (kind === "jungle" ? 1.35 : 1.05);
        g.fillRect(x - 5, cy, 10, base - cy + 20);
        g.beginPath(); g.ellipse(x, cy, rr, rr * (kind === "jungle" ? 0.6 : 0.9), 0, 0, TAU); g.ellipse(x - rr * 0.6, cy + rr * 0.35, rr * 0.7, rr * 0.6, 0, 0, TAU); g.ellipse(x + rr * 0.6, cy + rr * 0.3, rr * 0.7, rr * 0.6, 0, 0, TAU);
        g.fillStyle = color; g.fill();
        g.beginPath(); g.ellipse(x - rr * 0.3, cy - rr * 0.25, rr * 0.45, rr * 0.3, 0, 0, TAU); g.fillStyle = light; g.globalAlpha = 0.5; g.fill(); g.globalAlpha = 1;
        if (kind === "jungle" && r() < 0.3) { g.beginPath(); g.moveTo(x, cy - rr * 0.4); g.lineTo(x + 4, cy - rr * 1.6); g.lineWidth = 5; g.strokeStyle = color; g.stroke(); g.beginPath(); g.ellipse(x + 4, cy - rr * 1.7, rr * 0.9, rr * 0.3, 0, 0, TAU); g.fillStyle = color; g.fill(); }
      }
    });
  } else if (kind === "factory") {
    g.fillStyle = color; g.fillRect(0, H - 100, W, 100);
    let x = 0;
    while (x < W) {
      const bw = 70 + r() * 130, bh = 80 + r() * 190, top = H - 100 - bh, type = r();
      g.fillStyle = color;
      if (type < 0.35) {
        g.beginPath(); g.moveTo(x, H); g.lineTo(x, top + 30);
        for (let sx = x; sx < x + bw - 1; sx += 30) { g.lineTo(sx + 22, top); g.lineTo(sx + 30, top + 30); }
        g.lineTo(x + bw, H); g.closePath(); g.fill();
      } else g.fillRect(x, top, bw, bh + 100);
      if (r() < 0.5) { const cx = x + bw * (0.3 + r() * 0.4); g.fillRect(cx - 7, top - 70 - r() * 60, 14, 120); g.fillRect(cx - 10, top - 80, 20, 8); }
      if (r() < 0.2) { const tx = x + bw / 2; g.fillRect(tx - 2, top - 40, 4, 40); g.beginPath(); g.ellipse(tx, top - 52, 22, 16, 0, 0, TAU); g.fill(); }
      g.fillStyle = "rgba(255,214,140,0.5)";
      for (let wy = top + 40; wy < H - 110; wy += 26) for (let wx = x + 10; wx < x + bw - 14; wx += 20) if (r() < 0.22) g.fillRect(wx, wy, 8, 10);
      x += bw + r() * 30;
    }
    g.fillStyle = color;
    g.beginPath(); g.moveTo(W * 0.62, H - 100); g.lineTo(W * 0.62, H - 380); g.lineTo(W * 0.62 + 220, H - 380); g.lineTo(W * 0.62 + 220, H - 370); g.lineTo(W * 0.62 + 10, H - 370); g.lineTo(W * 0.62 + 10, H - 100); g.closePath(); g.fill();
  } else if (kind === "cave") {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(0, 0);
    for (let x = 0; x <= W; x += 16) g.lineTo(x, 110 + Math.sin((x / W) * TAU * 3 + seed) * 30 + Math.sin((x / W) * TAU * 11 + seed * 2) * 12);
    g.lineTo(W, 0); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 16) g.lineTo(x, H - 120 + Math.sin((x / W) * TAU * 2 + seed * 3) * 34 + Math.sin((x / W) * TAU * 9 + seed) * 12);
    g.lineTo(W, H); g.closePath(); g.fill();
    const n = 18;
    for (let i = 0; i < n; i++) {
      const sx = (i + r()) * (W / n), l = 60 + r() * 140, w = 12 + r() * 18, up = r() < 0.5;
      wrap((dx) => {
        g.beginPath();
        if (up) { g.moveTo(sx + dx - w, 120); g.lineTo(sx + dx, 120 + l); g.lineTo(sx + dx + w, 120); }
        else { g.moveTo(sx + dx - w, H - 110); g.lineTo(sx + dx, H - 110 - l); g.lineTo(sx + dx + w, H - 110); }
        g.closePath(); g.fill();
      });
    }
    for (let i = 0; i < 3; i++) {
      const px = (i + 0.3 + r() * 0.4) * (W / 3), pw = 40 + r() * 40;
      wrap((dx) => { g.beginPath(); g.moveTo(px + dx - pw, 0); g.quadraticCurveTo(px + dx - pw * 0.4, H / 2, px + dx - pw, H); g.lineTo(px + dx + pw, H); g.quadraticCurveTo(px + dx + pw * 0.4, H / 2, px + dx + pw, 0); g.closePath(); g.globalAlpha = 0.7; g.fill(); g.globalAlpha = 1; });
    }
  } else if (kind === "ruins") {
    g.fillStyle = color; g.fillRect(0, H - 110, W, 110);
    const items = Array.from({ length: 7 }, (_, i) => ({ x: (i + r() * 0.6) * (W / 7), t: r(), s: 0.7 + r() * 0.6 }));
    for (const it of items) wrap((dx) => {
      const x = it.x + dx, base = H - 100;
      g.fillStyle = color;
      if (it.t < 0.4) {
        for (let k = 0; k < 5; k++) { const w = (180 - k * 32) * it.s, h = 34 * it.s; g.fillRect(x - w / 2, base - (k + 1) * h, w, h + 1); }
        g.fillRect(x - 16 * it.s, base - 5 * 34 * it.s - 30 * it.s, 32 * it.s, 32 * it.s);
      } else if (it.t < 0.75) {
        for (const cx of [-50, -18, 14, 46]) { const h = (90 + ((cx * 7 + 300) % 50)) * it.s; g.fillRect(x + cx * it.s, base - h, 18 * it.s, h); }
        g.fillRect(x - 56 * it.s, base - 100 * it.s, 70 * it.s, 12 * it.s);
      } else {
        g.beginPath(); g.moveTo(x - 60 * it.s, base); g.lineTo(x - 60 * it.s, base - 90 * it.s); g.arc(x, base - 90 * it.s, 60 * it.s, Math.PI, 0); g.lineTo(x + 60 * it.s, base);
        g.lineTo(x + 34 * it.s, base); g.lineTo(x + 34 * it.s, base - 90 * it.s); g.arc(x, base - 90 * it.s, 34 * it.s, 0, Math.PI, true); g.lineTo(x - 34 * it.s, base); g.closePath(); g.fill();
      }
      g.beginPath(); g.ellipse(x + 40, base - 20, 60, 34, 0, 0, TAU); g.ellipse(x - 50, base - 10, 50, 30, 0, 0, TAU); g.fill();
    });
  }
}

/** A fluffy cartoon cloud, about 220×90 at scale 1. */
export function paintCloud(g: G, seed: number, color: string) {
  const r = rng(seed);
  const cs: [number, number, number][] = [[60, 60, 30], [100, 46, 38], [146, 54, 32], [180, 64, 24], [36, 68, 22]];
  const jit = cs.map(([x, y, rr]) => [x + (r() - 0.5) * 12, y + (r() - 0.5) * 8, rr * (0.85 + r() * 0.3)] as const);
  g.beginPath();
  for (const [x, y, rr] of jit) { g.moveTo(x + rr, y); g.arc(x, y, rr, 0, TAU); }
  g.rect(36, 62, 146, 22);
  g.fillStyle = darken(color, 0.1); g.fill();
  g.beginPath();
  for (const [x, y, rr] of jit) { g.moveTo(x + rr * 0.9, y - 4); g.arc(x, y - 4, rr * 0.9, 0, TAU); }
  g.fillStyle = color; g.fill();
  g.beginPath();
  for (const [x, y, rr] of jit) { g.moveTo(x - rr * 0.25 + rr * 0.4, y - rr * 0.35); g.arc(x - rr * 0.25, y - rr * 0.35, rr * 0.4, 0, TAU); }
  g.fillStyle = lighten(color, 0.5); g.globalAlpha = 0.6; g.fill(); g.globalAlpha = 1;
}
