<template>
  <section class="profile-panel" aria-labelledby="profile-stats-title">
    <header class="profile-section-head"><div><p>STATISTICS</p><h1 id="profile-stats-title">学习统计</h1></div><span>真实云端记录 · 北京时间</span></header>
    <div v-if="error" class="profile-state error" role="alert">{{ error }}<button type="button" @click="$emit('retry')">重试</button></div>
    <div v-else-if="loading && !stats" class="profile-state" role="status">正在读取统计…</div>
    <div v-else-if="stats" class="profile-stat-grid">
      <article><span>今日专注</span><strong>{{ value(stats.todayFocusMinutes, "分钟") }}</strong><small>当天已同步记录</small></article>
      <article><span>连续专注</span><strong>{{ value(stats.streakDays, "天") }}</strong><small>连续有专注记录的日期</small></article>
      <article><span>累计专注</span><strong>{{ value(stats.totalFocusHours, "小时") }}</strong><small>来自云端同步记录</small></article>
      <article><span>常用场景</span><strong>{{ stats.favoriteScene || "暂无" }}</strong><small>最近七天使用最多</small></article>
      <article><span>今日在线</span><strong>{{ value(stats.onlineMinutes, "分钟") }}</strong><small>有记录时显示</small></article>
      <article><span>今日摸鱼</span><strong>{{ value(stats.fishMinutes, "分钟") }}</strong><small>在线但未专注，包含暂停</small></article>
      <article><span>假努力指数</span><strong>{{ stats.fakeEffortIndex == null ? '暂无' : Number(stats.fakeEffortIndex).toFixed(2) }}</strong><small>已确认云端记录 ·（专注 + 摸鱼 × 2）÷ 在线；不是百分比</small></article>
    </div>
    <div v-else class="profile-state">还没有可展示的云端统计。</div>
    <p aria-live="polite">{{ activityState.error || (activityState.pending ? '本机有待同步活动记录，当前显示已确认的云端部分。' : stats?.coverage==='PARTIAL' ? '当天记录不完整，仅展示已确认时长，暂不计算指数。' : stats?.coverage==='UNAVAILABLE' ? '历史在线与摸鱼数据未采集，无法补算。' : '多端同时在线按时间并集统计，日期采用北京时间。') }}</p>
    <article v-if="report" class="profile-report"><p>DAILY REPORT</p><h2>{{ report.title || "今日学习报告" }}</h2><strong>{{ report.focusMinutes ?? "暂无" }} 分钟专注</strong><span>{{ report.quote || "把时间调成适合自己的样子。" }}</span></article>
    <div v-if="report" class="profile-actions"><button type="button" @click="editor?.open()">预览学习卡片</button></div>
    <StudyCardEditor v-if="report" ref="editor" :report="report" />
  </section>
</template>

<script setup lang="ts">
import type { ProfileStats, ShareCard } from "../../services/profile";
import {ref} from 'vue';
import StudyCardEditor from './StudyCardEditor.vue';
import {activityState} from '../../activity/state';
const editor=ref<InstanceType<typeof StudyCardEditor>>();
defineProps<{ stats: ProfileStats | null; report: ShareCard | null; loading: boolean; error?: string }>();
defineEmits<{ retry: [] }>();
function value(input: number | null | undefined, suffix: string) { return input === undefined || input === null ? "暂无" : `${input} ${suffix}`; }
</script>
