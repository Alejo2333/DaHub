import ChatBox from '../../../app/ChatBox'
import {isHost,leave,nameOf,returnToLobby,selfId,sendAction} from '../../../multiplayer/party'
import {useApp} from '../../../stores/app'
import {TAPS_TO_WIN,type TapAction,type TapState} from '..'

const send=(action:TapAction)=>sendAction(action)

/** The in-game screen. It reads the state the host published and sends actions back. It never changes the state itself. */
export default function TapRace(){
 const state=useApp(s=>s.gameState as TapState|null),players=useApp(s=>s.players)
 if(!state)return null
 const exit=()=>{leave();history.replaceState(null,'','/')}
 return <section className="lobby">
  <h1>{state.winner?`${nameOf(state.winner)} wins!`:`First to ${TAPS_TO_WIN} taps`}</h1>
  <ul>{players.map(p=><li key={p.id}>{p.name}{p.id===selfId&&' (you)'}: {state.taps[p.id]??0}</li>)}</ul>
  {!state.winner&&<button onClick={()=>send({t:'TAP'})} className="btn-primary">Tap!</button>}
  {state.winner&&isHost()&&<button onClick={returnToLobby} className="btn-primary">Return to lobby</button>}
  <button onClick={exit} className="btn-ghost">Leave</button>
  <ChatBox variant="lobby"/>
 </section>}
