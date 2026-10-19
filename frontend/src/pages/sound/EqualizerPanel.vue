<template>
  <section class="eq-panel" aria-label="均衡器">
    <header><div><strong>均衡器</strong><small>十段精细调节</small></div><label><input type="checkbox" :checked="value.enabled" @change="toggleEnabled" />启用</label></header>
    <div class="eq-panel__presets" aria-label="均衡器预设">
      <button v-for="preset in presets" :key="preset.id" type="button" :class="{ active: value.presetId === preset.id }" @click="applyPreset(preset.id)">{{ preset.name }}</button>
    </div>
    <div class="eq-panel__bands">
      <label v-for="(band, index) in value.bands" :key="band.frequencyHz"><span>{{ band.gainDb > 0 ? "+" : "" }}{{ band.gainDb.toFixed(1) }}</span><input type="range" min="-12" max="12" step="0.5" :value="band.gainDb" :disabled="!value.enabled" :aria-label="`${formatFrequency(band.frequencyHz)} 频段`" @input="updateBand(index, $event)" /><small>{{ formatFrequency(band.frequencyHz) }}</small></label>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { EqualizerPresetId, EqualizerState } from "@studyroom/contracts";
import { EQUALIZER_FREQUENCIES, EQUALIZER_PRESETS } from "../../audio/effects/equalizerPresets";
const props = defineProps<{ value: EqualizerState }>();
const emit = defineEmits<{ (event: "change", value: EqualizerState): void }>();
const presets: { id: Exclude<EqualizerPresetId, "custom">; name: string }[] = [{ id: "flat", name: "平直" }, { id: "focus", name: "专注" }, { id: "warm", name: "温暖" }, { id: "bright", name: "明亮" }, { id: "deep", name: "深沉" }];
function applyPreset(presetId: Exclude<EqualizerPresetId, "custom">) { emit("change", { enabled: true, presetId, bands: EQUALIZER_FREQUENCIES.map((frequencyHz, index) => ({ frequencyHz, gainDb: EQUALIZER_PRESETS[presetId][index] })) }); }
function toggleEnabled(event: Event) { emit("change", { ...props.value, enabled: (event.target as HTMLInputElement).checked }); }
function updateBand(index: number, event: Event) { const bands = props.value.bands.map((band, bandIndex) => bandIndex === index ? { ...band, gainDb: Number((event.target as HTMLInputElement).value) } : band); emit("change", { enabled: true, presetId: "custom", bands }); }
function formatFrequency(value: number) { return value >= 1000 ? `${value / 1000}k` : `${value}`; }
</script>

<style scoped>
.eq-panel{display:grid;gap:13px}.eq-panel header{display:flex;align-items:center;justify-content:space-between}.eq-panel header>div{display:flex;flex-direction:column;gap:2px}.eq-panel header strong{font-size:11px}.eq-panel header small{color:var(--sr-color-text-faint);font-size:11px}.eq-panel header label{display:flex;align-items:center;gap:5px;color:var(--sr-color-text-muted);font-size:12px}.eq-panel__presets{display:flex;flex-wrap:wrap;gap:4px}.eq-panel__presets button{padding:5px 8px;border:1px solid var(--sr-color-line);border-radius:99px;background:transparent;color:var(--sr-color-text-muted);font-size:11px;cursor:pointer}.eq-panel__presets button.active{border-color:var(--sr-color-selected);background:var(--sr-color-selected);color:var(--sr-color-text)}.eq-panel__bands{height:116px;display:grid;grid-template-columns:repeat(10,1fr);gap:2px}.eq-panel__bands label{min-width:0;display:flex;align-items:center;flex-direction:column;gap:4px;color:var(--sr-color-text-faint);font-size:11px}.eq-panel__bands label>span{font-variant-numeric:tabular-nums}.eq-panel__bands input{width:76px;height:10px;margin:35px -28px 31px;accent-color:var(--sr-color-accent);transform:rotate(-90deg)}
</style>
