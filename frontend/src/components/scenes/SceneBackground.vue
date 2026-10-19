<template>
  <div
    class="scene-background"
    :class="{ 'scene-background--quiet': quietMotion }"
    :data-scene="scene.sceneKey"
    :data-time="scene.timeKey"
    data-scene-background
    aria-hidden="true"
  >
    <picture
      v-for="(layer, index) in layers"
      :key="layer.id"
      class="scene-background__layer"
      :class="{ 'scene-background__layer--active': index === activeLayerIndex, 'scene-background__layer--placeholder': layer.placeholder }"
      :data-layer-scene="layer.sceneKey"
      :data-layer-time="layer.timeKey"
    >
      <source v-if="layer.webp" :srcset="layer.webp" type="image/webp" />
      <img :src="layer.jpg" alt="" draggable="false" />
    </picture>
    <PrivateSceneBackground />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { scenes } from "../../data/scenes";
import { sceneAssetCatalog, type SceneKey, type SceneTimeKey } from "../../scenes/sceneAssetCatalog";
import { createSceneIdlePrefetcher, loadSceneAsset } from "../../scenes/sceneAssetLoader";
import { useSceneStore } from "../../stores/scene";
import { useShellStore } from "../../stores/shell";
import PrivateSceneBackground from './PrivateSceneBackground.vue';

interface BackgroundLayer {
  id: number;
  sceneKey: SceneKey;
  timeKey: SceneTimeKey;
  webp: string;
  jpg: string;
  placeholder: boolean;
}

const scene = useSceneStore();
const shell = useShellStore();
const quietMotion = computed(() => shell.preferences.reducedMotion || shell.preferences.lowPerformance);
const initialThumb = sceneAssetCatalog[scene.sceneKey][scene.timeKey].thumb;
const layers = ref<[BackgroundLayer, BackgroundLayer]>([
  { id: 1, sceneKey: scene.sceneKey, timeKey: scene.timeKey, webp: initialThumb.webp, jpg: initialThumb.jpg, placeholder: true },
  { id: 2, sceneKey: scene.sceneKey, timeKey: scene.timeKey, webp: initialThumb.webp, jpg: initialThumb.jpg, placeholder: true }
]);
const activeLayerIndex = ref(0);
let operationToken = 0;
let layerId = 2;
let transitionTimer = 0;
const idlePrefetcher = createSceneIdlePrefetcher();

function scheduleAdjacentScenes(sceneKey: SceneKey, timeKey: SceneTimeKey) {
  if (shell.preferences.lowPerformance || document.visibilityState === "hidden") {
    idlePrefetcher.cancel();
    return;
  }
  const index = scenes.findIndex((entry) => entry.key === sceneKey);
  const previous = scenes[(index - 1 + scenes.length) % scenes.length].key;
  const next = scenes[(index + 1) % scenes.length].key;
  idlePrefetcher.schedule([
    sceneAssetCatalog[previous][timeKey][scene.preferredSize],
    sceneAssetCatalog[next][timeKey][scene.preferredSize]
  ]);
}

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") idlePrefetcher.cancel();
  else scheduleAdjacentScenes(scene.sceneKey, scene.timeKey);
}

document.addEventListener("visibilitychange", handleVisibilityChange);

watch(
  () => [scene.sceneKey, scene.timeKey, scene.preferredSize] as const,
  async ([sceneKey, timeKey, size]) => {
    const token = ++operationToken;
    const nextAssets = sceneAssetCatalog[sceneKey][timeKey][size];
    try {
      const resolved = await loadSceneAsset(nextAssets);
      if (token !== operationToken) return;

      const nextIndex = activeLayerIndex.value === 0 ? 1 : 0;
      layers.value[nextIndex] = {
        id: ++layerId,
        sceneKey,
        timeKey,
        webp: resolved === nextAssets.webp ? nextAssets.webp : "",
        jpg: nextAssets.jpg,
        placeholder: false
      };
      window.clearTimeout(transitionTimer);
      requestAnimationFrame(() => {
        if (token !== operationToken) return;
        activeLayerIndex.value = nextIndex;
      });
      scheduleAdjacentScenes(sceneKey, timeKey);
      transitionTimer = window.setTimeout(() => {
        const staleIndex = nextIndex === 0 ? 1 : 0;
        layers.value[staleIndex] = { ...layers.value[nextIndex], id: ++layerId };
      }, quietMotion.value ? 320 : 760);
    } catch {
      if (token === operationToken) shell.toast("场景图片加载失败，已保留上一张背景。", "error");
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  operationToken += 1;
  window.clearTimeout(transitionTimer);
  idlePrefetcher.dispose();
  document.removeEventListener("visibilitychange", handleVisibilityChange);
});
</script>

<style scoped>
.scene-background,
.scene-background__layer,
.scene-background__layer img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.scene-background {
  overflow: hidden;
  background: #101513;
}

.scene-background__layer {
  display: block;
  opacity: 0;
  transform: scale(1.025);
  transition: opacity 700ms ease, transform 900ms cubic-bezier(.22, 1, .36, 1);
  will-change: opacity, transform;
}

.scene-background__layer img {
  object-fit: cover;
  object-position: center;
  user-select: none;
}

.scene-background__layer--placeholder img {
  filter: blur(14px) saturate(.92);
  transform: scale(1.04);
}

.scene-background__layer--active {
  z-index: 1;
  opacity: 1;
  transform: scale(1);
}

.scene-background--quiet .scene-background__layer {
  transition-duration: 280ms;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .scene-background__layer {
    transition-duration: 120ms;
    transform: none;
  }
}
</style>
