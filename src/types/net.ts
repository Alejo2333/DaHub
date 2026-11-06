export interface Player{id:string;name:string;ready:boolean}
export type Status='idle'|'connecting'|'lobby'|'playing'|'error'
/** The party protocol. It knows nothing about any game: `state` and `m` are checked by the running game's validators. */
export type Msg=
|{t:'PLAYER_JOIN';name:string}|{t:'PLAYER_LEAVE';id:string}|{t:'PLAYER_READY';ready:boolean}
|{t:'GAME_START';state:unknown}|{t:'GAME_STATE';state:unknown}|{t:'RETURN_TO_LOBBY';players:Player[]}
/** Player to host. */
|{t:'ACTION';m:unknown}
/** Host to everyone, versioned. */
|{t:'EVENT';m:unknown}
/** Host to one player, not versioned. */
|{t:'PRIVATE';m:unknown}
/** Player to players, not versioned and not checked by the host. For movement and other cosmetic things. */
|{t:'PEER';m:unknown}
|{t:'ERROR';msg:string}
|{t:'CHAT_SEND';text:string}|{t:'CHAT';from:string;text:string}
|{t:'STATE_SNAPSHOT';players:Player[];hostId:string;status:Status;gameId:string;state:unknown}
/** Every message carries a session id and (host-originated) a monotonically increasing version. */
export type Env=Msg&{sid:string;v:number}
