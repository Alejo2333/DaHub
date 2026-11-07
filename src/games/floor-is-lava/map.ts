/** Shared by host and clients: deterministic map from a seed, plus lava timing. */
export interface Box {
  x: number; y: number; z: number; w: number; h: number; d: number; c: number
  mv?: { ax: 'x' | 'z'; amp: number; sp: number; ph: number }
}
export const START_TOP = 2
export const MAX_TOP = 58
export const COUNTDOWN = 5000
export const ENDED = 8000
export const LAVA0 = -4
/** Lava surface height after `ms` of play. Starts slow, speeds up. */
export const lavaAt = (ms: number) => { const s = ms / 1000; return LAVA0 + 0.4 * s + 0.004 * s * s }
export const spawnPos = (i: number) => ({ x: Math.cos(i * Math.PI / 6) * 5, z: Math.sin(i * Math.PI / 6) * 5 })
export const boxPos = (b: Box, T: number) => {
  if (!b.mv) return { x: b.x, z: b.z }
  const o = b.mv.amp * Math.sin(b.mv.sp * T + b.mv.ph)
  return b.mv.ax === 'x' ? { x: b.x + o, z: b.z } : { x: b.x, z: b.z + o }
}

const COLORS = [0xff5d8f, 0x4dabf7, 0x51cf66, 0xffd43b, 0xb197fc, 0xff922b, 0x22b8cf, 0xf783ac]
const rng = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1]

/** A climbing path of platforms: normal, stairs, bridges, moving platforms and jump obstacles. */
export function genMap(seed: number): Box[] {
  const r = rng(seed), R = (a: number, b: number) => a + (b - a) * r()
  const out: Box[] = []
  const add = (x: number, top: number, z: number, w: number, d: number, h = 0.6, mv?: Box['mv']) => {
    out.push({ x, y: top - h / 2, z, w, h, d, c: COLORS[(r() * COLORS.length) | 0], mv })
  }
  add(0, START_TOP, 0, 16, 16, 1)
  let cx = 0, cz = 0, top = START_TOP, hx = 8, hz = 8, dir = (r() * 4) | 0, n = 0
  const half = (d: number) => (d % 2 === 0 ? hx : hz)
  const latHalf = (d: number) => (d % 2 === 0 ? hz : hx)
  const clash = (x: number, z: number, s: number, t: number) =>
    out.some((b, i) => i < out.length - 3 && Math.abs(b.y + b.h / 2 - t) < 3.4 &&
      Math.abs(b.x - x) < b.w / 2 + s / 2 + 0.5 && Math.abs(b.z - z) < b.d / 2 + s / 2 + 0.5)
  while (top < MAX_TOP && n++ < 100) {
    const k = r()
    if (k < 0.5) {
      const s = R(3, 6.2), g = R(2, 3.4), ny = top + R(0.5, 1.1)
      const cands = [dir, (dir + 1) % 4, (dir + 3) % 4], off = (r() * 3) | 0
      let pick = { d: dir, x: 0, z: 0 }, found = false
      for (let i = 0; i < 3 && !found; i++) {
        const d = cands[(i + off) % 3]
        const lat = R(-1, 1) * Math.min(latHalf(d), s / 2) * 0.8, dist = half(d) + g + s / 2
        const x = cx + DX[d] * dist + (d % 2 === 0 ? 0 : lat), z = cz + DZ[d] * dist + (d % 2 === 0 ? lat : 0)
        if (i === 0) pick = { d, x, z }
        if (!clash(x, z, s, ny)) { pick = { d, x, z }; found = true }
      }
      add(pick.x, ny, pick.z, s, s)
      if (s > 5 && r() < 0.5) add(pick.x + R(-1, 1), ny + 1, pick.z + R(-1, 1), 1.2, 1.2, 1)
      cx = pick.x; cz = pick.z; top = ny; hx = hz = s / 2; dir = pick.d
    } else if (k < 0.65) {
      for (let i = 0; i < 5; i++) {
        const dist = half(dir) + 0.7 + i * 1.4, h = 0.5 * (i + 1)
        add(cx + DX[dir] * dist, top + h, cz + DZ[dir] * dist, dir % 2 === 0 ? 1.4 : 3, dir % 2 === 0 ? 3 : 1.4, h)
      }
      const dist = half(dir) + 0.7 + 4 * 1.4
      cx += DX[dir] * dist; cz += DZ[dir] * dist; top += 2.5
      hx = dir % 2 === 0 ? 0.7 : 1.5; hz = dir % 2 === 0 ? 1.5 : 0.7
    } else if (k < 0.8) {
      const L = 9, ny = top + R(0.2, 0.6), dist = half(dir) + 0.4 + L / 2
      cx += DX[dir] * dist; cz += DZ[dir] * dist
      add(cx, ny, cz, dir % 2 === 0 ? L : 2.2, dir % 2 === 0 ? 2.2 : L)
      hx = dir % 2 === 0 ? L / 2 : 1.1; hz = dir % 2 === 0 ? 1.1 : L / 2; top = ny
    } else {
      const amp = R(2.5, 3.2), ny = top + R(0.3, 0.6), near = half(dir) + 1.5 + 2 + amp
      const mx = cx + DX[dir] * near, mz = cz + DZ[dir] * near, sign = DX[dir] + DZ[dir]
      add(mx, ny, mz, 4, 4, 0.6, { ax: dir % 2 === 0 ? 'x' : 'z', amp: amp * sign, sp: R(0.5, 0.8), ph: -Math.PI / 2 })
      cx = mx + DX[dir] * amp; cz = mz + DZ[dir] * amp; top = ny; hx = hz = 2
    }
  }
  return out
}
