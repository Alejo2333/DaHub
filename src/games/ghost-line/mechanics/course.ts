/** A rooftop. `y` is its top surface, and y grows downward. Platforms are sorted by x and never overlap. */
export interface Platform {
  x0: number;
  x1: number;
  y: number;
}
/** Something to get past on a rooftop. A block is vaulted. A bar hangs low and is slid under. */
export interface Obstacle {
  kind: "block" | "bar";
  x: number;
  w: number;
  /** Rooftop height at this obstacle. */
  y: number;
  /** A block's height, or the clearance under a bar. */
  h: number;
}
export interface Checkpoint {
  x: number;
  y: number;
}
export interface Course {
  platforms: Platform[];
  obstacles: Obstacle[];
  checkpoints: Checkpoint[];
  finishX: number;
  /** No honest run can be faster than this. The host uses it to refuse impossible finish times. */
  minMs: number;
}

const TARGET_LENGTH = 24000,
  BLOCK_H = 44,
  /** Standing is 78 tall and sliding is 30, so this forces a slide. */
  BAR_CLEARANCE = 46,
  /** Fastest possible speed, from runner.ts. Kept here so the course doesn't depend on the runner. */
  TOP_SPEED = 410;

/** A small seeded random generator (mulberry32), so every player builds an identical course. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildCourse(seed: number): Course {
  const rng = seeded(seed),
    range = (a: number, b: number) => a + rng() * (b - a);
  const platforms: Platform[] = [],
    obstacles: Obstacle[] = [],
    checkpoints: Checkpoint[] = [];
  let x = 900,
    y = 0,
    count = 0,
    last = "";
  let open: Platform = { x0: -600, x1: 0, y };
  /** Ends the current rooftop at `x`, and starts the next one at `at`. */
  const nextRoof = (at: number, newY: number) => {
    open.x1 = x;
    platforms.push(open);
    open = { x0: at, x1: 0, y: newY };
    x = at;
    y = newY;
  };
  while (x < TARGET_LENGTH) {
    const hard = x / TARGET_LENGTH;
    const kinds = ["gap", "block", "bar"];
    if (y > -350) kinds.push("wall");
    if (y < 350) kinds.push("drop");
    let kind = kinds[Math.floor(rng() * kinds.length)]!;
    // Never the same thing twice in a row.
    if (kind === last) kind = kinds[(kinds.indexOf(kind) + 1) % kinds.length]!;
    last = kind;
    if (kind === "gap") {
      const w = range(95, 125 + 45 * hard),
        shift = [0, 0, 40, -30][Math.floor(rng() * 4)]!;
      nextRoof(x + w, y + shift);
    } else if (kind === "wall") {
      nextRoof(x, y - range(110, 150));
    } else if (kind === "drop") {
      nextRoof(x, y + range(90, 180));
    } else if (kind === "block") {
      const w = range(40, 70);
      obstacles.push({ kind, x, w, y, h: BLOCK_H });
      x += w;
    } else {
      const w = range(40, 90);
      obstacles.push({ kind: "bar", x, w, y, h: BAR_CLEARANCE });
      x += w;
    }
    x += range(760 - 330 * hard, 880 - 330 * hard);
    if (++count % 6 === 0) checkpoints.push({ x: x - 220, y });
  }
  const finishX = x + 400;
  x = finishX + 1500;
  open.x1 = x;
  platforms.push(open);
  return {
    platforms,
    obstacles,
    checkpoints,
    finishX,
    minMs: (finishX / TOP_SPEED) * 1000 * 0.85,
  };
}

/** The rooftop under `x`, if any. */
export function platformAt(c: Course, x: number): Platform | undefined {
  const i = nextIndex(c, x) - 1;
  const p = c.platforms[i];
  return p && x < p.x1 ? p : undefined;
}
/** The first rooftop starting after `x`. */
export function platformAfter(c: Course, x: number): Platform | undefined {
  return c.platforms[nextIndex(c, x)];
}
/** The index of the first platform starting after `x`. */
function nextIndex(c: Course, x: number) {
  let lo = 0,
    hi = c.platforms.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c.platforms[mid]!.x0 <= x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
