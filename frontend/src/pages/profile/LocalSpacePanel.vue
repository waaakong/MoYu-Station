<template>
  <section class="profile-panel" aria-labelledby="local-space-title">
    <header class="profile-section-head"><div><p>LOCAL FIRST</p><h1 id="local-space-title">本机空间</h1></div><span>无需登录</span></header>
    <p class="profile-lead">曲库、队列、专注记录和娱乐设置保存在这台电脑，不会因为退出云端账号而消失。</p>
    <div v-if="loading" class="profile-state" role="status">正在读取本机摘要…</div>
    <div v-else-if="error" class="profile-state error" role="alert">{{ error }}<button type="button" @click="$emit('retry')">重试</button></div>
    <div v-else-if="summary?.status === 'desktop-required'" class="profile-state">
      <strong>网页版无法读取桌面数据</strong><p>请在 Windows 客户端查看本地曲库、队列和应用占用空间。</p>
    </div>
    <div v-else-if="summary?.status === 'available'" class="profile-stat-grid">
      <article><span>本地曲目</span><strong>{{ summary.trackCount }}</strong><small>仅统计，不读取曲名和路径</small></article>
      <article><span>播放队列</span><strong>{{ summary.queueItemCount }}</strong><small>当前保存在本机的项目</small></article>
      <article><span>播放列表</span><strong>{{ summary.playlistCount }}</strong><small>本机收藏与列表</small></article>
      <article><span>专注记录</span><strong>{{ summary.focusRecordCount }}</strong><small>{{ latestFocus }}</small></article>
      <article><span>娱乐设置</span><strong>{{ summary.hasEntertainmentSettings ? "已保存" : "未设置" }}</strong><small>只报告是否存在</small></article>
      <article><span>本机占用</span><strong>{{ storageLabel }}</strong><small>SQLite 与媒体缓存合计</small></article>
    </div>
    <div class="profile-note"><strong>隐私边界</strong><p>页面不会获得数据库位置、用户名目录、歌曲路径、文件列表或第三方音乐凭据。</p></div>
  </section>
</template>

<script setup lang="ts">
import type { LocalProfileSummary } from "@studyroom/contracts";
import { computed } from "vue";

const props = defineProps<{ summary: LocalProfileSummary | null; loading: boolean; error?: string }>();
defineEmits<{ retry: [] }>();
const storageLabel = computed(() => {
  const bytes = props.summary?.status === "available" ? props.summary.storageBytes : 0;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
});
const latestFocus = computed(() => props.summary?.status === "available" && props.summary.latestFocusAt
  ? `最近记录 ${new Date(props.summary.latestFocusAt).toLocaleDateString("zh-CN")}` : "还没有本机记录");
</script>
