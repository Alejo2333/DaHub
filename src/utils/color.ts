/** A stable hue (0-359) for a player id or name, so each player keeps their colour everywhere. */
export const hueOf=(s:string)=>{let h=0;for(const ch of s)h=(h*31+ch.charCodeAt(0))%360;return h}
