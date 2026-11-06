import {useEffect,useRef,useState} from 'react'
import type Phaser from 'phaser'
import {useApp} from '../../../stores/app'
import {bestFloor,gameState,positions,saveBest,useCasino,useGame} from '../store'
import {isHost,leave,returnToLobby,selfId} from '../../../multiplayer/party'
import {announceMachine,buyout,buyUpgrade,castVote,nextFloor,payDebt,sendMove,takeLoan,walkAway} from '../net/client'
import {EARLY_BONUS,FINAL_FLOOR,LOAN_CHIPS,LOAN_DEBT,MARKER_INTEREST,minBetFor,paydayFor,upgradeCost,UPGRADES} from '../mechanics/engine'
import {GAME_LABELS,ruleFor,VOTES} from '../mechanics/floors'
import {getVol,setVol,sfx} from '../../../utils/sound'
import Avatar from '../../../app/Avatar'
import ChatBox from '../../../app/ChatBox'
import Panel from './Panel'
import Shop from './Shop'
import {SHOP_ITEMS} from '../mechanics/shop'
import type {Station} from '../scenes/layouts'

const mmss=(s:number)=>`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`

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

export default function GambleWithJanny(){
 const g=useGame(g=>g),players=useApp(s=>s.players),feed=useCasino(s=>s.feed),hold=useCasino(s=>s.hold),toast=useCasino(s=>s.toast),host=isHost()
 const box=useRef<HTMLDivElement>(null),open=useRef<Station|null>(null)
 const [panel,setPanel]=useState<Station|null>(null),[near,setNear]=useState<Station|null>(null)
 const [loading,setLoading]=useState(true),[vol,setV]=useState(getVol()),[best]=useState(bestFloor())
 open.current=panel
 const visit=(id:Station)=>{if(id!=='shop')announceMachine(id);setPanel(id)}
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
    blocked:()=>open.current!==null||gameState()?.phase!=='playing',
    onInteract:visit,onNear:setNear,onMove:sendMove,
    reversed:()=>{const g=gameState();return !!g?.pranks.some(p=>p.target===selfId&&p.kind==='shoes'&&p.until!==null&&g.timeLeft>p.until)},
    remotes:()=>useApp.getState().players.filter(p=>p.id!==selfId&&positions[p.id]).map(p=>({id:p.id,name:p.name,...positions[p.id]!})),
    state:gameState,fx:()=>useCasino.getState().fx,chat:()=>useApp.getState().chat})
   setLoading(false)})
  return()=>{dead=true;game?.destroy(true)}},[])

 // A panel doesn't reopen by itself on the next floor.
 useEffect(()=>{if(phase!=='playing')setPanel(null)},[phase])
 useEffect(()=>{
  if(phase==='upgrades'||phase==='final'||phase==='won'){sfx.floor();useCasino.setState({toast:''})}
  if(phase==='over')sfx.over()
  if((phase==='over'||phase==='won')&&floor-1>bestFloor())saveBest(floor-1)},[phase,floor])
 useEffect(()=>{if(phase==='playing'&&timeLeft>0&&timeLeft<=10)sfx.alarm()},[phase,timeLeft])
 const voteKind=g?.vote?.kind
 useEffect(()=>{if(voteKind)sfx.alarm()},[voteKind])

 if(!g)return null
 const rule=ruleFor(g.floor),minBet=minBetFor(g.floor),vote=g.phase==='playing'?g.vote:null,event=g.phase==='playing'?g.event:null
 const voted=!!vote&&(vote.yes.includes(selfId)||vote.no.includes(selfId))
 const myPranks=g.phase==='playing'?g.pranks.filter(p=>p.target===selfId&&(p.until===null||g.timeLeft>p.until)):[]
 const low=g.phase==='playing'&&g.timeLeft<=30
 const pct=Math.min(100,Math.max(0,(g.balance-hold)/g.quota*100))
 const covered=g.balance-hold>=g.quota
 const broke=g.phase==='playing'&&g.balance-hold<minBet
 const buying=g.floor>FINAL_FLOOR
 const exit=()=>{if(window.confirm('Leave the casino? If you are the host, this ends the run for everyone.')){leave();history.replaceState(null,'','/')}}
 const runStats=<>
  {g.floor-1>best&&<p className="new-record">New personal best</p>}
  <dl className="stat-grid">
   {([['Floors cleared',g.floor-1],['Bets placed',g.stats.bets],['Total won',g.stats.won],['Total lost',g.stats.lost],['Biggest win',g.stats.biggest],['Peak wallet',g.stats.peak]] as const).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v.toLocaleString()}</dd></div>)}
  </dl>
  {host?<button onClick={returnToLobby} className="btn-primary">Return to lobby</button>:<p className="modal-wait">Waiting for the host to return everyone to the lobby…</p>}
 </>
 const final=g.phase==='final'
 return <div className={`game-root${low?' game-low':''}`}>
  {/* The game stops the browser's own focus change on a click, so clicking the room has to leave the chat box here. */}
  <div ref={box} className="absolute inset-0" onPointerDownCapture={()=>{const a=document.activeElement;if(a instanceof HTMLElement&&a.classList.contains('chat-input'))a.blur()}}/>
  <div className="vignette" aria-hidden="true"/>
  {loading&&<div className="loading-screen"><div className="spinner-chip"/>Entering the casino…</div>}
  <header className="hud">
   <div className="hud-money">
    <div className="hud-row"><span className="hud-label">Wallet</span><b className="hud-wallet">{wallet.toLocaleString()}</b><span className="hud-label">of {g.quota.toLocaleString()} due</span></div>
    <div className={`debt-bar${covered?' debt-covered':''}`} role="progressbar" aria-label="Debt covered" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${pct}%`}}/></div>
   </div>
   <div className={`hud-timer${low?' timer-low':''}`}><span className="hud-label">Time</span><b>{mmss(g.timeLeft)}</b></div>
   <div className="hud-stat"><span className="hud-label">Floor</span><b>{g.floor}</b></div>
   <div className="hud-stat" title={rule.desc}><span className="hud-label">House rule</span><b className="hud-rule">{rule.name}</b></div>
   {g.shield>0&&<div className="hud-stat"><span className="hud-label">Shields</span><b>🛡️{g.shield}</b></div>}
   {g.luck>0&&<div className="hud-stat" title={SHOP_ITEMS.charm.desc}><span className="hud-label">Luck</span><b>🐇{g.luck}</b></div>}
   {g.reroll>0&&<div className="hud-stat" title={SHOP_ITEMS.marked.desc}><span className="hud-label">Redraws</span><b>🃏{g.reroll}</b></div>}
   {g.markers>0&&<div className="hud-stat" title={`Each marker adds ${MARKER_INTEREST} to every later floor's debt`}><span className="hud-label">Markers</span><b>🦈{g.markers}</b></div>}
   <ul className="hud-players" aria-label={`${players.length} players`}>{players.map(p=><li key={p.id} title={p.name}><Avatar id={p.id} name={p.name} size={26}/></li>)}</ul>
   <div className="hud-actions">
    <label className="hud-vol"><span aria-hidden="true">{vol>0?'🔊':'🔇'}</span><span className="sr-only">Volume</span><input type="range" min={0} max={1} step={.1} value={vol} onChange={e=>{setV(+e.target.value);setVol(+e.target.value)}} onPointerUp={e=>e.currentTarget.blur()}/></label>
    <button onClick={exit} className="btn-ghost">Leave</button>
   </div>
  </header>
  {g.phase==='playing'&&<div className="action-bar">
   {covered&&<button onClick={payDebt} className="btn-pay">Pay the debt now <small>+{g.timeLeft*EARLY_BONUS} early bonus</small></button>}
   {!g.loanUsed&&<button onClick={()=>{if(!broke&&!window.confirm(`Take ${LOAN_CHIPS} chips now? This adds ${LOAN_DEBT} to this floor's debt and ${MARKER_INTEREST} to every later floor's debt.`))return;takeLoan()}} className={`btn-loan${broke?' btn-urgent':''}`}>🦈 Janny's marker <small>+{LOAN_CHIPS} now, +{LOAN_DEBT} debt, +{MARKER_INTEREST} later</small></button>}
  </div>}
  {!panel&&g.phase==='playing'&&near&&<button className="play-prompt" onClick={()=>visit(near)}><kbd>E</kbd> {near==='shop'?'Visit the Sketchy Shop':`Play ${GAME_LABELS[near]}`}</button>}
  {!panel&&g.phase==='playing'&&!near&&<p className="controls-hint">WASD or arrows to walk · click or tap to move · E to play · Enter to chat</p>}
  <ul className="feed" aria-live="polite">{feed.map(f=><li key={f.id} className={`feed-${f.tone}`}>{f.text}</li>)}</ul>
  <ChatBox variant="game"/>
  {g.phase==='playing'&&<div key={g.floor} className="floor-banner" aria-hidden="true"><span>Floor {g.floor}</span><small>Debt due {g.quota.toLocaleString()}</small><small className="floor-banner-rule">{rule.name}: {rule.desc}</small></div>}
  {event&&<p className={`event-pill event-${event.kind}`}>{event.kind==='hot'?'🔥':'⚡'} {GAME_LABELS[event.machine]} {event.kind==='hot'?'is running hot':'is closed'} · {Math.max(0,g.timeLeft-event.until)}s</p>}
  {myPranks.some(p=>p.kind==='stink')&&<div className="stink-fog" aria-hidden="true"/>}
  {myPranks.length>0&&<ul className="prank-list" aria-live="polite">{myPranks.map((p,i)=><li key={i}>{SHOP_ITEMS[p.kind].icon} {SHOP_ITEMS[p.kind].name}{p.until===null?' on your next bet':` · ${g.timeLeft-p.until}s`}</li>)}</ul>}
  {panel==='shop'&&g.phase==='playing'&&<Shop onClose={()=>setPanel(null)}/>}
  {panel&&panel!=='shop'&&g.phase==='playing'&&<Panel game={panel} onClose={()=>setPanel(null)}/>}
  {vote&&<section className="vote-card" aria-label="Team vote">
   <div className="vote-head"><b>{VOTES[vote.kind].title}</b><span>{Math.max(0,g.timeLeft-vote.until)}s</span></div>
   <p>{VOTES[vote.kind].desc(g.floor)}</p>
   {voted?<p className="vote-wait">Vote counted. Waiting for the team…</p>:<div className="vote-actions">
    <button onClick={()=>castVote(true)} className="btn-buy">{VOTES[vote.kind].yes}</button>
    <button onClick={()=>castVote(false)} className="btn-ghost">{VOTES[vote.kind].no}</button>
   </div>}
   <small>{vote.yes.length} yes · {vote.no.length} no · of {players.length} {players.length===1?'player':'players'}</small>
  </section>}

  {g.phase==='upgrades'&&<div className="modal-backdrop"><div className="modal modal-win">
   <div className="modal-medal" aria-hidden="true">🏆</div>
   <h2>Floor {g.floor-1} cleared</h2>
   <p className="modal-sub">Debt paid.{g.bonus>0&&<b className="text-emerald-300"> +{g.bonus} early bonus.</b>}{g.payday>0&&<b className="text-emerald-300"> +{g.payday.toLocaleString()} payday from Janny.</b>} Next debt <b>{g.quota.toLocaleString()}</b> · Wallet <b>{g.balance.toLocaleString()}</b></p>
   <p className="next-floor"><b>Floor {g.floor}: {rule.name}.</b> {rule.desc} Games: {rule.games.map(m=>GAME_LABELS[m]).join(', ')}.</p>
   <ul className="upgrade-list">{Object.entries(UPGRADES).map(([id,u])=>{const n=g.upgrades[id]??0,cost=upgradeCost(id,g.floor);return <li key={id} className="upgrade">
    <span className="upgrade-icon" aria-hidden="true">{u.icon}</span>
    <div className="flex-1"><b>{u.name}</b><div className="upgrade-pips" aria-label={`${n} of ${u.max} owned`}>{Array.from({length:u.max},(_,i)=><i key={i} className={i<n?'on':''}/>)}</div><p>{u.desc}</p></div>
    <button disabled={n>=u.max||g.balance<cost} onClick={()=>{sfx.buy();buyUpgrade(id)}} className="btn-buy">{n>=u.max?'Max':cost}</button></li>})}</ul>
   {toast&&<p role="alert" className="mb-2 text-sm text-rose-300">{toast}</p>}
   {host?<button onClick={nextFloor} className="btn-primary">{buying?'Start the buyout':`Start floor ${g.floor}`}</button>:<p className="modal-wait">Waiting for the host to start the next floor…</p>}
  </div></div>}

  {final&&<div className="modal-backdrop"><div className="modal modal-win">
   <div className="modal-medal" aria-hidden="true">🎩</div>
   <h2>Janny's offer</h2>
   <p className="modal-sub">Every debt is paid. Walk out free with <b>{g.balance.toLocaleString()}</b> chips, or play one more floor{paydayFor(g.floor)>0&&<> with a <b>{paydayFor(g.floor).toLocaleString()}</b> payday</>} and buy the casino for <b>{g.quota.toLocaleString()}</b>. Fall short and you lose everything.</p>
   {host?<div className="mt-3 flex flex-col gap-2">
    <button onClick={walkAway} className="btn-primary">Walk out free</button>
    <button onClick={buyout} className="btn-ghost">Buy the casino</button>
   </div>:<p className="modal-wait">Waiting for the host to decide…</p>}
  </div></div>}

  {g.phase==='won'&&<div className="modal-backdrop"><div className="modal modal-win">
   <div className="modal-medal" aria-hidden="true">{g.ending==='owner'?'👑':'🚪'}</div>
   <h2>{g.ending==='owner'?'The casino is yours':'You walked out free'}</h2>
   <p className="modal-sub">{g.ending==='owner'?'Janny hands over the keys. The house is finally on your side.':`You left with ${g.balance.toLocaleString()} chips and no debt.`}</p>
   {runStats}
  </div></div>}

  {g.phase==='over'&&<div className="modal-backdrop modal-dark"><div className="modal modal-lose">
   <div className="modal-medal" aria-hidden="true">🕴️</div>
   <h2>{buying?'Buyout failed':'Debt collected'}</h2>
   <p className="modal-sub">{g.balance<minBet&&g.timeLeft>0?`The team went broke on floor ${g.floor}.`:`You fell ${(g.quota-g.balance).toLocaleString()} chips short on floor ${g.floor}.`}</p>
   {runStats}
  </div></div>}
 </div>}
