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
});
type Key = [number, Pose];
const KEYS = Object.keys(P(0, 0, 0, 0, [0, 0, 0], [0, 0, 0], [0, 0], [0, 0])) as PoseKey[];
const smooth = (p: number) => p * p * (3 - 2 * p);
/** Blends two poses. */
export function mix(a: Pose, b: Pose, k: number): Pose {
  const out = {} as Pose;
  for (const key of KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}
/** Samples a clip's keys at progress `t`, easing between them. */
export function sample(keys: Key[], t: number): Pose {
  if (t <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, p1] = keys[i]!;
    if (t <= t1) {
      const [t0, p0] = keys[i - 1]!;
      return mix(p0, p1, smooth((t - t0) / (t1 - t0)));
    }
  }
  return keys[keys.length - 1]![1];
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
/** The full run. `flow` is 0 to 1, and leans the runner into a sprint. */
export function runPose(phase: number, flow: number): Pose {
  const f = runFoot(phase),
    b = runFoot(phase + 0.5),
    swing = Math.cos(2 * Math.PI * (phase + 0.1)),
    bob = Math.cos(4 * Math.PI * (phase - 0.105));
  const arm = (s: number): [number, number] =>
    s > 0
      ? // Forward: fist up near the chin.
        [6 + 12 * s, 14 - 13 * s]
      : // Back: elbow high behind, hand by the hip.
        [6 + 19 * s, 14 + 6 * s];
  return P(
    2,
    -37.5 + 2.5 * bob,
    12 + 7 * flow + bob * 1.5,
    -6 - 5 * flow,
    f,
    b,
    // Each arm swings against the leg on its own side.
    arm(-swing),
    arm(swing),
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
