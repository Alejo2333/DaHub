import type {ComponentType,LazyExoticComponent} from 'react'
import type {Player} from './net'

/** What a game's host logic can do. The party layer handles delivery, versions, sessions and late joiners. */
export interface HostContext<Event=never>{
 readonly selfId:string
 players():Player[]
 nameOf(id:string):string
 /** Sends the result of `state()` to everyone, including this client. Call it after every change. */
 publish():void
 /** Sends an event to everyone, in order with state updates. */
 emit(event:Event):void
 /** Sends an event to one player, such as "your bet was refused". */
 sendTo(id:string,event:Event):void
}

/** The authoritative game. It only exists in the host's browser, from the start of a game until it ends. */
export interface HostGame<State,Action>{
 /** The full state every player sees. Never put anything secret here. */
 state():State
 /** A player's request, already checked by `isAction`. It comes from a party member, but still decide whether it's allowed. */
 onAction(from:string,action:Action):void
 /** Runs before the player leaves the roster, so `nameOf` still works. */
 onPlayerLeave?(id:string):void
 /** Stop every timer here. The game has ended. */
 dispose():void
}

/** Optional hooks that run in every player's browser, including the host's. */
export interface ClientHooks<Event=never,Peer=never>{
 /** A game began, or this player joined one already running. Reset local state here. */
 onStart?():void
 /** The game ended or this player left. */
 onStop?():void
 onEvent?(event:Event):void
 /** A message from `sendToPeers`. It doesn't go through the host, so never trust it for game rules. */
 onPeer?(from:string,message:Peer):void
 onPlayerLeave?(id:string):void
}

/**
 * A game's multiplayer logic. Other players are untrusted, so the validators run on everything they send.
 * Only `isState`, `isAction` and `createHost` are required. Without `isEvent` or `isPeer`, those messages are dropped.
 */
export interface GameNet<State,Action,Event=never,Peer=never>{
 isState(x:unknown):x is State
 isAction(x:unknown):x is Action
 isEvent?(x:unknown):x is Event
 isPeer?(x:unknown):x is Peer
 /** Called when the host starts a game. `ctx.publish` does nothing until this returns, and the first state goes out by itself. */
 createHost(ctx:HostContext<Event>):HostGame<State,Action>
 client?:ClientHooks<Event,Peer>
}

/** Everything the hub needs to list a game, show its page, run its party and start it. */
export interface GameModule{
 id:string;title:string;tagline:string;cover:string
 /** The host can't start with fewer players. */
 minPlayers:number
 /** Party size limit, at most 16. */
 maxPlayers:number
 /** Shown as a filter on the home page. */
 category:string
 tags:string[]
 description:string
 howTo:string[]
 controls:string[]
 /** Optional small print on the game's page. */
 notice?:string
 /** Optional personal best, such as "Best: floor 3". */
 best?:()=>string|null
 /** The in-game screen. Read the state from `useApp`, and call `sendAction` to ask the host for something. */
 Component:LazyExoticComponent<ComponentType>
 // Each game has its own types, which the hub never looks inside.
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
 net:GameNet<any,any,any,any>
}
