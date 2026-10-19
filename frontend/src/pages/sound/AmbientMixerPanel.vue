<template>
  <section class="mixer-panel" aria-label="环境声音混音器">
    <div class="mixer-panel__bus">
      <div class="mixer-panel__bus-heading"><strong>整体音量</strong><small>音乐与环境音独立控制</small></div>
      <VolumeControl label="音乐" :value="sound.settings.musicBus.volume" :muted="sound.settings.musicBus.muted" @change="sound.setMusicBus($event, false)" @mute="sound.setMusicBus(sound.settings.musicBus.volume, !sound.settings.musicBus.muted)" />
      <VolumeControl label="环境音" :value="sound.settings.ambientBus.volume" :muted="sound.settings.ambientBus.muted" @change="sound.setAmbientBus($event, false)" @mute="sound.setAmbientBus(sound.settings.ambientBus.volume, !sound.settings.ambientBus.muted)" />
    </div>
    <div v-if="sound.settings.ambientTracks.length" class="mixer-panel__tracks">
      <article v-for="track in sound.settings.ambientTracks" :key="track.id">
        <div class="mixer-panel__track-head"><button type="button" :aria-label="track.status === 'playing' ? `暂停 ${name(track.sourceId)}` : `播放 ${name(track.sourceId)}`" @click="sound.toggleAmbient(track.id)"><AppIcon :name="track.status === 'playing' ? 'pause' : 'play'" /></button><strong>{{ name(track.sourceId) }}</strong><span :class="track.status">{{ status(track.status) }}</span><button type="button" aria-label="移除环境声音" @click="sound.removeAmbient(track.id)"><AppIcon name="close" /></button></div>
        <VolumeControl :label="name(track.sourceId)" :value="track.volume" :muted="track.muted" :mute-control="false" @change="sound.updateAmbient(track.id, { volume: $event, muted: false })" />
        <label>声像<input type="range" min="-1" max="1" step="0.05" :value="track.pan" @input="update(track.id, 'pan', $event)" /><span>{{ track.pan > 0 ? `右 ${Math.round(track.pan * 100)}` : track.pan < 0 ? `左 ${Math.round(-track.pan * 100)}` : "中" }}</span></label>
        <div class="mixer-panel__fades"><label>淡入<AppSelect :value="track.fadeInMs" @change="update(track.id, 'fadeInMs', $event)"><option :value="0">无</option><option :value="400">0.4s</option><option :value="800">0.8s</option><option :value="2000">2s</option></AppSelect></label><label>淡出<AppSelect :value="track.fadeOutMs" @change="update(track.id, 'fadeOutMs', $event)"><option :value="0">无</option><option :value="400">0.4s</option><option :value="800">0.8s</option><option :value="2000">2s</option></AppSelect></label></div>
        <div class="mixer-panel__toggles"><button type="button" :class="{ active: track.muted }" :aria-pressed="track.muted" @click="sound.updateAmbient(track.id, { muted: !track.muted })">静音</button><button type="button" :class="{ active: track.solo }" :aria-pressed="track.solo" @click="sound.updateAmbient(track.id, { solo: !track.solo })">独奏</button></div>
        <p v-if="track.errorCode">这个声音暂时无法播放，可移除后重试。</p>
      </article>
    </div>
    <p v-else class="mixer-panel__empty">添加白噪音或环境声音后，可在这里分别控制。</p>
  </section>
</template>

<script setup lang="ts">
import VolumeControl from "../../components/sound/VolumeControl.vue";
import type { AmbientSourceId, AmbientTrackStatus } from "@studyroom/contracts";
import { ambientCatalogEntry } from "../../audio/ambient/ambientCatalog";
import { useSoundStore } from "../../stores/sound";
const sound = useSoundStore();
function name(sourceId: AmbientSourceId) { return ambientCatalogEntry(sourceId).name; }
function status(value: AmbientTrackStatus) { return ({ stopped: "已暂停", loading: "载入中", playing: "播放中", error: "不可用" })[value]; }
function update(trackId: string, field: "volume" | "pan" | "fadeInMs" | "fadeOutMs", event: Event) { sound.updateAmbient(trackId, { [field]: Number((event.target as HTMLInputElement).value) }); }
</script>

<style scoped>
.mixer-panel{display:grid;gap:14px}.mixer-panel__bus{display:grid;grid-template-columns:1fr;gap:8px;padding-bottom:14px;border-bottom:1px solid var(--sr-color-line)}.mixer-panel__bus-heading{display:flex;flex-direction:column;gap:2px}.mixer-panel__bus strong{font-size:11px}.mixer-panel__bus small{color:var(--sr-color-text-faint);font-size:11px}.mixer-panel label{display:grid;grid-template-columns:35px 1fr;align-items:center;gap:7px;color:var(--sr-color-text-muted);font-size:11px}.mixer-panel input{width:100%;accent-color:var(--sr-color-accent)}.mixer-panel__tracks{display:grid;gap:7px}.mixer-panel article{display:grid;gap:7px;padding:10px;border:1px solid var(--sr-color-line);border-radius:11px;background:var(--sr-color-surface-raised)}.mixer-panel__track-head{display:grid;grid-template-columns:22px minmax(0,1fr) auto 20px;align-items:center;gap:6px}.mixer-panel__track-head strong{font-size:12px}.mixer-panel__track-head span{color:var(--sr-color-text-faint);font-size:11px}.mixer-panel__track-head span.playing{color:var(--sr-color-accent)}.mixer-panel button{border:0;border-radius:6px;background:var(--sr-color-surface-raised);color:var(--sr-color-text-muted);font-size:11px;cursor:pointer}.mixer-panel__track-head button{height:20px}.mixer-panel__toggles{display:flex;gap:5px}.mixer-panel__toggles button{padding:5px 7px}.mixer-panel__toggles button.active{background:var(--sr-color-selected);color:var(--sr-color-accent)}.mixer-panel article p,.mixer-panel__empty{margin:0;color:#e9b3a9;font-size:11px;line-height:1.5}.mixer-panel__empty{padding:18px;color:var(--sr-color-text-faint);text-align:center}
.mixer-panel label{grid-template-columns:35px 1fr 32px}.mixer-panel label>span{text-align:right;font-variant-numeric:tabular-nums}.mixer-panel__fades{display:grid;grid-template-columns:1fr 1fr;gap:6px}.mixer-panel__fades label{grid-template-columns:auto 1fr}.mixer-panel__fades select{min-width:0;padding:4px;border:1px solid var(--sr-color-line);border-radius:6px;background:var(--sr-color-surface-solid);color:var(--sr-color-text-muted);font-size:11px}
.mixer-panel__track-head{grid-template-columns:44px minmax(0,1fr) auto 44px}.mixer-panel__track-head button,.mixer-panel__toggles button{min-height:44px;border-radius:10px}.mixer-panel__fades{grid-template-columns:1fr}.mixer-panel__fades select{min-height:44px;padding:8px}.mixer-panel input[type=range]{height:28px}.mixer-panel article{padding:12px;gap:10px;border-radius:14px}.mixer-panel__bus strong{font-size:14px}.mixer-panel__track-head strong{font-size:13px}
</style>
