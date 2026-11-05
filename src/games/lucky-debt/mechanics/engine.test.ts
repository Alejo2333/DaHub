import {describe,expect,it} from 'vitest'
import {EARLY_BONUS,Ledger,LOAN_CHIPS,LOAN_DEBT,quotaFor,roundTime} from './engine'
import {crashMs,crashMult,drawCrash,resolve,WHEEL,SYM_W,SYM_PAY,DICE_PAY} from './payouts'
const seq=(...n:number[])=>{let i=0;return()=>n[i++%n.length]!}
const L=(...n:number[])=>new Ledger(seq(...n))
describe('payouts',()=>{
 it('roulette red/number/zero',()=>{
  expect(resolve({id:'a',game:'roulette',wager:100,choice:'red'},seq(1/37+.001))!.payout).toBe(200) // 1 is red
  expect(resolve({id:'a',game:'roulette',wager:100,choice:'n:0'},seq(0))!.payout).toBe(3600)
  expect(resolve({id:'a',game:'roulette',wager:100,choice:'black'},seq(0))!.payout).toBe(0)})
 it('roulette low/high/dozens lose on zero and pay on their range',()=>{
  const at=(n:number)=>seq((n+.5)/37)
  for(const c of['low','high','d1','d2','d3'])expect(resolve({id:'a',game:'roulette',wager:100,choice:c},at(0))!.payout).toBe(0)
  expect(resolve({id:'a',game:'roulette',wager:100,choice:'low'},at(18))!.payout).toBe(200)
  expect(resolve({id:'a',game:'roulette',wager:100,choice:'high'},at(19))!.payout).toBe(200)
  expect(resolve({id:'a',game:'roulette',wager:100,choice:'d1'},at(12))!.payout).toBe(300)
  expect(resolve({id:'a',game:'roulette',wager:100,choice:'d2'},at(13))!.payout).toBe(300)
  expect(resolve({id:'a',game:'roulette',wager:100,choice:'d3'},at(36))!.payout).toBe(300)})
 it('roulette rejects bad numbers and unknown bets',()=>{
  for(const c of['n:37','n:-1','n:','n:1.5','nope'])expect(resolve({id:'a',game:'roulette',wager:100,choice:c},seq(0))).toBeNull()})
 it('slots jackpot and two cherries',()=>{
  expect(resolve({id:'a',game:'slots',wager:10,choice:0},seq(.999,.999,.999))!.payout).toBe(1000)
  expect(resolve({id:'a',game:'slots',wager:10,choice:0},seq(0,0,.5))!.payout).toBe(5)})
 it('dice doubles',()=>expect(resolve({id:'a',game:'dice',wager:100,choice:'doubles'},seq(0,0))!.payout).toBe(500))
 it('rejects invalid choices',()=>expect(resolve({id:'a',game:'dice',wager:10,choice:'x'},seq(0))).toBeNull())
 it('crash is not an instant game',()=>expect(resolve({id:'a',game:'crash',wager:10,choice:2},seq(0))).toBeNull())
 it('no game has RTP above 1 even with max upgrades',()=>{
  const wheel=WHEEL.reduce((a,b)=>a+b,0)/WHEEL.length*1.08
  const tot=SYM_W.reduce((a,b)=>a+b,0),slots=SYM_W.reduce((a,w,i)=>a+(w/tot)**3*SYM_PAY[i]!,0)+3*.16*.6*.5
  expect(wheel).toBeLessThan(1);expect(slots*1.08).toBeLessThan(1);expect(DICE_PAY.over*15/36*1.08).toBeLessThan(1)})})
describe('wallet',()=>{
 it('applies win and loss atomically',()=>{
  const l=L(0,0);// roulette n=0
  l.bet({id:'1',game:'roulette',wager:100,choice:'n:0'});expect(l.g.balance).toBe(1000+3500)
  const l2=L(0);l2.bet({id:'1',game:'roulette',wager:100,choice:'red'});expect(l2.g.balance).toBe(900)})
 it('rejects insufficient balance, duplicates and tiny wagers',()=>{
  const l=L(0.5)
  expect(l.bet({id:'1',game:'wheel',wager:5000,choice:0}).err).toMatch(/Not enough/)
  expect(l.bet({id:'1',game:'wheel',wager:10,choice:0}).err).toMatch(/Duplicate/)
  expect(l.bet({id:'2',game:'wheel',wager:1,choice:0}).err).toMatch(/Minimum/)})
 it('simultaneous wagers never overdraw',()=>{
  const l=L(0.1);const r=[1,2,3,4].map(i=>l.bet({id:String(i),game:'wheel',wager:400,choice:0}))
  expect(r.filter(x=>x.res).length).toBeLessThanOrEqual(3);expect(l.g.balance).toBeGreaterThanOrEqual(0)})
 it('shield refunds half of a loss once',()=>{
  const l=L(0.1);l.g.upgrades.shield=1;l.g.shield=1
  l.bet({id:'1',game:'wheel',wager:100,choice:0});expect(l.g.balance).toBe(950);expect(l.g.shield).toBe(0)})})
describe('crash flights',()=>{
 const clock=(l:Ledger)=>{let t=0;l.now=()=>t;return(ms:number)=>{t+=ms}}
 const launch=(l:Ledger,id='f',from='p',wager=100)=>l.launch({id,game:'crash',wager,choice:0},from)
 it('crash point follows the 95%/m curve',()=>{
  expect(drawCrash(seq(0))).toBe(1)
  expect(drawCrash(seq(.05))).toBe(1)
  expect(drawCrash(seq(.525))).toBe(2)
  expect(drawCrash(seq(.999999))).toBe(100)})
 it('multiplier curve and its inverse agree',()=>{
  expect(crashMult(0)).toBe(1)
  expect(crashMult(crashMs(2.5))).toBeCloseTo(2.5,6)
  expect(crashMult(1e9)).toBe(100)})
 it('takes the wager at launch and pays when cashed out in time',()=>{
  const l=L(.9),tick=clock(l)
  expect(launch(l).flight!.point).toBeCloseTo(9.5)
  expect(l.g.balance).toBe(900)
  tick(crashMs(2)+1)
  const {res}=l.cashOut('f','p')
  expect(res!.payout).toBe(200);expect(res!.net).toBe(100);expect(res!.from).toBe('p');expect(l.g.balance).toBe(1100)
  expect(l.flights.size).toBe(0)})
 it('a cash-out after the crash point loses',()=>{
  const l=L(.525),tick=clock(l)
  launch(l);tick(crashMs(2)+50)
  const {res}=l.cashOut('f','p')
  expect(res!.payout).toBe(0);expect(res!.net).toBe(-100);expect(l.g.balance).toBe(900)})
 it('only the owner can cash out, and only once',()=>{
  const l=L(.9);clock(l);launch(l)
  expect(l.cashOut('f','thief').err).toBeTruthy()
  expect(l.cashOut('f','p').res).toBeTruthy()
  expect(l.cashOut('f','p').err).toBeTruthy()})
 it('a crash uses the loss shield',()=>{
  const l=L(.9);clock(l);l.g.shield=1;launch(l)
  const res=l.bust('f')!
  expect(res.net).toBe(-50);expect(res.shielded).toBe(true);expect(l.g.balance).toBe(950);expect(l.g.shield).toBe(0)})
 it('cannot launch more than the wallet holds, even across flights',()=>{
  const l=L(.9);clock(l)
  expect(launch(l,'a','p',700).flight).toBeTruthy()
  expect(launch(l,'b','p',700).err).toMatch(/Not enough/)})
 it('cashAll settles only the chosen player when asked',()=>{
  const l=L(.9);clock(l);launch(l,'a','p1');launch(l,'b','p2')
  expect(l.cashAll('p1').map(r=>r.id)).toEqual(['a'])
  expect(l.cashAll().map(r=>r.id)).toEqual(['b'])
  expect(l.flights.size).toBe(0)})})
describe('debt progression and transitions',()=>{
 it('quota scales and debt relief reduces it',()=>{expect(quotaFor(1,0)).toBe(2000);expect(quotaFor(2,0)).toBe(3000);expect(quotaFor(2,1)).toBe(2700)})
 it('success deducts quota, advances floor and opens upgrades',()=>{
  const l=L(0.5);l.g.balance=2500;l.g.timeLeft=1
  expect(l.tick()).toBe('floor');expect(l.g.balance).toBe(500);expect(l.g.floor).toBe(2);expect(l.g.phase).toBe('upgrades');expect(l.g.quota).toBe(3000)
  expect(l.bet({id:'x',game:'wheel',wager:10,choice:0}).err).toMatch(/not active/)})
 it('failure ends the run',()=>{const l=L(0.5);l.g.timeLeft=1;expect(l.tick()).toBe('over');expect(l.g.phase).toBe('over')})
 it('upgrades are limited, cost chips, and next floor restarts timer',()=>{
  const l=L(0.5);l.g.balance=4000;l.g.timeLeft=1;l.tick()
  expect(l.buy('time')).toBeNull();expect(l.buy('chips')).toBeNull();expect(l.buy('chips')).toMatch(/maxed/)
  expect(l.nextFloor()).toBe(true);expect(l.g.timeLeft).toBe(roundTime(l.g.upgrades));expect(l.g.timeLeft).toBe(330)
  expect(l.nextFloor()).toBe(false)})
 it('rejects upgrade ids that are built-in object properties',()=>{
  for(const id of['constructor','__proto__','toString','hasOwnProperty']){
   const l=L(.5);l.g.phase='upgrades'
   expect(l.buy(id)).toBeTruthy();expect(l.g.balance).toBe(1000)}})
 it('paying early turns unused seconds into bonus chips',()=>{
  const l=L(.5);l.g.balance=2500;l.g.timeLeft=100
  expect(l.payDebt()).toBe(100*EARLY_BONUS)
  expect(l.g.balance).toBe(500+100*EARLY_BONUS);expect(l.g.floor).toBe(2);expect(l.g.phase).toBe('upgrades');expect(l.g.bonus).toBe(100*EARLY_BONUS)})
 it('cannot pay without enough chips or outside a round',()=>{
  const l=L(.5);expect(l.payDebt()).toBeNull();expect(l.g.floor).toBe(1)
  l.g.balance=9000;l.g.phase='upgrades';expect(l.payDebt()).toBeNull()})
 it('the loan shark works once per floor and grows the debt',()=>{
  const l=L(.5)
  expect(l.takeLoan()).toBe(true);expect(l.g.balance).toBe(1000+LOAN_CHIPS);expect(l.g.quota).toBe(2000+LOAN_DEBT)
  expect(l.takeLoan()).toBe(false);expect(l.g.balance).toBe(1000+LOAN_CHIPS)
  l.g.balance=9000;l.payDebt();l.nextFloor()
  expect(l.g.quota).toBe(3000);expect(l.g.loanUsed).toBe(false);expect(l.takeLoan()).toBe(true)})
 it('going broke ends the run only once the loan is spent',()=>{
  const l=L(.1)
  l.bet({id:'a',game:'wheel',wager:1000,choice:0});expect(l.g.balance).toBe(0);expect(l.g.phase).toBe('playing')
  l.takeLoan();l.bet({id:'b',game:'wheel',wager:LOAN_CHIPS,choice:0});expect(l.g.phase).toBe('over')})
 it('going broke waits for flights still in the air',()=>{
  const l=L(.9);l.now=()=>0;l.g.loanUsed=true
  l.launch({id:'f',game:'crash',wager:1000,choice:0},'p');expect(l.g.balance).toBe(0);expect(l.g.phase).toBe('playing')
  l.bust('f');expect(l.g.phase).toBe('over')})})
