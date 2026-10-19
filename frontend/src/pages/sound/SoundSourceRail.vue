<template>
  <aside class="source-rail" aria-label="声音来源">
    <div v-if="showLocalLibrary" class="source-rail__intro">
      <span>声音来源</span>
      <strong>{{ trackCount.toLocaleString() }}</strong>
      <small>首音乐，仅保存在本机</small>
    </div>

    <nav class="source-rail__nav" aria-label="声音中心导航">
      <button v-for="item in primarySources" :key="item.id" type="button" :class="{ active: activeSource === item.id }" @click="$emit('select', item.id)">
        <AppIcon :name="item.icon as IconName" /><b>{{ item.label }}</b><small>{{ item.count }}</small>
      </button>
    </nav>

    <section v-if="showProviders" class="source-rail__providers" aria-label="平台音乐">
      <span>平台聚合</span>
      <button v-for="item in providerSources" :key="item.id" type="button" class="source-rail__playlist" :class="{ active: activeSource === item.id }" @click="$emit('select', item.id)">
        <span>{{ item.label }}</span><small>{{ item.state }}</small>
      </button>
    </section>

    <section v-if="showLocalLibrary" class="source-rail__playlists">
      <div class="source-rail__section-title"><span>播放列表</span><button type="button" aria-label="新建播放列表" @click="creating = !creating"><AppIcon name="plus" /></button></div>
      <form v-if="creating" class="source-rail__create" @submit.prevent="submitCreate">
        <input v-model.trim="playlistName" maxlength="60" aria-label="播放列表名称" placeholder="列表名称" />
        <button type="submit" :disabled="!playlistName">创建</button>
      </form>
      <button v-for="playlist in playlists" :key="playlist.id" type="button" class="source-rail__playlist" :class="{ active: activeSource === `playlist:${playlist.id}` }" @click="$emit('select', `playlist:${playlist.id}`)">
        <span>{{ playlist.name }}</span><small>{{ playlist.trackCount }}</small>
      </button>
      <p v-if="!playlists.length && !creating">还没有自建列表</p>
    </section>

    <section v-if="roots.length" class="source-rail__roots" aria-label="已导入文件夹">
      <span>音乐文件夹</span>
      <div v-for="root in roots" :key="root.id" class="source-rail__root">
        <div><strong>{{ root.displayName }}</strong><small>{{ root.watchEnabled ? "自动监控" : "手动扫描" }}</small></div>
        <button type="button" :disabled="scanning" @click="$emit('rescan', root.id)">扫描</button>
      </div>
    </section>
  </aside>
</template>

<script setup lang="ts">
import type { LibraryRootSummary, LocalPlaylistSummary, ProviderRuntimeStatus } from "@studyroom/contracts";
import type { IconName } from "../../components/icons/paths";
import { computed, ref } from "vue";

const props = withDefaults(defineProps<{
  activeSource: string;
  trackCount: number;
  favoriteCount: number;
  recentCount: number;
  playlists: LocalPlaylistSummary[];
  roots: LibraryRootSummary[];
  scanning: boolean;
  showLocalLibrary?: boolean;
  showRadio?: boolean;
  showProviders?: boolean;
  providerStatuses?: ProviderRuntimeStatus[];
}>(), { showLocalLibrary: true, showRadio: false, showProviders: false, providerStatuses: () => [] });
const emit = defineEmits<{
  (event: "select", source: string): void;
  (event: "create-playlist", name: string): void;
  (event: "rescan", rootId: string): void;
}>();
const creating = ref(false);
const playlistName = ref("");
const primarySources = computed(() => [
  ...(props.showLocalLibrary ? [
    { id: "library", icon: "music", label: "本地曲库", count: compactCount(props.trackCount) },
    { id: "favorites", icon: "heart", label: "我喜欢的", count: props.favoriteCount.toLocaleString() },
    { id: "recent", icon: "clock", label: "最近播放", count: props.recentCount.toLocaleString() }
  ] : [{ id: "web-file", icon: "music", label: "临时音频", count: props.trackCount ? "1" : "0" }]),
  { id: "ambient", icon: "waves", label: "环境声音", count: "7" },
  ...(props.showRadio ? [{ id: "radio", icon: "radio", label: "公开电台", count: "Live" }] : [])
]);
const providerSources = computed(() => [
  { id: "provider:all", label: "聚合搜索", state: "Beta" },
  ...(["netease", "qq", "kugou"] as const).map((providerId) => ({
    id: `provider:${providerId}`,
    label: providerId === "netease" ? "网易云" : providerId === "qq" ? "QQ 音乐" : "酷狗音乐",
    state: providerState(props.providerStatuses.find((status) => status.providerId === providerId))
  }))
]);

function providerState(status?: ProviderRuntimeStatus) {
  if (!status) return "待检查";
  if (status.errorCode === "PROVIDER_DISABLED") return "关闭";
  if (status.errorCode) return "受阻";
  return status.state === "signed-in" ? "已登录" : "可用";
}

function compactCount(value: number) { return value >= 10_000 ? `${Math.round(value / 10_000)}万` : value.toLocaleString(); }

function submitCreate() {
  if (!playlistName.value) return;
  emit("create-playlist", playlistName.value);
  playlistName.value = "";
  creating.value = false;
}
</script>

<style scoped>
.source-rail{min-width:0;align-self:stretch;padding:4px 18px 4px 0;border-right:1px solid var(--sr-color-line);overflow:auto;scrollbar-width:thin}.source-rail__intro{display:flex;flex-direction:column;padding:0 8px 22px}.source-rail__intro>span,.source-rail__section-title>span,.source-rail__roots>span{color:var(--sr-color-text-faint);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}.source-rail__intro>strong{margin-top:4px;font-family:var(--sr-font-sans);font-size:42px;font-weight:500;line-height:1}.source-rail__intro>small{margin-top:5px;color:var(--sr-color-text-muted);font-size:12px}.source-rail__nav{display:grid;gap:3px}.source-rail__nav>button,.source-rail__playlist{width:100%;display:grid;grid-template-columns:22px minmax(0,1fr) auto;align-items:center;gap:7px;padding:9px 10px;border:0;border-radius:10px;background:transparent;color:var(--sr-color-text-muted);font-size:12px;text-align:left;cursor:pointer}.source-rail__nav>button b{font-weight:600}.source-rail__nav>button small,.source-rail__playlist small{color:var(--sr-color-text-faint);font-size:12px}.source-rail__nav>button:hover,.source-rail__playlist:hover,.source-rail__nav>button.active,.source-rail__playlist.active{background:var(--sr-color-surface-raised);color:var(--sr-color-text)}.source-rail__nav>button.active{box-shadow:inset 2px 0 var(--sr-color-accent)}.source-rail__playlists,.source-rail__roots{margin-top:24px;padding-top:16px;border-top:1px solid var(--sr-color-line)}.source-rail__section-title{display:flex;align-items:center;justify-content:space-between;padding:0 8px 6px}.source-rail__section-title button{width:24px;height:24px;border:0;border-radius:50%;background:var(--sr-color-surface-raised);color:var(--sr-color-text);cursor:pointer}.source-rail__playlist{grid-template-columns:minmax(0,1fr) auto}.source-rail__playlist span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source-rail__playlists p{margin:8px;color:var(--sr-color-text-faint);font-size:12px}.source-rail__create{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;padding:5px 8px}.source-rail__create input{min-width:0;padding:7px 8px;border:1px solid var(--sr-color-line);border-radius:8px;background:var(--sr-color-surface-raised);color:var(--sr-color-text);font-size:12px}.source-rail__create button,.source-rail__root button{border:0;border-radius:8px;background:var(--sr-color-surface-raised);color:var(--sr-color-text-muted);font-size:11px;cursor:pointer}.source-rail__roots{display:grid;gap:8px;padding-inline:8px}.source-rail__root{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:5px}.source-rail__root>div{min-width:0;display:flex;flex-direction:column;gap:2px}.source-rail__root strong,.source-rail__root small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.source-rail__root strong{font-size:12px}.source-rail__root small{color:var(--sr-color-text-faint);font-size:11px}.source-rail__root button{padding:5px 7px}
.source-rail__providers{margin-top:24px;padding-top:16px;border-top:1px solid var(--sr-color-line)}.source-rail__providers>span{display:block;padding:0 8px 6px;color:var(--sr-color-text-faint);font-size:12px;font-weight:700;letter-spacing:.14em}.source-rail__providers .source-rail__playlist{grid-template-columns:minmax(0,1fr) auto}
@media(max-width:1099px){.source-rail{display:flex;align-items:center;gap:7px;padding:0 0 10px;border-right:0;border-bottom:1px solid var(--sr-color-line);overflow-x:auto}.source-rail__intro,.source-rail__playlists,.source-rail__roots{display:none}.source-rail__nav,.source-rail__providers{display:flex;gap:5px}.source-rail__providers{margin:0;padding:0;border:0}.source-rail__providers>span{display:none}.source-rail__nav>button,.source-rail__providers>button{width:auto;grid-template-columns:16px auto auto;white-space:nowrap}}
.source-rail__nav>button,.source-rail__playlist{min-height:44px;border-radius:var(--sr-radius-control,12px);font-size:13px}.source-rail__nav>button.active,.source-rail__playlist.active{background:var(--sr-color-selected);box-shadow:none;color:var(--sr-color-text)}.source-rail__intro>strong{font:500 36px/1.2 var(--sr-font-sans);font-variant-numeric:tabular-nums}.source-rail__section-title button,.source-rail__create button,.source-rail__root button{min-width:44px;min-height:44px}.source-rail__create{grid-template-columns:1fr}.source-rail__create input{min-height:44px}.source-rail{scrollbar-color:var(--sr-color-line-strong) transparent}.source-rail__nav>button:focus-visible,.source-rail__playlist:focus-visible{outline:2px solid var(--sr-color-focus,#b6d7bd);outline-offset:-2px}
@media(hover:none){.source-rail__nav>button:hover:not(.active),.source-rail__playlist:hover:not(.active){background:transparent}}
</style>
