import {useEffect,useRef,useState,type MouseEvent,type PointerEvent} from 'react'
import {isHost,leave,nameOf,returnToLobby,selfId,sendAction} from '../../../multiplayer/party'
import {useApp} from '../../../stores/app'
import type {BrawlAction,BrawlState} from '..'
import {createRenderer,type Renderer} from '../draw'
import {KEY,MAX_FIGHTERS,PRESS,ROSTER,type PSnap} from '../shared'

const send=(action:BrawlAction)=>sendAction(action)
type Key=keyof typeof KEY|'nade'
const KEYS:Record<string,Key>={KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',KeyW:'jump',ArrowUp:'jump',KeyS:'down',ArrowDown:'down',Space:'fire',KeyJ:'fire',KeyG:'nade',KeyK:'nade'}
const held=(k:Key)=>k==='nade'?0:KEY[k]
const pressed=(k:Key)=>k==='jump'?PRESS.jump:k==='fire'?PRESS.fire:k==='nade'?PRESS.nade:0
const safeName=(id:string)=>{try{return nameOf(id)||'Player'}catch{return 'Player'}}
const clock=(s:number)=>Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0')

/** The in-game screen. It draws the state the host published and sends keys back. It never changes the state itself. */
export default function SkyScrapBrawl(){
 const state=useApp(s=>s.gameState as BrawlState|null)
 const canvas=useRef<HTMLCanvasElement>(null),renderer=useRef<Renderer|null>(null)
 // Fullscreen covers the arena and the touch buttons together.
 const play=useRef<HTMLDivElement>(null),[full,setFull]=useState(false)
 useEffect(()=>{const on=()=>setFull(document.fullscreenElement===play.current);document.addEventListener('fullscreenchange',on);return()=>document.removeEventListener('fullscreenchange',on)},[])
 const toggleFullRef=useRef(()=>{});toggleFullRef.current=()=>toggleFull()
 const toggleFull=()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});else play.current?.requestFullscreen?.().catch(()=>{})}
 const phase=useRef<BrawlState['ph']>('wait'),input=useRef<{down(k:Key):void;up(k:Key):void}|null>(null)
 phase.current=state?.ph??'wait'

 // Draw every animation frame.
 useEffect(()=>{
  const r=createRenderer(canvas.current!);renderer.current=r
  let raf=0;const loop=(now:number)=>{r.frame(now);raf=requestAnimationFrame(loop)}
  raf=requestAnimationFrame(loop)
  return()=>{cancelAnimationFrame(raf);renderer.current=null}
 },[])
 // Hand each new snapshot to the renderer.
 useEffect(()=>{const r=renderer.current;if(!r)return;r.setView({self:selfId,name:safeName});r.push(state?.mt)},[state])
 // Tell the host we're here, and repeat until it lists us (our first message may arrive before the host is ready).
 const listed=!!state?.j.includes(selfId)
 useEffect(()=>{if(listed)return;send({t:'JOIN'});const id=setInterval(()=>send({t:'JOIN'}),1000);return()=>clearInterval(id)},[listed])

 // Keys: held keys are sent whenever they change; jump, fire and grenade also send a press bit so quick taps always count.
 useEffect(()=>{
  let bits=0
  const push=(p:number)=>send({t:'IN',h:bits,p})
  const down=(k:Key)=>{const h=held(k);if(h&&bits&h)return;bits|=h;push(pressed(k))}
  const up=(k:Key)=>{const h=held(k);if(!h||!(bits&h))return;bits&=~h;push(0)}
  const release=()=>{if(bits){bits=0;push(0)}}
  input.current={down,up}
  const typing=(e:Event)=>{const el=e.target as HTMLElement|null;return !!el&&(el.tagName==='INPUT'||el.tagName==='TEXTAREA'||el.isContentEditable)}
  const kd=(e:KeyboardEvent)=>{if(e.code==='KeyF'&&!e.repeat&&!typing(e)){toggleFullRef.current();return}const k=KEYS[e.code];if(!k||typing(e)||phase.current!=='play')return;e.preventDefault();if(!e.repeat)down(k)}
  const ku=(e:KeyboardEvent)=>{const k=KEYS[e.code];if(k)up(k)}
  addEventListener('keydown',kd);addEventListener('keyup',ku);addEventListener('blur',release)
  return()=>{removeEventListener('keydown',kd);removeEventListener('keyup',ku);removeEventListener('blur',release);release()}
 },[])

 const exit=()=>{leave();history.replaceState(null,'','/')}
 const mt=state?.mt,ph=state?.ph??'wait',host=isHost()
 const fighters=(mt?.P??[]).filter(p=>!p.c)
 const me=fighters.find(p=>p.id===selfId)
 const nameFor=(p:PSnap)=>p.id?(p.id===selfId?'You':safeName(p.id)):ROSTER[p.r][0]
 const joined=state?.j??[]
 const humans=Math.min(joined.length,MAX_FIGHTERS)

 let title='',sub=''
 if(ph==='over'&&mt){
  title=mt.win>=0&&me&&mt.win===me.r?'You win!':me&&me.l<=0?'Knocked out':'Match over'
  const w=fighters.find(p=>p.r===mt.win)
  sub=w?(w===me?'You are the last one standing.':nameFor(w)+' takes the match.'):'Nobody is left standing.'
 }
 const rows=[...fighters].sort((a,b)=>b.l-a.l||(b.st[5]<0?1e9:b.st[5])-(a.st[5]<0?1e9:a.st[5])||b.st[0]-a.st[0])
 const tap=(k:Key)=>({
  onPointerDown:(e:PointerEvent)=>{e.preventDefault();if(phase.current==='play')input.current?.down(k)},
  onPointerUp:()=>input.current?.up(k),onPointerCancel:()=>input.current?.up(k),onPointerLeave:()=>input.current?.up(k),
  onContextMenu:(e:MouseEvent)=>e.preventDefault()})

 return <section className="ssb">
  <style>{CSS}</style>
  <div className="ssb-play" ref={play}>
  <div className="ssb-stage">
   <canvas ref={canvas} width={960} height={610} aria-label="Game arena"/>
   <button className="ssb-leave" onClick={exit}>Leave</button>
   <button className="ssb-full" onClick={toggleFull} aria-label={full?'Exit fullscreen':'Fullscreen'} title={full?'Exit fullscreen (F)':'Fullscreen (F)'}>{full?'✕':'⛶'}</button>
   {ph==='play'&&!me&&<div className="ssb-banner">Spectating. You join next round.</div>}
   {ph==='play'&&me&&me.l<=0&&<div className="ssb-banner">Knocked out. Watching the rest.</div>}
   {ph!=='play'&&<div className="ssb-menu">
    {ph==='wait'?<>
     <h2>Ready to fight?</h2>
     <div className="ssb-sub">{humans} of {MAX_FIGHTERS} fighters joined. {humans<2?'Need at least 2 to fight. ':''}10 lives each. Random map. Last one standing wins.</div>
     <ul className="ssb-roster">{joined.slice(0,MAX_FIGHTERS).map((id,i)=><li key={id}><i style={{background:ROSTER[i][1]}}/>{id===selfId?'You':safeName(id)}</li>)}</ul>
    </>:<>
     <h2>{title}</h2><div className="ssb-sub">{sub}</div>
     {mt&&<table><caption>Match time {clock(mt.t)}</caption><thead><tr><th>Fighter</th><th>KOs</th><th>Falls</th><th>Lives</th><th>Accuracy</th><th>Best combo</th></tr></thead>
      <tbody>{rows.map(p=><tr key={p.u} className={p===me?'you':''}><td><i style={{background:ROSTER[p.r][1]}}/>{nameFor(p)}</td><td>{p.st[0]}</td><td>{p.st[1]}</td><td>{p.l}</td><td>{p.st[2]?Math.round(p.st[3]/p.st[2]*100)+'%':'-'}</td><td>{p.st[4]}</td></tr>)}</tbody></table>}
    </>}
    {host?<div className="ssb-row">
      <button className="ssb-go" onClick={()=>send({t:'START'})} disabled={!listed||humans<2}>{ph==='over'?'Fight again':'Start fight'}</button>
      {ph==='over'&&<button className="ssb-ghost" onClick={returnToLobby}>Return to lobby</button>}
     </div>
     :<div className="ssb-sub">Waiting for the host to start…</div>}
   </div>}
  </div>
  <div className="ssb-touch"><div><button {...tap('left')} aria-label="Move left">◀</button><button {...tap('right')} aria-label="Move right">▶</button><button {...tap('down')} aria-label="Drop down">▼</button></div><div><button {...tap('jump')}>Jump</button><button {...tap('fire')}>Fire</button><button {...tap('nade')}>Bomb</button></div></div>
  </div>
 </section>}

/** Single-look sunset arcade, scoped to .ssb so it can't leak into the hub. */
const CSS=`
.ssb{--bg:#2a1a10;--panel:#4a2f1c;--fg:#fff4e0;--muted:#dcc3a4;--accent:#ffb02e;--ink:#140e26;color-scheme:dark;background:var(--bg);color:var(--fg);font-family:system-ui,sans-serif;position:fixed;inset:0;z-index:1000;display:flex}
.ssb-stage{position:relative;flex-shrink:0}
.ssb canvas{display:block;width:100%;aspect-ratio:960/610;border-radius:10px;background:var(--panel);touch-action:none}
.ssb-menu{position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:safe center;overflow:auto;background:#1d1008b8;border-radius:10px;text-align:center;padding:8px}
.ssb-menu>*{flex-shrink:0}
.ssb-menu h2{margin:0;font-size:clamp(18px,4vw,30px)}
.ssb-sub{color:var(--fg)}
.ssb-banner{position:absolute;top:8px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#1d1008cc;color:var(--muted);border-radius:8px;padding:4px 10px;font-size:13px;pointer-events:none}
.ssb-roster{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:6px 14px;justify-content:center}
.ssb-roster li{display:flex;align-items:center}
.ssb i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px}
.ssb-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center}
.ssb button{font:700 15px system-ui,sans-serif;border:0;border-radius:8px;padding:10px 18px;cursor:pointer;touch-action:none;user-select:none;-webkit-user-select:none}
.ssb-go,.ssb-touch button{background:var(--accent);color:var(--ink)}
.ssb-go:disabled{opacity:.5;cursor:default}
.ssb-ghost{background:transparent;color:var(--fg);outline:2px solid var(--muted)!important;outline-offset:-2px}
.ssb button:focus-visible{outline:3px solid var(--fg);outline-offset:2px}
.ssb table{border-collapse:collapse;font-size:clamp(11px,2.2vw,14px);font-variant-numeric:tabular-nums;background:#1d1008cc;border-radius:8px}
.ssb caption{color:var(--muted);padding-bottom:4px}
.ssb th,.ssb td{padding:3px clamp(4px,1.4vw,12px);text-align:right}
.ssb th{color:var(--muted);font-weight:600}
.ssb th:first-child,.ssb td:first-child{text-align:left}
.ssb tr.you td{color:var(--accent);font-weight:700}
@media (max-width:520px){.ssb-menu h2{font-size:15px}.ssb-sub,.ssb caption{font-size:10px}.ssb th,.ssb td{font-size:10px;padding-block:1px}.ssb-menu button{font-size:12px;padding:5px 12px}}
.ssb-touch{display:none;justify-content:space-between;gap:8px}
.ssb-touch div{display:flex;gap:8px}
.ssb-touch button{min-width:56px;min-height:56px;padding:8px}
@media (pointer:coarse){.ssb-touch{display:flex}}
.ssb-full{position:absolute;top:8px;right:8px;z-index:2;width:36px;height:36px;padding:0!important;font-size:18px!important;line-height:1;background:#1d1008cc;color:var(--fg)}
.ssb-leave{position:absolute;top:8px;left:8px;z-index:2;height:36px;padding:0 14px!important;font-size:14px!important;background:#1d1008cc;color:var(--fg)}
.ssb-play{flex:1;min-width:0;min-height:0;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:8px;box-sizing:border-box}
.ssb-stage{width:min(100%,calc((100dvh - 16px) * 960 / 610))}
@media (pointer:coarse){.ssb-stage{width:min(100%,calc((100dvh - 96px) * 960 / 610))}.ssb-touch{width:100%}}
@media (max-width:440px){.ssb-touch,.ssb-touch div{gap:4px}.ssb-touch button{min-width:48px;padding:6px 4px;font-size:13px}}
`
