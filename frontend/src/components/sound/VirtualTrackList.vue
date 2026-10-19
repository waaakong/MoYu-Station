<template>
  <div ref="viewport" class="virtual-track-list" :class="{ 'virtual-track-list--provider': !allowLibraryActions }" role="list" :aria-label="allowLibraryActions ? '本地曲库' : '平台曲目'" @scroll="handleScroll">
    <div :style="{ height: `${topSpacer}px` }" aria-hidden="true"></div>
    <div
      v-for="entry in visibleEntries"
      :key="entry.track.id"
      class="virtual-track-list__row"
      role="listitem"
      :aria-posinset="entry.index + 1"
      :aria-setsize="tracks.length"
    >
      <button class="track-main" type="button" :aria-label="trackPlayLabel(entry.track)" @click="$emit('play', entry.track)">
        <span class="track-index">{{ String(entry.index + 1).padStart(2, "0") }}</span>
        <span class="track-artwork">
          <TrackArtwork :track="entry.track" />
        </span>
        <span class="track-copy"><span class="track-title"><strong>{{ entry.track.title }}</strong><TrackBadges :track="entry.track" /></span><small>{{ entry.track.artist }}</small></span>
        <span class="track-album">
          <span v-if="entry.track.providerCandidates?.length" class="track-providers">
            <b v-for="candidate in entry.track.providerCandidates" :key="candidate.id" :class="{ unavailable: !candidate.isAvailable || candidate.rights !== 'available' }" :title="providerAvailabilityText(candidate)">{{ providerLabel(candidate.providerId) }}</b>
            <em>{{ confidenceLabel(entry.track) }}</em>
          </span>
          <template v-else>{{ entry.track.album || "本地音乐" }}</template>
        </span>
        <span class="track-duration">{{ formatDuration(entry.track.durationMs) }}</span>
        <AppIcon class="track-play" name="play" />
      </button>
      <button v-if="allowLibraryActions" class="track-favorite" type="button" :class="{ active: favoriteSet.has(entry.track.id) }" :aria-label="favoriteSet.has(entry.track.id) ? `取消喜欢 ${entry.track.title}` : `喜欢 ${entry.track.title}`" :aria-pressed="favoriteSet.has(entry.track.id)" @click="$emit('toggle-favorite', entry.track)"><AppIcon name="heart" :style="{fill:favoriteSet.has(entry.track.id)?'currentColor':'none'}" /></button>
      <button class="track-next" type="button" :aria-label="`下一首播放 ${entry.track.title}`" @click="$emit('play-next', entry.track)">下一首</button>
      <button v-if="allowLibraryActions && activePlaylistId" class="track-remove" type="button" :aria-label="`从播放列表移除 ${entry.track.title}`" @click="$emit('remove-from-playlist', entry.track)">移出</button>
      <AppSelect v-else-if="allowLibraryActions && playlists.length" class="track-playlist" :aria-label="`添加 ${entry.track.title} 到播放列表`" value="" @change="addToPlaylist(entry.track, $event)">
        <option value="" disabled>加入列表</option>
        <option v-for="playlist in playlists" :key="playlist.id" :value="playlist.id">{{ playlist.name }}</option>
      </AppSelect>
      <AppSelect v-else-if="entry.track.providerCandidates && entry.track.providerCandidates.length > 1" class="track-source" :value="entry.track.selectedProviderId" :aria-label="`选择 ${entry.track.title} 的播放来源`" @change="selectProviderSource(entry.track, $event)">
        <option v-for="candidate in entry.track.providerCandidates" :key="candidate.id" :value="candidate.providerId" :disabled="!candidate.isAvailable || candidate.rights !== 'available'">{{ providerLabel(candidate.providerId) }}{{ candidate.isAvailable && candidate.rights === 'available' ? '' : ' · 受限' }}</option>
      </AppSelect>
      <span v-else aria-hidden="true"></span>
    </div>
    <div :style="{ height: `${bottomSpacer}px` }" aria-hidden="true"></div>
  </div>
</template>

<script setup lang="ts">
import TrackBadges from "./TrackBadges.vue";
import { providerAvailabilityText, trackPlayLabel } from "../../audio/providerTrackBadges";
import TrackArtwork from "./TrackArtwork.vue";
import type { LocalPlaylistSummary, ProviderId, Track } from "@studyroom/contracts";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = withDefaults(defineProps<{ tracks: Track[]; rowHeight?: number; favoriteTrackIds?: string[]; playlists?: LocalPlaylistSummary[]; activePlaylistId?: string; allowLibraryActions?: boolean }>(), { rowHeight: 58, favoriteTrackIds: () => [], playlists: () => [], allowLibraryActions: true });
const emit = defineEmits<{
  (event: "play", track: Track): void;
  (event: "play-next", track: Track): void;
  (event: "toggle-favorite", track: Track): void;
  (event: "add-to-playlist", track: Track, playlistId: string): void;
  (event: "remove-from-playlist", track: Track): void;
  (event: "select-provider-source", track: Track, providerId: ProviderId): void;
}>();

const viewport = ref<HTMLElement>();
const scrollTop = ref(0);
const viewportHeight = ref(360);
const overscan = 6;
const favoriteSet = computed(() => new Set(props.favoriteTrackIds));
let resizeObserver: ResizeObserver | undefined;

const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / props.rowHeight) - overscan));
const endIndex = computed(() => Math.min(
  props.tracks.length,
  Math.ceil((scrollTop.value + viewportHeight.value) / props.rowHeight) + overscan
));
const visibleEntries = computed(() => props.tracks.slice(startIndex.value, endIndex.value).map((track, offset) => ({
  track,
  index: startIndex.value + offset
})));
const topSpacer = computed(() => startIndex.value * props.rowHeight);
const bottomSpacer = computed(() => Math.max(0, (props.tracks.length - endIndex.value) * props.rowHeight));

function handleScroll(event: Event) {
  scrollTop.value = (event.currentTarget as HTMLElement).scrollTop;
}

function measure() {
  viewportHeight.value = viewport.value?.clientHeight || 360;
}

function formatDuration(durationMs?: number) {
  if (!durationMs) return "—";
  const seconds = Math.round(durationMs / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function addToPlaylist(track: Track, event: Event) {
  const select = event.currentTarget as HTMLSelectElement;
  if (select.value) emit("add-to-playlist", track, select.value);
  select.value = "";
}

function selectProviderSource(track: Track, event: Event) {
  emit("select-provider-source", track, (event.currentTarget as HTMLSelectElement).value as ProviderId);
}

function providerLabel(providerId: ProviderId) {
  return providerId === "netease" ? "网易云" : providerId === "qq" ? "QQ" : "酷狗";
}

function confidenceLabel(track: Track) {
  const scores = track.providerCandidates?.map(({ matchScore }) => matchScore ?? 0) ?? [];
  if (scores.length > 1 && scores.every((score) => score >= 0.95)) return "同版本";
  if (scores.some((score) => score >= 0.85 && score < 0.95)) return "可能同版本";
  return "独立来源";
}

watch(() => props.tracks, () => {
  scrollTop.value = 0;
  if (viewport.value) viewport.value.scrollTop = 0;
});

onMounted(() => {
  measure();
  resizeObserver = new ResizeObserver(measure);
  if (viewport.value) resizeObserver.observe(viewport.value);
});

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<style scoped>
.virtual-track-list {
  height: clamp(260px, calc(100vh - 330px), 620px);
  overflow: auto;
  border-top: 1px solid var(--sr-color-line);
  scrollbar-gutter: stable;
}

.virtual-track-list__row {
  height: 58px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px 50px 68px;
  border-bottom: 1px solid var(--sr-color-line);
}

.virtual-track-list--provider .virtual-track-list__row {
  grid-template-columns: minmax(0, 1fr) 64px 80px;
}
.virtual-track-list--provider .track-next { white-space: nowrap; padding: 0 8px; }

.track-main {
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-columns: 30px 36px minmax(160px, 1fr) minmax(100px, .6fr) 42px 28px;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--sr-color-text);
  text-align: left;
  cursor: pointer;
}

.track-main:hover,
.track-main:focus-visible,
.track-next:hover,
.track-next:focus-visible {
  background: var(--sr-color-surface-raised);
}
.track-next,.track-favorite,.track-remove { border:0;border-left:1px solid var(--sr-color-line);background:transparent;color:var(--sr-color-text-muted);font-size:12px;cursor:pointer; }.track-favorite{font-size:15px}.track-favorite.active{color:var(--sr-color-accent)}.track-playlist,.track-source{min-width:0;border:0;border-left:1px solid var(--sr-color-line);background:var(--sr-color-surface-solid);color:var(--sr-color-text-muted);font-size:11px;cursor:pointer}.track-remove{grid-column:auto}

.track-index,
.track-album,
.track-duration {
  color: var(--sr-color-text-faint);
  font-size:12px;
}

.track-artwork { width:34px;height:34px;display:grid;place-items:center;overflow:hidden;border-radius:7px;background:var(--sr-color-surface-raised);color:var(--sr-color-text-faint);font-size:13px; }
.track-artwork img { width:100%;height:100%;object-fit:cover; }

.track-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.track-copy strong,
.track-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-title { display:flex; align-items:center; gap:6px; min-width:0; }
.track-title strong { min-width:0; }
.track-copy strong { font-size: 12px; }
.track-copy small { color: var(--sr-color-text-muted); font-size:12px; }
.track-providers{display:flex;align-items:center;gap:3px;overflow:hidden}.track-providers b{padding:2px 4px;border:1px solid rgba(211,174,113,.3);border-radius:99px;color:var(--sr-color-accent);font-size:11px;font-weight:700;white-space:nowrap}.track-providers b.unavailable{border-color:var(--sr-color-line);color:var(--sr-color-text-faint);text-decoration:line-through}.track-providers em{color:var(--sr-color-text-faint);font-size:11px;font-style:normal;white-space:nowrap}
.track-play { color: var(--sr-color-accent); }

@media (max-width: 1100px) {
  .track-album,.track-duration { display: none; }
  .track-main { grid-template-columns: 28px 34px minmax(0, 1fr) 28px; }
}
@media(max-width:700px){.virtual-track-list__row{grid-template-columns:minmax(0,1fr) 34px}.virtual-track-list--provider .virtual-track-list__row{grid-template-columns:minmax(0,1fr)}.track-next,.track-playlist,.track-source,.track-remove{display:none}}
</style>
