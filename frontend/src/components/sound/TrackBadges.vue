<template>
  <span v-if="badges.length" class="track-badges">
    <span v-for="badge in badges" :key="badge" class="track-badge" :class="`track-badge--${badge}`" :title="badgeDescription(badge)">{{ badgeLabels[badge] }}</span>
  </span>
</template>
<script setup lang="ts">
import { computed } from 'vue';
import type { Track } from '@studyroom/contracts';
import { badgeLabels, badgeDescription, candidateBadges, selectedTrackCandidate } from '../../audio/providerTrackBadges';
const props = defineProps<{ track: Track }>();
const badges = computed(() => candidateBadges(selectedTrackCandidate(props.track)));
</script>
<style scoped>
.track-badges { display: inline-flex; flex: 0 0 auto; align-items: center; gap: 4px; }
.track-badge { border: 1px solid var(--sr-color-line); border-radius: 5px; padding: 1px 4px; font-size: 10px; font-weight: 600; line-height: 1.3; white-space: nowrap; color: var(--sr-color-text-muted); }
.track-badge--vip,.track-badge--purchase { color: var(--sr-color-accent); border-color: color-mix(in srgb, var(--sr-color-accent) 45%, transparent); }
</style>
