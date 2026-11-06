import {describe,expect,it} from 'vitest'
import {buildCourse,platformAfter,platformAt,type Course} from './course'
import {newRunner,start,step,STEP,type Input,type Runner} from './runner'

const flat:Course={platforms:[{x0:-100,x1:5000,y:0}],obstacles:[],checkpoints:[],finishX:4000,minMs:0}
const none:Input={jump:false,slide:false}
const running=(c:Course,x=0)=>{const r=newRunner();r.x=x;r.y=platformAt(c,x)?.y??0;start(r);return r}
const run=(r:Runner,c:Course,secs:number,input:Input=none)=>{for(let i=0;i<secs*60;i++)step(r,c,i===0?input:none)}

/** Plays like a decent player: presses at sensible distances. */
function bot(c:Course,seen:Set<string>=new Set()){
 const r=running(c);let frames=0
 while(!r.done&&frames<60*300){
  const input={jump:false,slide:false}
  if(r.grounded&&r.move==='run'){
   const ob=c.obstacles[r.next],next=platformAfter(c,r.x),roof=platformAt(c,r.x)
   if(ob&&ob.kind==='block'&&ob.x-r.x<90&&ob.x>r.x)input.jump=true
   if(ob&&ob.kind==='bar'&&ob.x-r.x<70&&ob.x>r.x)input.slide=true
   if(next&&next.y<r.y-1&&next.x0-r.x<60&&roof&&roof.x1>=next.x0)input.jump=true
   if(roof&&next&&roof.x1<next.x0&&roof.x1-r.x<30)input.jump=true}
  seen.add(r.move)
  step(r,c,input);frames++}
 return {r,ms:frames*STEP*1000}}

describe('course',()=>{
 it('the same seed always gives the same course',()=>{
  expect(buildCourse(42)).toEqual(buildCourse(42))
  expect(buildCourse(42)).not.toEqual(buildCourse(43))})
 it('platforms are in order and do not overlap',()=>{
  for(const seed of [1,2,3,99]){
   const {platforms}=buildCourse(seed)
   for(let i=1;i<platforms.length;i++)expect(platforms[i]!.x0).toBeGreaterThanOrEqual(platforms[i-1]!.x1)}})
 it('has every kind of challenge and a finish on solid ground',()=>{
  const c=buildCourse(7)
  expect(new Set(c.obstacles.map(o=>o.kind))).toEqual(new Set(['block','bar']))
  expect(platformAt(c,c.finishX)).toBeDefined()
  expect(c.checkpoints.length).toBeGreaterThan(2)
  for(const cp of c.checkpoints)expect(platformAt(c,cp.x)?.y).toBe(cp.y)})
 it('obstacles sit on a rooftop',()=>{
  const c=buildCourse(11)
  for(const o of c.obstacles){expect(platformAt(c,o.x)?.y).toBe(o.y);expect(platformAt(c,o.x+o.w)?.y).toBe(o.y)}})})

describe('every course can be finished cleanly',()=>{
 it('a sensible player finishes 40 random courses without falling or being hit',()=>{
  for(let seed=1;seed<=40;seed++){
   const c=buildCourse(seed*7919),{r,ms}=bot(c)
   expect(r.done,`seed ${seed}`).toBe(true)
   expect(r.falls,`seed ${seed}`).toBe(0)
   expect(r.hits,`seed ${seed}`).toBe(0)
   expect(ms).toBeGreaterThan(c.minMs)
   expect(ms).toBeLessThan(120000)}})
 it('uses every kind of move',()=>{
  const seen=new Set<string>();bot(buildCourse(5),seen)
  for(const m of['run','jump','fall','land','slide','vault','climb'])expect(seen,m).toContain(m)})
 it('takes about 60 to 90 seconds',()=>{
  const {ms}=bot(buildCourse(123))
  expect(ms).toBeGreaterThan(55000);expect(ms).toBeLessThan(90000)})})

describe('movement',()=>{
 it('waits at the start until told to go',()=>{
  const r=newRunner();run(r,flat,1)
  expect(r.x).toBe(0);expect(r.move).toBe('idle')})
 it('reaches running speed',()=>{
  const r=running(flat);run(r,flat,1);expect(r.vx).toBeCloseTo(340,0);expect(r.move).toBe('run')})
 it('a jump goes up and lands again',()=>{
  const r=running(flat);run(r,flat,1)
  run(r,flat,.2,{jump:true,slide:false});expect(r.move).toBe('jump');expect(r.y).toBeLessThan(-50)
  run(r,flat,.8);expect(r.y).toBe(0);expect(r.grounded).toBe(true)})
 it('a press just before it is possible still counts',()=>{
  const r=running(flat);r.grounded=false;r.y=-5;r.vy=100;r.move='fall'
  step(r,flat,{jump:true,slide:false});expect(r.vy).toBeGreaterThan(0)
  run(r,flat,.1);expect(r.vy).toBeLessThan(0);expect(r.move).toBe('jump')})
 it('walking off a ledge still allows a late jump',()=>{
  const c:Course={...flat,platforms:[{x0:-100,x1:100,y:0},{x0:400,x1:5000,y:0}]}
  const r=running(c,95);r.vx=340;run(r,c,.05);expect(r.move).toBe('fall')
  step(r,c,{jump:true,slide:false});expect(r.vy).toBeLessThan(0)})
 it('a slide ends and gets back up',()=>{
  const r=running(flat);run(r,flat,1)
  run(r,flat,.1,{jump:false,slide:true});expect(r.move).toBe('slide')
  run(r,flat,1);expect(r.move).toBe('run')})
 it('finishes when it crosses the line, then slows to a stop',()=>{
  const r=running(flat,3990);r.vx=340;run(r,flat,.1);expect(r.done).toBe(true);expect(r.move).toBe('finish')
  run(r,flat,2);expect(r.vx).toBe(0)
  const x=r.x;run(r,flat,1,{jump:true,slide:true});expect(r.x).toBe(x)})})

describe('obstacles',()=>{
 const withOb=(kind:'block'|'bar'):Course=>({...flat,obstacles:[{kind,x:600,w:50,y:0,h:kind==='block'?44:46}]})
 it('running into a block is a stumble and breaks the flow',()=>{
  const c=withOb('block'),r=running(c,300);r.vx=340;r.flow=.6
  while(r.move!=='stumble'&&r.x<700)step(r,c,none)
  expect(r.move).toBe('stumble');expect(r.hits).toBe(1);expect(r.flow).toBe(0)
  let top=0;while(r.move==='stumble'){step(r,c,none);top=Math.min(top,r.y)}
  expect(top).toBeLessThan(-44);expect(r.y).toBe(0);expect(r.vx).toBeLessThan(200)
  run(r,c,3);expect(r.x).toBeGreaterThan(650);expect(r.hits).toBe(1)})
 it('a press near a block is a vault, which goes over cleanly and builds flow',()=>{
  const c=withOb('block'),r=running(c,500);r.vx=340
  step(r,c,{jump:true,slide:false})
  // An early press keeps running to the takeoff point.
  expect(r.move).toBe('run')
  while(r.move==='run')step(r,c,none)
  expect(r.move).toBe('vault');expect(600-r.x).toBeLessThanOrEqual(70)
  let top=0;while(r.move==='vault'){step(r,c,none);top=Math.min(top,r.y)}
  expect(top).toBeLessThan(-20);expect(r.hits).toBe(0);expect(r.y).toBe(0);expect(r.x).toBeGreaterThan(650)
  run(r,c,.2);expect(r.flow).toBeCloseTo(.2)})
 it('a jump can clear a block too',()=>{
  const c=withOb('block'),r=running(c,450);r.vx=340
  step(r,c,{jump:true,slide:false});expect(r.move).toBe('jump')
  run(r,c,1.5);expect(r.hits).toBe(0);expect(r.x).toBeGreaterThan(650)})
 it('standing under a bar hits it, and sliding clears it',()=>{
  let c=withOb('bar'),r=running(c,300);r.vx=340;while(!r.hits&&r.x<700)step(r,c,none)
  expect(r.hits).toBe(1);expect(r.move).toBe('slide');run(r,c,3);expect(r.hits).toBe(1);expect(r.x).toBeGreaterThan(650)
  c=withOb('bar');r=running(c,500);r.vx=340;step(r,c,{jump:false,slide:true});expect(r.move).toBe('slide')
  run(r,c,2);expect(r.hits).toBe(0);expect(r.flow).toBeCloseTo(.2)})
 it('jumping into a bar hits it',()=>{
  const c=withOb('bar'),r=running(c,520);r.vx=340;step(r,c,{jump:true,slide:false});run(r,c,1.5);expect(r.hits).toBe(1)})})

describe('walls and falls',()=>{
 const wall:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:600,x1:5000,y:-130}]}
 const gap:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:900,x1:5000,y:0}],checkpoints:[{x:100,y:0}]}
 it('a press near a wall climbs it smoothly',()=>{
  const r=running(wall,520);r.vx=340;step(r,wall,{jump:true,slide:false});expect(r.move).toBe('climb')
  let px=r.x,py=r.y
  while(r.move==='climb'){step(r,wall,none);expect(Math.abs(r.x-px)).toBeLessThan(20);expect(Math.abs(r.y-py)).toBeLessThan(20);px=r.x;py=r.y}
  expect(r.y).toBe(-130);expect(r.x).toBeGreaterThan(600);expect(r.hits).toBe(0)})
 it('running into a wall is a bonk, then a slower climb. It can never get stuck',()=>{
  const r=running(wall,500);r.vx=340;run(r,wall,.4);expect(r.move).toBe('bonk');expect(r.hits).toBe(1);expect(r.vx).toBe(0)
  run(r,wall,.5);expect(r.move).toBe('climb')
  run(r,wall,1.2);expect(r.y).toBe(-130);expect(r.move).toBe('run')})
 it('a runner in the air can grab a ledge it reaches',()=>{
  const c:Course={...flat,platforms:[{x0:-100,x1:500,y:0},{x0:650,x1:5000,y:-130}]}
  const r=running(c,490);r.vx=340;step(r,c,{jump:true,slide:false})
  while(r.move!=='climb'&&r.x<640)step(r,c,none)
  expect(r.move).toBe('climb')
  run(r,c,1.5);expect(r.y).toBe(-130);expect(r.falls).toBe(0)})
 it('missing a gap costs a respawn at the last checkpoint, with flow lost',()=>{
  const r=running(gap,300);r.vx=340;r.flow=.8;r.nextCheck=1;run(r,gap,5)
  expect(r.falls).toBeGreaterThan(0);expect(r.flow).toBe(0)
  expect(r.grounded).toBe(true)})
 it('with no checkpoint yet, a fall goes back to the start',()=>{
  const c={...gap,checkpoints:[]},r=running(c,590);r.vx=340;run(r,c,.1)
  while(r.move!=='respawn')step(r,c,none)
  expect(r.x).toBe(0);expect(r.y).toBe(0)})
 it('a big drop lands in a roll, and a small one does not',()=>{
  const c=(h:number):Course=>({...flat,platforms:[{x0:-100,x1:300,y:0},{x0:300,x1:5000,y:h}]})
  const big=c(170),r=running(big,290);r.vx=340;while(!r.grounded||r.y===0)step(r,big,none);expect(r.move).toBe('roll')
  const small=c(60),s=running(small,290);s.vx=340;while(!s.grounded||s.y===0)step(s,small,none);expect(s.move).toBe('land')})})
