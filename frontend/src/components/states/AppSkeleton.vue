<template>
  <div class="skeleton" :aria-label="label" role="status">
    <span v-for="line in lines" :key="line" :style="{ width: `${Math.max(42, 100 - line * 9)}%` }"></span>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ lines?: number; label?: string }>(), {
  lines: 3,
  label: "正在加载"
});
</script>

<style scoped>
.skeleton { display: grid; gap: 10px; }
.skeleton span { height: 12px; border-radius: 4px; background: linear-gradient(90deg, rgba(255,255,255,.05), rgba(255,255,255,.12), rgba(255,255,255,.05)); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; }
@keyframes shimmer { to { background-position: -200% 0; } }
</style>
