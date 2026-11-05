import {describe,expect,it} from 'vitest'
import {H,LAYOUTS,machinesIn,solidsIn,W,type Rect} from './layouts'
import {FLOORS} from '../mechanics/floors'

const FEET=9 // Half the player's collision box, rounded up.
const blocked=(x:number,y:number,solids:Rect[])=>solids.some(r=>Math.abs(x-r.x)<r.w/2+FEET&&Math.abs(y-r.y)<r.h/2+FEET)
/** Every spot the player's feet can reach from the spawn point, on a 6px grid. */
function reachable(floor:number){
 const solids=solidsIn(floor),STEP=6,seen=new Set<string>(),[sx,sy]=LAYOUTS[floor-1]!.spawn
 const start:[number,number]=[Math.round(sx/STEP)*STEP,Math.round((sy+16)/STEP)*STEP],todo=[start]
 seen.add(start.join())
 while(todo.length){
  const[x,y]=todo.pop()!
  for(const[dx,dy]of[[STEP,0],[-STEP,0],[0,STEP],[0,-STEP]] as const){
   const nx=x+dx,ny=y+dy,k=`${nx},${ny}`
   if(seen.has(k)||nx<0||ny<0||nx>W||ny>H||blocked(nx,ny,solids))continue
   seen.add(k);todo.push([nx,ny])}}
 return seen}
describe.each(FLOORS.map((_,i)=>i+1))('floor %i layout',floor=>{
 it('has a spot for every game',()=>expect(LAYOUTS[floor-1]!.spots).toHaveLength(FLOORS[floor-1]!.games.length))
 it('machines stand clear of each other and the furniture',()=>{
  const ms=machinesIn(floor),solids=solidsIn(floor)
  for(const m of ms){
   const others=solids.filter(r=>!(r.x===m.x&&r.y===m.y-m.bh/2))
   expect(others.some(r=>Math.abs(m.x-r.x)<(m.bw+r.w)/2&&Math.abs(m.y-m.bh/2-r.y)<(m.bh+r.h)/2),`${m.id} overlaps something`).toBe(false)}})
 it('every machine can be walked to and played',()=>{
  const seen=reachable(floor)
  for(const m of machinesIn(floor)){
   const dist=(x:number,y:number)=>Math.hypot(x-m.x,y-(m.y-m.bh/2))
   const ok=[...seen].some(k=>{const[x,y]=k.split(',').map(Number) as [number,number];return dist(x,y)<m.reach})
   expect(ok,`${m.id} is out of reach`).toBe(true)}})})
it('every floor has its own layout',()=>{
 expect(new Set(LAYOUTS.map(l=>JSON.stringify(l.spots))).size).toBe(LAYOUTS.length)
 expect(LAYOUTS).toHaveLength(FLOORS.length)})
