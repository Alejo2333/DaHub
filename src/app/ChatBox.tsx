import {useEffect,useRef,useState,type FormEvent,type KeyboardEvent} from 'react'
import {MAX_CHAT,selfId,sendChat} from '../multiplayer/party'
import {useApp} from '../stores/app'

/** The party's chat room. In a game it sits over the casino, and Enter opens it without taking over the controls. */
export default function ChatBox({variant}:{variant:'lobby'|'game'}){
 const lines=useApp(s=>s.chat),[text,setText]=useState('')
 const input=useRef<HTMLInputElement>(null),log=useRef<HTMLUListElement>(null)
 const inGame=variant==='game'
 useEffect(()=>{if(log.current)log.current.scrollTop=log.current.scrollHeight},[lines])
 useEffect(()=>{
  if(!inGame)return
  // Only when nothing else has focus, so Enter still presses a focused button such as the bet button.
  const onKey=(e:globalThis.KeyboardEvent)=>{if(e.key==='Enter'&&document.activeElement===document.body){e.preventDefault();input.current?.focus()}}
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[inGame])
 const submit=(e:FormEvent)=>{
  e.preventDefault()
  sendChat(text);setText('')
  // Back to walking after sending. In the lobby there's nothing else to do, so stay in the box.
  if(inGame)input.current?.blur()}
 const onKeyDown=(e:KeyboardEvent)=>{
  // Keeps typed letters away from the game's movement keys, and Esc from closing a machine's panel.
  e.stopPropagation()
  if(e.key==='Escape')input.current?.blur()}
 return <section className={`chat chat-${variant}`} aria-label="Party chat">
  {!inGame&&<h2 className="section-title">Chat</h2>}
  <ul ref={log} className="chat-log" aria-live="polite">
   {lines.map(l=><li key={l.id}><b className={l.from===selfId?'chat-me':undefined}>{l.name}</b> {l.text}</li>)}
   {!inGame&&!lines.length&&<li className="chat-empty">No messages yet. Say hi!</li>}
  </ul>
  <form className="chat-form" onSubmit={submit}>
   <label htmlFor={`chat-${variant}`} className="sr-only">Message the party</label>
   <input ref={input} id={`chat-${variant}`} className="chat-input" value={text} maxLength={MAX_CHAT} autoComplete="off" placeholder={inGame?'Press Enter to chat':'Message the party'} onChange={e=>setText(e.target.value)} onKeyDown={onKeyDown}/>
   {!inGame&&<button className="btn-ghost" disabled={!text.trim()}>Send</button>}
  </form>
 </section>}
