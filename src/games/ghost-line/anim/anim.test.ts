import {describe,expect,it} from 'vitest'
import {MOVES} from '../types'
import {buildCourse,type Course} from '../mechanics/course'
import {animParam,newRunner,start,step} from '../mechanics/runner'
import {Animator,anchorFor} from './animator'
import {HANDSPRING_CONTACT} from '../mechanics/runner'
import {AIR,backTuckPose,CARTWHEEL_CONTACT,cartwheelPose,CYCLE_LEN,flipPose,handspringPose,tumblePose,KONG,runFoot,runPose,sample,tripleSwallowPose} from './clips'
import {twoBone} from './ik'
import {BONES,solve,type Joints} from './skeleton'

const len=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,a.y-b.y)
const DT=1/60
function limbsKeepLength(j:Joints){
 for(const[a,b,l]of[[j.pelvis,j.kneeF,BONES.thigh],[j.kneeF,j.ankleF,BONES.shin],[j.pelvis,j.kneeB,BONES.thigh],[j.kneeB,j.ankleB,BONES.shin],[j.shoulder,j.elbowF,BONES.upperArm],[j.elbowF,j.handF,BONES.forearm],[j.shoulder,j.elbowB,BONES.upperArm],[j.elbowB,j.handB,BONES.forearm],[j.ankleF,j.toeF,BONES.foot]] as const)
  expect(len(a,b)).toBeCloseTo(l,1)}

describe('IK',()=>{
 it('reaches a target in range and keeps both bone lengths',()=>{
  const a={x:0,y:0},t={x:10,y:30},{joint,end}=twoBone(a,t,22,21,-1)
  expect(end.x).toBeCloseTo(10);expect(end.y).toBeCloseTo(30)
  expect(len(a,joint)).toBeCloseTo(22);expect(len(joint,end)).toBeCloseTo(21)})
 it('points straight at a target out of reach, without stretching',()=>{
  const {joint,end}=twoBone({x:0,y:0},{x:0,y:500},22,21,-1)
  expect(end.y).toBeCloseTo(43,1);expect(end.x).toBeCloseTo(0);expect(joint.y).toBeCloseTo(22,0)})
 it('copes with a target on top of the joint',()=>{
  const {joint,end}=twoBone({x:0,y:0},{x:0,y:0},22,21,-1)
  expect(Number.isFinite(joint.x+joint.y+end.x+end.y)).toBe(true)})
 it('knees bend forward and elbows bend back, standing upright',()=>{
  const {joint:knee}=twoBone({x:0,y:0},{x:0,y:35},22,21,-1);expect(knee.x).toBeGreaterThan(0)
  const {joint:elbow}=twoBone({x:0,y:0},{x:0,y:20},14,14,1);expect(elbow.x).toBeLessThan(0)})})

describe('run cycle',()=>{
 it('a foot on the ground stays still in the world while the runner moves',()=>{
  // Stance is the first 21% of the cycle. Following it for several points, the foot's world position barely moves.
  const worldX=(phase:number)=>phase*CYCLE_LEN+runFoot(phase)[0]
  for(let p=0;p<=.2;p+=.02)expect(worldX(p)).toBeCloseTo(worldX(0),5)})
 it('the cycle joins up, with no jump at the seam',()=>{
  for(const i of[0,1,2]){expect(runFoot(.9999)[i]).toBeCloseTo(runFoot(0)[i],0)}
  for(let p=0;p<1;p+=.01){const a=runFoot(p),b=runFoot(p+.01);expect(Math.abs(a[0]-b[0])).toBeLessThan(6);expect(Math.abs(a[1]-b[1])).toBeLessThan(6)}})
 it('a foot never goes through the ground',()=>{
  for(let p=0;p<1;p+=.005)expect(runFoot(p)[1]).toBeLessThanOrEqual(-3)})
 it('feet stay planted on the real rig while running',()=>{
  const an=new Animator();let x=0
  const seen:number[]=[]
  for(let i=0;i<120;i++){x+=340*DT;const j=an.update({move:'run',p:0,x,y:0},DT,null);limbsKeepLength(j)
   if(i>30&&Math.abs(j.ankleF.y-(-3))<.01)seen.push(j.ankleF.x)}
  // Group the frames into footfalls: within one, the foot must hold still.
  let run=[seen[0]!]
  for(const v of seen.slice(1)){if(Math.abs(v-run[run.length-1]!)>30)run=[v];else{expect(Math.abs(v-run[0]!)).toBeLessThan(1.5);run.push(v)}}
  expect(seen.length).toBeGreaterThan(5)})})

describe('animator',()=>{
 it('gives a valid skeleton for every move at every point',()=>{
  const c=buildCourse(3)
  for(const move of MOVES)for(const p of[0,.25,.5,.75,1,-620,620,1200]){
   const an=new Animator(),j=an.update({move,p,x:500,y:0},DT,anchorFor(c,move,500))
   for(const v of Object.values(j))expect(Number.isFinite(v.x+v.y),`${move} ${p}`).toBe(true)
   limbsKeepLength(j)}})
 it('crossfades instead of popping between moves',()=>{
  const an=new Animator()
  const prev=an.update({move:'run',p:0,x:0,y:0},DT,null)
  const next=an.update({move:'slide',p:0,x:5,y:0},DT,null)
  expect(len(prev.pelvis,next.pelvis)).toBeLessThan(15);expect(len(prev.head,next.head)).toBeLessThan(25)})
 it('no joint jumps during a whole sequence of moves',()=>{
  const an=new Animator();let x=0,prev:Joints|null=null
  const script:[any,number][]=[['run',.5],['jump',.3],['fall',.3],['land',.14],['run',.3],['slide',.7],['run',.3],['vault',.45],['run',.3],['stumble',.6],['run',.3],['roll',.5],['run',.3]]
  for(const[move,secs]of script)for(let t=0;t<secs;t+=DT){
   x+=340*DT
   const p=move==='jump'?-620+1900*t:move==='fall'?0+1900*t:t/secs
   const j=an.update({move,p,x,y:0},DT,null)
   if(prev)for(const key of['pelvis','chest','head'] as const)expect(len(prev[key],j[key]),`${move} ${key}`).toBeLessThan(28)
   prev=j}})
 it('a roll does not spin backward when it ends',()=>{
  const an=new Animator()
  an.update({move:'roll',p:1,x:0,y:0},DT,null)
  an.update({move:'run',p:0,x:5,y:0},DT,null)
  const j=an.update({move:'run',p:0,x:10,y:0},DT,null)
  expect(j.chest.y).toBeLessThan(j.pelvis.y)})
 it('planted feet stay fixed while the body moves, then let go',()=>{
  const an=new Animator()
  const a=an.update({move:'land',p:0,x:100,y:0},DT,null)
  const b=an.update({move:'land',p:.5,x:104,y:0},DT,null)
  expect(b.ankleF.x).toBeCloseTo(a.ankleF.x,1);expect(b.ankleB.x).toBeCloseTo(a.ankleB.x,1)
  for(let i=0;i<20;i++)an.update({move:'run',p:0,x:104+i*5,y:0},DT,null)
  expect(an.update({move:'run',p:0,x:210,y:0},DT,null).ankleF.x).not.toBeCloseTo(a.ankleF.x,0)})
 it('hands really touch the block in a vault, and the ledge in a climb, along the real paths',()=>{
  const c:Course={platforms:[{x0:-100,x1:800,y:0},{x0:800,x1:3000,y:-140}],obstacles:[{kind:'block',x:400,w:60,y:0,h:44}],mats:[],checkpoints:[],finishX:2900,scenery:1,minMs:0}
  const r=newRunner();r.x=250;start(r);r.vx=340
  const an=new Animator(),touching=new Set<string>()
  for(let i=0;i<300&&r.x<850;i++){
   const press=(r.move==='run'&&r.x>285&&r.x<310)||(r.move==='run'&&r.x>695&&r.x<715)
   step(r,c,{jump:press,slide:false})
   const anchor=anchorFor(c,r.move,r.x),p=animParam(r),j=an.update({move:r.move,p,x:r.x,y:r.y},1/60,anchor)
   const mid=r.move==='vault'?p>.3&&p<.5:r.move==='climb'?p>.22&&p<.65:false
   if(mid&&anchor){expect(len(j.handF,{x:anchor.x+3,y:anchor.y}),`${r.move} at ${p}`).toBeLessThan(6);touching.add(r.move)}}
  expect(touching).toEqual(new Set(['vault','climb']))})
 it('a move with no anchor still works',()=>{
  expect(new Animator().update({move:'vault',p:.4,x:0,y:0},DT,null).handF).toBeDefined()})
 it('rises and falls differently in the air',()=>{
  expect(sample(AIR,0).fy).toBeLessThan(sample(AIR,1).fy)})
 it('tricks have valid, smooth motion from start to finish',()=>{
  for(const move of ['kong','dashvault','flip','backflip','doubleflip','swallow','tripleswallow','cartwheel','tumble','backtuck','handspring','wallrun','powerslide','speedroll'] as const){
   const an=new Animator();let prev:Joints|null=null,x=0
   for(let i=0;i<20;i++){x+=6;an.update({move:'run',p:0,x,y:0},DT,null)}
   for(let p=0;p<=1;p+=.025){
    x+=6;const j=an.update({move,p,x,y:0},DT,null)
    limbsKeepLength(j)
    if(prev)for(const key of['pelvis','chest','head','ankleF','ankleB'] as const)expect(len(prev[key],j[key]),`${move} ${key} at ${p}`).toBeLessThan(move==='tripleswallow'?52:['doubleflip','backtuck','cartwheel','tumble'].includes(move)?36:26)
    prev=j}}})
 it('a flip goes all the way round and stays in one piece',()=>{
  expect(flipPose(0).lean).toBeLessThan(30);expect(flipPose(.5).lean).toBeGreaterThan(150);expect(flipPose(1).lean).toBeCloseTo(360,0)
  expect(flipPose(.5,-1).lean).toBeLessThan(-120);expect(flipPose(1,-1).lean).toBeCloseTo(-360,0);expect(flipPose(1,2).lean).toBeCloseTo(720,0)})
 it('a Triple Swallow turns three times, then opens out flat',()=>{
  expect(tripleSwallowPose(.6).lean).toBeGreaterThan(900)
  const open=tripleSwallowPose(.85);expect(open.lean-1080).toBeGreaterThan(60);expect(open.lean-1080).toBeLessThan(120)})
 it('no spin unwinds backward into the roll',()=>{
  const an=new Animator();an.update({move:'tripleswallow',p:1,x:0,y:0},DT,null)
  const a=an.update({move:'speedroll',p:0,x:5,y:0},DT,null),b=an.update({move:'speedroll',p:.05,x:10,y:0},DT,null)
  expect(len(a.chest,b.chest)).toBeLessThan(20);limbsKeepLength(a)})
 it('hands reach the ground in the Cartwheel and each Back Handspring of a pass',()=>{
  for(const[pose]of[[cartwheelPose(CARTWHEEL_CONTACT)],[tumblePose(HANDSPRING_CONTACT,HANDSPRING_CONTACT)]] as const){
   const j=solve(pose,0,0,null);expect(j.handF.y).toBeGreaterThan(-8);expect(j.handF.y).toBeLessThan(2);expect(j.ankleF.y).toBeLessThan(j.head.y-40)}})
 it('the body turns backward in the cartwheel, stays that way, and faces forward again for the landing',()=>{
  expect(cartwheelPose(.2).back).toBe(0);expect(cartwheelPose(.8).back).toBe(1)
  expect(tumblePose(0,HANDSPRING_CONTACT).back).toBe(1);expect(tumblePose(1,HANDSPRING_CONTACT).back).toBe(1)
  expect(backTuckPose(.3).back).toBe(1);expect(backTuckPose(1).back).toBe(0)})
 it('two handsprings in a row join up with nothing jumping',()=>{
  const an=new Animator();let x=0,prev:Joints|null=null
  for(let n=0;n<2;n++)for(let p=0;p<=1;p+=1/30){
   x+=11;const j=an.update({move:'tumble',p,x,y:0},DT,null)
   if(prev)for(const key of['pelvis','chest','head','ankleF'] as const)expect(len(prev[key],j[key]),`${key} at ${n} ${p}`).toBeLessThan(36)
   prev=j}})
 it('hands reach the ground in a Back Handspring, upside down, facing backward',()=>{
  const pose=handspringPose(HANDSPRING_CONTACT,HANDSPRING_CONTACT),j=solve(pose,0,0,null)
  expect(j.handF.y).toBeGreaterThan(-8);expect(j.handF.y).toBeLessThan(2)
  expect(j.ankleF.y).toBeLessThan(j.head.y-40);expect(pose.back).toBe(1)})
 it('a clip passes through its keys without stopping at them',()=>{
  const v=(t:number)=>sample(KONG,t).py
  expect(Math.abs(sample(KONG,.26).py-KONG[1]![1].py)).toBeLessThan(.001)
  // Halfway through the clip, a key isn't a pause: the torso keeps turning.
  const lean=(t:number)=>sample(KONG,t).lean
  expect(Math.abs(lean(.49)-lean(.47))).toBeGreaterThan(.1);void v})
 it('knees rise and the body leans in at sprint speed',()=>{
  const slow=runPose(.5,0),fast=runPose(.5,1)
  expect(fast.lean).toBeGreaterThan(slow.lean);expect(Math.min(fast.fy,fast.by)).toBeLessThan(Math.min(slow.fy,slow.by))})})
