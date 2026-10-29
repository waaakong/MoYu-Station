import {createApp,h,ref} from 'vue';
import {createPinia,setActivePinia} from 'pinia';
import type {DesktopLyricsFrame,StudyRoomDesktopBridge} from '@studyroom/contracts';
import LyricsPanel from '../../src/pages/sound/LyricsPanel.vue';
import {usePlayerStore} from '../../src/stores/player';
import {useQueueStore} from '../../src/stores/queue';
import {useProvidersStore} from '../../src/stores/providers';
import {startSharedLyricsSession,sharedLyricsState,saveSharedLyricsOffset} from '../../src/audio/lyrics/sharedLyricsRuntime';
import {startDesktopLyrics} from '../../src/audio/lyrics/desktopLyrics';

const pinia=createPinia();setActivePinia(pinia);
const player=usePlayerStore(),queue=useQueueStore(),providers=useProvidersStore();
const reads=ref(0),frame=ref<DesktopLyricsFrame>(),second=ref(true),offsets=new Map<string,number>();
window.studyRoomDesktop={
  getTrackLyrics:async({trackId}: {trackId:string})=>{reads.value++;return {trackId,source:'sidecar',content:`[00:00]${trackId} · 听见风经过\n[00:01]${trackId} · 把时间留给山海\n[00:03]${trackId} · 让此刻慢一点`};},
  getTrackLyricOffset:async({trackId}:{trackId:string})=>({trackId,offsetMs:offsets.get(trackId)||0}),
  saveTrackLyricOffset:async({trackId,offsetMs}:{trackId:string;offsetMs:number})=>{offsets.set(trackId,offsetMs);},
  getDesktopMusic:async()=>({settings:{lyricsVisible:true}}),
  onDesktopMusicState:()=>()=>{},
  publishDesktopLyrics:async(value:DesktopLyricsFrame)=>{frame.value=value;}
} as unknown as StudyRoomDesktopBridge;
queue.items=['A','B'].map(id=>({id,queuedAt:1,track:{id,title:'合成曲目 '+id,artist:'验收夹具',durationMs:10000,source:{kind:'local',fileToken:'synthetic-'+id}}}));
player.playback.currentItemId='A';player.playback.positionMs=1500;player.playback.status='paused';
const stopSession=startSharedLyricsSession(),stopDesktop=startDesktopLyrics();
window.addEventListener('beforeunload',()=>{stopDesktop();stopSession();},{once:true});
const button=(label:string,click:()=>unknown)=>h('button',{type:'button',onClick:click},label);
createApp({render:()=>h('div',[
  h('h1','共享歌词时间轴'),h('small','合成数据验证，未播放真实音频、未连接账号或正式客户端。'),
  h('div',{class:'controls'},[
    button('定位到 3.5 秒',()=>{player.playback.positionMs=3500;}),
    button('回到 1.5 秒',()=>{player.playback.positionMs=1500;}),
    button('偏移延后半秒',()=>saveSharedLyricsOffset(500)),
    button('切换到 B',()=>{player.playback.currentItemId='B';}),
    button('切换合成账号',()=>{providers.identityEpoch++;}),
    button(second.value?'移除第二面板':'恢复第二面板',()=>{second.value=!second.value;})
  ]),
  h('output',{'aria-label':'共享会话状态'},`歌词读取次数：${reads.value} ／ 曲目：${sharedLyricsState.trackId||'等待'} ／ 偏移：${sharedLyricsState.offsetMs}ms ／ 当前行：${sharedLyricsState.currentIndex}`),
  h('div',{class:'panels'},[h('section',{class:'pane','aria-label':'声音页消费者'},h(LyricsPanel)),second.value?h('section',{class:'pane','aria-label':'舞台消费者'},h(LyricsPanel,{compact:true})):null]),
  h('output',{'aria-label':'桌面发布帧'},`桌面发布：${frame.value?.line||'等待'} ／ ${frame.value?.positionMs??0}ms ／ ${frame.value?.playing?'播放':'暂停'}`)
])}).use(pinia).mount('#app');
