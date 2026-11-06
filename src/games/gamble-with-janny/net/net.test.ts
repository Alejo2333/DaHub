import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {useApp} from '../../../stores/app'
import {net} from '../../../multiplayer/fakeNetwork'
import {Ledger} from '../mechanics/engine'
import {FIRST_FLOOR_DEBT,START_CHIPS} from '../mechanics/odds'
import {positions,useCasino} from '../store'
import type {GState} from '../types'
import game from '..'
import {isAction,isEvent,isPeer,isState} from './validate'

vi.mock('trystero/nostr',async()=>(await import('../../../multiplayer/fakeNetwork')).trystero)
import {hostParty,joinParty,leave,newId,startGame} from '../../../multiplayer/party'
import {buyItem,buyUpgrade,cashOut,castVote,payDebt,sendBet,takeLoan} from './client'
import {createHost} from './host'

const hostGame=()=>useApp.getState().gameState as GState
const startHosting=()=>{hostParty(game,'Me');startGame()}
/** Joins a game that's already running, as a guest of H. */
const joinRunning=()=>{
 joinParty('ABC','Me',()=>game)
 const players=[{id:'H',name:'Host',ready:true},{id:'SELF',name:'Me',ready:true}]
 net.recv!({t:'STATE_SNAPSHOT',players,hostId:'H',status:'playing',gameId:game.id,state:new Ledger().g,sid:'S',v:1},'H')}
const action=(m:unknown,from:string,sid=useApp.getState().sid)=>net.recv!({t:'ACTION',m,sid,v:0},from)
beforeEach(()=>{net.reset();vi.useFakeTimers()})
afterEach(()=>{leave();vi.useRealTimers()})

describe('bets',()=>{
 it('resolves an accepted bet',async()=>{
  startHosting()
  const r=await sendBet({id:newId(),game:'wheel',wager:50,choice:0})
  expect(r.from).toBe('SELF');expect(r.wager).toBe(50)})
 it('rejects a refused bet instead of hanging',async()=>{
  startHosting()
  await expect(sendBet({id:newId(),game:'wheel',wager:99999,choice:0})).rejects.toThrow(/Not enough/)})
 it('rejects when the host never answers',async()=>{
  joinRunning()
  const p=sendBet({id:'x',game:'wheel',wager:50,choice:0})
  vi.advanceTimersByTime(9000)
  await expect(p).rejects.toThrow(/did not respond/)})
 it('rejects outstanding bets when disconnected',async()=>{
  joinRunning()
  const p=sendBet({id:'x',game:'wheel',wager:50,choice:0})
  leave()
  await expect(p).rejects.toThrow(/Disconnected/)})
 it('a guest\'s refused bet is rejected by the host\'s private reply',async()=>{
  joinRunning()
  const p=sendBet({id:'x',game:'wheel',wager:50,choice:0})
  net.recv!({t:'PRIVATE',m:{t:'BET_RESULT',id:'x',err:'Nope'},sid:'S',v:0},'H')
  await expect(p).rejects.toThrow('Nope')})
 it('another player\'s result does not settle my bet',async()=>{
  joinRunning()
  let settled=false
  sendBet({id:'mine',game:'wheel',wager:50,choice:0}).then(()=>{settled=true},()=>{})
  net.recv!({t:'EVENT',m:{t:'BET_RESULT',id:'other',res:{id:'other',from:'H',game:'wheel',wager:10,payout:0,net:-10,roll:0,detail:'x',shielded:false}},sid:'S',v:2},'H')
  await vi.advanceTimersByTimeAsync(0)
  expect(settled).toBe(false)
  expect(useCasino.getState().fx?.result.id).toBe('other')
  leave()
  await vi.advanceTimersByTimeAsync(0)})})

describe('crash flights',()=>{
 it('goes live, deducts the wager, and pays on cash-out',async()=>{
  startHosting()
  const live=vi.fn(),id=newId()
  const p=sendBet({id,game:'crash',wager:100,choice:0},live)
  expect(live).toHaveBeenCalledOnce()
  expect(hostGame().balance).toBe(START_CHIPS-100)
  cashOut(id)
  const r=await p
  expect(r.game).toBe('crash');expect(hostGame().balance).toBe(START_CHIPS-100+r.payout)})
 it('crashes by itself if nobody cashes out',async()=>{
  startHosting()
  const p=sendBet({id:newId(),game:'crash',wager:100,choice:0})
  await vi.advanceTimersByTimeAsync(35000)
  const r=await p
  expect(r.net).toBe(-100);expect(hostGame().balance).toBe(START_CHIPS-100)})
 it('a flight still in the air is settled when the round runs out',async()=>{
  startHosting()
  await vi.advanceTimersByTimeAsync(299000) // one second left on the clock
  expect(hostGame().timeLeft).toBe(1)
  const p=sendBet({id:newId(),game:'crash',wager:100,choice:0})
  await vi.advanceTimersByTimeAsync(1000)
  await expect(p).resolves.toMatchObject({game:'crash'})
  // Over or cleared: a chaos event may have paid enough to cover the debt.
  expect(hostGame().phase).not.toBe('playing')})
 it('a flight is settled when its player leaves, and the team is told',async()=>{
  hostParty(game,'Me');useApp.setState(s=>({players:[...s.players,{id:'P',name:'Pal',ready:true}]}));startGame()
  action({t:'BET_REQUEST',req:{id:'f',game:'crash',wager:100,choice:0}},'P')
  expect(hostGame().balance).toBe(START_CHIPS-100)
  net.room!.onPeerLeave!('P')
  expect(hostGame().balance).toBeGreaterThanOrEqual(START_CHIPS-100)
  expect(net.sent.some(([m])=>m.t==='EVENT'&&m.m.t==='BET_RESULT'&&m.m.id==='f')).toBe(true)
  expect(useCasino.getState().feed[0]!.text).toMatch(/Pal left the party/)})
 it('a guest\'s flight goes live and settles from the host\'s messages',async()=>{
  joinRunning()
  const live=vi.fn(),p=sendBet({id:'f',game:'crash',wager:100,choice:0},live)
  net.recv!({t:'PRIVATE',m:{t:'CRASH_LIVE',id:'f'},sid:'S',v:0},'H')
  expect(live).toHaveBeenCalledOnce()
  vi.advanceTimersByTime(9000) // past the bet timeout: a live flight waits longer
  cashOut('f')
  expect(net.sent.at(-1)).toMatchObject([{t:'ACTION',m:{t:'CRASH_CASHOUT',id:'f'},sid:'S'},'H'])
  net.recv!({t:'EVENT',m:{t:'BET_RESULT',id:'f',res:{id:'f',from:'SELF',game:'crash',wager:100,payout:150,net:50,roll:1.5,detail:'Cashed',shielded:false}},sid:'S',v:2},'H')
  await expect(p).resolves.toMatchObject({net:50})})
 it('the host stops its timers when the game ends',async()=>{
  startHosting()
  const p=sendBet({id:newId(),game:'crash',wager:100,choice:0})
  p.catch(()=>{})
  leave()
  expect(vi.getTimerCount()).toBe(0)})})

describe('host actions',()=>{
 it('ignores a bad upgrade id from a party member',()=>{
  startHosting()
  useApp.setState(s=>({players:[...s.players,{id:'P',name:'P',ready:true}]}))
  const before=hostGame().balance
  action({t:'UPGRADE_PURCHASE',id:'constructor'},'P')
  expect(hostGame().balance).toBe(before)})
 it('ignores bets from someone not in the party',()=>{
  startHosting()
  const before=hostGame().stats.bets
  action({t:'BET_REQUEST',req:{id:'z',game:'wheel',wager:50,choice:0}},'STRANGER')
  expect(hostGame().stats.bets).toBe(before)})
 it('the marker and debt payment reach the wallet',()=>{
  startHosting()
  takeLoan();expect(hostGame().balance).toBe(START_CHIPS+300);expect(hostGame().quota).toBe(FIRST_FLOOR_DEBT+500);expect(hostGame().markers).toBe(1)
  payDebt();expect(hostGame().floor).toBe(1)
  buyUpgrade('time');expect(hostGame().upgrades.time).toBeUndefined()})
 it('only the host can start the next floor',()=>{
  const publish=vi.fn()
  const host=createHost({selfId:'SELF',players:()=>[],nameOf:id=>id,publish,emit:()=>{},sendTo:()=>{}})
  const g=host.state()
  g.balance=g.quota
  host.onAction('P',{t:'PAY_DEBT'})
  expect(g.phase).toBe('upgrades');publish.mockClear()
  for(const t of['NEXT_FLOOR','WALK_AWAY','BUYOUT'] as const)host.onAction('P',{t})
  expect(g.phase).toBe('upgrades');expect(publish).not.toHaveBeenCalled()
  host.onAction('SELF',{t:'NEXT_FLOOR'})
  expect(g.phase).toBe('playing');expect(publish).toHaveBeenCalled()
  host.dispose()})
 it('the clock reaches every player through the state',()=>{
  startHosting()
  vi.advanceTimersByTime(1000)
  expect(net.sent.at(-1)![0]).toMatchObject({t:'GAME_STATE',state:{timeLeft:hostGame().timeLeft}})})})

describe('moving around',()=>{
 it('other players\' positions are kept, and removed when they leave',()=>{
  joinRunning()
  net.recv!({t:'PEER',m:{t:'PLAYER_MOVE',x:1,y:2},sid:'S',v:0},'P')
  expect(positions.P).toEqual({x:1,y:2})
  net.room!.onPeerLeave!('P')
  expect(positions.P).toBeUndefined()})
 it('sitting at a machine shows in the feed',()=>{
  joinRunning()
  net.recv!({t:'PEER',m:{t:'MACHINE_INTERACT',machine:'dice'},sid:'S',v:0},'H')
  expect(useCasino.getState().feed[0]!.text).toMatch(/Host sat at dice/)})
 it('a new game starts with clean local state',()=>{
  joinRunning()
  net.recv!({t:'PEER',m:{t:'PLAYER_MOVE',x:1,y:2},sid:'S',v:0},'P')
  useCasino.setState({toast:'old',hold:5})
  net.recv!({t:'RETURN_TO_LOBBY',players:[],sid:'S',v:2},'H')
  expect(positions).toEqual({});expect(useCasino.getState()).toMatchObject({toast:'',hold:0,feed:[],fx:null})})})

describe('validators',()=>{
 it('accepts good messages and rejects bad shapes',()=>{
  expect(isPeer({t:'PLAYER_MOVE',x:1,y:2})).toBe(true)
  expect(isPeer({t:'PLAYER_MOVE',x:'1',y:2})).toBe(false)
  expect(isPeer({t:'PLAYER_MOVE',x:Infinity,y:2})).toBe(false)
  expect(isPeer({t:'MACHINE_INTERACT',machine:'x'.repeat(5000)})).toBe(false)
  expect(isAction({t:'BET_REQUEST',req:{id:'a',game:'poker',wager:1,choice:0}})).toBe(false)
  expect(isAction({t:'BET_REQUEST',req:{id:'a',game:'dice',wager:1,choice:{}}})).toBe(false)
  expect(isAction({t:'BET_REQUEST'})).toBe(false)
  expect(isAction({t:'NOPE'})).toBe(false)
  expect(isState({phase:'playing',balance:null})).toBe(false)
  expect(isEvent({t:'NOTICE',text:'hi',tone:'loud'})).toBe(false)
  expect(isEvent({t:'NOTICE',text:'hi',tone:'win'})).toBe(true)})})

describe('team votes',()=>{
 it('accepts VOTE_CAST and rejects bad shapes',()=>{
  expect(isAction({t:'VOTE_CAST',yes:true})).toBe(true)
  expect(isAction({t:'VOTE_CAST',yes:'yes'})).toBe(false)})
 it('rejects game state with a malformed vote or event',()=>{
  const g=new Ledger().g
  expect(isState(g)).toBe(true)
  expect(isState({...g,vote:{kind:'nope',until:1,yes:[],no:[]}})).toBe(false)
  expect(isState({...g,event:{kind:'cut',machine:'poker',until:1}})).toBe(false)
  expect(isState({...g,machines:['poker']})).toBe(false)})
 it('ignores a vote when none is open, and from outsiders',()=>{
  startHosting()
  const before=hostGame()
  castVote(true)
  action({t:'VOTE_CAST',yes:true},'STRANGER')
  expect(hostGame()).toEqual(before)})})

describe('sketchy shop',()=>{
 const withFriend=()=>{startHosting();useApp.setState(s=>({players:[...s.players,{id:'P',name:'Pal',ready:true}]}))}
 it('accepts SHOP_BUY and rejects bad shapes',()=>{
  expect(isAction({t:'SHOP_BUY',id:'charm'})).toBe(true)
  expect(isAction({t:'SHOP_BUY',id:'stink',target:'P'})).toBe(true)
  expect(isAction({t:'SHOP_BUY',id:5})).toBe(false)
  expect(isAction({t:'SHOP_BUY',id:'stink',target:7})).toBe(false)})
 it('rejects game state with a malformed prank',()=>{
  const g=new Ledger().g
  expect(isState({...g,pranks:[{kind:'nope',target:'a',until:null}]})).toBe(false)
  expect(isState({...g,luck:'many'})).toBe(false)})
 it('a friend can prank me: the bet is refused and the buyer stays anonymous',async()=>{
  withFriend()
  action({t:'SHOP_BUY',id:'cuffs',target:'SELF'},'P')
  expect(hostGame().pranks).toMatchObject([{kind:'cuffs',target:'SELF'}])
  const line=useCasino.getState().feed[0]!.text
  expect(line).toMatch(/Someone slipped Me a Handcuffs/);expect(line).not.toMatch(/Pal/)
  await expect(sendBet({id:newId(),game:'wheel',wager:50,choice:0})).rejects.toThrow(/handcuffs/)})
 it('names the buyer of a helper item',()=>{
  withFriend();buyItem('charm')
  expect(hostGame().luck).toBe(3);expect(useCasino.getState().feed[0]!.text).toMatch(/Me bought Rabbit's Foot/)})
 it('cannot prank someone who is not in the party, or buy as an outsider',()=>{
  withFriend();const before=hostGame().balance
  buyItem('stink','GHOST')
  action({t:'SHOP_BUY',id:'charm'},'STRANGER')
  expect(hostGame().balance).toBe(before);expect(hostGame().pranks).toEqual([])
  expect(useCasino.getState().toast).toMatch(/not here/)})})
