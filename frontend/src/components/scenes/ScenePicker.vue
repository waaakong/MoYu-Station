<template>
  <div class="scene-picker" role="list" aria-label="内置场景">
    <div v-for="item in scenes" :key="item.key" role="listitem">
      <button
        class="scene-picker__item"
        :class="{ 'scene-picker__item--active': item.key === scene.sceneKey }"
        type="button"
        :aria-label="`${item.name}：${item.desc}`"
        :aria-pressed="item.key === scene.sceneKey"
        @click="scene.setScene(item.key)"
      >
        <picture class="scene-picker__thumb" aria-hidden="true">
          <source :srcset="item.assets[scene.timeKey].thumb.webp" type="image/webp" />
          <img :src="item.assets[scene.timeKey].thumb.jpg" alt="" draggable="false" />
        </picture>
        <span class="scene-picker__copy">
          <strong>{{ item.name }}</strong>
          <small>{{ item.desc }}</small>
        </span>
        <span v-if="item.key === scene.sceneKey" class="scene-picker__selected">已选</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { scenes } from "../../data/scenes";
import { useSceneStore } from "../../stores/scene";

const scene = useSceneStore();
</script>

<style scoped>
.scene-picker { display:grid; gap:6px; min-height:0; padding:2px 5px 4px; overflow:auto; scrollbar-gutter:stable; scrollbar-width:thin; scrollbar-color:#a6b9ac55 transparent; overscroll-behavior:contain; }
.scene-picker__item { display:grid; grid-template-columns:78px minmax(0,1fr) auto; align-items:center; gap:12px; width:100%; min-height:72px; padding:8px; border:1px solid transparent; border-radius:var(--sr-radius-control,12px); background:transparent; color:var(--sr-color-text); text-align:left; cursor:pointer; transition:background 140ms ease,border-color 140ms ease; }
.scene-picker__item { background:linear-gradient(145deg,#ffffff0e,#ffffff05); border-color:#ffffff12; }
.scene-picker__item--active { border-color:#ffffff88; background:linear-gradient(145deg,#ffffff38,#ffffff1a); box-shadow:inset 0 1px #ffffff30; }
.scene-picker__item:focus-visible { outline:2px solid var(--sr-color-focus,#b6d7bd); outline-offset:1px; }
.scene-picker__thumb { display:block; width:78px; height:54px; overflow:hidden; border-radius:8px; background:#ffffff0a; }
.scene-picker__thumb img { width:100%; height:100%; object-fit:cover; }
.scene-picker__copy { display:grid; gap:5px; min-width:0; }
.scene-picker__copy strong { font-size:14px; font-weight:600; }
.scene-picker__copy small { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--sr-color-text-muted); font-size:11px; line-height:1.5; }
.scene-picker__selected { color:var(--sr-color-text); font-size:11px; font-weight:600; padding-inline:3px; }
@media(hover:hover) and (pointer:fine) { .scene-picker__item:hover { background:var(--sr-color-hover); } }
</style>
