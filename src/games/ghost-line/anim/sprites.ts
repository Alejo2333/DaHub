import type Phaser from "phaser";
import type { Move } from "../types";
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
  const loop = (s: SheetName, t: number): [SheetName, number] => [s, Math.floor(frac(t) * SHEETS[s].n)];
  switch (move) {
    case "idle":
    case "respawn":
    case "finish":
      return loop("idle", time * 0.9);
    case "run":
    case "wallrun":
      return boost ? loop("boost", dist / (STRIDE * 9)) : loop("run", dist / (STRIDE * 8));
    case "jump":
    case "fall":
      return at("air", (p + 620) / 1240, 3, 5);
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

/** One on-screen runner drawn from the sheets. */
export class SpriteRig {
  readonly img: Phaser.GameObjects.Image;
  private dist = 0;
  private lastX: number | null = null;
  private time = 0;
  name: SheetName = "idle";
  frame = 0;
  private stage = 0;
  private lastMove: Move | null = null;
  private lastP = 0;
  constructor(scene: Phaser.Scene, depth: number) {
    this.img = scene.add.image(0, 0, key("idle"), 0).setDepth(depth);
  }
  /** Sets the sheet, frame and position for this frame. `y` is the ground under the runner's feet. */
  update(move: Move, p: number, x: number, y: number, dt: number, boost: boolean) {
    this.time += dt;
    if (this.lastX !== null && Math.abs(x - this.lastX) < 200) this.dist += Math.max(0, x - this.lastX);
    this.lastX = x;
    if (move === "cartwheel") this.stage = 0;
    else if (move === "tumble") {
      if (this.lastMove === "cartwheel") this.stage = 1;
      else if (this.lastMove === "tumble" && p < this.lastP - 0.3) this.stage = 2;
      else if (this.lastMove !== "tumble") this.stage = 1;
    } else if (move === "backtuck") this.stage = 3;
    this.lastMove = move;
    this.lastP = p;
    const [name, frame] = pick(move, p, this.dist, this.time, boost, this.stage);
    this.name = name;
    this.frame = frame;
    this.show(name, frame, x, y);
  }
  show(name: SheetName, frame: number, x: number, y: number) {
    const s = SHEETS[name];
    this.img.setTexture(key(name), frame).setScale(FRAME_SCALE[name]?.[frame] ?? s.scale);
    if (s.ground) this.img.setOrigin(0.5, 1).setPosition(x, y + 2);
    else this.img.setOrigin(0.5, 0.5).setPosition(x, y - 36);
  }
  destroy() {
    this.img.destroy();
  }
}
