/**
 * Gun and explosion sounds, synthesised with Web Audio so there are no files to load.
 * They follow the hub's volume setting and are panned by where on the arena they happen.
 */
import { getVol } from "../../utils/sound";
import { W, type GunKey } from "./shared";

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;

function audio() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  } catch {
    return null;
  }
}

interface Out { c: AudioContext; t: number; out: AudioNode }
/** One sound's output: master gain and stereo position. */
function start(x: number, gain: number): Out | null {
  const vol = getVol();
  if (vol <= 0) return null;
  const c = audio();
  if (!c) return null;
  const g = c.createGain();
  g.gain.value = vol * gain;
  const out: AudioNode = g;
  if (c.createStereoPanner) {
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, (x / W) * 2 - 1)) * 0.6;
    g.connect(p);
    p.connect(c.destination);
  } else g.connect(c.destination);
  return { c, t: c.currentTime, out };
}

/** A burst of filtered noise: the crack and body of a shot. */
function noise(o: Out, ms: number, type: BiquadFilterType, freq: number, gain: number, delay = 0, freqTo?: number) {
  const { c, out } = o, t = o.t + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + ms / 1000);
  g.gain.setValueAtTime(gain, t);
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

const GUN_SOUND: Record<GunKey, (o: Out) => void> = {
  // pistol: a clear crack with a short low punch
  popper: (o) => { noise(o, 120, "bandpass", 1700, 0.9); tone(o, 110, "sine", 210, 55, 0.6); noise(o, 35, "highpass", 4200, 0.45); tone(o, 50, "square", 520, 200, 0.1) },
  // shotgun: a wide, heavy blast with a low boom
  boom: (o) => { noise(o, 320, "lowpass", 2600, 1, 0, 300); tone(o, 220, "sine", 130, 38, 0.9); noise(o, 60, "highpass", 3000, 0.4) },
  // SMG: tiny, quick ticks (it fires about 11 times a second)
  rattler: (o) => { noise(o, 45, "bandpass", 1900, 0.55); tone(o, 35, "square", 900, 350, 0.12) },
  // freezer: an icy zap with a glassy shimmer
  freeze: (o) => { tone(o, 260, "triangle", 1800, 260, 0.35); tone(o, 180, "sine", 2600, 1200, 0.15, 0.02); noise(o, 220, "bandpass", 5200, 0.25) },
  // revolver: a sharp crack and a solid thump
  revolver: (o) => { noise(o, 160, "bandpass", 1300, 1); tone(o, 160, "sine", 170, 45, 0.8); noise(o, 40, "highpass", 4000, 0.5) },
  // sniper: a huge crack with an echo rolling off the canyon
  sniper: (o) => {
    noise(o, 450, "lowpass", 4200, 1.1, 0, 400); tone(o, 320, "sine", 110, 30, 1); noise(o, 50, "highpass", 4500, 0.7);
    noise(o, 500, "lowpass", 1400, 0.25, 0.22, 200); noise(o, 500, "lowpass", 1000, 0.12, 0.45, 150);
  },
  // rifle: a tight, punchy crack
  rifle: (o) => { noise(o, 90, "bandpass", 2300, 0.8); tone(o, 70, "square", 320, 110, 0.18); noise(o, 30, "highpass", 4500, 0.4) },
};

/** How loud each gun is overall, so rapid-fire guns don't drown out the rest. */
const LOUD: Record<GunKey, number> = { popper: 0.5, boom: 0.6, rattler: 0.3, freeze: 0.45, revolver: 0.55, sniper: 0.7, rifle: 0.4 };

export function gunSound(gun: GunKey, x: number) {
  const f = GUN_SOUND[gun];
  if (!f) return;
  const o = start(x, LOUD[gun]);
  if (o) try { f(o) } catch { /* audio unavailable */ }
}

export function explosionSound(x: number) {
  const o = start(x, 0.75);
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
  const o = start(x, 0.35 + 0.25 * heavy);
  if (!o) return;
  try {
    tone(o, 120 + 80 * heavy, "sine", 150, 48, 0.9); // body thud
    noise(o, 140 + 90 * heavy, "lowpass", 1400, 0.8, 0, 180); // wet slap
    noise(o, 90, "bandpass", 700 + Math.random() * 300, 0.5, 0.015); // squelch
    if (heavy > 0.6) noise(o, 220, "lowpass", 900, 0.35, 0.06, 150); // splatter falling after a big hit
  } catch { /* audio unavailable */ }
}
