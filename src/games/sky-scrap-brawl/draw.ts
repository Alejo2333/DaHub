// @ts-nocheck -- drawing code ported as-is from the single-file game; the public surface is typed below
/**
 * Runs on every client, the host included. It draws the snapshots the host publishes, smoothing
 * fighters between them, and builds all particles locally from the snapshot's events.
 */
import { bloodSound, explosionSound, fallSound, grenadeLandSound, grenadeSound, gunSound, preloadSounds } from './sound';
import { BLAST, GUNS, H, INK, MAPS, MZ, NADE, ROSTER, SHIELD, SKI, W } from './shared';
import type { MatchSnap } from './shared';

export interface Renderer {
  /** Feed every published snapshot here, as it arrives. */
  push(s: MatchSnap | undefined): void;
  /** Call once per animation frame. */
  frame(now: number): void;
  setView(v: { self: string; name: (id: string) => string }): void;
}

export function createRenderer(cv: HTMLCanvasElement): Renderer {
  const g = cv.getContext('2d');
  preloadSounds();
  const reduce = matchMedia('(prefers-reduced-motion:reduce)');
  const num = v => typeof v === 'number' && Number.isFinite(v) ? v : 0;
  let Z = .8, VX = -160, VY = 0;
  const cam = { z: .8, x: 480, y: 300, tz: .8, tx: 480, ty: 300 };
  let prev = null, cur = null, arr = 0, interval = .05, lastEv = 0, mid = -1;
  let map = MAPS[0], plats = map.plats, players = [], bullets = [], crates = [], skills = [], t = 0, lt = 0, lastNow = 0;
  let parts = [], puffs = [], rings = [], chutes = [], streaks = [], booms = [], shards = [], pops = [], feed = [], shake = 0, blood = [], stains = [], mist = [], drips = [];
  const trails = new Map(), flash = new Map();
  let self = '', nameOf = (id: string) => id, meU = -1;

  // ---------- names ----------
  const short = s => { let n = ''; try { n = String(nameOf(s)) } catch { n = '' } n = n || 'Player'; return n.length > 12 ? n.slice(0, 11) + '…' : n };
  const dispName = p => p.clone ? 'Clone' : p.u === meU ? 'You' : p.id ? short(p.id) : p.name;
  const slotName = r => { const p = players.find(o => o.r === r && !o.clone); return p ? (p.u === meU ? 'You' : p.id ? short(p.id) : p.name) : ROSTER[r]?.[0] ?? '?' };

  // ---------- snapshots ----------
  function reset() {
    prev = cur = null; lastEv = 0; parts = []; puffs = []; rings = []; chutes = []; streaks = []; booms = []; shards = []; pops = []; feed = []; shake = 0; blood = []; stains = []; mist = []; drips = [];
    trails.clear(); flash.clear(); Object.assign(cam, { z: .8, x: 480, y: 300, tz: .8, tx: 480, ty: 300 });
  }
  function push(s) {
    if (!s) { reset(); mid = -1; return }
    lt = performance.now() / 1000;
    if (s.mid !== mid) { reset(); mid = s.mid; map = MAPS[s.m]; plats = map.plats }
    if (cur && s.t < cur.t) return;
    if (!cur || s.t > cur.t) { prev = cur; cur = s; arr = lt; interval = prev ? Math.min(.25, Math.max(.01, s.t - prev.t)) : .05 } else cur = s;
    for (const e of s.E) if (e[0] > lastEv) { lastEv = e[0]; onEvent(e) }
  }
  function onEvent(e) {
    const [, ty, ...a] = e, n = i => num(a[i]), str = i => String(a[i] ?? '');
    if (ty === 'b') burst(n(0), n(1), str(2), Math.min(40, n(3)));
    else if (ty === 'r') rings.push({ x: n(0), y: n(1), mr: Math.min(300, n(2)), l: Math.min(2, n(3)), l0: Math.min(2, n(3)) || 1, col: str(4) });
    else if (ty === 's') shatter(n(0), n(1), Math.min(40, n(2)), n(3));
    else if (ty === 'x') { boom(n(0), n(1)); explosionSound(n(0)) }
    else if (ty === 'n') grenadeSound(n(0));
    else if (ty === 'nl') grenadeLandSound(n(0));
    else if (ty === 'fl') fallSound(n(0));
    else if (ty === 'k') shake = Math.max(shake, Math.min(20, n(0)));
    else if (ty === 'l') landFx(n(0), n(1));
    else if (ty === 'o') spawnFx(n(0), n(1), str(2));
    else if (ty === 'f') { const x = n(0), y = n(1), f = n(2) < 0 ? -1 : 1, gun = str(3); if (gun in GUNS) gunSound(gun, x); burst(x + f * (14 + (MZ[gun] || 36)), y - 24, '#ffe066', 4); parts.push({ x, y: y - 26, vx: -f * 70, vy: -220, l: .7, col: gun == 'boom' ? '#c0392b' : '#d9a441' }); flash.set(n(4), lt) }
    else if (ty === 'p') { const u = n(0), big = !!n(4); if (n(5) || big || !pops.some(o => o.p === u && o.big)) { pops = pops.filter(o => o.p !== u); pops.push({ p: u, x: n(1), y: n(2), l: Math.min(2, n(3)), big, t: str(6).slice(0, 16) }) } }
    else if (ty === 'bd') { bleed(n(0), n(1), n(2), Math.min(40, n(3))); bloodSound(n(0), n(3)) }
    else if (ty === 'kf') { feed.unshift({ a: n(0), b: n(1), l: 4 }); feed.length = Math.min(feed.length, 3) }
  }
  function view(a, b, k) {
    const lerp = (x, y) => a && !jumped ? x + (y - x) * k : y;
    const jumped = a && Math.hypot(b.x - a.x, b.y - a.y) > 220; // respawn: snap, don't slide
    const [name, color] = ROSTER[b.r];
    return {
      u: b.u, r: b.r, id: b.id, x: lerp(a?.x, b.x), y: lerp(a?.y, b.y), vx: b.vx, face: b.f, lives: b.l, gun: b.g, ammo: b.a < 0 ? Infinity : b.a, nades: b.n,
      wobble: lerp(a?.w, b.w), safe: b.s, clone: b.c, fly: b.fl, thr: b.th, ground: b.gr, walk: lerp(a?.wk, b.wk), ia: lerp(a?.ia, b.ia),
      fx: { ice: lerp(a?.ice, b.ice), jet: lerp(a?.jet, b.jet), spd: b.sp, ghost: b.gh, shield: b.sh }, name, color, bot: !b.id,
    };
  }
  function frame(now) {
    const nowS = now / 1000, dt = Math.min(.05, nowS - lastNow || .016); lastNow = nowS; lt = nowS;
    if (!cur) { g.fillStyle = '#4a2f1c'; g.fillRect(0, 0, W, H + 70); return }
    const k = prev ? Math.min(1, (lt - arr) / interval) : 1;
    t = prev ? prev.t + (cur.t - prev.t) * k : cur.t;
    const pm = new Map(prev ? prev.P.map(p => [p.u, p]) : []);
    players = cur.P.map(b => view(pm.get(b.u), b, k));
    meU = cur.P.find(p => p.id === self && !p.c)?.u ?? -1;
    const ago = t - cur.t; // render a little behind the newest snapshot; bullets and timers are rewound to match
    bullets = cur.B.filter(b => b.a + ago >= 0).map(b => {
      const x = b.x + b.vx * ago, y = b.y + b.vy * ago, tl = Math.min(b.a + ago, (b.k == 'sniper' ? 24 : 10) / 60);
      return { k: b.k, c: b.c, x, y, l: b.l - ago, h: [[x - b.vx * tl, y - b.vy * tl], [x, y]] };
    });
    const cm = new Map(prev ? prev.C.map(c => [c.i, c]) : []);
    crates = cur.C.map(c => { const o = cm.get(c.i); return { x: c.x, y: o ? o.y + (c.y - o.y) * k : c.y, to: c.to, landed: !!c.ld, gun: c.g, sw: c.sw + ago, bt: c.bt } });
    skills = cur.S.filter(s => s.a + ago >= 0).map(s => ({ x: s.x, y: s.y, k: s.k, l: s.l - ago, ph: s.ph, a: s.a + ago }));
    fxTick(dt); render(dt);
  }

  // ---------- local effects ----------
  function burst(x, y, col, n) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - .5) * 320, vy: (Math.random() - .7) * 320, l: .5, col }) }
  /**
   * Blood: a fine mist, stretched droplets and a few heavy blobs fly away from the shot. Drops that land
   * leave a splat with spatter around it that darkens as it dries; near a platform edge some drip off.
   */
  const BLOOD = ['#b3121a', '#9c0d14', '#c81a20', '#86080f'];
  function bleed(x, y, d, n) {
    const R = Math.random, dir = () => d || (R() - .5) * 2;
    for (let i = 0; i < n; i++) { // droplets
      const sp = 140 + R() * 420, big = R() < .18;
      blood.push({ x: x + (R() - .5) * 6, y: y + (R() - .5) * 6, px: x, py: y, vx: dir() * sp + (R() - .5) * 180, vy: -R() * 340 - 30, r: big ? 2.6 + R() * 2 : .9 + R() * 1.6, l: 1.6, col: BLOOD[R() * 4 | 0] });
    }
    for (let i = 0; i < n * .8; i++) { // mist
      const an = (d < 0 ? Math.PI : 0) + (R() - .5) * 1.6, sp = 40 + R() * 160;
      mist.push({ x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 20, r: 2 + R() * 4, l: .25 + R() * .3, l0: .55 });
    }
  }
  function splat(x, y, r, vx, s) {
    const R = Math.random, dots = [], n = 2 + (R() * 4 | 0), lean = Math.sign(vx) || 1;
    for (let i = 0; i < n; i++) dots.push({ dx: lean * (r * 1.5 + R() * r * 4 + Math.min(30, Math.abs(vx) * .04)), r: r * (.25 + R() * .45) });
    stains.push({ x: Math.max(s.x + 4, Math.min(s.x + s.w - 4, x)), y: s.y, w: r * (1.6 + R() * 1.4) + Math.min(10, Math.abs(vx) * .015), r, dots, a: 0, l: 10, x0: s.x, x1: s.x + s.w });
    // near an edge, some of it runs over and drips
    const edge = x - s.x < 18 ? s.x : s.x + s.w - x < 18 ? s.x + s.w : null;
    if (edge !== null && r > 1.4 && drips.length < 30) drips.push({ x: edge + (edge === s.x ? 2 : -2), y: s.y + 4, len: 0, max: 8 + R() * 14, r: Math.min(2.4, r * .7), t: 0 });
  }
  function bloodTick(dt) {
    for (const q of blood) {
      q.px = q.x; q.py = q.y; const py = q.y;
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 1250 * dt; q.vx *= Math.pow(.35, dt); q.l -= dt;
      const s = q.vy > 0 && plats.find(o => q.x > o.x && q.x < o.x + o.w && py <= o.y && q.y >= o.y);
      if (s) { q.l = 0; splat(q.x, s.y, q.r, q.vx, s) }
    }
    blood = blood.filter(q => q.l > 0 && q.y < H + 300);
    for (const q of mist) { q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.pow(.05, dt); q.vy = q.vy * Math.pow(.05, dt) + 30 * dt; q.r += 10 * dt; q.l -= dt } mist = mist.filter(q => q.l > 0);
    for (const q of drips) { // a drip grows, then lets go of a drop
      q.t += dt; q.len = Math.min(q.max, q.len + dt * 9);
      if (q.len >= q.max && Math.random() < dt * 1.5) { blood.push({ x: q.x, y: q.y + q.len, px: q.x, py: q.y + q.len, vx: 0, vy: 40, r: q.r, l: 1.5, col: BLOOD[1] }); q.len = 2; q.max *= .7 }
    }
    drips = drips.filter(q => q.t < 5 && q.max > 3);
    for (const q of stains) { q.l -= dt; q.a = Math.min(1, q.a + dt * 12) } stains = stains.filter(q => q.l > 0); if (stains.length > 140) stains.splice(0, stains.length - 140);
  }
  // fresh blood is bright; it dries to a dark brown-red
  const dried = k => 'rgb(' + (150 - 80 * k | 0) + ',' + (14 - 6 * k | 0) + ',' + (18 - 8 * k | 0) + ')';
  function stainDraw() {
    for (const q of stains) {
      const k = Math.min(1, (10 - q.l) / 6); g.globalAlpha = Math.min(1, q.l / 2) * q.a * .92; g.fillStyle = dried(k);
      g.beginPath(); g.ellipse(q.x, q.y + 1.5, q.w * q.a, q.r * .55, 0, 0, 7); g.fill();
      for (const o of q.dots) { const x = q.x + o.dx * q.a; if (x > q.x0 && x < q.x1) { g.beginPath(); g.ellipse(x, q.y + 1.5, o.r * 1.4, o.r * .5, 0, 0, 7); g.fill() } }
    }
    g.globalAlpha = 1; g.fillStyle = dried(.3);
    for (const q of drips) { g.beginPath(); g.moveTo(q.x - q.r * .6, q.y); g.lineTo(q.x + q.r * .6, q.y); g.lineTo(q.x + q.r * .4, q.y + q.len); g.lineTo(q.x - q.r * .4, q.y + q.len); g.fill(); g.beginPath(); g.arc(q.x, q.y + q.len, q.r, 0, 7); g.fill() }
  }
  function bloodDraw() {
    for (const q of mist) { g.globalAlpha = Math.max(0, q.l / q.l0) * .35; g.fillStyle = '#a0141a'; g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill() }
    g.globalAlpha = 1; g.lineCap = 'round';
    for (const q of blood) { // stretched along its motion, like a real falling drop
      g.strokeStyle = q.col; g.lineWidth = q.r * 2; g.beginPath(); g.moveTo(q.px, q.py); g.lineTo(q.x + (q.x - q.px) * .3, q.y + (q.y - q.py) * .3); g.stroke();
      g.fillStyle = 'rgba(255,190,190,.35)'; if (q.r > 2) { g.beginPath(); g.arc(q.x - q.r * .3, q.y - q.r * .3, q.r * .35, 0, 7); g.fill() }
    }
    g.lineCap = 'butt';
  }
  function boom(x, y) {
    const R = Math.random, list = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));
    booms.push({
      x, y, a: 0, floor: plats.find(s => x > s.x && x < s.x + s.w && Math.abs(s.y - y) < 14),
      fire: list(16, i => ({ an: R() * 6.283, d: i < 4 ? R() * 18 : 28 + R() * 72, r: i < 4 ? 48 + R() * 16 : 20 + R() * 26, l: .35 + R() * .35 })),
      smoke: list(14, () => ({ x: R() * 2 - 1, y: R() * 2 - 1.3, r: 24 + R() * 30, d: .06 + R() * .25, l: 1 + R() * .8 })),
      sparks: list(28, () => { const an = R() * 6.283, v = 200 + R() * 520; return { vx: Math.cos(an) * v, vy: Math.sin(an) * v - 160, l: .35 + R() * .5 } }),
    });
    burst(x, y, '#3a2b20', 16);
  }
  function shatter(x, y, n, v) { for (let i = 0; i < n; i++) { const an = Math.random() * 6.283, sp = v * (.25 + Math.random() * .75); shards.push({ x: x + Math.cos(an) * 10, y: y + Math.sin(an) * 14, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - v * .4, an, va: (Math.random() - .5) * 16, s: 3 + Math.random() * (n > 1 ? 8 : 3), l: .4 + Math.random() * .45 }) } }
  function landFx(x, to) { for (let i = 0; i < 8; i++) puffs.push({ x: x + (Math.random() - .5) * 20, y: to - 2, vx: (Math.random() - .5) * 160, vy: -10 - Math.random() * 30, l: .6, l0: .6, r: 4, g: 30, col: '210,175,120' }); rings.push({ x, y: to, mr: 50, l: .4, l0: .4, col: '#fff4e0' }); chutes.push({ x, y: to - 82, l: 1.5, l0: 1.5 }); shake = Math.max(shake, 2) }
  function spawnFx(x, y, c) { rings.push({ x, y, mr: 70, l: .5, l0: .5, col: c }); for (let i = 0; i < 10; i++) puffs.push({ x, y: y - 10, vx: (Math.random() - .5) * 200, vy: -80 - Math.random() * 120, l: .5, l0: .5, r: 2.5, g: 0, col: '255,255,255' }) }
  /** Effects that last while a state lasts (frozen, speed, jetpack, 1 TAP flight, freeze shots), driven by the snapshot flags. */
  function fxTick(dt) {
    for (const p of players) {
      if (p.lives <= 0) continue;
      if (p.fx.ice > 0 && Math.random() < dt * 14) puffs.push({ x: p.x + (Math.random() - .5) * 52, y: p.y - 6 - Math.random() * 40, vx: (Math.random() - .5) * 24, vy: 8 + Math.random() * 16, l: .8, l0: .8, r: 3, g: 16, col: '220,246,255' });
      let th = trails.get(p.u); if (!th) trails.set(p.u, th = []);
      if (p.fx.spd) {
        th.push({ x: p.x, y: p.y, f: p.face }); if (th.length > 12) th.shift();
        const dir = Math.sign(p.vx);
        if (dir) { for (let k = 0; k < 2; k++) streaks.push({ x: p.x - dir * 8, y: p.y - 8 - Math.random() * 50, d: dir, len: 40 + Math.random() * 60, l: .28, l0: .28 }); if (p.ground && Math.random() < .6) puffs.push({ x: p.x - dir * 12, y: p.y - 3, vx: -dir * 50 + (Math.random() - .5) * 30, vy: -20 - Math.random() * 30, l: .45, l0: .45, r: 3, g: 25, col: '200,170,120' }) }
      } else th.length = 0;
      if (p.thr) { const nx = p.x - p.face * 18.5, ny = p.y - 4; for (let k = 0; k < 2; k++) parts.push({ x: nx, y: ny + 8, vx: (Math.random() - .5) * 120, vy: 150 + Math.random() * 250, l: .4, col: Math.random() < .5 ? '#ffb02e' : '#fff2a0' }); if (Math.random() < .7) puffs.push({ x: nx, y: ny + 28, vx: (Math.random() - .5) * 40, vy: 80 + Math.random() * 60, l: .9, l0: .9, r: 4, g: 22, col: '110,110,120' }) }
      if (p.fly) puffs.push({ x: p.x, y: p.y - 24, vx: 0, vy: 0, l: .4, l0: .4, r: 7, g: 14, col: '255,244,224' });
    }
    for (const b of bullets) if (b.k == 'freeze') { puffs.push({ x: b.x, y: b.y + (Math.random() - .5) * 8, vx: (Math.random() - .5) * 20, vy: 10 + Math.random() * 20, l: .35, l0: .35, r: 3, g: 14, col: '215,244,255' }); if (Math.random() < .4) shatter(b.x, b.y, 1, 50) }
    else if (b.k == 'sniper') { // embers and a dark, blood-tinged smoke wake along the round's path
      const [tx, ty] = b.h[0], R = Math.random;
      for (let i = 0; i < 3; i++) { const f = R(); parts.push({ x: tx + (b.x - tx) * f, y: ty + (b.y - ty) * f, vx: (R() - .5) * 90, vy: -40 - R() * 80, l: .18 + R() * .15, col: R() < .5 ? '#ff2a2a' : '#ffb3a0' }) }
      for (let i = 0; i < 2; i++) { const f = R() * .8; puffs.push({ x: tx + (b.x - tx) * f, y: ty + (b.y - ty) * f + (R() - .5) * 6, vx: (R() - .5) * 16, vy: -6 - R() * 10, l: .55, l0: .55, r: 3, g: 18, col: R() < .5 ? '60,8,10' : '90,20,24' }) }
    }
    shake = Math.max(0, shake - dt * 30); bloodTick(dt);
    for (const q of parts) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 700 * dt; q.l -= dt } parts = parts.filter(q => q.l > 0);
    for (const q of puffs) { q.x += q.vx * dt; q.y += q.vy * dt; q.r += (q.g || 20) * dt; q.l -= dt } puffs = puffs.filter(q => q.l > 0);
    for (const q of rings) q.l -= dt; rings = rings.filter(q => q.l > 0);
    for (const q of chutes) q.l -= dt; chutes = chutes.filter(q => q.l > 0);
    for (const q of streaks) q.l -= dt; streaks = streaks.filter(q => q.l > 0);
    for (const e of booms) e.a += dt; booms = booms.filter(e => e.a < 2.2);
    for (const q of shards) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 800 * dt; q.an += q.va * dt; q.l -= dt } shards = shards.filter(q => q.l > 0);
    for (const o of pops) { o.l -= dt; o.y -= 40 * dt } pops = pops.filter(o => o.l > 0);
    for (const f of feed) f.l -= dt; feed = feed.filter(f => f.l > 0);
  }

  // ---------- drawing (from the original game) ----------
  function puff(x, y, r, stops) { const gr = g.createRadialGradient(x, y, 0, x, y, r); for (const [o, c] of stops) gr.addColorStop(o, c); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill() }
  function scorch(e) { const s = e.floor; if (!s) return; g.save(); g.beginPath(); g.rect(s.x, s.y - 2, s.w, 16); g.clip(); g.globalAlpha = Math.min(.75, (2.2 - e.a) * .8); g.fillStyle = '#1a0d06'; g.beginPath(); g.ellipse(e.x, s.y + 4, 42, 9, 0, 0, 7); g.fill(); g.restore() }
  function boomDraw(e) {
    const a = e.a; g.save();
    for (const q of e.smoke) {
      const k = (a - q.d) / q.l; if (k <= 0 || k >= 1) continue; const o = 1 - Math.pow(1 - k, 3), al = .7 * (1 - k) * Math.min(1, k * 6);
      puff(e.x + q.x * (15 + 55 * o), e.y + q.y * (10 + 30 * o) - 75 * k, q.r * (.6 + 1.1 * o), [[0, 'rgba(55,45,42,' + al + ')'], [.6, 'rgba(85,72,66,' + al * .75 + ')'], [1, 'rgba(110,95,85,0)']]);
    }
    for (const q of e.fire) {
      const k = a / q.l; if (k >= 1) continue; const o = 1 - Math.pow(1 - k, 3), al = 1 - k * k, hot = Math.max(0, 1 - k * 2);
      puff(e.x + Math.cos(q.an) * q.d * o, e.y + Math.sin(q.an) * q.d * o * .8 - 28 * k, q.r * (.45 + .85 * o), [[0, 'rgba(255,' + (150 + 105 * hot | 0) + ',' + (40 + 190 * hot | 0) + ',' + al + ')'], [.55, 'rgba(255,' + (70 + 90 * hot | 0) + ',15,' + al * .9 + ')'], [1, 'rgba(150,25,5,0)']]);
    }
    g.globalCompositeOperation = 'lighter';
    if (a < .14 && !reduce.matches) { const al = 1 - a / .14; puff(e.x, e.y, BLAST * 1.2, [[0, 'rgba(255,255,240,' + al + ')'], [.35, 'rgba(255,210,110,' + al * .7 + ')'], [1, 'rgba(255,120,20,0)']]) }
    g.lineCap = 'round';
    for (const q of e.sparks) {
      if (a >= q.l) continue; const at = u => [e.x + q.vx * u, e.y + q.vy * u + 450 * u * u], h = at(a), tl = at(Math.max(0, a - .045));
      g.strokeStyle = 'rgba(255,' + (230 - 150 * a / q.l | 0) + ',90,' + (1 - a / q.l) + ')'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(...tl); g.lineTo(...h); g.stroke();
    }
    g.globalCompositeOperation = 'source-over';
    if (a < .28) { const k = a / .28; g.strokeStyle = 'rgba(255,250,235,' + .8 * (1 - k) + ')'; g.lineWidth = 10 * (1 - k) + 1; g.beginPath(); g.arc(e.x, e.y, 20 + BLAST * 1.15 * (1 - (1 - k) * (1 - k)), 0, 7); g.stroke() }
    g.restore();
  }
  function shardDraw(q) { g.save(); g.translate(q.x, q.y); g.rotate(q.an); g.globalAlpha = Math.min(1, q.l * 3); g.beginPath(); g.moveTo(q.s, 0); g.lineTo(-q.s * .6, q.s * .55); g.lineTo(-q.s * .3, -q.s * .5); g.closePath(); g.fillStyle = 'rgba(185,236,255,.8)'; g.fill(); g.lineWidth = 1; g.strokeStyle = '#fff'; g.stroke(); g.restore() }
  // jagged translucent crystal: grows on impact, cracks before it shatters
  const ICE = [[-26, 2], [-34, -12], [-27, -30], [-33, -47], [-18, -58], [-12, -76], [-1, -64], [11, -72], [19, -57], [32, -49], [27, -30], [35, -14], [25, 2]];
  function iceDraw(p) {
    const k = Math.min(1, p.ia / .22), e = 1 - Math.pow(1 - k, 3), left = p.fx.ice;
    const path = pts => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath() };
    g.save(); g.translate(p.x + (left < .5 ? Math.sin(t * 90) * 1.5 : 0), p.y); g.lineJoin = 'round';
    puff(0, -30, 62, [[0, 'rgba(170,230,255,.28)'], [1, 'rgba(170,230,255,0)']]);
    g.scale(.7 + .3 * e, .25 + .75 * e);
    const gr = g.createLinearGradient(-30, -74, 28, 4); gr.addColorStop(0, 'rgba(245,253,255,.72)'); gr.addColorStop(.35, 'rgba(150,220,255,.34)'); gr.addColorStop(.7, 'rgba(70,165,235,.42)'); gr.addColorStop(1, 'rgba(200,240,255,.7)');
    path(ICE); g.fillStyle = gr; g.fill();
    g.save(); g.clip();
    for (let i = 0; i < ICE.length - 1; i += 2) { path([ICE[i], ICE[i + 1], [i % 4 ? 7 : -9, -28 - i]]); g.fillStyle = i % 4 ? 'rgba(255,255,255,.2)' : 'rgba(30,110,190,.18)'; g.fill(); g.strokeStyle = 'rgba(235,252,255,.45)'; g.lineWidth = 1; g.stroke() }
    g.fillStyle = 'rgba(255,255,255,.38)'; path([[-26, -8], [-8, -66], [0, -66], [-18, -8]]); g.fill(); path([[-11, -4], [9, -62], [12, -62], [-8, -4]]); g.fill();
    puff(0, 4, 40, [[0, 'rgba(255,255,255,.9)'], [1, 'rgba(255,255,255,0)']]);
    g.restore();
    path(ICE); g.strokeStyle = 'rgba(40,110,170,.9)'; g.lineWidth = 3; g.stroke(); g.save(); g.scale(.93, .95); path(ICE); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.5; g.stroke(); g.restore();
    for (const [x, tx, ty] of [[-30, -46, -9], [-20, -31, -18], [22, 34, -20], [29, 47, -7]]) { path([[x - 6, 3], [tx, ty], [x + 6, 3]]); g.fillStyle = 'rgba(205,242,255,.85)'; g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1; g.stroke() }
    for (const [x, y, l] of [[-31, -47, 13], [30, -49, 16], [26, -29, 9]]) { path([[x - 3, y], [x + 3, y], [x, y + l * e]]); g.fillStyle = 'rgba(230,250,255,.9)'; g.fill() }
    if (left < 1) { const c = 1 - left; g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.beginPath(); for (const pts of [[[2, -34], [-9, -44], [-7, -55], [-17, -62]], [[2, -34], [16, -29], [18, -17], [30, -12]], [[2, -34], [-6, -22], [-21, -18], [-26, -6]], [[2, -34], [9, -47], [22, -50]]]) { const n = Math.max(2, Math.ceil(pts.length * c * 1.3)); pts.slice(0, n).forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)) } g.stroke() }
    for (const [x, y, ph] of [[-21, -49, 0], [18, -62, 2], [24, -10, 4]]) { const a = Math.max(0, Math.sin(t * 5 + ph)); if (a > .2) { g.globalAlpha = a; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 6 * a, y); g.lineTo(x + 6 * a, y); g.moveTo(x, y - 6 * a); g.lineTo(x, y + 6 * a); g.stroke(); g.globalAlpha = 1 } }
    g.restore();
  }
  function box(x, y, w, h, r, fill) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke() }
  function dot(x, y, r, fill) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke() }
  function hill(pts, col) { g.beginPath(); g.moveTo(-400, H + 700); g.lineTo(-400, pts[0][1]); for (const [x, y] of pts) g.lineTo(x, y); g.lineTo(W + 400, pts[pts.length - 1][1]); g.lineTo(W + 400, H + 700); g.closePath(); g.fillStyle = col; g.fill() }
  /** Parallax follows your own fighter, or the camera while you spectate. */
  function parallax() { const me = players.find(p => p.u === meU); return ((me && me.lives > 0 ? Math.max(0, Math.min(W, me.x)) : cam.x) - W / 2) * .03 }
  function background() {
    const s = g.createLinearGradient(0, 0, 0, H); s.addColorStop(0, '#a8701f'); s.addColorStop(.6, '#e8932f'); s.addColorStop(1, '#f4b24a'); g.fillStyle = s; g.fillRect(-400, -120, W + 800, H + 1100);
    const c = parallax();
    hill([[-20, 250], [110 - c, 120], [200 - c, 210], [330 - c, 95], [470 - c, 260], [620 - c, 150], [700 - c, 150], [790 - c, 250], [880 - c, 110], [W + 20, 230]], '#c9802a');
    hill([[-20, 340], [90 - c * 2, 260], [130 - c * 2, 260], [190 - c * 2, 350], [380 - c * 2, 230], [520 - c * 2, 370], [690 - c * 2, 280], [760 - c * 2, 280], [830 - c * 2, 360], [W + 20, 290]], '#b36a22');
    pyramids();
    hill([[-20, 420], [200 - c * 3, 360], [420 - c * 3, 430], [650 - c * 3, 375], [W + 20, 440]], '#d99034');
    g.fillStyle = '#7d8a3a'; for (const [x, y] of [[110, 385], [455, 305], [560, 410], [880, 400]]) { g.beginPath(); g.roundRect(x - c * 3, y, 12, 60, 6); g.roundRect(x - c * 3 - 14, y + 14, 10, 24, 5); g.roundRect(x - c * 3 + 16, y + 8, 10, 22, 5); g.rect(x - c * 3 - 10, y + 30, 34, 8); g.fill() }
  }
  function frost() {
    const s = g.createLinearGradient(0, 0, 0, H); s.addColorStop(0, '#5d5a7e'); s.addColorStop(.55, '#8f9cb8'); s.addColorStop(1, '#c4dbe6'); g.fillStyle = s; g.fillRect(-400, -120, W + 800, H + 1100);
    const c = parallax();
    hill([[-20, 300], [110 - c, 230], [230 - c, 290], [420 - c, 150], [520 - c, 60], [575 - c, 95], [620 - c, 20], [700 - c, 120], [760 - c, 170], [900 - c, 330], [W + 20, 270]], '#dfe8f0');
    g.fillStyle = '#a9bccf'; for (const p of [[[520, 60], [545, 170], [470, 260], [600, 230]], [[620, 20], [660, 150], [630, 260], [760, 230], [700, 120]], [[110, 230], [150, 320], [200, 300]]]) { g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x - c, y) : g.moveTo(x - c, y)); g.closePath(); g.fill() }
    hill([[-20, 390], [140 - c * 2, 330], [330 - c * 2, 400], [640 - c * 2, 370], [800 - c * 2, 300], [W + 20, 380]], '#b9d3df');
    g.fillStyle = '#3f7fa8'; g.fillRect(-400, 690, W + 800, 500); g.fillStyle = '#6fb2d2'; for (let x = -400; x < W + 400; x += 60) { g.beginPath(); g.ellipse(x + Math.sin(t + x) * 8, 690, 38, 7, 0, 0, 7); g.fill() }
    g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 110; i++) { const y = (i * 71 + t * (28 + i % 4 * 12)) % 800 - 110, x = (i * 137) % (W + 500) - 250 + Math.sin(t + i) * 14; g.beginPath(); g.arc(x, y, 1.2 + i % 3 * .8, 0, 7); g.fill() }
  }
  function shape(pts, fill) { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); g.closePath(); g.fillStyle = fill; g.fill(); g.lineWidth = 3; g.lineJoin = 'round'; g.strokeStyle = INK; g.stroke() }
  function iceTiers() {
    plats.forEach((s, i) => {
      const { x, y, w } = s, next = plats[i + 1], bot = next ? next.y + 6 : 700, n = Math.round(w / 55), step = w / n;
      // cliff face in facets, then the snowy top the fighters stand on
      for (let k = 0; k < n; k++) {
        const a = x + k * step, b = a + step, j = (k * 37 + i * 19) % 11, lean = next ? 0 : (k / n - .5) * -50;
        shape([[a, y + 8], [b, y + 8], [b + lean, bot + (next ? 0 : j * 3 - 14)], [a + lean, bot + (next ? 0 : (j * 7 % 11) * 3 - 14)]], ['#35aee8', '#52c3f2', '#2b9bd8'][(k + i) % 3]);
        g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(a + 7 + j, y + 24, 4, Math.min(46, bot - y - 34));
      }
      const edge = [[x - 4, y + 3], [x + 12, y - 12], [x + w - 12, y - 12], [x + w + 4, y + 3]];
      for (let k = n; k >= 0; k--) edge.push([x + k * step + (k == n ? 2 : k ? 0 : -2), y + 11 + (k * 5 + i) % 3 * 4], ...(k ? [[x + (k - .5) * step, y + 9]] : []));
      shape(edge, '#f4fbff'); g.fillStyle = '#cfe8f5'; g.fillRect(x + 10, y + 3, w - 20, 3);
    });
  }
  function scaffold() {
    if (map.terrain) return iceTiers(); const k = map.look;
    for (const [x, y, y2] of map.poles) pole(x - 6, y, y2, k);
    for (const s of plats) { box(s.x, s.y, s.w, s.h, 3, k.deck); g.fillStyle = k.top; g.fillRect(s.x + 2, s.y + 2, s.w - 4, 4); g.fillStyle = INK; for (let x = s.x + 10; x < s.x + s.w; x += 70) g.fillRect(x, s.y + 8, 3, 3); for (let x = s.x + 14; x < s.x + s.w - 10; x += 34) box(x, s.y + 10, 9, 5 + (x * 7 % 9), 4, k.peg) }
  }
  function gun(kind, fl) {
    const hl = (x, y, w) => { g.fillStyle = 'rgba(255,255,255,.4)'; g.fillRect(x, y, w, 2) };
    if (kind == 'popper') { box(2, 2, 10, 16, 2, '#2b2b2b'); box(0, -9, 32, 11, 2, '#4a5568'); hl(3, -7, 26); box(30, -6, 6, 6, 1, '#1f2937'); box(28, -12, 3, 4, 1, '#1f2937'); box(1, -12, 4, 4, 1, '#1f2937'); box(12, 3, 9, 5, 2, '#2d3748') }
    else if (kind == 'boom') { box(-16, -4, 20, 13, 3, '#8a5a36'); box(2, -8, 14, 12, 2, '#4a5568'); box(14, -10, 34, 6, 2, '#2d3748'); box(14, -3, 34, 6, 2, '#3b4252'); box(20, 3, 16, 6, 2, '#8a5a36'); hl(16, -9, 30); box(46, -12, 3, 4, 1, '#1f2937') }
    else if (kind == 'rattler') { box(-12, -6, 13, 5, 2, '#3b4252'); box(0, -10, 28, 12, 2, '#4a5568'); hl(2, -8, 24); box(27, -8, 13, 6, 1, '#222'); box(8, 2, 8, 20, 2, '#2d3748'); box(20, 2, 7, 12, 2, '#222'); box(4, -13, 12, 4, 1, '#222') }
    else if (kind == 'freeze') { box(-14, -8, 18, 14, 4, '#35506b'); box(0, -13, 30, 18, 8, '#9fe6ff'); dot(15, -4, 6, '#e8fbff'); box(29, -10, 12, 12, 2, '#4a7fa8'); box(40, -13, 8, 18, 3, '#d6f6ff'); box(8, 4, 9, 13, 2, '#233447'); hl(4, -10, 22) }
    else if (kind == 'revolver') { box(1, 2, 9, 16, 3, '#6b3f1d'); box(0, -9, 16, 12, 2, '#7a8394'); box(6, -12, 10, 15, 3, '#9aa7bd'); box(16, -8, 28, 7, 2, '#4a5568'); hl(17, -7, 26); box(42, -12, 3, 5, 1, '#1f2937'); box(-3, -12, 5, 5, 2, '#4a5568') }
    else if (kind == 'sniper') { box(-22, -5, 26, 14, 4, '#5a3a22'); box(2, -9, 22, 10, 2, '#2d3748'); box(22, -7, 50, 5, 2, '#1f2937'); hl(24, -6, 46); box(6, -19, 32, 8, 3, '#111827'); box(10, -12, 4, 4, 1, '#2d3748'); box(30, -12, 4, 4, 1, '#2d3748'); box(66, -10, 7, 10, 1, '#111827'); box(10, 2, 7, 10, 2, '#5a3a22'); g.beginPath(); g.moveTo(38, -2); g.lineTo(34, 12); g.moveTo(44, -2); g.lineTo(50, 12); g.stroke() }
    else { box(-18, -6, 20, 12, 3, '#2d3748'); box(1, -10, 28, 12, 2, '#4a5568'); hl(3, -8, 24); box(28, -8, 26, 6, 2, '#2d3748'); box(52, -10, 3, 10, 1, '#1f2937'); box(8, 2, 8, 18, 2, '#2d3748'); box(20, 2, 7, 13, 2, '#222'); box(4, -15, 22, 5, 2, '#111827') }
    if (fl && kind != 'freeze') {
      const x = MZ[kind], z = (kind == 'sniper' ? 1.6 : kind == 'boom' ? 1.3 : 1) * (.9 + Math.random() * .3); g.save(); g.globalCompositeOperation = 'lighter';
      const r = g.createRadialGradient(x + 6, -3, 1, x + 6, -3, 32 * z); r.addColorStop(0, 'rgba(255,230,140,.9)'); r.addColorStop(1, 'rgba(255,150,30,0)'); g.fillStyle = r; g.fillRect(x - 30, -40, 80 * z, 70);
      const st = g.createLinearGradient(x, 0, x + 80 * z, 0); st.addColorStop(0, 'rgba(255,255,255,1)'); st.addColorStop(.4, 'rgba(255,220,110,.9)'); st.addColorStop(1, 'rgba(255,150,30,0)'); g.fillStyle = st; g.beginPath(); g.moveTo(x, -8 * z); g.quadraticCurveTo(x + 40 * z, -4 * z, x + 80 * z, -3); g.quadraticCurveTo(x + 40 * z, 4 * z, x, 2 * z); g.closePath(); g.fill();
      g.fillStyle = '#fff6c8'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = (i % 2 ? 5 : 16) * z; g.lineTo(x + 4 + Math.cos(a) * rr, -3 + Math.sin(a) * rr) } g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 4, -3, 4 * z, 0, 7); g.fill(); g.restore();
    }
  }
  function bullet(b) {
    const k = b.k, h = b.h || [], w = k == 'freeze' ? 7 : k == 'boom' ? 2 : b.c ? 4 : 2.8;
    if (k == 'grenade') { dot(b.x, b.y, 8, '#4f6b2f'); dot(b.x + Math.cos(b.l * 18) * 8, b.y + Math.sin(b.l * 18) * 8, 3, Math.floor(b.l * 10) % 2 ? '#ff3b3b' : '#ffe066'); return }
    if (k == 'sniper' && h.length > 1) { sniperTrace(b, h[0]); return }
    if (h.length > 1) {
      const tl = h[0], gr = g.createLinearGradient(tl[0], tl[1], b.x, b.y);
      if (k == 'freeze') { gr.addColorStop(0, 'rgba(150,220,255,0)'); gr.addColorStop(1, '#cff4ff') } else { gr.addColorStop(0, b.c ? 'rgba(255,90,70,0)' : 'rgba(255,240,190,0)'); gr.addColorStop(.7, b.c ? 'rgba(255,205,175,.85)' : 'rgba(255,244,200,.85)'); gr.addColorStop(1, '#fff') }
      g.lineCap = 'round'; g.strokeStyle = gr; g.lineWidth = w; g.beginPath(); g.moveTo(tl[0], tl[1]); g.lineTo(b.x, b.y); g.stroke(); g.lineCap = 'butt';
    }
    if (k == 'freeze') { puff(b.x, b.y, 26, [[0, 'rgba(210,247,255,.9)'], [1, 'rgba(120,210,255,0)']]); g.save(); g.translate(b.x, b.y); g.rotate(t * 14); g.beginPath(); for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r = i % 2 ? 5 : 13; g.lineTo(Math.cos(a) * r, Math.sin(a) * r) } g.closePath(); g.fillStyle = '#cdf2ff'; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#2c78ad'; g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 4, 0, 7); g.fill(); g.restore() }
  }
  /** Sniper round: a crimson, flickering beam with a white-hot core and a blazing, pulsing head. */
  function sniperTrace(b, tl) {
    const [tx, ty] = tl, x = b.x, y = b.y, fl = .85 + Math.random() * .3, pulse = 1 + Math.sin(lt * 60) * .15;
    const line = (w, col, blur = 0, glow = '') => { g.lineWidth = w; g.strokeStyle = col; g.shadowBlur = blur; g.shadowColor = glow; g.beginPath(); g.moveTo(tx, ty); g.lineTo(x, y); g.stroke() };
    const fade = (a, mid, head) => { const gr = g.createLinearGradient(tx, ty, x, y); gr.addColorStop(0, a); gr.addColorStop(.55, mid); gr.addColorStop(1, head); return gr };
    g.save(); g.lineCap = 'round';
    line(22 * fl, fade('rgba(60,0,0,0)', 'rgba(70,0,6,.35)', 'rgba(90,0,10,.55)')); // dark menacing halo
    g.globalCompositeOperation = 'lighter';
    line(13 * fl, fade('rgba(255,0,20,0)', 'rgba(255,20,30,.35)', 'rgba(255,40,40,.7)'), 24, 'rgba(255,0,0,.9)');
    line(6 * fl, fade('rgba(255,60,40,0)', 'rgba(255,90,70,.8)', '#ff6a50'), 12, '#ff2020');
    line(2.2, fade('rgba(255,255,255,0)', 'rgba(255,225,215,.9)', '#ffffff'), 6, '#ffffff');
    // a jagged energy crackle wrapping the beam
    const dx = x - tx, dy = y - ty, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    g.lineWidth = 1.4; g.strokeStyle = 'rgba(255,120,110,.75)'; g.shadowBlur = 8; g.shadowColor = '#ff0000'; g.beginPath();
    for (let i = 0; i <= 10; i++) { const f = .3 + i * .07, o = (Math.random() - .5) * 10 * f; g.lineTo(tx + dx * f + nx * o, ty + dy * f + ny * o) }
    g.stroke();
    // blazing head
    g.shadowBlur = 0;
    puff(x, y, 34 * pulse * fl, [[0, 'rgba(255,240,230,.95)'], [.18, 'rgba(255,60,50,.8)'], [.5, 'rgba(200,0,10,.35)'], [1, 'rgba(120,0,0,0)']]);
    g.save(); g.translate(x, y); g.rotate(Math.atan2(dy, dx)); g.fillStyle = 'rgba(255,200,190,.9)';
    g.beginPath(); g.moveTo(16 * pulse, 0); g.lineTo(0, 3.5); g.lineTo(-6, 0); g.lineTo(0, -3.5); g.closePath(); g.fill(); // spear-tip glint
    g.fillRect(-1, -18 * fl, 2, 36 * fl); // lens flare spike
    g.restore();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
    g.restore();
  }
  function head(p) {
    dot(0, -40, 18, '#ffd9b0'); const n = p.name;
    if (n == 'Bolt') { g.fillStyle = '#7a4220'; g.beginPath(); g.arc(0, -43, 18, Math.PI, 0); g.fill(); g.stroke(); box(-17, -48, 34, 6, 3, '#3a2b20'); dot(2, -45, 7, '#8fe8ff'); dot(15, -45, 6, '#8fe8ff') }
    if (n == 'Mochi') { g.fillStyle = p.color; for (const e of [-12, 10]) { g.beginPath(); g.moveTo(e - 8, -50); g.lineTo(e, -68); g.lineTo(e + 9, -52); g.closePath(); g.fill(); g.stroke() } g.beginPath(); g.arc(0, -43, 19, Math.PI, 0); g.closePath(); g.fill(); g.stroke() }
    if (n == 'Tank') { box(-18, -67, 36, 22, 5, '#9aa7bd'); box(-23, -49, 46, 7, 3, '#6cc24a') }
    if (n == 'Nova') { g.beginPath(); g.moveTo(-4, -58); g.lineTo(-10, -70); g.stroke(); dot(-10, -70, 4, '#ff5c5c'); g.fillStyle = p.color; g.beginPath(); g.arc(0, -43, 19, Math.PI, 0); g.closePath(); g.fill(); g.stroke(); box(-6, -44, 28, 12, 5, '#8fe8ff') }
    g.fillStyle = INK; g.fillRect(4, -38, 4, 6); g.fillRect(13, -38, 3, 6);
  }
  function draw(p) {
    if (p.lives <= 0) return; const s = p.ground && p.vx ? Math.sin(p.walk) * 5 : 0, since = lt - (flash.get(p.u) ?? -9);
    g.save(); if (p.clone) g.globalAlpha = .65; if (p.safe && !p.clone) g.globalAlpha = (lt * 10 | 0) % 2 ? .15 : 1; if (p.fx.ghost > 0) g.globalAlpha = .28; /* blink while spawn-protected */ g.translate(p.x, p.y); g.scale(p.face, 1);
    box(-12 + s, -9, 11, 9, 3, INK); box(2 - s, -9, 11, 9, 3, INK);
    box(-13, -27, 26, 20, 7, p.color);
    if (p.fx.jet > 0) { box(-24, -27, 11, 19, 4, '#8a93a3'); box(-22, -9, 7, 5, 1, '#3a3f4a'); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-22, -25, 2, 14) }
    if (p.name == 'Mochi') box(-26 - Math.abs(s), -27, 18, 7, 3, '#fff4e0'); head(p);
    g.save(); g.translate(14 - (since < .08 ? 5 : 0), -22); gun(p.gun, since < .09); dot(4, 5, 5, '#ffd9b0'); g.restore(); g.restore();
    if (p.fx.ice > 0) iceDraw(p);
    if (p.fx.shield > 0) { g.save(); g.globalAlpha = p.fx.ghost > 0 ? .35 : 1; g.beginPath(); g.arc(p.x, p.y - 30, 40, 0, 7); g.fillStyle = 'rgba(91,140,255,.18)'; g.fill(); g.strokeStyle = SKI.shield[1]; g.lineWidth = 4; for (let i = 0; i < p.fx.shield; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / SHIELD; g.beginPath(); g.arc(p.x, p.y - 30, 40, a + .12, a + Math.PI * 2 / SHIELD - .12); g.stroke() } g.restore() }
    if (p.fx.ghost > 0) g.globalAlpha = .4; label(dispName(p), p.x, p.y - 76, 15 / Z, p.u === meU ? '#ffb02e' : '#fff'); g.globalAlpha = 1;
    if (p.fx.jet > 0) { box(p.x - 18, p.y - 98, 36, 7, 3, '#222'); g.fillStyle = '#ff9d1c'; g.fillRect(p.x - 17, p.y - 97, 34 * p.fx.jet / 100, 5) }
  }
  function label(txt, x, y, size, col, align?) { g.font = '800 ' + size + 'px system-ui'; g.textAlign = align || 'center'; g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = INK; g.strokeText(txt, x, y); g.fillStyle = col; g.fillText(txt, x, y) }
  function card(p, i, all) {
    // four cards fit at full size; more are scaled down to share the strip
    const slot = (W - 28) / Math.max(4, all.length), sc = Math.min(1, (slot - 20) / 218);
    const x = 14 + i * slot, y = 543 + 58 * (1 - sc) / 2; g.save(); g.translate(x, y); g.scale(sc, sc); g.rotate(i % 2 ? .012 : -.012); if (p.lives <= 0) g.globalAlpha = .45;
    box(0, 0, 218, 58, 5, p.u === meU ? '#fff1c9' : '#fff8ea'); box(6, 6, 46, 46, 4, p.color);
    g.save(); g.beginPath(); g.rect(7, 7, 44, 44); g.clip(); g.translate(28, 66); head(p); g.restore();
    g.textAlign = 'left'; g.fillStyle = INK; g.font = '800 14px system-ui';
    g.fillText(p.id ? short(p.id) + (p.u === meU ? ' (you)' : '') : p.name + ' (bot)', 60, 19); g.fillRect(60, 24, 150, 2);
    g.font = '800 10px system-ui'; g.fillText('LIVES:', 60, 37); g.fillStyle = '#b3261e'; g.font = '900 22px system-ui'; g.fillText(p.lives, 68, 54);
    g.fillStyle = INK; g.fillRect(105, 29, 2, 24); g.fillStyle = '#c25a00'; g.font = '900 14px system-ui'; g.fillText(p.ammo === Infinity ? '∞' : p.ammo, 114, 40); g.fillStyle = INK; g.font = '800 10px system-ui'; g.fillText(GUNS[p.gun].name.toUpperCase(), 114, 53);
    for (let k = 0; k < NADE.n; k++) dot(172 + k * 15, 14, 5, k < p.nades ? '#4f6b2f' : '#e4d9c4');
    g.fillStyle = p.color; g.fillRect(0, 61, 218 * p.wobble / 2.2, 4); g.restore();
  }
  function arrow(p) {
    const sx = (p.x - VX) * Z, sy = (p.y - VY) * Z; if (p.lives <= 0 || (sx > -15 && sx < W + 15 && sy > 0 && sy < H + 50)) return;
    const x = Math.max(40, Math.min(W - 40, sx)), y = Math.max(40, Math.min(H - 60, sy - 25)), dx = sx - x, dy = sy - 25 - y;
    g.save(); g.translate(x, y); g.rotate(Math.atan2(dy, dx)); g.beginPath(); g.moveTo(20, 0); g.lineTo(0, -16); g.lineTo(0, -7); g.lineTo(-18, -7); g.lineTo(-18, 7); g.lineTo(0, 7); g.lineTo(0, 16); g.closePath(); g.fillStyle = p.color; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke(); g.restore();
    label(Math.round(Math.hypot(dx, dy) / Z), x, y + 32, 15, '#fff');
  }
  function blast() { g.save(); g.setLineDash([16, 12]); g.strokeStyle = 'rgba(255,70,50,.6)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-320, H + 260); g.lineTo(W + 320, H + 260); g.stroke(); g.setLineDash([]); label('DANGER', W / 2, H + 245, 24, 'rgba(255,90,70,.9)'); g.restore() }
  function hud() {
    if (!cur.over && t < 2.5) { g.globalAlpha = Math.min(1, (2.5 - t) * 2); label(map.name, W / 2, 70, 34, '#fff'); g.globalAlpha = 1 }
    feed.forEach((f, i) => {
      let x = 14; const y = 24 + i * 22, col = r => ROSTER[r]?.[1] ?? '#fff';
      for (const [txt, c] of f.a >= 0 ? [[slotName(f.a), col(f.a)], ['KNOCKED OUT', '#ff4a3d'], [slotName(f.b), col(f.b)]] : [[slotName(f.b), col(f.b)], ['FELL', '#ff4a3d']]) { label(txt, x, y, 15, c, 'left'); x += g.measureText(txt).width + 8 }
    });
  }
  function overlay() { for (const o of pops) { g.save(); g.translate(o.x, o.y); g.rotate(-.15); label(o.t || 'HIT', 0, 0, o.big ? 46 : o.t == 'CRIT!' ? 40 : 34, o.t == 'FROZEN' ? '#7fdcff' : o.t == 'PWND' ? '#d65cff' : o.big || o.t == 'CRIT!' ? '#ff3b3b' : '#ff9d1c'); g.restore() } }
  function canopy(cx, cy, sy, al) { g.save(); g.globalAlpha = al; g.translate(cx, cy); g.scale(1, sy); g.beginPath(); g.moveTo(-38, 0); g.quadraticCurveTo(-40, -42, 0, -44); g.quadraticCurveTo(40, -42, 38, 0); g.quadraticCurveTo(25, 9, 12.7, 0); g.quadraticCurveTo(0, 9, -12.7, 0); g.quadraticCurveTo(-25, 9, -38, 0); g.closePath(); g.fillStyle = '#e8562e'; g.fill(); g.lineWidth = 3; g.strokeStyle = INK; g.stroke(); g.save(); g.clip(); g.fillStyle = '#fff4e0'; g.beginPath(); g.moveTo(0, -44); g.lineTo(-12.7, 3); g.lineTo(12.7, 3); g.fill(); g.strokeStyle = 'rgba(20,14,38,.45)'; g.lineWidth = 1.5; g.beginPath(); for (const x of [-38, -12.7, 12.7, 38]) { g.moveTo(0, -44); g.lineTo(x, 0) } g.stroke(); g.restore(); g.restore() }
  function chuteDraw(q) { const k = 1 - q.l / q.l0; canopy(q.x + k * 40, q.y + k * 65, Math.max(.12, 1 - k * .85), 1 - k) }
  function crateDraw(c) {
    const sw = c.landed ? 0 : Math.sin((c.sw || 0) * 2.2), sx = sw * 12, bt = c.bt > 0 ? c.bt / .3 : 0, sq = 1 - .18 * Math.sin(bt * Math.PI);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(c.x, (c.landed ? c.y : c.to) + 1, c.landed ? 26 : 10 + 18 * Math.max(0, 1 - (c.to - c.y) / 400), 4, 0, 0, 7); g.fill();
    g.save(); g.translate(c.x, c.y); g.scale(1.3, 1.3);
    if (!c.landed) { canopy(sx, -84, 1, 1); g.strokeStyle = INK; g.lineWidth = 1.5; g.beginPath(); [[-38, -14], [-12.7, -5], [12.7, 5], [38, 14]].forEach(([a, b]) => { g.moveTo(sx + a, -84); g.lineTo(b, -26) }); g.stroke(); g.translate(0, -26); g.rotate(sw * .1); g.translate(0, 26) }
    g.save(); g.scale(2 - sq, sq); box(-14, -26, 28, 26, 3, '#c98a3f'); g.fillStyle = 'rgba(60,30,10,.35)'; g.fillRect(-14, -17, 28, 2); g.fillRect(-14, -8, 28, 2); g.fillStyle = '#6b7280'; g.fillRect(-14, -26, 5, 26); g.fillRect(9, -26, 5, 26); g.fillStyle = INK; g.font = '900 17px system-ui'; g.textAlign = 'center'; g.fillText('?', 0, -7); g.restore();
    if (c.landed) label(GUNS[c.gun].name, 0, -34, 13, '#fff'); g.restore();
  }
  const ORB = 1.35; // skill orb size
  function orb(s) {
    const a = s.a || 0; if (s.l < 3 && Math.floor(s.l * 6) % 2) return; const k = a < .4 ? a / .4 : 1, pop = a < .4 ? 1 + 2.7 * Math.pow(k - 1, 3) + 1.7 * Math.pow(k - 1, 2) : 1, [nm, col] = SKI[s.k], y = s.y - 32 + Math.sin(t * 3 + s.ph) * 4 - (a < .4 ? (1 - k) * 20 : 0);
    g.save(); g.translate(s.x, s.y); g.scale(ORB, ORB); g.translate(-s.x, -s.y); // drawn larger, anchored on the floor
    if (a < .7) { g.save(); g.globalCompositeOperation = 'lighter'; const gr = g.createLinearGradient(0, s.y - 300, 0, s.y); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, col); g.globalAlpha = .5 * (1 - a / .7); g.fillStyle = gr; g.fillRect(s.x - 12, s.y - 300, 24, 300); g.restore() }
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(s.x, s.y + 1, 16 * pop, 4, 0, 0, 7); g.fill();
    g.save(); g.globalCompositeOperation = 'lighter'; const r = g.createRadialGradient(s.x, y, 2, s.x, y, 40 * pop); r.addColorStop(0, col); r.addColorStop(1, 'rgba(0,0,0,0)'); g.globalAlpha = .55 + .15 * Math.sin(t * 6); g.fillStyle = r; g.fillRect(s.x - 45, y - 45, 90, 90); g.globalAlpha = .9; g.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { const an = t * 3 + i * 2.094; g.beginPath(); g.arc(s.x + Math.cos(an) * 24, y + Math.sin(an) * 9, 2, 0, 7); g.fill() } g.restore();
    g.save(); g.translate(s.x, y); g.scale(pop, pop); box(-15, -15, 30, 30, 9, '#1d1d2a'); g.lineWidth = 3; g.strokeStyle = col; g.beginPath(); g.roundRect(-12, -12, 24, 24, 7); g.stroke(); g.fillStyle = col; g.beginPath();
    if (s.k == 'spd') { g.moveTo(2, -11); g.lineTo(-6, 2); g.lineTo(0, 2); g.lineTo(-3, 11); g.lineTo(7, -3); g.lineTo(1, -3) }
    else if (s.k == 'jet') { g.roundRect(-4, -10, 8, 15, 3); g.moveTo(-3, 6); g.lineTo(3, 6); g.lineTo(0, 12); g.moveTo(-8, -2); g.lineTo(-4, -4); g.lineTo(-4, 4); g.moveTo(8, -2); g.lineTo(4, -4); g.lineTo(4, 4) }
    else if (s.k == 'clone') { g.arc(-5, -5, 4.5, 0, 7); g.moveTo(10, -5); g.arc(5, -5, 4.5, 0, 7); g.rect(-9, 1, 8, 8); g.rect(1, 1, 8, 8) }
    else if (s.k == 'shield') { g.moveTo(0, -10); g.lineTo(9, -6); g.quadraticCurveTo(9, 5, 0, 10); g.quadraticCurveTo(-9, 5, -9, -6) }
    else { g.moveTo(-8, 9); g.lineTo(-8, -2); g.arc(0, -2, 8, Math.PI, 0); g.lineTo(8, 9); g.lineTo(4, 6); g.lineTo(0, 9); g.lineTo(-4, 6) }
    g.closePath(); g.fill(); if (s.k == 'ghost') { g.fillStyle = '#1d1d2a'; g.fillRect(-4, -4, 2.5, 3); g.fillRect(2, -4, 2.5, 3) } g.restore(); label(nm, s.x, y - 26, 13, '#fff'); g.restore();
  }
  function flame(p) {
    const x = p.x - p.face * 18.5, y = p.y - 4, L = 52 * (1 + .2 * Math.sin(t * 70) + Math.random() * .25); g.save(); g.globalCompositeOperation = 'lighter';
    const r = g.createRadialGradient(x, y + 14, 2, x, y + 14, 52); r.addColorStop(0, 'rgba(255,150,50,.5)'); r.addColorStop(1, 'rgba(255,100,20,0)'); g.fillStyle = r; g.fillRect(x - 55, y - 38, 110, 110);
    for (const [w, l, c0, c1] of [[8, 1, 'rgba(255,70,10,.95)', 'rgba(255,120,0,0)'], [5.5, .72, 'rgba(255,190,40,.95)', 'rgba(255,160,0,0)'], [3, .45, 'rgba(255,255,230,1)', 'rgba(120,200,255,0)']]) { const gr = g.createLinearGradient(0, y, 0, y + L * l); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 1.2, y + L * l * .5, x + (Math.random() - .5) * 3, y + L * l); g.quadraticCurveTo(x + w * 1.2, y + L * l * .5, x + w, y); g.closePath(); g.fill() }
    g.restore();
  }
  function fxBack() {
    for (const q of puffs) { g.globalAlpha = Math.max(0, q.l / q.l0) * .55; g.fillStyle = 'rgb(' + q.col + ')'; g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill() } g.globalAlpha = 1;
    for (const q of streaks) { const a = q.l / q.l0, x2 = q.x - q.d * q.len, gr = g.createLinearGradient(q.x, 0, x2, 0); gr.addColorStop(0, 'rgba(200,245,255,' + a * .9 + ')'); gr.addColorStop(1, 'rgba(200,245,255,0)'); g.strokeStyle = gr; g.lineWidth = 2; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(x2, q.y); g.stroke() }
    for (const p of players) {
      if (p.lives <= 0) continue;
      if (p.fx.spd) {
        g.save(); g.globalCompositeOperation = 'lighter'; const r = g.createRadialGradient(p.x, p.y - 24, 4, p.x, p.y - 24, 48); r.addColorStop(0, 'rgba(80,200,255,.45)'); r.addColorStop(1, 'rgba(80,200,255,0)'); g.fillStyle = r; g.fillRect(p.x - 50, p.y - 76, 100, 100); g.restore();
        const th = trails.get(p.u) || []; for (let i = 0; i < th.length - 1; i += 2) { const o = th[i]; g.save(); g.translate(o.x, o.y); g.scale(o.f, 1); g.globalAlpha = (i + 1) / th.length * .35; g.fillStyle = '#7fe9ff'; g.beginPath(); g.roundRect(-13, -27, 26, 20, 7); g.fill(); g.beginPath(); g.arc(0, -40, 18, 0, 7); g.fill(); g.fillRect(-12, -9, 24, 9); g.restore() }
      }
      if (p.thr) flame(p);
    }
  }
  function ringsDraw() { for (const q of rings) { const k = 1 - q.l / q.l0; g.globalAlpha = 1 - k; g.strokeStyle = q.col; g.lineWidth = 4 * (1 - k) + 1; g.beginPath(); g.ellipse(q.x, q.y, q.mr * k, q.mr * k * .3, 0, 0, 7); g.stroke() } g.globalAlpha = 1 }
  function camUpdate(dt) {
    const a = players.filter(p => p.lives > 0 && !p.clone);
    if (a.length) {
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const p of a) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y - 70); y1 = Math.max(y1, p.y) }
      const tz = Math.max(.55, Math.min(.8, Math.min(W / (x1 - x0 + 760), H / (y1 - y0 + 460)))); // never closer than the starting view
      const k = r => 1 - Math.exp(-r * dt);
      cam.tz += (tz - cam.tz) * k(1.2); cam.tx += ((x0 + x1) / 2 - cam.tx) * k(1.5); cam.ty += ((y0 + y1) / 2 - cam.ty) * k(1.2);
      cam.z += (cam.tz - cam.z) * k(3); cam.x += (cam.tx - cam.x) * k(3); cam.y += (cam.ty - cam.y) * k(3);
    }
    Z = cam.z; VX = Math.max(-320, Math.min(1280 - W / Z, cam.x - W / 2 / Z)); VY = Math.max(-60, Math.min(840 - H / Z, cam.y - H / 2 / Z));
  }
  function pyramids() { for (const [x, h, w] of [[300, 150, 300], [620, 110, 220]]) { const by = 400; g.beginPath(); g.moveTo(x - w / 2, by); g.lineTo(x, by - h); g.lineTo(x + w / 2, by); g.closePath(); g.fillStyle = '#e9b24d'; g.fill(); g.beginPath(); g.moveTo(x, by - h); g.lineTo(x + w / 2, by); g.lineTo(x + w * .1, by); g.closePath(); g.fillStyle = '#b9772a'; g.fill() } }
  function pole(x, y, y2, k) { box(x, y, 12, y2 - y, 2, k.pole); g.save(); g.beginPath(); g.rect(x, y, 12, y2 - y); g.clip(); g.fillStyle = k.stripe; for (let i = y; i < y2; i += 16) { g.beginPath(); g.moveTo(x, i + 8); g.lineTo(x + 12, i); g.lineTo(x + 12, i + 8); g.lineTo(x, i + 16); g.closePath(); g.fill() } g.restore(); g.lineWidth = 3; g.strokeStyle = INK; g.strokeRect(x, y, 12, y2 - y) }
  function render(dt) {
    camUpdate(dt); g.save(); if (shake && !reduce.matches) g.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
    g.save(); g.translate(-VX * Z, -VY * Z); g.scale(Z, Z); (map.terrain ? frost : background)(); scaffold(); booms.forEach(scorch); blast();
    for (const c of crates) crateDraw(c); for (const q of chutes) chuteDraw(q); for (const s of skills) orb(s); fxBack(); stainDraw(); players.forEach(draw); bloodDraw();
    for (const b of bullets) bullet(b); booms.forEach(boomDraw); shards.forEach(shardDraw); ringsDraw();
    for (const q of parts) { g.fillStyle = q.col; g.fillRect(q.x - 3, q.y - 3, 6, 6) }
    overlay(); g.restore(); g.restore();
    g.fillStyle = '#2a1a10'; g.fillRect(0, H, W, 70); g.fillStyle = '#ffb02e'; g.fillRect(0, H, W, 3);
    const main = players.filter(p => !p.clone); main.forEach(arrow); main.forEach(card); hud();
  }

  return { push, frame, setView(v) { self = v.self; nameOf = v.name } };
}
