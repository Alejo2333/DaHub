import type {BaseRoomConfig,RelayConfig,TurnConfig} from 'trystero'
import {getRelaySockets,joinRoom,selfId} from 'trystero/nostr'
import type {Env} from '../types/net'
export {selfId}
export interface Room{send:(e:Env,to?:string)=>void;leave:()=>void}
/** Pinned because Trystero's default list includes relays that are down or reject its events. Each of these delivered a test offer. */
const RELAY_URLS=['nos.lol','relay.damus.io','relay.mostro.network','nostr.data.haus','yabu.me/v2'].map(h=>'wss://'+h)
/** True if at least one signalling relay is connected. */
export const relayConnected=()=>Object.values(getRelaySockets()).some(s=>s.readyState===WebSocket.OPEN)
/** Typed, game-agnostic Trystero wrapper. One data channel ("m") carries every typed message. */
export function openRoom(code:string,onMsg:(e:Env,from:string)=>void,onJoin:(id:string)=>void,onLeave:(id:string)=>void):Room{
 const turnUrls=((import.meta.env.VITE_TURN_URL as string|undefined)??'').split(',').map(u=>u.trim()).filter(Boolean)
 const turnConfig=turnUrls.length?[{urls:turnUrls,username:import.meta.env.VITE_TURN_USER as string,credential:import.meta.env.VITE_TURN_PASS as string}]:[]
 const config:BaseRoomConfig&RelayConfig&TurnConfig={appId:(import.meta.env.VITE_APP_ID as string)||'lucky-debt-hub-v1',relayUrls:RELAY_URLS,turnConfig}
 const room=joinRoom(config,'ld-'+code)
 const [send,recv]=room.makeAction('m') as unknown as [(d:Env,to?:string)=>Promise<unknown>,(cb:(d:Env,p:string)=>void)=>void]
 recv(onMsg);room.onPeerJoin(onJoin);room.onPeerLeave(onLeave)
 return{send:(e,to)=>{void send(e,to)},leave:()=>{void room.leave()}}
}
