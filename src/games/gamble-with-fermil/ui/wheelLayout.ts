import {WHEEL} from '../mechanics/payouts'
/** Where each WHEEL entry sits around the rim, so equal payouts aren't bunched together. WHEEL_ORDER[position] = WHEEL index. */
export const WHEEL_ORDER=[19,0,13,1,8,2,14,3,17,4,9,5,15,6,10,7,18,11,16,12]
if(WHEEL_ORDER.length!==WHEEL.length)throw new Error('WHEEL_ORDER must cover every wheel segment')
export const wheelColor=(m:number)=>m===0?'#2a1a3d':m===0.5?'#5b3a8c':m===1.5?'#1d8a6e':m===2?'#1d6fd8':'#e8a91c'
