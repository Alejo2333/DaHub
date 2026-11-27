// @ts-nocheck -- rules ported as-is from the single-file game; everything that leaves this file is typed in shared.ts
/**
 * The authoritative match. Runs only in the host's browser. Cosmetic effects are not simulated
 * here: they are emitted as short events that every client turns into particles on its own.
 */
import {
  AP, BLAST, FLY, FR, FREEZE, GRAV, GUNS, H, JUMP, JUMP2, KEY, LIVES, MAPS, MAX_FIGHTERS, NADE, ONETAP,
  POOL, PRESS, PWN, ROSTER, SHIELD, SK, SKI, TOUCH, W,
} from './shared';
import type { MatchSnap } from './shared';

export interface Match {
  step(dt: number): void;
  /** Latest held-key bits and new press bits from a human player. */
  input(id: string, held: number, pressed: number): void;
  /** A player left: their fighter is knocked out of the match. */
  leave(id: string): void;
  snap(): MatchSnap;
  readonly over: boolean;
}

const R = Math.round, r1 = v => Math.round(v * 10) / 10, r2 = v => Math.round(v * 100) / 100;

export function createMatch(humans: string[], mid: number): Match {
  const mi = Math.random() * MAPS.length | 0, map = MAPS[mi], plats = map.plats;
  let t = 0, crateT = 4, skT = 3, uid = 0, evId = 0, over = false, win = -1;
  let bullets = [], crates = [], skills = [], events = [];
  const emit = (...a) => { events.push([++evId, t, ...a]) };

  const fighter = (r, id, x, y) => ({
    u: ++uid, r, id, team: r, x, y, vx: 0, kx: 0, vy: 0, face: x < W / 2 ? 1 : -1, bot: !id, lives: LIVES, jumps: 2, ground: null, drop: 0, cool: 0,
    gun: 'popper', ammo: Infinity, nades: NADE.n, ncd: 0, safe: 2, wobble: 0, walk: 0, think: Math.random() * .1, ai: {}, by: null, fx: {}, held: 0, pressed: 0,
    stats: { kos: 0, falls: 0, shots: 0, hits: 0, combo: 0, run: 0, at: -9, out: null },
  });
  const count = Math.min(MAX_FIGHTERS, humans.length);
  let players = Array.from({ length: count }, (_, r) => fighter(r, humans[r], ...map.spawns[r]));
  // The match ends with one fighter left.
  function checkEnd() {
    const left = players.filter(o => o.lives > 0 && !o.clone);
    if (left.length <= 1) { over = true; win = left.length === 1 ? left[0].r : -1 }
    return over;
  }

  const col = p => ROSTER[p.r][1];
  const burst = (x, y, c, n) => emit('b', R(x), R(y), c, n);
  const ring = (x, y, mr, l, c) => emit('r', R(x), R(y), mr, l, c);
  const pop = (p, l, big, force, txt) => emit('p', p.u, R(p.x), R(p.y - 80), l, big ? 1 : 0, force ? 1 : 0, txt);
  const shake = v => emit('k', v);
  const under = (x, y) => plats.some(s => x > s.x && x < s.x + s.w && s.y > y + 8);

  function jump(p) { if (p.jumps > 0) { p.vy = -(p.jumps == 2 ? JUMP : JUMP2); p.jumps--; p.ground = null; burst(p.x, p.y, '#fff4e0', 5) } }
  function shoot(p) {
    if (p.cool > 0) return; const q = GUNS[p.gun]; p.cool = q.cd; const sh = { hit: false, x: p.x }; (p.src || p).stats.shots++;
    for (let i = 0; i < q.n; i++) bullets.push({ i: ++uid, a: 0, x: p.x + p.face * 8, y: p.y - 24, vx: p.face * q.speed, vy: (q.n > 1 ? (i / (q.n - 1) - .5) * q.spread : 0) + (q.jit ? (Math.random() - .5) * q.jit : 0), l: q.life, push: q.push * (q.n > 1 ? .55 : 1), owner: p, sh, k: p.gun, c: Math.random() < (q.crit || 0) });
    p.kx -= p.face * q.recoil;
    emit('f', R(p.x), R(p.y), p.face, p.gun, p.u);
    if (--p.ammo <= 0) { p.gun = 'popper'; p.ammo = Infinity }
  }
  // one landed shot counts once for accuracy, combo and shield charges
  const callout = (b, p) => b.k == 'sniper' ? 'SNIPED' : b.k == 'boom' && Math.abs(p.x - b.sh.x) <= PWN ? 'PWND' : b.k == 'freeze' ? 'FROZEN' : null;
  function hit(p, b, dir, push, lift) {
    const tag = callout(b, p); const first = !b.sh.hit; const foe = p.team !== b.owner.team;
    if (first && foe) { b.sh.hit = true; const st = (b.owner.src || b.owner).stats; st.hits++; st.run = t - st.at < 1.3 ? st.run + 1 : 1; st.at = t; st.combo = Math.max(st.combo, st.run) }
    if (p.blocked === b.sh) return;
    if (p.fx.shield > 0) { p.fx.shield--; p.blocked = b.sh; pop(p, .6, 0, 1, p.fx.shield ? 'BLOCK' : 'BROKEN'); ring(p.x, p.y - 24, 60, .35, SKI.shield[1]); burst(b.x, b.y, SKI.shield[1], p.fx.shield ? 8 : 22); return }
    emit('bd', R(b.x), R(b.y), Math.sign(dir), b.c ? 30 : b.k == 'grenade' ? 34 : 16);
    p.kx += dir * push * (b.c ? 1.8 : 1) * (1 + p.wobble) * (1 + Math.max(0, t - 60) / 90); p.vy -= lift;
    if (b.k == 'freeze') { p.fx.ice = FREEZE; p.ia = 0; emit('s', R(b.x), R(b.y), 12, 260); burst(p.x, p.y - 24, '#bff0ff', 18); ring(p.x, p.y - 24, 70, .45, '#9fe6ff') }
    if (foe) { p.wobble = Math.min(2.2, p.wobble + (b.k == 'grenade' ? .3 : .15 * (push / 340))); p.by = b.owner }
    p.cn = (t - (p.ct || -9) < 1.3 ? p.cn : 0) + 1; p.ct = t;
    pop(p, tag ? .9 : .6, !!tag, 0, tag || (!foe || b.k == 'grenade' ? 'BOOM' : b.c ? 'CRIT!' : (p.cn > 1 ? p.cn + ' HIT' : 'HIT')));
    shake(6); burst(b.x, b.y, col(p), 8); if (b.c) { burst(b.x, b.y, '#ff3b3b', 16); shake(10) }
    if (b.c && Math.random() < ONETAP) oneTap(p, dir);
  }
  // launched fighters lose control and pass through floors until they leave the map
  function oneTap(p, dir) { p.fly = dir; p.vy = -420; p.ground = null; p.thr = false; pop(p, 1.1, 1, 1, '1 TAP!'); shake(14); burst(p.x, p.y - 24, '#fff2a0', 30); ring(p.x, p.y - 24, 140, .5, '#ff3b3b') }
  function explode(b) {
    b.l = 0; shake(18); emit('x', R(b.x), R(b.y));
    for (const p of players) {
      if (p.lives <= 0 || p.safe > 0 || p.fly) continue;
      const dx = p.x - b.x, d = Math.hypot(dx, p.y - 24 - b.y); if (d > BLAST) continue; const f = 1 - .5 * d / BLAST;
      // standing on it throws you straight up; off to the side throws you away
      hit(p, b, Math.sign(dx) * Math.min(1, Math.abs(dx) / 16), b.push * f, NADE.lift * f); p.ground = null;
    }
  }
  function dropNade(p) {
    if (p.nades <= 0 || p.ncd > 0) return; p.nades--; p.ncd = NADE.cd; (p.src || p).stats.shots++;
    bullets.push({ i: ++uid, a: 0, x: p.x, y: p.y - 14, vx: 0, vy: 0, l: NADE.fuse, push: NADE.push, owner: p, sh: { hit: false, x: p.x }, k: 'grenade', c: false });
  }
  function mkClone(o) {
    const c = fighter(o.r, null, o.x + (o.face > 0 ? -30 : 30), o.y - 4);
    Object.assign(c, { src: o.src || o, clone: 1, cl: 20, lives: 1, team: o.team, safe: 1, face: o.face, gun: o.gun, ammo: o.ammo, nades: o.nades });
    players.push(c); burst(c.x, c.y - 20, '#7dff6a', 18);
  }

  function botInput(p, dt) {
    const a = p.ai; p.think -= dt; if (p.think > 0) return a; p.think = .12;
    a.left = a.right = a.jump = a.down = a.fire = a.nade = false;
    const over = plats.some(s => p.x > s.x + 4 && p.x < s.x + s.w - 4 && s.y >= p.y - 2);
    if (!over) { // recover toward the closest floor
      let m, best = 1e9; for (const s of plats) { const d = Math.abs(p.x - Math.max(s.x + 20, Math.min(s.x + s.w - 20, p.x))) + Math.abs(p.y - s.y); if (d < best) { best = d; m = s } }
      a[p.x < m.x + m.w / 2 ? 'right' : 'left'] = true; if (p.vy > 60) a.jump = true; return a;
    }
    const bomb = bullets.find(b => b.k == 'grenade' && Math.abs(b.x - p.x) < BLAST + 20 && Math.abs(b.y - p.y) < 130);
    if (bomb) { const d = p.x >= bomb.x ? 1 : -1, nx = p.x + d * 55; if (!p.ground || plats.some(s => nx > s.x && nx < s.x + s.w && s.y >= p.y - 2)) a[d > 0 ? 'right' : 'left'] = true; else a.jump = true; return a }
    let foe, near = 1e9; for (const o of players) if (o.team !== p.team && o.lives > 0) { const d = Math.abs(o.x - p.x) + Math.abs(o.y - p.y) * 2; if (d < near && !(o.fx.ghost > 0 && d > 400)) { near = d; foe = o } }
    if (!foe) return a;
    const goal = crates.find(c => c.landed && p.gun == 'popper' && Math.abs(c.y - p.y) < 150) || skills.find(s => Math.abs(s.y - p.y) < 120 && Math.abs(s.x - p.x) < 420) || foe, dx = goal.x - p.x, dy = goal.y - p.y;
    let dir = 0;
    if (goal !== foe || Math.abs(dx) > (AP[p.gun] || 260) || Math.abs(dy) > 40) dir = Math.abs(dx) > 14 ? Math.sign(dx) : 0;
    if (dir && p.ground) { const nx = p.x + dir * 45; if (!plats.some(s => nx > s.x && nx < s.x + s.w && s.y >= p.y - 2)) dy < 30 ? a.jump = true : dir = 0 }
    if (dy < -40 && (p.ground || p.vy > 0) && Math.random() < .5) a.jump = true;
    if (dy > 40 && p.ground && under(p.x, p.y)) a.down = true;
    if (dir) a[dir > 0 ? 'right' : 'left'] = true;
    if (Math.abs(foe.y - p.y) < 34 && Math.abs(foe.x - p.x) < (FR[p.gun] || 520)) {
      if (Math.sign(foe.x - p.x) !== p.face && foe.x !== p.x) p.face = Math.sign(foe.x - p.x);
      a.fire = Math.random() < .25;
    }
    if (Math.abs(foe.x - p.x) < 80 && foe.y - p.y > -30 && foe.y - p.y < 140 && Math.random() < .2) a.nade = true;
    return a;
  }

  function step(dt) {
    if (over) return; t += dt;
    for (const p of players) {
      if (p.lives <= 0) continue;
      if (p.fx.spd > 0) p.fx.spd -= dt; if (p.fx.ghost > 0) p.fx.ghost -= dt;
      if (p.fx.ice > 0) { p.ia += dt; if ((p.fx.ice -= dt) <= 0) { emit('s', R(p.x), R(p.y - 30), 26, 330); ring(p.x, p.y - 24, 60, .35, '#e8fbff') } }
      const iced = p.fx.ice > 0;
      if (p.clone && (p.cl -= dt) <= 0) { p.lives = 0; burst(p.x, p.y - 20, col(p), 20); continue }
      const h = p.held, pr = p.pressed;
      const i = p.fly || iced ? {} : p.bot ? botInput(p, dt) : { left: h & KEY.left, right: h & KEY.right, jump: pr & PRESS.jump, down: h & KEY.down, fire: (h & KEY.fire) || (pr & PRESS.fire), nade: pr & PRESS.nade };
      const dir = (i.right ? 1 : 0) - (i.left ? 1 : 0); if (dir) p.face = dir;
      p.vx = dir * (p.bot ? 200 : 250) * (p.fx.spd > 0 ? 1.7 : 1);
      if (i.jump) { jump(p); if (p.bot) i.jump = false }
      if (i.down && p.ground && !p.ground.solid && (!p.bot || under(p.x, p.y))) { p.drop = .16; p.ground = null }
      if (i.fire) shoot(p); p.ncd -= dt; if (i.nade) { dropNade(p); if (p.bot) i.nade = false }
      p.thr = false;
      if (!p.fly && !iced && p.fx.jet > 0 && !p.ground && (p.bot ? (p.y > 400 || p.vy > 350) : h & KEY.jump)) { p.vy = Math.max(p.vy - 2600 * dt, -340); p.fx.jet -= 28 * dt; p.thr = true }
      p.cool -= dt; p.drop -= dt; p.safe -= dt; p.wobble = Math.max(0, p.wobble - dt * .08); p.walk += dir ? dt * 14 : 0;
      if (p.fly) { p.vx = 0; p.kx = p.fly * FLY } else p.kx *= Math.pow(p.ground ? .015 : .2, dt); p.vy = Math.min(p.vy + 1500 * dt, 800);
      const py = p.y; p.x += (p.vx + p.kx) * dt; p.y += p.vy * dt; p.ground = null;
      if (!p.fly && p.vy >= 0 && p.drop <= 0) for (const s of plats) if (p.x > s.x - 10 && p.x < s.x + s.w + 10 && py <= s.y + 1 && p.y >= s.y) { p.y = s.y; p.vy = 0; p.jumps = 2; p.ground = s; break }
      if (!p.ground && p.jumps == 2) p.jumps = 1;
      if (p.y > H + 260 || p.x < -320 || p.x > W + 320) {
        if (p.clone) { p.lives = 0; continue }
        p.lives--; shake(10); p.stats.falls++; if (p.lives <= 0) p.stats.out = t; if (p.by) (p.by.src || p.by).stats.kos++;
        emit('kf', p.by ? p.by.r : -1, p.r);
        if (checkEnd()) return;
        Object.assign(p, { x: 220 + Math.random() * 520, y: 20, vx: 0, vy: 0, kx: 0, safe: 2.2, wobble: 0, gun: 'popper', ammo: Infinity, jumps: 1, by: null, fx: {}, fly: 0, nades: NADE.n, ncd: 0 });
      }
    }
    for (const p of players) p.pressed = 0;

    for (const b of bullets) {
      b.a += dt; let bx = b.x;
      if (!b.swept) { b.swept = true; if (b.k == 'sniper' || b.k == 'boom') bx = b.owner.x - Math.sign(b.vx) * (TOUCH - 18) }
      const by = b.y, lob = b.k == 'grenade'; if (lob && !b.rest) b.vy += GRAV * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.l -= dt;
      let touched = false;
      for (const p of players) if (p.team !== b.owner.team && p.lives > 0 && !p.fly && (b.l > 0 || lob) && p.safe <= 0 && Math.max(bx, b.x) > p.x - 18 && Math.min(bx, b.x) < p.x + 18 && b.y > p.y - 52 && b.y < p.y) {
        if (lob) { touched = true; break }
        b.l = 0; hit(p, b, Math.sign(b.vx), b.push, 110);
      }
      if (lob) { const s = b.vy > 0 && plats.find(s => b.x > s.x && b.x < s.x + s.w && by <= s.y && b.y >= s.y); if (s) { b.y = s.y - 8; b.vy = 0; b.rest = true } if (touched || b.l <= 0) explode(b) }
    }
    bullets = bullets.filter(b => b.l > 0);

    crateT -= dt;
    if (crateT <= 0 && crates.length < 2) { const s = plats[Math.random() * plats.length | 0]; crates.push({ i: ++uid, x: s.x + 25 + Math.random() * (s.w - 50), y: -110, to: s.y, landed: false, gun: POOL[Math.random() * POOL.length | 0], sw: 0, bt: 0 }); crateT = 9 }
    for (const c of crates) {
      if (c.bt > 0) c.bt -= dt;
      if (!c.landed) { c.sw += dt; c.y += 110 * dt; if (c.y >= c.to) { c.y = c.to; c.landed = true; c.bt = .3; emit('l', R(c.x), R(c.to)) } }
      for (const p of players) if (p.lives > 0 && !c.gone && Math.abs(p.x - c.x) < 28 && Math.abs((p.y - 24) - (c.y - 14)) < 40) { c.gone = true; p.gun = c.gun; p.ammo = GUNS[c.gun].ammo; burst(c.x, c.y, '#ffe066', 14) }
    }
    crates = crates.filter(c => !c.gone);

    skT -= dt;
    if (skT <= 0) { skT = 6 + Math.random() * 4; if (skills.length < 2) { const q = plats[Math.random() * plats.length | 0]; const s = { i: ++uid, x: q.x + 25 + Math.random() * (q.w - 50), y: q.y, k: SK[Math.random() * SK.length | 0], l: 14, ph: Math.random() * 6, a: 0 }; skills.push(s); emit('o', R(s.x), R(s.y), SKI[s.k][1]) } }
    for (const s of skills) {
      s.l -= dt; s.a += dt;
      for (const p of players) if (p.lives > 0 && !p.clone && !s.got && Math.abs(p.x - s.x) < 42 && Math.abs((p.y - 24) - (s.y - 52)) < 62) {
        s.got = 1; burst(s.x, s.y - 30, SKI[s.k][1], 16); ring(s.x, s.y, 80, .5, SKI[s.k][1]);
        if (s.k == 'jet') p.fx.jet = 100; else if (s.k == 'spd') p.fx.spd = 8; else if (s.k == 'ghost') p.fx.ghost = 15; else if (s.k == 'shield') p.fx.shield = SHIELD; else mkClone(p);
      }
    }
    skills = skills.filter(s => !s.got && s.l > 0);
    players = players.filter(p => !p.clone || p.lives > 0);
  }

  function snap(): MatchSnap {
    events = events.filter(e => e[1] > t - .5); // a short window, so a dropped or merged snapshot loses no effects
    return {
      mid, m: mi, t: Math.round(t * 1000) / 1000, win, over,
      P: players.map(p => {
        const s = p.stats;
        return {
          u: p.u, r: p.r, id: p.id, x: r1(p.x), y: r1(p.y), vx: R(p.vx), f: p.face, l: Math.max(0, p.lives), g: p.gun, a: p.ammo === Infinity ? -1 : p.ammo, n: p.nades,
          w: r2(p.wobble), s: p.safe > 0 ? 1 : 0, c: p.clone ? 1 : 0, fl: p.fly ? 1 : 0, th: p.thr ? 1 : 0, gr: p.ground ? 1 : 0, wk: r1(p.walk),
          ice: r2(Math.max(0, p.fx.ice || 0)), ia: r2(p.ia || 0), jet: R(Math.max(0, p.fx.jet || 0)), sp: p.fx.spd > 0 ? 1 : 0, gh: r1(Math.max(0, p.fx.ghost || 0)), sh: p.fx.shield || 0,
          st: [s.kos, s.falls, s.shots, s.hits, s.combo, s.out == null ? -1 : r1(s.out)],
        };
      }),
      B: bullets.map(b => ({ i: b.i, x: r1(b.x), y: r1(b.y), vx: R(b.vx), vy: R(b.vy), k: b.k, c: b.c ? 1 : 0, l: r2(b.l), a: r2(b.a) })),
      C: crates.map(c => ({ i: c.i, x: R(c.x), y: r1(c.y), to: c.to, ld: c.landed ? 1 : 0, g: c.gun, sw: r2(c.sw), bt: r2(Math.max(0, c.bt)) })),
      S: skills.map(s => ({ i: s.i, x: R(s.x), y: s.y, k: s.k, l: r2(s.l), ph: r2(s.ph), a: r2(s.a) })),
      E: events.map(([id, , ...a]) => [id, ...a]),
    };
  }

  return {
    step, snap,
    input(id, held, pressed) { const p = players.find(o => o.id === id && !o.clone); if (p) { p.held = held; p.pressed |= pressed } },
    leave(id) {
      for (const p of players) if (p.id === id) { p.held = 0; if (p.lives > 0) { p.lives = 0; if (!p.clone) p.stats.out = t } }
      if (!over) checkEnd();
    },
    get over() { return over },
  };
}
