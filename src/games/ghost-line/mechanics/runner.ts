import type { Move } from "../types";
import {
  KONG_MIN_W,
  MAT_ZONE,
  PERFECT,
  platformAfter,
  platformAt,
  type Course,
  type Obstacle,
  type ZoneKind,
} from "./course";

export const STEP = 1 / 60;
export const RUN_SPEED = 340,
  /** Clean moves build flow, and full flow adds this much speed. */
  FLOW_SPEED = 70,
  /** The most speed trick bursts can add. */
  MAX_BOOST = 200,
  GRAVITY = 1900,
  JUMP_V = 620,
  STAND_H = 78,
  SLIDE_H = 30;
/** Time in the air for a jump that lands at the same height. */
const ACCEL = 900,
  HALF_W = 10,
  BUFFER = 0.12,
  COYOTE = 0.09,
  HARD_LANDING = 700,
  SLIDE_TIME = 0.7,
  LAND_TIME = 0.14,
  ROLL_TIME = 0.55,
  ROLL_SPEED = 0.72,
  SPEED_ROLL_TIME = 0.38,
  STUMBLE_SPEED = 130,
  BONK_TIME = 0.4,
  RESPAWN_TIME = 0.6,
  /** How far ahead a jump press turns into a vault or a climb. */
  VAULT_REACH = 120,
  /** An early press waits until here, so the hand always lands on the block. */
  VAULT_TAKEOFF = 70,
  CLIMB_REACH_X = 110,
  /** How far below a ledge a runner in the air can still grab it. */
  CLIMB_REACH_Y = 170,
  FALL_LIMIT = 420,
  /** Each trick adds this much speed, plus more for each trick in the combo. */
  BURST = 50,
  BURST_COMBO = 12,
  BOOST_DECAY = 26,
  /** A combo ends after this long without a trick. */
  COMBO_TIME = 5;

export const TRICK_NAMES = {
  kong: "Kong Vault",
  dashvault: "Dash Vault",
  flip: "Front Flip",
  wallrun: "Wall Run",
  powerslide: "Power Slide",
  speedroll: "Speed Roll",
  backflip: "Back Flip",
  doubleflip: "Double Flip",
  swallow: "Swallow Dive",
  handspring: "Back Handspring",
  tripleswallow: "Triple Swallow",
  cartwheel: "Cartwheel",
  tumble: "Back Handspring",
  backtuck: "Back Flip",
  trickcombo: "Tricking Combo!",
} as const;
export type TrickName = keyof typeof TRICK_NAMES;
/** A named trick that's also a move. The combo itself is only a reward. */
export type Trick = Exclude<TrickName, "trickcombo">;
/** Extra burst for the biggest tricks. */
const TRICK_BONUS: Partial<Record<TrickName, number>> = {
  doubleflip: 15,
  tripleswallow: 40,
  trickcombo: 70,
};
type ChainMove = "cartwheel" | "tumble" | "backtuck";
/** The tumbling pass on a mat: a cartwheel to turn round, two back handsprings, and a back flip to finish. */
export const TUMBLING_PASS: ChainMove[] = ["cartwheel", "tumble", "tumble", "backtuck"];
/** How each trick in the pass moves: seconds, and how high it goes. */
const CHAIN_MOVES: Record<ChainMove, { dur: number; arc: number }> = {
  cartwheel: { dur: 0.46, arc: 0 },
  tumble: { dur: 0.5, arc: 28 },
  backtuck: { dur: 0.6, arc: 66 },
};
const isChainMove = (m: Move): m is ChainMove => m in CHAIN_MOVES;

/** How far through a Back Handspring the hands touch down. The animation uses this too. */
export const HANDSPRING_CONTACT = 0.65;
/** Moves in the air under gravity. */
const inAir = (m: Move) =>
  m === "jump" ||
  m === "fall" ||
  m === "flip" ||
  m === "backflip" ||
  m === "doubleflip" ||
  m === "swallow" ||
  m === "tripleswallow";
/** Moves that follow a set path, and so ignore obstacles until they end. */
const onPath = (m: Move) =>
  m === "vault" ||
  m === "kong" ||
  m === "dashvault" ||
  m === "handspring" ||
  isChainMove(m) ||
  m === "climb" ||
  m === "wallrun" ||
  m === "stumble";

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
  /** Extra speed from tricks, which wears off. */
  boost: number;
  combo: number;
  comboT: number;
  /** The last trick landed, for showing it. `n` changes each time. */
  lastTrick: { name: TrickName; combo: number; n: number } | null;
  /** The pass being performed on a mat, and which trick in it is next. */
  chain: ChainMove[] | null;
  chainNext: number;
  tricks: number;
  /** Flips so far, which decides the next one. */
  flips: number;
  /** A trick underway, which pays out if it ends cleanly. */
  pending: Trick | null;
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
    boost: 0,
    combo: 0,
    comboT: 0,
    lastTrick: null,
    chain: null,
    chainNext: 0,
    tricks: 0,
    flips: 0,
    pending: null,
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
const speedOf = (r: Runner) => RUN_SPEED + FLOW_SPEED * r.flow + r.boost;
const ease = (p: number) => p * p * (3 - 2 * p);
const inZone = (kind: Exclude<ZoneKind, "mat">, dist: number) =>
  dist >= PERFECT[kind][0] && dist <= PERFECT[kind][1];

/** Pays out a trick: more speed, more for a longer combo. */
function award(r: Runner, name: TrickName) {
  r.pending = null;
  r.combo++;
  r.comboT = COMBO_TIME;
  r.tricks++;
  r.boost = Math.min(
    MAX_BOOST,
    r.boost +
      BURST +
      BURST_COMBO * Math.min(r.combo - 1, 5) +
      (TRICK_BONUS[name] ?? 0),
  );
  r.lastTrick = { name, combo: r.combo, n: r.tricks };
}
function breakCombo(r: Runner) {
  r.chain = null;
  r.combo = 0;
  r.boost = 0;
  r.pending = null;
}
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
/** Starts the next trick in a chain. One press plays the whole chain, each trick flowing straight out of the last. */
function startChainMove(r: Runner) {
  const name = r.chain![r.chainNext++]!,
    { dur, arc } = CHAIN_MOVES[name];
  r.jumpBuf = 0;
  r.from = { x: r.x, y: r.y };
  r.to = { x: r.x + Math.max(speedOf(r), r.vx) * 1.12 * dur, y: r.y };
  r.arc = arc;
  r.grounded = false;
  r.vy = 0;
  r.pending = name;
  set(r, name, dur);
}
/** A perfect press on a block: both hands and a long dive if it's wide, feet first if it's narrow. */
function startBlockTrick(r: Runner, ob: Obstacle) {
  const kong = ob.w >= KONG_MIN_W,
    x1 = ob.x + ob.w + (kong ? 75 : 60);
  r.from = { x: r.x, y: r.y };
  r.to = { x: x1, y: r.y };
  r.vaultSoon = false;
  r.arc = ob.h * (kong ? 0.62 : 0.8);
  r.grounded = false;
  r.vy = 0;
  r.pending = kong ? "kong" : "dashvault";
  set(
    r,
    kong ? "kong" : "dashvault",
    (x1 - r.x) / (Math.max(speedOf(r), r.vx) * 1.12),
  );
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
/** A perfect press at a wall: a few fast steps up it and over, with no pull-up. */
function startWallRun(r: Runner, ledgeX: number, topY: number) {
  r.from = { x: r.x, y: r.y };
  r.to = { x: ledgeX + 44, y: topY };
  r.ledgeX = ledgeX - 13;
  r.grounded = false;
  r.vy = 0;
  r.pending = "wallrun";
  set(r, "wallrun", 0.34 + (r.y - topY) * 0.0009);
}
/** An airborne trick from a perfect press. Flips take turns, and a long combo earns a double. */
function startFlip(r: Runner, dropHeight: number) {
  const order: Trick[] = ["flip", "backflip", r.combo >= 3 ? "doubleflip" : "flip"];
  // A big drop is the place for a dive. On a long combo, there's time for three somersaults first.
  const trick: Trick =
    dropHeight <= 0
      ? order[r.flips++ % 3]!
      : r.combo >= 3
        ? "tripleswallow"
        : "swallow";
  r.grounded = false;
  r.vy = -JUMP_V;
  r.pending = trick;
  // Timed to the actual landing, so the dive is finishing just as the hands reach the roof.
  set(
    r,
    trick,
    (JUMP_V + Math.sqrt(JUMP_V * JUMP_V + 2 * GRAVITY * Math.max(0, dropHeight))) /
      GRAVITY,
  );
}
/** Over a live wire: spring off the feet, plant the hands past it, and rebound onto the feet. */
function startHandspring(r: Runner, ob: Obstacle) {
  const x1 = ob.x + ob.w + 110;
  r.from = { x: r.x, y: r.y };
  r.to = { x: x1, y: r.y };
  r.arc = 34;
  r.grounded = false;
  r.vy = 0;
  r.pending = "handspring";
  set(r, "handspring", (x1 - r.x) / (Math.max(speedOf(r), r.vx) * 1.12));
}
function respawn(r: Runner, c: Course) {
  const cp = c.checkpoints[r.nextCheck - 1] ?? { x: 0, y: 0 };
  r.x = cp.x;
  r.y = cp.y;
  r.vx = 0;
  r.vy = 0;
  r.grounded = true;
  r.flow = 0;
  breakCombo(r);
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
/** A mistake costs flow, speed and the combo. A block or wire is a clumsy scramble, and a bar a slow slide under it. */
function hit(r: Runner, ob: Obstacle) {
  r.hitNext = true;
  r.hits++;
  r.flow = 0;
  breakCombo(r);
  r.vx = Math.min(r.vx, STUMBLE_SPEED);
  r.vaultSoon = false;
  if (ob.kind !== "bar") {
    r.from = { x: r.x, y: r.y };
    r.to = { x: ob.x + ob.w + 22, y: ob.y };
    r.arc = ob.kind === "block" ? ob.h + 6 : 14;
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
  } else if (ob.kind === "wire") {
    if (r.y > ob.y - 8) hit(r, ob);
  } else {
    const low = r.move === "slide" || r.move === "powerslide";
    if (r.y - (low ? SLIDE_H : STAND_H) < ob.y - ob.h) hit(r, ob);
  }
}
/** Stops the runner at a rooftop wall ahead. Returns true if that started a climb or a bonk. */
function checkFace(r: Runner, c: Course) {
  const p = platformAfter(c, r.x);
  if (!p || p.x0 > r.x + HALF_W || p.y >= r.y - 1) return false;
  r.pending = null;
  if (r.grounded) {
    r.x = p.x0 - HALF_W;
    r.vx = 0;
    r.flow = 0;
    breakCombo(r);
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
/** A jump press turns into whatever fits, and into a trick if it was timed perfectly. */
function pressJump(r: Runner, c: Course) {
  r.jumpBuf = 0;
  const lateOffLip = !r.grounded && r.coyote > 0;
  r.coyote = 0;
  const mat = r.grounded
    ? c.mats.find((q) => r.x >= q.x0 && r.x <= q.x0 + MAT_ZONE && !r.done)
    : undefined;
  if (mat) {
    r.chain = TUMBLING_PASS;
    r.chainNext = 0;
    return startChainMove(r);
  }
  const ob = c.obstacles[r.next];
  const dist = ob ? ob.x - r.x : Infinity;
  if (r.grounded && ob?.kind === "block" && !r.hitNext && dist > 0) {
    if (inZone("block", dist)) return startBlockTrick(r, ob);
    if (dist <= VAULT_REACH) {
      if (dist <= VAULT_TAKEOFF) startVault(r, ob);
      else r.vaultSoon = true;
      return;
    }
  }
  const p = platformAfter(c, r.x),
    roof = platformAt(c, r.x);
  if (
    r.grounded &&
    p &&
    p.y < r.y - 1 &&
    p.x0 - r.x <= CLIMB_REACH_X &&
    r.y - p.y <= CLIMB_REACH_Y &&
    roof &&
    roof.x1 >= p.x0
  ) {
    r.vx = Math.max(r.vx, RUN_SPEED * 0.6);
    if (inZone("wall", p.x0 - r.x)) return startWallRun(r, p.x0, p.y);
    return startClimb(r, p.x0, p.y);
  }
  if (r.grounded && ob?.kind === "wire" && !r.hitNext && inZone("wire", dist))
    return startHandspring(r, ob);
  const atLip =
    r.grounded && !!roof && !!p && inZone("lip", roof.x1 - r.x) && !(p.y < r.y - 1 && p.x0 === roof.x1);
  if (atLip || lateOffLip) {
    const big = !!p && !!roof && p.x0 === roof.x1 && p.y > roof.y + 100;
    return startFlip(r, big ? p.y - roof.y : 0);
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
  r.boost = Math.max(0, r.boost - BOOST_DECAY * dt);
  if (r.combo > 0) {
    r.comboT -= dt;
    if (r.comboT <= 0) r.combo = 0;
  }

  const m = r.move;
  if (onPath(m)) {
    const p = Math.min(1, r.t / r.dur);
    if (m === "climb") {
      if (p < 0.72) {
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
    } else if (m === "wallrun") {
      if (p < 0.68) {
        const q = p / 0.68;
        r.x = r.from.x + (r.ledgeX - r.from.x) * Math.min(1, q * 3);
        r.y = r.from.y + (r.to.y + 14 - r.from.y) * (q * (2 - q));
      } else {
        const q = ease((p - 0.68) / 0.32);
        r.x = r.ledgeX + (r.to.x - r.ledgeX) * q;
        r.y = r.to.y + 14 * (1 - q) - 10 * Math.sin(Math.PI * q);
      }
    } else if (m === "handspring" || m === "tumble") {
      r.x = r.from.x + (r.to.x - r.from.x) * p;
      r.y =
        r.from.y -
        r.arc * Math.sin(Math.PI * Math.min(1, p / HANDSPRING_CONTACT));
    } else {
      r.x = r.from.x + (r.to.x - r.from.x) * p;
      r.y =
        r.from.y + (r.to.y - r.from.y) * p - r.arc * Math.sin(Math.PI * p);
    }
    if (p >= 1) {
      r.x = r.to.x;
      r.y = r.to.y;
      r.grounded = true;
      r.lastGroundY = r.y;
      if (r.pending) award(r, r.pending);
      r.vx = Math.max(r.vx, speedOf(r) * (r.tricks && m !== "climb" ? 1 : 0.85));
      if (m === "climb" || m === "wallrun") r.flow = Math.min(1, r.flow + 0.2);
      if (m === "stumble") r.vx = STUMBLE_SPEED;
      set(r, "run");
      if (isChainMove(m) && r.chain) {
        if (r.chainNext >= r.chain.length) {
          r.chain = null;
          award(r, "trickcombo");
          r.vx = Math.max(r.vx, speedOf(r));
        } else startChainMove(r);
      }
    }
    passMarkers(r, c);
    return;
  }
  if (m === "bonk") {
    if (r.t >= r.dur) {
      const p = platformAfter(c, r.x)!;
      startClimb(r, p.x0, p.y, 1.4);
    }
    return;
  }
  if (m === "respawn") {
    if (r.t >= r.dur) set(r, "run");
    return;
  }

  // Timed moves ending on the ground.
  if (r.t >= r.dur && r.dur > 0 && r.grounded) {
    if (r.pending) award(r, r.pending);
    set(r, "run");
  }

  const target = r.done
    ? 0
    : r.move === "slide" && r.hitNext
      ? STUMBLE_SPEED
      : speedOf(r) * (r.move === "roll" ? ROLL_SPEED : 1);
  const accel = r.done ? 500 : r.vx > target ? ACCEL * 0.35 : ACCEL;
  r.vx += Math.sign(target - r.vx) * Math.min(accel * dt, Math.abs(target - r.vx));
  r.x += r.vx * dt;

  if (r.grounded) {
    if (checkFace(r, c)) return passMarkers(r, c);
    const ground = platformAt(c, r.x);
    if (!ground || ground.y > r.y + 1) {
      r.grounded = false;
      r.vy = 0;
      r.coyote = COYOTE;
      r.pending = null;
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
          const dist = ob ? ob.x - r.x : Infinity;
          if (ob?.kind === "bar" && !r.hitNext && inZone("bar", dist)) {
            r.pending = "powerslide";
            set(r, "powerslide", (dist + ob.w + 55) / Math.max(r.vx, RUN_SPEED));
          } else set(r, "slide", SLIDE_TIME);
        }
      }
    }
  }
  if (!r.grounded && inAir(r.move)) {
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
      const dived = r.move === "swallow" || r.move === "tripleswallow";
      if (r.pending) award(r, r.pending);
      if (r.vy > HARD_LANDING) {
        // A dive always rolls out. Otherwise, pressing slide just before a hard landing turns it into a fast roll.
        if (dived) set(r, "speedroll", SPEED_ROLL_TIME);
        else if (r.slideBuf > 0) {
          r.slideBuf = 0;
          award(r, "speedroll");
          set(r, "speedroll", SPEED_ROLL_TIME);
        } else set(r, "roll", ROLL_TIME);
      } else set(r, "land", LAND_TIME);
      r.vy = 0;
    } else if (r.y > r.lastGroundY + FALL_LIMIT) {
      return respawn(r, c);
    }
  }
  if (!onPath(r.move)) checkObstacle(r, c);
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
