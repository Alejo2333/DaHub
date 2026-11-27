import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { RANDOM_MAP, VOTE_TICKS, type MilAction, type MilState } from "..";
import { MAPS, type MapDefinition } from "../maps";
import { EnvRenderer, mapThumbnail } from "./env";

/** A live, slowly panning view of the map, rendered by the same environment renderer as the game. */
function MapPreview({ map }: { map: MapDefinition }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current, g = cv?.getContext("2d");
    if (!cv || !g) return;
    const env = new EnvRenderer(map, "preview");
    let raf = 0, last = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      const t = now / 1000, z = Math.max(w / (map.w * 0.62), h / (map.h * 0.75));
      const hw = w / 2 / z, hh = h / 2 / z;
      const cx = map.w / 2 + Math.sin(t * 0.12) * Math.max(0, map.w / 2 - hw);
      const cy = Math.min(map.h - hh, Math.max(hh, map.h * 0.62 + Math.sin(t * 0.09) * map.h * 0.12));
      const v = { cx, cy, z, w, h, dpr };
      env.drawBack(g, v, t);
      env.drawFront(g, v, t, now - last, []);
      last = now;
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); env.dispose(); };
  }, [map]);
  return <canvas ref={ref} style={{ width: "100%", aspectRatio: "16 / 8", display: "block", borderRadius: 10, background: "#0d1424" }} />;
}

const chip: CSSProperties = { fontSize: 12, padding: "2px 8px", borderRadius: 999, background: "#ffffff1a", whiteSpace: "nowrap" };

export default function MapSelect({ state, name, host, selfId, send, playerIds }: {
  state: MilState;
  name: (id: string) => string;
  host: boolean;
  selfId: string;
  send: (a: MilAction) => void;
  playerIds: string[];
}) {
  const mine = state.votes[selfId];
  const [focus, setFocus] = useState(() => (mine !== undefined && mine >= 0 ? mine : state.m));
  const [thumbs, setThumbs] = useState<string[]>([]);
  const map = MAPS[focus] ?? MAPS[0]!;
  // Preload every thumbnail once (they are cached for the rest of the session).
  useEffect(() => {
    const id = setTimeout(() => setThumbs(MAPS.map((m) => mapThumbnail(m))), 30);
    return () => clearTimeout(id);
  }, []);
  const counts = useMemo(() => {
    const c = new Map<number, number>();
    for (const v of Object.values(state.votes)) c.set(v, (c.get(v) ?? 0) + 1);
    return c;
  }, [state.votes]);
  const lead = Math.max(0, ...counts.values());
  const secs = Math.ceil(state.vt / 30);
  const step = (d: number) => setFocus((f) => (f + d + MAPS.length) % MAPS.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.("input,textarea,[contenteditable]")) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Enter") send({ t: "VOTE", m: focus });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div style={{ display: "grid", gap: 14, width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ margin: 0 }}>Choose the battlefield</h2>
        <div style={{ fontSize: 14, opacity: 0.85 }}>
          Starting in <b>{secs}s</b>
          <div style={{ height: 4, width: 160, background: "#ffffff22", borderRadius: 2, marginTop: 4 }}>
            <div style={{ height: "100%", width: `${(100 * state.vt) / VOTE_TICKS}%`, background: "#ffb703", borderRadius: 2, transition: "width .2s linear" }} />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(220px, 2fr)", gap: 14 }} className="map-select-grid">
        <div style={{ position: "relative" }}>
          <MapPreview map={map} />
          <button type="button" className="btn-ghost" aria-label="Previous map" onClick={() => step(-1)}
            style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 22, padding: "4px 12px", background: "#0008" }}>‹</button>
          <button type="button" className="btn-ghost" aria-label="Next map" onClick={() => step(1)}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 22, padding: "4px 12px", background: "#0008" }}>›</button>
        </div>
        <div style={{ display: "grid", gap: 8, alignContent: "start" }}>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{map.name}</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={chip}>{map.theme.name}</span>
            <span style={chip}>{map.size}</span>
            <span style={chip}>{map.players} players</span>
            {map.modes.map((m) => <span key={m} style={chip}>{m}</span>)}
          </div>
          <p style={{ margin: 0, opacity: 0.85, lineHeight: 1.4 }}>{map.description}</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
            <button type="button" className={mine === focus ? "btn-primary" : "btn-ghost"} onClick={() => send({ t: "VOTE", m: focus })}>
              {mine === focus ? "✓ Your vote" : "Vote for this map"}
            </button>
            <button type="button" className={mine === RANDOM_MAP ? "btn-primary" : "btn-ghost"} onClick={() => send({ t: "VOTE", m: RANDOM_MAP })}>
              🎲 Random {counts.get(RANDOM_MAP) ? `(${counts.get(RANDOM_MAP)})` : ""}
            </button>
          </div>
          {host && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", borderTop: "1px solid #ffffff22", paddingTop: 8 }}>
              <span style={{ fontSize: 12, opacity: 0.7, width: "100%" }}>Host controls</span>
              <button type="button" className="btn-primary" onClick={() => send({ t: "START", m: focus })}>Play {map.name} now</button>
              <button type="button" className="btn-ghost" onClick={() => send({ t: "START" })}>Start with votes</button>
            </div>
          )}
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, opacity: 0.85 }}>
            {playerIds.map((id) => {
              const v = state.votes[id];
              return <li key={id}>{name(id)}{id === selfId && " (you)"}: {v === undefined ? "choosing…" : v === RANDOM_MAP ? "Random" : MAPS[v]?.name}</li>;
            })}
          </ul>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
        {MAPS.map((m, i) => {
          const n = counts.get(i) ?? 0;
          const sel = i === focus;
          return (
            <button key={m.id} type="button" onClick={() => setFocus(i)} onDoubleClick={() => send({ t: "VOTE", m: i })}
              style={{
                padding: 0, textAlign: "left", borderRadius: 10, overflow: "hidden", cursor: "pointer", background: "#111a2c", color: "inherit",
                border: sel ? "3px solid #ffb703" : "3px solid transparent", boxShadow: sel ? "0 0 0 2px #ffb70355, 0 6px 18px #0006" : "0 2px 8px #0005",
                transform: sel ? "translateY(-2px)" : "none", transition: "transform .15s, border-color .15s",
              }}>
              <div style={{ position: "relative", aspectRatio: "16 / 9", background: m.theme.sky[1] }}>
                {thumbs[i] && <img src={thumbs[i]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                {n > 0 && (
                  <span style={{ position: "absolute", top: 6, right: 6, background: n === lead ? "#ffb703" : "#000a", color: n === lead ? "#000" : "#fff", borderRadius: 999, padding: "1px 8px", fontSize: 12, fontWeight: 700 }}>
                    {n} vote{n > 1 ? "s" : ""}
                  </span>
                )}
                {mine === i && <span style={{ position: "absolute", top: 6, left: 6, background: "#2b8a3e", borderRadius: 999, padding: "1px 8px", fontSize: 12 }}>✓ you</span>}
              </div>
              <div style={{ padding: "6px 8px" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>{m.theme.name} · {m.size} · {m.players}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 12, opacity: 0.6 }}>←/→ browse · Enter or double-click votes · the match starts when everyone has voted or the timer runs out</div>
    </div>
  );
}
