import type {TrackLyrics} from '@studyroom/contracts';
import {LyricsController,type LyricsState} from './lyricsController';

export interface LyricsIdentity {
  trackId:string;
  sourceKey:string;
  accountEpoch:number;
}
export interface SharedLyricsState extends LyricsState {
  identity?:LyricsIdentity;
  error?:string;
}
export function sameLyricsIdentity(a?:LyricsIdentity,b?:LyricsIdentity):boolean {
  return !!a && !!b && a.trackId===b.trackId && a.sourceKey===b.sourceKey && a.accountEpoch===b.accountEpoch;
}

/** Owns one current read. Consumers never own or clear each other's controller. */
export class SharedLyricsSession {
  private controller=new LyricsController();
  private listeners=new Set<(state:SharedLyricsState)=>void>();
  private identity?:LyricsIdentity;
  private error?:string;
  private pending?:Promise<void>;
  private generation=0;
  private positionMs=0;
  private publishedIndex=-1;
  private offsetRevision=0;
  private disposed=false;

  snapshot():SharedLyricsState {
    return {...this.controller.snapshot(),identity:this.identity?{...this.identity}:undefined,error:this.error};
  }
  subscribe(listener:(state:SharedLyricsState)=>void):()=>void {
    if(this.disposed)return ()=>{};
    this.listeners.add(listener);listener(this.snapshot());
    return ()=>{this.listeners.delete(listener);};
  }
  setTrack(identity:LyricsIdentity,loadLyrics:()=>Promise<TrackLyrics|undefined>,loadOffset:()=>Promise<number>):Promise<void> {
    if(this.disposed)return Promise.resolve();
    if(sameLyricsIdentity(this.identity,identity)&&!this.error)return this.pending??Promise.resolve();
    const ticket=++this.generation;
    const offsetRevision=this.offsetRevision;
    this.identity={...identity};this.error=undefined;
    const load=this.controller.load(identity.trackId,loadLyrics,loadOffset);
    this.emit();
    const pending=load.then(()=>{
      if(this.disposed||ticket!==this.generation)return;
      if(offsetRevision!==this.offsetRevision)this.controller.setOffset(this.latestOffset);
      this.controller.update(this.positionMs);this.emit();
    },()=>{
      if(this.disposed||ticket!==this.generation)return;
      this.error='歌词读取失败或超时。';this.emit();
    }).finally(()=>{if(ticket===this.generation)this.pending=undefined;});
    this.pending=pending;return pending;
  }
  setPosition(positionMs:number):void {
    if(this.disposed)return;
    this.positionMs=Number.isFinite(positionMs)?Math.max(0,positionMs):0;
    if(this.controller.update(this.positionMs)!==this.publishedIndex)this.emit();
  }
  private latestOffset=0;
  setOffset(identity:LyricsIdentity,offsetMs:number):number|undefined {
    if(this.disposed||!sameLyricsIdentity(this.identity,identity)||!Number.isFinite(offsetMs))return;
    const value=this.controller.setOffset(offsetMs);this.offsetRevision++;this.latestOffset=value;
    this.controller.update(this.positionMs);this.emit();return value;
  }
  invalidate():void {
    this.generation++;this.identity=undefined;this.error=undefined;this.pending=undefined;this.latestOffset=0;
    this.controller.clear();this.emit();
  }
  dispose():void {
    if(this.disposed)return;
    this.disposed=true;this.listeners.clear();this.invalidate();
  }
  private emit():void {
    if(this.disposed)return;
    const state=this.snapshot();this.publishedIndex=state.currentIndex;
    for(const listener of this.listeners)listener(state);
  }
}
