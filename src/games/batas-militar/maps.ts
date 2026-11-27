/**
 * Data-driven arenas. The host uses the collision data; the renderer uses everything.
 * To add a map, write a MapDefinition below and append it to MAPS. No engine changes are needed.
 */

/** Render order, back to front. */
export type EnvironmentLayer = 'sky' | 'far' | 'near' | 'terrain' | 'decoration' | 'entities' | 'foreground' | 'hud'

export type MaterialId = 'grass' | 'soil' | 'stone' | 'sand' | 'snow' | 'ice' | 'concrete' | 'metal' | 'wood' | 'masonry'
export interface TerrainMaterial {
  top: string; topDark: string; body: string; dark: string; outline: string; speck: string
  topH: number; tufts: boolean
  /** How quickly you reach walking speed on it. Ice is slippery. */
  friction: number
}
export const MATERIALS: Record<MaterialId, TerrainMaterial> = {
  grass: { top: '#7cc850', topDark: '#4f9a35', body: '#8a5a3b', dark: '#55361f', outline: '#2e1d14', speck: '#a7764f', topH: 13, tufts: true, friction: 0.35 },
  soil: { top: '#a97a4f', topDark: '#87603b', body: '#7d5434', dark: '#4f331e', outline: '#2e1d14', speck: '#9b6c44', topH: 6, tufts: false, friction: 0.35 },
  stone: { top: '#a3abb4', topDark: '#7b838d', body: '#6f747c', dark: '#43464c', outline: '#202227', speck: '#8d939b', topH: 7, tufts: false, friction: 0.35 },
  sand: { top: '#f3d38e', topDark: '#d9b264', body: '#d39a5a', dark: '#9a6234', outline: '#5a3a1f', speck: '#e6b877', topH: 9, tufts: false, friction: 0.3 },
  snow: { top: '#f7fbff', topDark: '#cfe0f2', body: '#7d8fa6', dark: '#4e5d72', outline: '#27323f', speck: '#9fb0c4', topH: 13, tufts: false, friction: 0.25 },
  ice: { top: '#e2f7ff', topDark: '#9fd8f0', body: '#7dbfe2', dark: '#4f8db4', outline: '#24506c', speck: '#c4ecff', topH: 6, tufts: false, friction: 0.05 },
  concrete: { top: '#bdb8ae', topDark: '#97928a', body: '#8d887f', dark: '#5e5a54', outline: '#2c2a27', speck: '#a19c93', topH: 5, tufts: false, friction: 0.35 },
  metal: { top: '#a3afbb', topDark: '#6f7b87', body: '#5d6873', dark: '#3a424b', outline: '#1b1f24', speck: '#7c8893', topH: 4, tufts: false, friction: 0.32 },
  wood: { top: '#cf9456', topDark: '#a46c38', body: '#9a6534', dark: '#6e4421', outline: '#3a230f', speck: '#b97c45', topH: 4, tufts: false, friction: 0.35 },
  masonry: { top: '#8fbf62', topDark: '#5f8c44', body: '#a39c86', dark: '#6f6957', outline: '#2f2c24', speck: '#bdb59d', topH: 7, tufts: true, friction: 0.35 },
}

export type Pt = readonly [number, number]
export type Rect = readonly [number, number, number, number]
export type PlatformStyle = 'rock' | 'plank' | 'girder' | 'block' | 'container'
/** Collision is the rectangle; the art is traced inside it, so what you see is what you stand on. */
export interface PlatformDefinition { r: Rect; mat: MaterialId; style: PlatformStyle }
/** Ground (solid below the line) and optional ceiling (solid above it). Both are real collision. */
export interface TerrainDefinition { ground: Pt[]; mat: MaterialId; ceil?: Pt[]; ceilMat?: MaterialId }
/** y = surface the point stands on. Omit it to stand on the ground. */
export interface SpawnPoint { x: number; y?: number }
export interface PickupSpawnPoint extends SpawnPoint { kind: 0 | 1 } // 0 health, 1 ammo + grenades
export type BackdropKind = 'mountains' | 'snowpeaks' | 'mesas' | 'dunes' | 'forest' | 'pines' | 'jungle' | 'factory' | 'cave' | 'ruins'
/** f: scroll factor (0 = fixed to the sky, 1 = moves with the world). y: where its horizon sits on screen (0..1). */
export interface ParallaxLayer { kind: BackdropKind; f: number; y: number; color: string; seed: number }
export type DecoKind =
  | 'tree' | 'pine' | 'palm' | 'jungleTree' | 'bush' | 'fern' | 'rock' | 'crate' | 'barrel' | 'sign'
  | 'tower' | 'rope' | 'hut' | 'house' | 'cabin' | 'cactus' | 'stalagmite' | 'stalactite' | 'icicle' | 'iceSpike'
  | 'crystal' | 'tank' | 'pipe' | 'pillar' | 'statue' | 'caveBack' | 'vent'
  | 'tallgrass' | 'flag' | 'fan' | 'lamp' | 'beacon' | 'torch' | 'waterfall' | 'pool' | 'vine'
/** bg: behind terrain. deco: on terrain, behind players (default). fg: in front of players, fades when you're behind it. */
export type DecoLayer = 'bg' | 'deco' | 'fg'
/** Decorations never collide. */
/** y: base point (omit to sit on the ground, or hang from the ceiling for stalactites). dy: extra offset, e.g. a crate stacked on another. */
export interface DecorationDefinition { k: DecoKind; x: number; y?: number; dy?: number; s?: number; w?: number; h?: number; z?: DecoLayer; flip?: boolean }
export interface LightSource { x: number; y: number; r: number; color: string; flicker?: boolean; blink?: boolean }
export interface LightingConfiguration { ambient: string | null; lights: LightSource[] }
export type ParticleKind = 'leaf' | 'snow' | 'dust' | 'mist' | 'spore' | 'ember'
export interface ParticleConfiguration { kind: ParticleKind; count: number; color: string }
export interface EnvironmentTheme {
  name: string
  sky: readonly [string, string, string]
  sun: { x: number; y: number; r: number; color: string } | null
  clouds: number; cloud: string
  fog: string // haze between parallax layers
  rays: boolean // light shafts
}
export type Ambience = 'forest' | 'cave' | 'wind' | 'industrial' | 'jungle'
export interface AudioConfiguration { ambience: Ambience; volume: number }
export interface CameraBounds { x0: number; y0: number; x1: number; y1: number }
export interface MapDefinition {
  id: string; name: string; size: 'Small' | 'Medium' | 'Large'; players: string; description: string; modes: string[]
  w: number; h: number
  theme: EnvironmentTheme
  parallax: ParallaxLayer[]
  terrain: TerrainDefinition
  platforms: PlatformDefinition[]
  decorations: DecorationDefinition[]
  spawns: SpawnPoint[]
  pickups: PickupSpawnPoint[]
  lighting: LightingConfiguration
  particles: ParticleConfiguration[]
  camera: CameraBounds
  audio: AudioConfiguration
}

/* ───────────── Helpers ───────────── */

/** Smooth curve through control points (Catmull-Rom in y, linear in x so it stays a height field). */
function curve(pts: readonly Pt[], step = 24): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!
    const n = Math.max(1, Math.round((p2[0] - p1[0]) / step))
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t
      const y = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
      out.push([p1[0] + (p2[0] - p1[0]) * t, y])
    }
  }
  out.push(pts[pts.length - 1]!)
  return out
}
const P = (x: number, y: number, w: number, h: number, mat: MaterialId, style: PlatformStyle = 'rock'): PlatformDefinition => ({ r: [x, y, w, h], mat, style })

export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* ───────────── Collision ───────────── */

export interface Body { x: number; y: number; vx: number; vy: number }

export function fieldAt(pts: readonly Pt[], x: number): number {
  let lo = 0, hi = pts.length - 1
  if (x <= pts[0]![0]) return pts[0]![1]
  if (x >= pts[hi]![0]) return pts[hi]![1]
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pts[mid]![0] <= x) lo = mid; else hi = mid }
  const a = pts[lo]!, b = pts[hi]!
  return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])
}
export const spawnY = (m: MapDefinition, s: SpawnPoint) => s.y ?? fieldAt(m.terrain.ground, s.x)

/** Highest walkable surface at x, at or below y. Used for contact shadows. */
export function surfaceBelow(m: MapDefinition, x: number, y: number): number {
  let s = fieldAt(m.terrain.ground, x)
  for (const p of m.platforms) { const r = p.r; if (x >= r[0] && x <= r[0] + r[2] && r[1] >= y - 1 && r[1] < s) s = r[1] }
  return s
}

const overlaps = (b: Body, hw: number, hh: number, r: Rect) =>
  b.x + hw > r[0] && b.x - hw < r[0] + r[2] && b.y + hh > r[1] && b.y - hh < r[1] + r[3]

/** Moves a body one tick. Returns the material it landed on, or null if airborne. */
export function moveBody(m: MapDefinition, b: Body, hw: number, hh: number, bounce: number): MaterialId | null {
  const { ground, ceil } = m.terrain
  let on: MaterialId | null = null
  const px = b.x
  b.x += b.vx
  for (const p of m.platforms) if (overlaps(b, hw, hh, p.r)) { b.x = b.vx > 0 ? p.r[0] - hw : p.r[0] + p.r[2] + hw; b.vx *= -bounce }
  if (b.x < hw) { b.x = hw; b.vx *= -bounce } else if (b.x > m.w - hw) { b.x = m.w - hw; b.vx *= -bounce }
  // Slopes: step up gentle ones, treat steep ones as walls.
  const g = fieldAt(ground, b.x), c = ceil ? fieldAt(ceil, b.x) : 0
  if (b.y + hh > g) { if (b.y + hh - g > 14) { b.x = px; b.vx *= -bounce } else b.y = g - hh }
  else if (b.y - hh < c) { if (c - (b.y - hh) > 14) { b.x = px; b.vx *= -bounce } else b.y = c + hh }
  b.y += b.vy
  for (const p of m.platforms)
    if (overlaps(b, hw, hh, p.r)) {
      if (b.vy > 0) { b.y = p.r[1] - hh; on = p.mat } else b.y = p.r[1] + p.r[3] + hh
      b.vy *= -bounce
    }
  const g2 = fieldAt(ground, b.x), c2 = ceil ? fieldAt(ceil, b.x) : 0
  if (b.y + hh > g2) { b.y = g2 - hh; if (b.vy >= 0) on = m.terrain.mat; b.vy *= -bounce }
  else if (b.y - hh < c2) { b.y = c2 + hh; if (b.vy < 0) b.vy *= -bounce }
  return on
}

/** Where along the segment (0..1) it first enters the box, or null if it misses. */
export function segRect(x: number, y: number, dx: number, dy: number, bx: number, by: number, bw: number, bh: number): number | null {
  let t0 = 0, t1 = 1
  const axes: [number, number, number, number][] = [[x, dx, bx, bx + bw], [y, dy, by, by + bh]]
  for (const [p, d, lo, hi] of axes) {
    if (d === 0) { if (p < lo || p > hi) return null; continue }
    let a = (lo - p) / d, b = (hi - p) / d
    if (a > b) [a, b] = [b, a]
    t0 = Math.max(t0, a); t1 = Math.min(t1, b)
    if (t0 > t1) return null
  }
  return t0
}
function segSeg(x: number, y: number, dx: number, dy: number, ax: number, ay: number, ex: number, ey: number): number | null {
  const den = dx * ey - dy * ex
  if (den === 0) return null
  const t = ((ax - x) * ey - (ay - y) * ex) / den
  const u = ((ax - x) * dy - (ay - y) * dx) / den
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null
}
const minT = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : Math.min(a, b))
function segField(pts: readonly Pt[], x: number, y: number, dx: number, dy: number): number | null {
  const x0 = Math.min(x, x + dx), x1 = Math.max(x, x + dx)
  let best: number | null = null
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!
    if (b[0] < x0 || a[0] > x1) continue
    best = minT(best, segSeg(x, y, dx, dy, a[0], a[1], b[0] - a[0], b[1] - a[1]))
  }
  return best
}
/** First solid thing a moving point hits this tick (0..1 along its motion), or null. */
export function segHit(m: MapDefinition, x: number, y: number, dx: number, dy: number): number | null {
  let t: number | null = null
  for (const p of m.platforms) t = minT(t, segRect(x, y, dx, dy, p.r[0], p.r[1], p.r[2], p.r[3]))
  t = minT(t, segField(m.terrain.ground, x, y, dx, dy))
  if (m.terrain.ceil) t = minT(t, segField(m.terrain.ceil, x, y, dx, dy))
  return t
}

/* ───────────── The arenas ───────────── */

const forest: MapDefinition = {
  id: 'forest-outpost', name: 'Forest Outpost', size: 'Medium', players: '2–6', modes: ['Deathmatch'],
  description: 'Grassy hills, rope bridges and a rock arch with a tunnel under it. Lots of open sky for jetpack duels.',
  w: 2400, h: 1200,
  theme: { name: 'Temperate forest', sky: ['#5fb0ff', '#a9d8ff', '#eaf7ff'], sun: { x: 0.8, y: 0.16, r: 46, color: '#fff3b0' }, clouds: 7, cloud: '#ffffff', fog: 'rgba(225,242,255,0.2)', rays: true },
  parallax: [
    { kind: 'mountains', f: 0.12, y: 0.55, color: '#9ab7cf', seed: 1 },
    { kind: 'forest', f: 0.3, y: 0.68, color: '#6c9a7a', seed: 2 },
    { kind: 'forest', f: 0.55, y: 0.82, color: '#4b7a55', seed: 3 },
  ],
  terrain: { ground: curve([[0, 1000], [220, 985], [420, 930], [620, 945], [800, 1010], [1000, 1045], [1200, 1040], [1400, 1045], [1600, 1010], [1780, 945], [1980, 930], [2180, 985], [2400, 1000]]), mat: 'grass' },
  platforms: [
    P(900, 880, 600, 64, 'grass'),
    P(300, 760, 260, 14, 'wood', 'plank'), P(1840, 760, 260, 14, 'wood', 'plank'),
    P(560, 620, 220, 44, 'grass'), P(1620, 620, 220, 44, 'grass'),
    P(1060, 560, 280, 46, 'grass'),
    P(180, 460, 200, 42, 'grass'), P(2020, 460, 200, 42, 'grass'),
    P(760, 380, 200, 40, 'grass'), P(1440, 380, 200, 40, 'grass'),
    P(1100, 240, 200, 40, 'grass'),
  ],
  decorations: [
    { k: 'tree', x: 80, s: 1.2, z: 'bg' }, { k: 'pine', x: 500, s: 1.1, z: 'bg' }, { k: 'tree', x: 1900, s: 1.3, z: 'bg' },
    { k: 'pine', x: 2300, z: 'bg' }, { k: 'tree', x: 2120, s: 0.9, z: 'bg' }, { k: 'pine', x: 700, s: 0.9, z: 'bg' },
    { k: 'caveBack', x: 900, y: 944, w: 600, h: 110, z: 'bg' },
    { k: 'hut', x: 1200, y: 560, z: 'bg' },
    { k: 'rope', x: 300, y: 760, w: 260 }, { k: 'rope', x: 1840, y: 760, w: 260 },
    { k: 'rock', x: 240 }, { k: 'bush', x: 360 }, { k: 'crate', x: 340, y: 760 }, { k: 'crate', x: 2060, y: 760 },
    { k: 'barrel', x: 2000 }, { k: 'sign', x: 820 }, { k: 'rock', x: 2160, s: 1.2 }, { k: 'bush', x: 1700, y: 620 },
    { k: 'bush', x: 230, y: 460, s: 0.8 }, { k: 'rock', x: 1180, y: 240, s: 0.7 },
    { k: 'flag', x: 1300, y: 560 },
    { k: 'tallgrass', x: 150 }, { k: 'tallgrass', x: 640 }, { k: 'tallgrass', x: 1060, y: 880 }, { k: 'tallgrass', x: 1430, y: 880 },
    { k: 'tallgrass', x: 1760 }, { k: 'tallgrass', x: 2250 }, { k: 'tallgrass', x: 620, y: 620 }, { k: 'tallgrass', x: 1800, y: 620 },
    { k: 'bush', x: 40, z: 'fg', s: 1.3 }, { k: 'fern', x: 2370, z: 'fg', s: 1.2 },
  ],
  spawns: [{ x: 120 }, { x: 2280 }, { x: 1200 }, { x: 1000, y: 880 }, { x: 430, y: 760 }, { x: 1970, y: 760 }, { x: 670, y: 620 }, { x: 1730, y: 620 }, { x: 1200, y: 560 }, { x: 280, y: 460 }, { x: 2120, y: 460 }, { x: 860, y: 380 }, { x: 1540, y: 380 }, { x: 1200, y: 240 }],
  pickups: [{ x: 1200, kind: 0 }, { x: 1200, y: 240, kind: 1 }, { x: 280, y: 460, kind: 0 }, { x: 2120, y: 460, kind: 1 }],
  lighting: { ambient: null, lights: [] },
  particles: [{ kind: 'leaf', count: 24, color: '#7cbf4a' }, { kind: 'leaf', count: 10, color: '#e0a13a' }],
  camera: { x0: 0, y0: 0, x1: 2400, y1: 1200 },
  audio: { ambience: 'forest', volume: 0.5 },
}

const caverns: MapDefinition = {
  id: 'deep-caverns', name: 'Deep Caverns', size: 'Medium', players: '2–6', modes: ['Deathmatch'],
  description: 'A sealed cave system lit by crystals and torches. Low ceilings, stacked rock shelves and an underground pool.',
  w: 2200, h: 1300,
  theme: { name: 'Underground', sky: ['#0d0a14', '#1a1424', '#251c30'], sun: null, clouds: 0, cloud: '#ffffff', fog: 'rgba(60,40,80,0.2)', rays: false },
  parallax: [
    { kind: 'cave', f: 0.25, y: 0.5, color: '#2b2338', seed: 4 },
    { kind: 'cave', f: 0.5, y: 0.5, color: '#3b3049', seed: 5 },
  ],
  terrain: {
    ground: curve([[0, 1220], [180, 1180], [360, 1210], [540, 1120], [700, 1150], [880, 1232], [1100, 1268], [1320, 1232], [1500, 1150], [1660, 1120], [1840, 1210], [2020, 1180], [2200, 1220]]),
    mat: 'stone',
    ceil: curve([[0, 90], [200, 170], [420, 130], [640, 230], [860, 150], [1100, 270], [1340, 160], [1560, 240], [1780, 140], [2000, 190], [2200, 100]]),
    ceilMat: 'stone',
  },
  platforms: [
    P(150, 950, 240, 50, 'stone'), P(1810, 950, 240, 50, 'stone'),
    P(600, 880, 260, 50, 'stone'), P(1340, 880, 260, 50, 'stone'),
    P(950, 760, 300, 60, 'stone'),
    P(300, 640, 220, 46, 'stone'), P(1680, 640, 220, 46, 'stone'),
    P(760, 520, 200, 46, 'stone'), P(1240, 520, 200, 46, 'stone'),
    P(1000, 380, 200, 46, 'stone'),
    P(120, 420, 180, 44, 'stone'), P(1900, 420, 180, 44, 'stone'),
  ],
  decorations: [
    ...[260, 520, 700, 980, 1220, 1460, 1700, 1940].map((x, i): DecorationDefinition => ({ k: 'stalactite', x, s: 0.8 + (i % 3) * 0.3 })),
    ...[60, 430, 640, 1560, 1760, 2140].map((x, i): DecorationDefinition => ({ k: 'stalagmite', x, s: 0.8 + (i % 2) * 0.4 })),
    { k: 'crystal', x: 480 }, { k: 'crystal', x: 1100, y: 760 }, { k: 'crystal', x: 1720, y: 640, s: 0.8 },
    { k: 'crystal', x: 240, y: 950, s: 0.9 }, { k: 'crystal', x: 1980, y: 420 }, { k: 'crystal', x: 860, y: 520, s: 0.7 },
    { k: 'pool', x: 930, y: 1246, w: 340 },
    { k: 'torch', x: 620, y: 880 }, { k: 'torch', x: 1580, y: 880 }, { k: 'torch', x: 1020, y: 380 },
    { k: 'rock', x: 330, y: 950, s: 0.8 }, { k: 'rock', x: 1880, y: 950 },
    { k: 'stalagmite', x: 1180, z: 'fg', s: 0.7 },
  ],
  spawns: [{ x: 90 }, { x: 2110 }, { x: 1100 }, { x: 270, y: 950 }, { x: 1930, y: 950 }, { x: 730, y: 880 }, { x: 1470, y: 880 }, { x: 1100, y: 760 }, { x: 410, y: 640 }, { x: 1790, y: 640 }, { x: 1100, y: 380 }, { x: 210, y: 420 }, { x: 1990, y: 420 }],
  pickups: [{ x: 900, y: 520, kind: 0 }, { x: 1340, y: 520, kind: 1 }, { x: 1100, kind: 0 }, { x: 210, y: 420, kind: 1 }],
  lighting: { ambient: 'rgba(10,6,24,0.42)', lights: [] },
  particles: [{ kind: 'dust', count: 30, color: '#cdb99a' }, { kind: 'spore', count: 22, color: '#8ff3ff' }, { kind: 'mist', count: 5, color: '#b9a6d6' }],
  camera: { x0: 0, y0: 0, x1: 2200, y1: 1300 },
  audio: { ambience: 'cave', volume: 0.6 },
}

const desert: MapDefinition = {
  id: 'desert-compound', name: 'Desert Compound', size: 'Large', players: '3–6', modes: ['Deathmatch'],
  description: 'A walled compound between sandstone mesas. Watchtowers on each flank and a tunnel under the western dune.',
  w: 2600, h: 1200,
  theme: { name: 'Arid desert', sky: ['#f39b52', '#ffd08a', '#fff1c9'], sun: { x: 0.25, y: 0.3, r: 60, color: '#fff2b8' }, clouds: 3, cloud: '#fff3e0', fog: 'rgba(255,220,170,0.22)', rays: false },
  parallax: [
    { kind: 'mesas', f: 0.15, y: 0.6, color: '#e2b07a', seed: 6 },
    { kind: 'dunes', f: 0.4, y: 0.75, color: '#d19357', seed: 7 },
  ],
  terrain: { ground: curve([[0, 980], [260, 940], [520, 990], [760, 1050], [1000, 1040], [1300, 1060], [1600, 1040], [1840, 1050], [2080, 990], [2340, 940], [2600, 980]]), mat: 'sand' },
  platforms: [
    P(600, 880, 320, 56, 'sand'),
    P(1150, 880, 300, 26, 'concrete', 'block'),
    P(380, 700, 120, 14, 'wood', 'plank'), P(2100, 700, 120, 14, 'wood', 'plank'),
    P(1660, 800, 260, 44, 'sand'),
    P(1000, 620, 200, 40, 'sand'), P(1400, 620, 200, 40, 'sand'),
    P(560, 520, 220, 40, 'sand'), P(1820, 520, 220, 40, 'sand'),
    P(1200, 380, 200, 40, 'sand'),
    P(160, 480, 200, 40, 'sand'), P(2240, 480, 200, 40, 'sand'),
  ],
  decorations: [
    { k: 'palm', x: 110, z: 'bg' }, { k: 'palm', x: 2490, z: 'bg', flip: true, s: 1.1 },
    { k: 'house', x: 1150, y: 906, w: 300, z: 'bg' },
    { k: 'tower', x: 440, y: 700, z: 'bg' }, { k: 'tower', x: 2160, y: 700, z: 'bg' },
    { k: 'caveBack', x: 600, y: 936, w: 320, h: 130, z: 'bg' },
    { k: 'cactus', x: 300 }, { k: 'cactus', x: 1000, s: 0.8 }, { k: 'cactus', x: 1980 }, { k: 'cactus', x: 2420, s: 1.1 },
    { k: 'crate', x: 1110 }, { k: 'crate', x: 1490 }, { k: 'crate', x: 1490, dy: -30 }, { k: 'barrel', x: 1525 },
    { k: 'sign', x: 540 }, { k: 'rock', x: 1760, y: 800 }, { k: 'rock', x: 2300, s: 1.3 }, { k: 'barrel', x: 1240, y: 380 },
    { k: 'flag', x: 1430, y: 880 },
    { k: 'cactus', x: 2570, z: 'fg', s: 1.2 },
  ],
  spawns: [{ x: 80 }, { x: 2520 }, { x: 1300 }, { x: 1300, y: 880 }, { x: 760, y: 880 }, { x: 440, y: 700 }, { x: 2160, y: 700 }, { x: 1790, y: 800 }, { x: 1100, y: 620 }, { x: 1500, y: 620 }, { x: 670, y: 520 }, { x: 1930, y: 520 }, { x: 1300, y: 380 }, { x: 260, y: 480 }, { x: 2340, y: 480 }],
  pickups: [{ x: 1300, kind: 0 }, { x: 760, kind: 1 }, { x: 260, y: 480, kind: 0 }, { x: 2340, y: 480, kind: 1 }],
  lighting: { ambient: null, lights: [] },
  particles: [{ kind: 'dust', count: 45, color: '#e8c38a' }],
  camera: { x0: 0, y0: 0, x1: 2600, y1: 1200 },
  audio: { ambience: 'wind', volume: 0.45 },
}

const frozen: MapDefinition = {
  id: 'frozen-highlands', name: 'Frozen Highlands', size: 'Medium', players: '2–6', modes: ['Deathmatch'],
  description: 'Snowy ledges, a research station and an ice cave. Ice platforms are slippery, so plan your landings.',
  w: 2400, h: 1300,
  theme: { name: 'Alpine winter', sky: ['#8fb4d9', '#c3d9ee', '#eef6ff'], sun: { x: 0.7, y: 0.2, r: 40, color: '#fffbe8' }, clouds: 5, cloud: '#f3f8ff', fog: 'rgba(235,245,255,0.3)', rays: false },
  parallax: [
    { kind: 'snowpeaks', f: 0.12, y: 0.55, color: '#c3d6ea', seed: 8 },
    { kind: 'pines', f: 0.35, y: 0.72, color: '#7d9bb5', seed: 9 },
    { kind: 'pines', f: 0.6, y: 0.86, color: '#5c7c96', seed: 10 },
  ],
  terrain: { ground: curve([[0, 1100], [220, 1040], [440, 1080], [640, 1180], [900, 1200], [1200, 1190], [1500, 1200], [1760, 1180], [1960, 1080], [2180, 1040], [2400, 1100]]), mat: 'snow' },
  platforms: [
    P(900, 1020, 600, 64, 'ice'),
    P(200, 860, 260, 44, 'snow'), P(1940, 860, 260, 44, 'snow'),
    P(620, 780, 220, 40, 'ice'), P(1560, 780, 220, 40, 'ice'),
    P(1050, 700, 300, 46, 'snow'),
    P(380, 600, 200, 40, 'snow'), P(1820, 600, 200, 40, 'snow'),
    P(800, 480, 200, 40, 'ice'), P(1400, 480, 200, 40, 'ice'),
    P(1100, 320, 200, 40, 'snow'),
  ],
  decorations: [
    { k: 'pine', x: 60, s: 1.2, z: 'bg' }, { k: 'pine', x: 340, z: 'bg' }, { k: 'pine', x: 520, s: 0.9, z: 'bg' },
    { k: 'pine', x: 1880, s: 1.1, z: 'bg' }, { k: 'pine', x: 2080, z: 'bg' }, { k: 'pine', x: 2330, s: 1.2, z: 'bg' },
    { k: 'cabin', x: 1200, y: 700, z: 'bg' },
    { k: 'caveBack', x: 900, y: 1084, w: 600, h: 130, z: 'bg' },
    ...[950, 1080, 1210, 1330, 1450].map((x, i): DecorationDefinition => ({ k: 'icicle', x, y: 1084, s: 0.8 + (i % 2) * 0.5 })),
    ...[240, 330, 420].map((x): DecorationDefinition => ({ k: 'icicle', x, y: 904, s: 0.7 })),
    { k: 'iceSpike', x: 700 }, { k: 'iceSpike', x: 1700, s: 1.2 }, { k: 'iceSpike', x: 1150, y: 320, s: 0.6 },
    { k: 'crate', x: 1310, y: 700 }, { k: 'barrel', x: 1090, y: 700 }, { k: 'rock', x: 2240 }, { k: 'sign', x: 160 },
    { k: 'beacon', x: 1150, y: 700 - 66 },
    { k: 'pine', x: 2380, z: 'fg', s: 0.8 },
  ],
  spawns: [{ x: 80 }, { x: 2320 }, { x: 1200 }, { x: 1200, y: 1020 }, { x: 330, y: 860 }, { x: 2070, y: 860 }, { x: 730, y: 780 }, { x: 1670, y: 780 }, { x: 1200, y: 700 }, { x: 480, y: 600 }, { x: 1920, y: 600 }, { x: 900, y: 480 }, { x: 1500, y: 480 }, { x: 1200, y: 320 }],
  pickups: [{ x: 1200, kind: 0 }, { x: 1200, y: 320, kind: 1 }, { x: 480, y: 600, kind: 0 }, { x: 1920, y: 600, kind: 1 }],
  lighting: { ambient: 'rgba(80,110,160,0.08)', lights: [] },
  particles: [{ kind: 'snow', count: 80, color: '#ffffff' }, { kind: 'mist', count: 4, color: '#ffffff' }],
  camera: { x0: 0, y0: 0, x1: 2400, y1: 1300 },
  audio: { ambience: 'wind', volume: 0.7 },
}

const industrial: MapDefinition = {
  id: 'industrial-complex', name: 'Industrial Complex', size: 'Medium', players: '2–6', modes: ['Deathmatch'],
  description: 'Steel catwalks, shipping containers and a service tunnel. Tight angles and long sightlines.',
  w: 2400, h: 1200,
  theme: { name: 'Industrial dusk', sky: ['#4f5469', '#8c7f86', '#d7a98a'], sun: { x: 0.15, y: 0.42, r: 50, color: '#ffd2a6' }, clouds: 4, cloud: '#b8aab0', fog: 'rgba(160,140,140,0.24)', rays: false },
  parallax: [
    { kind: 'factory', f: 0.18, y: 0.6, color: '#7a7c86', seed: 11 },
    { kind: 'factory', f: 0.42, y: 0.76, color: '#585b66', seed: 12 },
  ],
  terrain: { ground: [[0, 1080], [300, 1080], [420, 1020], [700, 1020], [820, 1080], [1580, 1080], [1700, 1020], [1980, 1020], [2100, 1080], [2400, 1080]], mat: 'concrete' },
  platforms: [
    P(820, 960, 760, 40, 'concrete', 'block'),
    P(480, 960, 180, 60, 'metal', 'container'), P(1740, 960, 180, 60, 'metal', 'container'),
    P(150, 860, 240, 22, 'metal', 'girder'), P(2010, 860, 240, 22, 'metal', 'girder'),
    P(520, 760, 260, 22, 'metal', 'girder'), P(1620, 760, 260, 22, 'metal', 'girder'),
    P(980, 700, 440, 26, 'metal', 'girder'),
    P(300, 560, 220, 22, 'metal', 'girder'), P(1880, 560, 220, 22, 'metal', 'girder'),
    P(760, 460, 240, 22, 'metal', 'girder'), P(1400, 460, 240, 22, 'metal', 'girder'),
    P(1080, 320, 240, 22, 'metal', 'girder'),
  ],
  decorations: [
    { k: 'tank', x: 200, z: 'bg' }, { k: 'tank', x: 2200, s: 1.1, z: 'bg' },
    { k: 'pipe', x: 0, y: 640, w: 2400, z: 'bg' }, { k: 'pipe', x: 960, y: 120, h: 580, z: 'bg' }, { k: 'pipe', x: 1460, y: 120, h: 580, z: 'bg' },
    { k: 'caveBack', x: 820, y: 1000, w: 760, h: 80, z: 'bg' },
    { k: 'fan', x: 600, y: 420 }, { k: 'fan', x: 1800, y: 420 }, { k: 'fan', x: 1200, y: 560, s: 0.8 },
    { k: 'lamp', x: 1200, y: 726 }, { k: 'lamp', x: 650, y: 782 }, { k: 'lamp', x: 1750, y: 782 }, { k: 'lamp', x: 1200, y: 1000 },
    { k: 'vent', x: 360 }, { k: 'vent', x: 2040 }, { k: 'vent', x: 1000, y: 1080 },
    { k: 'beacon', x: 1100, y: 320 }, { k: 'beacon', x: 1300, y: 320 },
    { k: 'barrel', x: 330, y: 860 }, { k: 'barrel', x: 2080 }, { k: 'crate', x: 760 }, { k: 'crate', x: 1640 }, { k: 'crate', x: 1640, dy: -30 },
    { k: 'sign', x: 140 },
  ],
  spawns: [{ x: 120 }, { x: 2280 }, { x: 1200 }, { x: 570, y: 960 }, { x: 1830, y: 960 }, { x: 270, y: 860 }, { x: 2130, y: 860 }, { x: 650, y: 760 }, { x: 1750, y: 760 }, { x: 1200, y: 700 }, { x: 410, y: 560 }, { x: 1990, y: 560 }, { x: 880, y: 460 }, { x: 1520, y: 460 }, { x: 1200, y: 320 }],
  pickups: [{ x: 1200, kind: 0 }, { x: 1200, y: 320, kind: 1 }, { x: 410, y: 560, kind: 0 }, { x: 1990, y: 560, kind: 1 }],
  lighting: { ambient: 'rgba(30,20,30,0.18)', lights: [] },
  particles: [{ kind: 'ember', count: 18, color: '#ffb35c' }, { kind: 'dust', count: 20, color: '#bdb3a8' }],
  camera: { x0: 0, y0: 0, x1: 2400, y1: 1200 },
  audio: { ambience: 'industrial', volume: 0.5 },
}

const ruins: MapDefinition = {
  id: 'forgotten-ruins', name: 'Forgotten Ruins', size: 'Large', players: '3–6', modes: ['Deathmatch'],
  description: 'An overgrown temple in the jungle with a hidden chamber, broken rope bridges and a waterfall.',
  w: 2600, h: 1300,
  theme: { name: 'Jungle ruins', sky: ['#7cc6c9', '#b8e3c8', '#eaf7d8'], sun: { x: 0.6, y: 0.12, r: 44, color: '#fffbd0' }, clouds: 4, cloud: '#f4fff4', fog: 'rgba(210,240,210,0.22)', rays: true },
  parallax: [
    { kind: 'jungle', f: 0.15, y: 0.55, color: '#5f8f73', seed: 13 },
    { kind: 'ruins', f: 0.32, y: 0.7, color: '#4b7560', seed: 14 },
    { kind: 'jungle', f: 0.58, y: 0.84, color: '#335c45', seed: 15 },
  ],
  terrain: { ground: curve([[0, 1120], [220, 1080], [460, 1140], [700, 1200], [940, 1180], [1160, 1225], [1440, 1225], [1660, 1180], [1900, 1200], [2140, 1140], [2380, 1080], [2600, 1120]]), mat: 'grass' },
  platforms: [
    P(1000, 1040, 600, 70, 'masonry', 'block'),
    P(1080, 880, 440, 40, 'masonry', 'block'), P(1170, 720, 260, 40, 'masonry', 'block'), P(1240, 560, 120, 36, 'masonry', 'block'),
    P(420, 800, 200, 14, 'wood', 'plank'), P(700, 800, 120, 14, 'wood', 'plank'),
    P(1880, 800, 120, 14, 'wood', 'plank'), P(2080, 800, 200, 14, 'wood', 'plank'),
    P(150, 620, 220, 44, 'grass'), P(2230, 620, 220, 44, 'grass'),
    P(560, 520, 200, 40, 'grass'), P(1840, 520, 200, 40, 'grass'),
    P(1200, 320, 200, 40, 'grass'),
  ],
  decorations: [
    { k: 'jungleTree', x: 300, s: 1.3, z: 'bg' }, { k: 'jungleTree', x: 820, z: 'bg' }, { k: 'jungleTree', x: 1820, s: 1.1, z: 'bg' }, { k: 'jungleTree', x: 2300, s: 1.2, z: 'bg' },
    { k: 'pillar', x: 1040, y: 1040, h: 150, z: 'bg' }, { k: 'pillar', x: 1560, y: 1040, h: 150, z: 'bg' }, { k: 'pillar', x: 760, h: 80, z: 'bg' }, { k: 'pillar', x: 1960, h: 70, z: 'bg' },
    { k: 'statue', x: 1300, y: 1040, z: 'bg', s: 0.8 },
    { k: 'caveBack', x: 1000, y: 1110, w: 600, h: 120, z: 'bg' },
    { k: 'rope', x: 420, y: 800, w: 200 }, { k: 'rope', x: 2080, y: 800, w: 200 },
    { k: 'waterfall', x: 2400, y: 664, w: 46 },
    { k: 'vine', x: 200, y: 664 }, { k: 'vine', x: 330, y: 664, s: 0.8 }, { k: 'vine', x: 600, y: 560 }, { k: 'vine', x: 1890, y: 560, s: 1.2 },
    { k: 'vine', x: 2280, y: 664 }, { k: 'vine', x: 1250, y: 360, s: 0.7 }, { k: 'vine', x: 1120, y: 920, s: 0.8 },
    { k: 'torch', x: 1120, y: 1040 }, { k: 'torch', x: 1480, y: 1040 },
    { k: 'bush', x: 90 }, { k: 'bush', x: 2200, s: 1.2 }, { k: 'fern', x: 650 }, { k: 'fern', x: 1700 }, { k: 'rock', x: 900 },
    { k: 'tallgrass', x: 500 }, { k: 'tallgrass', x: 1950 }, { k: 'tallgrass', x: 2500 }, { k: 'tallgrass', x: 260, y: 620 },
    { k: 'fern', x: 60, z: 'fg', s: 1.4 }, { k: 'fern', x: 2560, z: 'fg', s: 1.3 }, { k: 'bush', x: 1720, z: 'fg', s: 1.2 },
  ],
  spawns: [{ x: 80 }, { x: 2520 }, { x: 1300 }, { x: 520, y: 800 }, { x: 2180, y: 800 }, { x: 1040, y: 1040 }, { x: 1560, y: 1040 }, { x: 1300, y: 880 }, { x: 1300, y: 720 }, { x: 260, y: 620 }, { x: 2340, y: 620 }, { x: 660, y: 520 }, { x: 1940, y: 520 }, { x: 1300, y: 320 }],
  pickups: [{ x: 1300, kind: 0 }, { x: 1300, y: 560, kind: 1 }, { x: 260, y: 620, kind: 0 }, { x: 2340, y: 620, kind: 1 }],
  lighting: { ambient: 'rgba(10,40,20,0.08)', lights: [] },
  particles: [{ kind: 'leaf', count: 22, color: '#6fbf4a' }, { kind: 'spore', count: 14, color: '#e8ff9a' }, { kind: 'mist', count: 5, color: '#e9fff0' }],
  camera: { x0: 0, y0: 0, x1: 2600, y1: 1300 },
  audio: { ambience: 'jungle', volume: 0.55 },
}

export const MAPS: readonly MapDefinition[] = [forest, caverns, desert, frozen, industrial, ruins]
