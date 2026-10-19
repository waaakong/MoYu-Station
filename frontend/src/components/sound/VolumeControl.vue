<template>
  <div class="volume-control">
    <label>
      <span>{{ label }}</span>
      <input type="range" min="0" max="1" step="0.01" :value="value" :aria-label="`${label}音量`"
        :aria-valuetext="hint" :title="hint" @input="emit('change', Number(($event.target as HTMLInputElement).value))" />
      <output :title="hint">{{ percent }}%<small v-if="muted"> · 静音</small></output>
    </label>
    <button v-if="muteControl" type="button" :aria-label="`${muted ? '恢复' : '静音'}${label}`" :aria-pressed="muted" @click="emit('mute')">
      <AppIcon :name="muted ? 'mute' : 'volume'" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
const props = withDefaults(defineProps<{ label: string; value: number; muted?: boolean; muteControl?: boolean }>(), { muted: false, muteControl: true });
const emit = defineEmits<{ change: [value: number]; mute: [] }>();
const percent = computed(() => Math.round(props.value * 100));
const hint = computed(() => `${percent.value}%${props.muted ? '，已静音' : ''}`);
</script>

<style scoped>
.volume-control{display:flex;align-items:center;gap:4px;min-width:0;width:100%}.volume-control label{display:grid;grid-template-columns:auto minmax(40px,1fr) auto;align-items:center;gap:8px;flex:1;min-width:0;font-size:12px;color:var(--sr-color-text-muted)}.volume-control input{width:100%;min-width:0;min-height:28px;margin:0;accent-color:var(--sr-color-accent);cursor:pointer}.volume-control output{min-width:4ch;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.volume-control small{font-size:10px}.volume-control button{display:grid;place-items:center;flex:0 0 44px;width:44px;min-height:44px;border:0;border-radius:12px;background:transparent;color:var(--sr-color-text);cursor:pointer}.volume-control :is(input,button):focus-visible{outline:2px solid var(--sr-color-focus);outline-offset:2px}
</style>
