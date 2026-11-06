import { platformAfter, platformAt, type Course } from "../mechanics/course";
import { HANDSPRING_CONTACT } from "../mechanics/runner";
import type { Move } from "../types";
import {
  AIR,
  BONK,
  CLIMB,
  backTuckPose,
  cartwheelPose,
  CYCLE_LEN,
  DASH,
  FINISH,
  flipPose,
  FLAIL,
  handspringPose,
  IDLE,
  KONG,
  LAND,
  POWERSLIDE,
  RESPAWN,
  ROLL,
  runPose,
  sample,
  SLIDE,
  SWALLOW,
  STUMBLE,
  tripleSwallowPose,
  tumblePose,
  VAULT,
  WALLRUN,
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
  kong: 0.09,
  dashvault: 0.09,
  flip: 0.1,
  wallrun: 0.08,
  powerslide: 0.08,
  speedroll: 0.05,
  backflip: 0.1,
  doubleflip: 0.1,
  swallow: 0.12,
  tripleswallow: 0.1,
  cartwheel: 0.08,
  tumble: 0.08,
  backtuck: 0.08,
  handspring: 0.08,
};
const FLAIL_SPEED = 900,
  JUMP_V = 620,
  RUN_SPEED = 340,
  TOP_SPEED = 600;

export interface AnimInput {
  move: Move;
  /** From `animParam`: progress through a timed move, or the fall speed in the air. */
  p: number;
  x: number;
  y: number;
}
/** What the hands should grip for this move, worked out from the course so ghosts get it too. */
export function anchorFor(c: Course, move: Move, x: number): V | null {
  if (move === "vault" || move === "kong" || move === "dashvault") {
    const ob = c.obstacles.find(
      (o) => o.kind === "block" && o.x + o.w + 90 > x && o.x - 150 < x,
    );
    if (!ob) return null;
    const along = move === "kong" ? 0.5 : move === "dashvault" ? 0.75 : 0.4;
    return { x: ob.x + ob.w * along, y: ob.y - ob.h };
  }
  if (move === "climb" || move === "wallrun") {
    const here = platformAt(c, x),
      next = platformAfter(c, x);
    const p = next && next.x0 - x < 60 ? next : here;
    return p ? { x: p.x0 + 5, y: p.y } : null;
  }
  return null;
}

/** Picks the pose for the current move, flows between moves, and keeps planted feet fixed to the world. */
export class Animator {
  private dist = 0;
  private lastX: number | null = null;
  private lastY = 0;
  private move: Move | null = null;
  /** The difference between the old pose and the new one when a move starts. It fades out while the new move plays. */
  private carry: Pose | null = null;
  private fade = 1;
  private output: Pose | null = null;
  private lockF: V | null = null;
  private lockB: V | null = null;
  private flailT = 0;
  private headLag = 0;
  private sprint = 0;
  /** A spring on the hips, so landings and takeoffs carry through the body. */
  private dip = 0;
  private dipV = 0;
  private lastVy = 0;
  /** Lean from speeding up and slowing down. */
  private lastVx = 0;
  private surge = 0;

  private target(input: AnimInput): Pose {
    const { move, p } = input;
    switch (move) {
      case "idle":
        return sample(IDLE, 0);
      case "run":
        return runPose(this.dist / CYCLE_LEN, this.sprint);
      case "jump":
      case "fall":
        if (p > FLAIL_SPEED) return sample(FLAIL, this.flailT % 1);
        return sample(AIR, (p + JUMP_V) / (2 * JUMP_V));
      case "land":
        return sample(LAND, p);
      case "roll":
      case "speedroll":
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
      case "kong":
        return sample(KONG, p);
      case "dashvault":
        return sample(DASH, p);
      case "wallrun":
        return sample(WALLRUN, p);
      case "powerslide":
        return sample(POWERSLIDE, p);
      case "flip":
        return flipPose(p);
      case "backflip":
        return flipPose(p, -1);
      case "doubleflip":
        return flipPose(p, 2);
      case "swallow":
        return sample(SWALLOW, p);
      case "tripleswallow":
        return tripleSwallowPose(p);
      case "cartwheel":
        return cartwheelPose(p);
      case "tumble":
        return tumblePose(p, HANDSPRING_CONTACT);
      case "backtuck":
        return backTuckPose(p);
      case "handspring":
        return handspringPose(p, HANDSPRING_CONTACT);
    }
  }

  /** Call once a frame with the seconds since the last call. */
  update(input: AnimInput, dt: number, anchor: V | null): Joints {
    const { x, y, move } = input;
    const step = Math.max(dt, 0.001);
    let vx = 0,
      vy = 0;
    if (this.lastX !== null) {
      const dx = x - this.lastX;
      // A jump in position is a respawn, not running.
      if (Math.abs(dx) < 200) {
        this.dist += Math.max(0, dx);
        vx = dx / step;
        vy = (y - this.lastY) / step;
      }
    }
    this.lastX = x;
    this.lastY = y;
    this.flailT += dt * 3.5;
    const speedK = Math.min(1, Math.max(0, (vx - RUN_SPEED) / (TOP_SPEED - RUN_SPEED)));
    this.sprint += (speedK - this.sprint) * Math.min(1, dt * 5);

    // A sudden change in vertical speed, like touching down, kicks the spring.
    const dvy = Math.max(-1500, Math.min(1500, vy - this.lastVy));
    this.lastVy = vy;
    this.dipV += dvy * 0.012 - this.dip * 180 * dt - this.dipV * 16 * dt;
    this.dip = Math.max(-10, Math.min(10, this.dip + this.dipV * dt * 12));
    const dvx = vx - this.lastVx;
    this.lastVx = vx;
    this.surge += (Math.max(-12, Math.min(12, (dvx / step) * 0.012)) - this.surge) * Math.min(1, dt * 7);

    const want = this.target(input);
    if (move !== this.move) {
      this.carry = this.output ? this.difference(this.output, want) : null;
      this.fade = 0;
      this.move = move;
      this.lockF = this.lockB = null;
    }
    this.fade = Math.min(1, this.fade + dt / (BLEND[move] * 1.6));
    const pose = { ...want };
    if (this.carry && this.fade < 1) {
      // Smooth at both ends: the old motion carries on, then settles into the new move.
      const k = this.fade,
        w = (1 - k) * (1 - k) * (1 + 2 * k);
      for (const key of Object.keys(pose) as (keyof Pose)[])
        pose[key] += this.carry[key] * w;
      pose.grip = Math.min(1, Math.max(0, pose.grip));
    }
    const onFeet = move === "run" || move === "land" || move === "slide" || move === "powerslide";
    pose.py += this.dip * (onFeet ? 1 : 0.4);
    if (onFeet) pose.lean += this.surge;
    // The head lags the body a little, which reads as weight.
    const behind = ((((pose.lean - this.headLag + 180) % 360) + 360) % 360) - 180;
    this.headLag += behind * Math.min(1, dt * 14);
    pose.head -= Math.max(-14, Math.min(14, behind * 0.35));
    this.output = pose;

    let feet: { f: V | null; b: V | null } | undefined;
    if (pose.plant > 0.5) {
      this.lockF ??= { x: x + pose.fx, y: y + pose.fy };
      this.lockB ??= { x: x + pose.bx, y: y + pose.by };
      feet = { f: this.lockF, b: this.lockB };
    } else this.lockF = this.lockB = null;
    return solve(pose, x, y, anchor, feet);
  }

  /** What's left to fade out, turning the torso the short way so a finished roll doesn't spin backward. */
  private difference(from: Pose, to: Pose) {
    const out = {} as Pose;
    for (const key of Object.keys(to) as (keyof Pose)[]) out[key] = from[key] - to[key];
    // Spins can end many turns round, so all the angles take the short way back.
    for (const key of ["lean", "fp", "bp"] as const)
      out[key] -= 360 * Math.round(out[key] / 360);
    return out;
  }
}
