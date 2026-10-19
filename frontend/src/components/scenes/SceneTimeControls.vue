<template>
  <section class="scene-time-controls" aria-label="场景时间">
    <div class="scene-time-controls__head">
      <div>
        <span class="scene-time-controls__eyebrow">光影时间</span>
        <strong>{{ activeTime.name }}</strong>
      </div>
      <span class="scene-time-controls__clock">{{ activeMode.label }}</span>
    </div>

    <div class="scene-time-controls__times" role="group" aria-label="场景时段">
      <button
        v-for="time in timePoints"
        :key="time.key"
        type="button"
        :aria-label="time.name"
        :aria-pressed="scene.timeKey === time.key"
        :class="{ active: scene.timeKey === time.key }"
        @click="scene.setTime(time.key)"
      >
        {{ time.name }}
      </button>
    </div>

    <div class="scene-time-controls__modes" role="group" aria-label="时间跟随模式">
      <button
        v-for="mode in modes"
        :key="mode.key"
        type="button"
        :aria-pressed="scene.timeMode === mode.key"
        :class="{ active: scene.timeMode === mode.key }"
        @click="scene.setMode(mode.key)"
      >
        {{ mode.label }}
      </button>
    </div>
    <p class="scene-time-controls__hint">{{ activeMode.description }}</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { timePoints } from "../../data/scenes";
import type { SceneTimeMode } from "../../scenes/sceneAssetCatalog";
import { useSceneStore } from "../../stores/scene";

const scene = useSceneStore();
const modes: Array<{ key: SceneTimeMode; label: string; description: string }> = [
  { key: "manual", label: "手动", description: "光线保持不变，直到你再次选择。" },
  { key: "smart", label: "智能跟随", description: "专注开始后锁定当前光线，结束后继续跟随。" },
  { key: "always", label: "始终跟随", description: "即使正在专注，也会随系统时间切换。" }
];
const activeTime = computed(() => timePoints.find((time) => time.key === scene.timeKey) || timePoints[0]);
const activeMode = computed(() => modes.find((mode) => mode.key === scene.timeMode) || modes[0]);
</script>

<style scoped>
.scene-time-controls { display:grid; gap:12px; }
.scene-time-controls__head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.scene-time-controls__head>div { display:flex; align-items:center; gap:10px; }
.scene-time-controls__eyebrow,.scene-time-controls__clock { color:var(--sr-color-text-muted); font-size:11px; }
.scene-time-controls__head strong { font-size:14px; font-weight:600; }
.scene-time-controls__times,.scene-time-controls__modes { display:grid; gap:2px; padding:3px; border:1px solid #ffffff1c; border-radius:999px; background:linear-gradient(145deg,#ffffff0e,#ffffff04); box-shadow:inset 0 1px #ffffff10; }
.scene-time-controls__times { grid-template-columns:repeat(7,minmax(0,1fr)); }
.scene-time-controls__modes { grid-template-columns:repeat(3,minmax(0,1fr)); }
.scene-time-controls button { min-width:0; min-height:44px; padding:4px 2px; border:0; border-radius:999px; color:var(--sr-color-text-muted); background:transparent; font:600 11px/1.3 var(--sr-font-sans); cursor:pointer; transition:background-color 160ms ease,color 160ms ease,box-shadow 160ms ease; }
.scene-time-controls button.active { background:var(--sr-color-accent); color:var(--sr-color-accent-ink); box-shadow:inset 0 1px #fff9,0 2px 8px #0002; }
.scene-time-controls button:focus-visible { outline:2px solid var(--sr-color-focus,#b6d7bd); outline-offset:1px; }
.scene-time-controls__hint { min-height:32px; margin:0; color:var(--sr-color-text-muted); font-size:11px; line-height:1.5; text-wrap:pretty; }
@media(hover:hover) and (pointer:fine) { .scene-time-controls button:not(.active):hover { background:var(--sr-color-hover); color:var(--sr-color-text); } }
.scene-time-controls button:not(.active):active { background:#ffffff24; }
@media(prefers-reduced-motion:reduce) { .scene-time-controls button { transition:none; } }
</style>
