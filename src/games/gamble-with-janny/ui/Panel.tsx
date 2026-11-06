import {useCallback,useEffect,useMemo,useRef,useState} from 'react'
import {useCasino,useGame} from '../store'
import {newId} from '../../../multiplayer/party'
import {announceResult,cashOut,sendBet} from '../net/client'
import {crashMult,ODDS} from '../mechanics/payouts'
import {CUP_PAYS,DICE_PAYS,ROULETTE_PAYS,VAULT_PAYS} from '../mechanics/odds'
import {minBetFor} from '../mechanics/engine'
import {GAME_LABELS,HOT_WIN,ruleFor} from '../mechanics/floors'
import {simpleOf} from '../mechanics/simple'
import {sfx} from '../../../utils/sound'
import type {BetResult,GameKind} from '../types'
import {CrashStage,CupsStage,DiceStage,numberColor,REVEAL_MS,RouletteStage,SimpleStage,SlotsStage,VaultStage,WheelStage} from './stages'

const ICONS:Partial<Record<GameKind,string>>={slots:'🎰',roulette:'🎡',dice:'🎲',wheel:'🍀',crash:'🚀',cups:'🥤',vault:'🔐'}
const SIMPLE_REVEAL_MS=1200
/** Machines where the player picks a bet, with the bet each one starts on. */
const FIRST_CHOICE:Partial<Record<GameKind,string>>={roulette:'red',dice:'over',cups:'1',vault:'v2'}
const VAULT_BETS:[string,string,string][]=[['v1','1 lock',`${VAULT_PAYS.v1}x`],['v2','2 locks',`${VAULT_PAYS.v2}x`],['v3','3 locks',`${VAULT_PAYS.v3}x`],['v4','4 locks',`${VAULT_PAYS.v4}x`]]
const pctChange=(m:number)=>`${m>1?'+':''}${Math.round((m-1)*100)}%`
const ROULETTE_BETS:[string,string][]=[['red','Red'],['black','Black'],['odd','Odd'],['even','Even'],['low','1–18'],['high','19–36'],['d1','1st 12'],['d2','2nd 12'],['d3','3rd 12']]
const DICE_BETS:[string,string,string][]=[['under','Under 7',`${DICE_PAYS.under}x`],['over','Over 7',`${DICE_PAYS.over}x`],['seven','Exactly 7',`${DICE_PAYS.seven}x`],['doubles','Doubles',`${DICE_PAYS.doubles}x`]]
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
 const balance=useGame(g=>g?.balance??0),hold=useCasino(s=>s.hold),floor=useGame(g=>g?.floor??1),event=useGame(g=>g?.event??null)
 const [wager,setWagerRaw]=useState(rememberedWager)
 const simple=simpleOf(game)
 const [choice,setChoice]=useState(simple?simple.options[0]!.id:FIRST_CHOICE[game]??'')
 const minBet=minBetFor(floor),ruleWin=ruleFor(floor).wins?.[game],hot=event?.kind==='hot'&&event.machine===game,closed=event?.kind==='cut'&&event.machine===game
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
 const ok=wager>=minBet&&wager<=available&&!closed

 /** Publishes the result to the HUD, feed and casino scene. Runs once per bet. */
 const reveal=useCallback(()=>{
  const r=unannounced.current;if(!r)return
  unannounced.current=null
  useCasino.setState({hold:0});announceResult(r)},[])
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
   const r=await sendBet({id,game,wager,choice:choice||0},()=>{sfx.launch();setPhase('flying')})
   if(game==='crash'){setRoll(r.roll);unannounced.current=r;finish(r);return}
   // Hide the outcome from the HUD until the animation lands.
   unannounced.current=r
   useCasino.setState({hold:r.net})
   setRoll(r.roll);setPhase('revealing')
   setTimeout(()=>{if(unannounced.current===r)finish(r)},reduced()?150:REVEAL_MS[game]??SIMPLE_REVEAL_MS)
  }catch(e){setErr(e instanceof Error?e.message:'Bet rejected.');setPhase('idle')}}

 const tone=result?(result.net>0?'win':result.net<0?'lose':'even'):''
 const crashState=flying||phase==='waiting'&&game==='crash'?'flying':result?(result.net>0||(result.net===0&&(result.detail.startsWith('Cashed')))?'cashed':'busted'):'idle'
 const stage=simple?<SimpleStage game={simple} busy={busy} roll={roll as number|null}/>
  :game==='slots'?<SlotsStage spinning={busy} roll={roll as number[]|null} win={phase==='done'&&(result?.net??0)>0}/>
  :game==='roulette'?<RouletteStage spinning={busy} roll={roll as number|null}/>
  :game==='dice'?<DiceStage roll={roll as number[]|null}/>
  :game==='wheel'?<WheelStage roll={roll as number|null}/>
  :game==='cups'?<CupsStage busy={busy} roll={roll as number|null} picked={Number(choice)}/>
  :game==='vault'?<VaultStage roll={roll as {opened:number;target:number}|null} locks={Number(choice.slice(1))}/>
  :<CrashStage key={flightId.current} mult={mult} state={crashState} point={typeof roll==='number'?roll:null}/>

 const title=game==='slots'?'Slot Machine':GAME_LABELS[game]
 return <div role="dialog" aria-modal="true" aria-label={title} className="panel-backdrop">
  <div className={`panel panel-${game}`}>
   <header className="panel-head">
    <h2><span aria-hidden="true">{simple?.icon??ICONS[game]}</span> {title}</h2>
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
     {Array.from({length:36},(_,i)=>i+1).map(n=><button key={n} onClick={()=>setChoice(`n:${n}`)} className={`num${choice===`n:${n}`?' picked':''}`} style={{background:numberColor(n)}} aria-label={`Number ${n}, pays ${ROULETTE_PAYS.number}x`}>{n}</button>)}
    </div>
    <div className="outside">{ROULETTE_BETS.map(([k,l])=><button key={k} onClick={()=>setChoice(k)} className={`pick${choice===k?' picked':''}`}>{l} <small>{k[0]==='d'?ROULETTE_PAYS.dozen:ROULETTE_PAYS.outside}x</small></button>)}</div>
   </fieldset>}
   {game==='dice'&&<fieldset disabled={busy} className="outside dice-bets"><legend className="sr-only">Choose a bet</legend>{DICE_BETS.map(([k,l,p])=><button key={k} onClick={()=>setChoice(k)} className={`pick${choice===k?' picked':''}`}>{l} <small>{p}</small></button>)}</fieldset>}
   {simple&&simple.options.length>1&&<fieldset disabled={busy} className="outside dice-bets"><legend className="sr-only">Choose a bet</legend>{simple.options.map(o=><button key={o.id} onClick={()=>setChoice(o.id)} className={`pick${choice===o.id?' picked':''}`}>{o.label} <small>{Math.max(...o.pays)}x</small></button>)}</fieldset>}
   {game==='cups'&&<fieldset disabled={busy} className="outside dice-bets"><legend className="sr-only">Choose a cup</legend>{[0,1,2].map(i=><button key={i} onClick={()=>setChoice(String(i))} className={`pick${choice===String(i)?' picked':''}`}>Cup {i+1} <small>{CUP_PAYS}x</small></button>)}</fieldset>}
   {game==='vault'&&<fieldset disabled={busy} className="outside dice-bets"><legend className="sr-only">Choose how many locks</legend>{VAULT_BETS.map(([k,l,p])=><button key={k} onClick={()=>setChoice(k)} className={`pick${choice===k?' picked':''}`}>{l} <small>{p}</small></button>)}</fieldset>}
   {(ruleWin||hot)&&<p className="panel-perk">{ruleWin&&`House rule: wins pay ${pctChange(ruleWin)}. `}{hot&&`Running hot: wins pay ${pctChange(HOT_WIN)}.`}</p>}
   <fieldset disabled={busy||flying} className="wager">
    <legend className="sr-only">Wager</legend>
    <label>Wager <input type="number" min={minBet} step={10} value={wager||''} onChange={e=>setWager(Number(e.target.value))}/></label>
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
   {!ok&&!busy&&!flying&&<p className="panel-hint">{closed?'Power cut: this machine is closed for now.':wager>available?'Not enough chips in the shared wallet.':`Minimum wager is ${minBet}.`}</p>}
   <p className="panel-foot">Fictional chips. No cash value. Results are drawn by the host.</p>
  </div></div>}
