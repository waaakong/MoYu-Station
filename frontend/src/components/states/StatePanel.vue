<template>
  <section class="state-panel" :aria-live="tone === 'error' ? 'assertive' : 'polite'">
    <span class="state-panel__mark" aria-hidden="true">{{ tone === 'error' ? '!' : '·' }}</span>
    <h2>{{ title }}</h2>
    <p>{{ description }}</p>
    <button v-if="actionLabel" type="button" @click="$emit('action')">{{ actionLabel }}</button>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title: string; description: string; actionLabel?: string; tone?: "empty" | "error" }>(), { tone: "empty" });
defineEmits<{ (event: "action"): void }>();
</script>

<style scoped>
.state-panel { max-width: 420px; display: grid; justify-items: start; gap: 10px; padding: 28px; border: 1px solid var(--sr-color-line); border-radius: var(--sr-radius-lg); background: var(--sr-color-surface); }
.state-panel__mark { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--sr-color-line-strong); border-radius: 50%; color: var(--sr-color-accent); }
.state-panel h2 { margin: 4px 0 0; font-family: var(--sr-font-display); font-size: 24px; font-weight: 500; }
.state-panel p { margin: 0; color: var(--sr-color-text-muted); font-size: 13px; line-height: 1.7; }
.state-panel button { margin-top: 6px; min-height:44px; padding: 9px 16px; border: 0; border-radius: var(--sr-radius-control); background: var(--sr-color-accent); color: var(--sr-color-accent-ink); font-weight: 600; cursor: pointer; }
</style>
