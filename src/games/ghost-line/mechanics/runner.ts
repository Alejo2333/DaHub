import type { Move } from "../types";
import {
  platformAfter,
  platformAt,
  type Course,
  type Obstacle,
} from "./course";

export const STEP = 1 / 60;
export const RUN_SPEED = 340,
  /** Clean moves build flow, and full flow adds this much speed. */
  FLOW_SPEED = 70,
  GRAVITY = 1900,
  JUMP_V = 620,
  STAND_H = 78,
  SLIDE_H = 30;
const ACCEL = 900,
  HALF_W = 10,
  BUFFER = 0.12,
  COYOTE = 0.09,
  HARD_LANDING = 700,
  SLIDE_TIME = 0.7,
  LAND_TIME = 0.14,
  ROLL_TIME = 0.5,
  STUMBLE_SPEED = 130,
  BONK_TIME = 0.4,
  RESPAWN_TIME = 0.6,
  /** How far ahead a jump press turns into a vault or a climb. */
  VAULT_REACH = 140,
  /** An early press waits until here, so the hand always lands on the block. */
  VAULT_TAKEOFF = 70,
  CLIMB_REACH_X = 110,
  /** How far below a ledge a runner in the air can still grab it. */
  CLIMB_REACH_Y = 170,
  FALL_LIMIT = 420;

export interface Input {
  jump: boolean;
  slide: boolean;
}
/** x and y are where the feet are. */
export interface Runner {
  x: number;
  y: number;
  vx: number;
  vy: number;
  move: Move;
  /** Seconds in the current move. */
  t: number;
  dur: number;
  grounded: boolean;
  flow: number;
  coyote: number;
  jumpBuf: number;
  slideBuf: number;
  lastGroundY: number;
  /** The next obstacle, and whether it has already been hit. */
  next: number;
  hitNext: boolean;
  /** The next checkpoint to reach. */
  nextCheck: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Where a climb's rise ends, and how high its first leap goes. */
  ledgeX: number;
  leapY: number;
  /** A vault was pressed and is waiting for its takeoff point. */
  vaultSoon: boolean;
  arc: number;
  hits: number;
  falls: number;
  done: boolean;
}

export function newRunner(): Runner {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    move: "idle",
    t: 0,
    dur: 0,
    grounded: true,
    flow: 0,
    coyote: 0,
    jumpBuf: 0,
    slideBuf: 0,
    lastGroundY: 0,
    next: 0,
    hitNext: false,
    nextCheck: 0,
    from: { x: 0, y: 0 },
    to: { x: 0, y: 0 },
    ledgeX: 0,
    leapY: 0,
    vaultSoon: false,
    arc: 0,
    hits: 0,
    falls: 0,
    done: false,
  };
}
const set = (r: Runner, move: Move, dur = 0) => {
  r.move = move;
  r.t = 0;
  r.dur = dur;
};
const speedOf = (r: Runner) => RUN_SPEED + FLOW_SPEED * r.flow;
const ease = (p: number) => p * p * (3 - 2 * p);

function startVault(r: Runner, ob: Obstacle) {
  const x1 = ob.x + ob.w + 45;
  r.from = { x: r.x, y: r.y };
  r.to = { x: x1, y: r.y };
  r.vaultSoon = false;
  r.arc = ob.h * 0.62;
  r.grounded = false;
  r.vy = 0;
  set(r, "vault", (x1 - r.x) / Math.max(speedOf(r), r.vx));
}
function startClimb(r: Runner, ledgeX: number, topY: number, slow = 1) {
  r.from = { x: r.x, y: r.y };
  r.to = { x: ledgeX + 34, y: topY };
  r.ledgeX = ledgeX - 14;
  // A quick leap gets the hands to the ledge, then the arms do the slow pull.
  r.leapY = Math.min(r.y, topY + 82);
  r.grounded = false;
  r.vy = 0;
  set(r, "climb", (0.42 + (r.y - topY) * 0.0016) * slow);
}
function respawn(r: Runner, c: Course) {
  const cp = c.checkpoints[r.nextCheck - 1] ?? { x: 0, y: 0 };
  r.x = cp.x;
  r.y = cp.y;
  r.vx = 0;
  r.vy = 0;
  r.grounded = true;
  r.flow = 0;
  r.falls++;
  r.lastGroundY = cp.y;
  r.hitNext = false;
  r.vaultSoon = false;
  r.next = c.obstacles.findIndex((o) => o.x + o.w > cp.x);
  if (r.next < 0) r.next = c.obstacles.length;
  set(r, "respawn", RESPAWN_TIME);
}
/** Moves past obstacles and checkpoints the runner has cleared. */
function passMarkers(r: Runner, c: Course) {
  for (;;) {
    const ob = c.obstacles[r.next];
    if (!ob || ob.x + ob.w + HALF_W >= r.x) break;
    if (!r.hitNext) r.flow = Math.min(1, r.flow + 0.2);
    r.next++;
    r.hitNext = false;
  }
  for (;;) {
    const cp = c.checkpoints[r.nextCheck];
    if (!cp || !r.grounded || r.x < cp.x) break;
    r.nextCheck++;
  }
  if (r.x >= c.finishX && !r.done) {
    r.done = true;
    if (r.grounded) set(r, "finish");
  }
}
/** A mistake costs flow and speed. A block becomes a clumsy scramble over it, and a bar a slow slide under it. */
function hit(r: Runner, ob: Obstacle) {
  r.hitNext = true;
  r.hits++;
  r.flow = 0;
  r.vx = Math.min(r.vx, STUMBLE_SPEED);
  r.vaultSoon = false;
  if (ob.kind === "block") {
    r.from = { x: r.x, y: r.y };
    r.to = { x: ob.x + ob.w + 22, y: ob.y };
    r.arc = ob.h + 6;
    r.grounded = false;
    r.vy = 0;
    set(r, "stumble", Math.max(0.35, (r.to.x - r.x) / STUMBLE_SPEED));
  } else if (r.grounded) {
    set(r, "slide", Math.max(0.35, (ob.x + ob.w + 40 - r.x) / STUMBLE_SPEED));
  }
}
function checkObstacle(r: Runner, c: Course) {
  const ob = c.obstacles[r.next];
  if (!ob || r.hitNext) return;
  if (r.x + HALF_W < ob.x || r.x - HALF_W > ob.x + ob.w) return;
  if (ob.kind === "block") {
    // Coming down over the back half of a block is forgiven: that jump was good enough.
    const pastMiddle = !r.grounded && r.x > ob.x + ob.w / 2;
    if (r.y > ob.y - ob.h + 6 && !pastMiddle) hit(r, ob);
  } else {
    const height = r.move === "slide" ? SLIDE_H : STAND_H;
    if (r.y - height < ob.y - ob.h) hit(r, ob);
  }
}
/** Stops the runner at a rooftop wall ahead. Returns true if that started a climb or a bonk. */
function checkFace(r: Runner, c: Course) {
  const p = platformAfter(c, r.x);
  if (!p || p.x0 > r.x + HALF_W || p.y >= r.y - 1) return false;
  if (r.grounded) {
    r.x = p.x0 - HALF_W;
    r.vx = 0;
    r.flow = 0;
    r.hits++;
    set(r, "bonk", BONK_TIME);
    return true;
  }
  if (r.y - p.y <= CLIMB_REACH_Y) {
    r.x = p.x0 - HALF_W;
    startClimb(r, p.x0, p.y);
    return true;
  }
  r.x = p.x0 - HALF_W;
  r.vx = 0;
  return false;
}
/** A jump press turns into whatever fits: a vault, a climb, or a plain jump. */
function pressJump(r: Runner, c: Course) {
  r.jumpBuf = 0;
  r.coyote = 0;
  const ob = c.obstacles[r.next];
  if (
    r.grounded &&
    ob?.kind === "block" &&
    !r.hitNext &&
    ob.x - r.x > 0 &&
    ob.x - r.x <= VAULT_REACH
  ) {
    if (ob.x - r.x <= VAULT_TAKEOFF) startVault(r, ob);
    else r.vaultSoon = true;
    return;
  }
  const p = platformAfter(c, r.x);
  if (
    r.grounded &&
    p &&
    p.y < r.y - 1 &&
    p.x0 - r.x <= CLIMB_REACH_X &&
    r.y - p.y <= CLIMB_REACH_Y &&
    platformAt(c, p.x0 - 1)
  ) {
    r.vx = Math.max(r.vx, RUN_SPEED * 0.6);
    return startClimb(r, p.x0, p.y);
  }
  r.grounded = false;
  r.vy = -JUMP_V;
  set(r, "jump");
}

/** Advances the runner by one fixed step. Every player's own browser runs this for their own runner. */
export function step(r: Runner, c: Course, input: Input, dt = STEP) {
  r.t += dt;
  if (input.jump) r.jumpBuf = BUFFER;
  else r.jumpBuf = Math.max(0, r.jumpBuf - dt);
  if (input.slide) r.slideBuf = BUFFER;
  else r.slideBuf = Math.max(0, r.slideBuf - dt);
  if (r.move === "idle") return;

  if (r.move === "vault" || r.move === "climb" || r.move === "stumble") {
    const p = Math.min(1, r.t / r.dur);
    if (r.move !== "climb") {
      r.x = r.from.x + (r.to.x - r.from.x) * p;
      r.y =
        r.from.y + (r.to.y - r.from.y) * p - r.arc * Math.sin(Math.PI * p);
    } else if (p < 0.72) {
      r.x = r.from.x + (r.ledgeX - r.from.x) * ease(Math.min(1, p / 0.2));
      r.y =
        p < 0.2
          ? r.from.y + (r.leapY - r.from.y) * ease(p / 0.2)
          : r.leapY + (r.to.y + 26 - r.leapY) * ease((p - 0.2) / 0.52);
    } else {
      const q = ease((p - 0.72) / 0.28);
      r.x = r.ledgeX + (r.to.x - r.ledgeX) * q;
      r.y = r.to.y + 26 * (1 - q);
    }
    if (p >= 1) {
      r.x = r.to.x;
      r.y = r.to.y;
      r.grounded = true;
      r.lastGroundY = r.y;
      r.vx = Math.max(r.vx, speedOf(r) * 0.85);
      if (r.move === "climb") r.flow = Math.min(1, r.flow + 0.2);
      if (r.move === "stumble") r.vx = STUMBLE_SPEED;
      set(r, "run");
    }
    passMarkers(r, c);
    return;
  }
  if (r.move === "bonk") {
    if (r.t >= r.dur) {
      const p = platformAfter(c, r.x)!;
      startClimb(r, p.x0, p.y, 1.4);
    }
    return;
  }
  if (r.move === "respawn") {
    if (r.t >= r.dur) set(r, "run");
    return;
  }

  // Timed moves ending on the ground.
  if (r.t >= r.dur && r.dur > 0 && r.grounded) set(r, "run");

  const target = r.done
    ? 0
    : r.move === "slide" && r.hitNext
      ? STUMBLE_SPEED
      : speedOf(r) * (r.move === "roll" ? 0.94 : 1);
  const accel = r.done ? 500 : ACCEL;
  r.vx += Math.sign(target - r.vx) * Math.min(accel * dt, Math.abs(target - r.vx));
  r.x += r.vx * dt;

  if (r.grounded) {
    if (checkFace(r, c)) return passMarkers(r, c);
    const ground = platformAt(c, r.x);
    if (!ground || ground.y > r.y + 1) {
      r.grounded = false;
      r.vy = 0;
      r.coyote = COYOTE;
      if (r.done) r.move = "fall";
      else set(r, "fall");
    } else {
      r.lastGroundY = r.y = ground.y;
      if (!r.done && (r.move === "run" || r.move === "land")) {
        const ob = c.obstacles[r.next];
        if (r.vaultSoon && ob && ob.x - r.x <= VAULT_TAKEOFF)
          startVault(r, ob);
        else if (r.jumpBuf > 0 && !r.vaultSoon) pressJump(r, c);
        else if (r.slideBuf > 0) {
          r.slideBuf = 0;
          set(r, "slide", SLIDE_TIME);
        }
      }
    }
  }
  if (!r.grounded && (r.move === "jump" || r.move === "fall")) {
    r.coyote = Math.max(0, r.coyote - dt);
    if (r.jumpBuf > 0 && r.coyote > 0) pressJump(r, c);
    const prevY = r.y;
    r.vy += GRAVITY * dt;
    r.y += r.vy * dt;
    if (r.vy > 0 && r.move === "jump") r.move = "fall";
    if (checkFace(r, c)) return passMarkers(r, c);
    const ground = platformAt(c, r.x);
    if (ground && r.vy >= 0 && prevY <= ground.y + 1 && r.y >= ground.y) {
      r.y = ground.y;
      r.lastGroundY = ground.y;
      r.grounded = true;
      if (r.vy > HARD_LANDING) set(r, "roll", ROLL_TIME);
      else set(r, "land", LAND_TIME);
      r.vy = 0;
    } else if (r.y > r.lastGroundY + FALL_LIMIT) {
      return respawn(r, c);
    }
  }
  checkObstacle(r, c);
  passMarkers(r, c);
}

/** What the animator needs alongside the move: progress through a timed move, or the fall speed for moves in the air. */
export function animParam(r: Runner) {
  if (r.move === "jump" || r.move === "fall") return r.vy;
  return r.dur > 0 ? Math.min(1, r.t / r.dur) : r.t;
}
export const start = (r: Runner) => {
  if (r.move === "idle") set(r, "run");
};
