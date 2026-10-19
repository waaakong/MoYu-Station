<template>
  <section v-if="available" class="window-settings" aria-labelledby="window-settings-title">
    <h3 id="window-settings-title">窗口行为</h3>
    <label for="window-close-behavior">关闭主窗口时</label>
    <AppSelect id="window-close-behavior" :value="state.snapshot?.closeBehavior || 'ask'" :disabled="!state.snapshot || state.pending" @change="change">
      <option value="ask">每次询问</option><option value="tray">隐藏到托盘</option><option value="quit">退出程序</option>
    </AppSelect>
    <p>仅保存在这台电脑，可随时改回“每次询问”。</p>
    <p v-if="state.error" role="alert">{{ state.error }} <button type="button" @click="retry">重试</button></p>
  </section>
</template>
<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { WindowCloseBehavior } from "@studyroom/contracts";
import { useDesktopWindowStore } from "../../stores/desktopWindow";
const state = useDesktopWindowStore();
const available = Boolean(window.studyRoomDesktop?.readWindowState);
const desired = ref<WindowCloseBehavior>("ask");
async function change(event: Event) {
  desired.value = (event.target as HTMLSelectElement).value as WindowCloseBehavior;
  await state.setBehavior(desired.value);
  (event.target as HTMLSelectElement).value = state.snapshot?.closeBehavior ?? "ask";
}
function retry() { void state.setBehavior(desired.value); }
onMounted(() => { if (available) void state.refresh().catch(() => { state.error = "无法读取窗口偏好。"; }); });
</script>
<style scoped>
.window-settings{margin-top:24px;border-top:1px solid #ffffff20;padding-top:18px;color:var(--sr-color-text)}
h3{margin:0 0 16px;font-size:14px}label{display:block;font-size:13px;margin-bottom:8px}
.sr-select{width:100%}
select:focus-visible,button:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:2px}p{font-size:12px;line-height:1.6;color:var(--sr-color-text-muted)}
button{border:0;background:none;color:var(--sr-color-accent);text-decoration:underline;padding:8px;cursor:pointer}
</style>
