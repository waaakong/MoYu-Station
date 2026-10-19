<template>
  <section class="profile-panel" aria-labelledby="profile-calendar-title">
    <header class="profile-section-head"><div><p>CALENDAR</p><h1 id="profile-calendar-title">学习日历</h1></div><span>{{ monthLabel }}</span></header>
    <div v-if="error" class="profile-state error" role="alert">{{ error }}<button type="button" @click="$emit('retry')">重试</button></div>
    <div v-else-if="loading && !days.length" class="profile-state" role="status">正在读取日历…</div>
    <template v-else-if="days.length">
      <div class="profile-calendar-labels"><span v-for="name in week" :key="name">{{ name }}</span></div>
      <div class="profile-calendar">
        <span v-for="offset in firstDayOffset" :key="`offset-${offset}`" aria-hidden="true"></span>
        <button v-for="day in days" :key="day.date" type="button" :class="[day.status.toLowerCase(), { active: selected?.date === day.date }]" @click="selected = day">
          <span>{{ Number(day.date.slice(-2)) }}</span><small>{{ day.focusMinutes==null ? '—' : `${day.focusMinutes}m` }}</small>
        </button>
      </div>
      <div v-if="selected" class="profile-note"><strong>{{ selected.date }} · Asia/Shanghai</strong><p>专注 {{ selected.focusMinutes ?? '暂无' }} 分钟 · 在线 {{ selected.onlineMinutes ?? '暂无' }} 分钟 · 摸鱼 {{ selected.fishMinutes ?? '暂无' }} 分钟</p><p>假努力指数：{{ selected.fakeEffortIndex == null ? '暂无' : Number(selected.fakeEffortIndex).toFixed(2) }}（专注 + 摸鱼 × 2）÷ 在线</p><small>{{ selected.coverage==='PARTIAL' ? '部分记录；无法计算完整指数。' : '趣味指标，不作为能力评价。' }}</small></div>
    </template>
    <div v-else class="profile-state">本月还没有学习记录。</div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ProfileCalendarDay } from "../../services/profile";
const props = defineProps<{ days: ProfileCalendarDay[]; loading: boolean; error?: string }>();
defineEmits<{ retry: [] }>();
const week = ["一", "二", "三", "四", "五", "六", "日"];
const selected = ref<ProfileCalendarDay | null>(null);
watch(() => props.days, (days) => { selected.value = days.find((day) => (day.focusMinutes??0) > 0) || days[0] || null; }, { immediate: true });
const firstDayOffset=computed(()=>{const first=props.days[0]?.date;if(!first)return 0;const day=new Date(first+'T00:00:00Z').getUTCDay();return Number.isFinite(day)?(day+6)%7:0;});
const monthLabel = computed(() => selected.value?.date.slice(0, 7).replace("-", ".") || 'Asia/Shanghai');
</script>
