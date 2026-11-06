import type {GameModule} from '../types/game'

export default function GamePage({game,canPlay,onCreate,onBack}:{game:GameModule;canPlay:boolean;onCreate:()=>void;onBack:()=>void}){
 const best=game.best?.()
 return <article className="game-page">
  <button onClick={onBack} className="back-link">← All games</button>
  <div className="game-page-top">
   <img src={game.cover} alt={`${game.title} cover`} className="game-page-art"/>
   <div className="game-page-info">
    <p className="eyebrow">{game.category}</p>
    <h1>{game.title}</h1>
    <p className="game-page-desc">{game.description}</p>
    <div className="tag-row">
     <span className="tag">{game.minPlayers}–{game.maxPlayers} players</span>
     {game.tags.map(t=><span key={t} className="tag">{t}</span>)}
     {best&&<span className="tag tag-best">{best}</span>}
    </div>
    <button onClick={onCreate} disabled={!canPlay} className="btn-primary btn-fit">Create party</button>
    <p className="hint">{canPlay?'You get a room code and invite link to share.'+(game.minPlayers<=1?' You can also play alone.':''):'Enter a nickname at the top of the page to play.'}</p>
   </div></div>
  <div className="game-page-details">
   <section><h2 className="section-title">How to play</h2><ol className="how-list">{game.howTo.map(s=><li key={s}>{s}</li>)}</ol></section>
   <section><h2 className="section-title">Controls</h2><ul className="control-list">{game.controls.map(s=><li key={s}>{s}</li>)}</ul></section>
  </div>
  {game.notice&&<p className="hint">{game.notice}</p>}
 </article>}
