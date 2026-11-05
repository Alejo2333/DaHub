export interface Player{id:string;name:string;ready:boolean}
export interface Stats{bets:number;won:number;lost:number;peak:number;biggest:number}
export interface GState{
 phase:'playing'|'upgrades'|'over'
 balance:number
 quota:number
 floor:number
 timeLeft:number
 upgrades:Record<string,number>
 shield:number
 /** The loan shark can be used once per floor. */
 loanUsed:boolean
 /** Chips awarded for paying the last floor's debt early. */
 bonus:number
 stats:Stats
}
export const GAME_KINDS=['slots','roulette','dice','wheel','crash'] as const
export type GameKind=typeof GAME_KINDS[number]
export interface BetReq{id:string;game:GameKind;wager:number;choice:string|number}
export interface BetResult{id:string;from:string;game:GameKind;wager:number;payout:number;net:number;roll:unknown;detail:string;shielded:boolean}
export type Status='idle'|'connecting'|'lobby'|'playing'|'error'
export type Tone='win'|'lose'|'info'
export type Msg=
|{t:'PLAYER_JOIN';name:string}|{t:'PLAYER_LEAVE';id:string}|{t:'PLAYER_READY';ready:boolean}
|{t:'PLAYER_MOVE';x:number;y:number}|{t:'MACHINE_INTERACT';machine:GameKind}
|{t:'GAME_START';game:GState}|{t:'GAME_END';game:GState}|{t:'RETURN_TO_LOBBY';players:Player[]}
|{t:'BET_REQUEST';req:BetReq}|{t:'BET_RESULT';id:string;res?:BetResult;err?:string}
|{t:'CRASH_LIVE';id:string}|{t:'CRASH_CASHOUT';id:string}
|{t:'WALLET_UPDATE';game:GState}|{t:'TIMER_SYNC';timeLeft:number}|{t:'FLOOR_COMPLETE';game:GState}
|{t:'UPGRADE_PURCHASE';id:string}|{t:'PAY_DEBT'}|{t:'TAKE_LOAN'}|{t:'ERROR';msg:string}
|{t:'NOTICE';text:string;tone:Tone}
|{t:'STATE_SNAPSHOT';players:Player[];hostId:string;status:Status;game:GState|null}
/** Every message carries a session id and (host-originated) a monotonically increasing version. */
export type Env=Msg&{sid:string;v:number}
