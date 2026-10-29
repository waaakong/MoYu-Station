import {reactive,watch} from 'vue';
import {usePlayerStore} from '../../stores/player';
import {useProvidersStore} from '../../stores/providers';
import {readTrackLyrics} from './trackLyricsLoader';
import {SharedLyricsSession,sameLyricsIdentity,type LyricsIdentity,type SharedLyricsState} from './sharedLyricsSession';
import {StageClock} from './stageClock';

export const sharedLyricsState=reactive<SharedLyricsState>({lines:[],currentIndex:-1,offsetMs:0,loading:false});
export const sharedLyricsControls=reactive({savingOffset:false,offsetError:''});
export const lyricsStageClock=new StageClock();
let active: {session:SharedLyricsSession;reload:()=>Promise<void>;offsetTicket:number;stop:()=>void}|undefined;

/** Started once by App, not by an individual lyrics consumer. */
export function startSharedLyricsSession():()=>void {
  const bridge=window.studyRoomDesktop;
  if(active)return active.stop;
  if(!bridge)return ()=>{};
  const player=usePlayerStore(),providers=useProvidersStore(),session=new SharedLyricsSession();
  const owner={session,reload,offsetTicket:0,stop:()=>{}};active=owner;
  const stopState=session.subscribe(state=>Object.assign(sharedLyricsState,state));
  function identity():LyricsIdentity|undefined {
    const track=player.currentItem?.track;
    return track?{trackId:track.id,sourceKey:JSON.stringify(track.source),accountEpoch:providers.identityEpoch}:undefined;
  }
  async function reload():Promise<void> {
    const track=player.currentItem?.track,key=identity();
    if(!track||!key){session.invalidate();return;}
    await session.setTrack(key,()=>readTrackLyrics(track,bridge!),async()=>(await bridge!.getTrackLyricOffset({trackId:track.id})).offsetMs);
  }
  const stopTrack=watch(()=>[player.currentItem?.track.id,JSON.stringify(player.currentItem?.track.source),providers.identityEpoch],()=>{
    owner.offsetTicket++;sharedLyricsControls.savingOffset=false;sharedLyricsControls.offsetError='';
    session.invalidate();lyricsStageClock.reset();void reload();
  },{immediate:true,flush:'sync'});
  const observe=()=>{
    lyricsStageClock.observe({positionMs:player.playback.positionMs,playing:player.playback.status==='playing'&&!player.buffering,rate:1,observedAt:performance.now()});
    session.setPosition(player.playback.positionMs);
  };
  const stopTime=watch(()=>[player.playback.positionMs,player.playback.status,player.buffering,player.currentItem?.track.id],observe,{immediate:true,flush:'sync'});
  const refreshOffset=async()=>{
    const key=identity();
    if(!key||sharedLyricsControls.savingOffset)return;
    const ticket=++owner.offsetTicket;
    try{
      const result=await bridge.getTrackLyricOffset({trackId:key.trackId});
      if(active===owner&&ticket===owner.offsetTicket)session.setOffset(key,result.offsetMs);
    }catch{/* An external refresh cannot replace a known good offset with an invented value. */}
  };
  window.addEventListener('studyroom:lyrics-offset',refreshOffset);
  owner.stop=()=>{
    if(active!==owner)return;
    active=undefined;owner.offsetTicket++;stopTrack();stopTime();stopState();session.dispose();lyricsStageClock.reset();
    Object.assign(sharedLyricsState,session.snapshot());sharedLyricsControls.savingOffset=false;sharedLyricsControls.offsetError='';
    window.removeEventListener('studyroom:lyrics-offset',refreshOffset);
  };
  return owner.stop;
}
export async function retrySharedLyrics():Promise<void> {
  if(!active)return;
  const owner=active;owner.offsetTicket++;sharedLyricsControls.savingOffset=false;sharedLyricsControls.offsetError='';
  owner.session.invalidate();await owner.reload();
}
export async function saveSharedLyricsOffset(delta:number,reset=false):Promise<boolean> {
  const owner=active,key=sharedLyricsState.identity,bridge=window.studyRoomDesktop;
  if(!owner||!key||sharedLyricsControls.savingOffset||!bridge?.saveTrackLyricOffset)return false;
  const before=sharedLyricsState.offsetMs,ticket=++owner.offsetTicket;
  const offsetMs=owner.session.setOffset(key,reset?0:before+delta);
  if(offsetMs===undefined)return false;
  sharedLyricsControls.savingOffset=true;sharedLyricsControls.offsetError='';
  const current=()=>active===owner&&ticket===owner.offsetTicket&&sameLyricsIdentity(sharedLyricsState.identity,key);
  try{
    await bridge.saveTrackLyricOffset({trackId:key.trackId,offsetMs});return current();
  }catch{
    if(current()){owner.session.setOffset(key,before);sharedLyricsControls.offsetError='歌词偏移没有保存，已恢复原偏移';}
    return false;
  }finally{if(current())sharedLyricsControls.savingOffset=false;}
}
