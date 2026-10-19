<template>
  <div v-if="items.length" class="media-grid" :class="{ single: items.length === 1 }" :style="{ '--columns': galleryColumns(items.length) }">
    <button v-for="(item, index) in items" :key="`${index}:${item.clearUrl}`" class="media-tile" type="button"
      :class="{ 'long-image': long(item, index), failed: failed.has(index) }" :style="tileStyle(item, index)"
      :aria-label="failed.has(index) ? `第 ${index + 1} 张图片加载失败，点击重试` : `查看第 ${index + 1} 张图片，共 ${items.length} 张`"
      @click="activate(item, index)">
      <span v-if="failed.has(index)" class="media-failure">图片加载失败<br />点击重试</span>
      <img v-else :key="attempts[index] || 0" :src="assetUrl(item.thumbnailUrl)" :alt="`${label} ${index + 1}`"
        :width="item.width" :height="item.height" loading="lazy" decoding="async"
        @load="loaded($event, index)" @error="failed.add(index)" />
      <span v-if="long(item, index) && !failed.has(index)" class="media-label">长图</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import type { MediaDescriptor } from '@studyroom/contracts';
import { galleryImages, galleryColumns, isLongImage, type GalleryImage } from '../../media/mediaPresentation';
import { cloudMediaUrl as assetUrl } from '../../utils/cloudMedia';
const props = withDefaults(defineProps<{ urls: string[]; media?: MediaDescriptor[]; label?: string }>(), { label: '图片' });
const emit = defineEmits<{ open: [urls: string[], index: number] }>();
const items = computed(() => galleryImages(props.urls, props.media));
const failed = reactive(new Set<number>());
const attempts = reactive<Record<number, number>>({});
const natural = reactive<Record<number, { width: number; height: number }>>({});
watch(() => props.urls.join('\n'), () => {
  failed.clear(); for (const key of Object.keys(natural)) delete natural[Number(key)];
  for (const key of Object.keys(attempts)) delete attempts[Number(key)];
});
function dimensions(item: GalleryImage, index: number) { return item.width && item.height ? item : natural[index]; }
function long(item: GalleryImage, index: number) { const size = dimensions(item, index); return isLongImage(size?.width, size?.height); }
function tileStyle(item: GalleryImage, index: number) {
  if (items.value.length !== 1) return undefined;
  const size = dimensions(item, index);
  if (!size?.width || !size.height) return undefined;
  const ratio = size.width / size.height;
  return { aspectRatio: String(long(item, index) ? .8 : ratio), width: `min(100%, ${Math.min(520, size.width, 420 * Math.max(.8, ratio))}px)` };
}
function loaded(event: Event, index: number) {
  const image = event.target as HTMLImageElement;
  natural[index] = { width: image.naturalWidth, height: image.naturalHeight };
}
function activate(_item: GalleryImage, index: number) {
  if (failed.delete(index)) { attempts[index] = (attempts[index] || 0) + 1; return; }
  emit('open', items.value.map(image => image.clearUrl), index);
}
</script>

<style scoped>
.media-grid{display:grid;grid-template-columns:repeat(var(--columns),minmax(0,1fr));gap:6px;max-width:520px;min-width:0;margin-bottom:16px}
.media-tile{position:relative;display:block;min-width:0;aspect-ratio:1;overflow:hidden;border:0;border-radius:var(--sr-radius-control);padding:0;background:#202c23;color:inherit;cursor:zoom-in}
.media-tile img{display:block;width:100%;height:100%;object-fit:cover;object-position:center;transition:opacity var(--sr-motion-fast) ease}
.media-tile.long-image img{object-position:top}
.single .media-tile{aspect-ratio:auto;max-height:420px;max-width:100%;justify-self:start}
.single .media-tile img{width:100%;height:auto;max-height:420px;object-fit:contain}
.single .media-tile[style] img{height:100%;max-height:none}
.single .long-image img{object-fit:cover}
@media(hover:hover) and (pointer:fine){.media-tile:hover img{opacity:.88}}
.media-tile:focus-visible{outline:3px solid var(--sr-color-focus);outline-offset:3px}
.media-label{position:absolute;right:6px;bottom:6px;padding:2px 7px;border-radius:4px;background:rgba(0,0,0,.72);color:#fff;font-size:11px;line-height:1.5;pointer-events:none}
.media-failure{display:grid;place-content:center;height:100%;box-sizing:border-box;padding:8px;font-size:12px;line-height:1.8}.failed{cursor:pointer;min-width:0}.single .failed{min-height:100px}
@media(prefers-reduced-motion:reduce){.media-tile{transition:none}}
</style>
