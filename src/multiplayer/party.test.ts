import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {useApp} from '../stores/app'
import {parseEnv} from './validate'
import type {GState,Player} from '../types/net'

// A fake network: `recv` delivers a message as if it came from a peer, `sent` records what we sent.
const net=vi.hoisted(()=>({recv:null as null|((d:unknown,from:string)=>void),sent:[] as [any,string?][],relayOpen:true,config:null as any}))
vi.mock('trystero/nostr',()=>({
 selfId:'SELF',
 getRelaySockets:()=>({relay:{readyState:net.relayOpen?1:3}}),
 joinRoom:(config:unknown)=>{net.config=config;return{
  makeAction:()=>({
   send:async(d:unknown,o?:{target?:string})=>{net.sent.push([d,o?.target])},
   set onMessage(cb:(d:unknown,c:{peerId:string})=>void){net.recv=(d,from)=>cb(d,{peerId:from})}}),
  onPeerJoin:null,onPeerLeave:null,leave:async()=>{}}}}))
import {buyItem,buyUpgrade,cashOut,castVote,connect,leave,MAX_CHAT,newId,payDebt,sendBet,sendChat,startGame,takeLoan} from './party'
import {FIRST_FLOOR_DEBT,START_CHIPS} from '../games/gamble-with-fermil/mechanics/odds'

const peers:Player[]=[{id:'H',name:'Host',ready:true},{id:'SELF',name:'Me',ready:false}]
const snapshot=(hostId:string,v:number,game:GState|null=null)=>({t:'STATE_SNAPSHOT',players:peers,hostId,status:'lobby',game,sid:'',v})
const hostGame=()=>useApp.getState().game!
const startHosting=()=>{connect('host','Me');startGame()}
beforeEach(()=>{net.sent=[];net.relayOpen=true;vi.useFakeTimers()})
afterEach(()=>{leave();vi.useRealTimers()})

describe('joining a party',()=>{
 it('signals through the pinned relays',()=>{
  connect('join','Me','ABC')
  expect(net.config.relayConfig.urls).toContain('wss://nos.lol')})
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
 it('the marker and debt payment reach the wallet',()=>{
  startHosting()
  takeLoan();expect(hostGame().balance).toBe(START_CHIPS+300);expect(hostGame().quota).toBe(FIRST_FLOOR_DEBT+500);expect(hostGame().markers).toBe(1)
  payDebt();expect(hostGame().floor).toBe(1)
  buyUpgrade('time');expect(hostGame().upgrades.time).toBeUndefined()})})

describe('party chat',()=>{
 const lines=()=>useApp.getState().chat
 const withFriend=()=>{connect('host','Me');useApp.setState(s=>({players:[...s.players,{id:'P',name:'Pal',ready:true}]}))}
 const said=(text:string,from='P')=>net.recv!({t:'CHAT_SEND',text,sid:'',v:0},from)
 it('the host posts its own messages in the lobby',()=>{
  connect('host','Me');sendChat('  hello  ')
  expect(lines()).toMatchObject([{from:'SELF',name:'Me',text:'hello'}])})
 it('the host broadcasts a member\'s message under their real name',()=>{
  withFriend();said('hi all')
  expect(lines()).toMatchObject([{from:'P',name:'Pal',text:'hi all'}])
  expect(net.sent.at(-1)![0]).toMatchObject({t:'CHAT',from:'P',text:'hi all'})
  expect(net.sent.at(-1)![1]).toBeUndefined()})
 it('a guest sends to the host and shows nothing until the host answers',()=>{
  connect('join','Me','ABC');net.recv!(snapshot('H',1),'H')
  sendChat('hello')
  expect(net.sent.at(-1)).toMatchObject([{t:'CHAT_SEND',text:'hello'},'H'])
  expect(lines()).toEqual([])
  net.recv!({t:'CHAT',from:'SELF',text:'hello',sid:'',v:2},'H')
  expect(lines()).toMatchObject([{from:'SELF',name:'Me',text:'hello'}])})
 it('works during a game, and the chat survives starting it',()=>{
  withFriend();said('before');startGame();vi.advanceTimersByTime(1000);said('during')
  expect(lines().map(l=>l.text)).toEqual(['before','during'])})
 it('ignores outsiders',()=>{
  withFriend();said('spam','STRANGER')
  expect(lines()).toEqual([])})
 it('a peer can\'t speak for someone else',()=>{
  connect('join','Me','ABC');net.recv!(snapshot('H',1),'H')
  net.recv!({t:'CHAT',from:'H',text:'send me your chips',sid:'',v:2},'X')
  expect(lines()).toEqual([])})
 it('limits how fast each player can post',()=>{
  withFriend();said('one');said('two')
  expect(lines()).toHaveLength(1)
  sendChat('mine');expect(lines()).toHaveLength(2)
  vi.advanceTimersByTime(500);said('three');expect(lines()).toHaveLength(3)})
 it('cleans messages: blank ones vanish, long ones are cut, and emoji stay whole',()=>{
  withFriend();said('   ')
  expect(lines()).toEqual([])
  said('😀'.repeat(MAX_CHAT+50))
  expect([...lines()[0]!.text]).toHaveLength(MAX_CHAT);expect(lines()[0]!.text.endsWith('😀')).toBe(true)
  vi.advanceTimersByTime(500);said('a\nb\u0007c')
  expect(lines()[1]!.text).toBe('a b c')})
 it('every message reaches validation in a shape it accepts, and bad shapes are refused',()=>{
  expect(parseEnv({t:'CHAT_SEND',text:'😀'.repeat(MAX_CHAT),sid:'',v:0})).toBeTruthy()
  expect(parseEnv({t:'CHAT',from:'P',text:'😀'.repeat(MAX_CHAT),sid:'',v:1})).toBeTruthy()
  expect(parseEnv({t:'CHAT_SEND',text:5,sid:'',v:0})).toBeNull()
  expect(parseEnv({t:'CHAT_SEND',text:'x'.repeat(5000),sid:'',v:0})).toBeNull()
  expect(parseEnv({t:'CHAT',text:'no sender',sid:'',v:1})).toBeNull()})
 it('a new party starts with an empty chat',()=>{
  connect('host','Me');sendChat('old');connect('host','Me')
  expect(lines()).toEqual([])})})

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

describe('team votes',()=>{
 it('accepts VOTE_CAST and rejects bad shapes',()=>{
  expect(parseEnv({t:'VOTE_CAST',yes:true,sid:'s',v:0})).toBeTruthy()
  expect(parseEnv({t:'VOTE_CAST',yes:'yes',sid:'s',v:0})).toBeNull()})
 it('rejects game state with a malformed vote or event',()=>{
  startHosting()
  const g=hostGame()
  expect(parseEnv({t:'WALLET_UPDATE',game:g,sid:'s',v:0})).toBeTruthy()
  expect(parseEnv({t:'WALLET_UPDATE',game:{...g,vote:{kind:'nope',until:1,yes:[],no:[]}},sid:'s',v:0})).toBeNull()
  expect(parseEnv({t:'WALLET_UPDATE',game:{...g,event:{kind:'cut',machine:'poker',until:1}},sid:'s',v:0})).toBeNull()
  expect(parseEnv({t:'WALLET_UPDATE',game:{...g,machines:['poker']},sid:'s',v:0})).toBeNull()})
 it('ignores a vote when none is open, and from outsiders',()=>{
  startHosting()
  const sid=useApp.getState().sid,before=hostGame()
  castVote(true)
  net.recv!({t:'VOTE_CAST',yes:true,sid,v:0},'STRANGER')
  expect(hostGame()).toEqual(before)})})

describe('sketchy shop',()=>{
 const withFriend=()=>{startHosting();useApp.setState(s=>({players:[...s.players,{id:'P',name:'Pal',ready:true}]}));return useApp.getState().sid}
 it('accepts SHOP_BUY and rejects bad shapes',()=>{
  expect(parseEnv({t:'SHOP_BUY',id:'charm',sid:'s',v:0})).toBeTruthy()
  expect(parseEnv({t:'SHOP_BUY',id:'stink',target:'P',sid:'s',v:0})).toBeTruthy()
  expect(parseEnv({t:'SHOP_BUY',id:5,sid:'s',v:0})).toBeNull()
  expect(parseEnv({t:'SHOP_BUY',id:'stink',target:7,sid:'s',v:0})).toBeNull()})
 it('rejects game state with a malformed prank',()=>{
  startHosting()
  const g=hostGame()
  expect(parseEnv({t:'WALLET_UPDATE',game:{...g,pranks:[{kind:'nope',target:'a',until:null}]},sid:'s',v:0})).toBeNull()
  expect(parseEnv({t:'WALLET_UPDATE',game:{...g,luck:'many'},sid:'s',v:0})).toBeNull()})
 it('a friend can prank me: the bet is refused and the buyer stays anonymous',async()=>{
  const sid=withFriend()
  net.recv!({t:'SHOP_BUY',id:'cuffs',target:'SELF',sid,v:0},'P')
  expect(hostGame().pranks).toMatchObject([{kind:'cuffs',target:'SELF'}])
  const line=useApp.getState().feed[0]!.text
  expect(line).toMatch(/Someone slipped Me a Handcuffs/);expect(line).not.toMatch(/Pal/)
  await expect(sendBet({id:newId(),game:'wheel',wager:50,choice:0})).rejects.toThrow(/handcuffs/)})
 it('names the buyer of a helper item',()=>{
  withFriend();buyItem('charm')
  expect(hostGame().luck).toBe(3);expect(useApp.getState().feed[0]!.text).toMatch(/Me bought Rabbit's Foot/)})
 it('cannot prank someone who is not in the party, or buy as an outsider',()=>{
  const sid=withFriend(),before=hostGame().balance
  buyItem('stink','GHOST')
  net.recv!({t:'SHOP_BUY',id:'charm',sid,v:0},'STRANGER')
  expect(hostGame().balance).toBe(before);expect(hostGame().pranks).toEqual([])
  expect(useApp.getState().toast).toMatch(/not here/)})})
