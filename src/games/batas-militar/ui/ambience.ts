/** Procedural ambient sound per map (wind, cave rumble, factory hum…). No audio files needed. */
import type { AudioConfiguration } from "../maps";

let ac: AudioContext | null = null;
let current: { stop: () => void } | null = null;

function noise(ctx: AudioContext) {
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } // brown noise
  const src = ctx.createBufferSource();
  src.buffer = buf; src.loop = true;
  return src;
}

/** Starts (or switches) the ambience. Call it from a user gesture the first time, or browsers keep it muted. */
export function playAmbience(cfg: AudioConfiguration | null, volume: number) {
  current?.stop();
  current = null;
  if (!cfg || volume <= 0) return;
  try {
    ac ??= new AudioContext();
    if (ac.state === "suspended") void ac.resume();
  } catch { return; }
  const ctx = ac, out = ctx.createGain();
  out.gain.value = 0;
  out.gain.linearRampToValueAtTime(cfg.volume * volume * 0.5, ctx.currentTime + 1.5);
  out.connect(ctx.destination);
  const nodes: AudioScheduledSourceNode[] = [];
  const src = noise(ctx), filt = ctx.createBiquadFilter();
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  filt.type = cfg.ambience === "cave" || cfg.ambience === "industrial" ? "lowpass" : "bandpass";
  filt.frequency.value = { forest: 500, cave: 180, wind: 420, industrial: 140, jungle: 900 }[cfg.ambience];
  filt.Q.value = cfg.ambience === "wind" ? 0.7 : 0.4;
  lfo.frequency.value = 0.08; lfoGain.gain.value = filt.frequency.value * 0.5;
  lfo.connect(lfoGain).connect(filt.frequency);
  src.connect(filt).connect(out);
  nodes.push(src, lfo);
  if (cfg.ambience === "industrial") {
    const hum = ctx.createOscillator(), hg = ctx.createGain();
    hum.type = "sawtooth"; hum.frequency.value = 55; hg.gain.value = 0.05;
    hum.connect(hg).connect(out); nodes.push(hum);
  }
  for (const n of nodes) n.start();
  // Occasional chirps (forest, jungle) or drips (cave).
  let timer = 0;
  const blip = () => {
    if (cfg.ambience === "forest" || cfg.ambience === "jungle" || cfg.ambience === "cave") {
      const o = ctx.createOscillator(), gn = ctx.createGain(), t = ctx.currentTime;
      const cave = cfg.ambience === "cave";
      const f = cave ? 900 + Math.random() * 400 : 2200 + Math.random() * 1600;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(cave ? f * 0.5 : f * 1.3, t + (cave ? 0.12 : 0.08));
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(cave ? 0.12 : 0.05, t + 0.01);
      gn.gain.exponentialRampToValueAtTime(0.0001, t + (cave ? 0.25 : 0.12));
      o.connect(gn).connect(out); o.start(t); o.stop(t + 0.3);
    }
    timer = window.setTimeout(blip, 1500 + Math.random() * 4000);
  };
  timer = window.setTimeout(blip, 2000);
  current = {
    stop() {
      clearTimeout(timer);
      const t = ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 0.4);
      for (const n of nodes) n.stop(t + 0.5);
      setTimeout(() => out.disconnect(), 600);
    },
  };
}

export const stopAmbience = () => playAmbience(null, 0);
