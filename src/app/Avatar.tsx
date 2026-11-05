import {hueOf} from '../utils/color'
/** A round poker-chip avatar with the player's initial, in the same colour as their character. */
export default function Avatar({id,name,size=44}:{id:string;name:string;size?:number}){
 const hue=hueOf(id)
 return <span className="avatar" aria-hidden="true" style={{width:size,height:size,fontSize:size*.45,background:`hsl(${hue} 62% 44%)`,boxShadow:`0 0 0 ${Math.max(2,size*.07)}px hsl(${hue} 62% 28%)`}}>{(name.trim()[0]??'?').toUpperCase()}</span>}
