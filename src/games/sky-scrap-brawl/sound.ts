/**
 * Gun and explosion sounds, synthesised with Web Audio so there are no files to load.
 * They follow the hub's volume setting and are panned by where on the arena they happen.
 */
import { getVol } from "../../utils/sound";
import { W, type GunKey } from "./shared";

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let verb: ConvolverNode | null = null;
let shaper: Float32Array | null = null;

function audio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (!verb) {
      // open-air slapback: an exponentially decaying stereo noise impulse, a bit darker as it fades
      const len = Math.floor(ctx.sampleRate * 1.6), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let lp = 0;
        for (let i = 0; i < len; i++) {
          const k = i / len, a = 0.04 + 0.5 * k;
          lp += (Math.random() * 2 - 1 - lp) * (1 - a);
          d[i] = lp * Math.pow(1 - k, 3.2) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
        }
      }
      verb = ctx.createConvolver();
      verb.buffer = ir;
      verb.connect(ctx.destination);
    }
    if (!shaper) {
      // soft clipping: gunshots are loud enough to saturate, which gives them weight
      shaper = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; shaper[i] = Math.tanh(x * 2.4) / Math.tanh(2.4) }
    }
    return ctx;
  } catch {
    return null;
  }
}

interface Out { c: AudioContext; t: number; out: AudioNode }
/** One sound's output: saturation, master gain, stereo position and a reverb send. */
function start(x: number, gain: number, wet = 0.25, clean = false): Out | null {
  const vol = getVol();
  if (vol <= 0) return null;
  const c = audio();
  if (!c) return null;
  const drive = c.createGain(), g = c.createGain();
  g.gain.value = vol * gain;
  if (clean) drive.connect(g);
  else {
    const ws = c.createWaveShaper();
    drive.gain.value = 0.8;
    ws.curve = shaper as Float32Array<ArrayBuffer>;
    ws.oversample = "2x";
    drive.connect(ws); ws.connect(g);
  }
  let tail: AudioNode = g;
  if (c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, (x / W) * 2 - 1)) * 0.6;
    g.connect(p);
    tail = p;
  }
  tail.connect(c.destination);
  if (verb && wet > 0) { const send = c.createGain(); send.gain.value = wet; tail.connect(send); send.connect(verb) }
  return { c, t: c.currentTime, out: drive };
}

/** A burst of filtered noise with a near-instant attack: the crack and body of a shot. */
function noise(o: Out, ms: number, type: BiquadFilterType, freq: number, gain: number, delay = 0, freqTo?: number, q = 0.9) {
  const { c, out } = o, t = o.t + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + ms / 1000);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.0015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  s.connect(f); f.connect(g); g.connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + ms / 1000 + 0.02);
}

/** A pitched sweep: the thump or zap under a shot. */
function tone(o: Out, ms: number, type: OscillatorType, from: number, to: number, gain: number, delay = 0) {
  const { c, out } = o, t = o.t + delay, s = c.createOscillator(), g = c.createGain();
  s.type = type;
  s.frequency.setValueAtTime(from, t);
  s.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  s.connect(g); g.connect(out);
  s.start(t);
  s.stop(t + ms / 1000 + 0.02);
}

/** A metallic click of the gun's action: a tiny bright noise tick with a ringing ping. */
function click(o: Out, delay: number, freq = 3200, gain = 0.35) {
  noise(o, 14, "bandpass", freq, gain, delay, undefined, 4);
  tone(o, 40, "triangle", freq * 0.9, freq * 0.7, gain * 0.18, delay);
}
/** A part sliding along metal (bolt, slide, pump). */
function slide(o: Out, delay: number, ms: number, from: number, to: number, gain = 0.18) {
  noise(o, ms, "bandpass", from, gain, delay, to, 3);
}
/** The core of any gunshot: an N-wave crack, the muzzle-blast body and the low chest thump. */
function shot(o: Out, crack: number, body: [number, number, number, number], thump: [number, number, number, number]) {
  noise(o, 9, "highpass", 2600, crack); // supersonic crack / muzzle transient
  noise(o, 5, "lowpass", 9000, crack * 0.7);
  const [bms, bf, bto, bg] = body; noise(o, bms, "lowpass", bf, bg, 0.001, bto, 0.7);
  noise(o, bms * 0.5, "bandpass", bf * 0.45, bg * 0.6, 0.002, undefined, 1.2);
  const [tms, tf, tto, tg] = thump; tone(o, tms, "sine", tf, tto, tg);
}

const GUN_SOUND: Record<GunKey, (o: Out) => void> = {
  // 9mm pistol: snappy crack, short body, then the slide cycling
  popper: (o) => { shot(o, 1.1, [140, 3800, 500, 0.9], [110, 190, 50, 0.7]); click(o, 0.045, 2800, 0.15) },
  // 12-gauge pump: a big, wide blast, then "shk-chk" as the pump is racked
  boom: (o) => {
    shot(o, 1.3, [480, 3000, 180, 1.3], [320, 110, 28, 1.1]);
    noise(o, 260, "lowpass", 900, 0.5, 0.03, 120);
    slide(o, 0.42, 90, 1400, 2600, 0.3); click(o, 0.5, 2400, 0.4);
    slide(o, 0.6, 80, 2600, 1500, 0.28); click(o, 0.67, 3000, 0.45);
  },
  // SMG: a tight pop with the bolt slapping (fires ~11/s, so keep it short)
  rattler: (o) => { shot(o, 0.9, [70, 3400, 600, 0.7], [55, 160, 60, 0.45]); click(o, 0.025, 3600, 0.12) },
  // freezer: an icy energy discharge, cryo hiss and glassy shimmer
  freeze: (o) => {
    tone(o, 260, "sawtooth", 1600, 220, 0.18); tone(o, 200, "sine", 2800, 1100, 0.15, 0.02);
    noise(o, 380, "highpass", 6000, 0.3, 0, 3500); noise(o, 60, "bandpass", 1200, 0.5);
    for (let i = 0; i < 4; i++) tone(o, 90, "sine", 3500 + Math.random() * 2500, 3000, 0.05, 0.03 + i * 0.04);
  },
  // .357 revolver: a thunderous crack, then the hammer cocking back
  revolver: (o) => { shot(o, 1.4, [260, 3200, 260, 1.15], [200, 150, 38, 0.95]); click(o, 0.38, 2200, 0.25); click(o, 0.43, 3400, 0.3) },
  // bolt-action rifle: a deafening crack, a long boom rolling off the canyon, then the bolt cycling
  sniper: (o) => {
    shot(o, 1.6, [700, 2600, 140, 1.5], [480, 85, 24, 1.3]);
    noise(o, 3, "highpass", 5000, 1.2); // bullet's sonic snap
    noise(o, 700, "lowpass", 1100, 0.35, 0.25, 160); noise(o, 800, "lowpass", 800, 0.18, 0.55, 120); // canyon echoes
    click(o, 0.85, 2000, 0.3); slide(o, 0.9, 130, 1600, 3200, 0.22); // bolt up and back
    slide(o, 1.08, 110, 3200, 1700, 0.2); click(o, 1.2, 2600, 0.38); // forward and lock
  },
  // assault rifle: a sharp, punchy crack with a little bolt rattle
  rifle: (o) => { shot(o, 1.15, [130, 4200, 450, 0.85], [90, 170, 55, 0.6]); click(o, 0.035, 3800, 0.12) },
};

/** How loud each gun is overall, so rapid-fire guns don't drown out the rest. */
const LOUD: Record<GunKey, number> = { popper: 0.5, boom: 0.6, rattler: 0.3, freeze: 0.45, revolver: 0.55, sniper: 0.7, rifle: 0.4 };
/** How much each gun rings out across the arena. */
const WET: Record<GunKey, number> = { popper: 0.25, boom: 0.4, rattler: 0.14, freeze: 0.2, revolver: 0.38, sniper: 0.6, rifle: 0.22 };

/**
 * Recorded sounds: drop an audio file named after a gun into ./sounds (e.g. sounds/sniper.mp3) and it
 * replaces that gun's synthesised sound. Until the file has loaded, the synthesised one plays.
 */
const FILES = import.meta.glob("./sounds/*.{mp3,wav,ogg}", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
const URLS: Record<string, string> = {};
for (const [path, url] of Object.entries(FILES)) URLS[path.replace(/^.*\/|\.\w+$/g, "")] = url;
const clips = new Map<string, AudioBuffer | "loading" | "failed">();
/** Extra volume for recorded clips, by file name; most MP3s are already mastered loud. */
const CLIP_VOL: Record<string, number> = { sniper: 1 };

function clip(name: string, c: AudioContext): AudioBuffer | null {
  const got = clips.get(name);
  if (got instanceof AudioBuffer) return got;
  if (!got && URLS[name]) {
    clips.set(name, "loading");
    fetch(URLS[name]).then(r => r.arrayBuffer()).then(b => c.decodeAudioData(b))
      .then(buf => clips.set(name, buf), () => clips.set(name, "failed"));
  }
  return null;
}
/** Starts loading every recorded clip so the first shot doesn't fall back to the synth. */
export function preloadSounds() { const c = audio(); if (c) for (const n in URLS) clip(n, c) }

function playClip(o: Out, buf: AudioBuffer, gain: number) {
  const s = o.c.createBufferSource(), g = o.c.createGain();
  s.buffer = buf;
  s.playbackRate.value = 0.97 + Math.random() * 0.06; // slight variation so repeats don't sound identical
  g.gain.value = gain;
  s.connect(g); g.connect(o.out);
  s.start(o.t);
}

/**
 * Plays sounds/<name>.mp3 (or .wav/.ogg) if it exists and has loaded, and returns true.
 * Recorded clips already have their own room sound, so they skip the saturation and most of the reverb.
 */
function recorded(name: string, x: number, loud: number) {
  const c = audio(), buf = c && clip(name, c);
  if (!buf) return false;
  const o = start(x, loud * (CLIP_VOL[name] ?? 1), 0.05, true);
  if (o) try { playClip(o, buf, 1) } catch { /* audio unavailable */ }
  return true;
}

export function gunSound(gun: GunKey, x: number) {
  const f = GUN_SOUND[gun];
  if (!f || recorded(gun, x, LOUD[gun])) return;
  const o = start(x, LOUD[gun], WET[gun]);
  if (o) try { f(o) } catch { /* audio unavailable */ }
}

/** Grenade dropped: the pin pinging out and the spoon flipping off. File override: sounds/grenade.mp3 */
export function grenadeSound(x: number) {
  if (recorded("grenade", x, 0.5)) return;
  const o = start(x, 0.5, 0.2);
  if (!o) return;
  try {
    click(o, 0, 4200, 0.35); tone(o, 260, "sine", 5200, 5000, 0.08, 0.005); // pin pulled, ringing
    click(o, 0.12, 2600, 0.3); tone(o, 120, "triangle", 1900, 1500, 0.07, 0.12); // spoon flips off
    noise(o, 60, "bandpass", 900, 0.12, 0.14); // a soft fizz as the fuse lights
  } catch { /* audio unavailable */ }
}

/** Grenade hits a platform: a heavy metal clunk with a little bounce. File override: sounds/grenade-land.mp3 */
export function grenadeLandSound(x: number) {
  if (recorded("grenade-land", x, 0.4)) return;
  const o = start(x, 0.4, 0.15);
  if (!o) return;
  try {
    tone(o, 90, "sine", 320, 140, 0.5); noise(o, 50, "bandpass", 1800, 0.45, 0, undefined, 2); tone(o, 140, "triangle", 2300, 2100, 0.07);
    tone(o, 60, "sine", 300, 150, 0.2, 0.11); noise(o, 30, "bandpass", 2000, 0.18, 0.11, undefined, 2); // bounce
  } catch { /* audio unavailable */ }
}

/** A fighter falls off the map: a falling whistle dropping away into the canyon, then a far-off thud. File override: sounds/fall.mp3 */
export function fallSound(x: number) {
  if (recorded("fall", x, 0.55)) return;
  const o = start(x, 0.55, 0.45);
  if (!o) return;
  try {
    tone(o, 900, "sine", 1400, 300, 0.22); tone(o, 900, "sine", 1406, 302, 0.1); // whistle with a slight wobble
    noise(o, 900, "bandpass", 1200, 0.25, 0, 300, 1.5); // wind rushing past
    tone(o, 400, "sine", 90, 30, 0.6, 0.85); noise(o, 300, "lowpass", 500, 0.35, 0.85, 80); // distant impact
  } catch { /* audio unavailable */ }
}

/** Grenade explosion. File override: sounds/explosion.mp3 */
export function explosionSound(x: number) {
  if (recorded("explosion", x, 0.75)) return;
  const o = start(x, 0.75, 0.5);
  if (!o) return;
  try {
    noise(o, 1100, "lowpass", 1200, 1, 0, 120);
    tone(o, 700, "sine", 80, 22, 1);
    noise(o, 80, "highpass", 2000, 0.5);
  } catch { /* audio unavailable */ }
}

/** A wet, meaty impact when a hit draws blood. More blood (a critical hit or a grenade) sounds heavier. */
export function bloodSound(x: number, amount: number) {
  const heavy = Math.min(1, amount / 34);
  const o = start(x, 0.35 + 0.25 * heavy, 0.08);
  if (!o) return;
  try {
    tone(o, 120 + 80 * heavy, "sine", 150, 48, 0.9); // body thud
    noise(o, 140 + 90 * heavy, "lowpass", 1400, 0.8, 0, 180); // wet slap
    noise(o, 90, "bandpass", 700 + Math.random() * 300, 0.5, 0.015); // squelch
    if (heavy > 0.6) noise(o, 220, "lowpass", 900, 0.35, 0.06, 150); // splatter falling after a big hit
  } catch { /* audio unavailable */ }
}
