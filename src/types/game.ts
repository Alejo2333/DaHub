import type {ComponentType,LazyExoticComponent} from 'react'
/** Everything the hub needs to list a game, show its page and start it. */
export interface GameModule{
 id:string;title:string;tagline:string;cover:string
 minPlayers:number;maxPlayers:number
 /** Shown as a filter on the home page. */
 category:string
 tags:string[]
 description:string
 howTo:string[]
 controls:string[]
 /** Optional small print on the game's page. */
 notice?:string
 /** Optional personal best, such as "Best: floor 3". */
 best?:()=>string|null
 Component:LazyExoticComponent<ComponentType>
}
