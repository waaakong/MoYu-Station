<template>
  <section v-if="count" class="history-import" aria-label="本地专注历史导入">
    <div>
      <strong>本地历史</strong>
      <span>{{ count }} 条 · {{ rangeLabel }}</span>
    </div>
    <button type="button" :disabled="pending" @click="$emit('import')">
      {{ pending ? "导入中…" : "确认导入云端" }}
    </button>
    <p>仅导入这批已显示记录；以后登录前产生的记录仍不会自动上传。</p>
  </section>
</template>

<script setup lang="ts">
defineProps<{ count: number; rangeLabel: string; pending: boolean }>();
defineEmits<{ import: [] }>();
</script>

<style scoped>
.history-import {
  display: grid;
  gap: 9px;
  margin-top: 18px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, .12);
  border-radius: 14px;
  background: rgba(255, 255, 255, .06);
}
.history-import > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.history-import strong { font-size: 13px; }
.history-import span, .history-import p { color: rgba(255, 255, 255, .58); font-size: 11px; }
.history-import p { margin: 0; line-height: 1.55; }
.history-import button {
  min-height: 34px;
  border: 1px solid rgba(255, 255, 255, .16);
  border-radius: 10px;
  color: #fff;
  background: rgba(255, 255, 255, .1);
  cursor: pointer;
}
.history-import button:disabled { cursor: wait; opacity: .55; }
</style>
