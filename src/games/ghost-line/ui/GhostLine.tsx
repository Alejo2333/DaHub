import {useEffect,useMemo,useRef,useState} from 'react'
import type Phaser from 'phaser'
import Avatar from '../../../app/Avatar'
import ChatBox from '../../../app/ChatBox'
import {isHost,leave,nameOf,returnToLobby,selfId} from '../../../multiplayer/party'
import {useApp} from '../../../stores/app'
import {hueOf} from '../../../utils/color'
import {sfx} from '../../../utils/sound'
import {buildCourse} from '../mechanics/course'
import {ghosts,sendFinish,sendPose} from '../net/client'
import type {RaceState} from '../types'
import './ghostLine.css'

const race=()=>useApp.getState().gameState as RaceState|null
const time=(ms:number)=>{const s=ms/1000;return `${Math.floor(s/60)}:${(s%60).toFixed(2).padStart(5,'0')}`}

export default function GhostLine(){
 const state=useApp(s=>s.gameState as RaceState|null),players=useApp(s=>s.players),host=isHost()
 const box=useRef<HTMLDivElement>(null)
 const [loading,setLoading]=useState(true),[hud,setHud]=useState({x:0,ms:0,flow:0})
 const seed=state?.seed
 const course=useMemo(()=>seed===undefined?null:buildCourse(seed),[seed])

 useEffect(()=>{
  if(!course)return
  let game:Phaser.Game|null=null,dead=false
  void import('../scenes/RunScene').then(({createRun})=>{
   if(dead||!box.current)return
   game=createRun(box.current,{
    selfId,name:useApp.getState().name,course,
    phase:()=>race()?.phase??null,
    others:()=>useApp.getState().players.filter(p=>p.id!==selfId),
    samples:id=>ghosts.get(id),
    onPose:sendPose,onFinish:sendFinish,
    onHud:(x,ms,flow)=>setHud({x,ms,flow}),
    chat:()=>useApp.getState().chat})
   setLoading(false)})
  return()=>{dead=true;game?.destroy(true)}},[course])

 const phase=state?.phase,clock=state?.clock
 useEffect(()=>{if(phase==='countdown'&&clock)sfx.tick()},[phase,clock])
 useEffect(()=>{if(phase==='results')sfx.win()},[phase])
 if(!state||!course)return null

 const pct=(x:number)=>Math.max(0,Math.min(100,x/course.finishX*100))
 const exit=()=>{if(window.confirm('Leave the race? If you are the host, this ends it for everyone.')){leave();history.replaceState(null,'','/')}}
 const place=[...state.finishes].sort((a,b)=>a.ms-b.ms)
 const unfinished=players.filter(p=>!place.some(f=>f.id===p.id))
 return <div className="game-root gl-root">
  {/* The game stops the browser's own focus change on a click, so clicking the course has to leave the chat box here. */}
  <div ref={box} className="absolute inset-0" onPointerDownCapture={()=>{const a=document.activeElement;if(a instanceof HTMLElement&&a.classList.contains('chat-input'))a.blur()}}/>
  {loading&&<div className="loading-screen"><div className="spinner-chip"/>Climbing to the roof…</div>}
  <header className="hud">
   <div className="hud-stat"><span className="hud-label">Time</span><b>{time(hud.ms)}</b></div>
   <div className="gl-progress">
    <span className="hud-label">Course</span>
    <div className="gl-track" role="progressbar" aria-label="Course progress" aria-valuenow={Math.round(pct(hud.x))} aria-valuemin={0} aria-valuemax={100}>
     <div className="gl-fill" style={{width:`${pct(hud.x)}%`}}/>
     {players.filter(p=>p.id!==selfId).map(p=><i key={p.id} title={p.name} className="gl-dot" style={{left:`${pct(ghosts.get(p.id)?.at(-1)?.x??0)}%`,background:`hsl(${hueOf(p.id)} 75% 62%)`}}/>)}
    </div>
   </div>
   <div className="hud-stat gl-flow" title="Clean moves build flow, and flow makes you faster"><span className="hud-label">Flow</span><span aria-label={`Flow ${Math.round(hud.flow*5)} of 5`}>{[1,2,3,4,5].map(i=><i key={i} className={hud.flow*5>=i-.01?'on':''}/>)}</span></div>
   <ul className="hud-players" aria-label={`${players.length} players`}>{players.map(p=><li key={p.id} title={p.name}><Avatar id={p.id} name={p.name} size={26}/></li>)}</ul>
   <div className="hud-actions"><button onClick={e=>{e.currentTarget.blur();exit()}} className="btn-ghost">Leave</button></div>
  </header>
  {state.phase==='countdown'&&<div className="gl-count" aria-live="assertive"><span key={state.clock}>{state.clock}</span></div>}
  {state.phase==='racing'&&hud.ms<1200&&<div className="gl-count" aria-hidden="true"><span>GO!</span></div>}
  {state.phase!=='results'&&<p className="gl-hint">Space to jump · S to slide · tap top or bottom</p>}
  <ChatBox variant="game"/>
  {state.phase==='results'&&<div className="modal-backdrop"><div className="modal modal-win">
   <div className="modal-medal" aria-hidden="true">🏁</div>
   <h2>{place[0]?`${nameOf(place[0].id)} wins`:'Nobody finished'}</h2>
   <ol className="gl-results">
    {place.map((f,i)=><li key={f.id}><span className="gl-place">{i+1}</span><Avatar id={f.id} name={nameOf(f.id)} size={24}/><b>{nameOf(f.id)}{f.id===selfId&&' (you)'}</b><span className="gl-time">{time(f.ms)}</span></li>)}
    {unfinished.map(p=><li key={p.id}><span className="gl-place">–</span><Avatar id={p.id} name={p.name} size={24}/><b>{p.name}{p.id===selfId&&' (you)'}</b><span className="gl-time">Did not finish</span></li>)}
   </ol>
   {host?<button onClick={returnToLobby} className="btn-primary">Return to lobby</button>:<p className="modal-wait">Waiting for the host to return everyone to the lobby…</p>}
  </div></div>}
 </div>}
