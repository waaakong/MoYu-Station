/** A single cancellable RAF owner; rendering quality is a ceiling, not a claim about FPS. */
export class BackgroundLoop {
  private id?:number;private disposed=false;private fps=40;private auto=true;private count=0;private total=0;private previous=-Infinity;
  constructor(private draw:(now:number,fps:number)=>void,private request:(cb:FrameRequestCallback)=>number=cb=>globalThis.requestAnimationFrame(cb),private cancel:(id:number)=>void=id=>globalThis.cancelAnimationFrame(id),private now:()=>number=()=>performance.now()){}
  configure(quality:'auto'|24|40|60){this.auto=quality==='auto';this.fps=this.auto?40:quality as number;this.count=this.total=0;}
  start(){if(this.disposed||this.id!==undefined)return;this.previous=-Infinity;this.id=this.request(this.tick);}
  stop(){if(this.id!==undefined)this.cancel(this.id);this.id=undefined;}
  private tick=(time:number)=>{this.id=undefined;if(this.disposed)return;if(time-this.previous>=1000/this.fps){this.previous=time;const start=this.now();try{this.draw(time,this.fps);}catch{this.stop();return;}if(this.auto){this.total+=Math.max(0,this.now()-start);if(++this.count===45){if(this.total/this.count>1000/this.fps*.8)this.fps=24;this.count=this.total=0;}}}this.id=this.request(this.tick);};
  dispose(){this.stop();this.disposed=true;}
}
