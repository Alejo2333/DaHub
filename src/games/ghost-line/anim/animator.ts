import { platformAfter, platformAt, type Course } from "../mechanics/course";
import type { Move } from "../types";
import {
  AIR,
  BONK,
  CLIMB,
  CYCLE_LEN,
  FINISH,
  FLAIL,
  IDLE,
  LAND,
  mix,
  RESPAWN,
  ROLL,
  runPose,
  sample,
  SLIDE,
  STUMBLE,
  VAULT,
} from "./clips";
import type { V } from "./ik";
import { solve, type Joints, type Pose } from "./skeleton";

/** Crossfade time in seconds when entering each move. Quick moves blend quickly so they feel responsive. */
const BLEND: Record<Move, number> = {
  idle: 0.15,
  run: 0.14,
  jump: 0.07,
  fall: 0.14,
  land: 0.05,
  roll: 0.05,
  slide: 0.08,
  vault: 0.08,
  climb: 0.07,
  stumble: 0.06,
  bonk: 0.04,
  respawn: 0.01,
  finish: 0.2,
};
const FLAIL_SPEED = 900,
  JUMP_V = 620;

export interface AnimInput {
  move: Move;
  /** From `animParam`: progress through a timed move, or the fall speed in the air. */
  p: number;
  x: number;
  y: number;
  flow?: number;
}
/** What the hands should grip for this move, worked out from the course so ghosts get it too. */
export function anchorFor(c: Course, move: Move, x: number): V | null {
  if (move === "vault") {
    const ob = c.obstacles.find(
      (o) => o.kind === "block" && o.x + o.w + 60 > x && o.x - 150 < x,
    );
    return ob ? { x: ob.x + ob.w * 0.4, y: ob.y - ob.h } : null;
  }
  if (move === "climb") {
    const here = platformAt(c, x),
      next = platformAfter(c, x);
    const p = next && next.x0 - x < 60 ? next : here;
    return p ? { x: p.x0 + 5, y: p.y } : null;
  }
  return null;
}

/** Picks the pose for the current move, blends between moves, and keeps planted feet fixed to the world. */
export class Animator {
  private dist = 0;
  private lastX: number | null = null;
  private move: Move | null = null;
  private from: Pose | null = null;
  private fade = 1;
  private output: Pose | null = null;
  private lockF: V | null = null;
  private lockB: V | null = null;
  private flailT = 0;
  private headLag = 0;

  private target(input: AnimInput): Pose {
    const { move, p } = input;
    switch (move) {
      case "idle":
        return sample(IDLE, 0);
      case "run":
        return runPose(this.dist / CYCLE_LEN, input.flow ?? 0);
      case "jump":
      case "fall":
        if (p > FLAIL_SPEED) return sample(FLAIL, this.flailT % 1);
        return sample(AIR, (p + JUMP_V) / (2 * JUMP_V));
      case "land":
        return sample(LAND, p);
      case "roll":
        return sample(ROLL, p);
      case "slide":
        return sample(SLIDE, p);
      case "vault":
        return sample(VAULT, p);
      case "climb":
        return sample(CLIMB, p);
      case "stumble":
        return sample(STUMBLE, p);
      case "bonk":
        return sample(BONK, p);
      case "respawn":
        return RESPAWN;
      case "finish":
        return sample(FINISH, Math.min(1, p / 1.2));
    }
  }

  /** Call once a frame with the seconds since the last call. */
  update(input: AnimInput, dt: number, anchor: V | null): Joints {
    const { x, y, move } = input;
    if (this.lastX !== null) {
      const dx = x - this.lastX;
      // A jump in position is a respawn, not running.
      if (Math.abs(dx) < 200) this.dist += Math.max(0, dx);
    }
    this.lastX = x;
    this.flailT += dt * 3.5;
    if (move !== this.move) {
      if (this.output) {
        this.from = this.output;
        this.fade = 0;
      }
      this.move = move;
      this.lockF = this.lockB = null;
    }
    this.fade = Math.min(1, this.fade + dt / BLEND[move]);
    const want = this.target(input);
    const k = 1 - (1 - this.fade) * (1 - this.fade);
    const pose = this.from && k < 1 ? this.blend(this.from, want, k) : { ...want };
    // The head lags the body a little, which reads as weight.
    this.headLag += (pose.lean - this.headLag) * Math.min(1, dt * 14);
    pose.head -= (pose.lean - this.headLag) * 0.35;
    this.output = pose;

    let feet: { f: V | null; b: V | null } | undefined;
    if (pose.plant > 0.5) {
      this.lockF ??= { x: x + pose.fx, y: y + pose.fy };
      this.lockB ??= { x: x + pose.bx, y: y + pose.by };
      feet = { f: this.lockF, b: this.lockB };
    } else this.lockF = this.lockB = null;
    return solve(pose, x, y, anchor, feet);
  }

  /** Blends poses, turning the torso the short way so a finished roll doesn't spin backward. */
  private blend(a: Pose, b: Pose, k: number) {
    const lean = a.lean - 360 * Math.round((a.lean - b.lean) / 360);
    return mix({ ...a, lean }, b, k);
  }
}
