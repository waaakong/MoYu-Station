<template>
  <section ref="stage" class="listening-stage" :class="[`listening-stage--${tone}`, `listening-stage--${composition}`, { 'listening-stage--pure': pure }]" aria-label="完整音乐视觉模式" @keydown="onKeydown">
    <div class="listening-stage__atmosphere" aria-hidden="true"></div>
    <VisualizerCanvas class="listening-stage__visual" stage :tone="tone" :mode="visualMode" :quality="visualQuality" :suppressed="sound.lowPerformance" :style="cameraStyle" />
    <header class="listening-stage__toolbar sr-glass" :inert="pure || undefined">
      <button ref="returnButton" type="button" @click="$emit('close')">返回声音</button>
      <div class="stage-segments" role="group" aria-label="舞台构图">
        <button v-for="item in compositions" :key="item.id" type="button" :aria-pressed="composition === item.id" @click="composition = item.id">{{ item.label }}</button>
      </div>
      <div class="listening-stage__tools"><button ref="settingsButton" type="button" @click="openSettings">视觉设置</button><button type="button" @click="enterPure">纯净模式</button></div>
    </header>

    <div class="listening-stage__body" :class="{ 'is-reduced': shell.motionReduced }">
      <div v-if="composition === 'cover'" class="listening-stage__cover" :style="cameraStyle" @pointerdown="startDrag" @pointermove="moveDrag" @pointerup="endDrag" @pointercancel="endDrag" @lostpointercapture="endDrag">
        <TrackArtwork :track="track" resolve><div class="listening-stage__no-art"><BrandMark style="width:88px;height:88px" /><small>{{ track ? '暂无封面' : '等待一段声音' }}</small></div></TrackArtwork>
      </div>
      <div v-if="composition !== 'visual'" class="listening-stage__copy">
        <p class="listening-stage__source">{{ track ? '正在播放' : '声音舞台' }}</p>
        <h2>{{ track?.title || '让此刻，有自己的声音' }}</h2>
        <p class="listening-stage__artist">{{ track?.artist || '返回声音页选择音乐，或开启环境声音。' }}</p>
        <StageLyrics class="listening-stage__lyrics" :lyric-style="preferences.lyricStyle" :compact="composition === 'cover'" />
      </div>
      <p v-else class="listening-stage__visual-title">{{ track?.title || '总混音视觉' }}</p>
    </div>

    <footer class="listening-stage__footer" :inert="pure || undefined">
      <span>{{ shell.motionReduced ? '已减少动态，保留静态舞台' : sound.lowPerformance ? '低性能模式，视觉已暂停' : '响应当前总混音；无信号时保持静止' }}</span>
      <button type="button" @click="resetCamera">视角回正</button>
    </footer>
    <button v-if="pure" ref="restoreButton" class="listening-stage__restore" type="button" @click="leavePure">显示控制</button>

    <dialog ref="settings" class="stage-settings sr-glass sr-glass--floating" aria-labelledby="stage-settings-title" @cancel.prevent="closeSettings" @click="closeOutside" @keydown="trapSettingsFocus">
      <header><div><h2 id="stage-settings-title">视觉设置</h2><p>只调整视觉，不改变播放与计时。</p></div><button type="button" aria-label="关闭视觉设置" @click="closeSettings">关闭</button></header>
      <fieldset><legend>舞台布局</legend><label>构图<AppSelect aria-label="舞台布局" v-model="composition"><option v-for="item in compositions" :key="item.id" :value="item.id">{{ item.label }}</option></AppSelect></label></fieldset>
      <fieldset v-if="composition !== 'visual'"><legend>歌词</legend><label>文字呈现<AppSelect aria-label="歌词样式" :model-value="preferences.lyricStyle" @update:model-value="setLyricStyle"><option v-for="[id,label] in STAGE_LYRICS" :key="id" :value="id">{{ label }}</option></AppSelect></label><div class="stage-offset" aria-label="歌词同步调整"><button type="button" aria-label="歌词提前半秒" :disabled="!lyricsState.lines.length||lyricsControls.savingOffset" @click="changeOffset(-500)">−0.5</button><button type="button" :disabled="!lyricsState.lines.length||lyricsControls.savingOffset" @click="changeOffset(0,true)">{{ lyricsState.offsetMs===0?'同步':`${lyricsState.offsetMs>0?'+':''}${(lyricsState.offsetMs/1000).toFixed(1)}s` }}</button><button type="button" aria-label="歌词延后半秒" :disabled="!lyricsState.lines.length||lyricsControls.savingOffset" @click="changeOffset(500)">+0.5</button></div><p v-if="lyricsControls.offsetError" role="alert">{{ lyricsControls.offsetError }}</p><p>只有真实逐字时间可用时逐字高亮；普通歌词按行切换。</p></fieldset>
      <fieldset><legend>背景</legend><label>视觉效果<AppSelect aria-label="视觉效果" :model-value="preferences.background" @update:model-value="setMode"><option v-for="[id,label] in STAGE_BACKGROUNDS" :key="id" :value="id">{{ label }}</option></AppSelect></label>
      <label>色调<AppSelect aria-label="色调" v-model="tone"><option value="sea">深海青金</option><option value="ember">余烬暖铜</option><option value="moon">月白</option></AppSelect></label>
      </fieldset>
      <fieldset><legend>性能</legend><label>画面质量<AppSelect aria-label="画面质量" :model-value="preferences.quality" :disabled="sound.lowPerformance" @update:model-value="setQuality"><option value="auto">自动 · 当前均衡上限</option><option :value="24">节能 · 24 fps 上限</option><option :value="40">均衡 · 40 fps 上限</option><option :value="60">精细 · 60 fps 上限</option></AppSelect></label></fieldset>
      <p>拖动封面可微调视角；方向键同样可操作，Home 回正。色调、构图与视角保存在本机；纯净模式不跨次恢复。</p>
      <p v-if="sound.errorCode === 'SOUND_SETTINGS_WRITE_FAILED'" role="alert">设置尚未保存，当前画面仍可使用。<button type="button" @click="sound.persist()">重试保存</button></p>
      <p v-if="sound.settings.visualizer.mode === 'off'">视觉已关闭，音乐和播放进度不受影响。</p>
      <button class="stage-settings__done" type="button" @click="closeSettings">完成</button>
    </dialog>
  </section>
</template>

<script setup lang="ts">
import { openMotionDialog, closeMotionDialog } from '../../motion/runtime';
import TrackArtwork from "../../components/sound/TrackArtwork.vue";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { VisualizerState } from '@studyroom/contracts';
import { usePlayerStore } from '../../stores/player';
import { useSoundStore } from '../../stores/sound';
import { useShellStore } from '../../stores/shell';
import StageLyrics from './stage/StageLyrics.vue';
import {sharedLyricsState as lyricsState,sharedLyricsControls as lyricsControls,saveSharedLyricsOffset} from '../../audio/lyrics/sharedLyricsRuntime';
import {readStagePreferences,stageVisualizerMode,normalizeStagePreferences,STAGE_LYRICS,STAGE_BACKGROUNDS,type StagePreferences} from './stage/stagePreferences';
import VisualizerCanvas from './VisualizerCanvas.vue';

const emit = defineEmits<{ close: [] }>();
const player = usePlayerStore(), sound = useSoundStore(), shell = useShellStore();
const stage = ref<HTMLElement>(), settings = ref<HTMLDialogElement>();
const returnButton = ref<HTMLButtonElement>(), settingsButton = ref<HTMLButtonElement>(), restoreButton = ref<HTMLButtonElement>();
const track = computed(() => player.currentItem?.track);
const compositions = [{ id: 'cover', label: '封面舞台' }, { id: 'lyrics', label: '歌词舞台' }, { id: 'visual', label: '纯视觉' }] as const;
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
const pure = ref(false);
let drag: { id: number; x: number; y: number; originalX: number; originalY: number } | undefined;
const cameraStyle = computed(() => ({ transform: shell.motionReduced ? 'none' : `perspective(1200px) rotateX(${cameraY.value}deg) rotateY(${cameraX.value}deg)` }));
function resetCamera() { cameraX.value = 0; cameraY.value = 0; }
function startDrag(event: PointerEvent) { if (drag || event.button !== 0 || shell.motionReduced) return; drag = { id: event.pointerId, x: event.clientX, y: event.clientY, originalX: cameraX.value, originalY: cameraY.value }; (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); }
function moveDrag(event: PointerEvent) { if (!drag || event.pointerId !== drag.id) return; cameraX.value = Math.max(-8, Math.min(8, drag.originalX + (event.clientX - drag.x) / 24)); cameraY.value = Math.max(-6, Math.min(6, drag.originalY - (event.clientY - drag.y) / 24)); }
function endDrag() { drag = undefined; }
async function enterPure() { pure.value = true; await nextTick(); restoreButton.value?.focus(); }
async function leavePure() { pure.value = false; await nextTick(); returnButton.value?.focus(); }
function onKeydown(event: KeyboardEvent) {
  if (settings.value?.open) return;
  if (event.key === 'Escape') { event.preventDefault(); if (pure.value) void leavePure(); else emit('close'); return; }
  if ((event.target as HTMLElement).matches('input,select,textarea') || shell.motionReduced) return;
  if (event.key === 'Home') { event.preventDefault(); resetCamera(); }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cameraX.value = Math.max(-8, Math.min(8, cameraX.value + (event.key === 'ArrowRight' ? 2 : -2))); }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); cameraY.value = Math.max(-6, Math.min(6, cameraY.value + (event.key === 'ArrowDown' ? 2 : -2))); }
}
function openSettings() { openMotionDialog(settings.value); }
function closeSettings() { closeMotionDialog(settings.value, false, () => settingsButton.value?.focus()); }
function closeOutside(event: MouseEvent) { if (event.target !== settings.value) return; const rect = settings.value.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeSettings(); }
function trapSettingsFocus(event: KeyboardEvent) { if (event.key !== 'Tab') return; const controls = [...settings.value!.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled)')].filter(element => element.getClientRects().length > 0); const first = controls[0], last = controls.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
function setMode(value:unknown) { updatePreferences({background:String(value) as StagePreferences['background']}); }
async function changeOffset(delta:number,reset=false){await saveSharedLyricsOffset(delta,reset);}
function setLyricStyle(value:unknown) { updatePreferences({lyricStyle:String(value) as StagePreferences['lyricStyle']}); }
function setQuality(value:unknown) { updatePreferences({quality:value==='auto'?'auto':Number(value) as 24|40|60}); }

onMounted(() => returnButton.value?.focus());
onBeforeUnmount(() => { drag = undefined; closeMotionDialog(settings.value, true); });
</script>

<style scoped>
.listening-stage { position:relative; isolation:isolate; display:grid; grid-template-rows:auto minmax(0,1fr) auto; flex:1; min-height:0; overflow:hidden; border:1px solid #d8e9df1a; border-radius:var(--sr-radius-panel,20px); background:#081411; --stage-glow:#37695d; }
.listening-stage--ember { --stage-glow:#79482e; }.listening-stage--moon { --stage-glow:#4d566b; }
.listening-stage__atmosphere { position:absolute; inset:0; z-index:-2; pointer-events:none; background:radial-gradient(ellipse at 46% 58%,color-mix(in srgb,var(--stage-glow) 55%,transparent),transparent 70%),linear-gradient(135deg,#091511,#081011); }
.listening-stage__visual { position:absolute; inset:0; z-index:-1; width:100%; height:100%; pointer-events:none; opacity:.75; }
.listening-stage__toolbar { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 20px; border:1px solid var(--sr-color-line); border-radius:var(--sr-radius-panel) var(--sr-radius-panel) 0 0; }
.listening-stage button { min-height:44px; padding:10px 14px; border:1px solid var(--sr-color-line); border-radius:var(--sr-radius-control,12px); background:var(--sr-color-surface-raised); color:var(--sr-color-text); font:600 12px/1.4 var(--sr-font-sans); cursor:pointer; white-space:nowrap; }
.stage-segments { display:flex; padding:3px; border:1px solid var(--sr-color-line); border-radius:15px; background:var(--sr-color-surface-raised); }.stage-segments button { border:0; background:transparent; color:var(--sr-color-text-muted); }.stage-segments button[aria-pressed=true] { background:var(--sr-color-selected); color:var(--sr-color-text); box-shadow:inset 0 1px #ffffff12; }
.listening-stage__tools { display:flex; gap:8px; }
.listening-stage__body { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); align-items:center; gap:clamp(24px,5vw,80px); padding:clamp(20px,4vw,64px); min-height:0; overflow:auto; }
.listening-stage__cover { width:min(100%,390px,43vh); aspect-ratio:1; justify-self:center; overflow:hidden; border:1px solid #d7e9dc30; border-radius:18px; background:#10251c; box-shadow:0 28px 70px #02090680; touch-action:none; user-select:none; cursor:grab; }.listening-stage__cover:active { cursor:grabbing; }.listening-stage__cover img { width:100%; height:100%; object-fit:cover; }.listening-stage__no-art { width:100%; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; background:radial-gradient(circle at 40% 30%,#4a6e5466,transparent 70%); }.listening-stage__no-art span { font:64px var(--sr-font-display); color:#d5e2d588; }.listening-stage__no-art small { color:#b3c3b8; font-size:12px; }
.listening-stage__copy { min-width:0; }.listening-stage__source { margin:0 0 14px; color:#c1d3c7; font-size:12px; }.listening-stage__copy h2 { margin:0; max-width:20em; font-size:clamp(24px,2.8vw,42px); font-weight:600; letter-spacing:-.04em; line-height:1.3; overflow-wrap:anywhere; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }.listening-stage__artist { margin:14px 0 0; color:#b7cbbf; font-size:14px; line-height:1.6; }.listening-stage__lyrics { height:200px; margin-top:26px; }.listening-stage--lyrics .listening-stage__body { display:flex; justify-content:center; text-align:center; }.listening-stage--lyrics .listening-stage__copy { width:min(760px,100%); }.listening-stage--lyrics .listening-stage__copy h2 { max-width:none; font-size:22px; }.listening-stage--lyrics .listening-stage__lyrics { height:260px; margin-top:20px; }
.listening-stage--visual .listening-stage__body { display:flex; align-items:flex-end; justify-content:center; }.listening-stage__visual-title { max-width:70ch; text-align:center; color:#c6d6cd; font-size:16px; overflow-wrap:anywhere; }
.listening-stage__footer { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:12px 20px; }.listening-stage__footer span { color:#adbeB3; font-size:11px; line-height:1.5; }.listening-stage--pure .listening-stage__toolbar,.listening-stage--pure .listening-stage__footer { visibility:hidden; }.listening-stage__restore { position:absolute; right:20px; bottom:16px; }
.stage-settings { width:min(440px,calc(100vw - 32px)); max-height:calc(100dvh - 48px); padding:24px; overflow:auto; box-sizing:border-box; border:1px solid var(--sr-color-line-strong); border-radius:22px; color:var(--sr-color-text); }.stage-settings::backdrop { background:#020805a6; }.stage-settings header { display:flex; gap:12px; align-items:flex-start; justify-content:space-between; margin-bottom:20px; }.stage-settings h2 { margin:0; font-size:21px; }.stage-settings p { color:var(--sr-color-text-muted); font-size:12px; line-height:1.75; }.stage-settings label { display:grid; gap:8px; margin:18px 0; font-size:13px; }.stage-settings select { min-height:44px; padding:10px 12px; border:1px solid var(--sr-color-line); border-radius:12px; background:var(--sr-color-surface-raised); color:var(--sr-color-text); font:inherit; }.stage-settings__done { width:100%; }.listening-stage button:focus-visible,.stage-settings select:focus-visible { outline:2px solid var(--sr-color-focus,#b6d7bd); outline-offset:3px; }
@media(hover:hover) and (pointer:fine) { .listening-stage button:hover { background:var(--sr-color-selected); } }
@media(max-height:760px) and (min-width:801px) { .listening-stage__toolbar { padding:10px 14px; }.listening-stage__body { padding:20px 32px; }.listening-stage__lyrics { height:130px; margin-top:14px; }.listening-stage--lyrics .listening-stage__lyrics { height:190px; }.listening-stage__cover { width:min(100%,36vh); } }
@media(max-width:800px) { .listening-stage__toolbar { flex-wrap:wrap; padding:12px; gap:8px; }.stage-segments { width:100%; order:3; }.stage-segments button { flex:1; padding-inline:8px; }.listening-stage__tools { margin-left:auto; }.listening-stage__toolbar>button,.listening-stage__tools button { padding-inline:10px; }.listening-stage__body { grid-template-columns:1fr; justify-items:center; padding:20px 18px; gap:24px; }.listening-stage__cover { width:min(240px,46vw); }.listening-stage__copy { width:100%; text-align:center; }.listening-stage__copy h2 { font-size:23px; }.listening-stage__source { margin-bottom:8px; }.listening-stage__artist { margin-top:8px; font-size:12px; }.listening-stage__lyrics { height:100px; margin-top:16px; }.listening-stage__footer { padding:10px 12px; }.listening-stage__footer span { max-width:22ch; font-size:10px; }.listening-stage--lyrics .listening-stage__lyrics { height:220px; } }
.stage-settings fieldset{border:0;border-top:1px solid var(--sr-color-line);padding:14px 0 0;margin:20px 0}.stage-settings legend{font-size:11px;letter-spacing:1px;color:var(--sr-color-text-muted)}.stage-settings :deep(.sr-select){width:100%;min-width:0}.listening-stage__lyrics{height:clamp(200px,36vh,400px)}.listening-stage--lyrics .listening-stage__lyrics{height:clamp(260px,48vh,520px)}@media(max-width:800px){.listening-stage__lyrics{height:240px}.listening-stage--lyrics .listening-stage__lyrics{height:340px}}
.stage-offset{display:flex;gap:8px;margin-top:14px}.stage-offset button{flex:1}
</style>
