import { useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
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
import { hueOf } from "../../../utils/color";
import {
  BOARD_WIDTH,
  FINISH_ROW,
  TICK_MS,
  TOTAL_ROUNDS,
  type CrossyAction,
  type CrossyState,
  type PlayerState,
  type Row,
} from "..";
import "./crossyRace.css";

const COLORS = {
  grass: 0x78c957,
  grassAlt: 0x69b948,
  grassDark: 0x478d42,
  finishLight: 0xfff3c6,
  finishDark: 0x33424a,
  road: 0x414951,
  roadLine: 0xe7d88e,
  water: 0x34a8d1,
  waterDeep: 0x2184b7,
  log: 0x94603b,
  logLight: 0xc28b51,
  chicken: 0xfff0bf,
  beak: 0xffa52f,
  comb: 0xec5752,
};
const WORLD_SCALE = 1.2;

const ANIMALS = [
  { id: "chicken", emoji: "🐥" },
  { id: "bunny", emoji: "🐰" },
  { id: "fox", emoji: "🦊" },
  { id: "frog", emoji: "🐸" },
  { id: "cat", emoji: "🐱" },
  { id: "bear", emoji: "🐻" },
] as const;
type AnimalId = typeof ANIMALS[number]["id"];

function animalForPlayer(id: string) {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) {
    hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  }
  return ANIMALS[(hash >>> 0) % ANIMALS.length]!;
}

type Motion = {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  started: number;
  duration: number;
  hop: boolean;
  onLog: boolean;
};

type PlayerVisual = {
  group: THREE.Group;
  model: THREE.Group;
  nameplate: THREE.Sprite;
  name: string;
  animal: AnimalId;
  legs: THREE.Group[];
  arms: THREE.Group[];
  ears: THREE.Mesh[];
  tail: THREE.Group | null;
  body: THREE.Mesh;
  head: THREE.Mesh;
  motion: Motion;
  alive: boolean;
  color: THREE.Color;
};

type RowVisual = {
  kind: Row["kind"];
  group: THREE.Group;
  obstacles: THREE.Group[];
  waves: THREE.Mesh[];
};

type Runtime = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  world: THREE.Group;
  rows: Map<number, RowVisual>;
  players: Map<string, PlayerVisual>;
  materials: Record<string, THREE.MeshStandardMaterial>;
  geometries: Record<string, THREE.BufferGeometry>;
  state: CrossyState | null;
  receivedAt: number;
  cameraFocusRow: number;
  lastFrameAt: number;
  resize: () => void;
};

const wrap = (x: number) => ((x % BOARD_WIDTH) + BOARD_WIDTH) % BOARD_WIDTH;

function makeAnimal(animal: AnimalId, color: THREE.Color, runtime: Runtime) {
  const { geometries: g, materials: m } = runtime;
  const group = new THREE.Group();
  const fur = m[`${animal}Fur`]!;
  const head = new THREE.Mesh(g.chickenHead, fur);
  head.position.set(0, 0.98, -0.08);
  const body = new THREE.Mesh(g.chickenBody, fur);
  body.position.set(0, 0.58, 0.04);
  body.scale.set(1, 0.94, 1);
  group.add(body, head);

  const arms: THREE.Group[] = [];
  const legs: THREE.Group[] = [];
  const ears: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(g.eye, m.eye);
    const eyePosition = animal === "frog"
      ? [side * 0.18, 1.18, -0.29]
      : [side * 0.105, 1.04, -0.34];
    eye.position.set(eyePosition[0]!, eyePosition[1]!, eyePosition[2]!);
    group.add(eye);
    const pupil = new THREE.Mesh(g.pupil, m.pupil);
    pupil.position.set(eyePosition[0]!, eyePosition[1]!, eyePosition[2]! - 0.055);
    group.add(pupil);

    const arm = new THREE.Group();
    arm.position.set(side * 0.3, 0.58, 0.02);
    const wing = new THREE.Mesh(g.wing, fur);
    wing.scale.set(0.82, 1, 0.7);
    arm.add(wing);
    group.add(arm);
    arms.push(arm);

    const leg = new THREE.Group();
    leg.position.set(side * 0.13, 0.2, 0.02);
    const foot = new THREE.Mesh(g.foot, m[animal === "chicken" ? "beak" : `${animal}Fur`]!);
    foot.position.set(0, -0.07, -0.04);
    leg.add(foot);
    group.add(leg);
    legs.push(leg);
  }

  const muzzle = new THREE.Mesh(g.chickenHead, m[`${animal}Muzzle`]!);
  muzzle.scale.set(0.45, 0.31, 0.4);
  muzzle.position.set(0, 0.9, -0.33);
  group.add(muzzle);

  if (animal === "chicken") {
    const beak = new THREE.Mesh(g.beak, m.beak);
    beak.position.set(0, 0.92, -0.43);
    beak.rotation.x = -Math.PI / 2;
    group.add(beak);
    const comb = new THREE.Mesh(g.comb, m.comb);
    comb.position.set(0, 1.26, -0.04);
    group.add(comb);
  }

  if (animal === "bunny" || animal === "cat" || animal === "fox") {
    for (const side of [-1, 1]) {
      const pointed = animal !== "bunny";
      const ear = new THREE.Mesh(
        pointed ? g.animalEar : g.chickenHead,
        fur,
      );
      ear.position.set(side * (animal === "bunny" ? 0.14 : 0.18), 1.28, -0.04);
      ear.scale.set(
        animal === "bunny" ? 0.38 : 0.82,
        animal === "bunny" ? 1.45 : 0.9,
        animal === "bunny" ? 0.32 : 0.72,
      );
      if (pointed) ear.rotation.z = side * -0.18;
      group.add(ear);
      ears.push(ear);
      if (animal === "bunny") {
        const inner = new THREE.Mesh(g.chickenHead, m.earInner!);
        inner.position.set(side * 0.14, 1.29, -0.12);
        inner.scale.set(0.1, 0.29, 0.035);
        group.add(inner);
      }
    }
  } else if (animal === "bear") {
    for (const side of [-1, 1]) {
      const ear = new THREE.Mesh(g.chickenHead, fur);
      ear.position.set(side * 0.2, 1.18, -0.02);
      ear.scale.setScalar(0.42);
      group.add(ear);
      ears.push(ear);
    }
  } else if (animal === "frog") {
    for (const side of [-1, 1]) {
      const stalk = new THREE.Mesh(g.chickenHead, fur);
      stalk.position.set(side * 0.18, 1.12, -0.02);
      stalk.scale.set(0.34, 0.42, 0.32);
      group.add(stalk);
    }
  }

  let tail: THREE.Group | null = null;
  if (animal === "cat" || animal === "fox" || animal === "bear") {
    tail = new THREE.Group();
    tail.position.set(0, 0.55, 0.34);
    const tailMesh = new THREE.Mesh(g.chickenBody, fur);
    tailMesh.scale.set(animal === "fox" ? 0.33 : 0.2, 0.22, animal === "fox" ? 0.58 : 0.42);
    tailMesh.rotation.x = -0.4;
    tail.add(tailMesh);
    if (animal === "fox") {
      const tip = new THREE.Mesh(g.chickenHead, m.foxMuzzle!);
      tip.position.z = 0.32;
      tip.scale.set(0.22, 0.16, 0.2);
      tail.add(tip);
    }
    group.add(tail);
  }

  const shadow = new THREE.Mesh(g.shadow, m.shadow);
  shadow.position.set(0, 0.025, 0);
  group.add(shadow);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh && object !== shadow) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  const collarMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.5,
    flatShading: true,
  });
  const collar = new THREE.Mesh(g.collar, collarMaterial);
  collar.position.set(0, 0.58, -0.01);
  collar.rotation.x = Math.PI / 2;
  group.add(collar);
  group.remove(shadow);
  group.scale.setScalar(0.68);
  return { group, body, head, legs, arms, ears, tail, shadow };
}

function makeNameplate(name: string, color: THREE.Color) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 112;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create the racer nameplate.");
  context.fillStyle = "#183247e8";
  context.beginPath();
  context.roundRect(8, 8, 496, 96, 42);
  context.fill();
  context.lineWidth = 6;
  context.strokeStyle = `#${color.getHexString()}`;
  context.stroke();
  context.fillStyle = "#fff";
  context.font = "bold 44px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(name, 256, 57, 440);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(Math.min(2.8, Math.max(1.2, name.length * 0.085 + 0.6)), 0.34, 1);
  sprite.position.set(0, 1.25, 0);
  return sprite;
}

function makeCar(runtime: Runtime, color: number) {
  const { geometries: g, materials: m } = runtime;
  const group = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.32,
    metalness: 0.12,
    flatShading: true,
  });
  const body = new THREE.Mesh(g.carBody, paint);
  body.position.y = 0.36;
  group.add(body);
  const cabin = new THREE.Mesh(g.carCabin, m.glass);
  cabin.position.set(-0.02, 0.68, 0);
  group.add(cabin);
  const roof = new THREE.Mesh(g.carRoof, paint);
  roof.position.set(-0.02, 0.84, 0);
  group.add(roof);

  for (const side of [-1, 1]) {
    for (const end of [-1, 1]) {
      const wheel = new THREE.Mesh(g.wheel, m.tire);
      wheel.position.set(end * 0.32, 0.2, side * 0.32);
      wheel.rotation.x = Math.PI / 2;
      group.add(wheel);
      const hub = new THREE.Mesh(g.hub, m.hub);
      hub.position.set(end * 0.32, 0.2, side * 0.355);
      group.add(hub);
    }
  }
  const headlamp = new THREE.Mesh(g.headlamp, m.headlamp);
  headlamp.position.set(-0.44, 0.43, -0.24);
  group.add(headlamp);
  const tailLamp = new THREE.Mesh(g.headlamp, m.taillamp);
  tailLamp.position.set(0.44, 0.43, -0.24);
  group.add(tailLamp);
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  group.userData.paint = paint;
  return group;
}

function makeLog(runtime: Runtime, variation: number) {
  const group = new THREE.Group();
  const log = new THREE.Mesh(
    runtime.geometries.log,
    variation % 2 ? runtime.materials.log : runtime.materials.logLight,
  );
  log.rotation.z = Math.PI / 2;
  log.position.y = 0.27;
  group.add(log);
  for (const x of [-0.38, 0, 0.38]) {
    const ring = new THREE.Mesh(
      runtime.geometries.logRing,
      runtime.materials.logRing,
    );
    ring.rotation.z = Math.PI / 2;
    ring.position.set(x, 0.27, 0);
    group.add(ring);
  }
  group.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  return group;
}

function disposeDynamicObject(root: THREE.Object3D, runtime: Runtime) {
  const sharedGeometries = new Set(Object.values(runtime.geometries));
  const sharedMaterials = new Set<THREE.Material>(Object.values(runtime.materials));
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !sharedGeometries.has(object.geometry)) {
      geometries.add(object.geometry);
    }
    const objectMaterials = object instanceof THREE.Mesh || object instanceof THREE.Sprite
      ? object.material
      : null;
    if (!objectMaterials) return;
    const list = Array.isArray(objectMaterials) ? objectMaterials : [objectMaterials];
    for (const material of list) {
      if (sharedMaterials.has(material)) continue;
      materials.add(material);
      if (material instanceof THREE.SpriteMaterial && material.map) {
        textures.add(material.map);
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

function disposeScene(runtime: Runtime) {
  runtime.renderer.setAnimationLoop(null);
  disposeDynamicObject(runtime.world, runtime);
  runtime.renderer.dispose();
  runtime.renderer.domElement.remove();
  Object.values(runtime.geometries).forEach((geometry) => geometry.dispose());
  Object.values(runtime.materials).forEach((material) => material.dispose());
}

function updateMotion(player: PlayerVisual, position: PlayerState, now: number) {
  const elapsed = Math.min(1, (now - player.motion.started) / player.motion.duration);
  const t = 1 - Math.pow(1 - elapsed, 3);
  const hop = player.motion.hop ? Math.sin(Math.PI * elapsed) : 0;
  const idle = player.alive && !player.motion.onLog
    ? Math.sin(now / 230 + player.color.r * 8) * 0.018
    : 0;
  const x = THREE.MathUtils.lerp(player.motion.fromX, player.motion.toX, t);
  const y = THREE.MathUtils.lerp(player.motion.fromY, player.motion.toY, t);
  player.group.position.set(x, 0, -y);
  player.model.position.y = idle + hop * 0.38;
  player.model.rotation.x = (player.motion.toY > player.motion.fromY ? -1 : 0.7) * hop * 0.18;
  const movementTilt = Math.sign(player.motion.toX - player.motion.fromX) * hop * -0.12;
  player.model.rotation.z = THREE.MathUtils.lerp(
    player.model.rotation.z,
    player.alive ? movementTilt : -Math.PI / 2,
    0.15,
  );
  player.body.scale.y = 0.94 * (1 + hop * 0.12);
  player.head.rotation.z = Math.sin(now / 370 + player.color.r * 5) * 0.035;
  player.legs.forEach((leg, index) => {
    leg.rotation.x = Math.sin(elapsed * Math.PI * 2 + index * Math.PI) * hop * 0.58;
  });
  player.arms.forEach((arm, index) => {
    arm.rotation.z = (index === 0 ? -1 : 1) * (0.12 + hop * 0.5);
  });
  player.ears.forEach((ear, index) => {
    ear.rotation.z = (index === 0 ? 1 : -1) * hop * 0.12;
  });
  if (player.tail) player.tail.rotation.x = Math.sin(now / 190) * 0.14 - hop * 0.22;
  player.nameplate.position.y = 1.25 + hop * 0.26;
  const targetScale = player.alive ? 0.68 : 0.6;
  player.model.scale.setScalar(THREE.MathUtils.lerp(player.model.scale.x, targetScale, 0.15));
  if (elapsed >= 1 && (player.motion.toX !== position.x || player.motion.toY !== position.y)) {
    player.motion.toX = position.x;
    player.motion.toY = position.y;
  }
}

function updateRuntime(runtime: Runtime, now: number) {
  const state = runtime.state;
  if (!state) return;
  const elapsed = Math.min(1, (now - runtime.receivedAt) / TICK_MS);
  const frameSeconds = Math.min(0.05, Math.max(0, (now - runtime.lastFrameAt) / 1000));
  const follow = 1 - Math.exp(-frameSeconds * 22);
  runtime.lastFrameAt = now;

  for (const row of state.rows) {
    const view = runtime.rows.get(row.y);
    if (!view || row.kind === "grass") continue;
    row.items.forEach((item, index) => {
      const obstacle = view.obstacles[index];
      if (!obstacle) return;
      const targetX = wrap(item + row.direction * row.speed * elapsed * TICK_MS / 1000);
      const deltaX = wrap(targetX - obstacle.position.x + BOARD_WIDTH / 2) - BOARD_WIDTH / 2;
      obstacle.position.x = wrap(obstacle.position.x + deltaX * follow);
      obstacle.position.z = 0;
      obstacle.rotation.y = row.direction > 0 ? Math.PI : 0;
    });
    view.waves.forEach((wave, index) => {
      wave.position.x = Math.sin(now / 430 + index * 2 + row.y) * 3.8;
      wave.position.y = 0.012 + Math.sin(now / 280 + index) * 0.012;
    });
  }

  for (const [id, player] of runtime.players) {
    const position = state.players[id];
    if (position) updateMotion(player, position, now);
  }

  const me = selfId ? state.players[selfId] : undefined;
  const boardCenterX = ((BOARD_WIDTH - 1) / 2) * WORLD_SCALE;
  const halfWidth = (runtime.camera.right - runtime.camera.left) / 2;
  const horizontalMargin = Math.min(1.35, halfWidth * 0.4);
  const playerX = (me?.x ?? (BOARD_WIDTH - 1) / 2) * WORLD_SCALE;
  const targetX = THREE.MathUtils.clamp(
    boardCenterX,
    playerX - halfWidth + horizontalMargin,
    playerX + halfWidth - horizontalMargin,
  );
  const playerRow = me?.y ?? 0;
  const cameraFocusRow = Math.floor(playerRow / 3) * 3;
  if (cameraFocusRow < runtime.cameraFocusRow - 2) {
    runtime.cameraFocusRow = cameraFocusRow;
  } else {
    runtime.cameraFocusRow = Math.max(runtime.cameraFocusRow, cameraFocusRow);
  }
  const targetZ = -runtime.cameraFocusRow * WORLD_SCALE - 5.2;
  const look = new THREE.Vector3(targetX, 0, targetZ);
  const desired = look.clone().add(new THREE.Vector3(9.2, 10.8, 10.8));
  runtime.camera.position.lerp(desired, 0.035);
  runtime.camera.lookAt(look);
}

function initRuntime(mount: HTMLDivElement): Runtime {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9bd9e9);
  scene.fog = new THREE.Fog(0x9bd9e9, 18, 38);
  const camera = new THREE.OrthographicCamera(-9, 9, 9, -9, 0.1, 100);
  camera.position.set(8.5, 10, 10);
  camera.lookAt((BOARD_WIDTH - 1) / 2, 0, -4.5);

  scene.add(new THREE.HemisphereLight(0xe4f8ff, 0x537347, 2.0));
  const sun = new THREE.DirectionalLight(0xfff3d7, 3);
  sun.position.set(-7, 15, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 16;
  sun.shadow.camera.bottom = -16;
  sun.shadow.bias = -0.001;
  scene.add(sun);

  const materials = {
    grass: new THREE.MeshStandardMaterial({ color: COLORS.grass, roughness: 0.9 }),
    grassAlt: new THREE.MeshStandardMaterial({ color: COLORS.grassAlt, roughness: 0.9 }),
    grassDark: new THREE.MeshStandardMaterial({ color: COLORS.grassDark, roughness: 1 }),
    finishLight: new THREE.MeshStandardMaterial({ color: COLORS.finishLight, roughness: 0.75 }),
    finishDark: new THREE.MeshStandardMaterial({ color: COLORS.finishDark, roughness: 0.75 }),
    road: new THREE.MeshStandardMaterial({ color: COLORS.road, roughness: 0.85 }),
    roadLine: new THREE.MeshStandardMaterial({
      color: COLORS.roadLine,
      roughness: 0.7,
      emissive: COLORS.roadLine,
      emissiveIntensity: 0.08,
    }),
    water: new THREE.MeshStandardMaterial({
      color: COLORS.water,
      roughness: 0.25,
      metalness: 0.12,
      transparent: true,
      opacity: 0.94,
    }),
    waterDeep: new THREE.MeshStandardMaterial({ color: COLORS.waterDeep, roughness: 0.3 }),
    log: new THREE.MeshStandardMaterial({ color: COLORS.log, roughness: 0.85 }),
    logLight: new THREE.MeshStandardMaterial({ color: COLORS.logLight, roughness: 0.8 }),
    logRing: new THREE.MeshStandardMaterial({ color: 0xe0b278, roughness: 0.9 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x202932, roughness: 0.9 }),
    hub: new THREE.MeshStandardMaterial({ color: 0xb9c9cd, metalness: 0.6, roughness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0xa6e5f7,
      roughness: 0.18,
      metalness: 0.2,
      emissive: 0x42a4c5,
      emissiveIntensity: 0.15,
    }),
    headlamp: new THREE.MeshStandardMaterial({
      color: 0xfff1b3,
      emissive: 0xffc64a,
      emissiveIntensity: 1,
    }),
    taillamp: new THREE.MeshStandardMaterial({
      color: 0xff514b,
      emissive: 0xc8222b,
      emissiveIntensity: 0.8,
    }),
    eye: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
    pupil: new THREE.MeshStandardMaterial({ color: 0x202a32, roughness: 0.3 }),
    beak: new THREE.MeshStandardMaterial({ color: COLORS.beak, roughness: 0.55, flatShading: true }),
    comb: new THREE.MeshStandardMaterial({ color: COLORS.comb, roughness: 0.55, flatShading: true }),
    chickenFur: new THREE.MeshStandardMaterial({ color: COLORS.chicken, roughness: 0.62, flatShading: true }),
    bunnyFur: new THREE.MeshStandardMaterial({ color: 0xf0e3d2, roughness: 0.75, flatShading: true }),
    foxFur: new THREE.MeshStandardMaterial({ color: 0xe77a36, roughness: 0.7, flatShading: true }),
    frogFur: new THREE.MeshStandardMaterial({ color: 0x68ba60, roughness: 0.72, flatShading: true }),
    catFur: new THREE.MeshStandardMaterial({ color: 0x8393a0, roughness: 0.7, flatShading: true }),
    bearFur: new THREE.MeshStandardMaterial({ color: 0x98633f, roughness: 0.8, flatShading: true }),
    chickenMuzzle: new THREE.MeshStandardMaterial({ color: 0xffc15a, roughness: 0.6 }),
    bunnyMuzzle: new THREE.MeshStandardMaterial({ color: 0xe9a4ac, roughness: 0.7 }),
    foxMuzzle: new THREE.MeshStandardMaterial({ color: 0xffeee0, roughness: 0.8 }),
    frogMuzzle: new THREE.MeshStandardMaterial({ color: 0x88d279, roughness: 0.7 }),
    catMuzzle: new THREE.MeshStandardMaterial({ color: 0xe1e7e8, roughness: 0.8 }),
    bearMuzzle: new THREE.MeshStandardMaterial({ color: 0xd2ac83, roughness: 0.8 }),
    earInner: new THREE.MeshStandardMaterial({ color: 0xe99ba5, roughness: 0.75 }),
    shadow: new THREE.MeshStandardMaterial({
      color: 0x19321f,
      transparent: true,
      opacity: 0.22,
      roughness: 1,
    }),
  };
  const geometries = {
    tile: new THREE.BoxGeometry(BOARD_WIDTH, 0.18, 0.96),
    finishSquare: new THREE.BoxGeometry(0.5, 0.035, 0.46),
    stripe: new THREE.BoxGeometry(0.65, 0.025, 0.055),
    tuft: new THREE.ConeGeometry(0.045, 0.22, 4),
    treeTrunk: new THREE.CylinderGeometry(0.11, 0.16, 0.8, 5),
    treeTop: new THREE.IcosahedronGeometry(0.52, 0),
    wave: new THREE.BoxGeometry(0.52, 0.025, 0.045),
    carBody: new THREE.BoxGeometry(1.02, 0.42, 0.72),
    carCabin: new THREE.BoxGeometry(0.62, 0.35, 0.6),
    carRoof: new THREE.BoxGeometry(0.45, 0.07, 0.58),
    wheel: new THREE.CylinderGeometry(0.17, 0.17, 0.12, 10),
    hub: new THREE.CylinderGeometry(0.075, 0.075, 0.125, 8),
    headlamp: new THREE.BoxGeometry(0.09, 0.11, 0.16),
    log: new THREE.CylinderGeometry(0.29, 0.29, 1.55, 9),
    logRing: new THREE.CylinderGeometry(0.295, 0.295, 0.055, 9),
    chickenBody: new THREE.SphereGeometry(0.36, 12, 10),
    chickenHead: new THREE.SphereGeometry(0.27, 12, 10),
    eye: new THREE.SphereGeometry(0.075, 10, 8),
    pupil: new THREE.SphereGeometry(0.033, 8, 6),
    wing: new THREE.SphereGeometry(0.18, 8, 6),
    foot: new THREE.BoxGeometry(0.19, 0.09, 0.21),
    beak: new THREE.ConeGeometry(0.115, 0.22, 5),
    comb: new THREE.SphereGeometry(0.095, 8, 6),
    animalEar: new THREE.ConeGeometry(0.15, 0.35, 4),
    collar: new THREE.TorusGeometry(0.24, 0.065, 6, 16),
    shadow: new THREE.CircleGeometry(0.43, 16),
  };
  const world = new THREE.Group();
  world.scale.setScalar(WORLD_SCALE);
  scene.add(world);
  const runtime: Runtime = {
    renderer,
    scene,
    camera,
    world,
    rows: new Map(),
    players: new Map(),
    materials,
    geometries,
    state: null,
    receivedAt: performance.now(),
    cameraFocusRow: 0,
    lastFrameAt: performance.now(),
    resize: () => {},
  };

  const resize = () => {
    const width = Math.max(1, mount.clientWidth);
    const height = Math.max(1, mount.clientHeight);
    const aspect = width / height;
    const viewHeight = 10.9;
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };
  runtime.resize = resize;
  resize();
  return runtime;
}

function makeRow(runtime: Runtime, row: Row): RowVisual {
  const group = new THREE.Group();
  group.position.z = -row.y;
  const groundMaterial =
    row.kind === "grass"
      ? row.y % 2 === 0
        ? runtime.materials.grass
        : runtime.materials.grassAlt
      : row.kind === "road"
        ? runtime.materials.road
        : runtime.materials.water;
  const ground = new THREE.Mesh(runtime.geometries.tile, groundMaterial);
  ground.position.set((BOARD_WIDTH - 1) / 2, -0.12, 0);
  ground.receiveShadow = true;
  group.add(ground);
  if (row.y === FINISH_ROW) {
    for (let x = 0; x < BOARD_WIDTH; x++) {
      for (let lane = 0; lane < 2; lane++) {
        const square = new THREE.Mesh(
          runtime.geometries.finishSquare,
          (x + lane) % 2 ? runtime.materials.finishDark : runtime.materials.finishLight,
        );
        square.position.set(x, -0.015, lane === 0 ? -0.24 : 0.24);
        group.add(square);
      }
    }
  }

  const visual: RowVisual = { kind: row.kind, group, obstacles: [], waves: [] };
  if (row.kind === "road") {
    for (let x = -4; x < BOARD_WIDTH + 4; x += 2) {
      const stripe = new THREE.Mesh(runtime.geometries.stripe, runtime.materials.roadLine);
      stripe.position.set(x, -0.018, 0.05);
      group.add(stripe);
    }
  } else if (row.kind === "water") {
    const waterBed = new THREE.Mesh(runtime.geometries.tile, runtime.materials.waterDeep);
    waterBed.scale.set(1, 0.2, 1);
    waterBed.position.set((BOARD_WIDTH - 1) / 2, -0.22, 0);
    group.add(waterBed);
    for (let i = 0; i < 5; i++) {
      const wave = new THREE.Mesh(runtime.geometries.wave, runtime.materials.waterDeep);
      wave.position.set(i * 1.8, 0, 0);
      group.add(wave);
      visual.waves.push(wave);
    }
  } else {
    for (let x = -4; x < BOARD_WIDTH + 4; x += 1) {
      const tuft = new THREE.Mesh(runtime.geometries.tuft, runtime.materials.grassDark);
      tuft.position.set(x, -0.005, ((x * 7 + row.y * 3) % 7) * 0.09 - 0.27);
      tuft.rotation.z = ((x * 13 + row.y) % 5) * 0.1;
      group.add(tuft);
    }
    if (row.y % 3 === 1) {
      for (const x of [1, BOARD_WIDTH - 2]) {
        const trunk = new THREE.Mesh(runtime.geometries.treeTrunk, runtime.materials.log);
        trunk.position.set(x, 0.32, 0.14);
        group.add(trunk);
        const top = new THREE.Mesh(
          runtime.geometries.treeTop,
          row.y % 2 ? runtime.materials.grassDark : runtime.materials.grass,
        );
        top.position.set(x, 0.9, 0.14);
        top.scale.set(1.15, 1.05, 0.9);
        group.add(top);
      }
    }
  }
  runtime.world.add(group);
  return visual;
}

function syncRuntime(runtime: Runtime, state: CrossyState, now: number) {
  const previous = runtime.state;
  const isNewRound = previous !== null && previous.round !== state.round;
  runtime.state = state;
  runtime.receivedAt = now;
  const currentRows = new Set(state.rows.map((row) => row.y));

  for (const [y, visual] of runtime.rows) {
    if (!currentRows.has(y)) {
      disposeDynamicObject(visual.group, runtime);
      runtime.world.remove(visual.group);
      runtime.rows.delete(y);
    }
  }
  for (const row of state.rows) {
    let visual = runtime.rows.get(row.y);
    if (visual && visual.kind !== row.kind) {
      disposeDynamicObject(visual.group, runtime);
      runtime.world.remove(visual.group);
      runtime.rows.delete(row.y);
      visual = undefined;
    }
    if (!visual) {
      visual = makeRow(runtime, row);
      runtime.rows.set(row.y, visual);
    }
    while (visual.obstacles.length > row.items.length) {
      const item = visual.obstacles.pop()!;
      disposeDynamicObject(item, runtime);
      visual.group.remove(item);
    }
    while (visual.obstacles.length < row.items.length) {
      const index = visual.obstacles.length;
      const item =
        row.kind === "road"
          ? makeCar(runtime, [0xf05e54, 0x43b5d1, 0xf2bd4b, 0x9a71dc][index % 4]!)
          : makeLog(runtime, index);
      item.position.x = row.items[index]!;
      visual.group.add(item);
      visual.obstacles.push(item);
    }
  }

  const currentPlayers = new Set(Object.keys(state.players));
  for (const [id, visual] of runtime.players) {
    if (!currentPlayers.has(id)) {
      disposeDynamicObject(visual.group, runtime);
      runtime.world.remove(visual.group);
      runtime.players.delete(id);
    }
  }
  for (const [id, position] of Object.entries(state.players)) {
    const playerName = nameOf(id) || id;
    const player = runtime.players.get(id);
    if (!player) {
      const hue = hueOf(id);
      const color = new THREE.Color(`hsl(${hue} 76% 57%)`);
      const animal = animalForPlayer(id).id;
      const character = makeAnimal(animal, color, runtime);
      const group = new THREE.Group();
      const nameplate = makeNameplate(playerName, color);
      group.add(character.group, character.shadow, nameplate);
      group.position.set(position.x, 0, -position.y);
      runtime.world.add(group);
      runtime.players.set(id, {
        group,
        model: character.group,
        nameplate,
        name: playerName,
        animal,
        legs: character.legs,
        arms: character.arms,
        ears: character.ears,
        tail: character.tail,
        body: character.body,
        head: character.head,
        color,
        alive: position.alive,
        motion: {
          fromX: position.x,
          toX: position.x,
          fromY: position.y,
          toY: position.y,
          started: now,
          duration: 1,
          hop: false,
          onLog: false,
        },
      });
    } else {
      if (player.name !== playerName) {
        player.group.remove(player.nameplate);
        disposeDynamicObject(player.nameplate, runtime);
        player.nameplate = makeNameplate(playerName, player.color);
        player.group.add(player.nameplate);
        player.name = playerName;
      }
      const old = previous?.players[id];
      const elapsed = Math.min(1, (now - player.motion.started) / player.motion.duration);
      const t = 1 - Math.pow(1 - elapsed, 3);
      const fromX = THREE.MathUtils.lerp(player.motion.fromX, player.motion.toX, t);
      const fromY = THREE.MathUtils.lerp(player.motion.fromY, player.motion.toY, t);
      if (old && (old.x !== position.x || old.y !== position.y)) {
        const respawning = isNewRound || (!old.alive && position.alive);
        const row = state.rows.find((candidate) => candidate.y === position.y);
        const elapsedTicks = Math.max(0, state.tick - (previous?.tick ?? state.tick));
        const expectedDrift = row?.kind === "water"
          ? row.direction * row.speed * elapsedTicks * TICK_MS / 1000
          : 0;
        const actualXDelta = wrap(position.x - old.x + BOARD_WIDTH / 2) - BOARD_WIDTH / 2;
        const carriedByLog = !respawning && old.y === position.y &&
          row?.kind === "water" && Math.abs(actualXDelta - expectedDrift) < 0.12;
        player.motion = {
          fromX: respawning ? position.x : fromX,
          fromY: respawning ? position.y : fromY,
          toX: position.x,
          toY: position.y,
          started: now,
          duration: respawning ? 240 : position.y > old.y ? 210 : 160,
          hop: !carriedByLog,
          onLog: carriedByLog,
        };
      }
      if (player.alive !== position.alive) {
        player.alive = position.alive;
      }
    }
  }
}

function CrossyRace() {
  const state = useApp((s) => s.gameState as CrossyState | null);
  const players = useApp((s) => s.players);
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const runtime = initRuntime(mount);
    runtimeRef.current = runtime;

    let frame = 0;
    const animate = (now: number) => {
      updateRuntime(runtime, now);
      runtime.renderer.render(runtime.scene, runtime.camera);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);

    const observer = new ResizeObserver(runtime.resize);
    observer.observe(mount);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      disposeScene(runtime);
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (state && runtimeRef.current) {
      syncRuntime(runtimeRef.current, state, performance.now());
    }
  }, [state, players]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        return;
      }
      const key = event.key.toLowerCase();
      const dir: CrossyAction["dir"] | null =
        key === "arrowup" || key === "w"
          ? "up"
          : key === "arrowdown" || key === "s"
            ? "down"
            : key === "arrowleft" || key === "a"
              ? "left"
              : key === "arrowright" || key === "d"
                ? "right"
                : null;
      if (!dir) return;
      event.preventDefault();
      sendAction<CrossyAction>({ t: "MOVE", dir });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!state) return null;
  const me = selfId ? state.players[selfId] : null;
  const standings = [...players]
    .map((player) => ({
      ...player,
      score: state.roundWins[player.id] ?? 0,
      best: state.scores[player.id] ?? state.players[player.id]?.best ?? 0,
      totalRows: state.totalRows[player.id] ?? 0,
      joinedRace: Boolean(state.players[player.id]),
      alive: state.players[player.id]?.alive ?? false,
    }))
    .sort((a, b) => b.score - a.score || b.totalRows - a.totalRows);
  const exit = () => {
    leave();
    history.replaceState(null, "", "/");
  };
  const move = (dir: CrossyAction["dir"]) => {
    sendAction<CrossyAction>({ t: "MOVE", dir });
  };

  return (
    <main className="crossy-shell">
      <header className="crossy-topbar">
        <div className="crossy-brand">
          <span className="crossy-logo" aria-hidden="true">✦</span>
          <span><b>CROSSY</b><small>RACE CLUB</small></span>
        </div>
        <div className="crossy-live"><i /> ROUND {state.round} / {TOTAL_ROUNDS}</div>
        <div className="crossy-top-actions">
          {isHost() && (
            <button className="crossy-button crossy-button-soft" onClick={returnToLobby}>
              <span aria-hidden="true">↩</span> Lobby
            </button>
          )}
          <button className="crossy-button crossy-button-leave" onClick={exit}>
            Leave <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <section className="crossy-stats" aria-label="Your race">
        <div className="crossy-stat">
          <span className="crossy-stat-icon">🏁</span>
          <span><small>ROUND WINS</small><b>{state.roundWins[selfId] ?? 0}<em> / {TOTAL_ROUNDS}</em></b></span>
        </div>
        <div className="crossy-stat-divider" />
        <div className="crossy-stat">
          <span className="crossy-stat-icon crossy-stat-record">✦</span>
          <span><small>PERSONAL BEST</small><b>{state.scores[selfId] ?? me?.best ?? 0}<em> ROWS</em></b></span>
        </div>
        <div className={`crossy-alive ${me && !me.alive ? "is-down" : ""}`}>
          <i /> {!me ? "READY" : me.alive ? "IN THE GAME" : "WIPED OUT"}
        </div>
      </section>

      <div className="crossy-layout">
        <section className="crossy-board-card">
          <div className="crossy-board-heading">
            <div><small>ROUND {state.round} OF {TOTAL_ROUNDS}</small><h1>Finish first!</h1></div>
            <div className="crossy-board-legend"><i /> SAFE <span /> TRAFFIC</div>
          </div>
          <div className="crossy-viewport">
            <div className="crossy-sun-glow" />
            <div ref={mountRef} className="crossy-canvas" aria-label="3D Crossy Race board" />
            <div className="crossy-distance" aria-live="polite">
              <span>TO FINISH</span><b>{Math.max(0, FINISH_ROW - (me?.y ?? 0))}</b>
            </div>
            {state.phase === "racing" && me && !me.alive && (
              <div className="crossy-down-banner">
                <span>💥</span><b>OOPS! BACK IN A MOMENT</b>
              </div>
            )}
            {state.phase === "intermission" && (
              <div className="crossy-round-banner">
                <span>🏆</span>
                <small>ROUND {state.round} WINNER</small>
                <b>{nameOf(state.roundWinners[0] ?? "")}</b>
                <em>ROUND {state.round + 1} STARTS IN {Math.ceil(state.intermissionTicks / (1000 / TICK_MS))}</em>
              </div>
            )}
            {state.phase === "finished" && (
              <div className="crossy-results">
                <span className="crossy-results-trophy">🏆</span>
                <small>FOUR ROUNDS · ONE CHAMPION</small>
                <h2>{state.winners.length > 1 ? "It's a tie!" : `${nameOf(state.winners[0] ?? "")} wins!`}</h2>
                <p>{state.winners.map(nameOf).join(" & ")} · {state.roundWins[state.winners[0] ?? ""] ?? 0} round wins</p>
                {isHost()
                  ? <button className="crossy-button crossy-results-button" onClick={returnToLobby}>Back to lobby</button>
                  : <em>Waiting for the host to return to the lobby…</em>}
              </div>
            )}
          </div>
          <div className="crossy-board-footer">
            <span>↑ Hop forward</span><i />
            <span>Ride the logs</span><i />
            <span>Watch the traffic!</span>
          </div>
          {state.phase === "racing" && <div className="crossy-touch-controls" aria-label="Movement controls">
            <button onClick={() => move("up")} aria-label="Hop forward">↑</button>
            <button onClick={() => move("left")} aria-label="Hop left">←</button>
            <button onClick={() => move("down")} aria-label="Hop back">↓</button>
            <button onClick={() => move("right")} aria-label="Hop right">→</button>
          </div>}
        </section>

        <aside className="crossy-side">
          <section className="crossy-leaderboard">
            <div className="crossy-panel-heading">
              <div><small>THE CREW</small><h2>Leaderboard</h2></div>
              <span>{standings.length} RACER{standings.length === 1 ? "" : "S"}</span>
            </div>
            <ol>
              {standings.map((player, index) => (
                <li key={player.id} className={player.id === selfId ? "is-self" : ""}>
                  <span className={`crossy-place place-${index + 1}`}>
                    {index === 0 ? "★" : String(index + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="crossy-player-avatar"
                    style={{ "--player-hue": hueOf(player.id) } as CSSProperties}
                  >{animalForPlayer(player.id).emoji}</span>
                  <span className="crossy-player-name">
                    <b>{player.name}{player.id === selfId && <small>YOU</small>}</b>
                    <em>{state.phase === "finished" && state.winners.includes(player.id)
                      ? "Race champion"
                      : state.phase === "intermission" && state.roundWinners.includes(player.id)
                        ? "Round winner"
                        : !player.joinedRace
                          ? "Ready to race"
                        : state.phase === "racing"
                          ? player.alive ? "On the move" : "Respawning…"
                          : "Race complete"}</em>
                  </span>
                  <span className="crossy-player-score">{player.score}<small>WINS</small><em>BEST {player.best}</em></span>
                </li>
              ))}
              {standings.length === 0 && (
                <li className="crossy-empty">Waiting for racers to join…</li>
              )}
            </ol>
          </section>
          <section className="crossy-howto">
            <div className="crossy-panel-heading">
              <div><small>QUICK TIPS</small><h2>Stay frosty</h2></div>
              <span aria-hidden="true">✦</span>
            </div>
            <p><i>01</i><span>Follow the traffic gaps. Cars move every lane at a different speed.</span></p>
            <p><i>02</i><span>Blue water is safe only while you’re standing on a log.</span></p>
            <p><i>03</i><span>Reach the finish first to win the round. Four rounds decide the champion.</span></p>
          </section>
        </aside>
      </div>
      <div className="crossy-control-hint">
        <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> to move</span>
        <span className="crossy-control-note">Your next great run starts with one brave hop.</span>
      </div>
      <ChatBox variant="game" />
    </main>
  );
}

export default CrossyRace;
