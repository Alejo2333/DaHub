import type {PrankKind} from '../types'

export const LUCK_CHARGES=3,LUCK_WIN=1.25,CLOCK_SECONDS=45,BRIBE_CUT=.1
/** How long the timed pranks last, in seconds. */
export const PRANK_SECONDS:Partial<Record<PrankKind,number>>={stink:20,shoes:20,cuffs:15}
export type HelpKind='charm'|'marked'|'watch'|'bribe'
export type ItemId=HelpKind|PrankKind
export interface ShopItem{
 name:string;icon:string;desc:string
 /** Share of the floor's base debt, so prices keep up with the floors. */
 price:number
 /** How many the dealer has per floor. */
 stock:number
 prank:boolean
}
export const SHOP_ITEMS:Record<ItemId,ShopItem>={
 charm:{name:"Rabbit's Foot",icon:'🐇',desc:`The team's next ${LUCK_CHARGES} wins pay +25%.`,price:.15,stock:1,prank:false},
 marked:{name:'Marked Cards',icon:'🃏',desc:'The next losing bet is redrawn once. Not on Crash.',price:.12,stock:1,prank:false},
 watch:{name:'Stopped Watch',icon:'⏱️',desc:`+${CLOCK_SECONDS}s on this floor's clock.`,price:.1,stock:1,prank:false},
 bribe:{name:'Envelope of Cash',icon:'✉️',desc:"Cuts this floor's debt by 10%.",price:.06,stock:1,prank:false},
 stink:{name:'Stink Bomb',icon:'🤢',desc:'Fills their screen with green fog for 20s.',price:.02,stock:2,prank:true},
 shoes:{name:'Backwards Shoes',icon:'👟',desc:'Reverses their walking for 20s.',price:.03,stock:2,prank:true},
 cuffs:{name:'Handcuffs',icon:'⛓️',desc:'They cannot place a bet for 15s.',price:.04,stock:2,prank:true},
 butter:{name:'Butterfingers',icon:'🧈',desc:'Doubles their next bet, whether they like it or not.',price:.03,stock:2,prank:true},
 curse:{name:'Cursed Coin',icon:'🪙',desc:'Halves the winnings on their next win.',price:.03,stock:2,prank:true}}
export const isItem=(id:string):id is ItemId=>Object.hasOwn(SHOP_ITEMS,id)
