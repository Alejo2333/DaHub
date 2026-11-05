import type {BetReq,GameKind} from '../../../types/net'
export const SYMBOLS=['🍒','🍋','🔔','7️⃣','💎'],SYM_W=[40,30,20,8,2],SYM_PAY=[5,8,15,40,100]
export const WHEEL=[0,0,0,0,0,0,0,0,0.5,0.5,0.5,0.5,0.5,1.5,1.5,1.5,1.5,2,2,5]
export const REDS=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
/** Games whose wins are scaled by the Hot Machines upgrade. Roulette & crash are excluded so no stack can reach EV > 1. */
export const BOOSTABLE:GameKind[]=['slots','dice','wheel']
export const DICE_PAY={over:2.2,under:2.2,seven:5,doubles:5} as const
export const ODDS:Record<GameKind,string>={
 slots:'3 match: 🍒5x 🍋8x 🔔15x 7️⃣40x 💎100x. Exactly two 🍒 returns 0.5x. RTP ≈ 82%.',
 roulette:'Red/Black/Odd/Even/Low/High 2x. Dozens 3x. Single number 36x. 0 loses all outside bets. RTP ≈ 97.3%.',
 dice:'Over 7 / Under 7 pay 2.2x. Exactly 7 or Doubles pay 5x. RTP 83–92%.',
 wheel:'20 segments: 8× 0x, 5× 0.5x, 4× 1.5x, 2× 2x, 1× 5x. RTP 87.5%.',
 crash:'The multiplier climbs until it crashes, up to 100x. Cash out before it does. Win chance at multiplier m is 95%/m. RTP 95%.'}

/** Crash: the multiplier reached after `ms` of flight. Doubles roughly every 5 seconds, capped at 100x. */
export const crashMult=(ms:number)=>Math.min(100,1.07**(Math.max(0,ms)/500))
/** Crash: how long a flight lasts before reaching `point`. Inverse of crashMult. */
export const crashMs=(point:number)=>Math.log(point)/Math.log(1.07)*500
/** Crash: draw the hidden crash point. P(point >= m) = 0.95/m, so 5% of flights crash instantly at 1.00x. */
export const drawCrash=(rng:()=>number)=>Math.min(100,Math.max(1,Math.floor(95/(1-rng()))/100))

const pick=(w:number[],r:number)=>{let t=r*w.reduce((a,b)=>a+b,0);for(let i=0;i<w.length;i++){t-=w[i]!;if(t<0)return i}return w.length-1}
const rouletteMult=(c:string,n:number):number|null=>{
 if(c.startsWith('n:')){
  const t=Number(c.slice(2))
  if(c.length<3||!Number.isInteger(t)||t<0||t>36)return null
  return t===n?36:0}
 const inPlay=n>0
 switch(c){
  case 'red':return inPlay&&REDS.has(n)?2:0
  case 'black':return inPlay&&!REDS.has(n)?2:0
  case 'odd':return inPlay&&n%2===1?2:0
  case 'even':return inPlay&&n%2===0?2:0
  case 'low':return inPlay&&n<=18?2:0
  case 'high':return n>18?2:0
  case 'd1':return inPlay&&n<=12?3:0
  case 'd2':return n>12&&n<=24?3:0
  case 'd3':return n>24?3:0
  default:return null}}
export interface Outcome{payout:number;roll:unknown;detail:string}
/** Instant games only. Crash runs as a live flight on the Ledger. */
export function resolve(req:BetReq,rng:()=>number,boost=0):Outcome|null{
 const w=req.wager;let o:Outcome|null=null
 switch(req.game){
 case 'slots':{const r=[0,1,2].map(()=>pick(SYM_W,rng()));let m=0
  if(r[0]===r[1]&&r[1]===r[2])m=SYM_PAY[r[0]!]!;else if(r.filter(x=>x===0).length===2)m=0.5
  o={payout:Math.floor(w*m),roll:r,detail:r.map(i=>SYMBOLS[i]).join(' ')};break}
 case 'roulette':{const n=Math.floor(rng()*37),m=rouletteMult(String(req.choice),n)
  if(m===null)return null
  o={payout:w*m,roll:n,detail:`Ball landed on ${n}`};break}
 case 'dice':{const a=1+Math.floor(rng()*6),b=1+Math.floor(rng()*6),s=a+b,c=String(req.choice)
  const win=c==='over'?s>7:c==='under'?s<7:c==='seven'?s===7:c==='doubles'?a===b:null
  if(win===null)return null
  o={payout:win?Math.floor(w*DICE_PAY[c as keyof typeof DICE_PAY]):0,roll:[a,b],detail:`Rolled ${a} + ${b} = ${s}`};break}
 case 'wheel':{const i=Math.floor(rng()*WHEEL.length),m=WHEEL[i]!;o={payout:Math.floor(w*m),roll:i,detail:`Wheel hit ${m}x`};break}
 default:return null}
 if(o.payout>w&&BOOSTABLE.includes(req.game))o.payout=Math.floor(o.payout*(1+0.04*boost))
 return o}
