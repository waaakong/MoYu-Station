/** Coalesce continuous input, serialize writes, and drain edits made during a write. */
export class SettingsAutosave {
  private timer?:ReturnType<typeof setTimeout>;
  private pending=false;
  private running?:Promise<void>;
  constructor(private save:()=>Promise<boolean>,private allowed:()=>boolean=()=>true){}
  request(){this.pending=true;clearTimeout(this.timer);this.timer=setTimeout(()=>{void this.flush();},120);}
  flush():Promise<void>{
    clearTimeout(this.timer);this.timer=undefined;
    if(this.running)return this.running;
    this.running=this.drain().finally(()=>{this.running=undefined;});
    return this.running;
  }
  private async drain(){
    while(this.pending&&this.allowed()){
      this.pending=false;
      if(!await this.save()){this.pending=false;break;}
    }
  }
}
