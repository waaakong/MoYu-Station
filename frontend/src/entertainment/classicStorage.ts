import {isClassicGame,type ClassicGame,type ClassicGameId} from '@studyroom/contracts';
import { registerQuitSaver } from '../window/quitPreparation';
const key=(id:ClassicGameId)=>`studyroom-entertainment-v1:${id}`;
type Stamp={generation:string;revision:number}|null;
/** One mounted game owns a web lock; all writes (including new rounds) are serialized and use CAS. */
export class ClassicStorage {
  writable=false;
  reason='';
  private expected:Stamp=null;
  private chain:Promise<void>=Promise.resolve();
  private release?:()=>void;
  private closed=false;
  private fault=false;
  private unregisterQuit:()=>void;
  constructor(readonly id:ClassicGameId){
    this.unregisterQuit=registerQuitSaver(async()=>{await this.chain;if(this.fault)throw new Error('游戏保存异常，请返回游戏检查。');});
  }
  async open():Promise<ClassicGame|undefined>{
    if(window.studyRoomDesktop)this.writable=true;
    else if(navigator.locks){
      let ready!:()=>void;const acquired=new Promise<void>(resolve=>ready=resolve);
      void navigator.locks.request(`studyroom-classic:${this.id}`,{mode:'exclusive',ifAvailable:true},async lock=>{
        if(!lock || this.closed){this.reason='其他标签页正在使用此游戏；当前仅内存试玩，不保存。';ready();return;}
        this.writable=true;await new Promise<void>(resolve=>{this.release=resolve;ready();});this.writable=false;
      }).catch(()=>{this.reason='无法取得独占写锁；当前仅内存试玩，不保存。';ready();});await acquired;
    }else this.reason='浏览器不支持安全写锁；当前仅内存试玩，不保存。';
    try{
      const raw=window.studyRoomDesktop?(await window.studyRoomDesktop.readEntertainmentState({toolId:this.id}))?.state:this.readWeb();
      if(raw===undefined)return;
      if(!isClassicGame(raw) || raw.toolId!==this.id)throw new Error('坏档或未知版本');
      this.expected={generation:raw.generation,revision:raw.revision};return raw;
    }catch(error){this.writable=false;this.fault=true;this.reason='原存档不可读取或版本不受支持，已保留原记录。当前仅内存试玩。';return;}
  }
  private readWeb():unknown{const text=localStorage.getItem(key(this.id));if(text===null)return; if(new TextEncoder().encode(text).length>32768)throw new Error('GAME_TOO_LARGE');return JSON.parse(text);}
  save(value:ClassicGame):Promise<void>{
    if(this.closed)return Promise.reject(new Error('GAME_SESSION_CLOSED'));
    if(!this.writable)return Promise.resolve();
    const snapshot=JSON.parse(JSON.stringify(value)) as ClassicGame;
    const operation=this.chain.then(async()=>{
      if(this.fault)throw new Error('GAME_SAVE_BLOCKED');
      if(!isClassicGame(snapshot) || snapshot.toolId!==this.id)throw new Error('GAME_INVALID');
      if(window.studyRoomDesktop)await window.studyRoomDesktop.saveEntertainmentState({toolId:this.id,state:snapshot,expected:this.expected});
      else{
        const before=this.readWeb();
        if(before!==undefined && (!isClassicGame(before) || !this.expected || before.generation!==this.expected.generation || before.revision!==this.expected.revision)
          || before===undefined && this.expected!==null)throw new Error('GAME_REVISION_CONFLICT');
        if(this.expected && snapshot.generation===this.expected.generation && snapshot.revision<=this.expected.revision
          || (!this.expected || snapshot.generation!==this.expected.generation) && snapshot.revision!==0)throw new Error('GAME_REVISION_CONFLICT');
        localStorage.setItem(key(this.id),JSON.stringify(snapshot));
      }
      this.expected={generation:snapshot.generation,revision:snapshot.revision};
    });
    this.chain=operation.catch(()=>{this.fault=true;this.writable=false;this.reason='保存失败或写入冲突。原存档未覆盖；请退出此游戏后重新读取。';});
    return operation;
  }
  async close(){this.closed=true;await this.chain;this.unregisterQuit();this.release?.();this.release=undefined;this.writable=false;}
}
