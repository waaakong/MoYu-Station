<template>
  <p v-if="displayMessage" class="auth-status" :class="`auth-status--${tone}`" :role="tone === 'error' ? 'alert' : 'status'" aria-live="polite">
    {{ displayMessage }}<span v-if="remaining > 0">（{{ remaining }} 秒后可重试）</span>
  </p>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";

const props = withDefaults(defineProps<{
  message?: string;
  tone?: "error" | "info" | "success";
  retryAfter?: number;
  retryUntil?: number;
}>(), { message: "", tone: "error", retryAfter: 0 });

const remaining = ref(0);
let timer: number | undefined;
const displayMessage = computed(() => props.message || (remaining.value > 0 ? "尝试次数过多，请稍后再试。" : ""));

function stopTimer() {
  if (timer !== undefined) window.clearInterval(timer);
  timer = undefined;
}

watch(() => [props.retryAfter, props.retryUntil], ([seconds, until]) => {
  stopTimer();
  const deadline = until || Date.now() + Math.max(0, Number(seconds)) * 1000;
  remaining.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  if (remaining.value > 0) {
    timer = window.setInterval(() => {
      remaining.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      if (remaining.value === 0) stopTimer();
    }, 1000);
  }
}, { immediate: true });

onBeforeUnmount(stopTimer);
</script>

<style scoped>
.auth-status { min-height: 20px; margin: 2px 0 14px; font-size: 12px; font-weight: 800; line-height: 1.5; }
.auth-status--error { color: rgba(255,226,196,.96); }
.auth-status--info { color: rgba(224,238,255,.92); }
.auth-status--success { color: rgba(211,255,226,.94); }
</style>
