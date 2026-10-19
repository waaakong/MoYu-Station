<template>
  <aside class="context-panel sr-glass" :class="closable ? 'sr-glass--floating' : 'sr-glass--reading'" aria-label="声音控制台">
    <header class="context-panel__head"><nav role="tablist" aria-label="声音控制台视图" @keydown="moveTab"><button v-for="tab in tabs" :key="tab.id" type="button" role="tab" :aria-selected="activeTab === tab.id" :tabindex="activeTab === tab.id ? 0 : -1" @click="activeTab = tab.id">{{ tab.label }}</button></nav><button v-if="closable" type="button" aria-label="关闭声音控制台" @click="$emit('close')"><AppIcon name="close" /></button></header>
    <div class="context-panel__content">
      <NowPlayingStage v-if="activeTab === 'stage'" />
      <template v-else-if="activeTab === 'mixer'">
        <AmbientMixerPanel />
        <details class="context-panel__eq"><summary>十段均衡器 <span>{{ sound.settings.equalizer.enabled ? "已启用" : "已关闭" }}</span></summary><EqualizerPanel :value="sound.settings.equalizer" @change="sound.setEqualizer" /></details>
        <section class="context-panel__processing" aria-label="播放处理"><strong>播放处理</strong><label>淡入淡出 <input type="range" min="0" max="12" step="1" :value="sound.settings.crossfadeSeconds" @input="setCrossfade" /><span>{{ sound.settings.crossfadeSeconds }}s</span></label><label><input type="checkbox" :checked="sound.settings.masterProcessing.normalizationEnabled" @change="setProcessing('normalizationEnabled', $event)" />音量均衡（实验）</label><label><input type="checkbox" :checked="sound.settings.masterProcessing.lowVolumeCompensationEnabled" @change="setProcessing('lowVolumeCompensationEnabled', $event)" />低音量补偿</label></section>
        <SoundProfilesPanel />
      </template>
      <LyricsPanel v-else />
      <DesktopMusicControls />
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { MasterProcessingState } from "@studyroom/contracts";
import { ref } from "vue";
import { useSoundStore } from "../../stores/sound";
import AmbientMixerPanel from "./AmbientMixerPanel.vue";
import EqualizerPanel from "./EqualizerPanel.vue";
import LyricsPanel from "./LyricsPanel.vue";
import NowPlayingStage from "./NowPlayingStage.vue";
import SoundProfilesPanel from "./SoundProfilesPanel.vue";
import DesktopMusicControls from './DesktopMusicControls.vue';
defineProps<{ closable?: boolean }>();
defineEmits<{ (event: "close"): void }>();
const sound = useSoundStore();
const activeTab = ref<"stage" | "mixer" | "lyrics">("stage");
const tabs = [{ id: "stage" as const, label: "播放" }, { id: "mixer" as const, label: "混音" }, { id: "lyrics" as const, label: "歌词" }];
function moveTab(event: KeyboardEvent) { if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return; event.preventDefault(); const tablist = event.currentTarget as HTMLElement; const index = tabs.findIndex(({ id }) => id === activeTab.value); activeTab.value = tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length].id; requestAnimationFrame(() => tablist.querySelector<HTMLButtonElement>(`[aria-selected="true"]`)?.focus()); }
function setCrossfade(event: Event) { sound.setCrossfade(Number((event.target as HTMLInputElement).value)); }
function setProcessing(key: keyof MasterProcessingState, event: Event) { sound.setMasterProcessing({ ...sound.settings.masterProcessing, [key]: (event.target as HTMLInputElement).checked }); }
</script>

<style scoped>
.context-panel{height:100%;min-height:0;display:flex;flex-direction:column;padding:16px;border:1px solid var(--sr-color-line);border-radius:var(--sr-radius-panel,20px);box-sizing:border-box}.context-panel__head{display:flex;align-items:center;justify-content:space-between;padding:0 0 14px}.context-panel__head nav{display:flex;gap:14px}.context-panel__head button{padding:3px 0 6px;border:0;border-bottom:1px solid transparent;background:transparent;color:var(--sr-color-text-faint);font-size:12px;font-weight:700;cursor:pointer}.context-panel__head [aria-selected=true]{border-color:var(--sr-color-accent);color:var(--sr-color-text)}.context-panel__head>button{width:24px;border:0;font-size:16px}.context-panel__content{min-height:0;flex:1;display:flex;flex-direction:column;gap:18px;overflow:auto;scrollbar-width:thin}.context-panel__content>:deep(.eq-panel){padding-top:16px;border-top:1px solid var(--sr-color-line)}.context-panel__processing{display:grid;gap:8px;padding:15px 0 5px;border-top:1px solid var(--sr-color-line)}.context-panel__processing strong{font-size:11px}.context-panel__processing label{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:7px;color:var(--sr-color-text-muted);font-size:11px}.context-panel__processing label:not(:first-of-type){grid-template-columns:auto 1fr}.context-panel__processing input[type=range]{width:100%;accent-color:var(--sr-color-accent)}
.context-panel__eq{padding-top:14px;border-top:1px solid var(--sr-color-line)}.context-panel__eq summary{display:flex;justify-content:space-between;color:var(--sr-color-text);font-size:12px;cursor:pointer}.context-panel__eq summary span{color:var(--sr-color-text-faint);font-size:11px}.context-panel__eq :deep(.eq-panel){padding-top:13px;border-top:0}
.context-panel__head nav{display:flex;flex:1;gap:3px;padding:3px;border-radius:14px;background:var(--sr-color-surface-raised);border:1px solid var(--sr-color-line)}
.context-panel__head nav button{flex:1;min-height:44px;padding:8px;border:0;border-radius:10px;font-size:12px;color:var(--sr-color-text-muted)}
.context-panel__head [aria-selected=true]{background:var(--sr-color-selected);color:var(--sr-color-text);box-shadow:inset 0 1px #ffffff12}
.context-panel__head>button{width:44px;min-height:44px;margin-left:8px;font-size:22px}.context-panel__eq summary{min-height:44px;align-items:center;gap:8px}.context-panel__processing label{min-height:36px}.context-panel__content{padding-right:4px;scrollbar-gutter:stable}
</style>
<style scoped>
.context-panel__content>:deep(*){flex-shrink:0}
.context-panel__content>:deep(.now-stage){height:auto;min-height:320px}
.context-panel__head>button{display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px;height:44px;padding:0;line-height:1;box-sizing:border-box}
</style>
