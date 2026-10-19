<template>
  <header v-if="isDesktop" class="window-chrome" :class="{ 'sr-glass': !integrated && !floating, 'window-chrome--integrated': integrated, 'window-chrome--floating': floating, 'window-chrome--inactive': state.snapshot && !state.snapshot.focused }">
    <span v-if="!integrated && !floating" class="window-chrome__brand">墨屿</span>
    <div class="window-chrome__controls" :class="{ 'sr-glass': integrated || floating }" role="group" aria-label="窗口控制">
      <button type="button" aria-label="最小化窗口" title="最小化" @click="run('minimizeWindow')"><AppIcon name="minus" /></button>
      <button type="button" :aria-label="state.snapshot?.maximized ? '还原窗口' : '最大化窗口'" :title="state.snapshot?.maximized ? '还原' : '最大化'" @click="run('toggleMaximizeWindow')">
        <AppIcon :name="state.snapshot?.maximized ? 'restore' : 'maximize'" />
      </button>
      <button class="window-chrome__close" type="button" aria-label="关闭窗口" title="关闭" @click="run('closeWindow')"><AppIcon name="close" /></button>
    </div>
    <span v-if="error" class="window-chrome__error" role="alert">{{ error }}</span>
  </header>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { useDesktopWindowStore } from "../../stores/desktopWindow";
defineProps<{ integrated?: boolean; floating?: boolean }>();
const isDesktop = Boolean(window.studyRoomDesktop);
const state = useDesktopWindowStore();
const error = ref("");
async function run(command: "minimizeWindow" | "toggleMaximizeWindow" | "closeWindow") {
  error.value = "";
  try { await window.studyRoomDesktop?.[command](); }
  catch { error.value = "窗口操作未完成，请重试。"; }
}
</script>
<style scoped>
.window-chrome{height:44px;display:flex;align-items:center;justify-content:space-between;background:var(--sr-color-surface-solid);color:var(--sr-color-text);user-select:none;-webkit-app-region:drag}
.window-chrome--integrated{height:44px;background:transparent;justify-content:flex-end}
.window-chrome--floating{position:relative;z-index:var(--sr-layer-rail);background:transparent;justify-content:flex-end}
.window-chrome__brand{padding-inline:20px;font-size:13px;letter-spacing:.12em}
.window-chrome__controls{display:flex;align-items:center;-webkit-app-region:no-drag}
.window-chrome--integrated .window-chrome__controls,.window-chrome--floating .window-chrome__controls{border:1px solid var(--sr-material-edge);border-radius:999px;padding:0 3px}
.window-chrome__controls button{display:grid;place-items:center;width:46px;height:44px;border:0;border-radius:8px;background:transparent;color:inherit;cursor:default;transition:background-color 120ms ease,color 120ms ease}
.window-chrome__controls svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.window-chrome--inactive{color:var(--sr-color-text-faint)}
.window-chrome__controls button:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:-4px}
.window-chrome__controls button:active{background:#ffffff24}
.window-chrome__error{position:fixed;top:60px;right:16px;padding:12px;background:#592d2b;z-index:9999;-webkit-app-region:no-drag}
@media(hover:hover){.window-chrome__controls button:hover{background:#ffffff14}.window-chrome__controls .window-chrome__close:hover{background:#b33436;color:#fff}}
@media(prefers-reduced-motion:reduce){.window-chrome__controls button{transition:none}}
.sr-reduced-motion .window-chrome__controls button{transition:none}
</style>
