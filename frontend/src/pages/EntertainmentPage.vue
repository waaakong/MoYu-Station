<template>
  <main class="entertainment-page" :class="{ 'solid-background': store.preferences.solidBackground, quiet: reducedMotion }">
    <SceneBackground v-if="!shellBackdrop && !store.preferences.solidBackground" />
    <div class="backdrop"></div>
    <p v-if="!store.initialized" class="local-loading" role="status">正在读取本机游戏进度…</p>

    <section v-if="shell.bossMode" class="boss-panel sr-glass sr-glass--floating" aria-label="老板模式">
      <time :datetime="clock.toISOString()">{{ clockText }}</time>
      <p>{{ dateText }}</p>
      <button type="button" @click="setBossMode(false)">返回娱乐空间</button>
      <small>按 Escape 返回</small>
    </section>

    <section v-else class="workspace sr-glass sr-glass--reading" data-motion-group :class="{ 'workspace--tool': activeTool }" :inert="!store.initialized || undefined">
      <header class="page-head">
        <div>
          <button v-if="activeTool" class="back-button sr-glass" type="button" @click="closeTool"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 6-6 6 6 6" /></svg>返回</button>
          <h1>{{ activeTool ? activeTitle : "休息一下" }}</h1>
          <p v-if="!activeTool">不追赶进度，也不留下成绩。选一件小事，让思绪松开一会儿。</p>
        </div>
        <div class="page-tools">
          <button class="boss-button sr-glass" type="button" @click="setBossMode(true)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7M4 9h16v10H4zM4 12h16" /></svg>老板模式</button>
          <button class="sr-glass" type="button" :aria-pressed="!store.preferences.soundEnabled" @click="store.setPreference('soundEnabled', !store.preferences.soundEnabled)">{{ store.preferences.soundEnabled ? "关闭音效" : "开启音效" }}</button>
          <button class="sr-glass" type="button" :aria-pressed="reducedMotion" @click="store.setPreference('reducedMotion', !store.preferences.reducedMotion)">减少动态</button>
          <button class="sr-glass" type="button" :aria-pressed="store.preferences.solidBackground" @click="store.setPreference('solidBackground', !store.preferences.solidBackground)">实色背景</button>
        </div>
      </header>

      <p v-if="store.errorCode" class="state-error" role="status">{{ errorMessage }}</p>

      <div v-motion-content="activeTool" class="content-stage">
        <EntertainmentHub v-if="!activeTool" @open="openTool" />
        <BreathingTool v-else-if="activeTool === 'breathing'" :paused="store.paused" :reduced-motion="reducedMotion" />
        <WoodenFishTool v-else-if="activeTool === 'wooden-fish'" :paused="store.paused" :reduced-motion="reducedMotion" />
        <AmbientQuickTool v-else-if="activeTool === 'ambient-quick'" />
        <MemoryCardsTool v-else-if="activeTool === 'memory-cards'" :paused="store.paused" :reduced-motion="reducedMotion" />
        <ClassicGameTool v-else-if="classicTool" :key="classicTool" :tool-id="classicTool" :paused="store.paused" />
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import {CLASSIC_GAME_IDS,type ClassicGameId,type EntertainmentToolId} from "@studyroom/contracts";
import { computed, defineAsyncComponent, inject, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { shellBackdropKey } from "../components/scenes/shellBackdrop";
const shellBackdrop = inject(shellBackdropKey, false);
import SceneBackground from "../components/scenes/SceneBackground.vue";
import { entertainmentAudio } from "../entertainment/audioController";
import { bindEntertainmentLifecycle } from "../entertainment/lifecycle";
import { useEntertainmentStore } from "../stores/entertainment";
import { useShellStore } from "../stores/shell";
import EntertainmentHub from "./entertainment/EntertainmentHub.vue";
import BreathingTool from "./entertainment/BreathingTool.vue";
import WoodenFishTool from "./entertainment/WoodenFishTool.vue";
import AmbientQuickTool from "./entertainment/AmbientQuickTool.vue";
import MemoryCardsTool from "./entertainment/MemoryCardsTool.vue";
const ClassicGameTool=defineAsyncComponent(()=>import('./entertainment/ClassicGameTool.vue'));

type EntertainmentPanelId = Exclude<EntertainmentToolId, "fish-sorting"> | "ambient-quick";
const store = useEntertainmentStore();
const shell = useShellStore();
const activeTool = ref<EntertainmentPanelId>();
const clock = ref(new Date());
const titles: Record<EntertainmentPanelId, string> = { breathing: "一分钟呼吸", "wooden-fish": "电子木鱼", "ambient-quick": "声音调节", "memory-cards": "摸鱼翻翻牌",puzzle:'风景拼图',game2048:'2048',minesweeper:'扫雷',spider:'蜘蛛纸牌' };
const classicTool=computed(()=>(CLASSIC_GAME_IDS as readonly string[]).includes(activeTool.value||'')?activeTool.value as ClassicGameId:undefined);
const activeTitle = computed(() => activeTool.value ? titles[activeTool.value] : "休息一下");
const reducedMotion = computed(() => store.preferences.reducedMotion || shell.motionReduced);
const clockText = computed(() => new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(clock.value));
const dateText = computed(() => new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(clock.value));
const errorMessage = computed(() => store.errorCode === "ENTERTAINMENT_STATE_READ_FAILED" ? "部分本地进度未能读取，已使用安全初始状态。" : "本地进度暂未保存，本次使用仍可继续。" );
let cleanupLifecycle: (() => void) | undefined;
let clockTimer = 0;
let disposed = false;

function openTool(toolId: EntertainmentPanelId) {
  activeTool.value = toolId;
  if (toolId !== "ambient-quick") store.enterTool(toolId);
}
function closeTool() { activeTool.value = undefined; store.leaveTool(); entertainmentAudio.release("active-tool"); }
function setBossMode(active: boolean) { shell.setBossMode(active); store.setPauseReason("boss-mode", active); }
function handleKeydown(event: KeyboardEvent) { if (event.key === "Escape" && shell.bossMode) setBossMode(false); }
function syncAudio() {
  entertainmentAudio.setEnabled(store.preferences.soundEnabled);
  if (store.preferences.soundEnabled && activeTool.value && activeTool.value !== "ambient-quick" && !store.paused && !shell.bossMode) entertainmentAudio.acquire("active-tool");
  else entertainmentAudio.release("active-tool");
}

watch(() => [activeTool.value, store.paused, store.preferences.soundEnabled, shell.bossMode], syncAudio, { immediate: true });
onMounted(async () => {
  await store.initialize();
  if (disposed) return;
  cleanupLifecycle = bindEntertainmentLifecycle((reason, active) => store.setPauseReason(reason, active));
  window.addEventListener("keydown", handleKeydown);
  clockTimer = window.setInterval(() => { clock.value = new Date(); }, 1_000);
});
onBeforeUnmount(() => {
  disposed = true;
  cleanupLifecycle?.();
  window.removeEventListener("keydown", handleKeydown);
  window.clearInterval(clockTimer);
  setBossMode(false);
  entertainmentAudio.releaseAll();
  void store.flush();
  store.dispose();
});
</script>

<style scoped>
.local-loading{position:absolute;z-index:5;inset:32px auto auto 32px;margin:0;padding:12px 16px;border-radius:12px;background:var(--sr-color-surface-solid);color:var(--sr-color-text)}
.workspace{grid-template-columns:minmax(0,1fr)}.content-stage{min-width:0}.content-stage>*{min-width:0}
.entertainment-page{position:relative;width:100%;height:100%;overflow:hidden;background:#101513;color:#f4f5f1}.entertainment-page.solid-background{background:#15201c}.backdrop{position:absolute;inset:0;background:linear-gradient(180deg,rgba(8,13,11,.36),rgba(8,13,11,.64));pointer-events:none}.workspace{position:absolute;inset:96px var(--sr-page-gutter) 92px;display:grid;grid-template-rows:auto minmax(0,1fr);gap:22px;overflow:hidden;padding:clamp(22px,2.5vw,36px);border-radius:28px}.page-head{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;min-height:72px}.page-head h1{margin:0;font:500 clamp(36px,4vw,58px)/1 var(--sr-font-display);letter-spacing:-.03em}.page-head p{margin:10px 0 0;color:rgba(255,255,255,.62);font-size:13px}.page-tools{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.page-tools button,.back-button{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 13px;border:1px solid rgba(255,255,255,.15);border-radius:999px;background:rgba(11,16,14,.3);color:rgba(255,255,255,.76);font:800 12px var(--sr-font-sans);cursor:pointer}.page-tools button[aria-pressed=true]{background:rgba(205,226,214,.2);border-color:rgba(224,237,229,.5);color:#fff}.page-tools .boss-button{height:42px;padding:0 17px;border-color:rgba(225,237,229,.36);color:#fff}.page-tools svg,.back-button svg{width:17px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}.back-button{margin-bottom:10px;background:transparent}.content-stage{min-height:0;overflow:hidden}.content-stage>*{height:100%;box-sizing:border-box}.state-error{position:absolute;z-index:4;top:84px;left:36px;margin:0;padding:9px 12px;border-radius:10px;background:rgba(112,70,60,.78);font-size:12px}.boss-panel{position:absolute;inset:50% auto auto 50%;display:grid;justify-items:center;gap:12px;width:min(520px,calc(100vw - 48px));padding:50px;border-radius:28px;transform:translate(-50%,-50%);text-align:center}.boss-panel time{font:500 clamp(64px,8vw,110px)/1 var(--sr-font-display);font-variant-numeric:tabular-nums}.boss-panel p{margin:0;color:rgba(255,255,255,.62)}.boss-panel button{height:40px;margin-top:20px;padding:0 18px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:#eef2ec;color:#202521;font-weight:800;cursor:pointer}.boss-panel small{color:rgba(255,255,255,.46)}@media(max-width:1365px),(max-height:760px){.workspace{inset:76px 24px 76px;gap:14px;padding:20px;border-radius:22px}.page-head{min-height:58px}.page-head h1{font-size:34px}.page-head p{margin-top:6px}.page-tools button{height:32px;padding:0 10px;font-size:11px}.page-tools .boss-button{height:36px}.workspace--tool .page-head h1{font-size:28px}}@media(max-width:900px){.page-head{display:grid}.page-tools{justify-content:flex-start}.workspace{overflow:auto}.content-stage{overflow:visible}}
.entertainment-page :deep(.scene-background){pointer-events:none}.backdrop{z-index:1}.workspace,.boss-panel{z-index:2}
.workspace{position:relative;inset:auto;width:100%;height:100%;padding:clamp(16px,2.2vw,32px);gap:18px;border:0;border-radius:0;background:rgba(15,24,20,.78);box-shadow:none;grid-template-rows:auto minmax(0,1fr)}
.page-head{min-height:0;align-items:center;gap:16px}.page-head h1{font-size:clamp(26px,3vw,40px);line-height:1.15}.page-head p{max-width:48em;line-height:1.7;color:var(--sr-color-text-muted)}
.page-tools button,.page-tools .boss-button,.back-button,.boss-panel button{height:44px;min-height:44px;border-radius:var(--sr-radius-control,12px);font-weight:600;font-size:12px;white-space:nowrap;transition:background-color 140ms ease,border-color 140ms ease,transform 120ms var(--sr-ease-out)}
.page-tools button:active:not(:disabled),.back-button:active{transform:scale(.98)}
.back-button{margin:0}.workspace--tool .page-head>div:first-child{display:flex;align-items:center;gap:12px}.state-error{position:relative;inset:auto;grid-row:2;background:#4c332b;color:#ffe4cc}.workspace:has(.state-error){grid-template-rows:auto auto minmax(0,1fr)}
.content-stage{min-height:0;overflow:auto;overscroll-behavior:contain}.content-stage:has(.classic-game){overflow:hidden}.workspace--tool .page-head h1{font-size:clamp(24px,2.5vw,34px)}
.workspace :deep(button:focus-visible),.boss-panel button:focus-visible{outline:2px solid var(--sr-color-accent);outline-offset:3px}
@media(hover:hover) and (pointer:fine){.page-tools button:hover,.back-button:hover{background:rgba(223,237,226,.12);border-color:var(--sr-color-line-strong)}}
@media(max-width:900px){.page-head{display:flex;flex-wrap:wrap}.page-tools{justify-content:flex-start}.workspace{overflow:hidden;gap:12px;padding:16px}.page-tools button{padding-inline:10px}.content-stage{overflow:auto}.content-stage>*{height:auto;min-height:100%}.content-stage:has(.classic-game)>*{height:100%}}
@media(max-width:520px){.page-head h1{font-size:28px}.page-tools{gap:6px;width:100%}.page-tools button{flex:1;padding-inline:8px;font-size:11px}.page-head p{font-size:12px}.workspace--tool .page-head>div:first-child{display:flex;align-items:center;gap:12px}.back-button{margin:0}.boss-panel{padding:28px}}
.quiet :deep(*),.quiet :deep(*::before),.quiet :deep(*::after){transition:none!important;animation:none!important}
.entertainment-page,.entertainment-page.solid-background{background:var(--sr-color-canvas);color:var(--sr-color-text)}
.backdrop{background:linear-gradient(180deg,rgba(10,15,23,.16),rgba(10,15,23,.36))}
.page-tools button,.back-button{color:var(--sr-color-text)}
.page-tools button[aria-pressed=true]{background:var(--sr-color-accent)!important;border-color:var(--sr-color-accent)!important;color:var(--sr-color-accent-ink)}
.boss-panel button{background:var(--sr-color-accent);color:var(--sr-color-accent-ink)}
.boss-panel p,.boss-panel small{color:var(--sr-color-text-muted)}
/* A changing glyph width must not expand the grid track and recenter its siblings. */
.boss-panel{grid-template-columns:minmax(0,1fr)}
.boss-panel time{width:max-content;min-width:0;white-space:nowrap}
.solid-background .sr-glass{background:var(--sr-color-surface-solid)!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
</style>
