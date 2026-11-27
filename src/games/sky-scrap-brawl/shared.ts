/** Rules data and network shapes shared by the host simulation, the renderer and the UI. */
export const W = 960, H = 540, LIVES = 10, INK = '#140e26';

export type GunKey = 'popper' | 'boom' | 'rattler' | 'freeze' | 'revolver' | 'sniper' | 'rifle';
export interface Gun { name: string; cd: number; push: number; speed: number; n: number; spread: number; jit?: number; life: number; recoil: number; ammo: number; crit?: number }
export const GUNS: Record<GunKey, Gun> = {
  popper: { name: 'Popper', cd: .28, push: 340, speed: 760, n: 1, spread: 0, life: 1.2, recoil: 15, ammo: Infinity },
  boom: { name: 'Boomstick', cd: .8, push: 250, speed: 680, n: 5, spread: 210, life: .37, recoil: 260, ammo: 10 },
  rattler: { name: 'Rattler', cd: .09, push: 90, speed: 900, n: 1, spread: 0, jit: 70, life: .8, recoil: 30, ammo: 30 },
  freeze: { name: 'Freezer', cd: 1.1, push: 80, speed: 620, n: 1, spread: 0, life: 1.2, recoil: 60, ammo: 3 },
  revolver: { name: 'Revolver', cd: .55, push: 380, speed: 1000, n: 1, spread: 0, life: .9, recoil: 90, ammo: 6, crit: 1 },
  sniper: { name: 'Sniper', cd: 1.2, push: 520, speed: 1700, n: 1, spread: 0, life: .8, recoil: 640, ammo: 10, crit: 1 },
  rifle: { name: 'Rifle', cd: .12, push: 150, speed: 1050, n: 1, spread: 0, jit: 40, life: .8, recoil: 40, ammo: 25, crit: .2 },
};
export const GUN_KEYS = Object.keys(GUNS) as GunKey[];
export const NADE = { n: 3, fuse: 1.5, cd: .6, push: 1000, lift: 620 };
export const GRAV = 900, BLAST = 150, SHIELD = 4, FREEZE = 2.5, JUMP = 690, JUMP2 = 640, TOUCH = 30, PWN = 90, ONETAP = .15, ONETAP_SNIPER = .85, FLY = 1600;
export const POOL: GunKey[] = ['boom', 'rattler', 'freeze', 'revolver', 'sniper', 'rifle'];
/** Bot approach distance and firing range per gun. */
export const AP: Record<string, number> = { boom: 180, rattler: 220, freeze: 300, revolver: 300, sniper: 450, rifle: 260 };
export const FR: Record<string, number> = { boom: 245, rattler: 420, freeze: 520, revolver: 450, sniper: 700, rifle: 480 };
/** Muzzle offset per gun. */
export const MZ: Record<GunKey, number> = { popper: 36, boom: 49, rattler: 40, freeze: 48, revolver: 45, sniper: 72, rifle: 55 };

export interface Plat { x: number; y: number; w: number; h: number; solid?: boolean }
export interface MapDef {
  name: string; plats: Plat[]; spawns: [number, number][];
  poles?: [number, number, number][];
  look?: { deck: string; top: string; peg: string; pole: string; stripe: string };
  terrain?: boolean;
}
const GROW = 25; // extra width on each side of every platform
const F = (x: number, y: number, w: number): Plat => ({ x: x - GROW, y, w: w + GROW * 2, h: 12 });
export const MAPS: MapDef[] = [
  {
    name: 'Timber Canyon',
    plats: [F(130, 125, 700), F(40, 192, 290), F(630, 192, 290), F(285, 259, 390), F(30, 326, 290), F(640, 326, 290), F(250, 393, 460), F(70, 455, 290), F(600, 455, 290)],
    poles: [[160, 125, 470], [300, 125, 470], [660, 125, 470], [800, 125, 470], [420, 259, 393], [540, 259, 393]],
    spawns: [[230, 125], [730, 125], [160, 326], [800, 326], [480, 259], [480, 393]],
    look: { deck: '#8a5426', top: '#c58a45', peg: '#6b3f1d', pole: '#c9a24a', stripe: '#5a3416' },
  },
  {
    name: 'Frost Peaks', terrain: true,
    // stepped ice shelves, listed top to bottom; the base shelf cannot be dropped through
    plats: [F(150, 170, 250), F(110, 245, 450), F(80, 320, 640), { ...F(55, 400, 850), solid: true }],
    spawns: [[230, 170], [480, 245], [640, 320], [840, 400], [250, 320], [480, 400]],
  },
];
/** The six fighter slots. Players take slots in join order. */
export const ROSTER: [string, string][] = [['Bolt', '#ff8a2b'], ['Mochi', '#ff6fa8'], ['Tank', '#6cc24a'], ['Nova', '#45b8e8'], ['Rex', '#a46bff'], ['Sunny', '#ffd23f']];
export const MAX_FIGHTERS = ROSTER.length;

export type SkillKey = 'jet' | 'spd' | 'clone' | 'ghost' | 'shield';
export const SK: SkillKey[] = ['jet', 'spd', 'clone', 'ghost', 'shield'];
export const SKI: Record<SkillKey, [string, string, string]> = { jet: ['Jetpack', '#ff7a2e', 'J'], spd: ['Speed', '#3de0ff', 'S'], clone: ['Clone', '#7dff6a', 'C'], ghost: ['Ghost', '#d9b8ff', 'G'], shield: ['Shield', '#5b8cff', 'H'] };

/** Held keys travel as bits; one-shot presses travel as separate bits so a quick tap is never lost between ticks. */
export const KEY = { left: 1, right: 2, down: 4, jump: 8, fire: 16 } as const;
export const PRESS = { jump: 1, fire: 2, nade: 4 } as const;

// ---- Network snapshot shapes (short keys keep each 20 Hz snapshot small) ----
/** A fighter. `u` is a stable id for the match; slots 0-5 come first, live clones after. */
export interface PSnap {
  u: number; r: number; id: string | null; x: number; y: number; vx: number; f: 1 | -1; l: number;
  g: GunKey; a: number; n: number; w: number; s: 0 | 1; c: 0 | 1; fl: 0 | 1; th: 0 | 1; gr: 0 | 1; wk: number;
  ice: number; ia: number; jet: number; sp: 0 | 1; gh: number; sh: number;
  /** kos, falls, shots, hits, best combo, time knocked out (-1 = still in) */
  st: number[];
}
export interface BSnap { i: number; x: number; y: number; vx: number; vy: number; k: GunKey | 'grenade'; c: 0 | 1; l: number; a: number }
export interface CSnap { i: number; x: number; y: number; to: number; ld: 0 | 1; g: GunKey; sw: number; bt: number }
export interface SSnap { i: number; x: number; y: number; k: SkillKey; l: number; ph: number; a: number }
/** A cosmetic event: [id, type, ...args]. Clients replay each id once to build particles locally. */
export type Ev = (string | number)[];
export interface MatchSnap { mid: number; m: number; t: number; win: number; over: boolean; P: PSnap[]; B: BSnap[]; C: CSnap[]; S: SSnap[]; E: Ev[] }
export interface BrawlState {
  ph: 'wait' | 'play' | 'over';
  /** Players who have opened the game, in join order. */
  j: string[];
  mt?: MatchSnap;
}
