import {Component,type ReactNode} from 'react'
/** Shows a way back instead of a blank page if something fails while rendering. */
export default class ErrorBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false}
 static getDerivedStateFromError(){return{failed:true}}
 render(){
  if(!this.state.failed)return this.props.children
  return <div className="grid min-h-screen place-items-center p-6 text-center"><div>
   <h1 className="neon-title text-3xl">The house had a problem</h1>
   <p className="my-3 text-purple-200/80">Something went wrong, and this session can't continue.</p>
   <button onClick={()=>location.assign('/')} className="btn-primary">Back to the hub</button>
  </div></div>}}
