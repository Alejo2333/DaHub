import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {useApp} from '../../../stores/app'
import {announceResult,cashOut,newId,sendBet} from '../../../multiplayer/party'
import {crashMult,ODDS} from '../mechanics/payouts'
import {MIN_BET} from '../mechanics/engine'
import {sfx} from '../../../utils/sound'
import type {BetResult,GameKind} from '../../../types/net'
import {CrashStage,DiceStage,numberColor,REVEAL_MS,RouletteStage,SlotsStage,WheelStage} from './stages'

const TITLES:Record<GameKind,string>={slots:'Slot Machine',roulette:'Roulette',dice:'Dice',wheel:'Lucky Wheel',crash:'Crash'}
const ICONS:Record<GameKind,string>={slots:'🎰',roulette:'🎡',dice:'🎲',wheel:'🍀',crash:'🚀'}
const ROULETTE_BETS:[string,string][]=[['red','Red'],['black','Black'],['odd','Odd'],['even','Even'],['low','1–18'],['high','19–36'],['d1','1st 12'],['d2','2nd 12'],['d3','3rd 12']]
const DICE_BETS:[string,string,string][]=[['under','Under 7','2.2x'],['over','Over 7','2.2x'],['seven','Exactly 7','5x'],['doubles','Doubles','5x']]
const QUICK=[10,50,100,250,500]
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches
/** Keeps the wager between panels, so moving to the next machine doesn't reset it. */
let rememberedWager=50

/** idle: nothing running. waiting: bet sent to host. revealing: result known, animation playing. flying: crash in the air. done: result on show. */
type Phase='idle'|'waiting'|'revealing'|'flying'|'done'

function Coins(){
 const coins=useMemo(()=>Array.from({length:22},(_,i)=>({i,x:Math.random()*100,d:Math.random()*.5,s:.8+Math.random()*.7})),[])
 return <div className="coin-rain" aria-hidden="true">{coins.map(c=><span key={c.i} style={{left:`${c.x}%`,animationDelay:`${c.d}s`,animationDuration:`${c.s}s`}}>🪙</span>)}</div>}

export default function Panel({game,onClose}:{game:GameKind;onClose:()=>void}){
 const balance=useApp(s=>s.game?.balance??0),hold=useApp(s=>s.hold)
 const [wager,setWagerRaw]=useState(rememberedWager)
 const [choice,setChoice]=useState(game==='roulette'?'red':'over')
 const [phase,setPhase]=useState<Phase>('idle')
 const [roll,setRoll]=useState<unknown>(null)
 const [result,setResult]=useState<BetResult|null>(null)
 const [err,setErr]=useState('')
 const [mult,setMult]=useState(1)
 const unannounced=useRef<BetResult|null>(null)
 const flightId=useRef(''),mainBtn=useRef<HTMLButtonElement>(null)
 const setWager=(n:number)=>{const w=Math.max(0,Math.floor(n)||0);rememberedWager=w;setWagerRaw(w)}
 const busy=phase==='waiting'||phase==='revealing'
 const flying=phase==='flying'
 const available=balance-hold
 const ok=wager>=MIN_BET&&wager<=available

 /** Publishes the result to the HUD, feed and casino scene. Runs once per bet. */
 const reveal=useCallback(()=>{
  const r=unannounced.current;if(!r)return
  unannounced.current=null
  useApp.setState({hold:0});announceResult(r)},[])
 // If the panel goes away mid-animation (the round ended), still report the bet.
 useEffect(()=>()=>reveal(),[reveal])

 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!busy&&!flying)onClose()}
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[busy,flying,onClose])
 useEffect(()=>{mainBtn.current?.focus()},[phase])

 // Crash: run the on-screen multiplier with the same curve the host uses.
 useEffect(()=>{
  if(!flying)return
  const t0=performance.now();let raf=0
  const frame=()=>{setMult(crashMult(performance.now()-t0));raf=requestAnimationFrame(frame)}
  raf=requestAnimationFrame(frame)
  return()=>cancelAnimationFrame(raf)},[flying])

 function finish(r:BetResult){
  setResult(r);setPhase('done');reveal()
  const jackpot=r.payout>=r.wager*10
  if(r.net>0)(jackpot?sfx.jackpot:sfx.win)()
  else if(r.net<0)(r.game==='crash'?sfx.bust:sfx.lose)()
  else sfx.click()}

 async function place(){
  sfx.click();setErr('');setResult(null);setRoll(null);setMult(1)
  const id=newId();flightId.current=id
  setPhase('waiting')
  try{
   const r=await sendBet({id,game,wager,choice:game==='roulette'||game==='dice'?choice:0},()=>{sfx.launch();setPhase('flying')})
   if(game==='crash'){setRoll(r.roll);unannounced.current=r;finish(r);return}
   // Hide the outcome from the HUD until the animation lands.
   unannounced.current=r
   useApp.setState({hold:r.net})
   setRoll(r.roll);setPhase('revealing')
   setTimeout(()=>{if(unannounced.current===r)finish(r)},reduced()?150:REVEAL_MS[game]??0)
  }catch(e){setErr(e instanceof Error?e.message:'Bet rejected.');setPhase('idle')}}

 const tone=result?(result.net>0?'win':result.net<0?'lose':'even'):''
 const crashState=flying||phase==='waiting'&&game==='crash'?'flying':result?(result.net>0||(result.net===0&&(result.detail.startsWith('Cashed')))?'cashed':'busted'):'idle'
 const stage=game==='slots'?<SlotsStage spinning={busy} roll={roll as number[]|null} win={phase==='done'&&(result?.net??0)>0}/>
  :game==='roulette'?<RouletteStage spinning={busy} roll={roll as number|null}/>
  :game==='dice'?<DiceStage roll={roll as number[]|null}/>
  :game==='wheel'?<WheelStage roll={roll as number|null}/>
  :<CrashStage key={flightId.current} mult={mult} state={crashState} point={typeof roll==='number'?roll:null}/>

 return <div role="dialog" aria-modal="true" aria-label={TITLES[game]} className="panel-backdrop">
  <div className={`panel panel-${game}`}>
   <header className="panel-head">
    <h2><span aria-hidden="true">{ICONS[game]}</span> {TITLES[game]}</h2>
    <div className="panel-wallet">Wallet <b>{available.toLocaleString()}</b></div>
    <button onClick={onClose} disabled={busy||flying} className="panel-x" aria-label="Close">✕</button>
   </header>
   <div className={`stage stage-${tone}`} aria-hidden={busy}>
    {stage}
    {phase==='done'&&tone==='win'&&<Coins/>}
   </div>
   <div className="panel-result" aria-live="polite">
    {phase==='done'&&result&&<p key={result.id} className={`result result-${tone}`}>
     <b>{result.net>0?'+':''}{result.net.toLocaleString()}</b> <span>{result.detail}{result.shielded?' · shield used':''}{result.payout>=result.wager*10?' · JACKPOT':''}</span></p>}
    {busy&&<p className="result result-even"><span>{phase==='waiting'?'Sending to the host…':'Good luck…'}</span></p>}
    {phase==='idle'&&!err&&<p className="odds">{ODDS[game]}</p>}
    {err&&<p role="alert" className="result result-lose"><span>{err}</span></p>}
   </div>
   {game==='roulette'&&<fieldset disabled={busy} className="bet-board">
    <legend className="sr-only">Choose a bet</legend>
    <div className="num-grid">
     <button onClick={()=>setChoice('n:0')} className={`num num-zero${choice==='n:0'?' picked':''}`} style={{background:numberColor(0)}}>0</button>
     {Array.from({length:36},(_,i)=>i+1).map(n=><button key={n} onClick={()=>setChoice(`n:${n}`)} className={`num${choice===`n:${n}`?' picked':''}`} style={{background:numberColor(n)}} aria-label={`Number ${n}, pays 36x`}>{n}</button>)}
    </div>
    <div className="outside">{ROULETTE_BETS.map(([k,l])=><button key={k} onClick={()=>setChoice(k)} className={`pick${choice===k?' picked':''}`}>{l} <small>{k[0]==='d'?'3x':'2x'}</small></button>)}</div>
   </fieldset>}
   {game==='dice'&&<fieldset disabled={busy} className="outside dice-bets"><legend className="sr-only">Choose a bet</legend>{DICE_BETS.map(([k,l,p])=><button key={k} onClick={()=>setChoice(k)} className={`pick${choice===k?' picked':''}`}>{l} <small>{p}</small></button>)}</fieldset>}
   <fieldset disabled={busy||flying} className="wager">
    <legend className="sr-only">Wager</legend>
    <label>Wager <input type="number" min={MIN_BET} step={10} value={wager||''} onChange={e=>setWager(Number(e.target.value))}/></label>
    <div className="chips">
     {QUICK.map(n=><button key={n} onClick={()=>setWager(n)} disabled={n>available} className={`chip chip-${n}`}>{n}</button>)}
     <button onClick={()=>setWager(Math.floor(wager/2))} className="pick">½</button>
     <button onClick={()=>setWager(Math.min(available,wager*2))} className="pick">2×</button>
     <button onClick={()=>setWager(available)} className="pick pick-allin">All in</button>
    </div>
   </fieldset>
   {flying
    ?<button ref={mainBtn} onClick={()=>{sfx.cash();cashOut(flightId.current)}} className="btn-primary btn-cash">Cash out {Math.floor(wager*mult).toLocaleString()}</button>
    :<button ref={mainBtn} disabled={!ok||busy} onClick={()=>void place()} className="btn-primary">
     {busy?'Rolling…':game==='crash'?`Launch for ${wager}`:phase==='done'?`Bet ${wager} again`:`Bet ${wager}`}</button>}
   {!ok&&!busy&&!flying&&<p className="panel-hint">{wager>available?'Not enough chips in the shared wallet.':`Minimum wager is ${MIN_BET}.`}</p>}
   <p className="panel-foot">Fictional chips. No cash value. Results are drawn by the host.</p>
  </div></div>}
