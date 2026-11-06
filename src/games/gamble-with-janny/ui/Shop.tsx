import {useEffect,useState} from 'react'
import {useApp} from '../../../stores/app'
import {useCasino,useGame} from '../store'
import {selfId} from '../../../multiplayer/party'
import {buyItem} from '../net/client'
import {itemCost} from '../mechanics/engine'
import {SHOP_ITEMS,type ItemId,type ShopItem} from '../mechanics/shop'
import {sfx} from '../../../utils/sound'

const ITEMS=Object.entries(SHOP_ITEMS) as [ItemId,ShopItem][]

export default function Shop({onClose}:{onClose:()=>void}){
 const g=useGame(g=>g),players=useApp(s=>s.players),toast=useCasino(s=>s.toast)
 const friends=players.filter(p=>p.id!==selfId)
 const [picked,setPicked]=useState('')
 const target=friends.some(p=>p.id===picked)?picked:friends[0]?.id
 // Once per visit: the app re-renders on every store change, so this can't sit in an effect that depends on onClose.
 useEffect(()=>{useCasino.setState({toast:''})},[])
 useEffect(()=>{
  const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()}
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[onClose])
 if(!g)return null
 const row=([id,item]:[ItemId,ShopItem])=>{
  const cost=itemCost(id,g.floor),left=item.stock-(g.bought[id]??0),noFriend=item.prank&&!target
  return <li key={id} className="upgrade">
   <span className="upgrade-icon" aria-hidden="true">{item.icon}</span>
   <div className="flex-1"><b>{item.name}</b> <small className="shop-left">{left>0?`${left} left`:'Sold out'}</small><p>{item.desc}</p></div>
   <button disabled={left<=0||g.balance<cost||noFriend} onClick={()=>{sfx.buy();useCasino.setState({toast:''});buyItem(id,item.prank?target:undefined)}} className="btn-buy">{cost.toLocaleString()}</button>
  </li>}
 return <div role="dialog" aria-modal="true" aria-label="Sketchy Shop" className="panel-backdrop">
  <div className="panel shop-panel">
   <header className="panel-head">
    <h2><span aria-hidden="true">🕵️</span> Sketchy Shop</h2>
    <div className="panel-wallet">Team wallet <b>{g.balance.toLocaleString()}</b></div>
    <button onClick={onClose} className="panel-x" aria-label="Close">✕</button>
   </header>
   <p className="shop-pitch">"Psst. It's your team's chips, not mine. Stock resets on the next floor."</p>
   {toast&&<p role="alert" className="panel-hint">{toast}</p>}
   <h3 className="shop-heading">Better odds</h3>
   <ul className="upgrade-list">{ITEMS.filter(([,i])=>!i.prank).map(row)}</ul>
   <h3 className="shop-heading">Mess with a friend <small>(they won't know it was you)</small></h3>
   {friends.length>0
    ?<div className="outside shop-targets" role="group" aria-label="Choose who to prank">{friends.map(p=><button key={p.id} onClick={()=>setPicked(p.id)} className={`pick${p.id===target?' picked':''}`}>{p.name}</button>)}</div>
    :<p className="panel-hint">Pranks need a friend in the party.</p>}
   <ul className="upgrade-list">{ITEMS.filter(([,i])=>i.prank).map(row)}</ul>
   <p className="panel-foot">Fictional chips. No cash value.</p>
  </div></div>}
