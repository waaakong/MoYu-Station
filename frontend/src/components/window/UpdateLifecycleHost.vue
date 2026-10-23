<template>
  <Teleport to="body">
    <aside v-if="updates.status.updateIntent || updates.failureNotice" ref="host" popover="manual" class="update-lifecycle" aria-label="更新进度" aria-live="polite">
      <template v-if="updates.failureNotice && !updates.status.updateIntent">
        <div role="alert"><strong>{{ updates.failureNotice.message }}</strong><p v-if="updates.failureNotice.errorCode">错误码：{{ updates.failureNotice.errorCode }}</p></div>
        <button v-if="updates.failureNotice.canRetry" type="button" @click="updates.check">重新检查</button>
        <button type="button" @click="updates.dismissFailureNotice">关闭更新提示</button>
      </template>
      <template v-else>
        <strong>{{ updates.status.message }}</strong>
        <p v-if="updates.status.waitReasons?.length">等待处理：{{ updates.status.waitReasons.map(reason => ({ focus: '专注', audio: '声音播放', drafts: '未保存草稿' }[reason])).join('、') }}</p>
        <button v-if="updates.status.state !== 'installing'" type="button" @click="updates.cancelDownload">取消本次更新</button>
      </template>
      <small v-if="updates.status.trustMode === 'manifest-signed'">未签名安装包；Windows 可能要求你确认安全提示或系统授权。</small>
    </aside>
  </Teleport>
</template>
<script setup lang="ts">
import { useUpdatesStore } from '../../stores/updates';
import { ref, watch } from 'vue';
const updates = useUpdatesStore();
const host = ref<HTMLElement>();
watch(host, element => { if (element?.isConnected && !element.matches(':popover-open')) element.showPopover(); }, { flush: 'post' });
</script>
<style scoped>
.update-lifecycle{position:fixed;z-index:2147483000;inset:auto 16px 16px auto;margin:0;max-width:min(420px,calc(100vw - 32px));box-sizing:border-box;padding:20px;border:1px solid var(--sr-color-line-strong);border-radius:16px;background:var(--sr-color-surface-solid,#202824);color:var(--sr-color-text,#f2f4ef);box-shadow:0 16px 48px #0005;font:14px/1.6 var(--sr-font-sans,sans-serif);-webkit-app-region:no-drag}
.update-lifecycle{max-height:calc(100dvh - 32px);overflow:auto;overflow-wrap:anywhere}.update-lifecycle small{display:block;margin-top:10px}.update-lifecycle button{display:block;min-height:44px;margin-top:12px;padding:8px 16px;border:1px solid currentColor;border-radius:10px;background:transparent;color:inherit;cursor:pointer}.update-lifecycle button:focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:3px}
</style>
