import {describe,expect,it,vi} from 'vitest'
import {CHAOS_CUTOFF,EARLY_BONUS,FINAL_FLOOR,FIRST_CHAOS,itemCost,Ledger,LOAN_CHIPS,LOAN_DEBT,MARKER_INTEREST,minBetFor,quotaFor,roundTime,upgradeCost,UPGRADES} from './engine'
import {crashMs,crashMult,drawCrash,resolve} from './payouts'
import {FLOORS,machinesFor,ruleFor} from './floors'
import {GAME_KINDS,SIMPLE_KINDS} from '../../../types/net'
// These tests check the rules, so they use fixed odds and keep passing when odds.ts is rebalanced. odds.test.ts checks the real numbers.
vi.mock('./odds',async importOriginal=>{
 const real=await importOriginal<typeof import('./odds')>()
 return{...real,
  SLOT_SYMBOLS:[{icon:'🍒',weight:40,pays:5},{icon:'🍋',weight:30,pays:8},{icon:'🔔',weight:20,pays:15},{icon:'7️⃣',weight:8,pays:40},{icon:'💎',weight:2,pays:100}],
  SLOT_TWO_OF_FIRST_PAYS:.5,
  START_CHIPS:1000,
  FIRST_FLOOR_DEBT:1500,
  FLOOR_PAYDAY:0, // payday.test.ts covers the payday.
  ROULETTE_PAYS:{outside:2,dozen:3,number:36},
  DICE_PAYS:{over:2.2,under:2.2,seven:5,doubles:5},
  WHEEL_SEGMENTS:[0,0,0,0,0,0,0,0,.5,.5,.5,.5,.5,1.5,1.5,1.5,1.5,2,2,5],
  CRASH:{rtp:.95,maxMultiplier:100},
  CUP_PAYS:2.8,
  VAULT_LOCK_CHANCE:.7,
  VAULT_PAYS:{v1:1.3,v2:1.85,v3:2.65,v4:3.75},
  HOT_MACHINES_BONUS:.04,
  HOT_MACHINES_MAX_LEVEL:2,
  HOT_EVENT_WIN:1.1,
  DARE_WIN_CHANCE:.48,
  SHAKEDOWN_ESCAPE_CHANCE:.5,
  TABLE_GAME_ODDS:{...real.TABLE_GAME_ODDS,
   coin:{faces:[{face:'Heads',w:50},{face:'Tails',w:50}],options:[{id:'o0',label:'Heads',pays:[1.9,0]},{id:'o1',label:'Tails',pays:[0,1.9]}]},
   darts:{faces:[{face:'Miss',w:49},{face:'Outer',w:30},{face:'Inner',w:18},{face:'Bullseye',w:3}],options:[{id:'play',label:'Play',pays:[0,1,2,7]}]},
   chest:{faces:[{face:'Empty',w:50},{face:'Coins',w:25},{face:'Gems',w:20},{face:'Crown',w:5}],options:[{id:'play',label:'Play',pays:[0,1,2,5]}]}}}})
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
 it('crash is not an instant game',()=>expect(resolve({id:'a',game:'crash',wager:10,choice:2},seq(0))).toBeNull())})
describe('wallet',()=>{
 it('applies win and loss atomically',()=>{
  const l=L(0,0);l.g.machines.push('roulette')// roulette n=0
  l.bet({id:'1',game:'roulette',wager:100,choice:'n:0'});expect(l.g.balance).toBe(1000+3500)
  const l2=L(0);l2.g.machines.push('roulette');l2.bet({id:'1',game:'roulette',wager:100,choice:'red'});expect(l2.g.balance).toBe(900)})
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
 it('quota scales and debt relief reduces it',()=>{expect(quotaFor(1,0)).toBe(1500);expect(quotaFor(2,0)).toBe(2100);expect(quotaFor(2,1)).toBe(1890)})
 it('success deducts quota, advances floor and opens upgrades',()=>{
  const l=L(0.5);l.g.balance=2500;l.g.timeLeft=1
  expect(l.tick()).toBe('floor');expect(l.g.balance).toBe(1000);expect(l.g.floor).toBe(2);expect(l.g.phase).toBe('upgrades');expect(l.g.quota).toBe(2100)
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
  expect(l.g.balance).toBe(1000+100*EARLY_BONUS);expect(l.g.floor).toBe(2);expect(l.g.phase).toBe('upgrades');expect(l.g.bonus).toBe(100*EARLY_BONUS)})
 it('cannot pay without enough chips or outside a round',()=>{
  const l=L(.5);expect(l.payDebt()).toBeNull();expect(l.g.floor).toBe(1)
  l.g.balance=9000;l.g.phase='upgrades';expect(l.payDebt()).toBeNull()})
 it('the marker works once per floor, grows the debt, and stays on the books',()=>{
  const l=L(.5)
  expect(l.takeLoan()).toBe(true);expect(l.g.balance).toBe(1000+LOAN_CHIPS);expect(l.g.quota).toBe(1500+LOAN_DEBT);expect(l.g.markers).toBe(1)
  expect(l.takeLoan()).toBe(false);expect(l.g.balance).toBe(1000+LOAN_CHIPS);expect(l.g.markers).toBe(1)
  l.g.balance=9000;l.payDebt();l.nextFloor()
  expect(l.g.quota).toBe(2100+MARKER_INTEREST);expect(l.g.loanUsed).toBe(false);expect(l.takeLoan()).toBe(true);expect(l.g.markers).toBe(2)})
 it('debt relief keeps marker interest on the quota',()=>{
  const l=L(.5);l.takeLoan();l.g.balance=9000;l.payDebt()
  expect(l.buy('debt')).toBeNull();expect(l.g.quota).toBe(1890+MARKER_INTEREST)})
 it('going broke ends the run only once the loan is spent',()=>{
  const l=L(.1)
  l.bet({id:'a',game:'wheel',wager:1000,choice:0});expect(l.g.balance).toBe(0);expect(l.g.phase).toBe('playing')
  l.takeLoan();l.bet({id:'b',game:'wheel',wager:LOAN_CHIPS,choice:0});expect(l.g.phase).toBe('over')})
 it('going broke waits for flights still in the air',()=>{
  const l=L(.9);l.now=()=>0;l.g.loanUsed=true
  l.launch({id:'f',game:'crash',wager:1000,choice:0},'p');expect(l.g.balance).toBe(0);expect(l.g.phase).toBe('playing')
  l.bust('f');expect(l.g.phase).toBe('over')})})
describe('the final choice',()=>{
 /** A ledger that has just cleared the final floor. */
 const atChoice=()=>{const l=L(.5);l.g.floor=FINAL_FLOOR;l.g.quota=quotaFor(FINAL_FLOOR,0);l.g.balance=l.g.quota+700;l.payDebt();return l}
 it('clearing the final floor offers the choice instead of the shop',()=>{
  const l=atChoice();expect(l.g.phase).toBe('final');expect(l.g.floor).toBe(FINAL_FLOOR+1);expect(l.g.ending).toBeNull()
  expect(l.g.quota).toBe(quotaFor(FINAL_FLOOR+1,0));expect(l.g.quota).toBeGreaterThan(quotaFor(FINAL_FLOOR,0)*2)
  expect(l.buy('time')).toBeTruthy();expect(l.nextFloor()).toBe(false)})
 it('walking away wins the run and keeps the chips',()=>{
  const l=atChoice(),chips=l.g.balance;expect(l.walkAway()).toBe(true)
  expect(l.g.phase).toBe('won');expect(l.g.ending).toBe('free');expect(l.g.balance).toBe(chips);expect(l.walkAway()).toBe(false)})
 it('paying the buyout wins the casino',()=>{
  const l=atChoice();expect(l.buyout()).toBe(true);expect(l.g.phase).toBe('upgrades');expect(l.nextFloor()).toBe(true)
  l.g.balance=l.g.quota;l.g.timeLeft=1;expect(l.tick()).toBe('floor')
  expect(l.g.phase).toBe('won');expect(l.g.ending).toBe('owner');expect(l.g.floor).toBe(FINAL_FLOOR+2)})
 it('missing the buyout loses the run',()=>{
  const l=atChoice();l.buyout();l.nextFloor();l.g.timeLeft=1;expect(l.tick()).toBe('over');expect(l.g.ending).toBeNull()})
 it('the choice is only available after the final floor',()=>{const l=L(.5);expect(l.walkAway()).toBe(false);expect(l.buyout()).toBe(false);expect(l.g.phase).toBe('playing')})})
describe('new games',()=>{
 it('shell game pays on the right cup and rejects bad cups',()=>{
  expect(resolve({id:'a',game:'cups',wager:100,choice:'1'},seq(.5))!.payout).toBe(280)
  expect(resolve({id:'a',game:'cups',wager:100,choice:'0'},seq(.5))!.payout).toBe(0)
  expect(resolve({id:'a',game:'cups',wager:100,choice:'3'},seq(.5))).toBeNull()})
 it('vault pays only when every lock opens',()=>{
  expect(resolve({id:'a',game:'vault',wager:100,choice:'v2'},seq(.1,.1))).toMatchObject({payout:185,roll:{opened:2,target:2}})
  expect(resolve({id:'a',game:'vault',wager:100,choice:'v2'},seq(.1,.9))).toMatchObject({payout:0,roll:{opened:1,target:2}})
  for(const c of['v0','v5','constructor',''])expect(resolve({id:'a',game:'vault',wager:100,choice:c},seq(.1))).toBeNull()})})
describe('floor unlocks and rules',()=>{
 const toFloor=(l:Ledger,floor:number)=>{for(;l.g.floor<floor;){l.g.balance=l.g.quota+9000;l.payDebt();if(l.g.phase==='final')l.buyout();l.nextFloor()}}
 it('each game lives on exactly one floor, four to a floor',()=>{
  expect(FLOORS.flatMap(f=>f.games).sort()).toEqual([...GAME_KINDS].sort())
  for(const f of FLOORS)expect(f.games).toHaveLength(4)
  expect(SIMPLE_KINDS).toHaveLength(17)})
 it('table-driven games pay from the drawn face and reject unknown bets',()=>{
  expect(resolve({id:'a',game:'coin',wager:100,choice:'o0'},seq(.1))).toMatchObject({payout:190,roll:0})
  expect(resolve({id:'a',game:'coin',wager:100,choice:'o0'},seq(.9))).toMatchObject({payout:0,roll:1})
  expect(resolve({id:'a',game:'chest',wager:100,choice:'play'},seq(.999))).toMatchObject({payout:500,roll:3})
  for(const c of['nope','constructor',0])expect(resolve({id:'a',game:'coin',wager:100,choice:c},seq(.1))).toBeNull()})
 it('there is a rule for every floor, including past the end',()=>{
  expect(FLOORS).toHaveLength(FINAL_FLOOR+1);expect(ruleFor(FINAL_FLOOR+2)).toBe(FLOORS[FINAL_FLOOR])})
 it('machines only take bets on their own floor',()=>{
  const l=L(.5);expect(l.bet({id:'a',game:'cups',wager:50,choice:'1'}).err).toMatch(/closed/)
  expect(l.g.machines).toEqual(machinesFor(1))
  toFloor(l,2);expect(l.bet({id:'b',game:'cups',wager:50,choice:'1'}).res).toBeTruthy()
  expect(l.bet({id:'c',game:'wheel',wager:50,choice:0}).err).toMatch(/closed/)})
 it('steady hands pays more on darts',()=>{
  const l=L(.999);toFloor(l,2);const b=l.g.balance
  l.bet({id:'a',game:'darts',wager:100,choice:'play'});expect(l.g.balance-b).toBe(735-100)})
 it('fire sale discounts the shop and shortens the clock',()=>{
  const l=L(.5);toFloor(l,2);l.g.balance=l.g.quota+5000;l.payDebt()
  const b=l.g.balance;expect(l.g.floor).toBe(3)
  expect(upgradeCost('time',3)).toBe(Math.round(UPGRADES.time!.cost*.7));l.buy('time');expect(b-l.g.balance).toBe(210)
  l.nextFloor();expect(l.g.timeLeft).toBe(300+30-60)})
 it('high rollers raises the minimum bet',()=>{
  const l=L(.5);toFloor(l,4);expect(minBetFor(4)).toBe(50)
  expect(l.bet({id:'a',game:'bowling',wager:40,choice:'play'}).err).toMatch(/Minimum wager is 50/)})
 it('tight locks trims vault wins',()=>{
  const l=L(.1);toFloor(l,5);l.g.balance=1000
  l.bet({id:'a',game:'vault',wager:100,choice:'v1'});expect(l.g.balance).toBe(1000+104-100)})})
describe('chaos',()=>{
 const voting=(kind:'dare'|'shakedown'|'deal',...r:number[])=>{const l=L(...(r.length?r:[.5]));l.g.vote={kind,until:l.g.timeLeft-20,yes:[],no:[]};return l}
 it('nothing happens before the first chaos, then something does',()=>{
  const l=L(.1,.1,.1,.1);for(let i=1;i<FIRST_CHAOS;i++)expect(l.chaosTick(1)).toBeNull()
  expect(l.chaosTick(1)).toBeTruthy()})
 it('no new chaos starts close to the end of a floor',()=>{
  const l=L(.1);l.nextChaos=1;l.g.timeLeft=CHAOS_CUTOFF-1;expect(l.chaosTick(1)).toBeNull();expect(l.g.vote).toBeNull()})
 it('a power cut closes the machine, then reopens it',()=>{
  const l=L(.5);l.g.event={kind:'cut',machine:'wheel',until:280}
  expect(l.bet({id:'a',game:'wheel',wager:50,choice:0}).err).toMatch(/closed/)
  expect(l.chaosTick(1)).toBeNull()
  l.g.timeLeft=280;expect(l.chaosTick(1)?.text).toMatch(/back open/);expect(l.g.event).toBeNull()
  expect(l.bet({id:'b',game:'wheel',wager:50,choice:0}).res).toBeTruthy()})
 it('a hot machine pays more on wins',()=>{
  const l=L(.999);l.g.event={kind:'hot',machine:'wheel',until:0}
  l.bet({id:'a',game:'wheel',wager:100,choice:0});expect(l.g.balance).toBe(1000+550-100)})
 it('each player votes once and a majority settles it immediately',()=>{
  const l=voting('deal')
  expect(l.castVote('a',true)).toBe(true);expect(l.castVote('a',true)).toBe(false);expect(l.castVote('a',false)).toBe(false)
  expect(l.decideVote(3)).toBeNull()
  l.castVote('b',true);expect(l.decideVote(3)?.text).toMatch(/Side deal done/)
  expect(l.g.vote).toBeNull();expect(l.g.balance).toBe(1200);expect(l.g.quota).toBe(1800)})
 it('a tie counts as no, and so does nobody voting',()=>{
  const t=voting('deal');t.castVote('a',true);t.castVote('b',false)
  expect(t.decideVote(2)?.text).toMatch(/walked away/);expect(t.g.balance).toBe(1000)
  const s=voting('deal');s.g.timeLeft=s.g.vote!.until;expect(s.chaosTick(3)?.text).toMatch(/walked away/)})
 it('at the deadline the larger side wins, even without a majority',()=>{
  const l=voting('deal');l.castVote('a',true);l.g.timeLeft=l.g.vote!.until
  expect(l.decideVote(5)?.text).toMatch(/Side deal done/)})
 it('the dare swings the wallet by a quarter either way',()=>{
  const w=voting('dare',.1);w.castVote('a',true);w.decideVote(1);expect(w.g.balance).toBe(1250)
  const f=voting('dare',.9);f.castVote('a',true);f.decideVote(1);expect(f.g.balance).toBe(750);expect(f.g.stats.lost).toBe(250)})
 it('the shakedown charges 10%, or risks 20% if refused',()=>{
  const p=voting('shakedown');p.castVote('a',true);p.decideVote(1);expect(p.g.balance).toBe(900)
  const r=voting('shakedown',.1);r.castVote('a',false);r.decideVote(1);expect(r.g.balance).toBe(1000)
  const c=voting('shakedown',.9);c.castVote('a',false);c.decideVote(1);expect(c.g.balance).toBe(800)})
 it('chaos can end a run when the team is out of options',()=>{
  const l=voting('shakedown');l.g.balance=10;l.g.loanUsed=true;l.castVote('a',true);l.decideVote(1);expect(l.g.phase).toBe('over')})
 it('clearing a floor clears chaos, and votes are closed outside play',()=>{
  const l=voting('deal');l.g.event={kind:'cut',machine:'wheel',until:0};l.g.balance=9000;l.payDebt()
  expect(l.g.vote).toBeNull();expect(l.g.event).toBeNull();expect(l.castVote('a',true)).toBe(false);expect(l.chaosTick(1)).toBeNull()})})
describe('sketchy shop',()=>{
 const toFloor2=(l:Ledger)=>{l.g.balance=9000;l.payDebt();l.nextFloor()}
 it('charges the team wallet, scales with the floor, and limits stock per floor',()=>{
  const l=L(.5);expect(itemCost('charm',1)).toBe(230);expect(itemCost('charm',2)).toBe(320)
  expect(l.buyItem('charm','a')).toBeNull();expect(l.g.balance).toBe(770);expect(l.g.luck).toBe(3)
  expect(l.buyItem('charm','a')).toMatch(/Sold out/)
  toFloor2(l);expect(l.buyItem('charm','a')).toBeNull();expect(l.g.luck).toBe(6)})
 it('refuses unknown items, built-in names, and purchases it cannot afford or outside a floor',()=>{
  const l=L(.5)
  for(const id of['nope','constructor','__proto__'])expect(l.buyItem(id,'a')).toBeTruthy()
  l.g.balance=5;expect(l.buyItem('charm','a')).toMatch(/Not enough/)
  l.g.balance=9000;l.g.phase='upgrades';expect(l.buyItem('charm','a')).toMatch(/only open/)})
 it('a purchase can break the team',()=>{
  const l=L(.5);l.g.loanUsed=true;l.g.balance=30;expect(l.buyItem('stink','a','b')).toBeNull();expect(l.g.balance).toBe(0);expect(l.g.phase).toBe('over')})
 it("rabbit's foot boosts the next wins only",()=>{
  const l=L(.999);l.g.luck=1
  l.bet({id:'a',game:'wheel',wager:100,choice:0},'p');expect(l.g.balance).toBe(1000+625-100);expect(l.g.luck).toBe(0)
  const b=l.g.balance;l.bet({id:'b',game:'wheel',wager:100,choice:0},'p');expect(l.g.balance-b).toBe(400)})
 it('a loss does not use up luck',()=>{
  const l=L(.1);l.g.luck=2;l.bet({id:'a',game:'wheel',wager:100,choice:0},'p');expect(l.g.luck).toBe(2)})
 it('marked cards redraws a losing bet once',()=>{
  const l=L(.1,.999);l.g.reroll=1
  const {res}=l.bet({id:'a',game:'wheel',wager:100,choice:0},'p')
  expect(res!.payout).toBe(500);expect(res!.detail).toMatch(/Marked Cards/);expect(l.g.reroll).toBe(0)})
 it('marked cards is kept when the bet wins first time',()=>{
  const l=L(.999);l.g.reroll=1;l.bet({id:'a',game:'wheel',wager:100,choice:0},'p');expect(l.g.reroll).toBe(1)})
 it('the watch adds time and keeps events and pranks the same length',()=>{
  const l=L(.5);l.g.event={kind:'cut',machine:'wheel',until:280};l.g.pranks=[{kind:'cuffs',target:'b',until:290}]
  l.g.vote=null;l.buyItem('watch','a');expect(l.g.timeLeft).toBe(345);expect(l.g.event!.until).toBe(325);expect(l.g.pranks[0]!.until).toBe(335)})
 it("the envelope cuts this floor's debt",()=>{
  const l=L(.5);l.buyItem('bribe','a');expect(l.g.quota).toBe(1350);expect(l.g.balance).toBe(910)})
 it('pranks need a target who is not the buyer',()=>{
  const l=L(.5);expect(l.buyItem('stink','a')).toMatch(/friend/);expect(l.buyItem('stink','a','a')).toMatch(/friend/);expect(l.g.balance).toBe(1000)})
 it('handcuffs stop only the target, and wear off',()=>{
  const l=L(.5);l.buyItem('cuffs','a','b');expect(l.g.pranks[0]).toMatchObject({kind:'cuffs',target:'b',until:285})
  expect(l.bet({id:'x',game:'wheel',wager:50,choice:0},'b').err).toMatch(/handcuffs/)
  expect(l.launch({id:'y',game:'crash',wager:50,choice:0},'b').err).toMatch(/handcuffs/)
  expect(l.bet({id:'z',game:'wheel',wager:50,choice:0},'a').res).toBeTruthy()
  l.g.timeLeft=285;expect(l.bet({id:'w',game:'wheel',wager:50,choice:0},'b').res).toBeTruthy()})
 it('butterfingers doubles one bet, capped by the wallet',()=>{
  const l=L(.1);l.buyItem('butter','a','b');const b=l.g.balance
  const {res}=l.bet({id:'x',game:'wheel',wager:100,choice:0},'b')
  expect(res!.wager).toBe(200);expect(l.g.balance).toBe(b-200);expect(res!.detail).toMatch(/Butterfingers/);expect(l.g.pranks).toHaveLength(0)
  const c=L(.1);c.g.pranks=[{kind:'butter',target:'b',until:null}];c.bet({id:'x',game:'wheel',wager:800,choice:0},'b');expect(c.g.balance).toBe(0)})
 it('butterfingers also works on crash',()=>{
  const l=L(.9);l.now=()=>0;l.g.pranks=[{kind:'butter',target:'b',until:null}]
  expect(l.launch({id:'x',game:'crash',wager:100,choice:0},'b').flight!.wager).toBe(200);expect(l.g.balance).toBe(800)})
 it('an invalid bet does not use up butterfingers',()=>{
  const l=L(.1);l.g.pranks=[{kind:'butter',target:'b',until:null}]
  expect(l.bet({id:'x',game:'coin',wager:100,choice:'nope'},'b').err).toBeTruthy();expect(l.g.pranks).toHaveLength(1)})
 it('a cursed coin halves winnings once, and waits for a win',()=>{
  const l=L(.999);l.g.pranks=[{kind:'curse',target:'b',until:null}]
  l.bet({id:'x',game:'wheel',wager:100,choice:0},'a');expect(l.g.pranks).toHaveLength(1)
  const b=l.g.balance;l.bet({id:'y',game:'wheel',wager:100,choice:0},'b');expect(l.g.balance-b).toBe(200);expect(l.g.pranks).toHaveLength(0)
  const m=L(.1);m.g.pranks=[{kind:'curse',target:'b',until:null}];m.bet({id:'x',game:'wheel',wager:100,choice:0},'b');expect(m.g.pranks).toHaveLength(1)})
 it('pranks end with the floor, but team charges carry over',()=>{
  const l=L(.5);l.buyItem('curse','a','b');l.buyItem('marked','a');toFloor2(l)
  expect(l.g.pranks).toEqual([]);expect(l.g.bought).toEqual({});expect(l.g.reroll).toBe(1)})})
