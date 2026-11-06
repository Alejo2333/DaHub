import Phaser from 'phaser'
import type {GameKind,GState} from '../types'
import type {ChatLine} from '../../../stores/app'
import type {Fx} from '../store'
import {hueOf} from '../../../utils/color'
import {buildArt,lookFor,makeCharacter,S} from './art'
import {GAME_LABELS,HOT_WIN} from '../mechanics/floors'
import {COLLECTOR_HOME,COLLECTOR_TARGET,H,layoutFor,layoutIndex,machinesIn,solidsIn,W,WALL_H,type Layout,type Machine,type Station} from './layouts'

const stationLabel=(id:Station)=>id==='shop'?'Sketchy Shop':GAME_LABELS[id]

export interface Hooks{
 selfId:string;name:string
 blocked:()=>boolean
 onInteract:(id:Station)=>void
 onNear:(id:Station|null)=>void
 /** Backwards Shoes: this player's walking is reversed. */
 reversed:()=>boolean
 onMove:(x:number,y:number)=>void
 remotes:()=>{id:string;name:string;x:number;y:number}[]
 state:()=>GState|null
 fx:()=>Fx|null
 chat:()=>ChatLine[]
}
interface Remote{s:Phaser.GameObjects.Sprite;l:Phaser.GameObjects.Text;dir:string;t:number}
const SPEED=190,FLOOR_TINTS=[0xffffff,0xbcd2ff,0xb8ffd2,0xffd2a8,0xe2baff,0xffc4d6]
const BUBBLE_MS=5000,BUBBLE_WIDTH=170
const label=(scene:Phaser.Scene,x:number,y:number,text:string,color:string,size=11)=>
 scene.add.text(x,y,text,{fontFamily:'Outfit,system-ui,sans-serif',fontSize:`${size}px`,fontStyle:'600',color,backgroundColor:'#0009',padding:{x:4,y:1},resolution:3}).setOrigin(.5)
/** Picks the frame prefix and horizontal flip for a movement direction. */
const facing=(dx:number,dy:number,prev:string)=>Math.abs(dx)>Math.abs(dy)?'s':dy>0?'d':dy<0?'u':prev

class Casino extends Phaser.Scene{
 me!:Phaser.Physics.Arcade.Sprite
 meLabel!:Phaser.GameObjects.Text
 keys!:Record<string,Phaser.Input.Keyboard.Key>
 solid!:Phaser.Physics.Arcade.StaticGroup
 carpet!:Phaser.GameObjects.TileSprite
 collector!:Phaser.GameObjects.Sprite
 collectorAura!:Phaser.GameObjects.Image
 ball:Phaser.GameObjects.Arc|null=null
 layout!:Layout
 machines:Machine[]=[]
 reels:Phaser.GameObjects.TileSprite[]=[]
 flames:Phaser.GameObjects.Image[]=[]
 rings=new Map<Station,Phaser.GameObjects.Ellipse>()
 signs=new Map<Station,Phaser.GameObjects.Text>()
 covers=new Map<Station,Phaser.GameObjects.Rectangle>()
 access=''
 remote=new Map<string,Remote>()
 bubbles=new Map<string,Phaser.GameObjects.Container>()
 chatSeen=0
 lastSent=0;lx=0;ly=0;dir='d';nearId:Station|null=null;fxN=0;floor=1;phase=''
 target:{x:number;y:number;machine?:Station;best:number;since:number}|null=null
 constructor(private h:Hooks){super('casino')}

 /** Places a texture with its base on the floor at (x,y) and sorts it by depth. */
 put(key:string,x:number,y:number,originY=1){return this.add.image(x,y,key).setScale(1/S).setOrigin(.5,originY).setDepth(y)}
 block(x:number,y:number,w:number,h:number){
  const r=this.add.rectangle(x,y,w,h,0,0);this.solid.add(r);return r}
 light(x:number,y:number,color:number,size:number,alpha:number,pulse=0){
  const g=this.add.image(x,y,'glow').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(alpha).setDisplaySize(size,size).setDepth(1)
  if(pulse)this.tweens.add({targets:g,alpha:alpha*.55,duration:pulse,yoyo:true,repeat:-1,ease:'Sine.easeInOut'})
  return g}

 create(){
  // Each floor is a fresh room: the scene restarts on the same instance, so per-room state is reset here.
  this.reels=[];this.flames=[];this.ball=null;this.access='';this.target=null
  this.rings.clear();this.signs.clear();this.covers.clear();this.remote.clear();this.bubbles.clear()
  // Messages sent before this room existed, such as lobby chat, stay in the chat box and don't pop up as bubbles.
  this.chatSeen=this.h.chat().at(-1)?.id??this.chatSeen
  const g=this.h.state()
  this.floor=g?.floor??1;this.phase=g?.phase??'';this.fxN=this.h.fx()?.n??0
  this.layout=layoutFor(this.floor);this.machines=machinesIn(this.floor)
  this.nearId=null;this.h.onNear(null)
  buildArt(this)
  this.physics.world.setBounds(0,0,W,H)
  this.solid=this.physics.add.staticGroup()
  for(const r of solidsIn(this.floor))this.block(r.x,r.y,r.w,r.h)
  this.buildRoom()
  this.buildMachines()
  this.buildDecor()
  const look=lookFor(hueOf(this.h.selfId))
  makeCharacter(this,'me',look)
  this.me=this.physics.add.sprite(this.layout.spawn[0],this.layout.spawn[1],'me','d0').setScale(1/S)
  ;(this.me.body as Phaser.Physics.Arcade.Body).setSize(28,16).setOffset(14,62)
  this.me.setCollideWorldBounds(true)
  this.physics.add.collider(this.me,this.solid)
  this.meLabel=label(this,0,0,this.h.name,'#ffc94a').setDepth(9000)
  const kb=this.input.keyboard!
  // No key capture: the page's sliders and number fields need the arrow keys too.
  this.keys=kb.addKeys('W,A,S,D,E,UP,DOWN,LEFT,RIGHT',false) as Record<string,Phaser.Input.Keyboard.Key>
  this.input.on('pointerdown',(p:Phaser.Input.Pointer)=>this.tap(p.worldX,p.worldY))
  this.setupCamera()
  const onResize=()=>this.setupCamera()
  this.scale.on('resize',onResize)
  this.events.once('shutdown',()=>this.scale.off('resize',onResize))
  this.cameras.main.fadeIn(700,10,3,18)}

 setupCamera(){
  const c=this.cameras.main,z=Phaser.Math.Clamp(Math.max(this.scale.width/W,this.scale.height/H),.7,1.5)
  // Extra room above the wall so the HUD doesn't cover the neon sign and back wall.
  const hudGap=84/z
  c.setZoom(z).setBounds(0,-hudGap,W,H+hudGap).startFollow(this.me,true,.1,.1)}

 buildRoom(){
  this.carpet=this.add.tileSprite(0,0,W,H,'carpet').setOrigin(0).setTileScale(1/S).setDepth(0).setTint(FLOOR_TINTS[layoutIndex(this.floor)]!)
  for(const x of this.layout.runners){
   this.add.tileSprite(x,WALL_H,120,H-WALL_H,'runner').setOrigin(0).setTileScale(1/S).setDepth(0).setAlpha(.8)
   this.add.rectangle(x-2,WALL_H,3,H-WALL_H,0xffc94a,.7).setOrigin(0).setDepth(0)
   this.add.rectangle(x+119,WALL_H,3,H-WALL_H,0xffc94a,.7).setOrigin(0).setDepth(0)}
  // Back wall, with side and bottom walls drawn as dark trim
  this.add.tileSprite(0,0,W,WALL_H,'wall').setOrigin(0).setTileScale(1/S).setDepth(2)
  for(const r of[[0,0,36,H],[W-36,0,36,H],[0,H-34,W,34]] as const){
   this.add.rectangle(r[0],r[1],r[2],r[3],0x170723).setOrigin(0).setDepth(2).setStrokeStyle(2,0xa8791c)}
  // Neon sign and wall lamps
  const sign=this.add.image(560,44,'sign').setScale(1/S).setDepth(3)
  this.light(560,44,0xff4d6d,520,.32,1400)
  this.tweens.add({targets:sign,alpha:{from:1,to:.72},duration:90,yoyo:true,repeat:3,repeatDelay:4200,loop:-1})
  for(const x of[120,300,820,1000]){
   this.add.image(x,46,'sconce').setScale(1/S).setDepth(3)
   this.light(x,46,0xffd28a,150,.5)}
  // Soft ceiling light pools on the carpet
  for(const[x,y,c,size]of[[300,330,0xffd28a,520],[820,330,0xffd28a,520],[560,560,0x8a5cff,440]] as const)this.light(x,y,c,size,.16)
  // Dark corners
  for(const[x,y]of[[0,H],[W,H]] as const)this.add.image(x,y,'glow').setTint(0x000000).setAlpha(.55).setDisplaySize(620,620).setDepth(1)}

 buildMachines(){
  for(const m of this.machines){
   this.light(m.x,m.y-20,m.c,300,.28,1500+Math.random()*700)
   this.rings.set(m.id,this.add.ellipse(m.x,m.y+6,m.bw+50,44,m.c,.0).setStrokeStyle(2,m.c,.9).setDepth(1).setVisible(false))
   this.covers.set(m.id,this.add.rectangle(m.x,m.y-m.ch/2+4,m.cw,m.ch,0x0a0312,.74).setDepth(m.y+4).setVisible(false))
   this.signs.set(m.id,label(this,m.x,m.y+14,stationLabel(m.id),'#ffe9b0',12).setDepth(m.y+5))
   switch(m.id){
   case 'slots':this.buildSlots(m);break
   case 'roulette':this.buildRoulette(m);break
   case 'dice':this.buildDice(m);break
   case 'wheel':this.buildWheel(m);break
   case 'crash':this.buildCrash(m);break
   case 'cups':this.put('cupstable',m.x,m.y);break
   case 'vault':this.put('vaultdoor',m.x,m.y);break
   default:this.put(`m-${m.id}`,m.x,m.y)}}}

 /** A machine in the room can be played unless a power cut has closed it. */
 isOpen(id:Station){
  const g=this.h.state()
  return !!g&&!(g.event?.kind==='cut'&&g.event.machine===id)}
 /** Shades a closed machine and updates the signs when a room event changes. */
 updateAccess(g:GState){
  const key=`${g.event?.kind}|${g.event?.machine}`
  if(key===this.access)return
  this.access=key
  for(const m of this.machines){
   const on=g.event?.machine===m.id,cut=on&&g.event?.kind==='cut',hot=on&&g.event?.kind==='hot'
   this.covers.get(m.id)?.setVisible(cut)
   this.signs.get(m.id)?.setText(cut?'⚡ Closed':hot?`🔥 ${stationLabel(m.id)} +${Math.round((HOT_WIN-1)*100)}%`:stationLabel(m.id))}}

 buildSlots(m:Machine){
  const img=this.put('slots',m.x,m.y)
  const top=m.y-116+45
  for(let i=0;i<3;i++){
   const r=this.add.tileSprite(m.x-18+i*18,top,16,28,'reelstrip').setTileScale(1/S).setDepth(img.depth+1)
   r.tilePositionY=i*30;this.reels.push(r)}
  // Chasing marquee bulbs
  for(let i=0;i<8;i++){
   const b=this.add.circle(m.x-32+i*9.2,m.y-113,1.8,0xfff6c8).setDepth(img.depth+1)
   this.tweens.add({targets:b,alpha:.15,duration:220,yoyo:true,repeat:-1,delay:i*70})}}

 buildRoulette(m:Machine){
  const img=this.put('roulette',m.x,m.y)
  const wx=m.x-48,wy=m.y-46
  const wheel=this.add.image(wx,wy,'rwheel').setScale(1/S).setDepth(img.depth+1)
  this.tweens.add({targets:wheel,angle:360,duration:5200,repeat:-1})
  this.ball=this.add.circle(wx,wy,1.8,0xffffff).setDepth(img.depth+2)
  this.ball.setData('c',{x:wx,y:wy})
  this.put('chips',m.x+58,m.y-10).setDepth(img.depth+1)}

 buildDice(m:Machine){
  const img=this.put('dicetable',m.x,m.y)
  ;[[-14,-46],[14,-52]].forEach(([dx,dy],i)=>{
   const d=this.add.image(m.x+dx!,m.y+dy!,'die').setScale(1/S).setDepth(img.depth+1)
   this.tweens.add({targets:d,angle:360,y:d.y-7,duration:900,yoyo:true,repeat:-1,repeatDelay:1700,delay:i*140,ease:'Sine.easeInOut'})})
  this.put('chips',m.x-52,m.y-20).setDepth(img.depth+1)}

 buildWheel(m:Machine){
  const stand=this.put('wheelstand',m.x,m.y)
  const cy=m.y-84
  const wheel=this.add.image(m.x,cy,'bigwheel').setScale(1/S).setDepth(stand.depth+1)
  this.tweens.add({targets:wheel,angle:360,duration:16000,repeat:-1})
  this.add.image(m.x,cy-50,'pointer').setScale(1/S).setDepth(stand.depth+2)}

 buildCrash(m:Machine){
  const pad=this.put('crashpad',m.x,m.y)
  const rx=m.x+40
  const flame=this.add.image(rx,m.y-64,'flame').setScale(1/S).setOrigin(.5,0).setDepth(pad.depth-1)
  this.flames.push(flame)
  const rocket=this.add.image(rx,m.y-60,'rocket').setScale(1/S).setOrigin(.5,1).setDepth(pad.depth)
  this.tweens.add({targets:[rocket,flame],y:'-=5',duration:1100,yoyo:true,repeat:-1,ease:'Sine.easeInOut'})}

 buildDecor(){
  const l=this.layout
  // Poker tables with chairs
  for(const[x,y]of l.poker){
   this.put('poker',x,y)
   this.put('chips',x-70,y-20).setDepth(y+1);this.put('chips',x+72,y-18).setDepth(y+1)
   for(const dx of[-76,0,76]){this.put('stool',x+dx,y+32);this.put('stool',x+dx,y-52).setDepth(y-60)}}
  const npc=(key:string,hue:number,x:number,y:number,frame='d0')=>{
   makeCharacter(this,key,lookFor(hue));return this.add.sprite(x,y,key,frame).setScale(1/S).setDepth(y+18)}
  // Bar with staff and regulars
  if(l.bar){
   const[bx,by]=l.bar
   this.put('bar',bx,by)
   for(const dx of[-70,0,70])this.put('stool',bx+dx,by+32)
   const barkeep=npc('barkeep',210,bx,by-70)
   barkeep.setDepth(by+1)
   // The counter is redrawn in front of the staff, so they stand behind it with their legs hidden.
   this.put('bar',bx,by).setCrop(0,56*S,260*S,52*S).setDepth(by+2)
   this.tweens.add({targets:barkeep,x:{from:bx-80,to:bx+80},duration:6000,yoyo:true,repeat:-1,ease:'Sine.easeInOut',onYoyo:()=>barkeep.setFlipX(true),onRepeat:()=>barkeep.setFlipX(false)})
   barkeep.setFrame('s1')
   const regular=npc('regular',40,bx-70,by+14,'u0')
   this.tweens.add({targets:regular,y:'-=1.5',duration:900,yoyo:true,repeat:-1})}
  // Cashier cage and the debt collector who waits behind it
  this.put('cage',950,660)
  npc('cashier',130,950,600).setDepth(661)
  this.put('cage',950,660).setCrop(0,74*S,240*S,44*S).setDepth(662)
  const bars=this.add.graphics().setDepth(662).lineStyle(1.5,0xa8791c)
  for(let i=0;i<=20;i++)bars.lineBetween(840+i*11,572,840+i*11,616)
  makeCharacter(this,'collector',{suit:'#17171d',suitDark:'#08080c',hair:'#050507',skin:'#d9cfc4',tie:'#d4122f'})
  this.collectorAura=this.add.image(COLLECTOR_HOME.x,COLLECTOR_HOME.y,'glow').setTint(0xff1a3c).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0).setDisplaySize(170,170).setDepth(1)
  this.collector=this.add.sprite(COLLECTOR_HOME.x,COLLECTOR_HOME.y,'collector','u0').setScale(1/S)
  // Pillars and plants
  for(const[x,y]of l.pillars)this.put('pillar',x,y)
  for(const[x,y]of l.plants)this.put('plant',x,y)
  // Velvet ropes lead down the runner toward the crash pad
  if(l.ropes){
   const rope=this.add.graphics().setDepth(530)
   rope.lineStyle(2.5,0xb5173d)
   for(const side of[496,664]){
    for(let i=0;i<3;i++){
     const y0=490+i*44
     this.put('post',side,y0+10)
     if(i<2){const curve=new Phaser.Curves.QuadraticBezier(new Phaser.Math.Vector2(side,y0-14),new Phaser.Math.Vector2(side+4,y0+20),new Phaser.Math.Vector2(side,y0+30));curve.draw(rope)}}}}
  // Chandeliers hang above everything
  for(const x of l.chandeliers){
   const ch=this.add.image(x,250,'chandelier').setScale(1/S).setOrigin(.5,0).setDepth(8000)
   this.tweens.add({targets:ch,angle:{from:-1.5,to:1.5},duration:2600,yoyo:true,repeat:-1,ease:'Sine.easeInOut'})
   this.light(x,276,0xffe0a0,260,.3,2000).setDepth(7999)}}

 /** Pointer and touch: tapping a machine in reach plays it, tapping elsewhere walks there. */
 tap(x:number,y:number){
  if(this.h.blocked())return
  // In Backwards Shoes, a click sends the player the opposite way.
  if(this.h.reversed()){this.target={x:2*this.me.x-x,y:2*(this.me.y+16)-y,best:Infinity,since:this.time.now};return}
  const m=this.machines.find(k=>Math.abs(x-k.x)<k.bw/2+10&&y<k.y+24&&y>k.y-130)
  if(m&&this.nearId===m.id){this.h.onInteract(m.id);return}
  this.target=m?{x:m.fx,y:m.fy,machine:m.id,best:Infinity,since:this.time.now}:{x,y,best:Infinity,since:this.time.now}}

 near(){
  let best:Machine|null=null,d=Infinity
  const fy=this.me.y+16
  for(const m of this.machines){
   if(!this.isOpen(m.id))continue
   const k=Phaser.Math.Distance.Between(this.me.x,fy,m.x,m.y-m.bh/2)
   if(k<m.reach&&k<d){d=k;best=m}}
  return best}

 update(t:number,dt:number){
  const blocked=this.h.blocked(),k=this.keys
  let dx=0,dy=0
  if(!blocked){
   if(k.A!.isDown||k.LEFT!.isDown)dx--
   if(k.D!.isDown||k.RIGHT!.isDown)dx++
   if(k.W!.isDown||k.UP!.isDown)dy--
   if(k.S!.isDown||k.DOWN!.isDown)dy++
   if(this.h.reversed()){dx=-dx;dy=-dy}}
  if(dx||dy||blocked)this.target=null
  if(this.target)[dx,dy]=this.walkToTarget(t)
  const v=new Phaser.Math.Vector2(dx,dy).normalize().scale(SPEED)
  this.me.setVelocity(v.x,v.y)
  this.animate(this.me,dx,dy,t,dx||dy?facing(dx,dy,this.dir):this.dir)
  if(dx||dy)this.dir=facing(dx,dy,this.dir)
  this.me.setDepth(this.me.y+18)
  this.meLabel.setPosition(this.me.x,this.me.y-26)

  const m=this.near(),id=m?.id??null
  if(id!==this.nearId){
   // Up close the prompt names the machine, and the sign would sit under the player's name tag.
   if(this.nearId){this.rings.get(this.nearId)?.setVisible(false);this.signs.get(this.nearId)?.setVisible(true)}
   if(id){this.rings.get(id)?.setVisible(true);this.signs.get(id)?.setVisible(false)}
   this.nearId=id;this.h.onNear(id)}
  if(id)this.rings.get(id)?.setAlpha(.6+.4*Math.sin(t/180))
  // Always read the key, so an E pressed while a panel is open doesn't fire once it closes.
  const pressedE=Phaser.Input.Keyboard.JustDown(k.E!)
  if(!blocked&&m&&pressedE)this.h.onInteract(m.id)

  if(t-this.lastSent>100&&(Math.abs(this.me.x-this.lx)>.5||Math.abs(this.me.y-this.ly)>.5)){
   this.lastSent=t;this.lx=this.me.x;this.ly=this.me.y;this.h.onMove(Math.round(this.me.x),Math.round(this.me.y))}
  this.updateRemotes(t)
  this.updateBubbles()
  this.updateProps(t,dt)
  this.updateState()}

 walkToTarget(t:number):[number,number]{
  const g=this.target!,dx=g.x-this.me.x,dy=g.y-(this.me.y+16),dist=Math.hypot(dx,dy)
  if(dist<g.best-1){g.best=dist;g.since=t}
  const arrived=dist<8,stuck=t-g.since>350
  if(arrived||stuck){
   const reached=g.machine&&this.near()?.id===g.machine
   this.target=null
   if(reached)this.h.onInteract(g.machine!)
   return[0,0]}
  return[dx/dist,dy/dist]}

 animate(s:Phaser.GameObjects.Sprite,dx:number,dy:number,t:number,dir:string){
  const moving=dx!==0||dy!==0
  const step=moving?(Math.floor(t/130)%2)+1:0
  s.setFrame(`${dir}${step}`)
  if(dir==='s'&&dx!==0)s.setFlipX(dx<0)}

 updateRemotes(t:number){
  const seen=new Set<string>()
  for(const r of this.h.remotes()){
   seen.add(r.id)
   let o=this.remote.get(r.id)
   if(!o){
    const key='p-'+r.id
    makeCharacter(this,key,lookFor(hueOf(r.id)))
    o={s:this.add.sprite(r.x,r.y,key,'d0').setScale(1/S),l:label(this,r.x,r.y,r.name,'#ffffff').setDepth(9000),dir:'d',t:0}
    this.remote.set(r.id,o)}
   const mx=(r.x-o.s.x)*.2,my=(r.y-o.s.y)*.2,moving=Math.abs(mx)+Math.abs(my)>.3
   o.s.x+=mx;o.s.y+=my
   if(moving)o.dir=facing(mx,my,o.dir)
   this.animate(o.s,moving?mx:0,moving?my:0,t,o.dir)
   o.s.setDepth(o.s.y+18);o.l.setPosition(o.s.x,o.s.y-26)}
  for(const[id,o]of this.remote)if(!seen.has(id)){o.s.destroy();o.l.destroy();this.remote.delete(id)}}

 /** Shows new chat messages over the sender's head, and keeps every bubble on its player. */
 updateBubbles(){
  for(const c of this.h.chat())if(c.id>this.chatSeen){this.chatSeen=c.id;this.showBubble(c.from,c.text)}
  for(const[id,b]of this.bubbles){
   const s=id===this.h.selfId?this.me:this.remote.get(id)?.s
   // Someone in the party who hasn't appeared in the room yet can't show a bubble until they do.
   b.setVisible(!!s)
   if(s)b.setPosition(s.x,s.y-36)}}
 showBubble(id:string,text:string){
  this.bubbles.get(id)?.destroy()
  const t=this.add.text(0,-10,text,{fontFamily:'Outfit,system-ui,sans-serif',fontSize:'12px',fontStyle:'600',color:'#1a0f26',align:'center',wordWrap:{width:BUBBLE_WIDTH,useAdvancedWrap:true},resolution:3}).setOrigin(.5,1)
  const w=t.width+14,h=t.height+8
  const g=this.add.graphics().fillStyle(0xffffff,.96).fillRoundedRect(-w/2,-6-h,w,h,7).fillTriangle(-5,-6,5,-6,0,0)
  const b=this.add.container(0,0,[g,t]).setDepth(9100)
  this.bubbles.set(id,b)
  this.tweens.add({targets:b,alpha:0,delay:BUBBLE_MS,duration:400,onComplete:()=>{
   if(this.bubbles.get(id)===b)this.bubbles.delete(id)
   b.destroy()}})}

 updateProps(t:number,dt:number){
  for(const[i,r]of this.reels.entries())r.tilePositionY+=dt*(.03+i*.012)
  for(const f of this.flames)f.setScale(1/S*(.85+Math.random()*.3),1/S*(.8+Math.random()*.5))
  if(this.ball){
   const c=this.ball.getData('c') as {x:number;y:number},a=-t/360
   this.ball.setPosition(c.x+Math.cos(a)*12.5,c.y+Math.sin(a)*12.5)}}

 updateState(){
  const g=this.h.state()
  if(g){
   // A new floor means a new room. The shop modal is covering the screen while it swaps.
   if(layoutIndex(g.floor)!==layoutIndex(this.floor)){this.scene.restart();return}
   this.floor=g.floor
   this.updateAccess(g)
   // The collector leaves the cage in the final two minutes and closes in as the clock runs out.
   const p=g.phase==='playing'?1-Phaser.Math.Clamp(g.timeLeft/120,0,1):g.phase==='over'?1:0
   const tx=Phaser.Math.Linear(COLLECTOR_HOME.x,COLLECTOR_TARGET.x,p),ty=Phaser.Math.Linear(COLLECTOR_HOME.y,COLLECTOR_TARGET.y,p)
   const cx=this.collector.x,cy=this.collector.y,mx=(tx-cx)*.02,my=(ty-cy)*.02
   this.collector.setPosition(cx+mx,cy+my).setDepth(this.collector.y+18)
   const moving=Math.abs(mx)+Math.abs(my)>.05
   this.animate(this.collector,moving?mx:0,moving?my:0,this.time.now,moving?facing(mx,my,'u'):'d')
   this.collectorAura.setPosition(this.collector.x,this.collector.y+10).setAlpha(p*.6)
   if(g.phase!==this.phase){
    if(g.phase==='over'){this.cameras.main.shake(600,.012);this.cameras.main.flash(700,180,10,30)}
    this.phase=g.phase}}
  const fx=this.h.fx()
  if(fx&&fx.n!==this.fxN){this.fxN=fx.n;this.playFx(fx)}}

 /** Coins and floating numbers at the machine where a bet landed. Every player sees everyone's results. */
 playFx(fx:Fx){
  const {result:r}=fx,m=this.machines.find(k=>k.id===r.game)
  if(!m)return
  const x=m.x,y=m.y-60
  if(r.net>0){
   const big=r.payout>=r.wager*10
   this.burst('coin',x,y,Math.min(70,12+Math.floor(r.net/15)),{speed:{min:90,max:big?380:240},angle:{min:215,max:325},gravityY:520,lifespan:1100,scale:{start:.7,end:.35},rotate:{start:0,end:540}})
   if(big){this.cameras.main.shake(420,.008);this.cameras.main.flash(260,255,210,90)}
   this.floatText(x,y-14,`+${r.net.toLocaleString()}`,'#ffe066',big?26:18)}
  else if(r.net<0){
   this.burst('puff',x,y+10,10,{speed:{min:15,max:60},angle:{min:240,max:300},lifespan:800,scale:{start:1.3,end:2.6},alpha:{start:.7,end:0}})
   this.floatText(x,y-14,r.net.toLocaleString(),'#ff8aa0',15)}}
 burst(key:string,x:number,y:number,count:number,cfg:Phaser.Types.GameObjects.Particles.ParticleEmitterConfig){
  const e=this.add.particles(x,y,key,{...cfg,emitting:false}).setDepth(8500)
  e.explode(count)
  this.time.delayedCall(1500,()=>e.destroy())}
 floatText(x:number,y:number,text:string,color:string,size:number){
  const l=this.add.text(x,y,text,{fontFamily:'Outfit,system-ui,sans-serif',fontSize:`${size}px`,fontStyle:'800',color,stroke:'#000',strokeThickness:4,resolution:3}).setOrigin(.5).setDepth(8600)
  this.tweens.add({targets:l,y:y-46,alpha:{from:1,to:0},duration:1500,ease:'Cubic.easeOut',onComplete:()=>l.destroy()})}
}

export function createCasino(parent:HTMLElement,h:Hooks){
 return new Phaser.Game({
  type:Phaser.AUTO,parent,antialias:true,backgroundColor:'#14061f',
  scale:{mode:Phaser.Scale.RESIZE,width:parent.clientWidth||960,height:parent.clientHeight||600},
  physics:{default:'arcade'},scene:new Casino(h)})}
