import type {DesktopMusicSettings} from '@studyroom/contracts';
const copy=<T>(value:T):T=>value===undefined?value:JSON.parse(JSON.stringify(value));
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function mergeUnedited(current:any,base:any,incoming:any):any {
  if(same(current,base))return copy(incoming);
  if(current&&base&&incoming&&typeof current==='object'&&!Array.isArray(current)){
    return Object.fromEntries([...new Set([...Object.keys(current),...Object.keys(incoming)])]
      .map(key=>[key,mergeUnedited(current[key],base[key],incoming[key])]));
  }
  return copy(current);
}

/** Local edits win; server echoes only update fields that have not been edited. */
export class DesktopSettingsDraft {
  draft?:DesktopMusicSettings;
  private baseline?:DesktopMusicSettings;
  busy=false;error='';private alive=true;
  get dirty(){return !same(this.draft,this.baseline);}
  receive(settings:DesktopMusicSettings){
    if(!this.alive||this.busy)return;
    this.draft=this.draft?mergeUnedited(this.draft,this.baseline,settings):copy(settings);
    this.baseline=copy(settings);
  }
  async save(persist:(settings:DesktopMusicSettings)=>Promise<DesktopMusicSettings>):Promise<boolean>{
    if(!this.alive||this.busy||!this.draft)return false;
    this.busy=true;this.error='';const submitted=copy(this.draft);
    try{
      const saved=await persist(submitted);if(!this.alive)return false;
      this.draft=mergeUnedited(this.draft,submitted,saved);this.baseline=copy(saved);return true;
    }catch(error){if(this.alive)this.error=error instanceof Error?error.message:'设置未保存，请重试。';return false;}
    finally{if(this.alive)this.busy=false;}
  }
  dispose(){this.alive=false;}
}
