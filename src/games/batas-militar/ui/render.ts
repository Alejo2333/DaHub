/** Layer 6: gameplay entities, drawn in world space between the environment's back and front layers. */
import { BAZOOKA, DASH_TICKS, RESPAWN_TICKS, DROP_TTL, FX_TTL, GUN_Y, LASER, MAX_HP, PH, PICKUP_TICKS, SMG, SNIPER, weapon, type Body, type MilState } from "..";
import { spawnY, surfaceBelow, type MapDefinition } from "../maps";
import { INK, type G } from "./art";
import { MUZZLE, drawGun } from "./guns";
import { bloodHit, clearFx, damageNumber, dashPuff, drawOver, drawUnder, explode, fireFx, gib, goreOn, impact, laserBeam, sniperSight, sniperTrail } from "./fx";

let seen: MilState | null = null;
let seenMap = "";

const TAU = Math.PI * 2;
/** Guns are drawn at real-world proportions; this fits them to the soldiers' size. */
const HAND = 0.82;

export const hue = (id: string) => {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};

function soldier(g: G, x: number, y: number, a: number, h: number, jet: boolean, w: number, flash: number, t: number) {
  const f = Math.cos(a) >= 0 ? 1 : -1;
  const px = x - f * 13;
  g.lineJoin = "round"; g.lineWidth = 2; g.strokeStyle = INK;
  if (jet) {
    g.fillStyle = Math.random() < 0.5 ? "#ffb703" : "#fb8500";
    g.beginPath(); g.moveTo(px - 4, y + 10); g.lineTo(px + 4, y + 10); g.lineTo(px, y + 20 + Math.random() * 10); g.closePath(); g.fill();
    g.fillStyle = "#fff3b0";
    g.beginPath(); g.moveTo(px - 2, y + 10); g.lineTo(px + 2, y + 10); g.lineTo(px, y + 15 + Math.random() * 4); g.closePath(); g.fill();
  }
  g.beginPath(); g.roundRect(px - 5, y - 7, 10, 18, 3); g.fillStyle = "#5b6170"; g.fill(); g.stroke(); // jetpack
  g.beginPath(); g.roundRect(x - 8, y + 9, 6, 11, 2); g.roundRect(x + 2, y + 9, 6, 11, 2); g.fillStyle = "#2b2d42"; g.fill(); g.stroke(); // legs
  g.beginPath(); g.roundRect(x - 9, y - 6, 18, 17, 4); g.fillStyle = `hsl(${h} 55% 45%)`; g.fill(); g.stroke(); // body
  g.fillStyle = `hsl(${h} 60% 58%)`; g.fillRect(x - 6, y - 4, 4, 11);
  g.beginPath(); g.arc(x, y - 12, 8, 0, TAU); g.fillStyle = "#e9b98f"; g.fill(); g.stroke(); // head
  g.beginPath(); g.arc(x, y - 13, 8.8, Math.PI, 0); g.closePath(); g.fillStyle = `hsl(${h} 45% 30%)`; g.fill(); g.stroke(); // helmet
  g.fillStyle = "#111"; g.fillRect(x + f * 3 - 1.5, y - 12, 3, 3); // eye
  // Recoil: the gun snaps back and up when it fires, then settles.
  const kick = (flash / 3) ** 2 * (RECOIL[w] ?? 2);
  g.save();
  g.translate(x, y + GUN_Y + (w === BAZOOKA ? -5 : 0)); g.rotate(a);
  if (f < 0) g.scale(1, -1);
  g.translate(-kick, 0); g.rotate(-kick * 0.03);
  g.save(); g.scale(HAND, HAND); drawGun(g, w, t); g.restore();
  g.restore();
}

/** How far each gun kicks back (px) right after a shot. */
const RECOIL: Record<number, number> = { 0: 3, 1: 5, 2: 1.5, 3: 7, 4: 0.4, 5: 6, 6: 2.5 };

function pickup(g: G, x: number, y: number, kind: number, t: number) {
  const by = y + Math.sin(t * 3 + x) * 3;
  const glow = g.createRadialGradient(x, by, 0, x, by, 26);
  glow.addColorStop(0, kind ? "rgba(255,220,90,0.45)" : "rgba(120,255,150,0.45)"); glow.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = glow; g.fillRect(x - 26, by - 26, 52, 52);
  g.lineWidth = 2.2; g.strokeStyle = INK; g.lineJoin = "round";
  g.beginPath(); g.roundRect(x - 11, by - 9, 22, 18, 4);
  g.fillStyle = kind ? "#6b7a3a" : "#f4f1ea"; g.fill(); g.stroke();
  if (kind) {
    g.fillStyle = "#e7c64a";
    for (const dx of [-6, -1, 4]) { g.beginPath(); g.roundRect(x + dx, by - 6, 3.5, 10, [2, 2, 0, 0]); g.fill(); }
  } else {
    g.fillStyle = "#d9483b"; g.fillRect(x - 2.5, by - 6, 5, 12); g.fillRect(x - 6, by - 2.5, 12, 5);
  }
}

export function drawEntities(
  g: G, s: MilState, m: MapDefinition, dt: number, names: Record<string, string>,
  selfId: string, myAim: number, t: number, nameOf: (id: string) => string,
) {
  const ex = (b: Body) => ({ x: b.x + b.vx * dt, y: b.y + b.vy * dt });
  if (seenMap !== m.id) { clearFx(); seenMap = m.id; }
  // One-off effects for things that happened in a new host tick.
  if (s !== seen) {
    for (const f of s.fx) {
      if (f.k === 0 && f.t === FX_TTL[0]! - 1) explode(m, f.x, f.y);
      else if (f.k === 2 && f.t === FX_TTL[2]! - 1) bloodHit(f.x, f.y);
      else if (f.k === 3 && f.t === FX_TTL[3]! - 1) {
        // Whoever just died nearest this spot, for the colour of their helmet and uniform.
        let who: string | null = null, best = 80;
        for (const [id, q] of Object.entries(s.p)) {
          const d = Math.hypot(q.x - f.x, q.y - f.y);
          if (q.dead >= RESPAWN_TICKS - 1 && d < best) { best = d; who = id; }
        }
        const q = who ? s.p[who] : undefined;
        gib(f.x, f.y, who ? hue(who) : 0, q?.vx ?? 0, q?.vy ?? 0);
      }
    }
    for (const p of Object.values(s.p)) if (!p.dead && p.ds === DASH_TICKS - 1) dashPuff(p.x, p.y + PH - 2, Math.sign(p.vx) || 1);
    for (const f of s.fx) if (f.k === 1 && f.t === FX_TTL[1]! - 1) impact(f.x, f.y);
    // Muzzle flashes, smoke and casings for everyone who fired this tick.
    for (const [id, p] of Object.entries(s.p)) {
      if (p.dead || p.fl !== 3) continue;
      const a = id === selfId ? myAim : p.a;
      fireFx(p.x, p.y + GUN_Y + (p.w === BAZOOKA ? -5 : 0), a, p.w, (MUZZLE[p.w as 0] ?? 30) * HAND);
    }
    // Damage numbers from health drops (yellow if you dealt them).
    const mine = (s.p[selfId]?.ht ?? 0) === 6;
    if (seen?.ph === 1) for (const [id, p] of Object.entries(s.p)) {
      const q = seen.p[id];
      if (!q || q.dead) continue;
      const lost = q.hp - p.hp;
      if (lost >= 1) damageNumber(q.x, q.y - PH - 18, lost, mine && id !== selfId, p.hh === 6);
    }
    seen = s;
  }

  m.pickups.forEach((p, i) => {
    const y = spawnY(m, p) - 14;
    const wait = s.pk[i] ?? 0;
    if (!wait) { pickup(g, p.x, y, p.kind, t); return; }
    g.beginPath(); g.arc(p.x, y, 9, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - wait / PICKUP_TICKS));
    g.lineWidth = 2; g.strokeStyle = "rgba(255,255,255,0.35)"; g.stroke();
  });

  // Weapons lying around: bob, glow, a name tag, and blink before they vanish.
  g.font = "bold 9px sans-serif"; g.textAlign = "center";
  for (const d of s.wd) {
    if (d.t < 90 && Math.floor(t * 8) % 2) continue;
    const by = d.y - 18 + Math.sin(t * 3 + d.x) * 3;
    const ring = g.createRadialGradient(d.x, by, 0, d.x, by, 30);
    ring.addColorStop(0, "rgba(255,240,170,0.5)"); ring.addColorStop(1, "rgba(255,240,170,0)");
    g.fillStyle = ring; g.fillRect(d.x - 30, by - 30, 60, 60);
    g.beginPath(); g.ellipse(d.x, d.y - 1, 16, 3.5, 0, 0, TAU); g.fillStyle = "rgba(0,0,0,0.3)"; g.fill();
    g.save(); g.translate(d.x - 6, by); g.rotate(Math.sin(t * 1.5 + d.x) * 0.12); g.scale(0.95, 0.95); drawGun(g, d.w, t); g.restore();
    const label = weapon(d.w).name;
    g.lineWidth = 3; g.strokeStyle = "#000b"; g.strokeText(label, d.x, by - 16);
    g.fillStyle = "#ffe8a3"; g.fillText(label, d.x, by - 16);
    if (d.t < DROP_TTL) { g.beginPath(); g.arc(d.x, by - 26, 3, -Math.PI / 2, -Math.PI / 2 + TAU * (d.t / DROP_TTL)); g.lineWidth = 1.5; g.strokeStyle = "rgba(255,255,255,0.5)"; g.stroke(); }
  }

  // Soft contact shadows on whatever surface is below.
  const shadow = (x: number, y: number, w: number) => {
    const gy = surfaceBelow(m, x, y), d = gy - y;
    if (d < 0 || d > 300) return;
    const k = 1 - d / 300;
    g.beginPath(); g.ellipse(x, gy - 1, w * (0.6 + 0.4 * k), 3.5 * k + 1, 0, 0, TAU);
    g.fillStyle = `rgba(0,0,0,${0.35 * k})`; g.fill();
  };
  drawUnder(g);
  for (const p of Object.values(s.p)) if (!p.dead) { const q = ex(p); shadow(q.x, q.y + PH, 13); }
  for (const n of s.g) { const q = ex(n); shadow(q.x, q.y + 4, 5); }

  for (const n of s.g) {
    const p = ex(n);
    g.beginPath(); g.arc(p.x, p.y, 5, 0, TAU); g.fillStyle = "#3a5a40"; g.fill(); g.lineWidth = 1.6; g.strokeStyle = INK; g.stroke();
    g.fillStyle = Math.floor(t * 8) % 2 ? "#ff6b6b" : "#ffe066"; g.fillRect(p.x - 1, p.y - 7, 2, 2);
  }

  g.font = "bold 10px sans-serif";
  g.textAlign = "center";
  for (const [id, p] of Object.entries(s.p)) {
    if (p.dead) continue;
    const { x, y } = ex(p);
    const aim = id === selfId ? myAim : p.a;
    if (p.ds > 0) {
      // Dash afterimages and speed lines.
      for (let k = 3; k >= 1; k--) {
        g.globalAlpha = 0.12 * (4 - k);
        soldier(g, x - p.vx * k * 0.45, y - p.vy * k * 0.45, aim, hue(id), false, p.w, 0, t);
      }
      g.globalAlpha = 1;
      g.beginPath();
      for (const oy of [-14, -2, 10]) { g.moveTo(x - p.vx * 0.6, y + oy); g.lineTo(x - p.vx * 2.6, y + oy - p.vy * 2); }
      g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 1.6; g.stroke();
    }
    soldier(g, x, y, aim, hue(id), p.j, p.w, p.fl, t);
    g.fillStyle = "#000a"; g.fillRect(x - 16, y - 31, 32, 6);
    g.fillStyle = p.hp > 40 ? "#8ce99a" : "#ff6b6b"; g.fillRect(x - 15, y - 30, (30 * p.hp) / MAX_HP, 4);
    g.lineWidth = 3; g.strokeStyle = "#000c"; g.strokeText(names[id] ?? nameOf(id), x, y - 35);
    g.fillStyle = id === selfId ? "#ffe066" : "#fff"; g.fillText(names[id] ?? nameOf(id), x, y - 35);
  }

  // Sniper rounds: a red-hot slug with a lingering trail that sheds embers (see fx.ts), plus a glow.
  for (const b of s.b) {
    if (b.w !== SNIPER) continue;
    const p = ex(b);
    sniperTrail(p.x, p.y, b.vx, b.vy, 1);
    g.save(); g.globalCompositeOperation = "lighter"; g.lineCap = "round";
    g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - b.vx * 0.9, p.y - b.vy * 0.9);
    g.strokeStyle = "rgba(255,30,30,0.35)"; g.lineWidth = 14; g.stroke();
    g.strokeStyle = "rgba(255,60,40,0.8)"; g.lineWidth = 5; g.stroke();
    g.strokeStyle = "#fff0e8"; g.lineWidth = 1.8; g.stroke();
    const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, 18);
    glow.addColorStop(0, "rgba(255,240,230,1)"); glow.addColorStop(0.3, "rgba(255,50,40,0.8)"); glow.addColorStop(1, "rgba(255,0,0,0)");
    g.fillStyle = glow; g.fillRect(p.x - 18, p.y - 18, 36, 36);
    g.restore();
  }

  // Everyone else's tracers: rifle orange, SMG short and thin.
  g.lineCap = "round";
  for (const kind of [0, SMG]) {
    const len = kind === SNIPER ? 1.1 : kind === SMG ? 0.35 : 0.5;
    g.beginPath();
    for (const b of s.b) {
      if ((b.w === SNIPER || b.w === SMG ? b.w : 0) !== kind) continue;
      const p = ex(b); g.moveTo(p.x, p.y); g.lineTo(p.x - b.vx * len, p.y - b.vy * len);
    }
    g.strokeStyle = kind === SNIPER ? "rgba(160,220,255,0.55)" : "rgba(255,180,60,0.5)"; g.lineWidth = kind === SNIPER ? 6 : kind === SMG ? 3 : 4; g.stroke();
    g.strokeStyle = kind === SNIPER ? "#ffffff" : "#fff3b0"; g.lineWidth = kind === SNIPER ? 2.2 : 1.4; g.stroke();
  }

  // Rockets with a flickering exhaust.
  for (const r of s.r) {
    const p = ex(r), a = Math.atan2(r.vy, r.vx);
    g.save(); g.translate(p.x, p.y); g.rotate(a);
    g.beginPath(); g.moveTo(-8, -3); g.lineTo(-16 - Math.random() * 8, 0); g.lineTo(-8, 3); g.closePath(); g.fillStyle = Math.random() < 0.5 ? "#ffb703" : "#fb8500"; g.fill();
    g.lineWidth = 1.4; g.strokeStyle = INK;
    g.beginPath(); g.roundRect(-9, -3.5, 14, 7, 2); g.fillStyle = "#6b7a3a"; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(5, -3.5); g.quadraticCurveTo(12, 0, 5, 3.5); g.closePath(); g.fillStyle = "#c8463a"; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(-9, -3.5); g.lineTo(-12, -7); g.lineTo(-6, -3.5); g.moveTo(-9, 3.5); g.lineTo(-12, 7); g.lineTo(-6, 3.5); g.fillStyle = "#3a4426"; g.fill(); g.stroke();
    g.restore();
  }

  // Continuous laser beams and red sniper sights, traced every frame from the shooter's gun.
  const alive = Object.entries(s.p).filter(([, p]) => !p.dead);
  for (const [id, p] of alive) {
    if (p.w !== LASER && p.w !== SNIPER) continue;
    const q = ex(p), aim = id === selfId ? myAim : p.a;
    const mz = (MUZZLE[p.w as 0] ?? 30) * HAND, c = Math.cos(aim), sn = Math.sin(aim);
    const ox = q.x + c * mz, oy = q.y + GUN_Y + sn * mz;
    if (p.w === LASER && p.fl > 0) laserBeam(g, m, ox, oy, aim, t, alive.filter(([o]) => o !== id).map(([, o]) => ex(o)));
    else if (p.w === SNIPER) sniperSight(g, m, ox, oy, aim, t);
  }

  for (const f of s.fx) {
    const life = f.t / (FX_TTL[f.k] ?? 10);
    g.beginPath();
    if (f.k === 0 || f.k === 6) continue; // explosions and dash puffs are drawn by fx.ts
    if (f.k === 1) {
      g.fillStyle = "#ffe066"; g.arc(f.x, f.y, 2.5, 0, TAU);
    } else if (f.k === 2) {
      g.fillStyle = `rgba(200,30,40,${life})`; g.arc(f.x, f.y, 3 + (1 - life) * 4, 0, TAU);
    } else if (f.k === 3) {
      if (goreOn()) continue;
      g.fillStyle = `rgba(200,200,200,${life * 0.7})`; g.arc(f.x, f.y, 14 + (1 - life) * 16, 0, TAU);
    } else if (f.k === 5) {
      g.fillStyle = `rgba(190,190,190,${life * 0.45})`; g.arc(f.x, f.y, 4 + (1 - life) * 9, 0, TAU);
    } else {
      g.strokeStyle = `rgba(255,255,200,${life})`; g.lineWidth = 2; g.arc(f.x, f.y, 6 + (1 - life) * 22, 0, TAU); g.stroke(); continue;
    }
    g.fill();
  }
  drawOver(g, t, m);
}
