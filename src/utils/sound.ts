let ctx:AudioContext|null=null
export const getVol=()=>{try{const n=Number(localStorage.getItem('hub-vol')??'0.5');return Number.isFinite(n)?n:.5}catch{return .5}}
export const setVol=(n:number)=>{try{localStorage.setItem('hub-vol',String(n))}catch{/* ignore */}}
function tone(freq:number,ms:number,type:OscillatorType='square',delay=0,gain=1,slideTo?:number){
 const vol=getVol();if(vol<=0)return
 try{
  ctx??=new AudioContext();void ctx.resume()
  const t=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain()
  o.type=type;o.frequency.setValueAtTime(freq,t)
  if(slideTo)o.frequency.exponentialRampToValueAtTime(slideTo,t+ms/1000)
  g.gain.setValueAtTime(vol*.15*gain,t);g.gain.exponentialRampToValueAtTime(.0001,t+ms/1000)
  o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+ms/1000)
 }catch{/* audio unavailable */}}
const notes=(list:number[],step:number,ms:number,type:OscillatorType='triangle',gain=1)=>list.forEach((f,i)=>tone(f,ms,type,i*step,gain))
export const sfx={
 click:()=>tone(620,50,'triangle',0,.5),
 tick:()=>tone(900+Math.random()*200,25,'square',0,.3),
 reelStop:()=>tone(240,70,'square',0,.7),
 dice:()=>{for(let i=0;i<5;i++)tone(300+Math.random()*500,35,'square',i*.09,.5)},
 win:()=>notes([523,659,784],.09,220),
 jackpot:()=>notes([523,659,784,1047,1319,1047,1319,1568],.1,300),
 lose:()=>tone(220,380,'sawtooth',0,.7,70),
 launch:()=>tone(120,700,'sawtooth',0,.6,520),
 cash:()=>notes([988,1319],.07,180),
 bust:()=>{tone(180,600,'sawtooth',0,1,40);tone(90,600,'square',.03,.8,30)},
 alarm:()=>tone(740,120,'square',0,.45),
 floor:()=>notes([392,523,659,784,1047],.12,320),
 over:()=>notes([392,330,262,196],.22,500,'sawtooth',.7),
 buy:()=>notes([660,880],.06,120)}
