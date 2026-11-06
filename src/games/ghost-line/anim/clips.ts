import type { Pose, PoseKey } from "./skeleton";

/** Builds a pose from values in a compact order. Grip and plant default to 0. */
const P = (
  px: number,
  py: number,
  lean: number,
  head: number,
  f: [number, number, number],
  b: [number, number, number],
  hf: [number, number],
  hb: [number, number],
  grip = 0,
  plant = 0,
  back = 0,
): Pose => ({
  px,
  py,
  lean,
  head,
  fx: f[0],
  fy: f[1],
  fp: f[2],
  bx: b[0],
  by: b[1],
  bp: b[2],
  hfx: hf[0],
  hfy: hf[1],
  hbx: hb[0],
  hby: hb[1],
  grip,
  plant,
  back,
});
type Key = [number, Pose];
const KEYS = Object.keys(P(0, 0, 0, 0, [0, 0, 0], [0, 0, 0], [0, 0], [0, 0])) as PoseKey[];
/** Blends two poses. */
export function mix(a: Pose, b: Pose, k: number): Pose {
  const out = {} as Pose;
  for (const key of KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}
/**
 * Samples a clip's keys at progress `t` along one smooth curve. Each key's slope comes from its neighbours
 * (a Catmull-Rom spline), so motion flows through keys instead of slowing to a stop at each one.
 */
export function sample(keys: Key[], t: number): Pose {
  const last = keys.length - 1;
  if (t <= keys[0]![0]) return keys[0]![1];
  if (t >= keys[last]![0]) return keys[last]![1];
  let i = 1;
  while (t > keys[i]![0]) i++;
  const [t0, p0] = keys[i - 1]!,
    [t1, p1] = keys[i]!,
    before = keys[i - 2],
    after = keys[i + 1],
    h = t1 - t0,
    u = (t - t0) / h,
    u2 = u * u,
    u3 = u2 * u;
  const out = {} as Pose;
  for (const key of KEYS) {
    const m0 = before ? ((p1[key] - before[1][key]) / (t1 - before[0])) * h : 0,
      m1 = after ? ((after[1][key] - p0[key]) / (after[0] - t0)) * h : 0;
    out[key] =
      (2 * u3 - 3 * u2 + 1) * p0[key] +
      (u3 - 2 * u2 + u) * m0 +
      (-2 * u3 + 3 * u2) * p1[key] +
      (u3 - u2) * m1;
  }
  out.grip = Math.min(1, Math.max(0, out.grip));
  out.plant = Math.min(1, Math.max(0, out.plant));
  return out;
}

/** Hands relaxed at the sides. */
const STAND = P(1, -41, 3, 0, [6, -3, 0], [-6, -3, 0], [3, 26], [-3, 26]);

export const IDLE: Key[] = [
  // A ready crouch, as if on the blocks.
  [0, P(-2, -33, 28, -18, [14, -3, 0], [-20, -3, 22], [14, 18], [-10, 18])],
];
export const RESPAWN = STAND;

/** Distance covered by one full run cycle (two strides). Tied to distance so that feet never skate. */
export const CYCLE_LEN = 190;
const TOUCH_X = 17,
  OFF_X = -23,
  /** The share of the cycle that covers the foot's distance on the ground, so it holds still in the world. */
  STANCE = (TOUCH_X - OFF_X) / CYCLE_LEN,
  ANKLE_Y = -3;
/** The swing leg's path, from toe-off back round to touchdown: heel kick, knee drive, reach. */
const SWING: [number, number, number, number][] = [
  [STANCE, OFF_X, ANKLE_Y, 35],
  [0.36, -35, -18, 62],
  [0.5, -27, -34, 70],
  [0.68, 6, -38, 42],
  [0.86, 27, -22, 2],
  [1, TOUCH_X, ANKLE_Y, -8],
];
const catmull = (a: number, b: number, c: number, d: number, t: number) =>
  0.5 *
  (2 * b +
    (c - a) * t +
    (2 * a - 5 * b + 4 * c - d) * t * t +
    (3 * b - a - 3 * c + d) * t * t * t);
/** Where a running foot is at this point of the cycle. 0 is touchdown. On the ground it moves back at exactly running speed. */
export function runFoot(phase: number): [number, number, number] {
  const p = ((phase % 1) + 1) % 1;
  if (p < STANCE) {
    const k = p / STANCE;
    return [TOUCH_X + (OFF_X - TOUCH_X) * k, ANKLE_Y, -8 + 43 * k * k];
  }
  let i = 1;
  while (i < SWING.length - 1 && p > SWING[i]![0]) i++;
  const a = SWING[Math.max(0, i - 2)]!,
    b = SWING[i - 1]!,
    c = SWING[i]!,
    d = SWING[Math.min(SWING.length - 1, i + 1)]!,
    k = (p - b[0]) / (c[0] - b[0]);
  return [
    catmull(a[1], b[1], c[1], d[1], k),
    Math.min(ANKLE_Y, catmull(a[2], b[2], c[2], d[2], k)),
    catmull(a[3], b[3], c[3], d[3], k),
  ];
}
/**
 * The full run. `sprint` is 0 to 1: the faster the runner goes, the further it leans in,
 * the higher the knees drive and the wider the arms pump.
 */
export function runPose(phase: number, sprint: number): Pose {
  const f = runFoot(phase),
    b = runFoot(phase + 0.5),
    theta = 2 * Math.PI * (phase + 0.1),
    bob = Math.cos(4 * Math.PI * (phase - 0.105)),
    // The hips rock forward and back with each stride.
    rock = Math.sin(4 * Math.PI * (phase - 0.02));
  // Higher knees at speed, only while the foot is off the ground.
  const lift = (foot: [number, number, number]): [number, number, number] => [
    foot[0],
    foot[1] + Math.min(0, foot[1] + 3) * 0.28 * sprint,
    foot[2],
  ];
  // Hands trace a closed oval, so there's no kink where the swing turns round.
  const arm = (angle: number): [number, number] => {
    const s = Math.cos(angle),
      c = Math.sin(angle),
      size = 1 + 0.25 * sprint;
    return [5 + 17 * s * size, 12 - 8 * s * size + 4 * c];
  };
  return P(
    2 + rock * 1.2,
    -37.5 + (2.2 + 1.2 * sprint) * bob,
    11 + 12 * sprint + bob * 1.2,
    -5 - 8 * sprint - bob * 1.5,
    lift(f),
    lift(b),
    // Each arm swings against the leg on its own side.
    arm(theta + Math.PI),
    arm(theta),
  );
}

/** In the air. `t` runs from 0 (rising fast) to 1 (falling fast). */
export const AIR: Key[] = [
  // Takeoff: lead knee driving, trail leg stretched behind.
  [0, P(2, -44, 16, -8, [18, -28, 30], [-24, -6, 55], [16, -4], [-16, 12])],
  // Top: tucked, legs swapping over.
  [0.5, P(1, -42, 10, -4, [14, -24, 20], [-12, -18, 50], [12, 6], [-12, 8])],
  // Coming down: legs reaching for the ground, arms up for balance.
  [0.75, P(0, -41, 2, 2, [18, -7, -10], [-2, -16, 25], [18, -2], [-16, -2])],
  [1, P(-1, -40, -2, 6, [16, -2, -12], [0, -8, 10], [22, -8], [-18, -8])],
];
/** Falling too far: flailing. `t` is a repeating phase. */
export const FLAIL: Key[] = [
  [0, P(0, -42, -18, 14, [18, -10, 10], [-14, -22, 40], [18, -16], [-16, -12])],
  [0.5, P(0, -42, -24, 14, [8, -20, 30], [-6, -6, 10], [10, -22], [-22, -6])],
  [1, P(0, -42, -18, 14, [18, -10, 10], [-14, -22, 40], [18, -16], [-16, -12])],
];
/** A soft landing: absorb the weight, with feet fixed to the ground. */
export const LAND: Key[] = [
  [0, P(0, -29, 26, -16, [12, -3, 0], [-12, -3, 8], [18, 14], [-14, 14], 0, 1)],
  [1, P(3, -35, 20, -10, [10, -3, 0], [-18, -3, 20], [14, 10], [-8, 18], 0, 1)],
];
/** A hard landing: a full forward roll over the shoulder. */
export const ROLL: Key[] = [
  [0, P(4, -24, 40, -14, [10, -3, 0], [-14, -3, 15], [18, 18], [10, 20])],
  [0.25, P(4, -24, 110, -20, [-10, -28, 60], [-20, -22, 60], [10, 14], [4, 16])],
  [0.5, P(0, -40, 200, -30, [8, -56, 150], [0, -52, 150], [-6, 12], [-10, 14])],
  [0.72, P(0, -26, 295, -10, [18, -12, 240], [14, -8, 240], [8, 10], [2, 12])],
  [1, P(2, -33, 382, -8, [12, -3, 360], [-12, -3, 375], [14, 12], [-10, 14])],
];
/** Feet first with the trailing leg folded, one hand brushing the ground. */
export const SLIDE: Key[] = [
  [0, P(0, -30, -6, 6, [20, -3, -10], [-10, -3, 10], [16, 8], [-14, 10])],
  [0.16, P(-8, -11, -52, 40, [28, -3, -30], [4, -3, 8], [22, -4], [-12, 18])],
  [0.78, P(-8, -11, -48, 38, [30, -3, -32], [4, -3, 8], [22, 0], [-12, 18])],
  [1, P(0, -30, 14, -4, [18, -3, -8], [-12, -3, 14], [14, 8], [-12, 12])],
];
/** One hand on the block, legs swinging past the side. */
export const VAULT: Key[] = [
  [0, P(2, -36, 22, -8, [18, -6, 0], [-22, -6, 40], [16, 4], [-10, 12])],
  [0.28, P(4, -29, 55, -30, [8, -22, 40], [-12, -26, 60], [14, 24], [12, 24], 1)],
  [0.52, P(-2, -27, 38, -20, [24, -18, 0], [18, -12, 0], [10, 26], [-4, 26], 1)],
  [0.74, P(-4, -36, 4, -4, [22, -8, -10], [4, -20, 15], [22, -4], [-20, 2], 0.2)],
  [1, P(2, -37, 14, -6, [16, -3, -8], [-14, -14, 45], [14, 2], [-6, 14])],
];
/** Reach up, feet on the wall, pull up, knee over, stand. */
export const CLIMB: Key[] = [
  [0, P(0, -38, 8, -14, [14, -6, -10], [-10, -8, 30], [14, -30], [6, -28])],
  [0.14, P(-3, -40, 6, -18, [7, -14, -40], [2, -26, -30], [8, -26], [5, -26], 1)],
  [0.5, P(-6, -38, 18, -6, [7, -8, -40], [4, -30, -30], [8, 10], [5, 12], 1)],
  [0.72, P(0, -38, 36, -16, [14, -30, 10], [-6, -6, 50], [10, 28], [6, 28], 1)],
  [0.88, P(6, -38, 26, -10, [20, -6, 0], [-8, -10, 40], [10, 22], [0, 24], 0.5)],
  [1, P(2, -37, 14, -6, [14, -3, -6], [-18, -6, 30], [10, 8], [-8, 14])],
];
/** Tripped: pitching forward, arms windmilling, feet catching up. */
export const STUMBLE: Key[] = [
  [0, P(6, -34, 44, -28, [20, -3, 0], [-16, -14, 50], [24, 8], [-14, -14])],
  [0.35, P(8, -29, 58, -38, [-10, -14, 50], [24, -3, 0], [22, 20], [12, -24])],
  [0.7, P(5, -33, 40, -24, [22, -3, 0], [-12, -8, 40], [10, -24], [24, 14])],
  [1, P(2, -37, 18, -8, [14, -3, 0], [-20, -5, 30], [14, 6], [-10, 14])],
];
/** Hit a wall: thrown back, hands up, then gathering for the climb. */
export const BONK: Key[] = [
  [0, P(-2, -40, -22, 22, [-1, -3, -14], [-16, -3, 0], [14, -6], [10, -10], 0, 1)],
  [0.5, P(-3, -39, -14, 12, [-1, -3, -10], [-16, -3, 0], [12, 16], [8, 18], 0, 1)],
  [1, P(-1, -33, 12, -14, [-1, -3, 0], [-15, -3, 8], [12, -26], [6, -24], 0, 1)],
];
/** Over the line: slowing down, arms up. */
export const FINISH: Key[] = [
  [0, P(2, -38, 12, -6, [14, -3, 0], [-16, -6, 30], [14, 4], [-10, 12])],
  [1, P(1, -41, -6, 12, [7, -3, 0], [-7, -3, 0], [10, -26], [-8, -26], 0, 1)],
];

/** Kong Vault: a long dive with both hands on the block, knees tucked through, then shooting out the far side. */
export const KONG: Key[] = [
  [0, P(3, -35, 30, -14, [22, -6, 0], [-24, -12, 50], [18, 4], [10, 8])],
  [0.26, P(6, -33, 68, -40, [-20, -30, 70], [-30, -24, 80], [20, 22], [16, 24], 1)],
  [0.48, P(0, -30, 56, -30, [12, -22, 20], [6, -18, 30], [12, 26], [8, 26], 1)],
  [0.7, P(-3, -34, 14, -8, [30, -10, -14], [22, -14, -6], [-8, 22], [-14, 20], 0.15)],
  [1, P(2, -37, 18, -8, [18, -3, -8], [-14, -14, 45], [14, 2], [-6, 14])],
];
/** Dash Vault: over feet first, leaning back, with a push off the block behind. */
export const DASH: Key[] = [
  [0, P(2, -36, 14, -6, [22, -18, -10], [-16, -6, 30], [16, -4], [-8, 8])],
  [0.34, P(-4, -30, -30, 18, [36, -26, -24], [26, -32, -18], [20, -10], [-4, 10])],
  [0.58, P(-8, -26, -38, 26, [34, -22, -20], [24, -18, -14], [-4, 26], [-10, 24], 0.8)],
  [0.8, P(-2, -35, -6, 8, [24, -6, -10], [8, -14, 8], [18, 2], [-20, 4])],
  [1, P(2, -37, 14, -6, [16, -3, -8], [-14, -12, 40], [14, 2], [-6, 14])],
];
/** Wall Run: quick steps up the wall, leaning away from it, then hands on the ledge and over. */
export const WALLRUN: Key[] = [
  [0, P(2, -37, 18, -8, [14, -6, -10], [-16, -8, 30], [14, 2], [-8, 12])],
  [0.2, P(-13, -39, -16, 8, [10, -18, -70], [2, -3, -40], [12, -14], [-12, 6])],
  [0.4, P(-14, -38, -20, 10, [9, -3, -70], [10, -26, -70], [-10, 8], [12, -18])],
  [0.6, P(-13, -39, -14, 4, [10, -26, -70], [8, -2, -60], [12, -22], [8, -24])],
  [0.78, P(2, -36, 38, -20, [12, -28, 10], [-8, -12, 50], [10, 26], [6, 26], 1)],
  [1, P(2, -37, 18, -8, [16, -3, -6], [-16, -8, 34], [12, 6], [-8, 12])],
];
/** Power Slide: dropping low and fast, then kicking straight back up into a run. */
export const POWERSLIDE: Key[] = [
  [0, P(1, -31, 2, 2, [22, -3, -10], [-10, -3, 12], [16, 6], [-14, 10])],
  [0.14, P(-8, -10, -56, 42, [32, -3, -32], [6, -3, 8], [24, -6], [-14, 19])],
  [0.66, P(-8, -10, -52, 40, [34, -3, -32], [6, -3, 8], [24, -2], [-14, 19])],
  [0.84, P(-2, -22, -18, 18, [14, -14, -6], [2, -6, 20], [16, -14], [-10, 8])],
  [1, P(2, -37, 18, -8, [17, -3, -8], [-22, -8, 34], [14, 2], [-8, 14])],
];
/**
 * Any flip: rotates around the hips, tucking tight at the top and opening up to land.
 * `turns` is positive going forward and negative going backward.
 */
export function flipPose(p: number, turns = 1): Pose {
  const open = Math.sin(Math.PI * Math.min(1, p * 1.05)),
    tuck = open * open,
    // Slow to start and finish, fastest in the tuck, like a real somersault.
    turn = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p),
    start = turns > 0 ? 14 : 10,
    deg = start + (360 * turns - start) * turn,
    a = (deg * Math.PI) / 180,
    rot = (x: number, y: number): [number, number] => [
      x * Math.cos(a) - y * Math.sin(a),
      x * Math.sin(a) + y * Math.cos(a),
    ],
    px = 1,
    py = -42 + 10 * tuck,
    reach = 36 - 20 * tuck,
    foot = (side: number): [number, number, number] => {
      const [x, y] = rot(side * (6 - 2 * tuck) + 6 * tuck, reach);
      return [px + x, py + y, deg];
    },
    hand = (side: number): [number, number] =>
      // Arms go up on takeoff, then hug the shins.
      rot(side * 4 + 8 * tuck, 26 * tuck - 18 * (1 - tuck));
  return P(px, py, deg, -10 * tuck, foot(1), foot(-1), hand(1), hand(-1));
}
/** Swallow Dive: flying flat with the back arched and arms spread, then reaching down to roll out. */
export const SWALLOW: Key[] = [
  [0, P(2, -42, 24, -10, [8, -8, 30], [-22, -10, 55], [14, -18], [-10, -18])],
  [0.3, P(0, -46, 62, -44, [-30, -38, 90], [-36, -30, 95], [20, -12], [-22, -8])],
  [0.62, P(0, -46, 78, -56, [-36, -48, 100], [-40, -42, 105], [24, -8], [-24, -2])],
  [0.85, P(2, -42, 92, -40, [-30, -52, 110], [-34, -46, 115], [24, 10], [14, 14])],
  [1, P(4, -36, 112, -24, [-20, -50, 120], [-26, -44, 125], [18, 22], [12, 24])],
];
/**
 * Back Handspring: turning to face backward, the body arches over and the arms reach overhead,
 * hands touch down upside down, and the legs snap round to land.
 */
export function handspringPose(p: number, contact: number): Pose {
  // A half turn by the time the hands touch down, then the other half.
  const q = p < contact ? (p / contact) * 0.5 : 0.5 + ((p - contact) / (1 - contact)) * 0.5,
    turn = q * q * (3 - 2 * q),
    deg = 12 + 348 * turn,
    a = (deg * Math.PI) / 180,
    rot = (x: number, y: number): [number, number] => [
      x * Math.cos(a) - y * Math.sin(a),
      x * Math.sin(a) + y * Math.cos(a),
    ],
    up = Math.sin(Math.PI * Math.min(1, q * 1.02)),
    py = -41 - 13 * up,
    // The arch: legs trail a little behind the line of the body.
    arch = 8 * up,
    foot = (side: number): [number, number, number] => {
      const [x, y] = rot(side * 4 - arch, 40 - 3 * up);
      return [x, py + y, deg];
    },
    hand = (side: number): [number, number] =>
      rot(side * 3, 18 - 44 * up);
  // Facing backward from just after takeoff to just before landing, while the legs are straight.
  const back = p > 0.1 && p < 0.92 ? 1 : 0;
  return P(0, py, deg, 16 * up, foot(1), foot(-1), hand(1), hand(-1), 0, 0, back);
}
/** Triple Swallow: three fast somersaults, then opening out into the swan arch before reaching for the roll. */
export function tripleSwallowPose(p: number): Pose {
  const OPEN_AT = 0.62,
    TURNS = 3,
    spin = flipPose(Math.min(1, p / 0.7), TURNS),
    dive = { ...sample(SWALLOW, 0.4 + 0.6 * Math.max(0, (p - OPEN_AT) / (1 - OPEN_AT))) },
    q = Math.min(1, Math.max(0, (p - OPEN_AT) / 0.14)),
    k = q * q * (3 - 2 * q);
  dive.lean += 360 * TURNS;
  dive.fp += 360 * TURNS;
  dive.bp += 360 * TURNS;
  return mix(spin, dive, k);
}
/**
 * A flip with the body open rather than tucked: `split` spreads the legs, and `arms` pulls them to the chest.
 * Used for the tricking moves, which show off the shape of the body.
 */
function openFlip(p: number, turns: number, split: number, arms: number, back: number): Pose {
  const turn = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p),
    deg = 12 + (360 * turns - 12) * turn,
    a = (deg * Math.PI) / 180,
    up = Math.sin(Math.PI * p),
    rot = (x: number, y: number): [number, number] => [
      x * Math.cos(a) - y * Math.sin(a),
      x * Math.sin(a) + y * Math.cos(a),
    ],
    py = -42 - 2 * up,
    foot = (side: number): [number, number, number] => {
      const [x, y] = rot(side * split * up + 3 * side, 38 - 3 * up);
      return [x, py + y, deg];
    },
    hand = (side: number): [number, number] =>
      rot(side * (10 - 6 * arms) + 8 * arms, 20 - 40 * up * (1 - arms) + 4 * arms);
  return P(0, py, deg, -6 * up, foot(1), foot(-1), hand(1), hand(-1), 0, 0, back);
}
/** Butterfly Kick: the body flat as a propeller, legs scissoring over each other. */
export const BUTTERFLY: Key[] = [
  [0, P(2, -34, 34, -14, [14, -3, 0], [-20, -8, 30], [16, 16], [-8, 20])],
  [0.25, P(2, -38, 78, -40, [-20, -50, 90], [-34, -14, 80], [20, -10], [-18, 12], 0, 0, 1)],
  [0.5, P(0, -40, 92, -46, [-38, -18, 95], [-16, -56, 100], [14, 18], [-20, -8], 0, 0, 1)],
  [0.75, P(0, -40, 60, -24, [-14, -52, 80], [-30, -22, 70], [20, 8], [-14, 14])],
  [1, P(2, -36, 22, -8, [16, -3, -6], [-18, -8, 30], [14, 6], [-8, 12])],
];
/** Aerial: a cartwheel with no hands, legs wide. */
export const aerialPose = (p: number) => openFlip(p, 1, 24, 0, 0);
/** Webster: a front flip off one leg, the other kicking through. */
export const websterPose = (p: number) => openFlip(p, 1, 14, 0.5, 0);
/** Gainer: a backflip that keeps travelling forward. */
export const gainerPose = (p: number) => flipPose(p, -1);
/** Corkscrew: a laid-out backflip with a twist, shown by the body turning to face the other way and back. */
export const corkscrewPose = (p: number) =>
  openFlip(p, -1, 4, 1, p > 0.3 && p < 0.72 ? 1 : 0);
