<template>
  <section class="radio-library" aria-label="公开电台目录">
    <button v-for="station in stations" :key="station.id" type="button" class="radio-card" :aria-label="`播放电台 ${station.name}`" @click="$emit('play', station)">
      <span class="radio-card__cover" aria-hidden="true"><img v-if="radioArtworkUrl(station)" :src="radioArtworkUrl(station)" alt="" /></span>
      <span class="radio-card__copy"><strong>{{ station.name }}</strong><small>{{ nowPlaying[station.id]?.artist ? `${nowPlaying[station.id]?.artist} — ${nowPlaying[station.id]?.title}` : station.category }}</small></span>
      <span class="radio-card__meta"><b>LIVE</b><small>{{ station.bitrateKbps || "?" }} kbps · {{ station.format.toUpperCase() }}</small></span>
    </button>
  </section>
</template>

<script setup lang="ts">
import type { RadioNowPlaying, RadioStation } from "@studyroom/contracts";
import { radioArtworkUrl } from "../../services/radio";
defineProps<{ stations: RadioStation[]; nowPlaying: Record<string, RadioNowPlaying> }>();
defineEmits<{ (event: "play", station: RadioStation): void }>();
</script>

<style scoped>
.radio-library{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));align-content:start;gap:10px;min-height:0;overflow:auto;padding:2px}.radio-card{min-width:0;display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:12px;padding:14px;border:1px solid var(--sr-color-line);border-radius:14px;background:var(--sr-color-surface-raised);color:var(--sr-color-text);text-align:left;cursor:pointer}.radio-card:hover,.radio-card:focus-visible{border-color:var(--sr-color-line-strong);background:var(--sr-color-surface-raised)}.radio-card__cover{width:42px;height:42px;overflow:hidden;border:1px solid rgba(255,255,255,.12);border-radius:11px;background:var(--sr-color-surface-raised)}.radio-card__cover img{width:100%;height:100%;object-fit:cover}.radio-card__copy,.radio-card__meta{min-width:0;display:flex;flex-direction:column;gap:4px}.radio-card__copy strong{font-size:12px}.radio-card__copy small{overflow:hidden;color:var(--sr-color-text-muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.radio-card__meta{align-items:flex-end}.radio-card__meta b{color:var(--sr-color-accent);font-size:11px;letter-spacing:.15em}.radio-card__meta small{color:var(--sr-color-text-faint);font-size:11px}
</style>
