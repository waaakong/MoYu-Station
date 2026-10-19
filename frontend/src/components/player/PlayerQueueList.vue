<template>
  <div ref="viewport" class="queue-list" role="list" aria-label="播放队列" @scroll="handleScroll">
    <div :style="{ height: `${topSpacer}px` }" aria-hidden="true"></div>
    <div
      v-for="entry in visibleEntries"
      :key="entry.item.id"
      class="queue-list__row"
      :class="{ 'queue-list__row--current': entry.item.id === currentItemId }"
      role="listitem"
      :aria-posinset="entry.index + 1"
      :aria-setsize="items.length"
    >
      <button class="queue-list__select" type="button" :aria-label="trackPlayLabel(entry.item.track)" @click="$emit('select', entry.item)">
        <span aria-hidden="true"><AppIcon v-if="entry.item.id === currentItemId" name="play" /><template v-else>{{ String(entry.index + 1).padStart(2, "0") }}</template></span>
        <span><span class="queue-list__title"><strong>{{ entry.item.track.title }}</strong><TrackBadges :track="entry.item.track" /></span><small>{{ entry.item.track.artist }}</small></span>
      </button>
      <button class="queue-list__remove" type="button" :aria-label="`从队列移除 ${entry.item.track.title}`" @click="$emit('remove', entry.item.id)"><AppIcon name="close" /></button>
    </div>
    <div :style="{ height: `${bottomSpacer}px` }" aria-hidden="true"></div>
  </div>
</template>

<script setup lang="ts">
import TrackBadges from "../sound/TrackBadges.vue";
import { trackPlayLabel } from "../../audio/providerTrackBadges";
import type { QueueItem } from "@studyroom/contracts";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = withDefaults(defineProps<{ items: QueueItem[]; currentItemId?: string; rowHeight?: number }>(), { rowHeight: 44 });
defineEmits<{
  (event: "select", item: QueueItem): void;
  (event: "remove", itemId: string): void;
}>();

const viewport = ref<HTMLElement>();
const scrollTop = ref(0);
const viewportHeight = ref(176);
const overscan = 4;
let resizeObserver: ResizeObserver | undefined;

const startIndex = computed(() => Math.max(0, Math.floor(scrollTop.value / props.rowHeight) - overscan));
const endIndex = computed(() => Math.min(props.items.length, Math.ceil((scrollTop.value + viewportHeight.value) / props.rowHeight) + overscan));
const visibleEntries = computed(() => props.items.slice(startIndex.value, endIndex.value).map((item, offset) => ({
  item,
  index: startIndex.value + offset
})));
const topSpacer = computed(() => startIndex.value * props.rowHeight);
const bottomSpacer = computed(() => Math.max(0, (props.items.length - endIndex.value) * props.rowHeight));

function handleScroll(event: Event) {
  scrollTop.value = (event.currentTarget as HTMLElement).scrollTop;
}

function measure() {
  viewportHeight.value = viewport.value?.clientHeight || 176;
}

onMounted(() => {
  measure();
  resizeObserver = new ResizeObserver(measure);
  if (viewport.value) resizeObserver.observe(viewport.value);
});

onBeforeUnmount(() => resizeObserver?.disconnect());
</script>

<style scoped>
.queue-list {
  height: 176px;
  overflow: auto;
  border-block: 1px solid var(--sr-color-surface-raised);
  scrollbar-gutter: stable;
}

.queue-list__row {
  height: 44px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  align-items: center;
  border-bottom: 1px solid var(--sr-color-surface-raised);
}

.queue-list__row--current { background: var(--sr-color-surface-raised); }
.queue-list__select { min-width: 0; height: 100%; display: grid; grid-template-columns: 28px minmax(0, 1fr); align-items: center; gap: 7px; border: 0; background: transparent; color: rgba(255, 255, 255, .86); text-align: left; cursor: pointer; }
.queue-list__select > span:last-child { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.queue-list__select strong,
.queue-list__select small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.queue-list__title { display:flex; align-items:center; gap:6px; min-width:0; }
.queue-list__title strong { min-width:0; }
.queue-list__select strong { font-size: 10px; }
.queue-list__select small { color: rgba(255, 255, 255, .48); font-size: 8px; }
.queue-list__select > span:first-child { color: rgba(255, 255, 255, .48); font-size: 8px; text-align: center; }
.queue-list__remove { width: 26px; height: 26px; border: 0; border-radius: 50%; background: transparent; color: rgba(255, 255, 255, .46); cursor: pointer; }
.queue-list__remove:hover,
.queue-list__remove:focus-visible { background: var(--sr-color-surface-raised); color: #fff; }
</style>
