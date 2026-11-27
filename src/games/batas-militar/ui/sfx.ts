/**
 * Weapon and combat sounds. Recordings in ../sounds: sniper, explosion, the rocket launcher (bazooka)
 * and splatter (deaths) are used as-is; see ALIASES for files that keep their own names. Each gun has its own synthesised shot (noise crack + low body thump +
 * mechanical clicks, saturated and sent through a short outdoor reverb). Drop a recording into
 * ../sounds named after the sound (sniper.mp3, explosion.mp3, rifle.mp3, shotgun.mp3, smg.mp3,
 * laser.mp3, bazooka.mp3, reload.mp3, pickup.mp3) and it replaces the synthesised version.
 * Sounds follow the hub's volume setting, get quieter with distance and are panned by position.
 */
import { getVol } from "../../../utils/sound";
import { BAZOOKA, LASER, PISTOL, RIFLE, SHOTGUN, SMG, SNIPER } from "..";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let verb: ConvolverNode | null = null;
let noise: AudioBuffer | null = null;
let curve: Float32Array<ArrayBuffer> | null = null;
let muted = false;

const FILES = import.meta.glob("../sounds/*.{mp3,wav,ogg}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const buffers = new Map<string, AudioBuffer>();
let loading = false;

function audio(): AudioContext | null {
  if (muted || getVol() <= 0) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch { return null; }
  const c = ctx;
  if (!master) {
    master = c.createGain();
    const comp = c.createDynamicsCompressor(); // keeps a firefight from clipping
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.002; comp.release.value = 0.2;
    master.connect(comp).connect(c.destination);
  }
  master.gain.value = getVol() * 0.9;
  if (!noise) {
    noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (!verb) {
    // Outdoor slapback: decaying stereo noise that darkens as it fades.
    const len = Math.floor(c.sampleRate * 1.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const k = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (0.95 - 0.6 * k);
        d[i] = lp * Math.pow(1 - k, 3) * Math.min(1, i / (c.sampleRate * 0.01));
      }
    }
    verb = c.createConvolver();
    verb.buffer = ir;
    verb.connect(master);
  }
  if (!curve) {
    curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 3) / Math.tanh(3); }
  }
  if (!loading) {
    loading = true;
    for (const [path, url] of Object.entries(FILES)) {
      const name = path.split("/").pop()!.replace(/\.\w+$/, "");
      fetch(url).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).then((buf) => buffers.set(name, buf)).catch(() => {});
    }
  }
  return c;
}

/** Where a sound happens, relative to the listener: dx in world px, distance. */
export interface Place { dx: number; dist: number }
const HERE: Place = { dx: 0, dist: 0 };

/** A per-sound output: saturation → pan → dry + reverb send, scaled by distance. */
function voice(c: AudioContext, at: Place, gain: number, wet = 0.25) {
  const fall = Math.max(0.06, 1 - at.dist / 1500);
  const out = c.createGain();
  out.gain.value = gain * fall * fall;
  const sat = c.createWaveShaper();
  sat.curve = curve;
  const pan = c.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, at.dx / 700));
  out.connect(sat).connect(pan);
  pan.connect(master!);
  const send = c.createGain();
  send.gain.value = wet + (1 - fall) * 0.35; // far shots are mostly echo
  pan.connect(send).connect(verb!);
  return out;
}

/** Recordings that stand in for a sound, first match wins (so a file can keep its original name). */
const ALIASES: Record<string, string[]> = {
  pistol: ["pistol", "powerful-pistol-9-mm"],
  rifle: ["rifle", "renetti_fire_npc_01"],
  bazooka: ["bazooka", "gta-san-andreas-rocket-launcher-sound"],
  gore: ["gore", "splatter"],
  equip: ["equip", "cs-equip-sound"],
  headshot: ["headshot", "cs-go-headshot-sound"],
  helmet: ["helmet", "bhit_helmet-1"],
};

function file(name: string, at: Place, gain: number, wet = 0.2) {
  const c = ctx;
  let buf: AudioBuffer | undefined;
  for (const n of ALIASES[name] ?? [name]) if ((buf = buffers.get(n))) break;
  if (!buf || !c) return false;
  const src = c.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = 0.96 + Math.random() * 0.08;
  src.connect(voice(c, at, gain, wet));
  src.start();
  return true;
}

/** Filtered noise burst with an exponential decay. */
function burst(c: AudioContext, out: AudioNode, t: number, o: { type: BiquadFilterType; f: number; f2?: number; q?: number; dur: number; gain: number; attack?: number }) {
  const src = c.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const flt = c.createBiquadFilter();
  flt.type = o.type; flt.frequency.setValueAtTime(o.f, t); flt.Q.value = o.q ?? 0.8;
  if (o.f2) flt.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.gain, t + (o.attack ?? 0.002));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(flt).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + o.dur + 0.05);
}

/** Pitched sweep: the low "body" of a shot, or a sci-fi zap. */
function sweep(c: AudioContext, out: AudioNode, t: number, o: { type?: OscillatorType; f: number; f2: number; dur: number; gain: number }) {
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.f, t);
  osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
  g.gain.setValueAtTime(o.gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(out);
  osc.start(t); osc.stop(t + o.dur + 0.02);
}

/** Metal-on-metal click (bolts, magazines, pumps). */
function click(c: AudioContext, out: AudioNode, t: number, f = 2400, gain = 0.35) {
  burst(c, out, t, { type: "bandpass", f, q: 6, dur: 0.035, gain });
  sweep(c, out, t, { type: "triangle", f: f * 0.5, f2: f * 0.3, dur: 0.03, gain: gain * 0.4 });
}

const SHOT_NAMES: Record<number, string> = { [PISTOL]: "pistol", [RIFLE]: "rifle", [SHOTGUN]: "shotgun", [SMG]: "smg", [SNIPER]: "sniper", [LASER]: "laser", [BAZOOKA]: "bazooka" };

export function shot(w: number, at: Place = HERE) {
  const c = audio();
  if (!c) return;
  if (file(SHOT_NAMES[w] ?? "", at, w === SNIPER || w === BAZOOKA ? 1 : 0.8, w === SNIPER ? 0.35 : 0.2)) return;
  const t = c.currentTime;
  switch (w) {
    case PISTOL: {
      const o = voice(c, at, 0.5, 0.2);
      burst(c, o, t, { type: "highpass", f: 1800, dur: 0.06, gain: 1 });
      burst(c, o, t, { type: "bandpass", f: 1100, q: 1.3, dur: 0.1, gain: 0.6 });
      sweep(c, o, t, { f: 200, f2: 60, dur: 0.1, gain: 0.8 });
      click(c, o, t + 0.05, 3000, 0.15); // slide cycling
      break;
    }
    case RIFLE: {
      const o = voice(c, at, 0.55, 0.22);
      burst(c, o, t, { type: "highpass", f: 1400, dur: 0.07, gain: 1 });
      burst(c, o, t, { type: "bandpass", f: 900, q: 1.2, dur: 0.12, gain: 0.7 });
      sweep(c, o, t, { f: 170, f2: 48, dur: 0.13, gain: 0.9 });
      click(c, o, t + 0.035, 3200, 0.12);
      break;
    }
    case SMG: {
      const o = voice(c, at, 0.4, 0.15);
      burst(c, o, t, { type: "highpass", f: 2000, dur: 0.045, gain: 0.9 });
      burst(c, o, t, { type: "bandpass", f: 1300, q: 1.4, dur: 0.06, gain: 0.6 });
      sweep(c, o, t, { f: 240, f2: 90, dur: 0.06, gain: 0.6 });
      break;
    }
    case SHOTGUN: {
      const o = voice(c, at, 0.7, 0.3);
      burst(c, o, t, { type: "lowpass", f: 5000, f2: 600, dur: 0.32, gain: 1 });
      burst(c, o, t, { type: "highpass", f: 1800, dur: 0.06, gain: 0.8 });
      sweep(c, o, t, { f: 120, f2: 32, dur: 0.3, gain: 1 });
      // Pump action: back, then forward.
      click(c, o, t + 0.34, 1500, 0.3); burst(c, o, t + 0.36, { type: "bandpass", f: 700, q: 2, dur: 0.06, gain: 0.25 });
      click(c, o, t + 0.47, 1900, 0.35);
      break;
    }
    case SNIPER: {
      const o = voice(c, at, 0.85, 0.45);
      burst(c, o, t, { type: "highpass", f: 2600, dur: 0.1, gain: 1 });
      burst(c, o, t, { type: "lowpass", f: 3000, f2: 300, dur: 0.6, gain: 0.8 });
      sweep(c, o, t, { f: 95, f2: 28, dur: 0.55, gain: 1 });
      // Bolt cycle.
      click(c, o, t + 0.6, 1300, 0.3); click(c, o, t + 0.72, 1800, 0.3); click(c, o, t + 0.86, 2200, 0.35);
      break;
    }
    case LASER: {
      const o = voice(c, at, 0.28, 0.3);
      sweep(c, o, t, { type: "sawtooth", f: 2200, f2: 260, dur: 0.16, gain: 0.5 });
      sweep(c, o, t, { type: "square", f: 3300, f2: 900, dur: 0.1, gain: 0.25 });
      sweep(c, o, t, { type: "sine", f: 140, f2: 70, dur: 0.12, gain: 0.5 });
      burst(c, o, t, { type: "bandpass", f: 5000, q: 3, dur: 0.05, gain: 0.3 });
      break;
    }
    case BAZOOKA: {
      const o = voice(c, at, 0.75, 0.35);
      sweep(c, o, t, { f: 90, f2: 35, dur: 0.35, gain: 1 });
      burst(c, o, t, { type: "lowpass", f: 2200, f2: 400, dur: 0.25, gain: 1 });
      burst(c, o, t + 0.04, { type: "bandpass", f: 500, f2: 1600, q: 0.9, dur: 0.7, gain: 0.5, attack: 0.08 }); // rocket motor whoosh
      break;
    }
  }
}

export function explosion(at: Place = HERE) {
  const c = audio();
  if (!c || file("explosion", at, 1, 0.3)) return;
  const t = c.currentTime, o = voice(c, at, 1, 0.45);
  sweep(c, o, t, { f: 70, f2: 22, dur: 1.1, gain: 1 });
  burst(c, o, t, { type: "lowpass", f: 3200, f2: 120, dur: 1.4, gain: 1 });
  burst(c, o, t, { type: "highpass", f: 1500, dur: 0.12, gain: 0.7 });
  for (let i = 0; i < 6; i++) burst(c, o, t + 0.15 + Math.random() * 0.6, { type: "bandpass", f: 2500 + Math.random() * 2500, q: 4, dur: 0.05, gain: 0.12 }); // debris
}

export function reload() {
  const c = audio();
  if (!c || file("reload", HERE, 0.7)) return;
  const t = c.currentTime, o = voice(c, HERE, 0.5, 0.08);
  click(c, o, t + 0.05, 1200, 0.35); // mag release
  burst(c, o, t + 0.12, { type: "bandpass", f: 600, q: 2, dur: 0.08, gain: 0.2 }); // mag slides out
  click(c, o, t + 0.75, 1600, 0.45); // new mag seats
  click(c, o, t + 1.15, 2100, 0.35); click(c, o, t + 1.27, 2600, 0.4); // charging handle
}

export function pickup(at: Place = HERE) {
  const c = audio();
  if (!c || file("pickup", at, 0.7)) return;
  const t = c.currentTime, o = voice(c, at, 0.45, 0.1);
  click(c, o, t, 1800, 0.4); click(c, o, t + 0.09, 2500, 0.45);
  sweep(c, o, t + 0.05, { type: "triangle", f: 880, f2: 1320, dur: 0.12, gain: 0.25 });
}

/** Picking up a gun or switching weapons. */
export function swap() {
  const c = audio();
  if (!c || file("equip", HERE, 0.8, 0.05)) return;
  const t = c.currentTime, o = voice(c, HERE, 0.35, 0.05);
  burst(c, o, t, { type: "bandpass", f: 900, q: 1.5, dur: 0.07, gain: 0.3 });
  click(c, o, t + 0.08, 2200, 0.35);
}

export function empty() {
  const c = audio();
  if (!c) return;
  click(c, voice(c, HERE, 0.35, 0.05), c.currentTime, 3000, 0.4);
}

/** Confirms your shot landed: a short, dry tick. */
export function hitConfirm(head = false) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime, o = voice(c, HERE, 0.22, 0);
  sweep(c, o, t, { type: "square", f: head ? 2400 : 1700, f2: head ? 2000 : 1400, dur: 0.045, gain: 0.5 });
}

let lastHeadshot = 0;
/** You landed a headshot: the headshot ding layered over a helmet impact. */
export function headshot() {
  const c = audio();
  if (!c) return;
  const now = performance.now();
  if (now - lastHeadshot < 250) return; // the laser can headshot every tick
  lastHeadshot = now;
  const a = file("headshot", HERE, 0.9, 0.05), b = file("helmet", HERE, 0.7, 0.05);
  if (!a && !b) hitConfirm(true);
}

/** You took a headshot: the helmet ringing. */
export function helmetHit() {
  const c = audio();
  if (!c) return;
  const now = performance.now();
  if (now - lastHeadshot < 250) return;
  lastHeadshot = now;
  if (!file("helmet", HERE, 0.8, 0.05)) hurt();
}

export function hurt() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime, o = voice(c, HERE, 0.5, 0.05);
  sweep(c, o, t, { f: 140, f2: 55, dur: 0.16, gain: 0.8 });
  burst(c, o, t, { type: "lowpass", f: 900, dur: 0.1, gain: 0.5 });
}

export function throwNade(at: Place = HERE) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime, o = voice(c, at, 0.35, 0.1);
  click(c, o, t, 3400, 0.3); // pin
  burst(c, o, t + 0.05, { type: "bandpass", f: 700, f2: 1800, q: 1, dur: 0.2, gain: 0.25, attack: 0.05 });
}

export function dash(at: Place = HERE) {
  const c = audio();
  if (!c) return;
  const t = c.currentTime, o = voice(c, at, 0.45, 0.12);
  burst(c, o, t, { type: "bandpass", f: 400, f2: 2600, q: 1.2, dur: 0.22, gain: 0.7, attack: 0.02 });
  sweep(c, o, t, { type: "sine", f: 180, f2: 70, dur: 0.15, gain: 0.4 });
}

/** Continuous laser hum, one per shooter. Call every tick with whether they're firing. */
const hums = new Map<string, { out: GainNode; pan: StereoPannerNode; stop: () => void }>();
export function laserHum(id: string, on: boolean, at: Place = HERE) {
  const c = on ? audio() : ctx;
  let h = hums.get(id);
  if (!on || !c) {
    if (h) { h.stop(); hums.delete(id); }
    return;
  }
  const fall = Math.max(0.06, 1 - at.dist / 1500);
  if (!h) {
    const out = c.createGain(), pan = c.createStereoPanner(), flt = c.createBiquadFilter();
    flt.type = "bandpass"; flt.frequency.value = 1600; flt.Q.value = 1.4;
    const a = c.createOscillator(), b = c.createOscillator(), sub = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain();
    a.type = "sawtooth"; a.frequency.value = 330;
    b.type = "square"; b.frequency.value = 497;
    sub.type = "sine"; sub.frequency.value = 82;
    lfo.frequency.value = 28; lg.gain.value = 40; // fast warble
    lfo.connect(lg); lg.connect(a.frequency); lg.connect(b.frequency);
    const mixA = c.createGain(); mixA.gain.value = 0.35;
    const mixB = c.createGain(); mixB.gain.value = 0.15;
    const mixS = c.createGain(); mixS.gain.value = 0.5;
    a.connect(mixA).connect(flt); b.connect(mixB).connect(flt); sub.connect(mixS).connect(out);
    flt.connect(out);
    out.gain.value = 0;
    out.connect(pan).connect(master!);
    const send = c.createGain(); send.gain.value = 0.2; pan.connect(send).connect(verb!);
    const oscs = [a, b, sub, lfo];
    for (const o of oscs) o.start();
    h = {
      out, pan,
      stop() {
        const t = c.currentTime;
        out.gain.cancelScheduledValues(t); out.gain.setTargetAtTime(0, t, 0.03);
        for (const o of oscs) o.stop(t + 0.2);
        setTimeout(() => pan.disconnect(), 400);
      },
    };
    hums.set(id, h);
  }
  h.out.gain.setTargetAtTime(0.32 * fall * fall, c.currentTime, 0.02);
  h.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, at.dx / 700)), c.currentTime, 0.05);
}
export function stopHums() { for (const [id] of hums) laserHum(id, false); }

export function gore(at: Place = HERE) {
  const c = audio();
  if (!c || file("gore", at, 0.9, 0.15)) return;
  const t = c.currentTime, o = voice(c, at, 0.6, 0.15);
  burst(c, o, t, { type: "lowpass", f: 1400, f2: 200, dur: 0.35, gain: 1 });
  sweep(c, o, t, { f: 120, f2: 40, dur: 0.25, gain: 0.8 });
  for (let i = 0; i < 4; i++) burst(c, o, t + 0.25 + Math.random() * 0.5, { type: "bandpass", f: 300 + Math.random() * 300, q: 3, dur: 0.06, gain: 0.25 }); // pieces landing
}

/** You got a kill: a bright two-note confirmation. */
export function killConfirm() {
  const c = audio();
  if (!c) return;
  const t = c.currentTime, o = voice(c, HERE, 0.3, 0.1);
  sweep(c, o, t, { type: "triangle", f: 1320, f2: 1300, dur: 0.12, gain: 0.6 });
  sweep(c, o, t + 0.09, { type: "triangle", f: 1980, f2: 1960, dur: 0.22, gain: 0.6 });
}

export function setSfxMuted(m: boolean) { muted = m; if (m) stopHums(); }
