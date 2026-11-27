/**
 * Layered environment renderer for one arena.
 *
 *  1 sky · 2 far backdrop · 3 near backdrop      → screen space, parallax strips cached per zoom
 *  near-background trees (swaying sprites)
 *  4 terrain + platforms · 5 static props          → tile cache (painted once, reused every frame)
 *  5 animated props (grass, flags, fans, water…)
 *  6 gameplay entities                             → drawn by the caller between drawBack and drawFront
 *  7 foreground plants, particles, light, fog
 *  8 HUD                                           → React, outside the canvas
 */
import type { MapDefinition, ParticleKind } from "../maps";
import {
  ANIMATED, SWAYS, STRIP_W, decoBounds, decoCtx, flicker, hash, paintCloud, paintDeco, paintStatic, paintStrip, prepTerrain, rgba, steam, stripH,
  type Box, type G, type Scene, type SceneItem,
} from "./art";

export type Quality = "low" | "medium" | "high";
export const QUALITIES: readonly Quality[] = ["low", "medium", "high"];
type Mode = Quality | "preview" | "thumb";

interface Spec {
  /** Scale of the whole-map fallback cache. */
  baseS: number;
  /** Paint sharp tiles at the screen's real resolution. */
  tiles: boolean;
  maxS: number;
  tilesPerFrame: number;
  particles: number;
  lights: boolean;
  sway: boolean;
  clouds: boolean;
}
const SPEC: Record<Mode, Spec> = {
  low: { baseS: 0.75, tiles: false, maxS: 0.75, tilesPerFrame: 0, particles: 0, lights: false, sway: false, clouds: true },
  medium: { baseS: 0.5, tiles: true, maxS: 1.25, tilesPerFrame: 1, particles: 0.5, lights: true, sway: true, clouds: true },
  high: { baseS: 0.5, tiles: true, maxS: 1.5, tilesPerFrame: 1, particles: 1, lights: true, sway: true, clouds: true },
  preview: { baseS: 0.45, tiles: false, maxS: 0.45, tilesPerFrame: 0, particles: 0.4, lights: true, sway: true, clouds: true },
  thumb: { baseS: 0, tiles: false, maxS: 1, tilesPerFrame: 0, particles: 0, lights: false, sway: false, clouds: true },
};

/** Camera: world point at the screen centre, world→CSS-pixel zoom, CSS size and device pixel ratio. */
export interface View { cx: number; cy: number; z: number; w: number; h: number; dpr: number }
export interface Actor { x: number; y: number }

const TILE = 512;
const TILE_BUDGET = 20e6; // bytes of tile cache we allow (big canvas budgets push browsers off the GPU path)
const QS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const quant = (s: number) => QS.reduce((a, b) => (Math.abs(b - s) < Math.abs(a - s) ? b : a));

const canvas = (w: number, h: number) => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
};
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d")!;
const free = (c: HTMLCanvasElement) => { c.width = c.height = 0; };

export function worldTransform(g: G, v: View) {
  g.setTransform(v.dpr * v.z, 0, 0, v.dpr * v.z, v.dpr * (v.w / 2 - v.cx * v.z), v.dpr * (v.h / 2 - v.cy * v.z));
}
export const viewBox = (v: View): Box => [v.cx - v.w / 2 / v.z, v.cy - v.h / 2 / v.z, v.cx + v.w / 2 / v.z, v.cy + v.h / 2 / v.z];
const hit = (a: Box, b: Box) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

interface Sprite { c: HTMLCanvasElement; b: Box; it: SceneItem; sway: number; fade: number; fg: boolean }
interface Light { x: number; y: number; r: number; rgb: string; mode: "steady" | "flicker" | "blink" | "pulse" }
interface Particles { kind: ParticleKind; color: string; max: number; x: Float32Array; y: Float32Array; v: Float32Array; ph: Float32Array; sz: Float32Array; live: number }

const LIGHT_OF: Partial<Record<string, Omit<Light, "x" | "y"> & { dy: number }>> = {
  torch: { r: 190, rgb: "255,150,60", mode: "flicker", dy: -52 },
  lamp: { r: 170, rgb: "255,225,150", mode: "flicker", dy: 26 },
  crystal: { r: 130, rgb: "120,230,255", mode: "pulse", dy: -30 },
  beacon: { r: 60, rgb: "255,80,60", mode: "blink", dy: -18 },
};

export class EnvRenderer {
  readonly map: MapDefinition;
  private readonly spec: Spec;
  private readonly scene: Scene;
  private base: HTMLCanvasElement | null = null;
  private tiles = new Map<string, { c: HTMLCanvasElement; used: number }>();
  private strips: HTMLCanvasElement[] = [];
  private clouds: HTMLCanvasElement[] = [];
  private stripK = 0;
  private sprites: Sprite[] = [];
  private spriteK = 0;
  private anim: SceneItem[] = [];
  private vents: SceneItem[] = [];
  private lights: Light[] = [];
  private parts: Particles[] = [];
  private lightCanvas: HTMLCanvasElement | null = null;
  private frame = 0;
  private ema = 16;
  /** Lowered automatically when frames run slow. */
  private density = 1;
  private skyGrad: { h: number; g: CanvasGradient } | null = null;

  constructor(map: MapDefinition, mode: Mode) {
    this.map = map;
    this.spec = SPEC[mode];
    const c = decoCtx(map);
    const items = map.decorations.map((d, i): SceneItem => ({ d, seed: hash(map.id) + i * 104729, b: decoBounds(d, c) }));
    const sprite = (it: SceneItem) => SWAYS.has(it.d.k) || it.d.z === "fg";
    this.scene = {
      m: map, art: prepTerrain(map), c,
      bg: items.filter((it) => it.d.z === "bg" && !sprite(it) && !ANIMATED.has(it.d.k)),
      fg: items.filter((it) => it.d.z !== "bg" && it.d.z !== "fg" && !sprite(it) && !ANIMATED.has(it.d.k)),
    };
    this.anim = items.filter((it) => ANIMATED.has(it.d.k));
    this.vents = items.filter((it) => it.d.k === "vent");
    this.sprites = items.filter(sprite).map((it) => ({
      c: canvas(1, 1), b: it.b, it, fade: 1, fg: it.d.z === "fg",
      sway: SWAYS.has(it.d.k) ? 0.022 : it.d.k === "bush" || it.d.k === "fern" ? 0.04 : 0,
    }));
    for (const it of items) {
      const l = LIGHT_OF[it.d.k];
      if (!l) continue;
      const s = it.d.s ?? 1;
      const y = it.d.k === "lamp" ? it.b[1] + 6 : (it.b[1] + it.b[3]) / 2;
      this.lights.push({ x: it.d.x, y: it.d.k === "lamp" ? y + l.dy : it.b[3] + l.dy * s, r: l.r * Math.max(0.7, s), rgb: l.rgb, mode: l.mode });
    }
    for (const l of map.lighting.lights) {
      const m = /^#?([0-9a-f]{6})$/i.exec(l.color);
      const n = m ? parseInt(m[1]!, 16) : 0xffffff;
      this.lights.push({ x: l.x, y: l.y, r: l.r, rgb: `${n >> 16},${(n >> 8) & 255},${n & 255}`, mode: l.blink ? "blink" : l.flicker ? "flicker" : "steady" });
    }
    if (this.spec.baseS > 0) {
      // Asset preload: the whole static scene at low resolution, so nothing is ever blank while tiles fill in.
      const s = this.spec.baseS;
      this.base = canvas(map.w * s, map.h * s);
      const g = ctx2d(this.base);
      g.setTransform(s, 0, 0, s, 0, 0);
      paintStatic(g, this.scene, [0, 0, map.w, map.h]);
    }
    for (const p of map.particles) {
      const max = Math.round(p.count * this.spec.particles);
      if (max <= 0) continue;
      this.parts.push({ kind: p.kind, color: p.color, max, x: new Float32Array(max), y: new Float32Array(max), v: new Float32Array(max), ph: new Float32Array(max), sz: new Float32Array(max), live: 0 });
    }
  }

  /** Frees every cached canvas. Call it when switching maps. */
  dispose() {
    if (this.base) free(this.base);
    for (const t of this.tiles.values()) free(t.c);
    for (const c of [...this.strips, ...this.clouds]) free(c);
    for (const s of this.sprites) free(s.c);
    if (this.lightCanvas) free(this.lightCanvas);
    this.tiles.clear(); this.strips = []; this.clouds = []; this.base = null;
  }

  /* ───────── Layers 1–5: everything behind the players ───────── */

  drawBack(g: G, v: View, t: number) {
    this.frame++;
    this.ensureStrips(v);
    g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
    this.drawSky(g, v, t);
    this.drawParallax(g, v, t);
    worldTransform(g, v);
    const box = viewBox(v);
    this.ensureSprites(v);
    for (const s of this.sprites) if (!s.fg && hit(s.b, box)) this.drawSprite(g, s, t);
    this.drawTerrain(g, v, box);
    for (const it of this.anim) if (hit(it.b, box)) paintDeco(g, it.d, this.scene.c, it.seed, t);
    for (const it of this.vents) if (hit([it.b[0], it.b[1] - 140, it.b[2], it.b[3]], box)) steam(g, it.d.x, it.b[3] - 2, t);
  }

  /* ───────── Layer 7: in front of the players ───────── */

  drawFront(g: G, v: View, t: number, dtMs: number, actors: readonly Actor[]) {
    this.ema += (Math.min(dtMs, 100) - this.ema) * 0.05;
    if (this.frame % 30 === 0) this.density = this.ema > 22 ? Math.max(0.3, this.density - 0.1) : this.ema < 18 ? Math.min(1, this.density + 0.05) : this.density;
    worldTransform(g, v);
    const box = viewBox(v);
    for (const s of this.sprites) {
      if (!s.fg || !hit(s.b, box)) continue;
      // Fade foreground plants when someone is behind them, so they never hide the action.
      const behind = actors.some((a) => a.x > s.b[0] && a.x < s.b[2] && a.y > s.b[1] - 20 && a.y < s.b[3] + 20);
      s.fade += ((behind ? 0.3 : 1) - s.fade) * 0.2;
      g.globalAlpha = s.fade;
      this.drawSprite(g, s, t);
      g.globalAlpha = 1;
    }
    this.drawParticles(g, box, t, Math.min(dtMs, 50) / 1000);
    this.drawLighting(g, v, t, actors);
  }

  /* ───────── Sky ───────── */

  private drawSky(g: G, v: View, t: number) {
    const th = this.map.theme;
    if (!this.skyGrad || this.skyGrad.h !== v.h) {
      const grad = g.createLinearGradient(0, 0, 0, v.h);
      grad.addColorStop(0, th.sky[0]); grad.addColorStop(0.55, th.sky[1]); grad.addColorStop(1, th.sky[2]);
      this.skyGrad = { h: v.h, g: grad };
    }
    g.fillStyle = this.skyGrad.g;
    g.fillRect(0, 0, v.w, v.h);
    const sun = th.sun;
    if (sun) {
      const sx = v.w * sun.x - (v.cx - this.map.w / 2) * 0.02 * v.z, sy = v.h * sun.y - (v.cy - this.map.h / 2) * 0.02 * v.z;
      const r = sun.r * Math.max(0.6, v.z);
      const glow = g.createRadialGradient(sx, sy, r * 0.6, sx, sy, r * 4);
      glow.addColorStop(0, rgba(sun.color, 0.55)); glow.addColorStop(1, rgba(sun.color, 0));
      g.fillStyle = glow; g.fillRect(sx - r * 4, sy - r * 4, r * 8, r * 8);
      g.beginPath(); g.arc(sx, sy, r * 1.25, 0, Math.PI * 2); g.fillStyle = rgba(sun.color, 0.35); g.fill();
      g.beginPath(); g.arc(sx, sy, r, 0, Math.PI * 2); g.fillStyle = sun.color; g.fill();
    }
    if (this.spec.clouds && th.clouds && this.clouds.length) {
      const span = v.w + 600, r = this.cloudSeeds();
      for (let i = 0; i < th.clouds; i++) {
        const c = this.clouds[i % this.clouds.length]!, k = r[i]!;
        const sc = (0.55 + k.s * 0.6) * v.z;
        const x = ((((k.x * span - v.cx * v.z * 0.05 + t * (6 + k.s * 10)) % span) + span) % span) - 300;
        const y = v.h * (0.06 + k.y * 0.32) - (v.cy - this.map.h / 2) * 0.05 * v.z;
        g.drawImage(c, x, y, (c.width / this.stripK) * sc, (c.height / this.stripK) * sc);
      }
    }
  }
  private seeds: { x: number; y: number; s: number }[] | null = null;
  private cloudSeeds() {
    if (!this.seeds) {
      let s = hash(this.map.id + "clouds");
      const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
      this.seeds = Array.from({ length: 12 }, () => ({ x: r(), y: r(), s: r() }));
    }
    return this.seeds;
  }

  /* ───────── Parallax ───────── */

  private ensureStrips(v: View) {
    // Backdrops are soft, hazy silhouettes: 1× is plenty and keeps texture memory low.
    const k = quant(Math.min(1, this.spec.maxS, Math.max(0.5, v.z * v.dpr)));
    if (k === this.stripK && this.strips.length) return;
    for (const c of [...this.strips, ...this.clouds]) free(c);
    this.stripK = k;
    this.strips = this.map.parallax.map((l) => {
      const c = canvas(STRIP_W * k, stripH(l.kind) * k), g = ctx2d(c);
      g.scale(k, k);
      paintStrip(g, l.kind, l.color, l.seed);
      return c;
    });
    this.clouds = [0, 1, 2].map((i) => {
      const c = canvas(230 * k, 100 * k), g = ctx2d(c);
      g.scale(k, k);
      paintCloud(g, hash(this.map.id) + i * 31, this.map.theme.cloud);
      return c;
    });
  }

  private drawParallax(g: G, v: View, t: number) {
    const layers = this.map.parallax, th = this.map.theme;
    layers.forEach((l, i) => {
      const c = this.strips[i];
      if (!c) return;
      const sw = STRIP_W * v.z, sh = stripH(l.kind) * v.z;
      const top = v.h * l.y - (l.kind === "cave" ? sh / 2 : sh * 0.62) + (this.map.h / 2 - v.cy) * l.f * v.z * 0.6;
      let ox = (-(v.cx * l.f * v.z) % sw);
      if (ox > 0) ox -= sw;
      for (let x = ox; x < v.w; x += sw) g.drawImage(c, x, top, sw + 0.5, sh);
      g.fillStyle = l.color;
      if (top + sh < v.h) g.fillRect(0, top + sh - 0.5, v.w, v.h - top - sh + 1);
      if (l.kind === "cave" && top > 0) g.fillRect(0, 0, v.w, top + 0.5);
      // Atmospheric perspective: haze between layers, so distant ones fade into the sky.
      if (i < layers.length - 1) { g.fillStyle = th.fog; g.fillRect(0, 0, v.w, v.h); }
    });
    if (th.rays && this.spec.lights) {
      g.save();
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 5; i++) {
        const a = 0.035 * (0.6 + 0.4 * Math.sin(t * 0.4 + i * 1.7));
        const x = v.w * (0.1 + i * 0.2) - (v.cx * 0.03 * v.z) % (v.w * 0.2);
        g.fillStyle = `rgba(255,248,215,${a})`;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 50, 0); g.lineTo(x + 50 + v.h * 0.55, v.h); g.lineTo(x + v.h * 0.55 - 40, v.h); g.closePath(); g.fill();
      }
      g.restore();
    }
  }

  /* ───────── Sprites (trees and foreground plants) ───────── */

  private ensureSprites(v: View) {
    const k = this.spec.tiles ? quant(Math.min(this.spec.maxS, Math.max(0.5, v.z * v.dpr))) : Math.max(0.5, Math.min(1, v.z * v.dpr));
    if (Math.abs(k - this.spriteK) < 0.01) return;
    this.spriteK = k;
    for (const s of this.sprites) {
      const [x0, y0, x1, y1] = s.b;
      free(s.c);
      s.c = canvas((x1 - x0) * k, (y1 - y0) * k);
      const g = ctx2d(s.c);
      g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
      paintDeco(g, s.it.d, this.scene.c, s.it.seed);
    }
  }

  private drawSprite(g: G, s: Sprite, t: number) {
    const [x0, y0, x1, y1] = s.b, bx = s.it.d.x, by = y1;
    if (!this.spec.sway || !s.sway) { g.drawImage(s.c, x0, y0, x1 - x0, y1 - y0); return; }
    const sk = Math.sin(t * 0.9 + bx * 0.013) * s.sway + Math.sin(t * 2.3 + bx) * s.sway * 0.2;
    g.save();
    g.translate(bx, by);
    g.transform(1, 0, -sk, 1, 0, 0); // skew: the top moves, the base stays planted
    g.drawImage(s.c, x0 - bx, y0 - by, x1 - x0, y1 - y0);
    g.restore();
  }

  /* ───────── Terrain cache ───────── */

  private drawTerrain(g: G, v: View, box: Box) {
    const m = this.map;
    if (!this.base) { paintStatic(g, this.scene, box); return; } // thumbnails paint directly
    const bs = this.spec.baseS;
    const cl: Box = [Math.max(0, box[0]), Math.max(0, box[1]), Math.min(m.w, box[2]), Math.min(m.h, box[3])];
    if (!this.spec.tiles) {
      if (cl[2] > cl[0] && cl[3] > cl[1])
        g.drawImage(this.base, cl[0] * bs, cl[1] * bs, (cl[2] - cl[0]) * bs, (cl[3] - cl[1]) * bs, cl[0], cl[1], cl[2] - cl[0], cl[3] - cl[1]);
      return;
    }
    const s = quant(Math.min(this.spec.maxS, Math.max(0.5, v.z * v.dpr)));
    let budget = this.spec.tilesPerFrame;
    const i0 = Math.floor(cl[0] / TILE), i1 = Math.floor((cl[2] - 0.01) / TILE), j0 = Math.floor(cl[1] / TILE), j1 = Math.floor((cl[3] - 0.01) / TILE);
    const P = 2, E = 0.6; // padding painted around each tile, and overlap when drawing (hides seams)
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const key = `${s}:${i}:${j}`, tx = i * TILE, ty = j * TILE;
        let tile = this.tiles.get(key);
        if (!tile && budget > 0) {
          budget--;
          const c = canvas((TILE + P * 2) * s, (TILE + P * 2) * s), tg = ctx2d(c);
          tg.setTransform(s, 0, 0, s, -(tx - P) * s, -(ty - P) * s);
          paintStatic(tg, this.scene, [tx - P, ty - P, tx + TILE + P, ty + TILE + P]);
          tile = { c, used: 0 };
          this.tiles.set(key, tile);
        }
        const w = Math.min(TILE, m.w - tx), h = Math.min(TILE, m.h - ty);
        if (tile) {
          tile.used = this.frame;
          g.drawImage(tile.c, (P - E) * s, (P - E) * s, (w + E * 2) * s, (h + E * 2) * s, tx - E, ty - E, w + E * 2, h + E * 2);
        } else g.drawImage(this.base, tx * bs, ty * bs, w * bs, h * bs, tx, ty, w, h);
      }
    // Keep the cache within budget: drop the least recently used tiles (and any at an old zoom).
    const cap = Math.max(8, Math.floor(TILE_BUDGET / (((TILE + 4) * s) ** 2 * 4)));
    if (this.tiles.size > cap) {
      const old = [...this.tiles.entries()].filter(([, t]) => t.used !== this.frame).sort((a, b) => a[1].used - b[1].used);
      for (const [k, t] of old.slice(0, this.tiles.size - cap)) { free(t.c); this.tiles.delete(k); }
    }
  }

  /* ───────── Particles (pooled, wrapped around the camera) ───────── */

  private drawParticles(g: G, box: Box, t: number, dt: number) {
    const W = box[2] - box[0], H = box[3] - box[1];
    for (const p of this.parts) {
      const want = Math.round(p.max * this.density);
      const big = p.kind === "mist";
      const m = big ? 260 : 40;
      for (let i = p.live; i < want; i++) {
        p.x[i] = box[0] - m + Math.random() * (W + 2 * m); p.y[i] = box[1] - m + Math.random() * (H + 2 * m);
        p.ph[i] = Math.random() * 100; p.sz[i] = Math.random(); p.v[i] = 0.5 + Math.random();
      }
      p.live = want;
      const path = new Path2D();
      for (let i = 0; i < p.live; i++) {
        const sp = p.v[i]!, ph = (p.ph[i]! += dt);
        let x = p.x[i]!, y = p.y[i]!;
        switch (p.kind) {
          case "snow": x += (Math.sin(ph * 0.8) * 20 + 14) * dt; y += (38 + sp * 30) * dt; break;
          case "leaf": x += (24 + Math.sin(ph * 1.4) * 30) * dt; y += (22 + sp * 18) * dt; break;
          case "dust": x += (40 + sp * 50) * dt; y += Math.sin(ph * 1.7) * 10 * dt; break;
          case "mist": x += (6 + sp * 8) * dt; break;
          case "spore": x += Math.sin(ph * 0.7 + i) * 12 * dt; y += Math.cos(ph * 0.5 + i) * 10 * dt - 4 * dt; break;
          case "ember": x += Math.sin(ph * 2 + i) * 16 * dt; y -= (30 + sp * 35) * dt; break;
        }
        // Wrap around the camera so density stays constant whatever the map size.
        if (x < box[0] - m) x += W + 2 * m; else if (x > box[2] + m) x -= W + 2 * m;
        if (y < box[1] - m) y += H + 2 * m; else if (y > box[3] + m) y -= H + 2 * m;
        p.x[i] = x; p.y[i] = y;
        const sz = p.sz[i]!;
        if (p.kind === "leaf") { path.moveTo(x + 5, y); path.ellipse(x, y, 4 + sz * 2, 2, ph * 2 + i, 0, Math.PI * 2); }
        else if (p.kind === "mist") continue;
        else { const r = p.kind === "snow" ? 1.6 + sz * 2 : p.kind === "spore" ? 1.4 + sz * 1.4 : 1 + sz * 1.6; path.moveTo(x + r, y); path.arc(x, y, r, 0, Math.PI * 2); }
      }
      if (p.kind === "mist") {
        for (let i = 0; i < p.live; i++) {
          const x = p.x[i]!, y = p.y[i]!, r = 120 + p.sz[i]! * 140;
          const grad = g.createRadialGradient(x, y, 0, x, y, r);
          grad.addColorStop(0, rgba(p.color, 0.1)); grad.addColorStop(1, rgba(p.color, 0));
          g.fillStyle = grad; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
        continue;
      }
      const glow = p.kind === "spore" || p.kind === "ember";
      if (glow) g.globalCompositeOperation = "lighter";
      g.fillStyle = rgba(p.color, p.kind === "dust" ? 0.45 : glow ? 0.5 + 0.3 * Math.sin(t * 2) : 0.9);
      g.fill(path);
      if (p.kind === "leaf") { g.lineWidth = 0.8; g.strokeStyle = "rgba(42,29,22,0.6)"; g.stroke(path); }
      g.globalCompositeOperation = "source-over";
    }
  }

  /* ───────── Lighting ───────── */

  private lightLevel(l: Light, t: number) {
    switch (l.mode) {
      case "flicker": return flicker(t, l.x);
      case "blink": return (t * 0.8 + l.x * 0.001) % 1 < 0.5 ? 1 : 0.15;
      case "pulse": return 0.75 + 0.25 * Math.sin(t * 1.6 + l.x);
      default: return 1;
    }
  }

  private drawLighting(g: G, v: View, t: number, actors: readonly Actor[]) {
    const amb = this.map.lighting.ambient;
    const box = viewBox(v);
    const pad = 200;
    const vis = this.lights.filter((l) => l.x > box[0] - pad && l.x < box[2] + pad && l.y > box[1] - pad && l.y < box[3] + pad);
    if (amb) {
      if (!this.spec.lights) {
        // Low quality: a lighter flat tint, no holes, so players stay readable.
        g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
        g.globalAlpha = 0.5; g.fillStyle = amb; g.fillRect(0, 0, v.w, v.h); g.globalAlpha = 1;
      } else {
        // Ambient darkness with holes cut by every light and around every player, at quarter resolution.
        const q = 4, lw = Math.ceil(v.w / q), lh = Math.ceil(v.h / q);
        if (!this.lightCanvas) this.lightCanvas = canvas(lw, lh);
        const lc = this.lightCanvas;
        if (lc.width !== lw || lc.height !== lh) { lc.width = lw; lc.height = lh; }
        const lg = ctx2d(lc);
        lg.globalCompositeOperation = "source-over";
        lg.clearRect(0, 0, lw, lh);
        lg.fillStyle = amb; lg.fillRect(0, 0, lw, lh);
        lg.globalCompositeOperation = "destination-out";
        const hole = (wx: number, wy: number, r: number, a: number) => {
          const sx = ((wx - v.cx) * v.z + v.w / 2) / q, sy = ((wy - v.cy) * v.z + v.h / 2) / q, sr = (r * v.z) / q;
          const grad = lg.createRadialGradient(sx, sy, 0, sx, sy, sr);
          grad.addColorStop(0, `rgba(0,0,0,${a})`); grad.addColorStop(1, "rgba(0,0,0,0)");
          lg.fillStyle = grad; lg.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
        };
        for (const l of vis) hole(l.x, l.y, l.r * 1.3, 0.95 * this.lightLevel(l, t));
        for (const a of actors) hole(a.x, a.y, 150, 0.85);
        g.setTransform(v.dpr, 0, 0, v.dpr, 0, 0);
        g.drawImage(lc, 0, 0, v.w, v.h);
      }
    }
    if (!this.spec.lights || !vis.length) return;
    worldTransform(g, v);
    g.globalCompositeOperation = "lighter";
    for (const l of vis) {
      const k = this.lightLevel(l, t), r = l.r * (0.9 + 0.1 * k);
      const grad = g.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      grad.addColorStop(0, `rgba(${l.rgb},${0.28 * k})`); grad.addColorStop(1, `rgba(${l.rgb},0)`);
      g.fillStyle = grad; g.fillRect(l.x - r, l.y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = "source-over";
  }
}

/* ───────── Thumbnails ───────── */

const thumbs = new Map<string, string>();
/** An illustrated overview of the whole map, cached as a data URL. */
export function mapThumbnail(m: MapDefinition, w = 320, h = 180): string {
  const key = `${m.id}:${w}x${h}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const c = canvas(w, h), g = ctx2d(c);
  const env = new EnvRenderer(m, "thumb");
  const v: View = { cx: m.w / 2, cy: m.h / 2, z: Math.max(w / m.w, h / m.h), w, h, dpr: 1 };
  env.drawBack(g, v, 0);
  env.drawFront(g, v, 0, 16, []);
  env.dispose();
  const url = c.toDataURL("image/png");
  free(c);
  thumbs.set(key, url);
  return url;
}

/* ───────── Settings ───────── */

const KEY = "batas-militar:gfx";
export function loadQuality(): Quality {
  try {
    const q = localStorage.getItem(KEY);
    if (q === "low" || q === "medium" || q === "high") return q;
  } catch { /* storage blocked */ }
  return (navigator.hardwareConcurrency ?? 4) <= 2 ? "low" : "high";
}
export function saveQuality(q: Quality) {
  try { localStorage.setItem(KEY, q); } catch { /* storage blocked */ }
}
