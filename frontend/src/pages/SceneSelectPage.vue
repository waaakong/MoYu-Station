<template>
  <main class="scene-page">
    <SceneBackground v-if="!shellBackdrop" />
    <div class="scene-page__shade"></div>
    <div class="scene-page__grain"></div>

    <section class="scene-page__content">
      <div class="scene-page__kicker" data-motion-copy>CHOOSE A SCENE · {{ activeTime.name }}</div>

      <section class="scene-page__hero" data-motion-group aria-labelledby="scene-title">
        <p class="scene-page__scene-name">{{ activeScene.name }}</p>
        <h1 id="scene-title">先选一扇窗<br />再开始专注</h1>
        <p class="scene-page__intro">每个场景都有自己的光线、氛围和声音暗示。选一个让你愿意停留的地方，再让时间把它调成此刻最舒服的样子。</p>
        <p class="scene-page__shortcuts" aria-label="键盘快捷键">← → 切换场景&nbsp;&nbsp; Shift + ← → 切换时段&nbsp;&nbsp; F 切换跟随</p>
        <QuickFocus />
      </section>

      <aside class="panel-stack" data-motion-group aria-label="场景设置">
        <section class="scene-panel sr-glass">
          <div class="panel-head">
            <div class="panel-head__title">
              <span>六处风景</span>
              <strong>选择你的窗景</strong>
            </div>
            <PrivateSceneEditor />
          </div>
          <ScenePicker />
          <button class="enter-scene" type="button" @click="enterFocusPage">
            <span>进入这个场景</span><AppIcon name="external" />
          </button>
        </section>

        <section class="time-panel sr-glass">
          <SceneTimeControls />
        </section>
      </aside>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, inject, onMounted } from "vue";
import { shellBackdropKey } from "../components/scenes/shellBackdrop";
const shellBackdrop = inject(shellBackdropKey, false);
import { useRoute, useRouter } from "vue-router";
import SceneBackground from "../components/scenes/SceneBackground.vue";
import ScenePicker from "../components/scenes/ScenePicker.vue";
import SceneTimeControls from "../components/scenes/SceneTimeControls.vue";
import QuickFocus from '../components/focus/QuickFocus.vue';
import PrivateSceneEditor from '../components/scenes/PrivateSceneEditor.vue';
import { useSceneShortcuts } from "../composables/useSceneShortcuts";
import { scenes, timePoints } from "../data/scenes";
import type { SceneKey, SceneTimeKey } from "../scenes/sceneAssetCatalog";
import { useSceneStore } from "../stores/scene";

const router = useRouter();
const route = useRoute();
const scene = useSceneStore();

useSceneShortcuts();

const activeScene = computed(() => scenes.find((item) => item.key === scene.sceneKey) || scenes[0]);
const activeTime = computed(() => timePoints.find((item) => item.key === scene.timeKey) || timePoints[0]);

function absorbLegacyQuery() {
  const validScene = scenes.some((item) => item.key === route.query.scene);
  const validTime = timePoints.some((item) => item.key === route.query.time);
  if (validScene) scene.setScene(route.query.scene as SceneKey);
  if (validTime) scene.setTime(route.query.time as SceneTimeKey);
  if (route.query.scene || route.query.time) void router.replace({ name: "scene" });
}

function enterFocusPage() {
  void router.push({ name: "focus" });
}

onMounted(absorbLegacyQuery);
</script>

<style scoped>
.scene-page { position:relative; width:100%; height:100%; min-height:0; overflow:hidden; background:var(--sr-color-canvas); color:var(--sr-color-text); }
.scene-page__shade,.scene-page__grain { position:absolute; inset:0; z-index:2; pointer-events:none; }
.scene-page__shade { background:linear-gradient(90deg,rgba(5,12,9,.66),rgba(5,12,9,.14) 54%,rgba(5,12,9,.28)),linear-gradient(0deg,rgba(5,12,9,.35),transparent 60%); }
.scene-page__grain { opacity:.035; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
.scene-page__content { position:relative; z-index:3; display:grid; grid-template-columns:minmax(0,1fr) minmax(330px,390px); grid-template-rows:auto minmax(0,1fr); gap:18px 32px; height:100%; padding:24px var(--sr-page-gutter); box-sizing:border-box; }
.scene-page__kicker { grid-column:1/-1; color:#d3ddd5; font-size:11px; font-weight:600; letter-spacing:.12em; }
.scene-page__hero { align-self:center; min-width:0; padding-block:16px; text-shadow:0 2px 18px #07110d66; }
.scene-page__scene-name { margin:0 0 18px; color:#d3ddd5; font-size:13px; font-weight:600; letter-spacing:.08em; }
.scene-page__hero h1 { margin:0; font-family:var(--sr-font-display); font-size:clamp(40px,4.4vw,72px); font-weight:600; line-height:1.15; letter-spacing:-.04em; text-wrap:balance; }
.scene-page__intro { max-width:38em; margin:22px 0 0; color:#dce3dd; font-size:14px; line-height:1.85; text-wrap:pretty; }
.scene-page__shortcuts { margin:16px 0 0; color:#c0ccc3; font-size:11px; line-height:1.8; }
.panel-stack { display:grid; grid-template-rows:minmax(260px,1fr) auto; gap:12px; min-height:0; overflow:auto; padding-right:4px; scrollbar-width:thin; scrollbar-color:#a6b9ac55 transparent; scrollbar-gutter:stable; overscroll-behavior:contain; }
.scene-panel,.time-panel { border:1px solid #dce9de24; border-radius:var(--sr-radius-panel,20px); background:rgba(16,27,22,.85); box-shadow:0 12px 36px #04100930,inset 0 1px #ffffff0a; backdrop-filter:blur(16px); }
.scene-panel { display:grid; grid-template-rows:auto minmax(0,1fr) auto; gap:12px; min-height:260px; padding:16px 10px 10px; box-sizing:border-box; }
.time-panel { padding:14px; }
.panel-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-inline:8px; }
.panel-head__title { display:grid; gap:5px; min-width:0; }
.panel-head span { color:var(--sr-color-text-muted); font-size:11px; }
.panel-head strong { font-size:15px; font-weight:600; }
.enter-scene { display:flex; align-items:center; justify-content:space-between; gap:12px; width:100%; min-height:44px; padding:10px 16px; border:0; border-radius:var(--sr-radius-control,12px); background:var(--sr-color-accent); color:var(--sr-color-accent-ink); font-size:13px; font-weight:600; cursor:pointer; transition:opacity 140ms ease,transform 140ms var(--sr-ease-out); }
.enter-scene:active { transform:scale(.98); }
.enter-scene:focus-visible { outline:2px solid var(--sr-color-focus,#b6d7bd); outline-offset:3px; }
@media(hover:hover) and (pointer:fine) { .enter-scene:hover { opacity:.9; } }
.sr-reduced-transparency .scene-panel,.sr-reduced-transparency .time-panel,.sr-low-performance .scene-panel,.sr-low-performance .time-panel { background:#14231b; backdrop-filter:none; }
.sr-low-performance .scene-page__grain { display:none; }
@media(max-height:760px) and (min-width:801px) { .scene-page__content { gap:12px 24px; padding-block:14px; } .scene-page__hero h1 { font-size:clamp(38px,4.1vw,58px); } .scene-page__intro { margin-top:16px; font-size:13px; line-height:1.7; } .scene-page__shortcuts { display:none; } .time-panel { padding:10px 12px; } }
@media(max-width:1100px) and (min-width:801px) { .scene-page__content { grid-template-columns:minmax(0,1fr) 350px; gap:14px 24px; } }
@media(max-width:800px) { .scene-page__content { display:flex; flex-direction:column; overflow:auto; padding:20px 16px; gap:24px; overscroll-behavior:contain; } .scene-page__hero { align-self:stretch; padding:0; } .scene-page__hero h1 { font-size:42px; } .scene-page__scene-name { margin-bottom:12px; } .scene-page__intro { margin-top:16px; } .scene-page__shortcuts { display:none; } .panel-stack { flex:0 0 auto; grid-template-rows:340px auto; } }
@media(prefers-reduced-motion:reduce) { .enter-scene { transition:none; } .enter-scene:active { transform:none; } }
</style>
