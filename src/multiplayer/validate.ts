import {GAME_KINDS,type BetReq,type Env,type GameKind,type GState,type Player,type Status} from '../types/net'

/**
 * Peers are untrusted, so every inbound message is checked here before the game sees it.
 * Returns the message when it is well formed and null otherwise.
 */
type Rec=Record<string,unknown>
const isRec=(x:unknown):x is Rec=>typeof x==='object'&&x!==null&&!Array.isArray(x)
const isNum=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)
const isStr=(x:unknown,max=64):x is string=>typeof x==='string'&&x.length<=max
const isKind=(x:unknown):x is GameKind=>GAME_KINDS.includes(x as GameKind)
const STATUSES:Status[]=['idle','connecting','lobby','playing','error']

const isPlayer=(x:unknown):x is Player=>isRec(x)&&isStr(x.id)&&isStr(x.name,32)&&typeof x.ready==='boolean'
const isPlayers=(x:unknown):x is Player[]=>Array.isArray(x)&&x.length<=16&&x.every(isPlayer)
const isBet=(x:unknown):x is BetReq=>isRec(x)&&isStr(x.id)&&isKind(x.game)&&isNum(x.wager)&&(isStr(x.choice,16)||isNum(x.choice))

export function isGState(x:unknown):x is GState{
 if(!isRec(x)||!isRec(x.stats)||!isRec(x.upgrades))return false
 const s=x.stats
 return (x.phase==='playing'||x.phase==='upgrades'||x.phase==='over')
  &&[x.balance,x.quota,x.floor,x.timeLeft,x.shield,x.bonus,s.bets,s.won,s.lost,s.peak,s.biggest].every(isNum)
  &&typeof x.loanUsed==='boolean'
  &&Object.values(x.upgrades).every(isNum)
}

export function parseEnv(raw:unknown):Env|null{
 if(!isRec(raw)||!isStr(raw.sid)||!isNum(raw.v))return null
 const m=raw
 const ok=(()=>{switch(m.t){
  case 'PLAYER_JOIN':return isStr(m.name,64)
  case 'PLAYER_LEAVE':return isStr(m.id)
  case 'PLAYER_READY':return typeof m.ready==='boolean'
  case 'PLAYER_MOVE':return isNum(m.x)&&isNum(m.y)
  case 'MACHINE_INTERACT':return isKind(m.machine)
  case 'GAME_START':case 'GAME_END':case 'WALLET_UPDATE':case 'FLOOR_COMPLETE':return isGState(m.game)
  case 'RETURN_TO_LOBBY':return isPlayers(m.players)
  case 'BET_REQUEST':return isBet(m.req)
  case 'BET_RESULT':return isStr(m.id)&&(m.err===undefined||isStr(m.err,200))&&(m.res===undefined||(isRec(m.res)&&isStr(m.res.id)&&isStr(m.res.from)&&isKind(m.res.game)&&isNum(m.res.wager)&&isNum(m.res.payout)&&isNum(m.res.net)&&isStr(m.res.detail,200)))
  case 'CRASH_LIVE':case 'CRASH_CASHOUT':case 'UPGRADE_PURCHASE':return isStr(m.id)
  case 'PAY_DEBT':case 'TAKE_LOAN':return true
  case 'TIMER_SYNC':return isNum(m.timeLeft)
  case 'ERROR':return isStr(m.msg,200)
  case 'NOTICE':return isStr(m.text,200)&&(m.tone==='win'||m.tone==='lose'||m.tone==='info')
  case 'STATE_SNAPSHOT':return isPlayers(m.players)&&isStr(m.hostId)&&STATUSES.includes(m.status as Status)&&(m.game===null||isGState(m.game))
  default:return false}})()
 return ok?raw as unknown as Env:null
}
