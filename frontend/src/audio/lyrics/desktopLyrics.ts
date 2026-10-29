import {reactive,watch} from 'vue';
import type {DesktopMusicSettings,DesktopMusicState} from '@studyroom/contracts';
import {usePlayerStore} from '../../stores/player';
import {sharedLyricsState} from './sharedLyricsRuntime';
export const desktopMusicState=reactive<{state:DesktopMusicState|null;error:string;busy:boolean}>({state:null,error:'',busy:false});
export async function saveDesktopMusic(settings:DesktopMusicSettings){
  const bridge=window.studyRoomDesktop;if(!bridge?.saveDesktopMusic||desktopMusicState.busy)return;
  desktopMusicState.busy=true;desktopMusicState.error='';
  try{const state=await bridge.saveDesktopMusic(settings);desktopMusicState.state=state;return state;}catch(error){desktopMusicState.error=error instanceof Error?error.message:'桌面音乐设置未保存。';}
  finally{desktopMusicState.busy=false;}
}
export function startDesktopLyrics(openSettings?:()=>void){
  const bridge=window.studyRoomDesktop;if(!bridge?.getDesktopMusic)return ()=>{};
  const player=usePlayerStore();
  let disposed=false,lastFrame='',lastSentAt=0,lastPosition=0,lastLine=-1,lastStatus='',lastTrack='',identityKey='',epoch=0;
  function publish(force=false){
    if(disposed||!desktopMusicState.state?.settings.lyricsVisible)return;
    const state=sharedLyricsState,track=player.currentItem?.track,index=state.currentIndex,positionMs=Math.max(0,player.playback.positionMs-state.offsetMs);
    const identity=JSON.stringify(state.identity);
    if(identity!==identityKey){identityKey=identity;epoch++;}
    const trackKey=state.identity?`${state.identity.trackId}:${epoch}`:'';
    const now=performance.now(),jump=trackKey!==lastTrack||Math.abs(positionMs-lastPosition)>1200||Math.abs(index-lastLine)>1;
    if(!force&&now-lastSentAt<100&&!jump&&lastStatus===player.playback.status&&lastLine===index)return;
    const current=state.lines[index],line=state.loading?'正在读取歌词…':state.error?'歌词读取失败':current?.text||(state.lines.length?'等待歌词开始':'暂无歌词');
    const frame={title:track?.title||'墨屿 · 桌面歌词',line,nextLine:state.lines[index+1]?.text||'',status:player.buffering?'缓冲中':player.playback.status==='playing'?'播放中':player.playback.status==='paused'?'已暂停':'播放已停止',trackKey,lineKey:`${trackKey}:${index}`,positionMs,playing:player.playback.status==='playing'&&!player.buffering,words:current?.text===line?current?.words:undefined,jump};
    const json=JSON.stringify(frame);if(json===lastFrame)return;lastFrame=json;lastSentAt=now;lastPosition=positionMs;lastLine=index;lastStatus=player.playback.status;lastTrack=trackKey;
    void bridge!.publishDesktopLyrics(frame).catch(()=>{if(disposed||lastFrame!==json)return;lastFrame='';desktopMusicState.error='桌面歌词未更新，请关闭浮窗后重试。';});
  }
  const stopSettings=bridge.onDesktopMusicState(state=>{if(!disposed)desktopMusicState.state=state;});
  const stopSettingsOpen=bridge.onDesktopLyricsSettingsOpen?.(()=>{if(!disposed)openSettings?.();});
  void bridge.getDesktopMusic().then(state=>{if(!disposed)desktopMusicState.state=state;}).catch(()=>{if(!disposed)desktopMusicState.error='无法读取桌面音乐设置。';});
  const stopTime=watch(()=>player.playback.positionMs,()=>publish());
  const stopPlayback=watch(()=>[player.playback.status,player.buffering],()=>publish(true));
  const stopState=watch(()=>[sharedLyricsState.lines,sharedLyricsState.currentIndex,sharedLyricsState.loading,sharedLyricsState.error,sharedLyricsState.offsetMs,sharedLyricsState.identity,desktopMusicState.state?.settings.lyricsVisible],()=>publish(true),{immediate:true});
  return ()=>{disposed=true;stopTime();stopPlayback();stopState();stopSettings();stopSettingsOpen?.();};
}
