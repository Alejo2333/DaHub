export interface Stats{bets:number;won:number;lost:number;peak:number;biggest:number}
export interface GState{
 phase:'playing'|'upgrades'|'final'|'won'|'over'
 balance:number
 quota:number
 floor:number
 timeLeft:number
 upgrades:Record<string,number>
 shield:number
 /** Janny's marker can be taken once per floor. */
 loanUsed:boolean
 /** Markers taken this run. Each one adds to every later floor's debt. */
 markers:number
 /** How a won run ended: walked out free, or bought the casino. */
 ending:'free'|'owner'|null
 /** Chips awarded for paying the last floor's debt early. */
 bonus:number
 /** Chips Janny advanced for the upcoming floor. */
 payday:number
 stats:Stats
 /** Machines unlocked so far. */
 machines:GameKind[]
 /** Running room event. It ends when timeLeft reaches `until`. */
 event:RoomEvent|null
 /** Open team vote. It closes when timeLeft reaches `until`. */
 vote:Vote|null
 /** Charges from the Sketchy Shop: wins boosted, and losing bets redrawn. They carry between floors. */
 luck:number
 reroll:number
 /** Items sold on this floor, by item id. */
 bought:Record<string,number>
 pranks:Prank[]
}
export const PRANK_KINDS=['stink','shoes','cuffs','butter','curse'] as const
export type PrankKind=typeof PRANK_KINDS[number]
/** `until` is the timeLeft when a timed prank ends. Null means it lasts until it has been triggered once. */
export interface Prank{kind:PrankKind;target:string;until:number|null}
export const SIMPLE_KINDS=['coin','scratch','darts','rps','highcard','claw','ringtoss','derby','bowling','penalty','bingo','fishing','balloon','pegdrop','colorwheel','chest','dial'] as const
export type SimpleKind=typeof SIMPLE_KINDS[number]
export const GAME_KINDS=['slots','roulette','dice','wheel','crash','cups','vault',...SIMPLE_KINDS] as const
export type GameKind=typeof GAME_KINDS[number]
export type VoteKind='dare'|'shakedown'|'deal'
export interface RoomEvent{kind:'hot'|'cut';machine:GameKind;until:number}
export interface Vote{kind:VoteKind;until:number;yes:string[];no:string[]}
export interface BetReq{id:string;game:GameKind;wager:number;choice:string|number}
export interface BetResult{id:string;from:string;game:GameKind;wager:number;payout:number;net:number;roll:unknown;detail:string;shielded:boolean}
export type Tone='win'|'lose'|'info'

/** What a player can ask the host to do. */
export type Action=
|{t:'BET_REQUEST';req:BetReq}|{t:'CRASH_CASHOUT';id:string}
|{t:'UPGRADE_PURCHASE';id:string}|{t:'PAY_DEBT'}|{t:'TAKE_LOAN'}|{t:'VOTE_CAST';yes:boolean}|{t:'SHOP_BUY';id:string;target?:string}
/** Only the host may send these. */
|{t:'NEXT_FLOOR'}|{t:'WALK_AWAY'}|{t:'BUYOUT'}
/** What the host tells players, on top of the game state. */
export type Event=
|{t:'BET_RESULT';id:string;res?:BetResult;err?:string}
|{t:'CRASH_LIVE';id:string}
|{t:'NOTICE';text:string;tone:Tone}
/** Cosmetic messages players send straight to each other. */
export type Peer={t:'PLAYER_MOVE';x:number;y:number}|{t:'MACHINE_INTERACT';machine:GameKind}
