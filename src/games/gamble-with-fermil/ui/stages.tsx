import {useEffect,useMemo,useRef,useState} from 'react'
import {REDS,SYMBOLS,WHEEL} from '../mechanics/payouts'
import {sfx} from '../../../utils/sound'
import {wheelColor,WHEEL_ORDER} from './wheelLayout'
import type {SimpleGame} from '../mechanics/simple'

/** How long each game's reveal animation takes once the result is known. */
export const REVEAL_MS:Record<string,number>={slots:1500,roulette:3400,dice:1300,wheel:3200,crash:0,cups:1400,vault:1800}

const after=(fn:()=>void,ms:number)=>{const t=setTimeout(fn,ms);return()=>clearTimeout(t)}

/* ---------- Slots ---------- */
const STRIP=[...SYMBOLS,...SYMBOLS,...SYMBOLS]
export function SlotsStage({spinning,roll,win}:{spinning:boolean;roll:number[]|null;win:boolean}){
 // A reel shows its final symbol only once it has been told to stop.
 const [stopped,setStopped]=useState([true,true,true])
 const [shown,setShown]=useState<number[]>([3,3,3])
 useEffect(()=>{if(spinning)setStopped([false,false,false])},[spinning])
 useEffect(()=>{
  if(!roll)return
  setShown(roll)
  const off=[500,900,1300].map((ms,i)=>after(()=>{setStopped(s=>s.map((v,j)=>j===i?true:v));sfx.reelStop()},ms))
  return()=>off.forEach(f=>f())},[roll])
 return <div className="slots-stage">
  {[0,1,2].map(i=><div key={i} className={`reel${stopped[i]&&win?' reel-win':''}`}>
   {stopped[i]
    ?<div key={shown[i]} className="reel-symbol reel-land">{SYMBOLS[shown[i]!]??'❔'}</div>
    :<div className="reel-strip" style={{animationDuration:`${.32+i*.06}s`}}>{STRIP.map((s,k)=><div key={k} className="reel-symbol">{s}</div>)}</div>}
  </div>)}
 </div>}

/* ---------- Roulette ---------- */
const POCKETS=[0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26]
const pocketColor=(n:number)=>n===0?'#0f8c50':REDS.has(n)?'#c8123a':'#17121c'
export const numberColor=pocketColor
const polar=(deg:number,r:number)=>{const a=(deg-90)*Math.PI/180;return[100+Math.cos(a)*r,100+Math.sin(a)*r] as const}
function RouletteFace(){
 const step=360/37
 return <>
  <circle cx="100" cy="100" r="98" fill="#32170b" stroke="#a8791c" strokeWidth="3"/>
  {POCKETS.map((n,i)=>{
   const a=i*step-step/2,[x1,y1]=polar(a,92),[x2,y2]=polar(a+step,92),[x3,y3]=polar(a+step,66),[x4,y4]=polar(a,66),[tx,ty]=polar(a+step/2,81)
   return <g key={n}>
    <path d={`M${x1} ${y1}A92 92 0 0 1 ${x2} ${y2}L${x3} ${y3}A66 66 0 0 0 ${x4} ${y4}Z`} fill={pocketColor(n)} stroke="#a8791c" strokeWidth=".5"/>
    <text x={tx} y={ty} fill="#fff" fontSize="8" fontWeight="700" textAnchor="middle" dominantBaseline="central" transform={`rotate(${a+step/2} ${tx} ${ty})`}>{n}</text></g>})}
  <circle cx="100" cy="100" r="66" fill="#5a2d18" stroke="#a8791c" strokeWidth="2"/>
  <circle cx="100" cy="100" r="42" fill="#32170b" stroke="#a8791c"/>
  <circle cx="100" cy="100" r="9" fill="#ffc94a"/>
  <path d="M100 66V134M66 100H134" stroke="#ffc94a" strokeWidth="3" strokeLinecap="round"/>
 </>}
export function RouletteStage({spinning,roll}:{spinning:boolean;roll:number|null}){
 const [angle,setAngle]=useState(0)
 const [settling,setSettling]=useState(false)
 useEffect(()=>{
  if(roll===null)return
  const idx=POCKETS.indexOf(roll),step=360/37
  setSettling(true)
  // Land the chosen pocket under the ball at the top, after several full turns.
  setAngle(a=>Math.ceil(a/360)*360+360*5-idx*step)
  return after(()=>setSettling(false),3200)},[roll])
 return <div className="roulette-stage">
  <svg viewBox="0 0 200 200" className="roulette-wheel" style={{transform:`rotate(${angle}deg)`}} aria-hidden="true"><RouletteFace/></svg>
  <div className={`roulette-ball${spinning&&settling?' ball-orbit':''}`}/>
  {!spinning&&roll!==null&&<div className="roulette-number" style={{background:pocketColor(roll)}}>{roll}</div>}
 </div>}

/* ---------- Dice ---------- */
const PIPS:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]}
const FACE_ROT:Record<number,[number,number]>={1:[0,0],6:[0,180],2:[0,-90],5:[0,90],3:[-90,0],4:[90,0]}
const FACE_CLASS:Record<number,string>={1:'front',6:'back',2:'right',5:'left',3:'top',4:'bottom'}
function Die({value,spin}:{value:number|null;spin:number}){
 const [rx,ry]=FACE_ROT[value??1]??[0,0]
 return <div className="die-wrap"><div className="die" style={{transform:`rotateX(${rx+spin*360*3}deg) rotateY(${ry+spin*360*2}deg)`}}>
  {[1,2,3,4,5,6].map(f=><div key={f} className={`die-face die-${FACE_CLASS[f]}`}>{Array.from({length:9},(_,i)=><span key={i} className={PIPS[f]!.includes(i)?'pip':''}/>)}</div>)}
 </div></div>}
export function DiceStage({roll}:{roll:number[]|null}){
 const [spin,setSpin]=useState(0)
 useEffect(()=>{if(roll){setSpin(s=>s+1);sfx.dice()}},[roll])
 return <div className="dice-stage"><Die value={roll?.[0]??null} spin={spin}/><Die value={roll?.[1]??null} spin={spin+1}/></div>}

/* ---------- Lucky wheel ---------- */
function WheelFace(){
 const n=WHEEL.length,step=360/n
 return <>
  <circle cx="100" cy="100" r="98" fill="#a8791c" stroke="#ffc94a" strokeWidth="2"/>
  {WHEEL_ORDER.map((idx,pos)=>{
   const m=WHEEL[idx]!,a=pos*step-step/2,[x1,y1]=polar(a,92),[x2,y2]=polar(a+step,92),[tx,ty]=polar(a+step/2,70)
   return <g key={pos}>
    <path d={`M100 100L${x1} ${y1}A92 92 0 0 1 ${x2} ${y2}Z`} fill={wheelColor(m)} stroke="#120620" strokeWidth=".7"/>
    <text x={tx} y={ty} fill={m===5?'#2a1a00':'#fff'} fontSize="10" fontWeight="800" textAnchor="middle" dominantBaseline="central" transform={`rotate(${a+step/2} ${tx} ${ty})`}>{m}x</text></g>})}
  <circle cx="100" cy="100" r="17" fill="#ffc94a" stroke="#5a3c0c" strokeWidth="2"/>
 </>}
export function WheelStage({roll}:{roll:number|null}){
 const [angle,setAngle]=useState(0)
 useEffect(()=>{
  if(roll===null)return
  const pos=WHEEL_ORDER.indexOf(roll),step=360/WHEEL.length
  // A small offset stops it landing dead centre on every spin.
  const nudge=(Math.random()-.5)*step*.7
  setAngle(a=>Math.ceil(a/360)*360+360*5-pos*step+nudge)
  // Clicks that slow down along with the wheel.
  let delay=60,elapsed=0,timer:ReturnType<typeof setTimeout>|undefined
  const tick=()=>{sfx.tick();elapsed+=delay;delay*=1.09;if(elapsed<2900)timer=setTimeout(tick,delay)}
  tick()
  return()=>clearTimeout(timer)},[roll])
 return <div className="wheel-stage">
  <div className="wheel-pointer"/>
  <svg viewBox="0 0 200 200" className="lucky-wheel" style={{transform:`rotate(${angle}deg)`}} aria-hidden="true"><WheelFace/></svg>
 </div>}

/* ---------- Shell game ---------- */
export function CupsStage({busy,roll,picked}:{busy:boolean;roll:number|null;picked:number}){
 const [lifted,setLifted]=useState(false)
 useEffect(()=>{
  setLifted(false)
  if(roll===null)return
  return after(()=>{setLifted(true);sfx.reelStop()},1000)},[roll])
 return <div className={`cups-stage${busy&&!lifted?' cups-shuffle':''}`}>
  {[0,1,2].map(i=><div key={i} className={`cup-slot${i===picked?' cup-picked':''}`}>
   {lifted&&roll===i&&<span className="cup-coin">🪙</span>}
   <div className={`cup${lifted&&(roll===i||picked===i)?' cup-up':''}`}/>
  </div>)}
 </div>}

/* ---------- Vault cracker ---------- */
export function VaultStage({roll,locks}:{roll:{opened:number;target:number}|null;locks:number}){
 const [tried,setTried]=useState(0)
 useEffect(()=>{
  setTried(0)
  if(!roll)return
  // Locks are tried in order, and the first one that holds ends the attempt.
  const last=Math.min(roll.opened+1,roll.target);let n=0
  const t=setInterval(()=>{setTried(++n);sfx.tick();if(n>=last)clearInterval(t)},400)
  return()=>clearInterval(t)},[roll])
 return <div className="vault-stage"><div className="vault-door">
  {Array.from({length:roll?.target??locks},(_,i)=>{
   const done=roll&&i<tried,open=done&&i<roll.opened
   return <span key={i} className={`vault-lock${done?' vault-lock-done':''}`}>{open?'🔓':done?'💥':'🔒'}</span>})}
 </div></div>}

/* ---------- Table-driven games ---------- */
export function SimpleStage({game,busy,roll}:{game:SimpleGame;busy:boolean;roll:number|null}){
 const [i,setI]=useState(0),n=game.faces.length
 useEffect(()=>{
  if(!busy)return
  const t=setInterval(()=>{setI(x=>(x+1)%n);sfx.tick()},110)
  return()=>clearInterval(t)},[busy,n])
 const face=busy?game.faces[i]!.face:roll!==null?game.faces[roll]?.face:null
 const [emoji,...text]=(face??'').split(' ')
 return <div className={`simple-stage${busy?' simple-busy':''}`}>
  <span key={busy?'spin':String(roll)} className="simple-icon">{face?emoji:game.icon}</span>
  <p>{face?text.join(' '):game.label}</p>
 </div>}

/* ---------- Crash ---------- */
export function CrashStage({mult,state,point}:{mult:number;state:'idle'|'flying'|'busted'|'cashed';point:number|null}){
 const trail=useRef<[number,number][]>([])
 if(state==='idle')trail.current=[]
 else if(state==='flying')trail.current.push([trail.current.length,mult])
 const pts=trail.current
 const {path,x,y,angle}=useMemo(()=>{
  const n=Math.max(pts.length,60),top=Math.log(Math.max(mult,2))
  const px=(i:number)=>14+i/n*290,py=(m:number)=>138-Math.log(m)/top*116
  const line=pts.filter((_,i)=>i%2===0||i===pts.length-1).map(([i,m])=>`${px(i).toFixed(1)},${py(m).toFixed(1)}`).join(' ')
  const last=pts[pts.length-1],prev=pts[Math.max(0,pts.length-6)]
  const lx=last?px(last[0]):14,ly=last?py(last[1]):138
  const px0=prev?px(prev[0]):lx-1,py0=prev?py(prev[1]):ly
  return{path:line,x:lx,y:ly,angle:Math.atan2(ly-py0,lx-px0)*180/Math.PI}},[pts.length,mult,pts])
 const tone=state==='busted'?'#ff4d6d':state==='cashed'?'#ffc94a':'#5cff9d'
 return <div className={`crash-stage${state==='busted'?' stage-shake':''}`}>
  <svg viewBox="0 0 320 150" className="crash-graph" aria-hidden="true">
   {[0,1,2,3].map(i=><line key={i} x1="14" x2="310" y1={22+i*38.6} y2={22+i*38.6} stroke="rgba(255,255,255,.08)"/>)}
   <line x1="14" y1="138" x2="310" y2="138" stroke="rgba(255,255,255,.25)"/><line x1="14" y1="12" x2="14" y2="138" stroke="rgba(255,255,255,.25)"/>
   {path&&<polyline points={path} fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>}
   {state!=='idle'&&<g transform={`translate(${x} ${y})`}>
    {state==='busted'?<text textAnchor="middle" dominantBaseline="central" fontSize="30">💥</text>
     :<g transform={`rotate(${angle+45})`}><text textAnchor="middle" dominantBaseline="central" fontSize="22">🚀</text></g>}</g>}
  </svg>
  <div className="crash-mult" style={{color:tone}}>
   {state==='idle'?'Ready':state==='busted'?`Crashed ${(point??mult).toFixed(2)}x`:`${mult.toFixed(2)}x`}
  </div>
 </div>}
