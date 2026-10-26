import {reactive,watch} from 'vue';
import type {DesktopMusicSettings,DesktopMusicState} from '@studyroom/contracts';
import {usePlayerStore} from '../../stores/player';
import {useProvidersStore} from '../../stores/providers';
import {LyricsController} from './lyricsController';
import {readTrackLyrics} from './trackLyricsLoader';
export const desktopMusicState=reactive<{state:DesktopMusicState|null;error:string;busy:boolean}>({state:null,error:'',busy:false});
export async function saveDesktopMusic(settings:DesktopMusicSettings){
  const bridge=window.studyRoomDesktop;if(!bridge?.saveDesktopMusic||desktopMusicState.busy)return;
  desktopMusicState.busy=true;desktopMusicState.error='';
  try{desktopMusicState.state=await bridge.saveDesktopMusic(settings);}catch(error){desktopMusicState.error=error instanceof Error?error.message:'桌面音乐设置未保存。';}
  finally{desktopMusicState.busy=false;}
}
export function startDesktopLyrics(){
  const bridge=window.studyRoomDesktop;if(!bridge?.getDesktopMusic)return ()=>{};
  const player=usePlayerStore(),providers=useProvidersStore(),controller=new LyricsController();
  let epoch=0,disposed=false,failed=false,lastFrame='',lastSentAt=0,lastPosition=0,lastLine=-1,lastStatus='';
  function publish(){
    if(disposed||!desktopMusicState.state?.settings.lyricsVisible)return;
    const state=controller.snapshot(),track=player.currentItem?.track,index=controller.update(player.playback.positionMs),positionMs=Math.max(0,player.playback.positionMs-state.offsetMs);
    const now=performance.now(),jump=Math.abs(positionMs-lastPosition)>1200||Math.abs(index-lastLine)>1;
    if(now-lastSentAt<100&&!jump&&lastStatus===player.playback.status&&lastLine===index)return;
    const current=state.lines[index],line=state.loading?'正在读取歌词…':failed?'歌词读取失败':current?.text||(state.lines.length?'等待歌词开始':'暂无歌词');
    const trackKey=track?`${track.id}:${epoch}`:'';
    const frame={title:track?.title||'墨屿 · 桌面歌词',line,nextLine:state.lines[index+1]?.text||'',status:player.playback.status==='playing'?'播放中':player.playback.status==='paused'?'已暂停':'播放已停止',trackKey,lineKey:`${trackKey}:${index}`,positionMs,playing:player.playback.status==='playing',words:current?.text===line?current?.words:undefined,jump};
    const json=JSON.stringify(frame);if(json===lastFrame)return;lastFrame=json;lastSentAt=now;lastPosition=positionMs;lastLine=index;lastStatus=player.playback.status;
    void bridge!.publishDesktopLyrics(frame).catch(()=>{lastFrame='';desktopMusicState.error='桌面歌词未更新，请关闭浮窗后重试。';});
  }
  async function load(){
    const ticket=++epoch,track=player.currentItem?.track;controller.clear();failed=false;lastFrame='';lastSentAt=0;lastPosition=0;lastLine=-1;
    if(!desktopMusicState.state?.settings.lyricsVisible||!track){publish();return;}
    const pending=controller.load(track.id,()=>readTrackLyrics(track,bridge!),async()=>(await bridge!.getTrackLyricOffset({trackId:track.id})).offsetMs);publish();
    try{await pending;}catch{if(ticket===epoch)failed=true;}
    if(ticket===epoch&&!disposed)publish();
  }
  const stopSettings=bridge.onDesktopMusicState(state=>{desktopMusicState.state=state;});
  void bridge.getDesktopMusic().then(state=>{if(!disposed)desktopMusicState.state=state;}).catch(()=>{desktopMusicState.error='无法读取桌面音乐设置。';});
  const stopTrack=watch(()=>[player.currentItem?.track.id,JSON.stringify(player.currentItem?.track.source),providers.identityEpoch,desktopMusicState.state?.settings.lyricsVisible],()=>{void load();},{immediate:true});
  const stopTime=watch(()=>[player.playback.positionMs,player.playback.status],publish);
  const offset=()=>{void load();};window.addEventListener('studyroom:lyrics-offset',offset);
  return ()=>{disposed=true;epoch++;controller.clear();stopTrack();stopTime();stopSettings();window.removeEventListener('studyroom:lyrics-offset',offset);};
}
