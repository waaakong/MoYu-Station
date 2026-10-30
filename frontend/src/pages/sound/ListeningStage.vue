<template>
  <section ref="stage" class="listening-stage" :class="[`listening-stage--${tone}`,`listening-stage--${composition}`,{'is-pure':pure,'listening-stage--native':desktop,'sr-reduced-transparency':shell.transparencyReduced}]" aria-label="完整音乐视觉模式" @keydown="onKeydown" @click="closeAccountOutside" @load.capture="captureCover">
    <div class="ambient" aria-hidden="true"></div><StageBackgroundCanvas ref="backgroundCanvas" :tone="tone" :preferences="preferences" :playing="player.playback.status==='playing' && !player.buffering" :position-ms="player.playback.positionMs" :ambient-playing="sound.settings.ambientTracks.some(t=>t.status==='playing')" :reduced="shell.motionReduced||sound.lowPerformance" :pure="composition==='visual'" :cover-key="track?.id||''" @signal="signalState=$event"/><div class="grain" aria-hidden="true"></div>
    <header class="topbar">
      <button ref="returnButton" :inert="pure||undefined" class="brand" type="button" aria-label="返回声音" title="返回声音" @click="$emit('close')"><BrandMark class="brand-mark"/>墨屿<span class="crumb">听歌舞台</span></button>
      <nav :inert="pure||undefined" class="mode-switch" role="tablist" aria-label="舞台布局"><button v-for="item in compositions" :key="item.id" type="button" role="tab" :aria-selected="composition===item.id" :aria-pressed="composition===item.id" :tabindex="composition===item.id?0:-1" @click="composition=item.id" @keydown="moveMode($event)">{{ item.label }}</button></nav>
      <div :inert="pure||undefined" class="top-tools"><button ref="queueButton" class="icon-btn" aria-label="播放队列" title="播放队列" @click="openMotionDialog(queueDialog)"><AppIcon name="list"/></button><button ref="settingsButton" class="icon-btn" aria-label="视觉设置" title="舞台设置" @click="openSettings"><AppIcon name="settings"/></button><button class="account-btn" :aria-expanded="accountOpen" aria-label="我的" @click.stop="accountOpen=!accountOpen"><span class="account-dot">墨</span>我的<AppIcon name="chevronDown"/></button></div>
      <AppTitlebar v-if="desktop" integrated />
    </header>
    <aside v-if="accountOpen" class="account-menu stage-glass sr-glass" aria-label="我的菜单"><button v-if="desktop" type="button" @click="openClientSettings"><AppIcon name="settings"/>客户端设置</button><button v-if="desktop" type="button" @click="toggleLyrics"><AppIcon name="music"/>显示／隐藏桌面歌词</button><button type="button" @click="$emit('close')">返回声音</button></aside>
    <div class="stage-options" :inert="pure||undefined"><span class="option-label">歌词样式</span><AppSelect aria-label="歌词样式" :disabled="composition==='visual'" :model-value="preferences.lyricStyle" @update:model-value="setLyricStyle"><option v-for="[id,label] in STAGE_LYRICS" :key="id" :value="id">{{label}}</option></AppSelect><span class="option-label">背景</span><AppSelect aria-label="背景" :model-value="preferences.background" @update:model-value="setMode"><option v-for="[id,label] in STAGE_BACKGROUNDS" :key="id" :value="id">{{label}}</option></AppSelect></div>
    <main class="stage" :class="{'stage--pure':pure}" :data-mode="composition" :data-style="preferences.lyricStyle" :data-background="preferences.background">

      <div v-if="composition!=='visual'" class="style-status">{{ STAGE_LYRICS.find(([id])=>id===preferences.lyricStyle)?.[1] }}</div>
      <div v-if="composition==='visual'&&preferences.background==='cover'" class="visual-idle" aria-hidden="true"><TrackArtwork :track="track" resolve/></div><div class="stage-title"><div class="eyebrow">SOUND / LANDSCAPE</div><h1>{{track?.title||'等待一段声音'}}</h1><p>{{track?.artist||'从声音页选择音乐'}}</p></div>
      <section class="stage-body listening-stage__body" :class="{'is-reduced':shell.motionReduced}">
        <div class="album-column"><div class="art-wrap" :style="cameraStyle" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag"><TrackArtwork :track="track" resolve><div class="stage-cover-fallback"><BrandMark/><small>暂无封面</small></div></TrackArtwork><span class="art-label">STILL HERE.</span></div><div class="album-meta"><div class="eyebrow">A MOMENT OF STILLNESS</div><h1>{{track?.title||'让此刻，有自己的声音'}}</h1><p>{{track?.artist||'返回声音页选择音乐'}}<template v-if="track?.album"> / {{track.album}}</template></p><div class="meta-bottom"><span class="tag">{{sourceName}}</span><button class="heart" :disabled="!canFavorite" :aria-pressed="isFavorite" aria-label="喜欢这首音乐" @click="track&&$emit('toggleFavorite',track)"><AppIcon name="heart"/></button></div></div></div>
        <StageLyrics :lyric-style="preferences.lyricStyle" :compact="composition==='cover'"/>
      </section>
      <p v-if="player.playback.status==='error'" class="stage-error" role="status">{{ failure.reason }}</p>
      <section v-show="!pure" class="player" aria-label="播放控制"><div class="transport"><button type="button" :class="{'is-active':player.playback.shuffle}" :aria-pressed="player.playback.shuffle" aria-label="随机播放" @click="player.setShuffle(!player.playback.shuffle)"><AppIcon name="shuffle"/></button><button type="button" :disabled="!track" aria-label="上一首" @click="player.previous()"><AppIcon name="previous"/></button><button class="play" type="button" :disabled="!track||retryBlocked" :aria-label="playIntent?'暂停':'播放'" @click="player.toggle()"><AppIcon :name="playIntent?'pause':'play'"/></button><button type="button" :disabled="!track" aria-label="下一首" @click="player.next()"><AppIcon name="next"/></button><button v-if="desktop" type="button" aria-label="显示桌面歌词" @click="toggleLyrics"><AppIcon name="music"/></button><button type="button" aria-label="纯净模式" @click="enterPure"><AppIcon name="fullscreen"/></button></div><div class="progress-wrap"><span class="time">{{formatTime(player.playback.positionMs)}}</span><input class="stage-progress" type="range" min="0" :max="Math.max(1,player.playback.durationMs)" :value="player.playback.positionMs" :disabled="!track" :style="{'--fill':progress+'%'}" aria-label="播放进度" @input="seek"><span class="time">{{formatTime(player.playback.durationMs)}}</span></div><div class="player-bottom"><span class="demo-note"><span class="demo-dot"></span>{{shell.motionReduced?'已减少动态，保留静态舞台':player.buffering?'正在缓冲': signalState==='unavailable'?'流动氛围 · 当前音源不支持音频响应':signalState==='silent'?'当前无音频信号 · 流动氛围':'总混音响应 · 音乐与环境音'}}</span><div class="volume"><button type="button" :aria-label="sound.settings.musicBus.muted?'取消音乐静音':'音乐静音'" @click="sound.setMusicBus(sound.settings.musicBus.volume,!sound.settings.musicBus.muted)"><AppIcon :name="sound.settings.musicBus.muted?'mute':'volume'"/></button><input type="range" min="0" max="100" :value="Math.round((sound.settings.musicBus.muted?0:sound.settings.musicBus.volume)*100)" aria-label="音乐音量" :style="{'--fill':(sound.settings.musicBus.muted?0:sound.settings.musicBus.volume)*100+'%'}" @input="setMusicVolume"><output>{{Math.round((sound.settings.musicBus.muted?0:sound.settings.musicBus.volume)*100)}}%</output></div></div></section>
      <button v-if="pure" ref="restoreButton" class="restore-controls" type="button" @click="leavePure">显示控制</button>
    </main>
    <dialog ref="settings" class="parity-drawer stage-glass sr-glass" aria-labelledby="stage-settings-title" @cancel.prevent="closeSettings" @click="closeOutside" @keydown="trapSettingsFocus"><header><div><small>STAGE / APPEARANCE</small><h2 id="stage-settings-title">舞台设置</h2></div><button type="button" aria-label="关闭视觉设置" @click="closeSettings">×</button></header><p>只调整视觉，不改变播放与计时。</p><label>舞台布局<AppSelect aria-label="舞台布局" v-model="composition"><option v-for="item in compositions" :key="item.id" :value="item.id">{{item.label}}</option></AppSelect></label><label v-if="composition!=='visual'">歌词样式<AppSelect aria-label="设置中的歌词样式" :model-value="preferences.lyricStyle" @update:model-value="setLyricStyle"><option v-for="[id,label] in STAGE_LYRICS" :key="id" :value="id">{{label}}</option></AppSelect></label><label>背景<AppSelect aria-label="视觉效果" :model-value="preferences.background" @update:model-value="setMode"><option v-for="[id,label] in STAGE_BACKGROUNDS" :key="id" :value="id">{{label}}</option></AppSelect></label><label>色调<AppSelect aria-label="色调" v-model="tone"><option value="sea">深海青金</option><option value="ember">余烬暖铜</option><option value="moon">月白</option></AppSelect></label><label>强度<output>{{Math.round(preferences.intensity*100)}}%</output><input type="range" min="0" max="100" :value="preferences.intensity*100" aria-label="视觉强度" @input="updateLevel('intensity',$event)"></label><label>纵深<output>{{Math.round(preferences.depth*100)}}%</output><input type="range" min="0" max="100" :value="preferences.depth*100" aria-label="视觉纵深" @input="updateLevel('depth',$event)"></label><label>画面质量<AppSelect aria-label="画面质量" :model-value="preferences.quality" @update:model-value="setQuality"><option value="auto">自动</option><option :value="24">节能 · 24 fps 上限</option><option :value="40">均衡 · 40 fps 上限</option><option :value="60">精细 · 60 fps 上限</option></AppSelect></label><div class="offset-controls" aria-label="歌词同步调整"><button :disabled="!lyricsState.lines.length||lyricsControls.savingOffset" aria-label="歌词提前半秒" @click="changeOffset(-500)">−0.5</button><button :disabled="!lyricsState.lines.length||lyricsControls.savingOffset" @click="changeOffset(0,true)">{{lyricsState.offsetMs===0?'同步':`${lyricsState.offsetMs>0?'+':''}${(lyricsState.offsetMs/1000).toFixed(1)}s`}}</button><button :disabled="!lyricsState.lines.length||lyricsControls.savingOffset" aria-label="歌词延后半秒" @click="changeOffset(500)">+0.5</button></div><p v-if="lyricsControls.offsetError" role="alert">{{lyricsControls.offsetError}}</p><button type="button" @click="resetCamera">视角回正</button><p v-if="sound.errorCode==='SOUND_SETTINGS_WRITE_FAILED'" role="alert">设置尚未保存，当前画面仍可使用。<button type="button" @click="sound.persist()">重试保存</button></p><button type="button" @click="closeSettings">完成</button></dialog>
    <dialog ref="queueDialog" class="parity-drawer stage-glass sr-glass" aria-label="播放队列" @cancel.prevent="closeQueue"><header><h2>播放队列 · {{queue.items.length}}</h2><button type="button" aria-label="关闭播放队列" @click="closeQueue">×</button></header><PlayerQueueList :items="queue.items" :current-item-id="player.playback.currentItemId" @select="item=>player.load(item,0,true)" @remove="removeQueueItem"/><VolumeControl label="环境音" :value="sound.settings.ambientBus.volume" :muted="sound.settings.ambientBus.muted" @change="sound.setAmbientBus($event,false)" @mute="sound.setAmbientBus(sound.settings.ambientBus.volume,!sound.settings.ambientBus.muted)"/><button type="button" @click="player.setRepeat(player.playback.repeatMode==='off'?'all':player.playback.repeatMode==='all'?'one':'off')">循环：{{player.playback.repeatMode==='off'?'关闭':player.playback.repeatMode==='all'?'全部':'单曲'}}</button></dialog>
  </section>
</template>

<script setup lang="ts">
import AppSelect from '../../components/controls/AppSelect.vue';
import AppIcon from '../../components/icons/AppIcon.vue';
import BrandMark from '../../components/icons/BrandMark.vue';
import AppTitlebar from '../../components/window/AppTitlebar.vue';
import PlayerQueueList from '../../components/player/PlayerQueueList.vue';
import VolumeControl from '../../components/sound/VolumeControl.vue';
import {useQueueStore} from '../../stores/queue';
import {desktopMusicState,saveDesktopMusic} from '../../audio/lyrics/desktopLyrics';
import {playbackFailure} from '../../audio/state/playbackFailure';

import { openMotionDialog, closeMotionDialog,runMotion,type MotionHandle } from '../../motion/runtime';
import TrackArtwork from "../../components/sound/TrackArtwork.vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Track,VisualizerState } from '@studyroom/contracts';
import { usePlayerStore } from '../../stores/player';
import { useSoundStore } from '../../stores/sound';
import { useShellStore } from '../../stores/shell';
import StageLyrics from './stage/StageLyrics.vue';
import {sharedLyricsState as lyricsState,sharedLyricsControls as lyricsControls,saveSharedLyricsOffset} from '../../audio/lyrics/sharedLyricsRuntime';
import {readStagePreferences,stageVisualizerMode,normalizeStagePreferences,STAGE_LYRICS,STAGE_BACKGROUNDS,type StagePreferences} from './stage/stagePreferences';
import StageBackgroundCanvas from './stage/StageBackgroundCanvas.vue';

const emit = defineEmits<{ close: [];toggleFavorite:[track:Track];clientSettings:[] }>();
const props=withDefaults(defineProps<{favoriteTrackIds?:string[]}>(),{favoriteTrackIds:()=>[]});
const player = usePlayerStore(), sound = useSoundStore(), shell = useShellStore();
const stage = ref<HTMLElement>(), settings = ref<HTMLDialogElement>();
const returnButton = ref<HTMLButtonElement>(), settingsButton = ref<HTMLButtonElement>(), restoreButton = ref<HTMLButtonElement>();
const track = computed(() => player.currentItem?.track);
const compositions = [{ id: 'cover', label: '封面＋歌词' }, { id: 'lyrics', label: '沉浸歌词' }, { id: 'visual', label: '纯视觉' }] as const;
type StageSettings = NonNullable<VisualizerState['stage']>;
const stageSettings = computed<StageSettings>(() => sound.settings.visualizer.stage ?? { composition: 'cover', tone: 'sea', cameraX: 0, cameraY: 0 });
function updateStage(value: Partial<StageSettings>) { sound.setVisualizer({ ...sound.settings.visualizer, stage: { ...stageSettings.value, ...value } }); }
const preferences=computed(()=>readStagePreferences(sound.settings.visualizer));
function updatePreferences(value:Partial<StagePreferences>){
  const next=normalizeStagePreferences({...preferences.value,...value});
  sound.setVisualizer({...sound.settings.visualizer,mode:stageVisualizerMode(next),quality:next.quality===24?'low':next.quality===60?'high':'medium',stage:{...stageSettings.value,composition:next.layout,preferences:next}});
}
const composition = computed({ get: () => preferences.value.layout, set: value => updatePreferences({layout:value}) });
const visualMode=computed(()=>stageVisualizerMode(preferences.value));
const visualQuality=computed(()=>preferences.value.quality===24?'low':preferences.value.quality===60?'high':'medium');
const tone = computed({ get: () => stageSettings.value.tone, set: value => updateStage({ tone: value }) });
const cameraX = computed({ get: () => stageSettings.value.cameraX, set: value => updateStage({ cameraX: value }) });
const cameraY = computed({ get: () => stageSettings.value.cameraY, set: value => updateStage({ cameraY: value }) });
const pure = ref(false);let layoutMotion:MotionHandle|undefined;
watch(()=>composition.value,async()=>{layoutMotion?.revert();await nextTick();if(stage.value&&!shell.motionReduced)layoutMotion=runMotion(stage.value,'stage-layout',tl=>{const body=stage.value!.querySelector('.stage-body');if(body)tl.fromTo(body,{opacity:0,y:14},{opacity:1,y:0,duration:.5,ease:'power3.out'});});});
let drag: { id: number; x: number; y: number; originalX: number; originalY: number } | undefined;
const cameraStyle = computed(() => ({ transform: shell.motionReduced ? 'none' : `perspective(1200px) rotateX(${cameraY.value}deg) rotateY(${cameraX.value}deg)` }));
function resetCamera() { cameraX.value = 0; cameraY.value = 0; }
function startDrag(event: PointerEvent) { if (drag || event.button !== 0 || shell.motionReduced) return; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, originalX: cameraX.value, originalY: cameraY.value }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
function moveDrag(event: PointerEvent) { if (!drag || event.pointerId !== drag.id) return; cameraX.value = Math.max(-8, Math.min(8, drag.originalX + (event.clientX - drag.x) / 24)); cameraY.value = Math.max(-6, Math.min(6, drag.originalY - (event.clientY - drag.y) / 24)); }
function endDrag() { drag = undefined; }
async function enterPure() { pure.value = true; await nextTick(); restoreButton.value?.focus(); }
async function leavePure() { pure.value = false; await nextTick(); returnButton.value?.focus(); }
function onKeydown(event: KeyboardEvent) {
  if (settings.value?.open||queueDialog.value?.open) return;
  if (event.key === 'Escape') { event.preventDefault(); if (pure.value) void leavePure(); else emit('close'); return; }
  if ((event.target as HTMLElement).matches('input,select,textarea') || shell.motionReduced) return;
  if (event.key === 'Home') { event.preventDefault(); resetCamera(); }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cameraX.value = Math.max(-8, Math.min(8, cameraX.value + (event.key === 'ArrowRight' ? 2 : -2))); }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); cameraY.value = Math.max(-6, Math.min(6, cameraY.value + (event.key === 'ArrowDown' ? 2 : -2))); }
}
function openSettings() { openMotionDialog(settings.value); }
function closeSettings() { closeMotionDialog(settings.value, false, () => settingsButton.value?.focus()); }
function closeOutside(event: MouseEvent) { if (event.target !== settings.value) return; const rect = settings.value.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeSettings(); }
function trapSettingsFocus(event: KeyboardEvent) { if (event.key !== 'Tab') return; const controls = [...settings.value!.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),[tabindex="0"]')].filter(element => element.getClientRects().length > 0); const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
function setMode(value:unknown) { updatePreferences({background:String(value) as StagePreferences['background']}); }
async function changeOffset(delta:number,reset=false){await saveSharedLyricsOffset(delta,reset);}
function setLyricStyle(value:unknown) { updatePreferences({lyricStyle:String(value) as StagePreferences['lyricStyle']}); }
function setQuality(value:unknown) { updatePreferences({quality:value==='auto'?'auto':Number(value) as 24|40|60}); }

onMounted(() => {shell.listeningStage=true;returnButton.value?.focus();void nextTick(()=>{const image=stage.value?.querySelector<HTMLImageElement>('.art-wrap img');if(image?.complete)backgroundCanvas.value?.setCoverImage(image);});});
onBeforeUnmount(() => {shell.listeningStage=false;layoutMotion?.revert();drag=undefined;closeMotionDialog(settings.value,true);closeMotionDialog(queueDialog.value,true);});

const backgroundCanvas=ref<InstanceType<typeof StageBackgroundCanvas>>(),signalState=ref('silent');
function captureCover(event:Event){if(event.target instanceof HTMLImageElement)backgroundCanvas.value?.setCoverImage(event.target);}
const desktop=Boolean(window.studyRoomDesktop),queue=useQueueStore();
const queueDialog=ref<HTMLDialogElement>(),queueButton=ref<HTMLButtonElement>(),accountOpen=ref(false);
const sourceName=computed(()=>track.value?.source.kind==='provider'?({netease:'网易云音乐',qq:'QQ 音乐',kugou:'酷狗音乐'}[track.value.source.providerId]):track.value?.source.kind==='local'?'LOCAL MUSIC':track.value?.source.kind==='radio'?'RADIO':'MOYU SOUND');
const isFavorite=computed(()=>!!track.value&&props.favoriteTrackIds.includes(track.value.id));
const canFavorite=computed(()=>!!track.value&&Boolean(window.studyRoomDesktop?.setTrackFavorite));
const playIntent=computed(()=>player.wantsPlayback||player.playback.status==='playing');
const failure=computed(()=>playbackFailure(player.playback.errorCode));
const retryBlocked=computed(()=>!playIntent.value&&player.playback.status==='error'&&(['login','none'].includes(failure.value.action)||player.retryNotBefore>Date.now()));
const progress=computed(()=>Math.max(0,Math.min(100,player.playback.positionMs/Math.max(1,player.playback.durationMs)*100)));
function formatTime(ms:number){const seconds=Math.floor(Math.max(0,ms)/1000);return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
function seek(event:Event){player.seek(Number((event.target as HTMLInputElement).value));}
function setMusicVolume(event:Event){sound.setMusicBus(Number((event.target as HTMLInputElement).value)/100,false);}
function updateLevel(key:'intensity'|'depth',event:Event){updatePreferences({[key]:Number((event.target as HTMLInputElement).value)/100});}
function moveMode(event:KeyboardEvent){if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();event.stopPropagation();const current=compositions.findIndex(item=>item.id===composition.value);const index=event.key==='Home'?0:event.key==='End'?2:(current+(event.key==='ArrowRight'?1:2))%3;composition.value=compositions[index]!.id;(event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('button')[index]?.focus();}
function closeAccountOutside(event:MouseEvent){if(!(event.target as HTMLElement).closest('.account-btn,.account-menu'))accountOpen.value=false;}
async function toggleLyrics(){accountOpen.value=false;const current=desktopMusicState.state?.settings;if(!current){shell.toast('请在客户端设置中开启桌面歌词','info');return;}await saveDesktopMusic({...current,lyricsVisible:!current.lyricsVisible});if(desktopMusicState.error)shell.toast(desktopMusicState.error,'error');}
function closeQueue(){closeMotionDialog(queueDialog.value,false,()=>queueButton.value?.focus());}
function openClientSettings(){accountOpen.value=false;emit('clientSettings');}
async function removeQueueItem(id:string){const at=queue.items.findIndex(item=>item.id===id),wasCurrent=id===player.playback.currentItemId,resume=player.playback.status==='playing';try{await queue.remove(id);if(wasCurrent){const item=queue.items[Math.min(Math.max(0,at),queue.items.length-1)];if(item)await player.load(item,0,resume);else player.clear();}}catch{shell.toast('未能移除队列曲目，请重试','error');}}

</script>
<style src="./stage/approvedPreview.css"></style>
<style scoped>
.parity-drawer{position:absolute;inset:132px 26px auto auto;margin:0;width:320px;max-width:calc(100% - 32px);max-height:calc(100% - 150px);padding:24px;border-radius:19px;background:#26312bf2;border:1px solid #e4f0d629;color:#f0f2e9;box-shadow:0 25px 80px #0006;backdrop-filter:blur(28px);scrollbar-width:thin;overflow:auto}.parity-drawer::backdrop{background:#050c0860}.parity-drawer header{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}.parity-drawer h2{font-size:18px;font-weight:550;margin:0}.parity-drawer small{font-size:9px;letter-spacing:2px;color:#a6b1a7}.parity-drawer p{font-size:11px;color:#a6b1a7;line-height:1.8}.parity-drawer button{border:1px solid #e7f2d91c;border-radius:9px;padding:8px 12px}.parity-drawer label{display:grid;grid-template-columns:1fr auto;gap:9px;margin:22px 0;color:#c9d5c1;font-size:11px}.parity-drawer label :deep(.sr-select),.parity-drawer input{grid-column:1/-1;width:100%}.parity-drawer output{color:#d8e6ad}.parity-drawer .queue-list{height:330px}.offset-controls{display:flex;gap:8px}.offset-controls button{flex:1}.stage-cover-fallback{display:flex;flex-direction:column;gap:14px;align-items:center;justify-content:center;width:100%;height:100%;min-height:140px;background:radial-gradient(ellipse at 20% 20%,#46676566,#102129);color:#a6b1a7}.stage-cover-fallback svg{width:70px;height:70px}.stage-progress{flex:1;min-width:0}.restore-controls{position:absolute;bottom:20px;right:24px;z-index:10;border:1px solid #e7f2d933;border-radius:20px;background:#26312b;color:#f0f2e9;padding:10px 18px}.is-pure .topbar,.is-pure .stage-options{visibility:hidden}.art-wrap{touch-action:none}.heart svg{width:18px}.account-btn svg{width:13px}@media(max-width:700px){.parity-drawer{top:160px;right:12px;max-height:calc(100% - 180px)}}
</style>
