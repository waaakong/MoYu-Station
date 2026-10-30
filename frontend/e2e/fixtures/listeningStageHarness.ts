import '../../src/styles/tokens.css';
import '../../src/styles/glass.css';
import {createApp,h,ref} from 'vue';
import {createPinia,setActivePinia} from 'pinia';
import type {DesktopMusicSettings,StudyRoomDesktopBridge} from '@studyroom/contracts';
import previewCover from './assets/approved-stage-cover.jpg';
import ListeningStage from '../../src/pages/sound/ListeningStage.vue';
import AppSelect from '../../src/components/controls/AppSelect.vue';
import BrandMark from '../../src/components/icons/BrandMark.vue';
import AppIcon from '../../src/components/icons/AppIcon.vue';
import {usePlayerStore} from '../../src/stores/player';
import {useQueueStore} from '../../src/stores/queue';
import {useSoundStore,sanitizeSoundSettings} from '../../src/stores/sound';
import {useShellStore} from '../../src/stores/shell';
import {startSharedLyricsSession,retrySharedLyrics} from '../../src/audio/lyrics/sharedLyricsRuntime';
import {setMotionReduced} from '../../src/motion/runtime';
const pinia=createPinia();setActivePinia(pinia);
const player=usePlayerStore(),queue=useQueueStore(),sound=useSoundStore(),shell=useShellStore();
const opened=ref(true),note=ref('仅合成歌词、无真实音频。'),reads=ref(0);
const running=ref(false);let clock:ReturnType<typeof setInterval>|undefined;
let failed=false,empty=false,long=false,saveFails=false;
const text=()=>long?'这是一段用于检查长句换行与布局边界的合成歌词，'.repeat(12):'把时间留给山海';
let desktopSettings:DesktopMusicSettings={shortcutsEnabled:false,shortcuts:{'play-pause':'MediaPlayPause',next:'MediaNextTrack',previous:'MediaPreviousTrack'},lyricsVisible:false,lyricsLocked:false,lyricsStyle:{fontSize:38,highlight:'#d8e6ad',base:'#aab7a3',rows:2,fontFamily:'system',opacity:.85,smoothScroll:true},wheel:{enabled:true,accelerator:'Control+Alt',allowFullscreen:false,slots:['play-pause','next','focus','sound','space','lyrics','mute','previous']}};
window.studyRoomDesktop={
  getDesktopMusic:async()=>({settings:structuredClone(desktopSettings)}),
  saveDesktopMusic:async(settings:DesktopMusicSettings)=>{desktopSettings=structuredClone(settings);return {settings:structuredClone(desktopSettings)};},
  setDesktopWheelRecording:async()=>{},
  resetDesktopLyricsPosition:async()=>{},
  getTrackLyrics:async({trackId}:{trackId:string})=>{reads.value++;if(failed)throw new Error('synthetic read failure');return empty?undefined:{trackId,source:'sidecar',content:`[00:00]听见风经过\n[00:02]${text()}\n[00:04]让此刻慢一点\n[00:06]天边的云轻轻散开\n[00:08]又一个安静的午后`};},
  getTrackLyricOffset:async()=>({offsetMs:0}),
  saveTrackLyricOffset:async()=>{},
  saveSoundSettings:async({settings}:{settings:unknown})=>{if(saveFails)throw new Error('synthetic save failure');localStorage.setItem('moyu-stage-fixture-v2',JSON.stringify(settings));note.value='合成偏好已保存';}
} as unknown as StudyRoomDesktopBridge;
try{sound.settings=sanitizeSoundSettings(JSON.parse(localStorage.getItem('moyu-stage-fixture-v2')||'null'));}catch{}
queue.items=[{id:'fixture',queuedAt:1,track:{id:'fixture',title:'山海之间',artist:'墨屿 · 合成验收',artworkUrl:previewCover,durationMs:10000,source:{kind:'local',fileToken:'synthetic-only'}}}];
player.playback.durationMs=10000;player.playback.currentItemId='fixture';player.playback.positionMs=2500;player.playback.status='paused';
const stop=startSharedLyricsSession();window.addEventListener('beforeunload',()=>{stop();clearInterval(clock);},{once:true});
const button=(label:string,click:()=>unknown)=>h('button',{type:'button',onClick:click},label);
const referenceView=new URLSearchParams(location.search).has('reference');
createApp({render:()=>h('div',{class:{'reference-view':referenceView}},[
  h('div',{class:'fixture'},[
    h('span','产品组件验收 · 合成数据'),
    button('下一句',()=>{player.playback.positionMs=Math.min(9500,player.playback.positionMs+2000);}),
    button(running.value?'暂停合成时钟':'播放合成时钟',()=>{running.value=!running.value;clearInterval(clock);player.playback.status=running.value?'playing':'paused';if(running.value)clock=setInterval(()=>{player.playback.positionMs=player.playback.positionMs>=9500?0:player.playback.positionMs+200;},200);}),
    button('跳回第2秒',()=>{player.playback.positionMs=2500;}),
    button('长句',()=>{long=!long;void retrySharedLyrics();}),
    button('无歌词',()=>{empty=!empty;void retrySharedLyrics();}),
    button('读取故障',()=>{failed=!failed;void retrySharedLyrics();}),
    button('保存故障',()=>{saveFails=!saveFails;note.value=saveFails?'合成保存故障已启用':'保存已恢复';}),
    button('减少动态',()=>{shell.preferences.reducedMotion=true;setMotionReduced(true);}),
    button(opened.value?'关闭舞台':'重新打开舞台',()=>{opened.value=!opened.value;}),
    h('output',`${note.value} ／ 歌词读取${reads.value}次`)
  ]),opened.value?h('div',{class:'stage-host'},h(ListeningStage,{onClose:()=>{opened.value=false;}})):null
])}).use(pinia).component('AppSelect',AppSelect).component('BrandMark',BrandMark).component('AppIcon',AppIcon).mount('#app');
