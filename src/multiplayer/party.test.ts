import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {useApp} from '../stores/app'
import {parseEnv} from './validate'
import type {GState,Player} from '../types/net'

// A fake network: `recv` delivers a message as if it came from a peer, `sent` records what we sent.
const net=vi.hoisted(()=>({recv:null as null|((d:unknown,from:string)=>void),sent:[] as [any,string?][],relayOpen:true}))
vi.mock('trystero/nostr',()=>({
 selfId:'SELF',
 getRelaySockets:()=>({relay:{readyState:net.relayOpen?1:3}}),
 joinRoom:()=>({
  makeAction:()=>[async(d:unknown,to?:string)=>{net.sent.push([d,to])},(cb:(d:unknown,from:string)=>void)=>{net.recv=cb}],
  onPeerJoin(){},onPeerLeave(){},leave:async()=>{}})}))
import {buyUpgrade,cashOut,connect,leave,newId,payDebt,sendBet,startGame,takeLoan} from './party'

const peers:Player[]=[{id:'H',name:'Host',ready:true},{id:'SELF',name:'Me',ready:false}]
const snapshot=(hostId:string,v:number,game:GState|null=null)=>({t:'STATE_SNAPSHOT',players:peers,hostId,status:'lobby',game,sid:'',v})
const hostGame=()=>useApp.getState().game!
const startHosting=()=>{connect('host','Me');startGame()}
beforeEach(()=>{net.sent=[];net.relayOpen=true;vi.useFakeTimers()})
afterEach(()=>{leave();vi.useRealTimers()})

describe('joining a party',()=>{
 it('keeps waiting for a host until the 30s timeout',()=>{
  connect('join','Me','ABC')
  vi.advanceTimersByTime(29999)
  expect(useApp.getState().status).toBe('connecting')
  vi.advanceTimersByTime(1)
  expect(useApp.getState().status).toBe('error')
  expect(useApp.getState().error).toMatch(/No host answered/)})
 it('says so when no signalling relay could be reached',()=>{
  net.relayOpen=false
  connect('join','Me','ABC')
  vi.advanceTimersByTime(30000)
  expect(useApp.getState().error).toMatch(/matchmaking servers/)})
 it('shows the "party full" error sent by the host',()=>{
  connect('join','Me','ABC')
  net.recv!({t:'ERROR',msg:'This party is full (6/6).',sid:'',v:0},'H')
  expect(useApp.getState().status).toBe('error')
  expect(useApp.getState().error).toMatch(/full/)})
 it('a peer cannot take over as host',()=>{
  connect('join','Me','ABC')
  net.recv!(snapshot('H',1),'H')
  net.recv!(snapshot('X',999999),'X')
  expect(useApp.getState().hostId).toBe('H')
  net.recv!(snapshot('H',2),'H')
  expect(useApp.getState().hostId).toBe('H')})
 it('the real host cannot hand over to another id either',()=>{
  connect('join','Me','ABC')
  net.recv!(snapshot('H',1),'H')
  net.recv!(snapshot('X',2),'H')
  expect(useApp.getState().hostId).toBe('H')})
 it('other peers cannot send game state once we know the host',()=>{
  connect('join','Me','ABC')
  net.recv!(snapshot('H',1),'H')
  net.recv!({t:'ERROR',msg:'kicked',sid:'',v:0},'X')
  expect(useApp.getState().status).toBe('lobby')})})

describe('bets',()=>{
 it('resolves an accepted bet',async()=>{
  startHosting()
  const r=await sendBet({id:newId(),game:'wheel',wager:50,choice:0})
  expect(r.from).toBe('SELF');expect(r.wager).toBe(50)})
 it('rejects a refused bet instead of hanging',async()=>{
  startHosting()
  await expect(sendBet({id:newId(),game:'wheel',wager:99999,choice:0})).rejects.toThrow(/Not enough/)})
 it('rejects when the host never answers',async()=>{
  connect('join','Me','ABC')
  net.recv!(snapshot('H',1),'H')
  const p=sendBet({id:'x',game:'wheel',wager:50,choice:0})
  vi.advanceTimersByTime(9000)
  await expect(p).rejects.toThrow(/did not respond/)})
 it('rejects outstanding bets when disconnected',async()=>{
  connect('join','Me','ABC')
  net.recv!(snapshot('H',1),'H')
  const p=sendBet({id:'x',game:'wheel',wager:50,choice:0})
  leave()
  await expect(p).rejects.toThrow(/Disconnected/)})
 it('another player\'s result does not settle my bet',async()=>{
  connect('join','Me','ABC')
  net.recv!(snapshot('H',1),'H')
  let settled=false
  sendBet({id:'mine',game:'wheel',wager:50,choice:0}).then(()=>{settled=true},()=>{})
  net.recv!({t:'BET_RESULT',id:'other',res:{id:'other',from:'H',game:'wheel',wager:10,payout:0,net:-10,roll:0,detail:'x',shielded:false},sid:'',v:2},'H')
  await vi.advanceTimersByTimeAsync(0)
  expect(settled).toBe(false)
  expect(useApp.getState().fx?.result.id).toBe('other')
  leave()
  await vi.advanceTimersByTimeAsync(0)})})

describe('crash flights',()=>{
 it('goes live, deducts the wager, and pays on cash-out',async()=>{
  startHosting()
  const live=vi.fn(),id=newId()
  const p=sendBet({id,game:'crash',wager:100,choice:0},live)
  expect(live).toHaveBeenCalledOnce()
  expect(hostGame().balance).toBe(900)
  cashOut(id)
  const r=await p
  expect(r.game).toBe('crash');expect(hostGame().balance).toBe(900+r.payout)})
 it('crashes by itself if nobody cashes out',async()=>{
  startHosting()
  const p=sendBet({id:newId(),game:'crash',wager:100,choice:0})
  await vi.advanceTimersByTimeAsync(35000)
  const r=await p
  expect(r.net).toBe(-100);expect(hostGame().balance).toBe(900)})
 it('a flight still in the air is settled when the round runs out',async()=>{
  startHosting()
  await vi.advanceTimersByTimeAsync(299000) // one second left on the clock
  expect(hostGame().timeLeft).toBe(1)
  const p=sendBet({id:newId(),game:'crash',wager:100,choice:0})
  await vi.advanceTimersByTimeAsync(1000)
  await expect(p).resolves.toMatchObject({game:'crash'})
  expect(hostGame().phase).toBe('over')})})

describe('host actions',()=>{
 it('ignores a bad upgrade id from a party member',()=>{
  startHosting()
  useApp.setState(s=>({players:[...s.players,{id:'P',name:'P',ready:true}]}))
  const sid=useApp.getState().sid,before=hostGame().balance
  net.recv!({t:'UPGRADE_PURCHASE',id:'constructor',sid,v:0},'P')
  expect(hostGame().balance).toBe(before)})
 it('ignores bets from someone not in the party',()=>{
  startHosting()
  const sid=useApp.getState().sid,before=hostGame().stats.bets
  net.recv!({t:'BET_REQUEST',req:{id:'z',game:'wheel',wager:50,choice:0},sid,v:0},'STRANGER')
  expect(hostGame().stats.bets).toBe(before)})
 it('survives malformed messages',()=>{
  startHosting()
  for(const m of[null,42,'x',[],{t:'BET_REQUEST',sid:'',v:0},{t:'PLAYER_JOIN',sid:'',v:0},{t:'NOPE',sid:'',v:0}])net.recv!(m,'P')
  expect(useApp.getState().players).toHaveLength(1)})
 it('the loan shark and debt payment reach the wallet',()=>{
  startHosting()
  takeLoan();expect(hostGame().balance).toBe(1300);expect(hostGame().quota).toBe(2500)
  payDebt();expect(hostGame().floor).toBe(1)
  buyUpgrade('time');expect(hostGame().upgrades.time).toBeUndefined()})})

describe('parseEnv',()=>{
 it('accepts good messages and rejects bad shapes',()=>{
  expect(parseEnv({t:'PLAYER_MOVE',x:1,y:2,sid:'s',v:0})).toBeTruthy()
  expect(parseEnv({t:'PLAYER_MOVE',x:'1',y:2,sid:'s',v:0})).toBeNull()
  expect(parseEnv({t:'PLAYER_MOVE',x:Infinity,y:2,sid:'s',v:0})).toBeNull()
  expect(parseEnv({t:'BET_REQUEST',req:{id:'a',game:'poker',wager:1,choice:0},sid:'s',v:0})).toBeNull()
  expect(parseEnv({t:'BET_REQUEST',req:{id:'a',game:'dice',wager:1,choice:{}},sid:'s',v:0})).toBeNull()
  expect(parseEnv({t:'WALLET_UPDATE',game:{phase:'playing',balance:null},sid:'s',v:0})).toBeNull()
  expect(parseEnv({t:'MACHINE_INTERACT',machine:'x'.repeat(5000),sid:'s',v:0})).toBeNull()
  expect(parseEnv({t:'PLAYER_JOIN',name:'x'.repeat(5000),sid:'s',v:0})).toBeNull()})})
