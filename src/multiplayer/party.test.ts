import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {useApp} from '../stores/app'
import {parseEnv} from './validate'
import {net} from './fakeNetwork'
import type {Player} from '../types/net'
import type {GameModule} from '../types/game'
import tapRace,{TAPS_TO_WIN,type TapState} from '../games/_template'

vi.mock('trystero/nostr',async()=>(await import('./fakeNetwork')).trystero)
import {hostParty,joinParty,leave,MAX_CHAT,returnToLobby,sendAction,sendChat,sendToPeers,setReady,startGame} from './party'

// These tests play the template game, so they also prove the party layer works without knowing anything about the casino.
const find=(id:string)=>id===tapRace.id?tapRace:undefined
const join=(code='ABC')=>joinParty(code,'Me',find)
const peers:Player[]=[{id:'H',name:'Host',ready:true},{id:'SELF',name:'Me',ready:false}]
const snapshot=(hostId:string,v:number,extra:object={})=>({t:'STATE_SNAPSHOT',players:peers,hostId,status:'lobby',gameId:tapRace.id,state:null,sid:'',v,...extra})
const app=()=>useApp.getState()
const tap=()=>app().gameState as TapState
const addFriend=()=>useApp.setState(s=>({players:[...s.players,{id:'P',name:'Pal',ready:true}]}))
beforeEach(()=>{net.reset();vi.useFakeTimers()})
afterEach(()=>{leave();vi.useRealTimers()})

describe('joining a party',()=>{
 it('signals through the pinned relays',()=>{
  join()
  expect(net.config.relayConfig.urls).toContain('wss://nos.lol')})
 it('keeps waiting for a host until the 30s timeout',()=>{
  join()
  vi.advanceTimersByTime(29999)
  expect(app().status).toBe('connecting')
  vi.advanceTimersByTime(1)
  expect(app().status).toBe('error')
  expect(app().error).toMatch(/No host answered/)})
 it('says so when no signalling relay could be reached',()=>{
  net.relayOpen=false
  join()
  vi.advanceTimersByTime(30000)
  expect(app().error).toMatch(/matchmaking servers/)})
 it('shows the "party full" error sent by the host',()=>{
  join()
  net.recv!({t:'ERROR',msg:'This party is full (6/6).',sid:'',v:0},'H')
  expect(app().status).toBe('error')
  expect(app().error).toMatch(/full/)})
 it('a peer cannot take over as host',()=>{
  join()
  net.recv!(snapshot('H',1),'H')
  net.recv!(snapshot('X',999999),'X')
  expect(app().hostId).toBe('H')
  net.recv!(snapshot('H',2),'H')
  expect(app().hostId).toBe('H')})
 it('the real host cannot hand over to another id either',()=>{
  join()
  net.recv!(snapshot('H',1),'H')
  net.recv!(snapshot('X',2),'H')
  expect(app().hostId).toBe('H')})
 it('other peers cannot send game state once we know the host',()=>{
  join()
  net.recv!(snapshot('H',1),'H')
  net.recv!({t:'ERROR',msg:'kicked',sid:'',v:0},'X')
  expect(app().status).toBe('lobby')})})

describe('which game a party plays',()=>{
 it('the host picks the game',()=>{
  hostParty(tapRace,'Me')
  expect(app().gameId).toBe(tapRace.id)})
 it('a joining player learns the game from the host',()=>{
  join();expect(app().gameId).toBe('')
  net.recv!(snapshot('H',1),'H')
  expect(app().gameId).toBe(tapRace.id)})
 it('every snapshot names the game',()=>{
  hostParty(tapRace,'Me')
  net.recv!({t:'PLAYER_JOIN',name:'Pal',sid:'',v:0},'P')
  expect(net.sent.at(-1)![0]).toMatchObject({t:'STATE_SNAPSHOT',gameId:tapRace.id})})
 it('explains when the game is one this copy of the site does not have',()=>{
  join()
  net.recv!(snapshot('H',1,{gameId:'from-the-future'}),'H')
  expect(app().status).toBe('error');expect(app().error).toMatch(/Refresh/)})
 it('the host cannot switch games mid-party',()=>{
  join()
  net.recv!(snapshot('H',1),'H')
  net.recv!(snapshot('H',2,{gameId:'other'}),'H')
  expect(app().gameId).toBe(tapRace.id)})
 it("a snapshot's game state must pass the game's validator",()=>{
  join()
  net.recv!(snapshot('H',1,{state:{taps:'many',winner:null}}),'H')
  expect(app().status).toBe('connecting')})
 it("uses the game's party size",()=>{
  hostParty({...tapRace,maxPlayers:1},'Me')
  net.recv!({t:'PLAYER_JOIN',name:'Pal',sid:'',v:0},'P')
  expect(app().players).toHaveLength(1)
  expect(net.sent.at(-1)).toMatchObject([{t:'ERROR',msg:'This party is full (1/1).'},'P'])})
 it("won't start with fewer players than the game needs",()=>{
  hostParty({...tapRace,minPlayers:2},'Me')
  startGame();expect(app().status).toBe('lobby')
  addFriend()
  startGame();expect(app().status).toBe('playing')})})

describe('running a game',()=>{
 const hosting=()=>{hostParty(tapRace,'Me');addFriend();startGame();return app().sid}
 const action=(sid:string,from='P',m:unknown={t:'TAP'})=>net.recv!({t:'ACTION',m,sid,v:0},from)
 it('the host sends the first state when the game starts',()=>{
  hosting()
  expect(tap()).toEqual({taps:{},winner:null})
  expect(net.sent.at(-1)![0]).toMatchObject({t:'GAME_START',state:{taps:{},winner:null}})})
 it('a member\'s action changes the state, and everyone gets it',()=>{
  action(hosting())
  expect(tap().taps.P).toBe(1)
  expect(net.sent.at(-1)![0]).toMatchObject({t:'GAME_STATE',state:{taps:{P:1}}})})
 it("the host's own actions skip the network",()=>{
  hosting();const before=net.sent.filter(([m])=>m.t==='ACTION').length
  sendAction({t:'TAP'})
  expect(tap().taps.SELF).toBe(1)
  expect(net.sent.filter(([m])=>m.t==='ACTION')).toHaveLength(before)})
 it('a guest sends actions to the host and waits for the new state',()=>{
  join();net.recv!(snapshot('H',1,{status:'playing',sid:'S',state:{taps:{},winner:null}}),'H')
  sendAction({t:'TAP'})
  expect(net.sent.at(-1)).toMatchObject([{t:'ACTION',m:{t:'TAP'},sid:'S'},'H'])
  expect(tap().taps).toEqual({})
  net.recv!({t:'GAME_STATE',state:{taps:{SELF:1},winner:null},sid:'S',v:2},'H')
  expect(tap().taps.SELF).toBe(1)})
 it('the game decides how it ends',()=>{
  const sid=hosting()
  for(let i=0;i<TAPS_TO_WIN+5;i++)action(sid)
  expect(tap().winner).toBe('P');expect(tap().taps.P).toBe(TAPS_TO_WIN)})
 it('ignores outsiders, other sessions and malformed actions',()=>{
  const sid=hosting()
  action(sid,'STRANGER');action('old-session');action(sid,'P',{t:'CHEAT'});action(sid,'P',null)
  expect(tap().taps).toEqual({})})
 it('a guest ignores malformed state from the host',()=>{
  join();net.recv!(snapshot('H',1,{status:'playing',sid:'S',state:{taps:{},winner:null}}),'H')
  net.recv!({t:'GAME_STATE',state:{taps:{SELF:-1},winner:null},sid:'S',v:2},'H')
  expect(tap().taps).toEqual({})})
 it('a guest ignores state from anyone but the host',()=>{
  join();net.recv!(snapshot('H',1,{status:'playing',sid:'S',state:{taps:{},winner:null}}),'H')
  net.recv!({t:'GAME_STATE',state:{taps:{X:9},winner:null},sid:'S',v:2},'X')
  expect(tap().taps).toEqual({})})
 it('a guest ignores stale state',()=>{
  join();net.recv!(snapshot('H',5,{status:'playing',sid:'S',state:{taps:{},winner:null}}),'H')
  net.recv!({t:'GAME_STATE',state:{taps:{SELF:1},winner:null},sid:'S',v:4},'H')
  expect(tap().taps).toEqual({})})
 it('a late joiner gets the running game',()=>{
  action(hosting())
  net.recv!({t:'PLAYER_JOIN',name:'Late',sid:'',v:0},'L')
  expect(net.sent.at(-1)![0]).toMatchObject({t:'STATE_SNAPSHOT',status:'playing',state:{taps:{P:1}}})})
 it('tells the game when a player leaves, before they leave the roster',()=>{
  const sid=hosting();action(sid)
  net.room!.onPeerLeave!('P')
  expect(tap().taps).toEqual({});expect(app().players.map(p=>p.id)).toEqual(['SELF'])})
 it('returning to the lobby stops the game and clears its state',()=>{
  const sid=hosting()
  returnToLobby()
  expect(app().status).toBe('lobby');expect(app().gameState).toBeNull();expect(app().sid).toBe('')
  action(sid);action('')
  expect(app().gameState).toBeNull()})
 it('a guest back in the lobby can get ready for the next game',()=>{
  join();net.recv!(snapshot('H',1,{status:'playing',sid:'S',state:{taps:{},winner:null}}),'H')
  net.recv!({t:'RETURN_TO_LOBBY',players:peers,sid:'S',v:2},'H')
  expect(app().status).toBe('lobby')
  setReady(true)
  expect(net.sent.at(-1)).toMatchObject([{t:'PLAYER_READY',ready:true},'H'])})})

describe('game hooks',()=>{
 const hooks={onStart:vi.fn(),onStop:vi.fn(),onEvent:vi.fn(),onPeer:vi.fn(),onPlayerLeave:vi.fn()}
 const dispose=vi.fn()
 let ctx:any
 const hooked:GameModule={...tapRace,net:{...tapRace.net,client:hooks,
  isEvent:(x:unknown):x is unknown=>x==='good',isPeer:(x:unknown):x is unknown=>x==='good',
  createHost(c:any){ctx=c;return{...tapRace.net.createHost(c),dispose}}}}
 beforeEach(()=>{vi.clearAllMocks()})
 const joinHooked=()=>{joinParty('ABC','Me',()=>hooked);net.recv!(snapshot('H',1,{status:'playing',sid:'S',state:{taps:{},winner:null}}),'H')}
 it('a late joiner starts once, and stopping runs once',()=>{
  joinHooked()
  net.recv!(snapshot('H',2,{status:'playing',sid:'S',state:{taps:{},winner:null}}),'H')
  expect(hooks.onStart).toHaveBeenCalledOnce()
  leave();leave()
  expect(hooks.onStop).toHaveBeenCalledOnce()})
 it('the host gets the same client hooks, and disposes its game',()=>{
  hostParty(hooked,'Me');startGame()
  expect(hooks.onStart).toHaveBeenCalledOnce()
  returnToLobby()
  expect(hooks.onStop).toHaveBeenCalledOnce();expect(dispose).toHaveBeenCalledOnce()})
 it('leaving mid-game disposes the host\'s game',()=>{
  hostParty(hooked,'Me');startGame();leave()
  expect(dispose).toHaveBeenCalledOnce()})
 it('emit reaches everyone, and sendTo reaches one player',()=>{
  hostParty(hooked,'Me');startGame()
  ctx.emit('good')
  expect(hooks.onEvent).toHaveBeenCalledWith('good')
  expect(net.sent.at(-1)![0]).toMatchObject({t:'EVENT',m:'good'});expect(net.sent.at(-1)![1]).toBeUndefined()
  ctx.sendTo('P','good')
  expect(net.sent.at(-1)).toMatchObject([{t:'PRIVATE',m:'good'},'P'])
  ctx.sendTo('SELF','good')
  expect(hooks.onEvent).toHaveBeenCalledTimes(2)})
 it('guests check events and private messages',()=>{
  joinHooked()
  net.recv!({t:'EVENT',m:'bad',sid:'S',v:2},'H')
  net.recv!({t:'PRIVATE',m:'bad',sid:'S',v:0},'H')
  net.recv!({t:'EVENT',m:'good',sid:'S',v:2},'X')
  expect(hooks.onEvent).not.toHaveBeenCalled()
  net.recv!({t:'EVENT',m:'good',sid:'S',v:2},'H')
  net.recv!({t:'PRIVATE',m:'good',sid:'S',v:0},'H')
  expect(hooks.onEvent).toHaveBeenCalledTimes(2)})
 it('a game with no isEvent or isPeer drops those messages',()=>{
  const onEvent=vi.fn(),onPeer=vi.fn()
  joinParty('ABC','Me',()=>({...tapRace,net:{...tapRace.net,client:{onEvent,onPeer}}}))
  net.recv!(snapshot('H',1,{status:'playing',sid:'S',state:{taps:{},winner:null}}),'H')
  net.recv!({t:'EVENT',m:'x',sid:'S',v:2},'H')
  net.recv!({t:'PEER',m:'x',sid:'S',v:0},'P')
  expect(onEvent).not.toHaveBeenCalled();expect(onPeer).not.toHaveBeenCalled()})
 it('peer messages go straight to the others, checked and only in the session',()=>{
  joinHooked()
  sendToPeers('good')
  expect(net.sent.at(-1)).toMatchObject([{t:'PEER',m:'good',sid:'S'},undefined])
  net.recv!({t:'PEER',m:'bad',sid:'S',v:0},'P')
  net.recv!({t:'PEER',m:'good',sid:'old',v:0},'P')
  expect(hooks.onPeer).not.toHaveBeenCalled()
  net.recv!({t:'PEER',m:'good',sid:'S',v:0},'P')
  expect(hooks.onPeer).toHaveBeenCalledWith('P','good')})
 it('peers can\'t send outside a game',()=>{
  hostParty(hooked,'Me');const before=net.sent.length
  sendToPeers('good')
  expect(net.sent).toHaveLength(before)})
 it('tells the client when someone leaves',()=>{
  joinHooked();net.room!.onPeerLeave!('P')
  expect(hooks.onPlayerLeave).toHaveBeenCalledWith('P')})})

describe('party chat',()=>{
 const lines=()=>app().chat
 const withFriend=()=>{hostParty(tapRace,'Me');addFriend()}
 const said=(text:string,from='P')=>net.recv!({t:'CHAT_SEND',text,sid:'',v:0},from)
 it('the host posts its own messages in the lobby',()=>{
  hostParty(tapRace,'Me');sendChat('  hello  ')
  expect(lines()).toMatchObject([{from:'SELF',name:'Me',text:'hello'}])})
 it('the host broadcasts a member\'s message under their real name',()=>{
  withFriend();said('hi all')
  expect(lines()).toMatchObject([{from:'P',name:'Pal',text:'hi all'}])
  expect(net.sent.at(-1)![0]).toMatchObject({t:'CHAT',from:'P',text:'hi all'})
  expect(net.sent.at(-1)![1]).toBeUndefined()})
 it('a guest sends to the host and shows nothing until the host answers',()=>{
  join();net.recv!(snapshot('H',1),'H')
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
  join();net.recv!(snapshot('H',1),'H')
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
  hostParty(tapRace,'Me');sendChat('old');hostParty(tapRace,'Me')
  expect(lines()).toEqual([])})})

describe('parseEnv',()=>{
 it('accepts good messages and rejects bad shapes',()=>{
  expect(parseEnv({t:'PLAYER_JOIN',name:'x',sid:'s',v:0})).toBeTruthy()
  expect(parseEnv({t:'PLAYER_JOIN',name:'x'.repeat(5000),sid:'s',v:0})).toBeNull()
  expect(parseEnv({t:'STATE_SNAPSHOT',players:[],hostId:'H',status:'lobby',gameId:'g',state:null,sid:'',v:1})).toBeTruthy()
  expect(parseEnv({t:'STATE_SNAPSHOT',players:[],hostId:'H',status:'lobby',state:null,sid:'',v:1})).toBeNull()
  expect(parseEnv({t:'STATE_SNAPSHOT',players:[],hostId:'H',status:'nope',gameId:'g',state:null,sid:'',v:1})).toBeNull()
  expect(parseEnv({t:'ACTION',m:{},sid:'s',v:Infinity})).toBeNull()})
 it('survives malformed messages',()=>{
  hostParty(tapRace,'Me');startGame()
  for(const m of[null,42,'x',[],{t:'ACTION',sid:'',v:0},{t:'PLAYER_JOIN',sid:'',v:0},{t:'NOPE',sid:'',v:0}])net.recv!(m,'P')
  expect(app().players).toHaveLength(1)})})
