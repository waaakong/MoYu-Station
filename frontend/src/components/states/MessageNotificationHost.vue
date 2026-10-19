<template>
  <Teleport to="body">
    <aside class="message-notice-host" aria-label="私信通知" aria-live="polite">
      <div v-if="state.notice" class="message-notice sr-glass sr-glass--floating" role="status">
        <button class="message-notice-open" type="button" @click="state.open(state.notice.peer)">{{ state.notice.text }}<small>点击查看聊天</small></button>
        <button type="button" aria-label="关闭私信提醒" @click="state.notice = null">×</button>
      </div>
      <button v-else-if="state.error && !suppressed" class="message-notice message-retry" type="button" @click="state.retry()">{{ state.error }} · 重试</button>
      <button v-else-if="state.unread > 0 && !suppressed && route.name !== 'chat'" class="message-notice message-retry" type="button" @click="state.open(null)">私信 · {{ state.unread }} 条未读</button>
    </aside>
  </Teleport>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { messageNotices as state } from '../../notifications/state';
import { useFocusStore } from '../../stores/focus';
const focus = useFocusStore();
const route = useRoute();
const suppressed = computed(() => focus.timerState === 'running' || focus.timerState === 'paused');
</script>
<style scoped>
.message-notice-host{position:fixed;z-index:var(--sr-layer-toast,1000);right:16px;bottom:160px;max-width:calc(100vw - 32px);pointer-events:none}
.message-notice{display:flex;align-items:start;max-width:360px;border:1px solid var(--sr-color-line-strong);border-radius:var(--sr-radius-control,16px);background:var(--sr-color-surface-solid,#252c28);color:var(--sr-color-text,#fff);box-shadow:var(--sr-shadow-raised);pointer-events:auto;padding:6px}
.message-notice button{background:transparent;color:inherit;border:0;min-height:44px;min-width:44px;cursor:pointer;font:inherit;border-radius:10px}.message-notice-open{padding:10px 12px;text-align:left;line-height:1.6;overflow-wrap:anywhere}.message-notice small{display:block;opacity:.7;font-size:12px}.message-notice button:focus-visible,.message-retry:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:2px}.message-retry{padding:12px;font:inherit;cursor:pointer}
</style>
