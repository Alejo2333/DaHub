import {useState} from 'react'
import {categories,comingSoon,games} from '../games/registry'
import type {GameModule} from '../types/game'

const players=(g:GameModule)=>g.minPlayers===g.maxPlayers?`${g.maxPlayers} players`:`${g.minPlayers}–${g.maxPlayers} players`

function GameCard({game,onOpen}:{game:GameModule;onOpen:(id:string)=>void}){
 return <a href={`/game/${game.id}`} onClick={e=>{e.preventDefault();onOpen(game.id)}} className="game-card">
  <span className="thumb"><img src={game.cover} alt=""/><span className="thumb-play" aria-hidden="true">▶</span></span>
  <span className="game-card-body"><b>{game.title}</b><small>{game.category} · {players(game)}</small></span></a>}

export default function Home({search,onOpen}:{search:string;onOpen:(id:string)=>void}){
 const [category,setCategory]=useState('All')
 const q=search.trim().toLowerCase()
 const inCategory=(c:string)=>category==='All'||category===c
 const matches=(...words:string[])=>!q||words.some(w=>w.toLowerCase().includes(q))
 const shown=games.filter(g=>inCategory(g.category)&&matches(g.title,g.category,g.tagline,...g.tags))
 const soon=comingSoon.filter(c=>inCategory(c.category)&&matches(c.category))
 const featured=games[0]
 const browsing=!q&&category==='All'
 return <>
  {browsing&&featured&&<section className="featured" aria-label="Featured game">
   <img src={featured.cover} alt="" className="featured-art"/>
   <div className="featured-copy">
    <p className="eyebrow">Featured</p>
    <h1>{featured.title}</h1>
    <p>{featured.tagline}</p>
    <div className="tag-row">{featured.tags.map(t=><span key={t} className="tag">{t}</span>)}</div>
    <button onClick={()=>onOpen(featured.id)} className="btn-primary btn-fit">Play now</button>
   </div></section>}
  <div className="chip-row" role="group" aria-label="Filter by category">
   {['All',...categories].map(c=><button key={c} onClick={()=>setCategory(c)} aria-pressed={category===c} className={`cat-chip${category===c?' on':''}`}>{c}</button>)}
  </div>
  <section aria-label="Games">
   <h2 className="section-title">{q?`Results for “${search.trim()}”`:category==='All'?'All games':category}</h2>
   {shown.length+soon.length===0
    ?<p className="empty">No games found. Try another name or category.</p>
    :<div className="game-grid">
     {shown.map(g=><GameCard key={g.id} game={g} onOpen={onOpen}/>)}
     {soon.map(c=><div key={c.category} className="game-card soon-card">
      <span className="thumb soon-thumb" aria-hidden="true">{c.icon}</span>
      <span className="game-card-body"><b>{c.category}</b><small>Coming soon</small></span></div>)}
    </div>}
  </section></>}
