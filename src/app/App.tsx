import {Suspense,useEffect,useState} from 'react'
import {saveName,useApp} from '../stores/app'
import {cleanCode,connect,leave} from '../multiplayer/party'
import {games,getGame} from '../games/registry'
import GamePage from './GamePage'
import Home from './Home'
import Lobby from './Lobby'

const codeFromUrl=()=>/^\/party\/([A-Za-z0-9]{3,8})\/?$/.exec(location.pathname)?.[1]?.toUpperCase()
const gameIdFrom=(path:string)=>/^\/game\/([\w-]+)\/?$/.exec(path)?.[1]

function Logo(){
 return <svg viewBox="0 0 32 32" className="logo-mark" aria-hidden="true"><rect x="1" y="6" width="30" height="20" rx="10" fill="var(--accent)"/><path d="M10 12v8M6 16h8" stroke="#0d1220" strokeWidth="2.6" strokeLinecap="round"/><circle cx="21" cy="13.5" r="2" fill="#0d1220"/><circle cx="25" cy="18.5" r="2" fill="#0d1220"/></svg>}

function JoinForm({disabled,onJoin}:{disabled:boolean;onJoin:(code:string)=>void}){
 const [value,setValue]=useState('')
 const code=cleanCode(value)
 return <form className="join-form" onSubmit={e=>{e.preventDefault();if(code.length>=3&&!disabled)onJoin(code)}}>
  <label htmlFor="join-code" className="sr-only">Room code</label>
  <input id="join-code" value={value} onChange={e=>setValue(cleanCode(e.target.value))} placeholder="Room code" maxLength={8} autoComplete="off" spellCheck={false}/>
  <button disabled={code.length<3||disabled} className="btn-join">Join</button>
 </form>}

export default function App(){
 const s=useApp()
 const [path,setPath]=useState(location.pathname),[search,setSearch]=useState('')
 const navigate=(p:string)=>{history.pushState(null,'',p);setPath(p)}
 const hasName=s.name.trim().length>0
 useEffect(()=>{const c=codeFromUrl();if(c&&useApp.getState().status==='idle')connect('join',useApp.getState().name,c)},[])
 useEffect(()=>{
  const onPop=()=>{
   setPath(location.pathname)
   // Pressing Back out of a lobby leaves the party.
   const st=useApp.getState().status
   if(!codeFromUrl()&&(st==='lobby'||st==='connecting'))leave()}
  window.addEventListener('popstate',onPop);return()=>window.removeEventListener('popstate',onPop)},[])
 const create=()=>{connect('host',s.name);navigate('/party/'+useApp.getState().code)}
 const join=(c:string)=>{connect('join',s.name,c);navigate('/party/'+useApp.getState().code)}
 const exit=()=>{leave();navigate('/')}
 const home=()=>{setSearch('');navigate('/')}

 // Parties always run the first registered game until the party protocol carries a game id.
 const partyGame=games[0]!
 if(s.status==='playing'&&s.game)return <Suspense fallback={<div className="loading-screen"><div className="spinner-chip"/>Loading game…</div>}><partyGame.Component/></Suspense>
 const browsing=s.status==='idle'||s.status==='error'
 const openGame=gameIdFrom(path)?getGame(gameIdFrom(path)!):undefined
 return <div className="hub">
  <nav className="hub-nav">
   {browsing
    ?<a href="/" className="brand" onClick={e=>{e.preventDefault();home()}}><Logo/>Game Hub</a>
    :<span className="brand"><Logo/>Game Hub</span>}
   {browsing&&<input type="search" value={search} aria-label="Search games" placeholder="Search games" className="hub-search" onChange={e=>{setSearch(e.target.value);if(openGame)navigate('/')}}/>}
   {browsing&&<JoinForm disabled={!hasName} onJoin={join}/>}
   <label className="name-field"><span>Nickname</span><input value={s.name} maxLength={16} disabled={!browsing} onChange={e=>saveName(e.target.value)}/></label>
  </nav>
  <main className="hub-main">
   {s.status==='error'&&<div role="alert" className="error-card"><p>{s.error}</p><button onClick={exit} className="btn-ghost">Dismiss</button></div>}
   {browsing&&(openGame
    ?<GamePage game={openGame} canPlay={hasName} onCreate={create} onBack={home}/>
    :<Home search={search} onOpen={id=>navigate('/game/'+id)}/>)}
   {s.status==='connecting'&&<div role="status" className="connecting"><div className="spinner-chip"/><p>Finding party <b>{s.code}</b>…</p><button onClick={exit} className="btn-ghost">Cancel</button></div>}
   {s.status==='lobby'&&<Lobby game={partyGame} code={s.code} players={s.players} hostId={s.hostId} onExit={exit}/>}
  </main></div>}
