import {useState} from 'react'
import {isHost,MAX_PLAYERS,selfId,setReady,startGame} from '../multiplayer/party'
import type {GameModule} from '../types/game'
import type {Player} from '../types/net'
import Avatar from './Avatar'
import ChatBox from './ChatBox'

export default function Lobby({game,code,players,hostId,onExit}:{game:GameModule;code:string;players:Player[];hostId:string;onExit:()=>void}){
 const [copied,setCopied]=useState(false)
 const me=players.find(p=>p.id===selfId),host=isHost(),allReady=players.every(p=>p.ready)
 const waitingOn=players.filter(p=>!p.ready).length
 const copy=()=>{void navigator.clipboard.writeText(`${location.origin}/party/${code}`).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),1500)})}
 return <section className="lobby">
  <header className="lobby-head">
   <img src={game.cover} alt="" className="lobby-art"/>
   <div className="min-w-0 flex-1"><p className="eyebrow">Party lobby</p><h1>{game.title}</h1></div>
   <button onClick={onExit} className="btn-ghost">Leave</button>
  </header>
  <div className="lobby-body">
   <div className="lobby-main">
   <div className="lobby-players">
    <h2 className="section-title">Players {players.length}/{MAX_PLAYERS}</h2>
    <ul className="slot-grid">
     {Array.from({length:MAX_PLAYERS},(_,i)=>{
      const p=players[i]
      return p
       ?<li key={p.id} className={`slot${p.ready?' slot-ready':''}`}>
         <Avatar id={p.id} name={p.name} size={40}/>
         <span className="slot-text"><b>{p.name}{p.id===selfId&&' (you)'}</b><small>{p.id===hostId?'Host':p.ready?'Ready':'Not ready'}</small></span></li>
       :<li key={`empty-${i}`} className="slot slot-empty"><span className="slot-dot"/><small>Open slot</small></li>})}
    </ul>
    {!host&&me&&<button onClick={()=>setReady(!me.ready)} className={me.ready?'btn-ghost btn-wide':'btn-primary'}>{me.ready?'Not ready yet':"I'm ready"}</button>}
    {!host&&!me&&<p role="status" className="hint">Joining the party…</p>}
    {host&&<button onClick={startGame} disabled={!allReady} className="btn-primary">{allReady?'Start game':`Waiting for ${waitingOn} ${waitingOn===1?'player':'players'}`}</button>}
   </div>
   <ChatBox variant="lobby"/>
   </div>
   <aside className="lobby-side">
    <p className="eyebrow">Room code</p>
    <div className="room-code">{code}</div>
    <button onClick={copy} className="btn-ghost btn-wide">{copied?'Link copied':'Copy invite link'}</button>
    <h2 className="section-title">Controls</h2>
    <ul className="control-list">{game.controls.map(s=><li key={s}>{s}</li>)}</ul>
   </aside>
  </div></section>}
