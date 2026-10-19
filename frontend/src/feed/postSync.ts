interface Dependencies {
  known:(id:string)=>boolean;busy:(id:string)=>boolean;revision:(id:string)=>number;
  fetch:(id:string)=>Promise<unknown>;apply:(id:string,result:any)=>void;error:()=>void;
}
/** Coalesced invalidation; events during reads trigger another read, never merge a stale snapshot. */
export class FeedPostSync {
  private active=false;private epoch=0;private dirty=new Set<string>();private timer?:ReturnType<typeof setTimeout>;private running=false;
  constructor(private deps:Dependencies){}
  start(){this.active=true;}
  stop(){this.active=false;this.epoch++;this.dirty.clear();clearTimeout(this.timer);}
  invalidate(id:unknown){if(!this.active||typeof id!=='string'||!/^\d{1,19}$/.test(id)||!this.deps.known(id))return;this.dirty.add(id);this.schedule();}
  private schedule(){clearTimeout(this.timer);if(this.active)this.timer=setTimeout(()=>{void this.drain();},250);}
  private async drain(){
    if(this.running||!this.active)return;this.running=true;const epoch=this.epoch;
    try{for(const id of [...this.dirty].slice(0,30)){
      if(!this.active||epoch!==this.epoch)return;
      if(this.deps.busy(id))continue;this.dirty.delete(id);const revision=this.deps.revision(id);
      try{const value=await this.deps.fetch(id);
        if(!this.active||epoch!==this.epoch)return;
        if(this.dirty.has(id)||this.deps.busy(id)||revision!==this.deps.revision(id)){this.dirty.add(id);continue;}
        this.deps.apply(id,value);
      }catch{if(this.active&&epoch===this.epoch)this.deps.error();}
    }}finally{this.running=false;if(this.active&&this.dirty.size)this.schedule();}
  }
}
