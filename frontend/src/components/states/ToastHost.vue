<template>
  <div class="toast-host" aria-live="polite" aria-atomic="false">
    <TransitionGroup v-bind="toastMotion">
      <button
        v-for="toast in shell.toasts"
        :key="toast.id"
        class="toast sr-glass sr-glass--floating"
        :class="`toast--${toast.tone}`"
        type="button"
        @click="shell.dismissToast(toast.id)"
      >
        {{ toast.message }}
      </button>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { useShellStore } from "../../stores/shell";
import { useMotionTransition } from '../../motion/transitions';
const toastMotion = useMotionTransition('toast');
const shell = useShellStore();
</script>

<style scoped>
.toast-host { position: fixed; z-index: var(--sr-layer-toast); bottom: 100px; right: 16px; display: grid; gap: 8px; max-width:calc(100vw - 32px); pointer-events:none; }
.toast { max-width: 340px; padding: 11px 14px; border: 1px solid var(--sr-color-line-strong); border-radius: var(--sr-radius-sm); background: var(--sr-color-surface-solid); box-shadow: var(--sr-shadow-raised); color: var(--sr-color-text); font-size: 12px; text-align: left; cursor: pointer; }
.toast--success { border-left: 3px solid var(--sr-color-success); }
.toast--error { border-left: 3px solid var(--sr-color-danger); }
.toast{min-height:44px;pointer-events:auto;border-radius:var(--sr-radius-control);font-size:13px;line-height:1.6;overflow-wrap:anywhere}
.toast-enter-active { transition: opacity 200ms var(--sr-ease-out),transform 200ms var(--sr-ease-out); }
.toast-leave-active { transition: opacity 120ms ease,transform 120ms ease; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
