<template>
  <section class="ambient-library" aria-label="环境声音库">
    <header><div><h2>环境声音</h2><p>最多同时混合 6 种声音，所有音频都在本机处理。</p></div><span>{{ activeIds.size }} / 6</span></header>
    <div class="ambient-library__list">
      <article v-for="(entry, index) in AMBIENT_CATALOG" :key="entry.id" :class="{ active: activeIds.has(entry.id) }">
        <button type="button" :aria-label="activeIds.has(entry.id) ? `停止 ${entry.name}` : `播放 ${entry.name}`" @click="$emit('toggle', entry.id)">
          <span class="ambient-library__index">0{{ index + 1 }}</span>
          <span class="ambient-library__glyph" aria-hidden="true"><AppIcon :name="glyphs[index]!" /></span>
          <span class="ambient-library__copy"><strong>{{ entry.name }}</strong><small>{{ entry.description }}</small></span>
          <span class="ambient-library__kind">{{ entry.kind === "generated" ? "实时生成" : "本地循环" }}</span>
          <AppIcon :name="activeIds.has(entry.id) ? 'stop' : 'play'" />
        </button>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { AmbientSourceId } from "@studyroom/contracts";
import { computed } from "vue";
import { AMBIENT_CATALOG } from "../../audio/ambient/ambientCatalog";

const props = defineProps<{ activeSources: AmbientSourceId[] }>();
defineEmits<{ (event: "toggle", sourceId: AmbientSourceId): void }>();
const activeIds = computed(() => new Set(props.activeSources));
const glyphs = ["waves", "waves", "waves", "rain", "cup", "fire", "waves"] as const;
</script>

<style scoped>
.ambient-library{height:100%;display:flex;min-height:0;flex-direction:column}.ambient-library header{display:flex;align-items:flex-end;justify-content:space-between;padding:2px 4px 18px}.ambient-library h2{margin:0;font-family:var(--sr-font-sans);font-size:24px;font-weight:500}.ambient-library p{margin:6px 0 0;color:var(--sr-color-text-muted);font-size:12px}.ambient-library header>span{color:var(--sr-color-accent);font-size:12px;font-weight:700}.ambient-library__list{min-height:0;overflow:auto;border-top:1px solid var(--sr-color-line)}.ambient-library article{border-bottom:1px solid var(--sr-color-line)}.ambient-library article.active{background:var(--sr-color-surface-raised)}.ambient-library article>button{width:100%;display:grid;grid-template-columns:30px 40px minmax(160px,1fr) 72px 24px;align-items:center;gap:11px;padding:12px 10px;border:0;background:transparent;color:var(--sr-color-text);text-align:left;cursor:pointer}.ambient-library article>button:hover{background:var(--sr-color-surface-raised)}.ambient-library__index,.ambient-library__kind{color:var(--sr-color-text-faint);font-size:12px}.ambient-library__glyph{width:36px;height:36px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:var(--sr-color-surface-raised);color:var(--sr-color-accent)}.ambient-library__copy{min-width:0;display:flex;flex-direction:column;gap:4px}.ambient-library__copy strong{font-size:12px}.ambient-library__copy small{overflow:hidden;color:var(--sr-color-text-muted);font-size:12px;text-overflow:ellipsis;white-space:nowrap}.ambient-library article b{color:var(--sr-color-accent);font-size:12px;text-align:center}
@media(max-width:650px){.ambient-library article>button{grid-template-columns:22px 34px minmax(120px,1fr) 20px}.ambient-library__kind{display:none}}
.ambient-library__copy strong{font-size:14px;font-weight:600}.ambient-library__copy small{font-size:12px}.ambient-library header{gap:12px}.ambient-library article>button{min-height:72px;grid-template-columns:22px 40px minmax(0,1fr) 64px 24px}.ambient-library article.active{background:var(--sr-color-selected)}
@media(max-width:650px){.ambient-library article>button{grid-template-columns:34px minmax(0,1fr) 24px;padding:12px 6px;gap:10px}.ambient-library__index{display:none}.ambient-library header{align-items:flex-start}.ambient-library header>span{white-space:nowrap}.ambient-library__copy small{white-space:normal;font-size:11px;line-height:1.5}}
@media(hover:none){.ambient-library article>button:hover{background:transparent}}
</style>
