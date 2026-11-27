import type Phaser from "phaser";
import type { Move } from "../types";
import { BLEND } from "./animator";
import { FRAME_SCALE } from "./frameScale";

/**
 * Sprite-sheet animation for the runner. Each sheet is a strip of equal-size frames (see ../sprites/).
 * `ground` sheets are anchored at the feet, `air` sheets at the middle of the body.
 * To change which sheet plays for a move, edit `pick` below.
 */
export type SheetName =
  | "idle" | "run" | "air" | "crouch" | "roll" | "cartwheel" | "spring" | "dive" | "boost" | "slide" | "flip" | "combo";

interface Sheet {
  url: string;
  fw: number;
  fh: number;
  n: number;
  scale: number;
  ground: boolean;
}
/** Each sheet's scale is set so the character's body covers the same area on screen, so every move looks the same size. */
export const SHEETS: Record<SheetName, Sheet> = {
  idle: { url: new URL("../sprites/idle.png", import.meta.url).href, fw: 115, fh: 126, n: 8, scale: 0.52, ground: true },
  run: { url: new URL("../sprites/run.png", import.meta.url).href, fw: 120, fh: 129, n: 8, scale: 0.58, ground: true },
  air: { url: new URL("../sprites/air.png", import.meta.url).href, fw: 118, fh: 108, n: 8, scale: 0.61, ground: false },
  crouch: { url: new URL("../sprites/crouch.png", import.meta.url).href, fw: 92, fh: 80, n: 8, scale: 0.72, ground: true },
  roll: { url: new URL("../sprites/roll.png", import.meta.url).href, fw: 115, fh: 79, n: 8, scale: 0.71, ground: true },
  cartwheel: { url: new URL("../sprites/cartwheel.png", import.meta.url).href, fw: 109, fh: 91, n: 8, scale: 0.69, ground: false },
  spring: { url: new URL("../sprites/spring.png", import.meta.url).href, fw: 131, fh: 119, n: 8, scale: 0.64, ground: false },
  dive: { url: new URL("../sprites/dive.png", import.meta.url).href, fw: 138, fh: 97, n: 8, scale: 0.69, ground: false },
  boost: { url: new URL("../sprites/boost.png", import.meta.url).href, fw: 209, fh: 186, n: 9, scale: 0.32, ground: true },
  slide: { url: new URL("../sprites/slide.png", import.meta.url).href, fw: 369, fh: 181, n: 8, scale: 0.33, ground: true },
  combo: { url: new URL("../sprites/combo.png", import.meta.url).href, fw: 176, fh: 194, n: 55, scale: 0.429, ground: true },
  flip: { url: new URL("../sprites/flip.png", import.meta.url).href, fw: 216, fh: 277, n: 11, scale: 0.365, ground: false },
};
const key = (s: SheetName) => `gl-sp-${s}`;

/** Call from a scene's `preload`. */
export function loadSprites(scene: Phaser.Scene) {
  scene.load.on("loaderror", (f: { src: string }) => console.error("[ghost-line] sprite failed to load:", f.src));
  for (const [name, s] of Object.entries(SHEETS) as [SheetName, Sheet][])
    if (!scene.textures.exists(key(name)))
      scene.load.spritesheet(key(name), s.url, { frameWidth: s.fw, frameHeight: s.fh });
}

const STRIDE = 22;
const RUN_FRAMES = 7;
/** The tumbling pass (cartwheel, two back handsprings, back flip) plays as one animation: seconds per part, as in the runner. */
const PASS: [Move, number][] = [["cartwheel", 0.46], ["tumble", 0.5], ["tumble", 0.5], ["backtuck", 0.6]];
const PASS_LEN = PASS.reduce((a, [, d]) => a + d, 0);
const frac = (t: number) => t - Math.floor(t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Picks the sheet and frame for a move. `p` is the move's progress (or fall speed in the air), `dist` the distance run. */
export function pick(move: Move, p: number, dist: number, time: number, boost: boolean, stage = 0): [SheetName, number] {
  const at = (s: SheetName, t: number, lo = 0, hi = SHEETS[s].n - 1): [SheetName, number] => [
    s,
    Math.min(hi, lo + Math.floor(clamp01(t) * (hi - lo + 1))),
  ];
  const loop = (s: SheetName, t: number, n = SHEETS[s].n): [SheetName, number] => [s, Math.floor(frac(t) * n)];
  switch (move) {
    case "idle":
    case "respawn":
    case "finish":
      return loop("idle", time * 0.9);
    case "run":
    case "wallrun":
      // The run sheet's last frame is a crouch, which reads as a stutter once a stride, so the loop skips it.
      return boost ? loop("boost", dist / (STRIDE * 9)) : loop("run", dist / (STRIDE * RUN_FRAMES), RUN_FRAMES);
    case "jump":
    case "fall":
      // Takeoff, tuck at the top, then reaching for the ground.
      return at("air", (p + 620) / 1240, 1, 7);
    case "land":
    case "stumble":
    case "climb":
      return at("crouch", p);
    case "roll":
    case "speedroll":
      return at("roll", p);
    case "slide":
    case "powerslide":
      return at("slide", p);
    case "vault":
      return at("dive", p, 0, 3);
    case "kong":
    case "dashvault":
      return at("dive", p, 2, 5);
    case "bonk":
      return at("dive", p, 5, 7);
    case "flip":
    case "swallow":
      return at("flip", p);
    case "backflip":
      return at("flip", 1 - p);
    case "doubleflip":
      return at("flip", frac(p * 2));
    case "tripleswallow":
      return at("flip", frac(p * 3));
    case "cartwheel":
    case "tumble":
    case "backtuck": {
      let before = 0;
      for (let i = 0; i < stage; i++) before += PASS[i]![1];
      return at("combo", (before + clamp01(p) * PASS[stage]![1]) / PASS_LEN);
    }
    case "handspring":
      return at("spring", p);
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Sheets that lean with speed changes. Tricks already rotate in their drawings, so they're left alone. */
const LEANS = new Set<SheetName>(["run", "boost", "idle", "crouch"]);
/** How far below the feet (or above, for air sheets) the middle of the frame sits. */
function centerOffset(name: SheetName, scaleY: number) {
  const s = SHEETS[name];
  return s.ground ? 2 - (s.fh * scaleY) / 2 : -36;
}

/** One on-screen runner drawn from the sheets. */
export class SpriteRig {
  readonly img: Phaser.GameObjects.Image;
  /** The previous sheet, fading out underneath the new one so moves don't cut. */
  private readonly prev: Phaser.GameObjects.Image;
  private fadeLeft = 0;
  private fadeLen = 1;
  private dist = 0;
  private lastX: number | null = null;
  private lastY = 0;
  private time = 0;
  name: SheetName = "idle";
  frame = 0;
  private stage = 0;
  private lastMove: Move | null = null;
  private lastP = 0;
  /** Smoothed scale within a sheet, so frames drawn at slightly different sizes don't pulse. */
  private base = SHEETS.idle.scale;
  /** What's left of the jump in position when switching between feet-anchored and body-anchored sheets. */
  private carryY = 0;
  /** Squash (positive) and stretch (negative), as a spring kicked by landings. */
  private squash = 0;
  private squashV = 0;
  private stretch = 0;
  private lastVx = 0;
  private lastVy = 0;
  private surge = 0;
  private angle = 0;
  /** The fading image's height above the runner's feet, and where the feet were last frame. */
  private prevDy = 0;
  private lastGroundY = 0;
  constructor(scene: Phaser.Scene, depth: number) {
    this.prev = scene.add.image(0, 0, key("idle"), 0).setDepth(depth - 0.01).setVisible(false);
    this.img = scene.add.image(0, 0, key("idle"), 0).setDepth(depth);
  }
  /** Sets the sheet, frame and position for this frame. `y` is the ground under the runner's feet. */
  update(move: Move, p: number, x: number, y: number, dt: number, boost: boolean) {
    this.time += dt;
    const step = Math.max(dt, 0.001);
    let vx = 0,
      vy = 0;
    const jumped = this.lastX === null || Math.abs(x - this.lastX) >= 200 || move === "respawn";
    if (!jumped) {
      this.dist += Math.max(0, x - this.lastX!);
      vx = (x - this.lastX!) / step;
      vy = (y - this.lastY) / step;
    }
    this.lastX = x;
    this.lastY = y;
    if (move === "cartwheel") this.stage = 0;
    else if (move === "tumble") {
      if (this.lastMove === "cartwheel") this.stage = 1;
      else if (this.lastMove === "tumble" && p < this.lastP - 0.3) this.stage = 2;
      else if (this.lastMove !== "tumble") this.stage = 1;
    } else if (move === "backtuck") this.stage = 3;
    this.lastMove = move;
    this.lastP = p;
    const [name, frame] = pick(move, p, this.dist, this.time, boost, this.stage);
    const s = SHEETS[name];
    const want = FRAME_SCALE[name]?.[frame] ?? s.scale;

    if (jumped) {
      // A respawn starts clean: no fade, spring or lean carried over from where the runner was.
      this.squash = this.squashV = this.stretch = this.surge = this.angle = this.carryY = 0;
      this.fadeLeft = 0;
      this.base = want;
    } else if (name !== this.name) {
      // Hand the old sheet to the fading image, and glide from where the body was.
      this.prev
        .setTexture(this.img.texture.key, this.img.frame.name)
        .setOrigin(0.5, 0.5)
        .setScale(this.img.scaleX, this.img.scaleY)
        .setAngle(this.img.angle)
        .setVisible(true);
      this.prevDy = this.img.y - this.lastGroundY;
      this.fadeLen = Math.max(0.04, BLEND[move] * 1.2);
      this.fadeLeft = this.fadeLen;
      this.carryY = this.img.y - (y + centerOffset(name, want));
      this.base = want;
    } else this.base += (want - this.base) * Math.min(1, dt * 20);

    // Landing: falling fast, then suddenly not, kicks the squash spring.
    if (s.ground && this.lastVy > 150 && vy < this.lastVy * 0.4) this.squashV += Math.min(this.lastVy, 1200) * 0.0045;
    this.squashV += (-this.squash * 300 - this.squashV * 17) * dt;
    this.squash = clamp(this.squash + this.squashV * dt, -0.2, 0.25);
    // Air sheets stretch with speed, so jumps and drops read as fast.
    const stretchTo = s.ground ? 0 : clamp(Math.abs(vy) / 9000, 0, 0.07);
    this.stretch += (stretchTo - this.stretch) * Math.min(1, dt * 12);
    // Lean into speeding up, back when slowing.
    const ax = (vx - this.lastVx) / step;
    this.surge += (clamp(ax * 0.012, -12, 12) - this.surge) * Math.min(1, dt * 7);
    this.lastVx = vx;
    this.lastVy = vy;
    const angleTo = name === "air" ? clamp(vy / 80, -7, 7) : LEANS.has(name) ? this.surge * 0.5 : 0;
    this.angle += (angleTo - this.angle) * Math.min(1, dt * 10);

    const sy = this.base * (1 - this.squash + this.stretch);
    const sx = this.base * (1 + this.squash * 0.6 - this.stretch * 0.5);
    this.carryY *= Math.max(0, 1 - dt * 16);
    if (Math.abs(this.carryY) < 0.1) this.carryY = 0;
    this.name = name;
    this.frame = frame;
    this.img
      .setTexture(key(name), frame)
      .setOrigin(0.5, 0.5)
      .setScale(sx, sy)
      .setAngle(this.angle)
      .setPosition(x, y + centerOffset(name, sy) + this.carryY);

    if (this.fadeLeft > 0) {
      this.fadeLeft -= dt;
      const k = Math.max(0, this.fadeLeft / this.fadeLen);
      // Follow the runner so the fading pose doesn't get left behind at speed.
      this.prev.setPosition(x, y + this.prevDy);
      this.prev.setAlpha(this.img.alpha * k * k);
      if (this.img.isTinted) this.prev.setTint(this.img.tintTopLeft);
      else this.prev.clearTint();
      this.prev.setVisible(k > 0 && this.img.visible);
    } else this.prev.setVisible(false);
    this.lastGroundY = y;
  }
  /** Shows one frame as-is, with no smoothing. Used by the speed echoes. */
  show(name: SheetName, frame: number, x: number, y: number) {
    const sc = FRAME_SCALE[name]?.[frame] ?? SHEETS[name].scale;
    this.img
      .setTexture(key(name), frame)
      .setOrigin(0.5, 0.5)
      .setScale(sc)
      .setPosition(x, y + centerOffset(name, sc));
  }
  destroy() {
    this.prev.destroy();
    this.img.destroy();
  }
}
