import {joinRoom,selfId} from 'trystero'
import type {Env} from '../types/net'
export {selfId}
export interface Room{send:(e:Env,to?:string)=>void;leave:()=>void}
/** Typed, game-agnostic Trystero wrapper. One data channel ("m") carries every typed message. */
export function openRoom(code:string,onMsg:(e:Env,from:string)=>void,onJoin:(id:string)=>void,onLeave:(id:string)=>void):Room{
 const turn=import.meta.env.VITE_TURN_URL as string|undefined
 const rtcConfig:RTCConfiguration|undefined=turn?{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:turn,username:import.meta.env.VITE_TURN_USER as string,credential:import.meta.env.VITE_TURN_PASS as string}]}:undefined
 const room=joinRoom({appId:(import.meta.env.VITE_APP_ID as string)||'lucky-debt-hub-v1',...(rtcConfig?{rtcConfig}:{})},'ld-'+code)
 const [send,recv]=room.makeAction('m') as unknown as [(d:Env,to?:string)=>Promise<unknown>,(cb:(d:Env,p:string)=>void)=>void]
 recv(onMsg);room.onPeerJoin(onJoin);room.onPeerLeave(onLeave)
 return{send:(e,to)=>{void send(e,to)},leave:()=>{void room.leave()}}
}
