import Phaser from 'phaser'
import type {ChatLine} from '../../../stores/app'
import {hueOf} from '../../../utils/color'
import {sfx} from '../../../utils/sound'
import {Animator,anchorFor} from '../anim/animator'
import type {V} from '../anim/ik'
import {BONES,type Joints} from '../anim/skeleton'
import {platformAt,zonesIn,type Course,type Zone} from '../mechanics/course'
import {animParam,newRunner,start,step,STEP,TRICK_NAMES,type Runner} from '../mechanics/runner'
import {GHOST_DELAY,ghostAt,type Sample} from '../net/client'
import type {Move,RaceState} from '../types'

export interface Hooks{
 selfId:string;name:string
 course:Course
 phase:()=>RaceState['phase']|null
 others:()=>{id:string;name:string}[]
 samples:(id:string)=>Sample[]|undefined
 onPose:(x:number,y:number,move:Move,p:number)=>void
 onFinish:()=>void
 onHud:(x:number,ms:number,flow:number,combo:number,boost:number)=>void
 chat:()=>ChatLine[]
}
const POSE_MS=100,HUD_MS=100,MAX_CATCHUP=.25,BUBBLE_MS=4000
/** Each course gets one of these looks, chosen by its seed. */
const THEMES=[
 {sky:['#1e0d3a','#6b2168','#c2416c','#ff9a5a'],sun:['#ffe9c4','#ffcf9a','#ffb08055','#ff708000'],far:'#6e2b6f',mid:'#47195a',near:'#2a0f3f',lit:'#ffb86b66',edge:0xff7a5c},
 {sky:['#050816','#101a3f','#27306b','#5a4a8f'],sun:['#f4f7ff','#dfe6ff','#a9b8ff44','#7f8fff00'],far:'#232c62',mid:'#171f4a',near:'#0d1230',lit:'#ffe9a366',edge:0x7aa2ff},
 {sky:['#2b3a67','#6f6a9c','#e59a8c','#ffd6a0'],sun:['#fffbe8','#fff0c2','#ffd9a055','#ffc08000'],far:'#8a6f90',mid:'#5c4a73',near:'#3a2f55',lit:'#ffe0a066',edge:0xffb27a},
 {sky:['#0c1f1c','#14403a','#3f7a55','#b8c76a'],sun:['#f7ffd0','#e4f59a','#c8e06a55','#a0c04000'],far:'#1f4a40',mid:'#15352f',near:'#0c221f',lit:'#d8ff7a55',edge:0xb8f56a},
]
const ROOF=0x0e0718,ROOF_FACE=0x170b26,PROP=0x1e1030,STRIPE=0xffc94a,CHECK=0x3de0d0,WIRE=0x7df9ff,MAT=0xff4d8d
const BODY=0x05020a,FAR=0x2c1b42
const hsl=(h:number)=>Phaser.Display.Color.HSLToColor(h/360,.75,.62).color

/** A soft cloth tail. Each point follows the one before it with a little gravity, so it trails behind every move. */
class Scarf{
 pts:V[]=[];prev:V[]=[]
 constructor(n=7){for(let i=0;i<n;i++){this.pts.push({x:0,y:0});this.prev.push({x:0,y:0})}}
 update(at:V,dt:number){
  const L=6
  if(Math.hypot(this.pts[0]!.x-at.x,this.pts[0]!.y-at.y)>160)for(let i=0;i<this.pts.length;i++){this.pts[i]={x:at.x-i*L,y:at.y};this.prev[i]={x:at.x-i*L,y:at.y}}
  this.pts[0]={...at}
  for(let i=1;i<this.pts.length;i++){
   const p=this.pts[i]!,q=this.prev[i]!,vx=(p.x-q.x)*.93,vy=(p.y-q.y)*.93
   this.prev[i]={...p};p.x+=vx;p.y+=vy+260*dt*dt+Math.sin(performance.now()/90+i)*.12}
  for(let k=0;k<2;k++)for(let i=1;i<this.pts.length;i++){
   const a=this.pts[i-1]!,b=this.pts[i]!,d=Math.hypot(b.x-a.x,b.y-a.y)||1,s=(d-L)/d
   b.x-=(b.x-a.x)*s;b.y-=(b.y-a.y)*s}}}

interface Puff{x:number;y:number;vx:number;vy:number;life:number;max:number;size:number}
interface Ghost{an:Animator;g:Phaser.GameObjects.Graphics;label:Phaser.GameObjects.Text;scarf:Scarf;color:number}

class Run extends Phaser.Scene{
 r:Runner=newRunner();an=new Animator();scarf=new Scarf()
 prevX=0;prevY=0;acc=0;ms=0;jump=false;slide=false;going=false;sent=false
 lastPose=0;lastHud=0;lastMove:Move='idle';camX=0;camY=0
 world!:Phaser.GameObjects.Graphics;fg!:Phaser.GameObjects.Graphics;me!:Phaser.GameObjects.Graphics;fxG!:Phaser.GameObjects.Graphics;lines!:Phaser.GameObjects.Graphics
 sky!:Phaser.GameObjects.Image;sun!:Phaser.GameObjects.Image;layers:{s:Phaser.GameObjects.TileSprite;f:number}[]=[]
 zones:Zone[]=[];trickSeen=0;trail:Joints[]=[];trailT=0
 puffs:Puff[]=[];ghosts=new Map<string,Ghost>();myColor=0;nameTag!:Phaser.GameObjects.Text
 bubbles=new Map<string,{t:Phaser.GameObjects.Text;until:number}>();chatSeen=0
 constructor(private h:Hooks){super('run')}
 get theme(){return THEMES[this.h.course.scenery%THEMES.length]!}

 skyline(key:string,seed:number,color:string,lo:number,hi:number,w:number,lit:string|null){
  const H=420,c=this.textures.createCanvas(key,1024,H)!,x=c.getContext()
  let s=seed;const rnd=()=>(s=(s*16807)%2147483647)/2147483647
  x.fillStyle=color
  for(let px=0;px<1024;){
   const bw=w*(.6+rnd()),bh=lo+rnd()*(hi-lo)
   x.fillRect(px,H-bh,Math.min(bw,1024-px),bh)
   if(rnd()<.3)x.fillRect(px+bw*.4,H-bh-16,3,16)
   if(lit){x.fillStyle=lit;for(let wy=H-bh+10;wy<H;wy+=16)for(let wx=px+6;wx<Math.min(px+bw,1024)-6;wx+=12)if(rnd()<.14)x.fillRect(wx,wy,5,8);x.fillStyle=color}
   px+=bw+rnd()*8}
  c.refresh()}
 create(){
  const sk=this.textures.createCanvas('gl-sky',4,512)!,sx=sk.getContext(),grad=sx.createLinearGradient(0,0,0,512)
  const t=this.theme,at=this.h.course.scenery
  ;[0,.45,.75,1].forEach((o,i)=>grad.addColorStop(o,t.sky[i]!));sx.fillStyle=grad;sx.fillRect(0,0,4,512);sk.refresh()
  const su=this.textures.createCanvas('gl-sun',256,256)!,ux=su.getContext(),ug=ux.createRadialGradient(128,128,20,128,128,128)
  ug.addColorStop(0,t.sun[0]!);ug.addColorStop(.3,t.sun[1]!);ug.addColorStop(.34,t.sun[2]!);ug.addColorStop(1,t.sun[3]!);ux.fillStyle=ug;ux.fillRect(0,0,256,256);su.refresh()
  this.skyline('gl-far',at*3+101,t.far,70,200,70,null)
  this.skyline('gl-mid',at*5+202,t.mid,90,270,90,t.lit)
  this.skyline('gl-near',at*7+303,t.near,60,230,120,t.lit)
  this.sky=this.add.image(0,0,'gl-sky').setOrigin(0).setScrollFactor(0).setDepth(0)
  this.sun=this.add.image(0,0,'gl-sun').setScrollFactor(0).setDepth(1)
  this.layers=([['gl-far',.08,1],['gl-mid',.18,1.5],['gl-near',.32,2]] as const).map(([k,f,d])=>({s:this.add.tileSprite(0,0,10,420,k).setOrigin(0,1).setScrollFactor(0).setDepth(d),f}))
  this.lines=this.add.graphics().setScrollFactor(0).setDepth(3)
  this.world=this.add.graphics().setDepth(5);this.me=this.add.graphics().setDepth(8);this.fg=this.add.graphics().setDepth(9);this.fxG=this.add.graphics().setDepth(10)
  this.myColor=hsl(hueOf(this.h.selfId))
  this.nameTag=this.label(this.h.name,'#ffffff').setDepth(12)
  this.chatSeen=this.h.chat().at(-1)?.id??0
  this.zones=zonesIn(this.h.course)
  this.scale.on('resize',this.layout,this);this.layout()
  this.input.keyboard!.on('keydown',(e:KeyboardEvent)=>{
   if(e.repeat)return
   if(e.code==='Space'||e.code==='KeyW'||e.code==='ArrowUp'){this.jump=true;e.preventDefault()}
   if(e.code==='KeyS'||e.code==='ArrowDown'){this.slide=true;e.preventDefault()}})
  this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>{if(p.y<this.scale.height/2)this.jump=true;else this.slide=true})}
 label(text:string,color:string){return this.add.text(0,0,text,{fontFamily:'Outfit,system-ui,sans-serif',fontSize:'11px',fontStyle:'600',color,backgroundColor:'#0008',padding:{x:4,y:1},resolution:3}).setOrigin(.5)}
 layout(){
  const w=this.scale.width,h=this.scale.height
  this.cameras.main.setZoom(Phaser.Math.Clamp(h/640,.6,1.6))
  this.sky.setDisplaySize(w,h);this.sun.setPosition(w*.72,h*.5).setDisplaySize(h*.75,h*.75)
  for(const l of this.layers)l.s.setSize(w,420).setPosition(0,h)}

 update(_t:number,delta:number){
  const dt=Math.min(delta/1000,MAX_CATCHUP)
  if(this.h.phase()==='racing'&&!this.going){this.going=true;start(this.r)}
  if(this.going){
   this.acc+=dt
   while(this.acc>=STEP){
    this.prevX=this.r.x;this.prevY=this.r.y
    step(this.r,this.h.course,{jump:this.jump,slide:this.slide});this.jump=this.slide=false
    this.acc-=STEP
    if(!this.r.done)this.ms+=STEP*1000
    this.react()}
   if(this.r.done&&!this.sent){this.sent=true;this.h.onFinish();sfx.floor()}}
  else this.jump=this.slide=false
  const k=this.acc/STEP,tele=Math.abs(this.r.x-this.prevX)>100
  const x=tele?this.r.x:this.prevX+(this.r.x-this.prevX)*k,y=tele?this.r.y:this.prevY+(this.r.y-this.prevY)*k
  const now=performance.now()
  if(now-this.lastPose>POSE_MS&&this.going){this.lastPose=now;this.h.onPose(Math.round(x*10)/10,Math.round(y*10)/10,this.r.move,Math.round(animParam(this.r)*100)/100)}
  if(now-this.lastHud>HUD_MS){this.lastHud=now;this.h.onHud(x,this.ms,this.r.flow,this.r.combo,this.r.boost)}
  this.moveCamera(x,y,dt)
  this.drawWorld()
  const joints=this.an.update({move:this.r.move,p:animParam(this.r),x,y},dt,anchorFor(this.h.course,this.r.move,x))
  this.scarf.update(joints.neck,dt)
  this.me.clear()
  // Echoes of the body while a trick burst lasts, so speed reads at a glance.
  this.trailT+=dt
  if(this.trailT>.045){this.trailT=0;this.trail.push(joints);if(this.trail.length>5)this.trail.shift()}
  if(this.r.boost>25)this.trail.forEach((j,i)=>this.drawBody(this.me,j,this.myColor,this.myColor,.05+.035*i))
  this.drawScarf(this.me,this.scarf,this.myColor,1);this.drawBody(this.me,joints,BODY,FAR,1)
  this.nameTag.setPosition(joints.head.x,joints.head.y-20)
  this.updateGhosts(now,dt)
  this.updateBubbles(now)
  this.drawFx(dt)
  this.drawSpeedLines()}

 /** Sound, dust and camera shake when a move starts. */
 react(){
  const r=this.r
  if(r.lastTrick&&r.lastTrick.n!==this.trickSeen){
   this.trickSeen=r.lastTrick.n
   this.popTrick(TRICK_NAMES[r.lastTrick.name],r.lastTrick.combo);sfx.cash();this.dust(r.x,r.y,8,.9)}
  if(r.move===this.lastMove){if(r.move==='slide'&&r.vx>120&&Math.random()<.4)this.dust(r.x+6,r.y,1,.5);return}
  this.lastMove=r.move
  switch(r.move){
   case'jump':sfx.tick();this.dust(r.x,r.y,4,.6);break
   case'speedroll':sfx.reelStop();this.dust(r.x,r.y,10,1);break
   case'land':sfx.reelStop();this.dust(r.x,r.y,7,.8);break
   case'roll':sfx.reelStop();this.dust(r.x,r.y,14,1.2);this.cameras.main.shake(140,.006);break
   case'slide':sfx.tick();this.dust(r.x,r.y,6,.8);break
   case'vault':case'climb':sfx.click();break
   case'kong':case'dashvault':case'flip':case'backflip':case'doubleflip':case'swallow':case'tripleswallow':case'handspring':case'butterfly':case'aerial':case'gainer':case'webster':case'corkscrew':case'wallrun':case'powerslide':sfx.buy();break
   case'stumble':sfx.lose();this.dust(r.x,r.y,8,1);this.cameras.main.shake(160,.005);break
   case'bonk':sfx.lose();this.cameras.main.shake(220,.01);break
   case'respawn':sfx.alarm();this.cameras.main.flash(180,255,255,255);break}}
 popTrick(name:string,combo:number){
  const t=this.add.text(this.r.x,this.r.y-100,combo>1?`${name}  x${combo}`:name,{fontFamily:'Outfit,system-ui,sans-serif',fontSize:'18px',fontStyle:'800',color:'#3de0d0',stroke:'#05020a',strokeThickness:4,resolution:3}).setOrigin(.5).setDepth(14)
  this.tweens.add({targets:t,y:t.y-46,x:t.x+90,alpha:0,duration:900,ease:'Cubic.easeOut',onComplete:()=>t.destroy()})}
 dust(x:number,y:number,n:number,size:number){
  for(let i=0;i<n;i++){const max=.3+Math.random()*.4;this.puffs.push({x:x+(Math.random()-.5)*16,y:y-2,vx:-60-Math.random()*110,vy:-20-Math.random()*50,life:max,max,size:(2+Math.random()*4)*size})}}
 moveCamera(x:number,y:number,dt:number){
  const cam=this.cameras.main,viewW=cam.width/cam.zoom,h=this.scale.height
  // Look ahead in the running direction, and follow height more loosely so jumps don't bounce the view.
  this.camX+=(x+viewW*.2-this.camX)*Math.min(1,dt*7)
  this.camY+=(y-70-this.camY)*Math.min(1,dt*(this.r.grounded?3.2:1.3))
  cam.centerOn(this.camX,this.camY)
  for(const l of this.layers){
   l.s.tilePositionX=this.camX*l.f
   l.s.y=h-Phaser.Math.Clamp(this.camY*l.f*cam.zoom*.5,-h*.15,h*.15)}}

 /** Draws only what the camera can see. */
 drawWorld(){
  const c=this.h.course,v=this.cameras.main.worldView,x0=v.x-40,x1=v.x+v.width+40,bottom=v.y+v.height+60,g=this.world,f=this.fg
  const edge=this.theme.edge
  g.clear();f.clear()
  for(const p of c.platforms){
   if(p.x1<x0||p.x0>x1)continue
   g.fillStyle(ROOF);g.fillRect(p.x0,p.y,p.x1-p.x0,Math.max(0,bottom-p.y))
   g.fillStyle(ROOF_FACE)
   for(let wx=Math.ceil(Math.max(p.x0+24,x0)/90)*90;wx<Math.min(p.x1-24,x1);wx+=90)for(let wy=p.y+34;wy<bottom;wy+=52)if((wx*7+Math.round(wy-p.y)*13)%5<2)g.fillRect(wx,wy,22,26)
   g.fillStyle(edge,.9);g.fillRect(p.x0,p.y,p.x1-p.x0,2)}
  // Tricking mats.
  for(const m of c.mats){
   if(m.x1<x0||m.x0>x1)continue
   g.fillStyle(MAT,.85);g.fillRect(m.x0,m.y,m.x1-m.x0,6)
   g.fillStyle(MAT,.12);g.fillRect(m.x0,m.y-40,m.x1-m.x0,40)
   for(let tx=m.x0;tx<m.x1;tx+=60){g.fillStyle(0xffffff,.35);g.fillRect(tx,m.y,2,6)}}
  // Trick zones: a press here is perfect.
  const pulse=.55+.3*Math.sin(performance.now()/160)
  for(const z of this.zones){
   if(z.x1<x0||z.x0>x1||z.x1<this.r.x-30)continue
   g.fillStyle(CHECK,pulse);g.fillRect(z.x0,z.y-1,z.x1-z.x0,5)
   g.fillStyle(CHECK,pulse*.18);g.fillRect(z.x0,z.y-22,z.x1-z.x0,22)}
  for(const o of c.obstacles){
   if(o.x+o.w<x0||o.x>x1)continue
   if(o.kind==='wire'){
    // A live cable along the roof, which flickers.
    g.fillStyle(PROP);g.fillRect(o.x-4,o.y-10,5,10);g.fillRect(o.x+o.w-1,o.y-10,5,10)
    g.lineStyle(2,WIRE,.6+.4*Math.sin(performance.now()/45+o.x))
    g.beginPath();g.moveTo(o.x,o.y-7)
    for(let i=1;i<=8;i++)g.lineTo(o.x+o.w*i/8,o.y-7+(i%2?-3:3)*Math.sin(performance.now()/70+i))
    g.strokePath()}
   else if(o.kind==='block'){
    g.fillStyle(PROP);g.fillRoundedRect(o.x,o.y-o.h,o.w,o.h,3)
    g.fillStyle(edge,.9);g.fillRect(o.x,o.y-o.h,o.w,2)
    g.fillStyle(0x000000,.35);for(let i=8;i<o.h-4;i+=8)g.fillRect(o.x+5,o.y-o.h+i,o.w-10,3)}
   else{
    // A sign hanging from a beam. It's drawn in front, so a runner visibly passes under it.
    const top=o.y-o.h,beam=top-150
    f.fillStyle(PROP);f.fillRect(o.x+6,beam,4,150);f.fillRect(o.x+o.w-10,beam,4,150)
    f.fillRect(o.x-14,beam-8,o.w+28,10);f.fillRoundedRect(o.x,top-34,o.w,34,3)
    f.fillStyle(STRIPE)
    for(let sx=o.x+3;sx<o.x+o.w-8;sx+=14)f.fillTriangle(sx,top-3,sx+7,top-3,sx+3.5,top-10)}}
  for(const cp of c.checkpoints){
   if(cp.x<x0||cp.x>x1)continue
   g.fillStyle(PROP);g.fillRect(cp.x-1.5,cp.y-58,3,58)
   g.fillStyle(CHECK);g.fillTriangle(cp.x+1,cp.y-58,cp.x+20,cp.y-51,cp.x+1,cp.y-44)}
  if(c.finishX>x0&&c.finishX<x1){
   const top=platformAt(c,c.finishX)?.y??0
   g.fillStyle(0xffffff);g.fillRect(c.finishX-2,top-130,4,130)
   for(let i=0;i<5;i++)for(let j=0;j<3;j++){g.fillStyle((i+j)%2?0xffffff:BODY);g.fillRect(c.finishX+2+i*9,top-130+j*9,9,9)}}}

 limb(g:Phaser.GameObjects.Graphics,a:V,b:V,w1:number,w2:number,color:number,alpha:number){
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1,nx=-dy/d,ny=dx/d
  g.fillStyle(color,alpha)
  g.fillPoints([{x:a.x+nx*w1,y:a.y+ny*w1},{x:b.x+nx*w2,y:b.y+ny*w2},{x:b.x-nx*w2,y:b.y-ny*w2},{x:a.x-nx*w1,y:a.y-ny*w1}],true)
  g.fillCircle(a.x,a.y,w1);g.fillCircle(b.x,b.y,w2)}
 drawBody(g:Phaser.GameObjects.Graphics,j:Joints,near:number,far:number,alpha:number){
  // Far limbs first, in a lighter shade, so the body keeps its depth as a silhouette.
  this.limb(g,j.shoulder,j.elbowB,2.6,2,far,alpha);this.limb(g,j.elbowB,j.handB,2,1.5,far,alpha)
  this.limb(g,j.pelvis,j.kneeB,4.2,2.8,far,alpha);this.limb(g,j.kneeB,j.ankleB,2.8,1.7,far,alpha);this.limb(g,j.ankleB,j.toeB,1.8,1.2,far,alpha)
  this.limb(g,j.pelvis,j.chest,5,6.5,near,alpha);this.limb(g,j.chest,j.neck,2.6,2.2,near,alpha)
  g.fillStyle(near,alpha);g.fillCircle(j.head.x,j.head.y,BONES.head)
  this.limb(g,j.pelvis,j.kneeF,4.6,3,near,alpha);this.limb(g,j.kneeF,j.ankleF,3,1.8,near,alpha);this.limb(g,j.ankleF,j.toeF,1.9,1.2,near,alpha)
  this.limb(g,j.shoulder,j.elbowF,2.8,2.1,near,alpha);this.limb(g,j.elbowF,j.handF,2.1,1.6,near,alpha)}
 drawScarf(g:Phaser.GameObjects.Graphics,s:Scarf,color:number,alpha:number){
  for(let i=1;i<s.pts.length;i++)this.limb(g,s.pts[i-1]!,s.pts[i]!,2.4-i*.22,2.4-(i+1)*.22,color,alpha)}

 updateGhosts(now:number,dt:number){
  const seen=new Set<string>()
  for(const{id,name}of this.h.others()){
   const s=ghostAt(this.h.samples(id)??[],now-GHOST_DELAY)
   if(!s)continue
   seen.add(id)
   let o=this.ghosts.get(id)
   if(!o){const color=hsl(hueOf(id));o={an:new Animator(),g:this.add.graphics().setDepth(7),label:this.label(name,'#'+color.toString(16).padStart(6,'0')).setDepth(11),scarf:new Scarf(),color};this.ghosts.set(id,o)}
   const j=o.an.update({move:s.move,p:s.p,x:s.x,y:s.y},dt,anchorFor(this.h.course,s.move,s.x))
   o.scarf.update(j.neck,dt)
   o.g.clear();this.drawScarf(o.g,o.scarf,o.color,.6);this.drawBody(o.g,j,o.color,o.color,.42)
   o.label.setPosition(j.head.x,j.head.y-20)}
  for(const[id,o]of this.ghosts)if(!seen.has(id)){o.g.destroy();o.label.destroy();this.ghosts.delete(id)}}
 updateBubbles(now:number){
  for(const c of this.h.chat())if(c.id>this.chatSeen){
   this.chatSeen=c.id
   this.bubbles.get(c.from)?.t.destroy()
   this.bubbles.set(c.from,{t:this.add.text(0,0,c.text,{fontFamily:'Outfit,system-ui,sans-serif',fontSize:'12px',color:'#1a0f2a',backgroundColor:'#fff',padding:{x:6,y:3},wordWrap:{width:150},resolution:3}).setOrigin(.5,1).setDepth(13),until:now+BUBBLE_MS})}
  for(const[id,b]of this.bubbles){
   const o=id===this.h.selfId?this.nameTag:this.ghosts.get(id)?.label
   if(now>b.until||!o){b.t.destroy();this.bubbles.delete(id);continue}
   b.t.setPosition(o.x,o.y-10)}}
 drawFx(dt:number){
  const g=this.fxG;g.clear()
  for(let i=this.puffs.length-1;i>=0;i--){
   const p=this.puffs[i]!
   p.life-=dt;if(p.life<=0){this.puffs.splice(i,1);continue}
   p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=50*dt
   const k=p.life/p.max
   g.fillStyle(0xffc7a0,.5*k);g.fillCircle(p.x,p.y,p.size*(1.6-k*.6))}}
 drawSpeedLines(){
  const g=this.lines;g.clear()
  const f=this.r.flow,w=this.scale.width,h=this.scale.height
  if(f<.4||this.r.done||!this.going)return
  g.fillStyle(0xffffff,.08+.14*(f-.4))
  for(let i=0;i<14;i++){
   const seed=i*97.3,len=60+(seed%90)*f,y=(seed*7.1)%h,x=w-((performance.now()*(.9+i*.05)+seed*40)%(w+len))
   g.fillRect(x,y,len,1.5)}}}

export function createRun(parent:HTMLElement,h:Hooks){
 return new Phaser.Game({
  type:Phaser.AUTO,parent,antialias:true,backgroundColor:'#2a1147',
  scale:{mode:Phaser.Scale.RESIZE,width:parent.clientWidth||960,height:parent.clientHeight||600},
  scene:new Run(h)})}
