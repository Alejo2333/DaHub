import type {GameKind} from '../../../types/net'
import {FLOORS} from '../mechanics/floors'
import {simpleOf} from '../mechanics/simple'

export const W=1120,H=760,WALL_H=104
export const COLLECTOR_HOME={x:1000,y:690},COLLECTOR_TARGET={x:600,y:470}
export interface Rect{x:number;y:number;w:number;h:number}
interface Body{c:number;bw:number;bh:number;reach:number;cw:number;ch:number}
/** Anything the player can walk up to and use. */
export type Station=GameKind|'shop'
export type Machine=Body&{id:Station;x:number;y:number;fx:number;fy:number}
const SHOP_BODY:Body={c:0x8a5cff,bw:110,bh:32,reach:80,cw:130,ch:116}
/** bw,bh is the collision box. cw,ch is the shade drawn over the machine during a power cut. */
const BODIES:Partial<Record<GameKind,Body>>={
 slots:{c:0xffc94a,bw:76,bh:30,reach:72,cw:100,ch:124},
 roulette:{c:0xff4d6d,bw:170,bh:44,reach:96,cw:190,ch:90},
 dice:{c:0x4dd2ff,bw:160,bh:44,reach:92,cw:180,ch:90},
 wheel:{c:0xb07cff,bw:70,bh:26,reach:72,cw:130,ch:150},
 crash:{c:0x5cff9d,bw:112,bh:36,reach:82,cw:140,ch:170},
 cups:{c:0xffa24d,bw:110,bh:34,reach:80,cw:130,ch:84},
 vault:{c:0x9fb4d8,bw:96,bh:32,reach:76,cw:112,ch:128}}
const STYLE_BODIES={cabinet:{bw:76,bh:30,reach:72,cw:100,ch:124},table:{bw:150,bh:40,reach:90,cw:170,ch:84},booth:{bw:110,bh:32,reach:80,cw:130,ch:116}}
const bodyOf=(id:GameKind):Body=>{
 const s=simpleOf(id)
 return s?{c:s.color,...STYLE_BODIES[s.style]}:BODIES[id]!}

export interface Layout{
 name:string
 spawn:[number,number]
 /** Machine positions, in the same order as the floor's games. x,y is where the machine meets the floor. */
 spots:[number,number][]
 /** Where the Sketchy Shop has set up in this room. */
 shop:[number,number]
 runners:number[]
 poker:[number,number][]
 bar:[number,number]|null
 pillars:[number,number][]
 plants:[number,number][]
 chandeliers:number[]
 ropes:boolean
}
const CORNERS:[number,number][]=[[62,170],[1058,170],[62,560],[1058,540]]
/** One room per floor. The cashier's cage and the collector stay in the bottom-right corner of every room. */
export const LAYOUTS:Layout[]=[
 {name:'Grand Hall',spawn:[560,370],spots:[[200,216],[930,216],[560,610],[560,216]],shop:[400,640],runners:[520],poker:[[280,450],[840,450]],bar:[170,658],pillars:[[70,330],[1050,330]],plants:CORNERS,chandeliers:[300,820],ropes:true},
 {name:'The Lounge',spawn:[560,470],spots:[[230,340],[890,330],[250,640],[640,640]],shop:[440,640],runners:[200,800],poker:[],bar:[560,220],pillars:[[420,470],[700,470]],plants:CORNERS,chandeliers:[420,700],ropes:false},
 {name:'The Back Room',spawn:[560,350],spots:[[280,216],[800,216],[150,640],[600,650]],shop:[370,650],runners:[],poker:[[560,450]],bar:null,pillars:[[220,450],[900,450]],plants:[[62,170],[1058,170]],chandeliers:[560],ropes:false},
 {name:'High Roller Suite',spawn:[560,400],spots:[[560,300],[190,250],[930,250],[600,650]],shop:[400,650],runners:[520],poker:[[300,470],[820,470]],bar:[170,658],pillars:[[370,190],[750,190]],plants:[[1058,170],[62,170]],chandeliers:[300,820],ropes:false},
 {name:'The Vault Level',spawn:[560,420],spots:[[560,240],[200,310],[920,310],[300,650]],shop:[500,680],runners:[260,860],poker:[[640,530]],bar:null,pillars:[[380,230],[740,230],[70,500]],plants:[[62,170],[1058,170]],chandeliers:[440,680],ropes:false},
 {name:'The Penthouse',spawn:[560,440],spots:[[180,250],[940,250],[330,640],[680,640]],shop:[510,640],runners:[],poker:[],bar:[560,220],pillars:[[400,420],[720,420]],plants:CORNERS,chandeliers:[300,560,820],ropes:false}]
export const layoutIndex=(floor:number)=>Math.min(Math.max(floor,1),LAYOUTS.length)-1
export const layoutFor=(floor:number)=>LAYOUTS[layoutIndex(floor)]!
export function machinesIn(floor:number):Machine[]{
 const i=layoutIndex(floor),l=LAYOUTS[i]!
 const games:Machine[]=FLOORS[i]!.games.map((id,k)=>{
  const [x,y]=l.spots[k]!
  return{id,x,y,fx:x,fy:y+36,...bodyOf(id)}})
 const [sx,sy]=l.shop
 return [...games,{id:'shop',x:sx,y:sy,fx:sx,fy:sy+36,...SHOP_BODY}]}
/** Everything the player collides with in a room. x,y is the centre of each box. */
export function solidsIn(floor:number):Rect[]{
 const l=layoutFor(floor),out:Rect[]=[
  {x:W/2,y:WALL_H/2,w:W,h:WALL_H},{x:W/2,y:H-17,w:W,h:34},{x:18,y:H/2,w:36,h:H},{x:W-18,y:H/2,w:36,h:H},
  {x:950,y:636,w:232,h:48}]
 for(const m of machinesIn(floor))out.push({x:m.x,y:m.y-m.bh/2,w:m.bw,h:m.bh})
 for(const[x,y]of l.poker)out.push({x,y:y-22,w:220,h:44})
 if(l.bar){const[x,y]=l.bar;out.push({x,y:y-24,w:250,h:48});for(const d of[-70,0,70])out.push({x:x+d,y:y+26,w:12,h:6})}
 for(const[x,y]of l.pillars)out.push({x,y:y-9,w:36,h:18})
 for(const[x,y]of l.plants)out.push({x,y:y-5,w:24,h:10})
 if(l.ropes)for(const side of[496,664])for(let i=0;i<3;i++)out.push({x:side,y:490+i*44+6,w:8,h:6})
 return out}
