import {useEffect,useRef,useState} from 'react'
import type Phaser from 'phaser'
import {bestFloor,positions,saveBest,useApp} from '../../../stores/app'
import {announceMachine,buyUpgrade,isHost,leave,nextFloor,payDebt,returnToLobby,selfId,sendMove,takeLoan} from '../../../multiplayer/party'
import {EARLY_BONUS,LOAN_CHIPS,LOAN_DEBT,MIN_BET,UPGRADES} from '../mechanics/engine'
import {getVol,setVol,sfx} from '../../../utils/sound'
import Avatar from '../../../app/Avatar'
import Panel from './Panel'
import type {GameKind} from '../../../types/net'

const mmss=(s:number)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
const MACHINE_LABELS:Record<GameKind,string>={slots:'Slots',roulette:'Roulette',dice:'Dice',wheel:'Lucky Wheel',crash:'Crash'}

/** Eases a displayed number toward its real value. */
function useCounter(value:number){
 const [shown,setShown]=useState(value),from=useRef(value)
 useEffect(()=>{
  const start=performance.now(),a=from.current;let raf=0
  const frame=(t:number)=>{
   const p=Math.min(1,(t-start)/450),v=Math.round(a+(value-a)*(1-(1-p)**3))
   from.current=v;setShown(v)
   if(p<1)raf=requestAnimationFrame(frame)}
  raf=requestAnimationFrame(frame)
  return()=>cancelAnimationFrame(raf)},[value])
 return shown}

export default function LuckyDebt(){
 const g=useApp(s=>s.game),players=useApp(s=>s.players),feed=useApp(s=>s.feed),hold=useApp(s=>s.hold),toast=useApp(s=>s.toast),host=isHost()
 const box=useRef<HTMLDivElement>(null),open=useRef<GameKind|null>(null)
 const [panel,setPanel]=useState<GameKind|null>(null),[near,setNear]=useState<GameKind|null>(null)
 const [loading,setLoading]=useState(true),[vol,setV]=useState(getVol()),[best]=useState(bestFloor())
 open.current=panel
 const wallet=useCounter((g?.balance??0)-hold)
 const phase=g?.phase,floor=g?.floor??1,timeLeft=g?.timeLeft??0

 useEffect(()=>{
  let game:Phaser.Game|null=null,dead=false
  // Wait briefly for the display font so the neon sign is drawn in it.
  const fonts=document.fonts?.load?Promise.race([document.fonts.load('36px Limelight'),new Promise(r=>setTimeout(r,1200))]).catch(()=>{}):Promise.resolve()
  void Promise.all([import('../scenes/CasinoScene'),fonts]).then(([{createCasino}])=>{
   if(dead||!box.current)return
   const {name}=useApp.getState()
   game=createCasino(box.current,{selfId,name,
    blocked:()=>open.current!==null||useApp.getState().game?.phase!=='playing',
    onInteract:id=>{announceMachine(id);setPanel(id)},onNear:setNear,onMove:sendMove,
    remotes:()=>useApp.getState().players.filter(p=>p.id!==selfId&&positions[p.id]).map(p=>({id:p.id,name:p.name,...positions[p.id]!})),
    state:()=>useApp.getState().game,fx:()=>useApp.getState().fx})
   setLoading(false)})
  return()=>{dead=true;game?.destroy(true)}},[])

 // A panel doesn't reopen by itself on the next floor.
 useEffect(()=>{if(phase!=='playing')setPanel(null)},[phase])
 useEffect(()=>{
  if(phase==='upgrades'){sfx.floor();useApp.setState({toast:''})}
  if(phase==='over'){sfx.over();if(floor-1>bestFloor())saveBest(floor-1)}},[phase,floor])
 useEffect(()=>{if(phase==='playing'&&timeLeft>0&&timeLeft<=10)sfx.alarm()},[phase,timeLeft])

 if(!g)return null
 const low=g.phase==='playing'&&g.timeLeft<=30
 const pct=Math.min(100,Math.max(0,(g.balance-hold)/g.quota*100))
 const covered=g.balance-hold>=g.quota
 const broke=g.phase==='playing'&&g.balance-hold<MIN_BET
 const exit=()=>{if(window.confirm('Leave the casino? If you are the host, this ends the run for everyone.')){leave();history.replaceState(null,'','/')}}
 return <div className={`game-root${low?' game-low':''}`}>
  <div ref={box} className="absolute inset-0"/>
  <div className="vignette" aria-hidden="true"/>
  {loading&&<div className="loading-screen"><div className="spinner-chip"/>Entering the casino…</div>}
  <header className="hud">
   <div className="hud-money">
    <div className="hud-row"><span className="hud-label">Wallet</span><b className="hud-wallet">{wallet.toLocaleString()}</b><span className="hud-label">of {g.quota.toLocaleString()} due</span></div>
    <div className={`debt-bar${covered?' debt-covered':''}`} role="progressbar" aria-label="Debt covered" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${pct}%`}}/></div>
   </div>
   <div className={`hud-timer${low?' timer-low':''}`}><span className="hud-label">Time</span><b>{mmss(g.timeLeft)}</b></div>
   <div className="hud-stat"><span className="hud-label">Floor</span><b>{g.floor}</b></div>
   {g.shield>0&&<div className="hud-stat"><span className="hud-label">Shields</span><b>🛡️{g.shield}</b></div>}
   <ul className="hud-players" aria-label={`${players.length} players`}>{players.map(p=><li key={p.id} title={p.name}><Avatar id={p.id} name={p.name} size={26}/></li>)}</ul>
   <div className="hud-actions">
    <label className="hud-vol"><span aria-hidden="true">{vol>0?'🔊':'🔇'}</span><span className="sr-only">Volume</span><input type="range" min={0} max={1} step={.1} value={vol} onChange={e=>{setV(+e.target.value);setVol(+e.target.value)}} onPointerUp={e=>e.currentTarget.blur()}/></label>
    <button onClick={exit} className="btn-ghost">Leave</button>
   </div>
  </header>
  {g.phase==='playing'&&<div className="action-bar">
   {covered&&<button onClick={payDebt} className="btn-pay">Pay the debt now <small>+{g.timeLeft*EARLY_BONUS} early bonus</small></button>}
   {!g.loanUsed&&<button onClick={()=>{if(!broke&&!window.confirm(`Take ${LOAN_CHIPS} chips now and add ${LOAN_DEBT} to this floor's debt?`))return;takeLoan()}} className={`btn-loan${broke?' btn-urgent':''}`}>🦈 Loan shark <small>+{LOAN_CHIPS} now, +{LOAN_DEBT} debt</small></button>}
  </div>}
  {!panel&&g.phase==='playing'&&near&&<button className="play-prompt" onClick={()=>{announceMachine(near);setPanel(near)}}><kbd>E</kbd> Play {MACHINE_LABELS[near]}</button>}
  {!panel&&g.phase==='playing'&&!near&&<p className="controls-hint">WASD or arrows to walk · click or tap to move · E to play</p>}
  <ul className="feed" aria-live="polite">{feed.map(f=><li key={f.id} className={`feed-${f.tone}`}>{f.text}</li>)}</ul>
  {g.phase==='playing'&&<div key={g.floor} className="floor-banner" aria-hidden="true"><span>Floor {g.floor}</span><small>Debt due {g.quota.toLocaleString()}</small></div>}
  {panel&&g.phase==='playing'&&<Panel game={panel} onClose={()=>setPanel(null)}/>}

  {g.phase==='upgrades'&&<div className="modal-backdrop"><div className="modal modal-win">
   <div className="modal-medal" aria-hidden="true">🏆</div>
   <h2>Floor {g.floor-1} cleared</h2>
   <p className="modal-sub">Debt paid.{g.bonus>0&&<b className="text-emerald-300"> +{g.bonus} early bonus.</b>} Next debt <b>{g.quota.toLocaleString()}</b> · Wallet <b>{g.balance.toLocaleString()}</b></p>
   <ul className="upgrade-list">{Object.entries(UPGRADES).map(([id,u])=>{const n=g.upgrades[id]??0;return <li key={id} className="upgrade">
    <span className="upgrade-icon" aria-hidden="true">{u.icon}</span>
    <div className="flex-1"><b>{u.name}</b><div className="upgrade-pips" aria-label={`${n} of ${u.max} owned`}>{Array.from({length:u.max},(_,i)=><i key={i} className={i<n?'on':''}/>)}</div><p>{u.desc}</p></div>
    <button disabled={n>=u.max||g.balance<u.cost} onClick={()=>{sfx.buy();buyUpgrade(id)}} className="btn-buy">{n>=u.max?'Max':u.cost}</button></li>})}</ul>
   {toast&&<p role="alert" className="mb-2 text-sm text-rose-300">{toast}</p>}
   {host?<button onClick={nextFloor} className="btn-primary">Start floor {g.floor}</button>:<p className="modal-wait">Waiting for the host to start the next floor…</p>}
  </div></div>}

  {g.phase==='over'&&<div className="modal-backdrop modal-dark"><div className="modal modal-lose">
   <div className="modal-medal" aria-hidden="true">🕴️</div>
   <h2>Debt collected</h2>
   <p className="modal-sub">{g.balance<MIN_BET&&g.timeLeft>0?`The team went broke on floor ${g.floor}.`:`You fell ${(g.quota-g.balance).toLocaleString()} chips short on floor ${g.floor}.`}</p>
   {g.floor-1>best&&<p className="new-record">New personal best</p>}
   <dl className="stat-grid">
    {([['Floors cleared',g.floor-1],['Bets placed',g.stats.bets],['Total won',g.stats.won],['Total lost',g.stats.lost],['Biggest win',g.stats.biggest],['Peak wallet',g.stats.peak]] as const).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v.toLocaleString()}</dd></div>)}
   </dl>
   {host?<button onClick={returnToLobby} className="btn-primary">Return to lobby</button>:<p className="modal-wait">Waiting for the host to return everyone to the lobby…</p>}
  </div></div>}
 </div>}
