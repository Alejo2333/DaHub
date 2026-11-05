import {openRoom,relayConnected,selfId,type Room} from './room'
import {parseEnv} from './validate'
import {positions,useApp} from '../stores/app'
import {Ledger} from '../games/lucky-debt/mechanics/engine'
import {crashMs} from '../games/lucky-debt/mechanics/payouts'
import type {BetReq,BetResult,Env,GameKind,Msg,Tone} from '../types/net'
export {selfId}
export const MAX_PLAYERS=6
const BET_TIMEOUT=8000,FLIGHT_TIMEOUT=60000,JOIN_TIMEOUT=30000
interface Pending{resolve:(r:BetResult)=>void;reject:(e:Error)=>void;onLive?:()=>void;timer:ReturnType<typeof setTimeout>}
let room:Room|null=null,v=0,lastV=-1,ledger:Ledger|null=null,feedId=0,fxN=0
let ticker:ReturnType<typeof setInterval>|undefined,jt:ReturnType<typeof setTimeout>|undefined
const pending=new Map<string,Pending>(),flightTimers=new Map<string,ReturnType<typeof setTimeout>>()
const st=useApp.getState,set=useApp.setState
export const isHost=()=>st().hostId===selfId
export const newId=()=>crypto.randomUUID()
const clone=<T,>(x:T):T=>JSON.parse(JSON.stringify(x)) as T
const nameOf=(id:string)=>id===selfId?st().name:st().players.find(p=>p.id===id)?.name??'Someone'
export const addFeed=(text:string,tone:Tone='info')=>set(s=>({feed:[{id:++feedId,text,tone},...s.feed].slice(0,6)}))
/** Fires the casino effects and feed line for a finished bet. The bettor's own panel calls this once its animation lands. */
export function announceResult(r:BetResult){
 addFeed(`${nameOf(r.from)} · ${r.game}: ${r.net>=0?'+':''}${r.net}`,r.net>0?'win':r.net<0?'lose':'info')
 set({fx:{n:++fxN,result:r}})}

/** Settles the promise returned by sendBet. Unknown ids are ignored. */
function settle(id:string,res:BetResult|null,err?:string){
 const p=pending.get(id);if(!p)return
 pending.delete(id);clearTimeout(p.timer)
 if(res)p.resolve(res);else p.reject(new Error(err??'Bet rejected.'))}
function clearFlightTimers(){for(const t of flightTimers.values())clearTimeout(t);flightTimers.clear()}
const fail=(error:string)=>{cleanup();set({status:'error',error,game:null,players:[],hostId:'',sid:''})}
function cleanup(){
 clearInterval(ticker);clearTimeout(jt);clearFlightTimers()
 for(const id of[...pending.keys()])settle(id,null,'Disconnected from the party.')
 room?.leave();room=null;ledger=null
 for(const k of Object.keys(positions))delete positions[k]}
/** Host broadcast: bumps the version, sends to peers, then applies locally through the same code path. */
function bc(m:Msg){v++;const e={...clone(m),sid:st().sid,v} as Env;room?.send(e);handle(e,selfId)}
const snap=()=>bc({t:'STATE_SNAPSHOT',players:st().players,hostId:st().hostId,status:st().status,game:ledger?.g??null})
function priv(to:string,m:Msg){const e={...m,sid:st().sid,v:0} as Env;if(to===selfId)handle(e,selfId);else room?.send(e,to)}
/** Sends a request to the host, or runs it directly if this client is the host. */
function toHost(m:Msg,run:()=>void){if(isHost())run();else room?.send({...m,sid:st().sid,v:0} as Env,st().hostId)}

const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode=()=>[...crypto.getRandomValues(new Uint8Array(6))].map(b=>CODE_CHARS[b%CODE_CHARS.length]).join('')
export const cleanCode=(c:string)=>c.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,8)

export function connect(role:'host'|'join',name:string,code?:string){
 cleanup();v=0;lastV=-1
 const c=cleanCode(code??newCode())
 set({name,code:c,error:'',sid:'',game:null,feed:[],fx:null,toast:'',hold:0,players:[],hostId:role==='host'?selfId:'',status:'connecting'})
 try{room=openRoom(c,onRecv,id=>{if(!isHost())room?.send({t:'PLAYER_JOIN',name:st().name,sid:'',v:0},id)},onLeave)}
 catch(e){return fail('Could not open the room: '+String(e))}
 if(role==='host')set({players:[{id:selfId,name,ready:true}],status:'lobby'})
 else jt=setTimeout(()=>{if(st().status==='connecting')fail(relayConnected()
  ?'No host answered. Check the room code and that the host still has the party page open (refreshing it ends the party). If both are right, your network may be blocking the connection.'
  :'Could not reach the matchmaking servers. Check your connection or disable any VPN or ad blocker.')},JOIN_TIMEOUT)}
export const leave=()=>{cleanup();set({status:'idle',players:[],hostId:'',game:null,sid:'',code:'',hold:0})}
function onLeave(id:string){
 delete positions[id]
 if(!isHost()){if(id===st().hostId)fail('The host left, so this session has ended.');return}
 if(!st().players.some(p=>p.id===id))return
 const name=nameOf(id)
 if(ledger)publish(ledger.cashAll(id))
 set(s=>({players:s.players.filter(p=>p.id!==id)}));bc({t:'PLAYER_LEAVE',id});bc({t:'NOTICE',text:`${name} left the party`,tone:'info'});snap()}
export function setReady(ready:boolean){if(!isHost())room?.send({t:'PLAYER_READY',ready,sid:'',v:0},st().hostId)}
export function startGame(){
 const s=st();if(!isHost()||s.status!=='lobby'||!s.players.every(p=>p.ready))return
 ledger=new Ledger();set({sid:newId(),status:'playing'});bc({t:'GAME_START',game:ledger.g})
 clearInterval(ticker);ticker=setInterval(hostTick,1000)}
function hostTick(){
 if(!ledger)return
 // Flights can't outlive the round, so they cash out on its final second.
 if(ledger.g.phase==='playing'&&ledger.g.timeLeft<=1)publish(ledger.cashAll())
 if(ledger.g.phase!=='playing')return
 const r=ledger.tick()
 if(r==='floor')bc({t:'FLOOR_COMPLETE',game:ledger.g});else if(r==='over')bc({t:'GAME_END',game:ledger.g})
 else bc({t:'TIMER_SYNC',timeLeft:ledger.g.timeLeft})}
export function returnToLobby(){
 if(!isHost())return;clearInterval(ticker);clearFlightTimers();ledger=null
 const players=st().players.map(p=>({...p,ready:p.id===selfId}));set({players,status:'lobby'});bc({t:'RETURN_TO_LOBBY',players});set({sid:''})}

/** Places a bet. Resolves with the result, or rejects with a message to show the player. For crash, `onLive` fires when the flight starts. */
export function sendBet(req:BetReq,onLive?:()=>void):Promise<BetResult>{
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>settle(req.id,null,'The host did not respond. Try again.'),BET_TIMEOUT)
  pending.set(req.id,{resolve,reject,onLive,timer})
  toHost({t:'BET_REQUEST',req},()=>hostBet(selfId,req))})}
export const cashOut=(id:string)=>toHost({t:'CRASH_CASHOUT',id},()=>hostCash(selfId,id))
export const buyUpgrade=(id:string)=>toHost({t:'UPGRADE_PURCHASE',id},()=>hostBuy(selfId,id))
export const payDebt=()=>toHost({t:'PAY_DEBT'},()=>hostPay(selfId))
export const takeLoan=()=>toHost({t:'TAKE_LOAN'},()=>hostLoan(selfId))
export function nextFloor(){if(isHost()&&ledger?.nextFloor())bc({t:'WALLET_UPDATE',game:ledger.g})}
export function sendMove(x:number,y:number){if(st().status==='playing')room?.send({t:'PLAYER_MOVE',x,y,sid:st().sid,v:0})}
export function announceMachine(machine:GameKind){if(st().status!=='playing')return;room?.send({t:'MACHINE_INTERACT',machine,sid:st().sid,v:0});addFeed(`${st().name} sat at ${machine}`)}

/** Broadcasts finished bets, then the wallet, then game over if those bets ended the run. */
function publish(results:BetResult[]){
 if(!ledger||!results.length)return
 for(const res of results){clearTimeout(flightTimers.get(res.id));flightTimers.delete(res.id);bc({t:'BET_RESULT',id:res.id,res})}
 afterWallet()}
function afterWallet(){
 if(!ledger)return
 bc({t:ledger.g.phase==='over'?'GAME_END':'WALLET_UPDATE',game:ledger.g})}
function hostBet(from:string,req:BetReq){
 if(!ledger)return priv(from,{t:'BET_RESULT',id:req.id,err:'The round is not active.'})
 if(req.game==='crash'){
  const {flight,err}=ledger.launch(req,from)
  if(!flight)return priv(from,{t:'BET_RESULT',id:req.id,err:err??'Bet rejected.'})
  priv(from,{t:'CRASH_LIVE',id:flight.id})
  flightTimers.set(flight.id,setTimeout(()=>{const res=ledger?.bust(flight.id);if(res)publish([res])},crashMs(flight.point)))
  afterWallet()
  return}
 const {res,err}=ledger.bet(req)
 if(!res)return priv(from,{t:'BET_RESULT',id:req.id,err:err??'Bet rejected.'})
 res.from=from
 publish([res])}
function hostCash(from:string,id:string){
 if(!ledger)return
 const {res}=ledger.cashOut(id,from) // No flight means it already crashed, and the bettor has been told.
 if(res)publish([res])}
function hostBuy(from:string,id:string){
 if(!ledger)return;const err=ledger.buy(id)
 if(err)return priv(from,{t:'BET_RESULT',id:'upgrade',err})
 bc({t:'WALLET_UPDATE',game:ledger.g});bc({t:'NOTICE',text:`${nameOf(from)} bought an upgrade`,tone:'info'})}
function hostPay(from:string){
 if(!ledger||ledger.g.phase!=='playing'||ledger.g.balance<ledger.g.quota)return
 publish(ledger.cashAll())
 const bonus=ledger.payDebt()
 if(bonus===null)return
 bc({t:'FLOOR_COMPLETE',game:ledger.g});bc({t:'NOTICE',text:`${nameOf(from)} paid the debt early · +${bonus} bonus`,tone:'win'})}
function hostLoan(from:string){
 if(!ledger?.takeLoan())return
 bc({t:'WALLET_UPDATE',game:ledger.g});bc({t:'NOTICE',text:`${nameOf(from)} called the loan shark`,tone:'lose'})}

function onRecv(raw:unknown,from:string){const e=parseEnv(raw);if(e)handle(e,from)}
function handle(e:Env,from:string){
 const s=st()
 if(e.t==='PLAYER_MOVE'){if(e.sid===s.sid&&from!==selfId)positions[from]={x:e.x,y:e.y};return}
 if(e.t==='MACHINE_INTERACT'){if(e.sid===s.sid)addFeed(`${nameOf(from)} sat at ${e.machine}`);return}
 if(isHost()&&from!==selfId){ // inbound requests, host only
  if(e.t==='PLAYER_JOIN'){
   if(s.players.some(p=>p.id===from))return
   if(s.players.length>=MAX_PLAYERS)return priv(from,{t:'ERROR',msg:`This party is full (${MAX_PLAYERS}/${MAX_PLAYERS}).`})
   set({players:[...s.players,{id:from,name:e.name.trim().slice(0,16)||'Player',ready:false}]});snap();return}
  if(!s.players.some(p=>p.id===from))return // only party members may act
  switch(e.t){
  case 'PLAYER_READY':set({players:s.players.map(p=>p.id===from?{...p,ready:e.ready}:p)});snap();return
  case 'BET_REQUEST':if(e.sid===s.sid)hostBet(from,e.req);return
  case 'CRASH_CASHOUT':if(e.sid===s.sid)hostCash(from,e.id);return
  case 'UPGRADE_PURCHASE':if(e.sid===s.sid)hostBuy(from,e.id);return
  case 'PAY_DEBT':if(e.sid===s.sid)hostPay(from);return
  case 'TAKE_LOAN':if(e.sid===s.sid)hostLoan(from);return}
  return}
 // Only the host we joined may send state. The very first snapshot is what tells us who that is.
 const knownHost=from===selfId||(s.hostId!==''&&from===s.hostId)
 const joining=s.hostId===''&&s.status==='connecting'
 const fromHost=knownHost||(joining&&(e.t==='ERROR'||(e.t==='STATE_SNAPSHOT'&&e.hostId===from)))
 if(!fromHost)return
 if(e.t==='STATE_SNAPSHOT'&&e.hostId!==s.hostId&&!joining)return
 if(e.t==='ERROR'){fail(e.msg);return}
 if(e.t==='BET_RESULT'&&e.err){
  if(e.id==='upgrade')set({toast:e.err});else settle(e.id,null,e.err)
  return}
 if(e.t==='CRASH_LIVE'){pending.get(e.id)?.onLive?.();const p=pending.get(e.id);if(p){clearTimeout(p.timer);p.timer=setTimeout(()=>settle(e.id,null,'Lost contact with the host.'),FLIGHT_TIMEOUT)}return}
 if(e.v<=lastV)return // stale or duplicate
 if(e.t!=='STATE_SNAPSHOT'&&e.t!=='GAME_START'&&e.sid!==s.sid)return // other session
 lastV=e.v
 switch(e.t){
 case 'STATE_SNAPSHOT':clearTimeout(jt);set({players:e.players,hostId:e.hostId,status:e.status,sid:e.sid,game:e.game});break
 case 'GAME_START':set({sid:e.sid,status:'playing',game:e.game,feed:[],fx:null,toast:'',hold:0});for(const k of Object.keys(positions))delete positions[k];break
 case 'WALLET_UPDATE':case 'FLOOR_COMPLETE':case 'GAME_END':set({game:e.game});break
 case 'TIMER_SYNC':set(x=>({game:x.game?{...x.game,timeLeft:e.timeLeft}:null}));break
 case 'BET_RESULT':if(e.res){
  const r=e.res
  // The bettor's panel announces its own result when the animation finishes.
  if(pending.has(r.id))settle(r.id,r);else if(r.from!==selfId)announceResult(r)}
  break
 case 'NOTICE':addFeed(e.text,e.tone);break
 case 'PLAYER_LEAVE':set(x=>({players:x.players.filter(p=>p.id!==e.id)}));break
 case 'RETURN_TO_LOBBY':set({status:'lobby',game:null,sid:'',players:e.players,fx:null,hold:0});break}}
if(typeof window!=='undefined')window.addEventListener('beforeunload',()=>room?.leave())
