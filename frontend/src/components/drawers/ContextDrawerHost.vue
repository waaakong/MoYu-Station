<template>
    <dialog ref="modal" class="drawer-layer" aria-labelledby="drawer-title" @click.self="close" @cancel.prevent.stop="close" @keydown="handleKeydown" @close="emit('closed')">
      <aside
        id="context-drawer"
        ref="drawer"
        class="context-drawer sr-glass sr-glass--floating"
        tabindex="-1"
      >
        <header class="context-drawer__header">
          <div>
            <span>WORKSPACE</span>
            <h2 id="drawer-title">外观与性能</h2>
          </div>
          <button type="button" aria-label="关闭面板" @click="close"><AppIcon name="close" /></button>
        </header>

        <p class="context-drawer__intro">这些设置只保存在当前设备，不会创建云端游客账号。</p>
        <p v-if="preferenceError" class="context-drawer__error" role="alert">{{ preferenceError }}</p>

        <section class="context-drawer__group" aria-labelledby="layout-settings">
          <h3 id="layout-settings">布局</h3>
          <label class="setting-row">
            <span><strong>紧凑布局</strong><small>缩减间距，适合 1280×720 窗口</small></span>
            <input
              type="checkbox"
              :checked="shell.preferences.compact"
              @change="setPreference('compact', $event)"
            />
          </label>
          <label class="setting-row">
            <span><strong>沉浸模式</strong><small>暂时隐藏导航与播放器</small></span>
            <input type="checkbox" :checked="shell.immersive" @change="setImmersive" />
          </label>
        </section>

        <section class="context-drawer__group" aria-labelledby="performance-settings">
          <h3 id="performance-settings">辅助与性能</h3>
          <label v-if="isDesktop" class="setting-row">
            <span><strong>启动开屏动画</strong><small>下次启动时生效，准备好后自动进入</small></span>
            <input type="checkbox" :checked="shell.preferences.startupAnimation" @change="setPreference('startupAnimation', $event)" />
          </label>
          <label class="setting-row">
            <span><strong>减少动态</strong><small>禁用非必要转场与循环动画</small></span>
            <input
              type="checkbox"
              :checked="shell.preferences.reducedMotion"
              @change="setPreference('reducedMotion', $event)"
            />
          </label>
          <label class="setting-row">
            <span><strong>减少透明度</strong><small>使用实色面板增强可读性</small></span>
            <input
              type="checkbox"
              :checked="shell.preferences.reducedTransparency"
              @change="setPreference('reducedTransparency', $event)"
            />
          </label>
          <label class="setting-row">
            <span><strong>低性能模式</strong><small>关闭模糊与高成本视觉效果</small></span>
            <input
              type="checkbox"
              :checked="shell.preferences.lowPerformance"
              @change="setPreference('lowPerformance', $event)"
            />
          </label>
        </section>
        <WindowBehaviorSettings />
      </aside>
    </dialog>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { useShellStore } from "../../stores/shell";
import WindowBehaviorSettings from "../window/WindowBehaviorSettings.vue";
import { closeMotionDialog, openMotionDialog } from '../../motion/runtime';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ (event: "close"): void; (event: "closed"): void }>();
const shell = useShellStore();
const isDesktop = Boolean(window.studyRoomDesktop);
const drawer = ref<HTMLElement>();
const modal = ref<HTMLDialogElement>();
const preferenceError = ref('');

function close() {
  emit("close");
}

function setPreference(key: "compact" | "reducedMotion" | "reducedTransparency" | "lowPerformance" | "startupAnimation", event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  preferenceError.value = '';
  try { shell.updatePreference(key, input.checked); }
  catch { input.checked = shell.preferences[key]; preferenceError.value = '设置未能保存在本机，请重试。'; }
}

function setImmersive(event: Event) {
  shell.setImmersive((event.currentTarget as HTMLInputElement).checked);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && props.open) { event.preventDefault(); event.stopPropagation(); close(); }
  if (event.key !== 'Tab') return;
  const controls = Array.from(drawer.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]') || []).filter(element => element.getClientRects().length > 0);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === drawer.value)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick();
      if (!props.open || !modal.value?.isConnected) return;
      openMotionDialog(modal.value, 'right');
      drawer.value?.focus();
    } else {
      closeMotionDialog(modal.value);
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => closeMotionDialog(modal.value, true));
</script>

<style scoped>
.drawer-layer {
  position: fixed;
  z-index: var(--sr-layer-drawer);
  inset: 12px 12px 12px auto;
  width: var(--sr-drawer-width);
  max-width: calc(100vw - 24px);
  max-height: calc(100dvh - 24px);
  height: calc(100dvh - 24px);
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--sr-radius-panel);
  color: var(--sr-color-text);
  background: transparent;
  overflow: visible;
}
.drawer-layer::backdrop{background:#050b085e}

.context-drawer {
  height:100%;
  width:100%;
  overflow: auto;
  overscroll-behavior: contain;
  border-radius: var(--sr-radius-panel);
  padding: 24px;
}

.context-drawer__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.context-drawer__header span {
  color: rgba(255,255,255,.6);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
}

.context-drawer__header h2 {
  margin: 6px 0 0;
  font-family: var(--sr-font-display);
  font-size: 27px;
  font-weight: 500;
}

.context-drawer__header button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border: 1px solid var(--sr-color-line);
  border-radius: 50%;
  background: transparent;
  color: var(--sr-color-text-muted);
  cursor: pointer;
}

.context-drawer__intro {
  margin: 14px 0 26px;
  color: var(--sr-color-text-muted);
  font-size: 13px;
  line-height: 1.7;
}

.context-drawer__group {
  margin-top: 20px;
}

.context-drawer__group h3 {
  margin: 0 0 8px;
  color: var(--sr-color-text-faint);
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.setting-row {
  min-height: 76px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-top: 1px solid var(--sr-color-line);
  cursor: pointer;
}

.setting-row span {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-row strong {
  font-size: 14px;
  font-weight: 600;
}

.setting-row small {
  color: var(--sr-color-text-faint);
  font-size: 12px;
  line-height: 1.5;
}

.setting-row input {
  appearance:none;
  position:relative;
  flex-shrink:0;
  width:44px;
  height:28px;
  margin:0;
  border:1px solid var(--sr-color-line-strong);
  border-radius:18px;
  background:var(--sr-color-surface-raised);
  cursor:pointer;
  transition:background-color var(--sr-motion-fast) ease;
}
.setting-row input::after{content:'';position:absolute;width:20px;height:20px;left:3px;top:3px;border-radius:50%;background:var(--sr-color-text);box-shadow:0 1px 3px #0004;transition:transform 180ms var(--sr-ease-out)}
.setting-row input:checked{background:#476a94;border-color:#9fbee4}
.setting-row input:checked::after{transform:translateX(16px)}
@media(max-width:600px){.drawer-layer{inset:12px;width:calc(100vw - 24px)}.context-drawer{padding:20px}}
@media(prefers-reduced-motion:reduce){.drawer-layer[open]{animation:none}.setting-row input::after{transition:none}}
.sr-reduced-motion .drawer-layer[open]{animation:none}
.sr-reduced-motion .setting-row input::after{transition:none}

.context-drawer__error{font-size:13px;color:var(--sr-color-danger);line-height:1.6}
</style>
