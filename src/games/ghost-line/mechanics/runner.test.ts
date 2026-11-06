import {describe,expect,it} from 'vitest'
import {buildCourse,platformAfter,platformAt,zonesIn,type Course} from './course'
import {newRunner,start,step,STEP,type Input,type Runner} from './runner'

const flat:Course={platforms:[{x0:-100,x1:5000,y:0}],obstacles:[],mats:[],checkpoints:[],finishX:4000,scenery:1,minMs:0}
const none:Input={jump:false,slide:false}
const running=(c:Course,x=0)=>{const r=newRunner();r.x=x;r.y=platformAt(c,x)?.y??0;start(r);return r}
const run=(r:Runner,c:Course,secs:number,input:Input=none)=>{for(let i=0;i<secs*60;i++)step(r,c,i===0?input:none)}

/** Plays like a decent player: gets past everything, but outside the trick zones. */
function bot(c:Course,seen:Set<string>=new Set(),perfect=false){
 const r=running(c);let frames=0
 while(!r.done&&frames<60*300){
  const input={jump:false,slide:false}
  if(r.grounded&&r.move==='run'&&!r.vaultSoon){
   const ob=c.obstacles[r.next],next=platformAfter(c,r.x),roof=platformAt(c,r.x),d=ob?ob.x-r.x:1e9
   const wall=next&&roof&&next.y<r.y-1&&roof.x1>=next.x0?next.x0-r.x:1e9
   if(perfect){
    if(ob?.kind==='block'&&d<60&&d>25)input.jump=true
    if(ob?.kind==='bar'&&d<60&&d>30)input.slide=true
    if(ob?.kind==='wire'&&d<50&&d>15)input.jump=true
    if(wall<70&&wall>40)input.jump=true
    if(roof&&next&&wall>1e8&&roof.x1-r.x<25)input.jump=true}
   else{
    if(ob?.kind==='block'&&d<118)input.jump=true
    if(ob?.kind==='bar'&&d<105)input.slide=true
    if(ob?.kind==='wire'&&d<82)input.jump=true
    if(wall<105)input.jump=true
    if(roof&&next&&wall>1e8&&roof.x1-r.x<54&&roof.x1-r.x>45)input.jump=true}}
  if(perfect&&r.grounded&&r.move==='run'&&c.mats.some(m=>r.x>=m.x0+10&&r.x<=m.x0+70))input.jump=true
  // Slide just before a hard landing.
  if(perfect&&!r.grounded&&r.vy>600){const g=platformAt(c,r.x);if(g&&g.y-r.y<r.vy*.08)input.slide=true}
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
  expect(new Set(c.obstacles.map(o=>o.kind))).toEqual(new Set(['block','bar','wire']))
  expect(platformAt(c,c.finishX)).toBeDefined()
  expect(c.checkpoints.length).toBeGreaterThan(2)
  for(const cp of c.checkpoints)expect(platformAt(c,cp.x)?.y).toBe(cp.y)})
 it('every course has its own character',()=>{
  const courses=Array.from({length:30},(_,i)=>buildCourse(i*1009+1))
  const lengths=courses.map(c=>c.finishX)
  expect(Math.max(...lengths)-Math.min(...lengths)).toBeGreaterThan(3000)
  // The share of wires differs a lot from course to course.
  const shares=courses.map(c=>c.obstacles.filter(o=>o.kind==='wire').length/c.obstacles.length)
  expect(Math.max(...shares)-Math.min(...shares)).toBeGreaterThan(.2)
  expect(new Set(courses.map(c=>c.scenery%4)).size).toBe(4)
  expect(new Set(courses.map(c=>Math.round(c.platforms[0]!.x1))).size).toBeGreaterThan(20)})
 it('obstacles sit on a rooftop',()=>{
  const c=buildCourse(11)
  for(const o of c.obstacles){expect(platformAt(c,o.x)?.y).toBe(o.y);expect(platformAt(c,o.x+o.w)?.y).toBe(o.y)}})})

describe('every course can be finished cleanly',()=>{
 it('a sensible player finishes 40 random courses without falling, and with few mistakes',()=>{
  for(let seed=1;seed<=40;seed++){
   const c=buildCourse(seed*7919),{r,ms}=bot(c)
   expect(r.done,`seed ${seed}`).toBe(true)
   expect(r.falls,`seed ${seed}`).toBe(0)
   expect(r.hits,`seed ${seed}`).toBeLessThanOrEqual(3)
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
  const c=withOb('block'),r=running(c,440);r.vx=340
  step(r,c,{jump:true,slide:false});expect(r.move).toBe('jump')
  run(r,c,1.5);expect(r.hits).toBe(0);expect(r.x).toBeGreaterThan(650)})
 it('standing under a bar hits it, and sliding clears it',()=>{
  let c=withOb('bar'),r=running(c,300);r.vx=340;while(!r.hits&&r.x<700)step(r,c,none)
  expect(r.hits).toBe(1);expect(r.move).toBe('slide');run(r,c,3);expect(r.hits).toBe(1);expect(r.x).toBeGreaterThan(650)
  c=withOb('bar');r=running(c,490);r.vx=340;step(r,c,{jump:false,slide:true});expect(r.move).toBe('slide')
  run(r,c,2);expect(r.hits).toBe(0);expect(r.flow).toBeCloseTo(.2)})
 it('jumping into a bar hits it',()=>{
  const c=withOb('bar'),r=running(c,520);r.vx=340;step(r,c,{jump:true,slide:false});run(r,c,1.5);expect(r.hits).toBe(1)})})

describe('tricking mats',()=>{
 const J={jump:true,slide:false}
 const mat:Course={...flat,mats:[{x0:500,x1:2150,y:0}]}
 const onMat=()=>{const r=running(mat,510);r.vx=340;return r}
 it('a press on the mat starts the chain',()=>{
  const r=onMat();step(r,mat,J);expect(r.move).toBe('cartwheel');expect(r.chain).toBeTruthy()})
 it('one press plays the whole pass in order: Cartwheel, two Back Handsprings, Back Flip, then the combo',()=>{
  const r=onMat(),names:string[]=[];step(r,mat,J);let n=0
  while(r.chain&&n++<400){const a=r.tricks;step(r,mat,none);if(r.tricks!==a)names.push(r.lastTrick!.name)}
  // The last step pays the Back Flip and the combo together.
  expect(names.slice(0,3)).toEqual(['cartwheel','tumble','tumble']);expect(r.tricks).toBe(5)
  expect(r.lastTrick?.name).toBe('trickcombo');expect(r.chain).toBeNull();expect(r.move).toBe('run')
  expect(r.combo).toBe(5);expect(r.boost).toBeGreaterThan(190);expect(r.y).toBe(0);expect(r.x).toBeLessThan(2150)})
 it('each trick flows straight into the next, with no run between them',()=>{
  const r=onMat();step(r,mat,J);let n=0
  while(r.chain&&n++<400){expect(r.move).not.toBe('run');step(r,mat,none)}})
 it('pressing again during the chain changes nothing',()=>{
  const r=onMat();step(r,mat,J);const seen:string[]=[];let n=0
  while(r.chain&&n++<400){if(seen.at(-1)!==r.move)seen.push(r.move);step(r,mat,J)}
  expect(seen).toEqual(['cartwheel','tumble','backtuck']);expect(r.lastTrick?.name).toBe('trickcombo')})
 it('only the start of the mat begins a chain',()=>{
  const r=running(mat,800);r.vx=340;step(r,mat,J);expect(r.move).toBe('jump')})
 it('three tricks at top speed fit on every mat, with no obstacles on it',()=>{
  for(let seed=1;seed<=20;seed++){
   const c=buildCourse(seed*311);expect(c.mats.length).toBe(2)
   for(const m of c.mats){
    expect(c.obstacles.some(o=>o.x+o.w>m.x0&&o.x<m.x1)).toBe(false)
    expect(platformAt(c,m.x0)?.y).toBe(m.y);expect(platformAt(c,m.x1-1)?.y).toBe(m.y)
    const r=running(c,m.x0+5);r.y=m.y;r.flow=1;r.boost=200;r.vx=610;step(r,c,J)
    let n=0;while(r.chain&&n++<400)step(r,c,none)
    expect(r.lastTrick?.name).toBe('trickcombo');expect(r.x).toBeLessThan(m.x1)}}})})

describe('walls and falls',()=>{
 const wall:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:600,x1:5000,y:-130}]}
 const gap:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:900,x1:5000,y:0}],checkpoints:[{x:100,y:0}]}
 it('a press near a wall climbs it smoothly',()=>{
  const r=running(wall,500);r.vx=340;step(r,wall,{jump:true,slide:false});expect(r.move).toBe('climb')
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

describe('tricks',()=>{
 const J={jump:true,slide:false},S={jump:false,slide:true}
 const block=(w:number):Course=>({...flat,obstacles:[{kind:'block',x:600,w,y:0,h:44}]})
 const wall:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:600,x1:5000,y:-130}]}
 const finishMove=(r:Runner,c:Course,m:string)=>{let n=0;while(r.move===m&&n++<300)step(r,c,none)}
 it('a perfect press on a wide block is a Kong Vault, and pays a burst when it lands',()=>{
  const c=block(70),r=running(c,550);r.vx=340;step(r,c,J);expect(r.move).toBe('kong');expect(r.boost).toBe(0)
  finishMove(r,c,'kong')
  expect(r.lastTrick?.name).toBe('kong');expect(r.boost).toBeGreaterThan(40);expect(r.combo).toBe(1);expect(r.hits).toBe(0);expect(r.y).toBe(0)})
 it('a perfect press on a narrow block is a Dash Vault',()=>{
  const c=block(45),r=running(c,550);r.vx=340;step(r,c,J);expect(r.move).toBe('dashvault')
  finishMove(r,c,'dashvault');expect(r.lastTrick?.name).toBe('dashvault')})
 it('just outside the zone is a plain vault, with no burst, on both sides',()=>{
  const early=block(70),r=running(early,500);r.vx=340;step(r,early,J);while(r.move==='run')step(r,early,none)
  expect(r.move).toBe('vault');finishMove(r,early,'vault');expect(r.boost).toBe(0)
  const late=block(70),q=running(late,590);q.vx=340;step(q,late,J);expect(q.move).toBe('vault')})
 it('a perfect press at a wall is a Wall Run, faster than a climb',()=>{
  const r=running(wall,540);r.vx=340;step(r,wall,J);expect(r.move).toBe('wallrun')
  let frames=0;let px=r.x,py=r.y
  while(r.move==='wallrun'){step(r,wall,none);frames++;expect(Math.abs(r.x-px)).toBeLessThan(25);expect(Math.abs(r.y-py)).toBeLessThan(25);px=r.x;py=r.y}
  expect(r.lastTrick?.name).toBe('wallrun');expect(r.y).toBe(-130)
  const q=running(wall,500);q.vx=340;step(q,wall,J);let climbF=0;while(q.move==='climb'){step(q,wall,none);climbF++}
  expect(frames).toBeLessThan(climbF)})
 it('a perfect slide under a bar is a Power Slide that clears it',()=>{
  const c:Course={...flat,obstacles:[{kind:'bar',x:600,w:90,y:0,h:46}]},r=running(c,540);r.vx=340;step(r,c,S);expect(r.move).toBe('powerslide')
  finishMove(r,c,'powerslide');expect(r.hits).toBe(0);expect(r.lastTrick?.name).toBe('powerslide');expect(r.x).toBeGreaterThan(690)})
 it('a press at a roof edge is a Front Flip, paid on landing',()=>{
  const c:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:750,x1:5000,y:0}]},r=running(c,580);r.vx=340;step(r,c,J);expect(r.move).toBe('flip');expect(r.boost).toBe(0)
  let n=0;while(!r.grounded&&n++<200)step(r,c,none)
  expect(r.lastTrick?.name).toBe('flip');expect(r.boost).toBeGreaterThan(40)})
 it('an early press at an edge is a plain jump',()=>{
  const c:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:750,x1:5000,y:0}]},r=running(c,540);r.vx=340;step(r,c,J);expect(r.move).toBe('jump')})
 it('missing the far side of a flip pays nothing',()=>{
  const c:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:2000,x1:5000,y:0}],checkpoints:[]},r=running(c,590);r.vx=340;step(r,c,J);expect(r.move).toBe('flip')
  while(r.move!=='respawn')step(r,c,none)
  expect(r.tricks).toBe(0);expect(r.boost).toBe(0)})
 it('on a long combo, a big drop is a Triple Swallow, with a bigger burst, timed to land as it ends',()=>{
  const c:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:600,x1:5000,y:190}]}
  const r=running(c,580);r.vx=340;r.combo=3;r.comboT=5;step(r,c,J);expect(r.move).toBe('tripleswallow')
  let n=0;while(!r.grounded&&n++<300){expect(r.t).toBeLessThanOrEqual(r.dur+.05);step(r,c,none)}
  expect(r.lastTrick?.name).toBe('tripleswallow');expect(r.move).toBe('speedroll')
  const triple=r.boost
  const q=running(c,580);q.vx=340;q.combo=3;q.comboT=5;q.flips=2;const f:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:750,x1:5000,y:0}]}
  step(q,f,J);n=0;while(!q.grounded&&n++<300)step(q,f,none)
  expect(q.lastTrick?.name).toBe('doubleflip');expect(triple).toBeGreaterThan(q.boost)})
 it('a wire must be jumped: touching it is a mistake, and a perfect press is a Back Handspring that clears it',()=>{
  const c=():Course=>({...flat,obstacles:[{kind:'wire',x:600,w:100,y:0,h:0}]})
  const a=c(),r=running(a,500);r.vx=340;while(!r.hits&&r.x<650)step(r,a,none);expect(r.hits).toBe(1);expect(r.move).toBe('stumble')
  const b=c(),q=running(b,560);q.vx=340;step(q,b,J);expect(q.move).toBe('handspring');finishMove(q,b,'handspring')
  expect(q.hits).toBe(0);expect(q.lastTrick?.name).toBe('handspring');expect(q.x).toBeGreaterThan(700);expect(q.y).toBe(0)})
 it('flips take turns: Front, Back, then Double on a long combo',()=>{
  const c:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:750,x1:5000,y:0}]}
  const flipAt=(flips:number,combo:number)=>{const r=running(c,580);r.vx=340;r.flips=flips;r.combo=combo;r.comboT=5;step(r,c,J);return r.move}
  expect(flipAt(0,0)).toBe('flip');expect(flipAt(1,1)).toBe('backflip');expect(flipAt(2,2)).toBe('flip');expect(flipAt(2,3)).toBe('doubleflip');expect(flipAt(3,5)).toBe('flip')})
 it('a perfect press before a big drop is a Swallow Dive that rolls out by itself',()=>{
  const c:Course={...flat,platforms:[{x0:-100,x1:600,y:0},{x0:600,x1:5000,y:190}]},r=running(c,580);r.vx=340;step(r,c,J);expect(r.move).toBe('swallow')
  let n=0;while(!r.grounded&&n++<300)step(r,c,none)
  expect(r.lastTrick?.name).toBe('swallow');expect(r.move).toBe('speedroll');expect(r.boost).toBeGreaterThan(40)})
 it('slide pressed just before a hard landing is a Speed Roll. Without it, the landing costs speed',()=>{
  const c:Course={...flat,platforms:[{x0:-100,x1:300,y:0},{x0:300,x1:5000,y:190}]}
  const r=running(c,295);r.vx=340
  while(!r.grounded||r.y===0){step(r,c,r.y>150?S:none)}
  expect(r.move).toBe('speedroll');expect(r.lastTrick?.name).toBe('speedroll')
  const q=running(c,295);q.vx=340;while(!q.grounded||q.y===0)step(q,c,none)
  expect(q.move).toBe('roll');const v=q.vx;run(q,c,.4);expect(q.vx).toBeLessThan(v)})
 it('tricks in a row build a combo, each adding more, and the burst wears off',()=>{
  const c=block(70),r=running(c,550);r.vx=340
  r.combo=2;r.comboT=3;step(r,c,J);finishMove(r,c,'kong')
  expect(r.combo).toBe(3);const big=r.boost;expect(big).toBeGreaterThan(70)
  run(r,c,1);expect(r.boost).toBeLessThan(big);expect(r.vx).toBeGreaterThan(400)})
 it('a burst really is faster',()=>{
  const r=running(flat);r.boost=150;run(r,flat,1);expect(r.vx).toBeGreaterThan(420)})
 it('a combo ends with time, and any mistake wipes it',()=>{
  const r=running(flat);r.combo=3;r.comboT=.5;run(r,flat,.6);expect(r.combo).toBe(0)
  const c=block(70),q=running(c,450);q.vx=340;q.combo=4;q.comboT=5;q.boost=100;while(!q.hits&&q.x<700)step(q,c,none)
  expect(q.combo).toBe(0);expect(q.boost).toBe(0)})
 it('every zone sits on solid ground',()=>{
  const c=buildCourse(9),z=zonesIn(c);expect(z.length).toBeGreaterThan(30)
  for(const k of['block','bar','wire','wall','lip'])expect(z.some(q=>q.kind===k),k).toBe(true)
  for(const q of z)expect(q.x1).toBeGreaterThan(q.x0)})
 it('a perfect player is much faster than a clean one, and every trick gets used',()=>{
  const seen=new Set<string>();let totalClean=0,totalBest=0
  for(const seed of[5,17,23,31,47,59,61,67]){
   const c=buildCourse(seed*4099),clean=bot(c),best=bot(c,seen,true)
   expect(best.r.done,`seed ${seed}`).toBe(true);expect(best.r.tricks).toBeGreaterThan(15)
   expect(best.ms,`seed ${seed}`).toBeLessThan(clean.ms);expect(best.ms).toBeGreaterThan(c.minMs)
   totalClean+=clean.ms;totalBest+=best.ms
  }
  expect(totalBest).toBeLessThan(totalClean*.92)
  for(const m of['kong','dashvault','flip','backflip','doubleflip','swallow','tripleswallow','cartwheel','tumble','backtuck','handspring','wallrun','powerslide'])expect(seen,m).toContain(m)})
 it('tricks at top speed can still finish every course',()=>{
  for(let seed=1;seed<=20;seed++){const c=buildCourse(seed*613),{r}=bot(c,new Set(),true);expect(r.done,`seed ${seed}`).toBe(true);expect(r.falls,`seed ${seed}`).toBeLessThan(4)}})})
