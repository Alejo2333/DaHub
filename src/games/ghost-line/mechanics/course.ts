/** A rooftop. `y` is its top surface, and y grows downward. Platforms are sorted by x and never overlap. */
export interface Platform {
  x0: number;
  x1: number;
  y: number;
}
/** Something to get past on a rooftop. A block is vaulted, a bar is slid under, and a live wire is jumped. */
export interface Obstacle {
  kind: "block" | "bar" | "wire";
  x: number;
  w: number;
  /** Rooftop height at this obstacle. */
  y: number;
  /** A block's height, or the clearance under a bar. Unused for a wire. */
  h: number;
}
export interface Checkpoint {
  x: number;
  y: number;
}
/** The tricks in a chain, in order. */
export type ChainMove = "butterfly" | "aerial" | "gainer" | "webster" | "corkscrew";
/** A long flat stretch with nothing in the way, for chaining three tricks. */
export interface Mat {
  x0: number;
  x1: number;
  y: number;
  chain: [ChainMove, ChainMove, ChainMove];
}
export interface Course {
  platforms: Platform[];
  obstacles: Obstacle[];
  mats: Mat[];
  checkpoints: Checkpoint[];
  finishX: number;
  /** Picks the look of this course: its colours and skyline. */
  scenery: number;
  /** No honest run can be faster than this. The host uses it to refuse impossible finish times. */
  minMs: number;
}
export type ZoneKind = "block" | "bar" | "wire" | "wall" | "lip" | "mat";
/** A stretch of ground where a press turns into a trick. */
export interface Zone {
  kind: ZoneKind;
  x0: number;
  x1: number;
  y: number;
}
/**
 * How far before each thing a press counts as perfect, as [nearest, farthest].
 * A lip is the edge of a rooftop with a gap or a drop after it.
 */
export const PERFECT: Record<Exclude<ZoneKind, "mat">, [number, number]> = {
  block: [25, 80],
  bar: [30, 85],
  wire: [15, 70],
  wall: [40, 85],
  lip: [0, 45],
};
/** How far onto a mat a press starts its chain. */
export const MAT_ZONE = 120;
/** Long enough for three tricks at top speed, with room to spare. */
const MAT_LENGTH = 1450;
const CHAINS: Mat["chain"][] = [
  ["butterfly", "gainer", "corkscrew"],
  ["aerial", "webster", "corkscrew"],
  ["butterfly", "webster", "gainer"],
  ["aerial", "gainer", "corkscrew"],
];
/** Blocks at least this wide get a Kong Vault. Narrower ones get a Dash Vault. */
export const KONG_MIN_W = 55;

const BLOCK_H = 44,
  /** Standing is 78 tall and sliding is 30, so this forces a slide. */
  BAR_CLEARANCE = 46,
  /** Fastest possible speed, with full flow and a full trick burst. */
  TOP_SPEED = 620;

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
  // Each course gets its own character: how long it is, how tightly packed, and which challenges it favours.
  const scenery = Math.floor(rng() * 1e6) + 1,
    length = range(25000, 33000),
    tightness = range(0.95, 1.15),
    checkEvery = 4 + Math.floor(rng() * 3),
    weights: Record<string, number> = {};
  for (const k of ["gap", "block", "bar", "wire", "wall", "drop", "islands", "slalom", "stairs", "gauntlet"])
    // Squared, so some courses lean hard on a favourite and nearly skip another.
    weights[k] = 0.25 + 1.9 * rng() * rng();
  const unlock = {
    linked: range(0.08, 0.25),
    stairs: range(0.25, 0.45),
    gauntlet: range(0.4, 0.65),
  };
  const pick = (kinds: string[]) => {
    let roll = rng() * kinds.reduce((sum, k) => sum + weights[k]!, 0);
    for (const k of kinds) if ((roll -= weights[k]!) <= 0) return k;
    return kinds[kinds.length - 1]!;
  };
  const platforms: Platform[] = [],
    obstacles: Obstacle[] = [],
    checkpoints: Checkpoint[] = [],
    mats: Mat[] = [];
  // Two mats each race, at different points.
  const matsAt = [length * range(0.12, 0.3), length * range(0.5, 0.78)];
  let x = range(650, 1100),
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
  const block = () => {
    const w = range(40, 75);
    obstacles.push({ kind: "block", x, w, y, h: BLOCK_H });
    x += w;
  };
  const bar = () => {
    const w = range(40, 90);
    obstacles.push({ kind: "bar", x, w, y, h: BAR_CLEARANCE });
    x += w;
  };
  const wire = () => {
    const w = range(70, 120);
    obstacles.push({ kind: "wire", x, w, y, h: 0 });
    x += w;
  };
  const gap = (hard: number) => {
    const w = range(105, 130 + 40 * hard),
      shift = rng() < 0.45 ? 0 : range(-30, 45);
    nextRoof(x + w, y + shift);
  };
  const wall = () => nextRoof(x, y - range(110, 155));
  const drop = () => nextRoof(x, y + range(135, 225));

  while (x < length) {
    const hard = x / length;
    const kinds = ["gap", "block", "bar", "wire"];
    if (y > -350) kinds.push("wall");
    if (y < 350) kinds.push("drop");
    // Linked challenges start once the player has warmed up.
    if (hard > unlock.linked) kinds.push("islands", "slalom");
    if (hard > unlock.stairs && y > -250) kinds.push("stairs");
    if (hard > unlock.gauntlet) kinds.push("gauntlet");
    // Never the same thing twice in a row.
    const matDue = matsAt.length > 0 && hard * length >= matsAt[0]!;
    const kind = matDue ? "mat" : pick(kinds.filter((k) => k !== last));
    last = kind;
    switch (kind) {
      case "mat":
        matsAt.shift();
        mats.push({
          x0: x,
          x1: x + MAT_LENGTH,
          y,
          chain: CHAINS[Math.floor(rng() * CHAINS.length)]!,
        });
        x += MAT_LENGTH;
        break;
      case "gap":
        gap(hard);
        break;
      case "wall":
        wall();
        break;
      case "drop":
        drop();
        // Room to land: a dive off a big drop carries a long way at top speed.
        x += 320;
        break;
      case "block":
        block();
        break;
      case "bar":
        bar();
        break;
      case "wire":
        wire();
        break;
      case "islands": {
        // Narrow rooftops one after another. There's little room to land too long.
        const n = 2 + Math.floor(rng() * (hard > 0.5 ? 3 : 2));
        for (let i = 0; i < n; i++) {
          gap(hard);
          if (i < n - 1) x += range(330, 420);
        }
        break;
      }
      case "slalom":
        // Over, then straight under.
        block();
        x += range(290, 340);
        bar();
        break;
      case "stairs":
        wall();
        x += range(300, 360);
        wall();
        break;
      case "gauntlet":
        wire();
        x += range(330, 380);
        bar();
        x += range(290, 330);
        block();
        break;
    }
    x += range(600 - 200 * hard, 700 - 200 * hard) * tightness;
    if (++count % checkEvery === 0) checkpoints.push({ x: x - 220, y });
  }
  const finishX = x + 400;
  x = finishX + 1500;
  open.x1 = x;
  platforms.push(open);
  return {
    platforms,
    obstacles,
    mats,
    checkpoints,
    finishX,
    scenery,
    minMs: (finishX / TOP_SPEED) * 1000 * 0.85,
  };
}

/** Every stretch of ground where a press is perfect, for drawing on the course. */
export function zonesIn(c: Course): Zone[] {
  const zones: Zone[] = [];
  for (const o of c.obstacles) {
    const [near, far] = PERFECT[o.kind];
    zones.push({ kind: o.kind, x0: o.x - far, x1: o.x - near, y: o.y });
  }
  c.platforms.forEach((p, i) => {
    const next = c.platforms[i + 1];
    if (!next) return;
    const kind: ZoneKind = next.y < p.y - 1 && next.x0 === p.x1 ? "wall" : "lip";
    const [near, far] = PERFECT[kind];
    zones.push({ kind, x0: p.x1 - far, x1: p.x1 - near, y: p.y });
  });
  for (const m of c.mats)
    zones.push({ kind: "mat", x0: m.x0, x1: m.x0 + MAT_ZONE, y: m.y });
  return zones.sort((a, b) => a.x0 - b.x0);
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
