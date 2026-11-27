import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import ChatBox from "../../../app/ChatBox";
import {
  isHost,
  leave,
  nameOf,
  returnToLobby,
  selfId,
  sendAction,
} from "../../../multiplayer/party";
import { useApp } from "../../../stores/app";
import {
  DASH_COOLDOWN,
  DASH_TICKS,
  FX_TTL,
  GUN_Y,
  KILLS_TO_WIN,
  LASER,
  MAX_FUEL,
  MAX_HP,
  MAX_NADES,
  NADE,
  PISTOL,
  TICK_MS,
  mapAt,
  weapon,
  weaponName,
  type MilAction,
  type MilState,
} from "..";
import { playAmbience, stopAmbience } from "./ambience";
import { EnvRenderer, QUALITIES, loadQuality, saveQuality, worldTransform, type Quality } from "./env";
import MapSelect from "./MapSelect";
import { drawGunIcon } from "./guns";
import * as sfx from "./sfx";
import { goreOn, setGore } from "./fx";
import { drawEntities, hue } from "./render";

const send = (a: MilAction) => sendAction(a);
const VIEW_W = 1000,
  VIEW_H = 560;
type Stick = { id: number; ox: number; oy: number; x: number; y: number };

function GunIcon({ w, dim = false, style }: { w: number; dim?: boolean; style?: CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) drawGunIcon(ref.current, w, dim); }, [w, dim]);
  return <canvas ref={ref} style={{ width: 78, height: 30, display: "block", filter: "drop-shadow(0 0 1px #fff) drop-shadow(0 0 3px #ffffff55)", ...style }} />;
}

const color = (id: string) => `hsl(${hue(id)} 70% 65%)`;

function Meter({ icon, v, max, fill, label }: { icon: ReactNode; v: number; max: number; fill: string; label: string }) {
  const k = Math.max(0, Math.min(1, v / max));
  return (
    <div className="mil-meter">
      <span className="mil-meter-icon">{icon}</span>
      <div className="mil-meter-track">
        <div className="mil-meter-fill" style={{ width: `${k * 100}%`, background: fill }} />
        <span className="mil-meter-label">{label}</span>
      </div>
    </div>
  );
}

const CSS = `
.mil-stage{position:relative;width:100%;border-radius:14px;overflow:hidden;box-shadow:0 10px 40px #0008;background:#0d1424;user-select:none}
.mil-stage:fullscreen{border-radius:0}
.mil-stage canvas.mil-view{width:100%;height:min(76vh,62vw);min-height:300px;display:block;touch-action:none;cursor:none}
.mil-stage:fullscreen canvas.mil-view{height:100vh}
.mil-hud{position:absolute;inset:0;pointer-events:none;font-size:13px;color:#fff;text-shadow:0 1px 2px #000a}
.mil-panel{background:linear-gradient(180deg,#141c2ecc,#0b101bcc);border:1px solid #ffffff1f;border-radius:12px;backdrop-filter:blur(4px);box-shadow:0 4px 14px #0006}
.mil-tl{position:absolute;top:10px;left:10px;padding:8px 10px;display:grid;gap:6px;width:min(250px,40%)}
.mil-who{display:flex;align-items:center;gap:8px;font-weight:700}
.mil-dot{width:12px;height:12px;border-radius:50%;border:2px solid #0008;flex:none}
.mil-meter{display:flex;align-items:center;gap:6px}
.mil-meter-icon{width:16px;text-align:center;font-size:12px}
.mil-meter-track{position:relative;flex:1;height:14px;background:#0008;border-radius:7px;overflow:hidden;border:1px solid #ffffff22}
.mil-meter-fill{height:100%;border-radius:7px;transition:width .12s linear}
.mil-meter-label{position:absolute;inset:0;display:grid;place-items:center;font-size:10px;font-weight:800;letter-spacing:.3px}
.mil-tc{position:absolute;top:10px;left:50%;transform:translateX(-50%);padding:6px 14px;text-align:center;min-width:150px}
.mil-clock{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.mil-clock.low{color:#ff8a8a}
.mil-sub{font-size:11px;opacity:.8;margin-top:2px}
.mil-tr{position:absolute;top:10px;right:10px;display:grid;gap:4px;justify-items:end;max-width:45%}
.mil-feed{display:flex;align-items:center;gap:6px;padding:3px 8px;font-weight:700;font-size:12px;animation:milIn .25s ease-out}
.mil-feed.me{border-color:#ffd25a88;background:linear-gradient(180deg,#3a2f12cc,#1c170bcc)}
.mil-bc{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:stretch}
.mil-slot{padding:6px 10px 6px 8px;display:flex;align-items:center;gap:8px;min-width:150px;opacity:.6;transition:opacity .15s,transform .15s}
.mil-slot.on{opacity:1;transform:translateY(-3px);border-color:#ffd25a;box-shadow:0 0 0 1px #ffd25a55,0 6px 18px #0008}
.mil-key{font-size:10px;font-weight:800;background:#ffffff22;border-radius:4px;padding:1px 5px;align-self:flex-start}
.mil-ammo{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1}
.mil-ammo small{font-size:11px;opacity:.7}
.mil-ammo.low{color:#ff8a8a}
.mil-wname{font-size:10px;opacity:.8;text-transform:uppercase;letter-spacing:.6px}
.mil-reload{height:3px;background:#ffd25a;border-radius:2px;margin-top:3px}
.mil-bl{position:absolute;bottom:10px;left:10px;padding:6px 10px;display:flex;gap:4px;align-items:center}
.mil-nade{width:14px;height:14px;border-radius:50%;background:#3a5a40;border:2px solid #0a0a0a;box-shadow:inset -2px -2px 0 #0004}
.mil-nade.off{opacity:.2}
.mil-br{position:absolute;bottom:10px;right:10px;display:flex;gap:6px;pointer-events:auto}
.mil-icon-btn{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;cursor:pointer;color:#fff;font-size:15px}
.mil-icon-btn:hover{border-color:#ffd25a}
.mil-menu{position:absolute;bottom:52px;right:10px;padding:10px 12px;display:grid;gap:8px;pointer-events:auto;min-width:180px}
.mil-menu label{display:flex;justify-content:space-between;gap:10px;align-items:center}
.mil-seg{display:flex;border-radius:8px;overflow:hidden;border:1px solid #ffffff33}
.mil-seg button{background:transparent;color:#fff;border:0;padding:3px 8px;font-size:12px;cursor:pointer}
.mil-seg button.on{background:#ffd25a;color:#111;font-weight:800}
.mil-center{position:absolute;inset:0;display:grid;place-items:center}
.mil-card{padding:18px 26px;text-align:center;display:grid;gap:6px;justify-items:center;animation:milPop .25s ease-out}
.mil-big{font-size:26px;font-weight:900;letter-spacing:.5px}
.mil-toast{position:absolute;top:22%;left:50%;transform:translateX(-50%);padding:8px 16px;display:flex;align-items:center;gap:10px;font-weight:800;font-size:15px;animation:milPop .2s ease-out}
.mil-board{padding:14px 18px;min-width:min(440px,90%);pointer-events:auto}
.mil-board table{width:100%;border-collapse:collapse;font-size:14px}
.mil-board th{font-size:11px;text-transform:uppercase;opacity:.7;text-align:left;padding:4px 6px}
.mil-board td{padding:6px;border-top:1px solid #ffffff14}
.mil-board tr.me td{background:#ffd25a1a}
.mil-num{text-align:right;font-variant-numeric:tabular-nums}
.mil-touch{position:absolute;right:12px;bottom:60px;display:grid;gap:10px;pointer-events:auto}
.mil-touch button{width:56px;height:56px;border-radius:50%;font-size:12px;font-weight:800;color:#fff;background:#0009;border:2px solid #ffffff44}
.mil-top{display:flex;justify-content:space-between;align-items:center;width:100%;gap:10px;flex-wrap:wrap}
.mil-top h1{margin:0;font-size:22px}
.mil-kill{position:absolute;top:30%;left:50%;transform:translateX(-50%);text-align:center;animation:milKill 1.6s ease-out forwards;pointer-events:none}
.mil-kill-title{font-size:30px;font-weight:900;letter-spacing:3px;color:#ff4d4d;text-shadow:0 0 12px #ff000088,0 2px 0 #000,0 0 2px #000}
.mil-kill-name{font-size:16px;font-weight:800;opacity:.9}
@keyframes milKill{0%{opacity:0;transform:translate(-50%,0) scale(1.6)}12%{opacity:1;transform:translate(-50%,0) scale(1)}75%{opacity:1}100%{opacity:0;transform:translate(-50%,-12px) scale(1)}}
@keyframes milIn{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:none}}
@keyframes milPop{from{opacity:0;transform:translate(-50%,0) scale(.9)}to{opacity:1}}
.mil-card{animation-name:milCard}
@keyframes milCard{from{opacity:0;transform:scale(.92)}to{opacity:1;transform:none}}
`;

/** The in-game screen. It renders the host's snapshots and sends inputs back. It never changes the state itself. */
export default function Militia() {
  const state = useApp((s) => s.gameState as MilState | null);
  const players = useApp((s) => s.players);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snap = useRef<{ s: MilState | null; at: number }>({ s: null, at: 0 });
  const names = useRef<Record<string, string>>({});
  names.current = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const [gfx, setGfx] = useState<Quality>(loadQuality);
  const quality = useRef(gfx);
  quality.current = gfx;
  const [sound, setSound] = useState(() => localStorage.getItem("batas-militar:sound") !== "off");
  const [goreSetting, setGoreSetting] = useState(() => localStorage.getItem("batas-militar:gore") !== "off");
  useEffect(() => setGore(goreSetting), [goreSetting]);
  const playing = state?.ph === 1;
  const mapIdx = state?.m ?? 0;
  const [showBoard, setShowBoard] = useState(false);
  const [killMsg, setKillMsg] = useState<{ name: string; key: number } | null>(null);
  useEffect(() => {
    if (!killMsg) return;
    const id = setTimeout(() => setKillMsg(null), 1600);
    return () => clearTimeout(id);
  }, [killMsg]);
  const [menu, setMenu] = useState(false);
  const [toast, setToast] = useState<{ w: number; text: string; key: number } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const touch = useRef(typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches).current;

  // Ambient sound follows the arena. Browsers only allow audio after a click or key press.
  useEffect(() => {
    if (!playing || !sound) { stopAmbience(); return; }
    const start = () => playAmbience(mapAt(mapIdx).audio, 1);
    start();
    window.addEventListener("pointerdown", start, { once: true });
    window.addEventListener("keydown", start, { once: true });
    return () => {
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
    };
  }, [playing, sound, mapIdx]);
  useEffect(() => stopAmbience, []);
  useEffect(() => sfx.setSfxMuted(!sound), [sound]);

  useEffect(() => {
    snap.current = { s: state, at: performance.now() };
  }, [state]);

  // "Picked up" / "Out of ammo" toasts, from changes to your pickup slot.
  const mySw = state?.p[selfId]?.sw ?? -1, myDead = !!state?.p[selfId]?.dead;
  const prevSw = useRef(-1);
  useEffect(() => {
    const was = prevSw.current;
    prevSw.current = mySw;
    if (mySw >= 0 && mySw !== was) setToast({ w: mySw, text: `Picked up ${weapon(mySw).name}`, key: Date.now() });
    else if (mySw < 0 && was >= 0 && !myDead) setToast({ w: was, text: `${weapon(was).name} out of ammo`, key: Date.now() });
  }, [mySw, myDead]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    const cv = canvasRef.current,
      g = cv?.getContext("2d");
    if (!cv || !g) return;
    const keys = new Set<string>();
    const mouse = { x: 0, y: 0, down: false, seen: false };
    const sticks: { move: Stick | null; aim: Stick | null } = {
      move: null,
      aim: null,
    };
    let aim = 0,
      lastKey = "",
      lastAt = 0,
      raf = 0,
      meScreen = { x: 0, y: 0 };

    const typing = (e: Event) =>
      !!(e.target as HTMLElement | null)?.closest?.(
        "input,textarea,[contenteditable]",
      );
    const onDown = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const k = e.key.toLowerCase();
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright", "tab"].includes(k))
        e.preventDefault();
      if (k === "tab") setShowBoard(true);
      if (!e.repeat) {
        if (k === "g") send({ t: "NADE" });
        if (k === "shift") send({ t: "DASH" });
        if (k === "1") send({ t: "SLOT", s: 0 });
        if (k === "2") send({ t: "SLOT", s: 1 });
        if (k === "q") send({ t: "SWAP" });
        if (k === "r") send({ t: "RELOAD" });
      }
      keys.add(k);
    };
    const onUp = (e: KeyboardEvent) => {
      keys.delete(e.key.toLowerCase());
      if (e.key === "Tab") setShowBoard(false);
    };
    let wheelAt = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = performance.now();
      if (now - wheelAt > 150) { send({ t: "SWAP" }); wheelAt = now; }
    };
    const onBlur = () => {
      keys.clear();
      mouse.down = false;
      sticks.move = sticks.aim = null;
    };
    const local = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onPDown = (e: PointerEvent) => {
      const p = local(e);
      cv.setPointerCapture(e.pointerId);
      if (e.pointerType === "touch") {
        const s = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
        if (p.x < cv.clientWidth / 2) sticks.move = s;
        else sticks.aim = s;
        return;
      }
      mouse.x = p.x;
      mouse.y = p.y;
      mouse.seen = true;
      if (e.button === 2) send({ t: "NADE" });
      else if (e.button === 0) mouse.down = true;
    };
    const onPMove = (e: PointerEvent) => {
      const p = local(e);
      for (const s of [sticks.move, sticks.aim])
        if (s?.id === e.pointerId) {
          s.x = p.x;
          s.y = p.y;
        }
      if (e.pointerType !== "touch") {
        mouse.x = p.x;
        mouse.y = p.y;
        mouse.seen = true;
      }
    };
    const onPUp = (e: PointerEvent) => {
      if (sticks.move?.id === e.pointerId) sticks.move = null;
      if (sticks.aim?.id === e.pointerId) sticks.aim = null;
      if (e.pointerType !== "touch" && e.button === 0) mouse.down = false;
    };
    const noMenu = (e: Event) => e.preventDefault();

    let env: EnvRenderer | null = null,
      envKey = "",
      lastFrame = performance.now();
    const camPos = { x: NaN, y: NaN };
    let lastHp = MAX_HP, hurt = 0;
    let heard: MilState | null = null;
    let shake = 0, bloom = 0;
    const KICK: Record<number, number> = { 0: 2, 1: 5, 2: 1, 3: 8, 4: 0, 5: 6, 6: 1.6 };
    const BLOOM: Record<number, number> = { 0: 0.35, 1: 0.8, 2: 0.18, 3: 1, 4: 0.03, 5: 0.9, 6: 0.25 };

    /** Plays the sounds for whatever happened in a new snapshot (each snapshot is one host tick). */
    const listen = (s: MilState, prev: MilState | null) => {
      const me = s.p[selfId];
      const lx = me && !me.dead ? me.x : camPos.x, ly = me && !me.dead ? me.y : camPos.y;
      const at = (x: number, y: number) => (Number.isFinite(lx) ? { dx: x - lx, dist: Math.hypot(x - lx, y - ly) } : { dx: 0, dist: 600 });
      let shots = 0;
      for (const [id, p] of Object.entries(s.p)) {
        if (p.dead || p.w !== LASER) sfx.laserHum(id, false);
        if (p.dead) continue;
        if (p.w === LASER) sfx.laserHum(id, p.fl > 0, at(p.x, p.y));
        else if (p.fl === 3 && shots++ < 6) sfx.shot(p.w, at(p.x, p.y));
        const q = prev?.p[id];
        if (q && !q.dead && p.n < q.n) sfx.throwNade(at(p.x, p.y));
        if (p.ds === DASH_TICKS - 1) sfx.dash(at(p.x, p.y));
      }
      const pm0 = prev?.p[selfId];
      const gotGun = !!me && !!pm0 && !me.dead && me.sw >= 0 && (me.sw !== pm0.sw || me.sa > pm0.sa);
      if (gotGun) sfx.swap();
      for (const f of s.fx) {
        if (f.k === 0 && f.t === FX_TTL[0]! - 1) {
          const where = at(f.x, f.y);
          sfx.explosion(where);
          shake = Math.max(shake, 20 * Math.max(0, 1 - where.dist / 900));
        }
        else if (f.k === 4 && f.t === FX_TTL[4]! - 1 && !(gotGun && at(f.x, f.y).dist < 80)) sfx.pickup(at(f.x, f.y));
        else if (f.k === 3 && f.t === FX_TTL[3]! - 1 && goreOn()) sfx.gore(at(f.x, f.y));
      }
      const pm = prev?.p[selfId];
      if (me && !me.dead && me.fl === 3) { shake = Math.max(shake, KICK[me.w] ?? 1); bloom = Math.min(1.6, bloom + (BLOOM[me.w] ?? 0.2)); }
      if (me && pm && me.k > pm.k) {
        const f = [...s.feed].reverse().find((e) => e.k === selfId && e.v !== selfId);
        sfx.killConfirm();
        setKillMsg({ name: f ? names.current[f.v] ?? nameOf(f.v) : "", key: performance.now() });
      }
      if (!me || !pm || me.dead) return;
      if (me.hs === 6) sfx.headshot();
      else if (me.ht === 6) sfx.hitConfirm();
      if (me.hh === 6) sfx.helmetHit();
      else if (!pm.dead && me.hp < pm.hp) sfx.hurt();
      if (me.rl > pm.rl) sfx.reload();
      if (me.sl !== pm.sl && me.sw === pm.sw && me.sw >= 0 && !gotGun) sfx.swap();
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const { s, at } = snap.current;
      const now = performance.now(),
        frameMs = now - lastFrame;
      lastFrame = now;
      const playing = s?.ph === 1;
      if (playing && s !== heard) { listen(s, heard?.ph === 1 ? heard : null); heard = s; }

      // Input: send on change (max ~30/s) plus a heartbeat so the host knows we're here.
      if (playing && !s.winner) {
        let l = keys.has("a") || keys.has("arrowleft"),
          r = keys.has("d") || keys.has("arrowright");
        let j = keys.has("w") || keys.has(" ") || keys.has("arrowup"),
          f = mouse.down || keys.has("f");
        const m = sticks.move;
        if (m) {
          const dx = m.x - m.ox,
            dy = m.y - m.oy;
          l ||= dx < -15;
          r ||= dx > 15;
          j ||= dy < -20;
        }
        const t = sticks.aim;
        if (t) {
          const dx = t.x - t.ox,
            dy = t.y - t.oy,
            len = Math.hypot(dx, dy);
          if (len > 10) aim = Math.atan2(dy, dx);
          f ||= len > 35;
        } else if (mouse.seen)
          aim = Math.atan2(mouse.y - meScreen.y, mouse.x - meScreen.x);
        const msg: MilAction = {
          t: "IN",
          l,
          r,
          j,
          f,
          a: Math.round(aim * 100) / 100,
        };
        const key = JSON.stringify(msg);
        if ((key !== lastKey && now - lastAt > 33) || now - lastAt > 250) {
          send(msg);
          lastKey = key;
          lastAt = now;
        }
      }

      // Load the arena's environment when the map or quality changes; free the old one.
      if (!playing) {
        sfx.stopHums();
        if (env) { env.dispose(); env = null; envKey = ""; }
        return;
      }
      const map = mapAt(s.m),
        key = `${map.id}:${quality.current}`;
      if (key !== envKey) {
        env?.dispose();
        env = new EnvRenderer(map, quality.current);
        envKey = key;
        camPos.x = NaN;
      }
      if (!env) return;

      // Rendering
      const dpr = window.devicePixelRatio || 1,
        w = cv.clientWidth,
        h = cv.clientHeight;
      if (
        cv.width !== Math.round(w * dpr) ||
        cv.height !== Math.round(h * dpr)
      ) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      const dt = Math.min(now - at, 100) / TICK_MS;
      const me = s.p[selfId];
      const zoom = Math.min(w / VIEW_W, h / VIEW_H);
      const focus =
        me && !me.dead
          ? { x: me.x + me.vx * dt, y: me.y + me.vy * dt }
          : { x: map.w / 2, y: map.h / 2 };
      // Smooth follow with a little look-ahead toward the aim; snap after respawns or teleports.
      const look = me && !me.dead ? 50 : 0;
      const tx = focus.x + Math.cos(aim) * look,
        ty = focus.y + Math.sin(aim) * look * 0.6;
      if (!Number.isFinite(camPos.x) || Math.hypot(tx - camPos.x, ty - camPos.y) > 500) {
        camPos.x = tx;
        camPos.y = ty;
      } else {
        const k = 1 - Math.exp(-Math.min(frameMs, 100) / 70);
        camPos.x += (tx - camPos.x) * k;
        camPos.y += (ty - camPos.y) * k;
      }
      const b = map.camera;
      const cam = (c: number, view: number, lo: number, hi: number) =>
        view >= hi - lo ? (lo + hi) / 2 : Math.min(hi - view / 2, Math.max(lo + view / 2, c));
      const cx = cam(camPos.x, w / zoom, b.x0, b.x1),
        cy = cam(camPos.y, h / zoom, b.y0, b.y1);
      meScreen = {
        x: (focus.x - cx) * zoom + w / 2,
        y: (focus.y + GUN_Y - cy) * zoom + h / 2,
      };

      // Screen shake from nearby explosions, decaying quickly.
      const sx = shake ? (Math.random() * 2 - 1) * shake / zoom : 0, sy = shake ? (Math.random() * 2 - 1) * shake / zoom : 0;
      shake = shake > 0.3 ? shake * Math.exp(-frameMs / 110) : 0;
      const view = { cx: cx + sx, cy: cy + sy, z: zoom, w, h, dpr };
      bloom = bloom > 0.01 ? bloom * Math.exp(-frameMs / 140) : 0;
      const t = now / 1000;
      env.drawBack(g, view, t);
      worldTransform(g, view);
      drawEntities(g, s, map, dt, names.current, selfId, aim, t, nameOf);
      const actors = Object.values(s.p)
        .filter((p) => !p.dead)
        .map((p) => ({ x: p.x, y: p.y }));
      env.drawFront(g, view, t, frameMs, actors);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Damage flash and low-health pulse.
      if (me && !me.dead) {
        if (me.hp < lastHp) hurt = 1;
        lastHp = me.hp;
      } else lastHp = MAX_HP;
      const lowHp = me && !me.dead && me.hp <= 30 ? 0.18 + 0.12 * Math.sin(now / 180) : 0;
      if (hurt > 0 || lowHp > 0) {
        const a = Math.max(hurt * 0.5, lowHp);
        const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.7);
        vg.addColorStop(0, "rgba(200,0,0,0)"); vg.addColorStop(1, `rgba(200,0,0,${a})`);
        g.fillStyle = vg; g.fillRect(0, 0, w, h);
        hurt = Math.max(0, hurt - frameMs / 450);
      }

      if (mouse.seen && !sticks.aim && me && !me.dead) {
        const mx = mouse.x, my = mouse.y, wi = me.w;
        g.lineCap = "round";
        const cross = (r0: number, r1: number) => {
          g.moveTo(mx - r1, my); g.lineTo(mx - r0, my); g.moveTo(mx + r0, my); g.lineTo(mx + r1, my);
          g.moveTo(mx, my - r1); g.lineTo(mx, my - r0); g.moveTo(mx, my + r0); g.lineTo(mx, my + r1);
        };
        g.save(); g.translate(mx, my); g.scale(1 + bloom, 1 + bloom); g.translate(-mx, -my);
        g.beginPath();
        if (wi === 3) { g.arc(mx, my, 18, 0, Math.PI * 2); cross(4, 26); }
        else if (wi === 1) { g.arc(mx, my, 16, 0, Math.PI * 2); g.moveTo(mx + 1.5, my); g.arc(mx, my, 1.5, 0, Math.PI * 2); }
        else if (wi === 4) { g.moveTo(mx, my - 10); g.lineTo(mx + 10, my); g.lineTo(mx, my + 10); g.lineTo(mx - 10, my); g.closePath(); }
        else if (wi === 5) {
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) { g.moveTo(mx + sx * 14, my + sy * 7); g.lineTo(mx + sx * 14, my + sy * 14); g.lineTo(mx + sx * 7, my + sy * 14); }
        } else { g.arc(mx, my, 8, 0, Math.PI * 2); cross(4, 13); }
        g.restore();
        g.strokeStyle = "#000a"; g.lineWidth = 3.5; g.stroke();
        g.strokeStyle = wi === 4 ? "#8ff3ff" : "#fff"; g.lineWidth = 1.6; g.stroke();
        if (me.ht > 0) { // hit marker
          g.beginPath();
          for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) { g.moveTo(mx + sx * 6, my + sy * 6); g.lineTo(mx + sx * 13, my + sy * 13); }
          g.strokeStyle = "#000a"; g.lineWidth = 4; g.stroke();
          g.strokeStyle = "#ff4d4d"; g.lineWidth = 2.2; g.stroke();
        }
        if (me.rl > 0 && wi === PISTOL) { // reload ring
          g.beginPath(); g.arc(mx, my, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - me.rl / weapon(PISTOL).reload));
          g.strokeStyle = "#ffd25a"; g.lineWidth = 3; g.stroke();
        }
      }
      for (const st of [sticks.move, sticks.aim]) {
        if (!st) continue;
        const dx = st.x - st.ox,
          dy = st.y - st.oy,
          len = Math.hypot(dx, dy),
          k = len > 50 ? 50 / len : 1;
        g.fillStyle = "#ffffff22";
        g.beginPath();
        g.arc(st.ox, st.oy, 50, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#ffffff66";
        g.beginPath();
        g.arc(st.ox + dx * k, st.oy + dy * k, 22, 0, Math.PI * 2);
        g.fill();
      }
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    cv.addEventListener("pointerdown", onPDown);
    cv.addEventListener("pointermove", onPMove);
    cv.addEventListener("pointerup", onPUp);
    cv.addEventListener("pointercancel", onPUp);
    cv.addEventListener("contextmenu", noMenu);
    cv.addEventListener("wheel", onWheel, { passive: false });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      env?.dispose();
      sfx.stopHums();
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      cv.removeEventListener("pointerdown", onPDown);
      cv.removeEventListener("pointermove", onPMove);
      cv.removeEventListener("pointerup", onPUp);
      cv.removeEventListener("pointercancel", onPUp);
      cv.removeEventListener("contextmenu", noMenu);
      cv.removeEventListener("wheel", onWheel);
    };
  }, []);

  const me = state?.p[selfId];
  const name = (id: string) => names.current[id] ?? nameOf(id);
  const board = state
    ? Object.entries(state.p).sort(([, a], [, b]) => b.k - a.k || a.d - b.d)
    : [];
  const clock = state
    ? `${Math.floor(state.time / 1800)}:${String(Math.floor(state.time / 30) % 60).padStart(2, "0")}`
    : "";
  const exit = () => {
    leave();
    history.replaceState(null, "", "/");
  };
  const tap = (a: MilAction) => ({
    onMouseDown: (e: MouseEvent) => e.preventDefault(), // keep focus off the button so Space doesn't press it
    onClick: () => send(a),
  });
  const leader = board[0];
  const killer = state && me?.dead ? [...state.feed].reverse().find((f) => f.v === selfId) : undefined;
  const fullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };
  const host = isHost();
  const scoreTable = (
    <table>
      <thead>
        <tr><th>#</th><th>Player</th><th className="mil-num">Kills</th><th className="mil-num">Deaths</th><th className="mil-num">K/D</th></tr>
      </thead>
      <tbody>
        {board.map(([id, p], i) => (
          <tr key={id} className={id === selfId ? "me" : ""}>
            <td>{i === 0 ? "🏆" : i + 1}</td>
            <td><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span className="mil-dot" style={{ background: color(id) }} />{name(id)}{id === selfId && " (you)"}</span></td>
            <td className="mil-num">{p.k}</td>
            <td className="mil-num">{p.d}</td>
            <td className="mil-num">{(p.k / Math.max(1, p.d)).toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <section className="lobby" style={{ maxWidth: 1200, width: "100%" }}>
      <style>{CSS}</style>
      <div className="mil-top">
        <h1>{playing ? mapAt(state.m).name : "Batas Militar"}</h1>
        <button onClick={exit} className="btn-ghost" style={{ padding: "4px 14px" }}>Leave</button>
      </div>

      {state && !playing && (
        <MapSelect
          state={state}
          name={name}
          host={host}
          selfId={selfId}
          send={send}
          playerIds={players.map((p) => p.id)}
        />
      )}

      <div ref={stageRef} className="mil-stage" style={{ display: playing ? "block" : "none" }}>
        <canvas ref={canvasRef} className="mil-view" />
        <div className="mil-hud">
          {me && !me.dead && (
            <div className="mil-tl mil-panel">
              <div className="mil-who"><span className="mil-dot" style={{ background: color(selfId) }} />{name(selfId)}<span style={{ marginLeft: "auto", fontSize: 12, opacity: 0.85 }}>{me.k} kills</span></div>
              <Meter icon="❤" v={me.hp} max={MAX_HP} label={`${me.hp}`} fill={me.hp > 60 ? "linear-gradient(90deg,#2f9e44,#8ce99a)" : me.hp > 30 ? "linear-gradient(90deg,#e8590c,#ffc078)" : "linear-gradient(90deg,#c92a2a,#ff8787)"} />
              <Meter icon="🔥" v={me.fuel} max={MAX_FUEL} label={me.j ? "BOOST" : "JETPACK"} fill="linear-gradient(90deg,#f08c00,#ffd43b)" />
              <Meter icon="💨" v={DASH_COOLDOWN - me.dc} max={DASH_COOLDOWN} label={me.dc ? "DASH" : "DASH READY · SHIFT"} fill={me.dc ? "linear-gradient(90deg,#364fc7,#748ffc)" : "linear-gradient(90deg,#1c7ed6,#74c0fc)"} />
            </div>
          )}

          {state && (
            <div className="mil-tc mil-panel">
              <div className={`mil-clock${state.time < 30 * 30 ? " low" : ""}`}>{clock}</div>
              <div className="mil-sub">
                {leader ? <>Leader: <b style={{ color: color(leader[0]) }}>{name(leader[0])}</b> {leader[1].k}/{KILLS_TO_WIN}</> : `First to ${KILLS_TO_WIN}`}
              </div>
            </div>
          )}

          <div className="mil-tr">
            {state?.feed.map((f, i) => (
              <div key={`${i}-${f.k}-${f.v}`} className={`mil-feed mil-panel${f.k === selfId || f.v === selfId ? " me" : ""}`}>
                {f.k === f.v ? (
                  <><span style={{ color: color(f.v) }}>{name(f.v)}</span><GunIcon w={f.w} style={{ width: 44, height: 18 }} /><span style={{ opacity: 0.8 }}>self-destructed</span></>
                ) : (
                  <><span style={{ color: color(f.k) }}>{name(f.k)}</span><GunIcon w={f.w} style={{ width: 44, height: 18 }} /><span style={{ color: color(f.v) }}>{name(f.v)}</span></>
                )}
              </div>
            ))}
          </div>

          {me && !me.dead && (
            <>
              <div className="mil-bl mil-panel" title="Grenades (G / right-click)">
                {Array.from({ length: MAX_NADES }, (_, i) => <span key={i} className={`mil-nade${i < me.n ? "" : " off"}`} />)}
                <span style={{ marginLeft: 4, fontSize: 11, opacity: 0.8 }}>G</span>
              </div>
              <div className="mil-bc">
                <div className={`mil-slot mil-panel${me.sl === 0 ? " on" : ""}`}>
                  <span className="mil-key">1</span>
                  <GunIcon w={PISTOL} />
                  <div>
                    <div className={`mil-ammo${me.mag <= 3 ? " low" : ""}`}>{me.rl ? "…" : me.mag}<small>/{weapon(PISTOL).ammo}</small></div>
                    <div className="mil-wname">{me.rl ? "Reloading" : weapon(PISTOL).name}</div>
                    {me.rl > 0 && <div className="mil-reload" style={{ width: `${100 * (1 - me.rl / weapon(PISTOL).reload)}%` }} />}
                  </div>
                </div>
                <div className={`mil-slot mil-panel${me.sl === 1 && me.sw >= 0 ? " on" : ""}`}>
                  <span className="mil-key">2</span>
                  {me.sw >= 0 ? (
                    <>
                      <GunIcon w={me.sw} />
                      <div>
                        <div className={`mil-ammo${me.sa <= Math.ceil(weapon(me.sw).ammo / 5) ? " low" : ""}`}>{me.sa}<small>/{weapon(me.sw).ammo}</small></div>
                        <div className="mil-wname">{weapon(me.sw).name}</div>
                      </div>
                    </>
                  ) : (
                    <div style={{ fontSize: 11, opacity: 0.8, maxWidth: 110, lineHeight: 1.25 }}>Empty. Grab a weapon drop!</div>
                  )}
                </div>
              </div>
            </>
          )}

          {killMsg && playing && (
            <div key={killMsg.key} className="mil-kill">
              <div className="mil-kill-title">☠ ELIMINATED</div>
              {killMsg.name && <div className="mil-kill-name">{killMsg.name}</div>}
            </div>
          )}

          {toast && playing && (
            <div key={toast.key} className="mil-toast mil-panel">
              <GunIcon w={toast.w} />
              {toast.text}
            </div>
          )}

          {playing && !!me?.dead && !state?.winner && (
            <div className="mil-center">
              <div className="mil-card mil-panel">
                <div style={{ fontSize: 12, opacity: 0.8, textTransform: "uppercase", letterSpacing: 1 }}>You were eliminated</div>
                {killer && killer.k !== selfId ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 800 }}>
                    by <span style={{ color: color(killer.k) }}>{name(killer.k)}</span><GunIcon w={killer.w} /><span style={{ opacity: 0.8, fontSize: 13 }}>{weaponName(killer.w)}</span>
                  </div>
                ) : killer ? <div style={{ fontWeight: 800 }}>Watch your own blast radius!</div> : null}
                <div className="mil-big">Respawning in {Math.ceil(me.dead / 30)}</div>
              </div>
            </div>
          )}
          {playing && !me && !state?.winner && (
            <div className="mil-center"><div className="mil-card mil-panel"><div className="mil-big">Joining…</div></div></div>
          )}

          {playing && state?.winner && (
            <div className="mil-center" style={{ background: "#0007", pointerEvents: "auto" }}>
              <div className="mil-card mil-panel mil-board">
                <div style={{ fontSize: 12, opacity: 0.8, textTransform: "uppercase", letterSpacing: 1 }}>Match over</div>
                <div className="mil-big" style={{ color: color(state.winner) }}>🏆 {name(state.winner)} wins!</div>
                {scoreTable}
                {host ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center", marginTop: 6 }}>
                    <button onClick={() => send({ t: "REMATCH", same: true })} className="btn-primary">Replay {mapAt(state.m).name}</button>
                    <button onClick={() => send({ t: "REMATCH", same: false })} className="btn-ghost">Vote next map</button>
                    <button onClick={returnToLobby} className="btn-ghost">Lobby</button>
                  </div>
                ) : <div style={{ opacity: 0.8 }}>Waiting for the host to start a rematch…</div>}
              </div>
            </div>
          )}

          {playing && showBoard && !state?.winner && (
            <div className="mil-center"><div className="mil-card mil-panel mil-board">{scoreTable}</div></div>
          )}

          {playing && (
            <>
              <div className="mil-br">
                <button type="button" className="mil-icon-btn mil-panel" title="Scoreboard (Tab)" onMouseDown={(e) => e.preventDefault()} onClick={() => setShowBoard((v) => !v)}>📋</button>
                <button type="button" className="mil-icon-btn mil-panel" title="Settings" onMouseDown={(e) => e.preventDefault()} onClick={() => setMenu((v) => !v)}>⚙</button>
                <button type="button" className="mil-icon-btn mil-panel" title="Fullscreen" onMouseDown={(e) => e.preventDefault()} onClick={fullscreen}>⛶</button>
              </div>
              {menu && (
                <div className="mil-menu mil-panel">
                  <label>Graphics
                    <span className="mil-seg">
                      {QUALITIES.map((q) => (
                        <button key={q} type="button" className={q === gfx ? "on" : ""} onMouseDown={(e) => e.preventDefault()} onClick={() => { setGfx(q); saveQuality(q); }}>
                          {q[0]!.toUpperCase() + q.slice(1)}
                        </button>
                      ))}
                    </span>
                  </label>
                  <label>Sound
                    <span className="mil-seg">
                      {[true, false].map((on) => (
                        <button key={String(on)} type="button" className={sound === on ? "on" : ""} onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { localStorage.setItem("batas-militar:sound", on ? "on" : "off"); setSound(on); }}>
                          {on ? "On" : "Off"}
                        </button>
                      ))}
                    </span>
                  </label>
                  <label>Gore
                    <span className="mil-seg">
                      {[true, false].map((on) => (
                        <button key={String(on)} type="button" className={goreSetting === on ? "on" : ""} onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { localStorage.setItem("batas-militar:gore", on ? "on" : "off"); setGoreSetting(on); }}>
                          {on ? "On" : "Off"}
                        </button>
                      ))}
                    </span>
                  </label>
                  <div style={{ fontSize: 11, opacity: 0.7, lineHeight: 1.4 }}>WASD move/fly · Shift dash · Click fire · G grenade<br />1/2/Q/wheel switch · R reload · Tab scores</div>
                </div>
              )}
              {touch && me && !me.dead && (
                <div className="mil-touch">
                  <button type="button" {...tap({ t: "DASH" })}>DASH</button>
                  <button type="button" {...tap({ t: "NADE" })}>NADE</button>
                  <button type="button" {...tap({ t: "SWAP" })}>SWAP</button>
                  <button type="button" {...tap({ t: "RELOAD" })}>RLD</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {playing && !touch && (
        <div style={{ fontSize: 12, opacity: 0.6 }}>WASD / arrows: move &amp; fly · Shift: dash · Mouse: aim &amp; fire · G: grenade · 1/2, Q or wheel: switch weapon · R: reload · Tab: scoreboard</div>
      )}
      <ChatBox variant="lobby" />
    </section>
  );
}
