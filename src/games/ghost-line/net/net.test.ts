import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {useApp} from '../../../stores/app'
import {net} from '../../../multiplayer/fakeNetwork'
import type {RaceState} from '../types'
import game from '..'
import {buildCourse} from '../mechanics/course'
import {COUNTDOWN,RACE_LIMIT,RESULTS_DELAY} from './host'
import {isAction,isPeer,isState} from './validate'

vi.mock('trystero/nostr',async()=>(await import('../../../multiplayer/fakeNetwork')).trystero)
import {hostParty,joinParty,leave,returnToLobby,startGame} from '../../../multiplayer/party'
import {ghostAt,ghosts,sendFinish,sendPose,type Sample} from './client'

const race=()=>useApp.getState().gameState as RaceState
const finishFrom=(from:string)=>net.recv!({t:'ACTION',m:{t:'FINISH'},sid:useApp.getState().sid,v:0},from)
const hosting=(friends=1)=>{hostParty(game,'Me');for(let i=0;i<friends;i++)useApp.setState(s=>({players:[...s.players,{id:'P'+i,name:'Pal'+i,ready:true}]}));startGame()}
const toRacing=()=>vi.advanceTimersByTime(COUNTDOWN*1000)
const honest=()=>vi.advanceTimersByTime(buildCourse(race().seed).minMs+1000)
beforeEach(()=>{net.reset();vi.useFakeTimers()})
afterEach(()=>{leave();vi.useRealTimers()})

describe('race flow',()=>{
 it('counts down, then races',()=>{
  hosting();expect(race().phase).toBe('countdown');expect(race().clock).toBe(COUNTDOWN)
  vi.advanceTimersByTime(1000);expect(race().clock).toBe(COUNTDOWN-1)
  vi.advanceTimersByTime((COUNTDOWN-1)*1000);expect(race().phase).toBe('racing')})
 it('everyone is told the same seed',()=>{
  hosting();expect(net.sent.at(-1)![0]).toMatchObject({t:'GAME_START',state:{seed:race().seed}})})
 it('records finishes in order, and shows results once all are in',()=>{
  hosting();toRacing();honest()
  finishFrom('P0');expect(race().finishes.map(f=>f.id)).toEqual(['P0']);expect(race().phase).toBe('racing')
  vi.advanceTimersByTime(2000);sendFinish()
  expect(race().finishes.map(f=>f.id)).toEqual(['P0','SELF'])
  expect(race().finishes[1]!.ms).toBeGreaterThan(race().finishes[0]!.ms)
  vi.advanceTimersByTime(RESULTS_DELAY);expect(race().phase).toBe('results')})
 it('ends at the time limit with whoever finished',()=>{
  hosting();toRacing();honest();finishFrom('P0')
  vi.advanceTimersByTime(RACE_LIMIT*1000);expect(race().phase).toBe('results');expect(race().finishes).toHaveLength(1)})
 it('stops waiting for someone who leaves',()=>{
  hosting();toRacing();honest();sendFinish();expect(race().phase).toBe('racing')
  net.room!.onPeerLeave!('P0')
  vi.advanceTimersByTime(RESULTS_DELAY);expect(race().phase).toBe('results')})
 it('a player who finished and left is taken off the results',()=>{
  hosting();toRacing();honest();finishFrom('P0');net.room!.onPeerLeave!('P0')
  expect(race().finishes).toEqual([])})
 it('leaves no timers running when it ends',()=>{
  hosting();toRacing();leave();expect(vi.getTimerCount()).toBe(0)})
 it('can race again from the lobby, on a new course',()=>{
  hosting(0);const first=race().seed;returnToLobby();expect(useApp.getState().status).toBe('lobby')
  expect(vi.getTimerCount()).toBe(0)
  startGame();expect(race().phase).toBe('countdown');expect(race().seed).not.toBe(first)})})

describe('cheating',()=>{
 it('refuses a finish before the race starts',()=>{
  hosting();finishFrom('P0');expect(race().finishes).toEqual([])})
 it('refuses a finish faster than the course allows',()=>{
  hosting();toRacing();vi.advanceTimersByTime(5000);finishFrom('P0');expect(race().finishes).toEqual([])})
 it('only counts the first finish',()=>{
  hosting();toRacing();honest();finishFrom('P0');const ms=race().finishes[0]!.ms
  vi.advanceTimersByTime(1000);finishFrom('P0');expect(race().finishes).toEqual([{id:'P0',ms}])})
 it('ignores outsiders',()=>{
  hosting();toRacing();honest();finishFrom('STRANGER');expect(race().finishes).toEqual([])})
 it('validators refuse bad shapes',()=>{
  expect(isAction({t:'FINISH'})).toBe(true);expect(isAction({t:'WIN'})).toBe(false)
  expect(isPeer({t:'POSE',x:1,y:2,move:'run',p:0})).toBe(true)
  expect(isPeer({t:'POSE',x:Infinity,y:2,move:'run',p:0})).toBe(false)
  expect(isPeer({t:'POSE',x:1,y:2,move:'fly',p:0})).toBe(false)
  expect(isState({phase:'racing',clock:1,seed:1,finishes:[]})).toBe(true)
  expect(isState({phase:'racing',clock:1,seed:'x',finishes:[]})).toBe(false)
  expect(isState({phase:'won',clock:1,seed:1,finishes:[]})).toBe(false)
  expect(isState({phase:'racing',clock:1,seed:1,finishes:[{id:'a'}]})).toBe(false)})})

describe('ghosts',()=>{
 const join=()=>{joinParty('ABC','Me',()=>game);net.recv!({t:'STATE_SNAPSHOT',players:[{id:'H',name:'H',ready:true},{id:'SELF',name:'Me',ready:true}],hostId:'H',status:'playing',gameId:game.id,state:{phase:'racing',clock:100,seed:1,finishes:[]},sid:'S',v:1},'H')}
 const pose=(x:number,from='H')=>net.recv!({t:'PEER',m:{t:'POSE',x,y:0,move:'run',p:0},sid:'S',v:0},from)
 it('sends poses straight to the other players',()=>{
  join();sendPose(5,6,'jump',-100)
  expect(net.sent.at(-1)).toMatchObject([{t:'PEER',m:{t:'POSE',x:5,y:6,move:'jump',p:-100},sid:'S'},undefined])})
 it('keeps recent samples, and forgets a player who leaves',()=>{
  join();for(let i=0;i<30;i++)pose(i)
  expect(ghosts.get('H')!.length).toBeLessThanOrEqual(10);expect(ghosts.get('H')!.at(-1)!.x).toBe(29)
  net.room!.onPeerLeave!('H');expect(ghosts.has('H')).toBe(false)})
 it('clears them when the game ends',()=>{
  join();pose(1);net.recv!({t:'RETURN_TO_LOBBY',players:[],sid:'S',v:2},'H');expect(ghosts.size).toBe(0)})
 const s=(at:number,x:number,move:Sample['move']='run',p=0):Sample=>({at,x,y:0,move,p})
 it('smooths between samples',()=>{
  expect(ghostAt([s(0,0),s(100,50)],50)!.x).toBeCloseTo(25)
  expect(ghostAt([s(0,0,'slide',.2),s(100,50,'slide',.4)],50)!.p).toBeCloseTo(.3)})
 it('a move restarting is not played backward',()=>{
  expect(ghostAt([s(0,0,'tumble',.9),s(100,50,'tumble',.1)],50)!.p).toBe(.1)})
 it('holds the last sample when none is newer, and has nothing with no samples',()=>{
  expect(ghostAt([s(0,0),s(100,50)],500)!.x).toBe(50);expect(ghostAt([],0)).toBeNull()})
 it('does not smooth across a respawn',()=>{
  expect(ghostAt([s(0,5000),s(100,1000)],50)!.x).toBe(1000)})})
