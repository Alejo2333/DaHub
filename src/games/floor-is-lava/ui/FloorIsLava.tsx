import { useEffect, useRef, useState, type CSSProperties } from "react";
import * as THREE from "three";
import {
  isHost,
  leave,
  nameOf,
  returnToLobby,
  selfId,
  sendAction,
} from "../../../multiplayer/party";
import { useApp } from "../../../stores/app";
import type { FlState } from "..";
import {
  COUNTDOWN,
  ENDED,
  LAVA0,
  MAX_TOP,
  START_TOP,
  boxPos,
  genMap,
  lavaAt,
  spawnPos,
  type Box,
} from "../map";

const HW = 0.4,
  HH = 1.8,
  SPEED = 8,
  SHOVE_CD = 10,
  SHOVE_RANGE = 2.6;
const COLS = [
  0xff5d8f, 0x4dabf7, 0x51cf66, 0xffd43b, 0xb197fc, 0xff922b, 0x22b8cf,
  0xf783ac, 0xe64980, 0x94d82d, 0x7950f2, 0xfd7e14,
];
const hash = (s: string) => {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h);
};
const colOf = (id: string) => COLS[hash(id) % COLS.length];
const hex = (c: number) => "#" + c.toString(16).padStart(6, "0");
const fmt = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const lerpAng = (a: number, b: number, k: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};
const easeBack = (t: number) => {
  const c = 2.70158;
  return 1 + c * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
};
const SKY = new THREE.Color(0x8fd3ff),
  HOT = new THREE.Color(0xff8a4a);

/** Pooled additive particles: dust, sparks, lava embers. gv < 0 makes them rise. */
function mkParticles(scene: THREE.Scene, n = 700) {
  const pos = new Float32Array(n * 3).fill(-9999),
    col = new Float32Array(n * 3),
    base = new Float32Array(n * 3),
    vel = new Float32Array(n * 3);
  const life = new Float32Array(n),
    max = new Float32Array(n),
    grav = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const cv = document.createElement("canvas");
  cv.width = cv.height = 32;
  const g = cv.getContext("2d")!,
    gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, "#fff");
  gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(cv);
  const mat = new THREE.PointsMaterial({
    size: 0.5,
    map: tex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  scene.add(pts);
  let head = 0;
  const emit = (
    x: number,
    y: number,
    z: number,
    count: number,
    color: number,
    speed: number,
    up: number,
    gv = 18,
    ttl = 0.7,
  ) => {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = head;
      head = (head + 1) % n;
      const a = Math.random() * 6.283,
        s = speed * (0.3 + Math.random() * 0.7);
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
      vel[i * 3] = Math.cos(a) * s;
      vel[i * 3 + 1] = up * (0.4 + Math.random() * 0.9);
      vel[i * 3 + 2] = Math.sin(a) * s;
      base[i * 3] = c.r;
      base[i * 3 + 1] = c.g;
      base[i * 3 + 2] = c.b;
      life[i] = max[i] = ttl * (0.6 + Math.random() * 0.6);
      grav[i] = gv;
    }
  };
  const update = (dt: number) => {
    for (let i = 0; i < n; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        pos[i * 3 + 1] = -9999;
        col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0;
        continue;
      }
      vel[i * 3 + 1] -= grav[i] * dt;
      pos[i * 3] += vel[i * 3] * dt;
      pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      const f = life[i] / max[i];
      col[i * 3] = base[i * 3] * f;
      col[i * 3 + 1] = base[i * 3 + 1] * f;
      col[i * 3 + 2] = base[i * 3 + 2] * f;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return {
    emit,
    update,
    dispose: () => {
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}

type Char = ReturnType<typeof mkChar>;
function mkChar(color: number, name: string) {
  const grp = new THREE.Group();
  grp.rotation.order = "YXZ";
  const part = (
    w: number,
    h: number,
    d: number,
    c: number,
    y: number,
    x = 0,
    top = false,
  ) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (top) g.translate(0, -h / 2, 0);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: c }));
    m.position.set(x, y, 0);
    grp.add(m);
    return m;
  };
  const legL = part(0.35, 0.65, 0.35, 0x3b5bdb, 0.65, -0.2, true),
    legR = part(0.35, 0.65, 0.35, 0x3b5bdb, 0.65, 0.2, true);
  part(0.8, 0.7, 0.4, color, 1);
  const armL = part(0.25, 0.7, 0.25, 0xffd8a8, 1.35, -0.525, true),
    armR = part(0.25, 0.7, 0.25, 0xffd8a8, 1.35, 0.525, true);
  part(0.5, 0.45, 0.45, 0xffd8a8, 1.575);
  part(0.56, 0.16, 0.52, color, 1.84);
  for (const x of [-0.1, 0.1]) {
    const e = part(0.08, 0.08, 0.02, 0x222222, 1.62, x);
    e.position.z = 0.23;
  }
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 64;
  const g = cv.getContext("2d")!;
  g.font = "bold 34px Arial";
  g.textAlign = "center";
  g.lineWidth = 6;
  g.strokeStyle = "#000";
  g.strokeText(name.slice(0, 14), 128, 44);
  g.fillStyle = "#fff";
  g.fillText(name.slice(0, 14), 128, 44);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(cv),
      transparent: true,
    }),
  );
  sp.scale.set(2.4, 0.6, 1);
  sp.position.y = 2.5;
  grp.add(sp);
  // blob shadow (lives in the scene, not the group, so it stays flat on the platform)
  const sh = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 16),
    new THREE.MeshBasicMaterial({
      color: 0,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  sh.rotation.x = -Math.PI / 2;
  return {
    grp,
    sh,
    legL,
    legR,
    armL,
    armR,
    ph: 0,
    pos: new THREE.Vector3(),
    dead: -1,
    pn: -1,
    stag: 0,
    sq: 1,
  };
}
const animate = (
  c: Char,
  dt: number,
  spd: number,
  air: boolean,
  shove: boolean,
) => {
  c.ph += dt * Math.min(spd, 10) * 1.5;
  const a = Math.min(1, spd / 6) * 0.9,
    s = Math.sin(c.ph) * a,
    idle =
      Math.sin(performance.now() / 450 + c.ph) *
      0.07 *
      (1 - Math.min(1, spd / 2));
  c.legL.rotation.x = air ? 0.5 : s;
  c.legR.rotation.x = air ? -0.3 : -s;
  c.armL.rotation.x = air ? -2.6 : -s + idle;
  c.armR.rotation.x = air ? -2.6 : s - idle;
  if (c.stag > 0) c.armL.rotation.x = c.armR.rotation.x = -2.3;
  if (shove) c.armL.rotation.x = c.armR.rotation.x = -1.6;
  const lean = shove
    ? 0.5
    : c.stag > 0
      ? -0.55
      : Math.min(spd / SPEED, 1) * 0.18;
  c.grp.rotation.x += (lean - c.grp.rotation.x) * (1 - Math.exp(-18 * dt));
};
/** Spring-based squash & stretch (origin is at the feet). */
const squash = (c: Char, dt: number, target = 1) => {
  c.sq += (target - c.sq) * (1 - Math.exp(-14 * dt));
  const w = 1 / Math.sqrt(c.sq);
  c.grp.scale.set(w, c.sq, w);
};

const css = `
@keyframes flPop{0%{transform:scale(2.6);opacity:0}22%{transform:scale(1);opacity:1}100%{transform:scale(.8);opacity:0}}
@keyframes flIn{from{transform:translateY(16px) scale(.95);opacity:0}to{transform:none;opacity:1}}
@keyframes flGo{0%{transform:scale(.4);opacity:0}25%{transform:scale(1.15);opacity:1}100%{transform:scale(1.7);opacity:0}}
@keyframes flFeed{from{transform:translateX(34px);opacity:0}to{transform:none;opacity:1}}
@keyframes flPulse{50%{opacity:.45}}
@keyframes flBob{50%{transform:translateY(-8px)}}
@keyframes flShine{to{background-position:200% 0}}`;
const FONT = "Arial Black, Arial, sans-serif";
const overlay: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 14,
  color: "#fff",
  textAlign: "center",
  fontFamily: FONT,
  textShadow: "0 3px 0 rgba(0,0,0,.45)",
  pointerEvents: "none",
};
const panel: CSSProperties = {
  background: "linear-gradient(160deg,rgba(40,24,64,.92),rgba(20,16,40,.92))",
  borderRadius: 22,
  padding: "24px 38px",
  pointerEvents: "auto",
  border: "2px solid rgba(255,169,77,.85)",
  boxShadow: "0 14px 44px rgba(0,0,0,.55),0 0 46px rgba(255,110,30,.28)",
  backdropFilter: "blur(6px)",
  animation: "flIn .35s ease-out",
  maxWidth: "min(92vw,520px)",
};
const btn: CSSProperties = {
  pointerEvents: "auto",
  cursor: "pointer",
  border: 0,
  borderRadius: 14,
  padding: "13px 30px",
  fontSize: 20,
  fontWeight: 900,
  fontFamily: FONT,
  color: "#fff",
  background: "linear-gradient(#ffa94d,#f76707)",
  boxShadow: "0 5px 0 #a63d00, 0 8px 18px rgba(0,0,0,.35)",
};
const ghost: CSSProperties = {
  ...btn,
  background: "rgba(255,255,255,.16)",
  boxShadow: "none",
  fontSize: 15,
  padding: "8px 18px",
  border: "1px solid rgba(255,255,255,.3)",
};
const title: CSSProperties = {
  fontSize: 50,
  lineHeight: 1.05,
  background: "linear-gradient(90deg,#ffe066,#ff922b,#ff4d4d,#ffe066)",
  backgroundSize: "200% 100%",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  textShadow: "none",
  animation: "flShine 3s linear infinite",
};
const glass: CSSProperties = {
  background: "rgba(15,12,32,.55)",
  borderRadius: 14,
  padding: "8px 14px",
  border: "1px solid rgba(255,255,255,.18)",
  backdropFilter: "blur(4px)",
};
const chip = (id: string): CSSProperties => ({
  display: "inline-block",
  margin: 3,
  padding: "4px 12px",
  borderRadius: 99,
  fontSize: 14,
  background: hex(colOf(id)),
  color: "#1a1a2e",
  textShadow: "none",
});

export default function FloorIsLava() {
  const state = useApp((s) => s.gameState as FlState | null);
  const players = useApp((s) => s.players);
  const [joined, setJoined] = useState(false);
  const [feed, setFeed] = useState<{ id: number; t: string; c: string }[]>([]);
  const mount = useRef<HTMLDivElement>(null);
  const cdRef = useRef<HTMLDivElement>(null),
    flashRef = useRef<HTMLDivElement>(null),
    vigRef = useRef<HTMLDivElement>(null);
  const joinedRef = useRef(false);
  joinedRef.current = joined;
  const feedRef = useRef<(t: string, c?: string) => void>(() => {});
  feedRef.current = (t, c = "#fff") => {
    const id = Math.random();
    setFeed((f) => [...f.slice(-4), { id, t, c }]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== id)), 4200);
  };
  const phase = state?.phase ?? "waiting";
  const me = state?.players[selfId];
  const alive = state
    ? Object.values(state.players).filter((p) => p.alive).length
    : 0;
  const total = state
    ? state.phase === "waiting"
      ? Object.keys(state.players).length
      : state.order.length
    : 0;
  const pms = state
    ? phase === "playing" || phase === "ended"
      ? phase === "ended"
        ? state.pt
        : state.t
      : 0
    : 0;
  const lava = lavaAt(pms);
  const rate = 0.4 + 0.008 * (pms / 1000);
  const exit = () => {
    leave();
    history.replaceState(null, "", "/");
  };
  const play = () => {
    setJoined(true);
    sendAction({ t: "JOIN" });
    mount.current?.querySelector("canvas")?.requestPointerLock?.();
  };
  void players;

  useEffect(() => {
    if (me && !joined) setJoined(true);
  }, [me, joined]); // host auto-registers lobby players
  useEffect(() => {
    if (phase === "ended") document.exitPointerLock?.();
  }, [phase]);

  useEffect(() => {
    const el = mount.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    el.appendChild(renderer.domElement);
    const dom = renderer.domElement;
    const scene = new THREE.Scene();
    scene.background = SKY.clone();
    const fog = new THREE.Fog(0x8fd3ff, 70, 300);
    scene.fog = fog;
    const cam = new THREE.PerspectiveCamera(65, 1, 0.1, 500);
    scene.add(new THREE.HemisphereLight(0xcfe9ff, 0xff7a1a, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(30, 60, 20);
    scene.add(sun);
    const fx = mkParticles(scene);

    // Shockwave rings (shoves) + aim ring under the current shove target
    const rgeo = new THREE.RingGeometry(0.4, 0.55, 32);
    const waves: { m: THREE.Mesh; t: number }[] = [];
    const wave = (x: number, y: number, z: number, color: number) => {
      const m = new THREE.Mesh(
        rgeo,
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, y + 0.15, z);
      scene.add(m);
      waves.push({ m, t: 0 });
    };
    const aimRing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 0.9, 32),
      new THREE.MeshBasicMaterial({
        color: 0xff4d4d,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    aimRing.rotation.x = -Math.PI / 2;
    aimRing.visible = false;
    scene.add(aimRing);

    // Lava: two scrolling textured layers (base + additive glow)
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const g = cv.getContext("2d")!;
    g.fillStyle = "#e8280a";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * 256,
        y = Math.random() * 256,
        r = 12 + Math.random() * 28,
        gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, i % 3 ? "#ffb52e" : "#ffe066");
      gr.addColorStop(1, "rgba(255,80,0,0)");
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(30, 30);
    const tex2 = tex.clone();
    tex2.needsUpdate = true;
    tex2.repeat.set(17, 17);
    const plane = new THREE.PlaneGeometry(700, 700);
    const lavaM = new THREE.Mesh(
      plane,
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    lavaM.rotation.x = -Math.PI / 2;
    scene.add(lavaM);
    const glow = new THREE.Mesh(
      plane,
      new THREE.MeshBasicMaterial({
        map: tex2,
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    scene.add(glow);

    // Map (platforms pop in bottom-to-top, get outlines, and glow as the lava nears)
    let seed = -1,
      boxes: Box[] = [],
      meshes: THREE.Mesh[] = [],
      builtAt = 0;
    const bgeo = new THREE.BoxGeometry(1, 1, 1),
      egeo = new THREE.EdgesGeometry(bgeo),
      emat = new THREE.LineBasicMaterial({
        color: 0x1b1b3a,
        transparent: true,
        opacity: 0.55,
      });
    const build = (s: number) => {
      meshes.forEach((m) => {
        scene.remove(m);
        (m.material as THREE.Material).dispose();
      });
      seed = s;
      boxes = genMap(s);
      builtAt = performance.now();
      meshes = boxes.map((b) => {
        const m = new THREE.Mesh(
          bgeo,
          new THREE.MeshLambertMaterial({ color: b.c }),
        );
        m.scale.setScalar(0.001);
        m.add(new THREE.LineSegments(egeo, emat));
        scene.add(m);
        return m;
      });
    };
    build(1);

    // Players
    const P = {
      x: 0,
      y: START_TOP,
      z: 0,
      vy: 0,
      ry: 0,
      on: -1,
      ox: 0,
      oz: 0,
      coy: 0,
      kx: 0,
      kz: 0,
    };
    let shoveCd = 0,
      shoveAnim = 0,
      lastPn = -1,
      shake = 0,
      flash = 0,
      stepT = 0;
    const me0 = mkChar(colOf(selfId), nameOf(selfId));
    scene.add(me0.grp, me0.sh);
    const chars = new Map<string, Char>(),
      wasAlive = new Map<string, boolean>();
    const randSpawn = () => {
      const a = Math.random() * 6.28,
        r = Math.random() * 5;
      Object.assign(P, {
        x: Math.cos(a) * r,
        y: START_TOP,
        z: Math.sin(a) * r,
        vy: 0,
        on: -1,
      });
    };
    randSpawn();

    // Input
    const keys = new Set<string>();
    let yaw = 0,
      pitch = 0.45,
      drag = false;
    /** Best shove target: closest rival in front of the camera (soft cone), within range. */
    const aim = () => {
      let best = "",
        bs = 1e9;
      const fx_ = -Math.sin(yaw),
        fz_ = -Math.cos(yaw);
      chars.forEach((c, id) => {
        if (c.dead >= 0 || !c.grp.visible) return;
        const dx = c.pos.x - P.x,
          dz = c.pos.z - P.z,
          d = Math.hypot(dx, dz);
        if (d > SHOVE_RANGE || Math.abs(c.pos.y - P.y) > 2.5) return;
        const dot = d > 0.01 ? (dx * fx_ + dz * fz_) / d : 1;
        if (dot < -0.2) return;
        const sc = d * (1.6 - dot);
        if (sc < bs) {
          bs = sc;
          best = id;
        }
      });
      return best;
    };
    const shove = () => {
      if (shoveCd > 0 || !joinedRef.current) return;
      const st = useApp.getState().gameState as FlState | null;
      if (!st || !st.players[selfId]?.alive || st.phase === "countdown") return;
      const best = aim(),
        tc = best ? chars.get(best) : undefined;
      shoveCd = SHOVE_CD;
      shoveAnim = 0.28;
      const ang = tc
        ? Math.atan2(tc.pos.x - P.x, tc.pos.z - P.z)
        : Math.atan2(-Math.sin(yaw), -Math.cos(yaw));
      P.ry = ang;
      P.kx += Math.sin(ang) * 5;
      P.kz += Math.cos(ang) * 5; // lunge: commit too hard and you go over the edge too
      me0.sq = 0.8;
      wave(P.x, P.y, P.z, 0xffffff);
      if (tc) {
        sendAction({ t: "PUSH", to: best });
        fx.emit(tc.pos.x, tc.pos.y + 1, tc.pos.z, 16, 0xffe066, 5, 4);
        shake = Math.max(shake, 0.3);
      }
    };
    const kd = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === "Space") e.preventDefault();
      if ((e.code === "KeyE" || e.code === "KeyF") && !e.repeat) shove();
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.code);
    const mm = (e: MouseEvent) => {
      if (document.pointerLockElement === dom || drag) {
        yaw -= e.movementX * 0.003;
        pitch = clamp(pitch + e.movementY * 0.003, -0.2, 1.3);
      }
    };
    const md = () => {
      drag = true;
      if (!joinedRef.current) return;
      if (document.pointerLockElement === dom) shove();
      else dom.requestPointerLock?.();
    };
    const mu = () => {
      drag = false;
    };
    addEventListener("keydown", kd);
    addEventListener("keyup", ku);
    addEventListener("mousemove", mm);
    dom.addEventListener("mousedown", md);
    addEventListener("mouseup", mu);
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    const hit = (axis: 0 | 1, pos: { x: number; z: number }[]) => {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i],
          q = pos[i],
          top = b.y + b.h / 2,
          bot = b.y - b.h / 2;
        if (P.y >= top - 0.001 || P.y + HH <= bot) continue;
        if (
          b.w / 2 + HW - Math.abs(P.x - q.x) <= 0 ||
          b.d / 2 + HW - Math.abs(P.z - q.z) <= 0
        )
          continue;
        if (top - P.y <= 0.55) {
          P.y = top;
          if (P.vy < 0) P.vy = 0;
          continue;
        }
        if (axis === 0)
          P.x = P.x > q.x ? q.x + b.w / 2 + HW : q.x - b.w / 2 - HW;
        else P.z = P.z > q.z ? q.z + b.d / 2 + HW : q.z - b.d / 2 - HW;
      }
    };
    const phys = (
      vx: number,
      vz: number,
      jump: boolean,
      dt: number,
      pos: { x: number; z: number }[],
    ) => {
      if (P.on >= 0 && boxes[P.on]?.mv) {
        P.x += pos[P.on].x - P.ox;
        P.z += pos[P.on].z - P.oz;
      }
      if (jump && P.coy > 0) {
        P.vy = 9.5;
        P.coy = 0;
        P.on = -1;
      }
      const n = Math.ceil(dt / 0.02),
        h = dt / n;
      for (let s = 0; s < n; s++) {
        P.x += vx * h;
        hit(0, pos);
        P.z += vz * h;
        hit(1, pos);
        const py = P.y;
        P.vy -= 25 * h;
        P.y += P.vy * h;
        let on = -1;
        for (let i = 0; i < boxes.length; i++) {
          const b = boxes[i],
            q = pos[i],
            top = b.y + b.h / 2,
            bot = b.y - b.h / 2;
          if (
            Math.abs(P.x - q.x) >= b.w / 2 + HW ||
            Math.abs(P.z - q.z) >= b.d / 2 + HW
          )
            continue;
          if (P.vy <= 0 && py >= top - 0.05 && P.y <= top) {
            P.y = top;
            P.vy = 0;
            on = i;
          } else if (P.vy > 0 && py + HH <= bot + 0.05 && P.y + HH > bot) {
            P.y = bot - HH;
            P.vy = 0;
          }
        }
        P.on = on;
      }
      if (P.on >= 0) {
        P.ox = pos[P.on].x;
        P.oz = pos[P.on].z;
        P.coy = 0.12;
      } else P.coy -= dt;
    };
    const groundAt = (
      x: number,
      y: number,
      z: number,
      pos: { x: number; z: number }[],
    ) => {
      let gy = -1e3;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i],
          q = pos[i],
          top = b.y + b.h / 2;
        if (
          top <= y + 0.3 &&
          top > gy &&
          Math.abs(x - q.x) < b.w / 2 &&
          Math.abs(z - q.z) < b.d / 2
        )
          gy = top;
      }
      return gy;
    };
    const shadow = (
      c: Char,
      x: number,
      y: number,
      z: number,
      pos: { x: number; z: number }[],
    ) => {
      const gy = groundAt(x, y, z, pos),
        h = clamp(y - gy, 0, 12);
      c.sh.visible = gy > -1e3 && c.dead < 0 && c.grp.visible;
      c.sh.position.set(x, gy + 0.03, z);
      c.sh.scale.setScalar(1 - h * 0.05);
      (c.sh.material as THREE.MeshBasicMaterial).opacity = 0.38 * (1 - h / 12);
    };
    /** Elimination: launched out of the lava in a spinning puff. */
    const die = (c: Char, dt: number) => {
      c.dead += dt;
      const k = clamp(c.dead / 0.9, 0, 1);
      c.grp.position.y += Math.sin(k * Math.PI) * 3.2;
      c.grp.scale.setScalar(Math.max(0.01, 1 - k * k));
      c.grp.rotation.z = k * 9;
      fx.emit(
        c.grp.position.x,
        c.grp.position.y + 0.8,
        c.grp.position.z,
        2,
        0xff8a1a,
        2,
        3,
        -4,
        0.6,
      );
    };

    let off: number | null = null;
    let raf = 0,
      last = performance.now(),
      lastSt: FlState | null = null,
      recv = last,
      lastRound = -1,
      lastSend = 0,
      wasJoined = false;
    let camPos = new THREE.Vector3(0, 12, 20),
      spd = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = useApp.getState().gameState as FlState | null;
      if (st !== lastSt) {
        lastSt = st;
        recv = now;
        if (st) {
          const o = st.hn - Date.now();
          off = off === null || o < off ? o : off + (o - off) * 0.02;
        }
        if (st && st.seed !== seed) build(st.seed);
      }
      const ph = st?.phase ?? "waiting",
        joinedNow = joinedRef.current,
        mine = st?.players[selfId];
      const pms = st
        ? ph === "playing"
          ? st.t + (Date.now() + (off ?? 0) - st.hn)
          : ph === "ended"
            ? st.pt
            : 0
        : 0;
      const T = pms / 1000,
        lv = lavaAt(pms);
      lavaM.position.y = lv;
      glow.position.y = lv + 0.06;
      tex.offset.x += dt * 0.004;
      tex.offset.y += dt * 0.003;
      tex2.offset.x -= dt * 0.005;
      (glow.material as THREE.MeshBasicMaterial).opacity =
        0.35 + Math.sin(now / 400) * 0.12;
      const pos = boxes.map((b) => boxPos(b, T));
      meshes.forEach((m, i) => {
        const b = boxes[i],
          ap = i === 0 ? 1 : clamp((now - builtAt) / 420 - i * 0.018, 0, 1),
          e = ap <= 0 ? 0.001 : easeBack(ap);
        m.scale.set(b.w * e, b.h * e, b.d * e);
        m.position.set(pos[i].x, b.y, pos[i].z);
        const heat = clamp(1 - (b.y + b.h / 2 - lv) / 5, 0, 1);
        (m.material as THREE.MeshLambertMaterial).emissive.setRGB(
          heat * 0.9,
          heat * 0.28,
          0,
        );
      });

      if (joinedNow && !wasJoined) {
        wasJoined = true;
        randSpawn();
      }
      if (st && st.round !== lastRound) {
        lastRound = st.round;
        const i = st.order.indexOf(selfId);
        if (i >= 0) {
          const s = spawnPos(i);
          Object.assign(P, {
            x: s.x,
            y: START_TOP,
            z: s.z,
            vy: 0,
            on: -1,
            kx: 0,
            kz: 0,
          });
          yaw = Math.atan2(s.x, s.z) + Math.PI;
        } else if (st.round > 0) randSpawn();
      }
      shoveCd -= dt;
      shoveAnim -= dt;
      me0.stag -= dt;

      // Got shoved: knockback scales with stacked hits (pw), brief stagger = reduced control
      if (mine) {
        if (lastPn < 0) lastPn = mine.pn;
        else if (mine.pn !== lastPn) {
          lastPn = mine.pn;
          P.kx = mine.px * 13 * mine.pw;
          P.kz = mine.pz * 13 * mine.pw;
          P.vy = 6 + (mine.pw - 1) * 2.5;
          P.on = -1;
          P.coy = 0;
          me0.stag = 0.35;
          me0.sq = 1.3;
          shake = 0.6;
          flash = 1;
          fx.emit(P.x, P.y + 1, P.z, 22, 0xffe066, 6, 5);
          wave(P.x, P.y, P.z, 0xff6b6b);
          if (mine.by)
            feedRef.current(
              `💥 ${nameOf(mine.by)} shoved you${mine.pw > 1.05 ? ` (x${mine.pw.toFixed(1)} knockback!)` : ""}`,
              "#ffa94d",
            );
        }
      }
      const kk = Math.exp(-3.5 * dt);
      P.kx *= kk;
      P.kz *= kk;
      const ctrl = joinedNow && !!mine && mine.alive && ph !== "countdown";
      let vx = 0,
        vz = 0;
      const prevVy = P.vy,
        prevOn = P.on;
      if (ctrl) {
        const gain = me0.stag > 0 ? 0.3 : 1;
        const f =
          (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
          (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
        const r =
          (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
          (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
        let mx = -Math.sin(yaw) * f + Math.cos(yaw) * r,
          mz = -Math.cos(yaw) * f - Math.sin(yaw) * r;
        const l = Math.hypot(mx, mz);
        if (l > 0) {
          mx /= l;
          mz /= l;
          vx = mx * SPEED * gain;
          vz = mz * SPEED * gain;
          if (shoveAnim <= 0)
            P.ry = lerpAng(P.ry, Math.atan2(mx, mz), 1 - Math.exp(-15 * dt));
        }
        phys(vx + P.kx, vz + P.kz, keys.has("Space"), dt, pos);
        if (ph !== "playing" && P.y < START_TOP - 10) randSpawn();
        if (now - lastSend > 66) {
          lastSend = now;
          sendAction({ t: "POS", x: P.x, y: P.y, z: P.z, ry: P.ry });
        }
        // jump / landing / footstep juice
        if (prevVy <= 0.1 && P.vy > 8) {
          me0.sq = 1.3;
          fx.emit(P.x, P.y + 0.1, P.z, 6, 0xffffff, 1.6, 1.5, 6, 0.45);
        } else if (prevOn < 0 && P.on >= 0 && prevVy < -4) {
          me0.sq = clamp(0.85 + prevVy * 0.02, 0.55, 0.85);
          fx.emit(
            P.x,
            P.y + 0.1,
            P.z,
            10 + Math.min(10, -prevVy | 0),
            0xffffff,
            2.6,
            1.2,
            6,
            0.5,
          );
          shake = Math.max(shake, clamp(-prevVy / 40, 0, 0.3));
        }
        if (P.on >= 0 && Math.hypot(vx, vz) > 1) {
          stepT -= dt;
          if (stepT <= 0) {
            stepT = 0.22;
            fx.emit(P.x, P.y + 0.08, P.z, 2, 0xffffff, 0.8, 0.8, 4, 0.35);
          }
        }
      } else if (
        joinedNow &&
        ph === "countdown" &&
        mine?.alive &&
        now - lastSend > 200
      ) {
        lastSend = now;
        sendAction({ t: "POS", x: P.x, y: P.y, z: P.z, ry: P.ry });
      }
      spd = Math.hypot(vx, vz);
      me0.grp.visible =
        joinedNow && (!!mine?.alive || (me0.dead >= 0 && me0.dead < 0.9));
      if (mine?.alive) {
        me0.dead = -1;
        me0.grp.rotation.z = 0;
      }
      me0.grp.position.set(P.x, P.y, P.z);
      me0.grp.rotation.y = P.ry;
      animate(me0, dt, spd, P.on < 0 && ctrl, shoveAnim > 0);
      if (me0.dead >= 0) die(me0, dt);
      else squash(me0, dt);
      shadow(me0, P.x, P.y, P.z, pos);

      // Remote players
      const seen = new Set<string>();
      if (st)
        for (const [id, p] of Object.entries(st.players)) {
          // elimination feed + burst (own + remote)
          const wa = wasAlive.get(id);
          wasAlive.set(id, p.alive);
          if (wa && !p.alive && ph === "playing") {
            const tc = id === selfId ? me0 : chars.get(id);
            if (tc) tc.dead = 0;
            const ex = id === selfId ? P.x : (tc?.pos.x ?? p.x),
              ez = id === selfId ? P.z : (tc?.pos.z ?? p.z);
            fx.emit(ex, lv + 0.3, ez, 40, 0xff7a1a, 6, 9, 14, 1);
            fx.emit(ex, lv + 0.3, ez, 14, 0xffe066, 3, 10, 14, 0.9);
            wave(ex, lv, ez, 0xff922b);
            const who = id === selfId ? "You" : nameOf(id);
            feedRef.current(
              p.kl
                ? `🔥 ${p.kl === selfId ? "You" : nameOf(p.kl)} shoved ${who} into the lava`
                : `🔥 ${who} fell into the lava`,
              p.kl === selfId ? "#8ce99a" : "#ff8787",
            );
            if (id === selfId) {
              shake = 1;
              flash = 1;
            } else shake = Math.max(shake, 0.25);
          }
          if (id === selfId) continue;
          seen.add(id);
          let c = chars.get(id);
          if (!c) {
            c = mkChar(colOf(id), nameOf(id));
            c.pos.set(p.x, p.y, p.z);
            c.pn = p.pn;
            chars.set(id, c);
            scene.add(c.grp, c.sh);
          }
          const k = 1 - Math.exp(-14 * dt),
            ox = c.pos.x,
            oy = c.pos.y,
            oz = c.pos.z;
          c.pos.x += (p.x - ox) * k;
          c.pos.y += (p.y - oy) * k;
          c.pos.z += (p.z - oz) * k;
          c.grp.position.copy(c.pos);
          c.grp.rotation.y = lerpAng(c.grp.rotation.y, p.ry, k);
          c.stag -= dt;
          if (p.pn !== c.pn) {
            // they got shoved: hit sparks, ring, stagger
            c.pn = p.pn;
            c.stag = 0.35;
            c.sq = 1.3;
            fx.emit(c.pos.x, c.pos.y + 1, c.pos.z, 16, 0xffe066, 5, 4);
            wave(c.pos.x, c.pos.y, c.pos.z, 0xff6b6b);
            if (Math.hypot(c.pos.x - P.x, c.pos.z - P.z) < 9)
              shake = Math.max(shake, 0.2);
          }
          if (p.alive) {
            c.dead = -1;
            c.grp.rotation.z = 0;
            c.grp.visible = true;
          } else c.grp.visible = c.dead >= 0 && c.dead < 0.9;
          const vy = (c.pos.y - oy) / Math.max(dt, 0.001);
          animate(
            c,
            dt,
            Math.hypot(c.pos.x - ox, c.pos.z - oz) / Math.max(dt, 0.001),
            Math.abs(vy) > 2,
            false,
          );
          if (c.dead >= 0) die(c, dt);
          else squash(c, dt, 1 + clamp(vy * 0.012, -0.15, 0.25));
          shadow(c, c.pos.x, c.pos.y, c.pos.z, pos);
        }
      chars.forEach((c, id) => {
        if (!seen.has(id)) {
          scene.remove(c.grp, c.sh);
          chars.delete(id);
          wasAlive.delete(id);
        }
      });

      // Shove target ring (only when ready) + shockwaves + particles
      const tgt = ctrl && shoveCd <= 0 ? aim() : "",
        tch = tgt ? chars.get(tgt) : undefined;
      aimRing.visible = !!tch;
      if (tch) {
        aimRing.position.set(tch.pos.x, tch.sh.position.y + 0.06, tch.pos.z);
        aimRing.scale.setScalar(1 + Math.sin(now / 110) * 0.1);
      }
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.t += dt;
        if (w.t > 0.35) {
          scene.remove(w.m);
          (w.m.material as THREE.Material).dispose();
          waves.splice(i, 1);
          continue;
        }
        w.m.scale.setScalar(1 + w.t * 14);
        (w.m.material as THREE.MeshBasicMaterial).opacity =
          0.8 * (1 - w.t / 0.35);
      }
      const nearX = P.x,
        nearZ = P.z;
      if (Math.random() < 0.8)
        fx.emit(
          nearX + (Math.random() - 0.5) * 40,
          lv + 0.2,
          nearZ + (Math.random() - 0.5) * 40,
          1,
          0xff7a1a,
          0.4,
          3 + Math.random() * 3,
          -2,
          1.8,
        );
      fx.update(dt);

      // Camera: follow self, else the highest living player, else orbit the start platform
      let tx = 0,
        ty = START_TOP + 4,
        tz = 0,
        dist = 14;
      if (joinedNow) {
        let best: THREE.Vector3 | null = null;
        if (!ctrl)
          chars.forEach((c) => {
            if (c.grp.visible && c.dead < 0 && (!best || c.pos.y > best.y))
              best = c.pos;
          });
        const t =
          best ??
          (ctrl || !st
            ? new THREE.Vector3(P.x, P.y, P.z)
            : new THREE.Vector3(0, START_TOP, 0));
        tx = t.x;
        ty = t.y + 1.5;
        tz = t.z;
        dist = 9;
      } else yaw += dt * 0.2;
      const want = new THREE.Vector3(
        tx + Math.sin(yaw) * Math.cos(pitch) * dist,
        ty + Math.sin(pitch) * dist,
        tz + Math.cos(yaw) * Math.cos(pitch) * dist,
      );
      camPos.lerp(want, 1 - Math.exp(-12 * dt));
      cam.position.copy(camPos);
      if (shake > 0.01)
        cam.position.add(
          new THREE.Vector3(
            (Math.random() - 0.5) * shake,
            (Math.random() - 0.5) * shake,
            (Math.random() - 0.5) * shake,
          ),
        );
      shake *= Math.exp(-8 * dt);
      cam.lookAt(tx, ty, tz);
      cam.fov +=
        (65 + clamp(spd, 0, SPEED) * 0.6 + shake * 4 - cam.fov) *
        (1 - Math.exp(-8 * dt));
      cam.updateProjectionMatrix();

      // Heat: sky/fog warm up as lava closes in; red vignette when in danger
      const heat = clamp(1 - (ty - lv) / 14, 0, 1);
      (scene.background as THREE.Color).copy(SKY).lerp(HOT, heat * 0.65);
      fog.color.copy(scene.background as THREE.Color);
      const danger = ctrl ? clamp(1 - (P.y - lv) / 6, 0, 1) : 0;
      if (vigRef.current)
        vigRef.current.style.opacity = String(
          danger * (0.7 + Math.sin(now / 120) * 0.3),
        );
      if (flashRef.current) {
        flashRef.current.style.opacity = String(flash * 0.55);
        flash = Math.max(0, flash - dt * 2.5);
      }
      if (cdRef.current) {
        const f = 1 - clamp(shoveCd / SHOVE_CD, 0, 1);
        cdRef.current.style.width = `${f * 100}%`;
        cdRef.current.style.background = f >= 1 ? "#8ce99a" : "#ffa94d";
      }
      renderer.render(scene, cam);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      fx.dispose();
      removeEventListener("keydown", kd);
      removeEventListener("keyup", ku);
      removeEventListener("mousemove", mm);
      removeEventListener("mouseup", mu);
      document.exitPointerLock?.();
      renderer.dispose();
      dom.remove();
    };
  }, []);

  const names = state ? Object.keys(state.players) : [];
  const winner = state?.winner;
  const hud: CSSProperties = {
    position: "absolute",
    color: "#fff",
    fontFamily: FONT,
    textShadow: "0 2px 0 rgba(0,0,0,.5)",
    pointerEvents: "none",
  };
  const pct = (v: number) =>
    clamp(((v - LAVA0) / (MAX_TOP - LAVA0)) * 100, 0, 100);
  const close = !!me && me.alive && phase === "playing" && me.y - lava < 4;
  const board = state
    ? state.order
        .map((id) => ({ id, p: state.players[id] }))
        .filter((x) => x.p)
        .sort((a, b) =>
          a.id === winner ? -1 : b.id === winner ? 1 : b.p.dt - a.p.dt,
        )
    : [];
  const medal = ["🥇", "🥈", "🥉"];

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 40, background: "#000" }}
    >
      <style>{css}</style>
      <div ref={mount} style={{ position: "absolute", inset: 0 }} />
      <div
        ref={vigRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0,
          background:
            "radial-gradient(ellipse at center,transparent 45%,rgba(255,60,0,.55) 100%)",
        }}
      />
      <div
        ref={flashRef}
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          opacity: 0,
          background:
            "radial-gradient(ellipse at center,transparent 30%,rgba(255,255,255,.9) 130%)",
        }}
      />
      <button
        style={{ ...ghost, position: "absolute", top: 12, right: 12 }}
        onClick={exit}
      >
        Leave
      </button>

      {joined && state && phase !== "waiting" && (
        <>
          <div
            style={{
              ...hud,
              ...glass,
              top: 12,
              left: 14,
              fontSize: 20,
              lineHeight: 1.5,
            }}
          >
            <div>
              👥 {alive}
              <span style={{ opacity: 0.6 }}>/{total}</span> alive
            </div>
            <div>⏱ {fmt(pms)}</div>
          </div>
          <div
            style={{
              ...hud,
              top: 14,
              left: "50%",
              transform: "translateX(-50%)",
              textAlign: "center",
            }}
          >
            <div style={{ ...glass, fontSize: 18, color: "#ffa94d" }}>
              🌋 {Math.max(0, lava).toFixed(1)}m{" "}
              <span style={{ fontSize: 13, color: "#ffd8a8" }}>
                ▲ {rate.toFixed(2)}m/s
              </span>
            </div>
            {close && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 22,
                  color: "#ff6b6b",
                  animation: "flPulse .5s infinite",
                }}
              >
                ⚠ LAVA CLOSE — CLIMB!
              </div>
            )}
          </div>
          <div
            style={{
              ...hud,
              right: 24,
              top: "18%",
              bottom: "18%",
              width: 24,
              background: "rgba(0,0,0,.45)",
              borderRadius: 12,
              border: "2px solid #fff",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  width: "100%",
                  height: `${pct(lava)}%`,
                  background: "linear-gradient(#ffd43b,#ff6b1a,#c92a2a)",
                }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                top: -22,
                width: "100%",
                textAlign: "center",
                fontSize: 14,
              }}
            >
              🏁
            </div>
            {Object.entries(state.players).map(([id, p]) => (
              <div
                key={id}
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: `${pct(p.y)}%`,
                  width: id === selfId ? 18 : 12,
                  height: id === selfId ? 18 : 12,
                  marginLeft: id === selfId ? -9 : -6,
                  marginBottom: -6,
                  borderRadius: "50%",
                  background: hex(colOf(id)),
                  border: `2px solid ${id === selfId ? "#fff" : "#222"}`,
                  opacity: p.alive ? 1 : 0.25,
                  transition: "bottom .15s linear",
                  boxShadow: id === selfId ? "0 0 8px #fff" : "none",
                }}
              />
            ))}
          </div>
          {me?.alive && (
            <div
              style={{
                ...hud,
                bottom: 26,
                left: "50%",
                transform: "translateX(-50%)",
                width: 190,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 12, marginBottom: 4 }}>
                SHOVE · E / CLICK
              </div>
              <div
                style={{
                  height: 11,
                  borderRadius: 7,
                  background: "rgba(0,0,0,.5)",
                  overflow: "hidden",
                  border: "2px solid #fff",
                }}
              >
                <div ref={cdRef} style={{ height: "100%", width: "100%" }} />
              </div>
            </div>
          )}
          <div
            style={{
              ...hud,
              top: 58,
              right: 14,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 6,
            }}
          >
            {feed.map((f) => (
              <div
                key={f.id}
                style={{
                  ...glass,
                  padding: "5px 12px",
                  fontSize: 14,
                  color: f.c,
                  animation: "flFeed .25s ease-out",
                }}
              >
                {f.t}
              </div>
            ))}
          </div>
        </>
      )}

      {!joined && !me && (
        <div style={overlay}>
          <div style={panel}>
            <div style={title}>FLOOR IS LAVA</div>
            <div style={{ fontSize: 16, margin: "10px 0 16px" }}>
              Climb. Jump. Shove. Last one standing wins!
            </div>
            <button style={btn} onClick={play}>
              ▶ PLAY
            </button>
            <div
              style={{
                fontSize: 13,
                marginTop: 16,
                opacity: 0.9,
                lineHeight: 1.6,
              }}
            >
              WASD move · Space jump · E / click shove · Mouse look
              <br />
              💥 Hits within 4s stack — dogpiles launch rivals further
            </div>
          </div>
        </div>
      )}

      {joined && phase === "waiting" && (
        <div style={overlay}>
          <div style={panel}>
            <div style={{ fontSize: 28 }}>
              Waiting for players…{" "}
              <span
                style={{
                  animation: "flPulse 1.2s infinite",
                  display: "inline-block",
                }}
              >
                {names.length}/2+
              </span>
            </div>
            <div style={{ marginTop: 10 }}>
              {names.map((id) => (
                <span key={id} style={chip(id)}>
                  {nameOf(id)}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 13, marginTop: 8, opacity: 0.8 }}>
              Round starts as soon as 2 players are in.
            </div>
          </div>
        </div>
      )}

      {joined && phase === "countdown" && state && (
        <div style={overlay}>
          {(() => {
            const n = Math.max(1, Math.ceil((COUNTDOWN - state.t) / 1000));
            return (
              <div
                key={n}
                style={{
                  fontSize: 170,
                  color: n <= 1 ? "#ff6b6b" : "#ffd43b",
                  animation: "flPop 1s ease-out forwards",
                }}
              >
                {n}
              </div>
            );
          })()}
          <div style={{ fontSize: 24 }}>
            {me?.alive
              ? "Get ready — click to lock the mouse, shove to survive!"
              : "Spectating — you join next round"}
          </div>
        </div>
      )}

      {joined && phase === "playing" && !!state && state.t < 1000 && (
        <div style={overlay}>
          <div
            style={{
              fontSize: 120,
              color: "#8ce99a",
              animation: "flGo 1s ease-out forwards",
            }}
          >
            GO!
          </div>
        </div>
      )}

      {joined && phase === "playing" && me && !me.alive && (
        <div
          style={{ ...overlay, justifyContent: "flex-start", paddingTop: 90 }}
        >
          <div
            style={{
              fontSize: 36,
              color: "#ff6b6b",
              animation: "flIn .4s ease-out",
            }}
          >
            🔥 Eliminated!
          </div>
          {me.dt > 0 && (
            <div style={{ fontSize: 18 }}>
              You survived {fmt(me.dt)} — spectating
            </div>
          )}
        </div>
      )}

      {joined && phase === "ended" && state && (
        <div style={overlay}>
          <div style={panel}>
            <div style={{ ...title, fontSize: 38 }}>
              {winner
                ? `🏆 ${nameOf(winner)}${winner === selfId ? " (you)" : ""} wins!`
                : "Everyone burned! 🔥"}
            </div>
            <div style={{ margin: "14px 0", textAlign: "left", fontSize: 16 }}>
              {board.slice(0, 6).map((r, i) => (
                <div
                  key={r.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "4px 0",
                    color: r.id === selfId ? "#ffd43b" : "#fff",
                  }}
                >
                  <span style={{ width: 28 }}>{medal[i] ?? `${i + 1}.`}</span>
                  <span style={{ flex: 1 }}>{nameOf(r.id)}</span>
                  <span style={{ opacity: 0.8 }}>
                    {fmt(r.id === winner ? state.pt : r.p.dt)}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 14, marginBottom: 14, opacity: 0.85 }}>
              Next round in {Math.max(0, Math.ceil((ENDED - state.t) / 1000))}s
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              {isHost() && (
                <button
                  style={btn}
                  onClick={() => sendAction({ t: "RESTART" })}
                >
                  Restart now
                </button>
              )}
              {isHost() && (
                <button style={ghost} onClick={returnToLobby}>
                  Return to lobby
                </button>
              )}
              {!isHost() && (
                <button style={ghost} onClick={exit}>
                  Leave
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
