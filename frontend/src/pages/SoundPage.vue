<template>
  <section class="sound-page" :style="soundPageStyle">
    <header v-if="!stageOpen" class="sound-page__header" data-motion-group>
      <div><p>LOCAL · PRIVATE · CONTINUOUS</p><h1>声音</h1><span>一处管理音乐、环境声与专注时的听觉空间。</span></div>
      <div class="sound-page__actions">
        <button ref="stageButton" class="sr-glass" type="button" @click="stageOpen = true">听歌舞台</button>
        <button v-if="showProviders" type="button" aria-label="打开平台音乐" @click="openProviderAccounts">平台音乐</button>
        <button ref="consoleButton" class="sound-page__console-button sr-glass" type="button" aria-label="打开声音控制台" @click="() => openContext()">调音台</button>
        <template v-if="canImport"><button type="button" :disabled="scanning" @click="importFiles">导入文件</button><button class="primary" type="button" :disabled="scanning" @click="importDirectory">{{ scanning ? "正在处理…" : "导入文件夹" }}</button></template>
        <template v-else-if="canOpenTemporaryFile"><input ref="webFileInput" class="sound-page__file-input" type="file" accept="audio/*,.flac,.m4a,.opus" @change="selectTemporaryFile" /><button class="primary" type="button" @click="webFileInput?.click()">选择音频</button></template>
      </div>
    </header>

    <ListeningStage v-if="stageOpen" :favorite-track-ids="favoriteTrackIds" @toggle-favorite="toggleFavorite" @close="closeStage" @client-settings="router.push({name:'profile',query:{module:'client-settings',returnStage:'1'}})" />
    <div v-else class="sound-page__workspace" data-motion-group>
      <SoundSourceRail :active-source="activeSource" :track-count="visibleTrackCount" :favorite-count="favoriteTracks.length" :recent-count="recentTracks.length" :playlists="playlists" :roots="roots" :scanning="scanning" :show-local-library="canImport" :show-radio="showRadio" :show-providers="showProviders" :provider-statuses="providers.statuses" @select="selectSource" @create-playlist="createPlaylist" @rescan="rescanRoot" />
      <main v-motion-content="activeSource" class="sound-page__main sr-glass sr-glass--reading">
        <div class="library-head">
          <div><h2>{{ sourceTitle }}</h2><span>{{ sourceDescription }}</span></div>
          <div class="library-head__tools">
            <template v-if="selectedPlaylist"><button type="button" @click="startRename">重命名</button><button class="danger" type="button" @click="deletePlaylist">删除</button></template>
            <input v-if="!isProviderSource && activeSource !== 'ambient' && activeSource !== 'radio'" v-model.trim="query" type="search" placeholder="搜索歌曲或艺术家" aria-label="搜索本地曲库" />
          </div>
        </div>
        <form v-if="renamingPlaylist" class="playlist-rename" @submit.prevent="commitRename"><input v-model.trim="renameValue" maxlength="60" aria-label="新的播放列表名称" /><button type="submit">保存</button><button type="button" @click="renamingPlaylist = false">取消</button></form>
        <section v-if="missingTracks.length && activeSource === 'library'" class="missing-tracks" aria-label="需要重新定位的音乐">
          <div><strong>{{ missingTracks.length }} 首音乐已失效</strong><span>文件被移动或删除后不会静默失败。</span></div>
          <button type="button" :disabled="relocatingId === missingTracks[0].track.id" @click="relocate(missingTracks[0].track.id)">{{ relocatingId ? "定位中…" : "定位第一首" }}</button>
        </section>
        <AmbientLibrary v-if="activeSource === 'ambient'" :active-sources="sound.settings.ambientTracks.map(({ sourceId }) => sourceId)" @toggle="toggleAmbient" />
        <AppSkeleton v-else-if="activeSource === 'radio' && radio.loading" :lines="4" />
        <StatePanel v-else-if="activeSource === 'radio' && radio.error" title="公开电台暂时不可用" :description="radio.error" action-label="重试" tone="error" @action="radio.load" />
        <RadioLibrary v-else-if="activeSource === 'radio'" :stations="radio.stations" :now-playing="radio.nowPlaying" @play="playRadio" />
        <StatePanel v-else-if="isProviderSource && !isDesktop" title="桌面客户端专属实验能力" description="网页版不提供第三方平台登录、歌单或播放。公开电台仍可直接使用。" />
        <ProviderLibrary v-else-if="isProviderSource" :source="activeSource" @accounts="openProviderAccounts" @play="playTrack" @play-next="playNext" @select-provider-source="playProviderSource" />
        <StatePanel v-else-if="activeSource === 'web-file' && !webTrack" title="选择一首本地音乐" description="文件只在当前页面会话中播放，不上传服务器，也不保存路径。" action-label="选择音频" @action="webFileInput?.click()" />
        <VirtualTrackList v-else-if="activeSource === 'web-file'" :tracks="filteredTracks" :allow-library-actions="false" @play="playTrack" @play-next="playNext" />
        <AppSkeleton v-else-if="loading" :lines="6" />
        <StatePanel v-else-if="error" title="曲库暂时不可用" :description="error" action-label="重试" tone="error" @action="loadLibrary" />
        <StatePanel v-else-if="!canImport" title="网页版不读取本机文件" description="请使用 Windows 客户端导入曲库；网页版仍可使用内置环境音。" action-label="打开环境声音" @action="selectSource('ambient')" />
        <StatePanel v-else-if="!filteredTracks.length" :title="emptyTitle" :description="emptyDescription" :action-label="activeSource === 'library' && !activeTracks.length ? '导入音乐文件夹' : undefined" @action="importDirectory" />
        <VirtualTrackList v-else :tracks="filteredTracks" :favorite-track-ids="favoriteTrackIds" :playlists="playlists" :active-playlist-id="selectedPlaylist?.id" @play="playTrack" @play-next="playNext" @toggle-favorite="toggleFavorite" @add-to-playlist="addToPlaylist" @remove-from-playlist="removeFromPlaylist" />
      </main>
      <SoundContextPanel class="sound-page__context" />
    </div>

    <OverlayDialog :open="contextOpen" label="声音控制台" placement="right" @close="() => closeContext()" @closed="consoleButton?.focus({ preventScroll: true })">
      <SoundContextPanel class="sound-page__floating-console" closable @close="() => closeContext()" />
    </OverlayDialog>
    <OverlayDialog :open="providerAccountsOpen" label="平台音乐" placement="right" @close="providerAccountsOpen = false">
        <ProviderLoginPrompt v-if="!auth.isLoggedIn || auth.isBanned" stage="moyu" closable @close="providerAccountsOpen = false" @login="providerAccountsOpen = false; router.push('/login')" />
        <ProviderAccounts v-else :statuses="providers.statuses" :order="providers.preferredOrder" @close="providerAccountsOpen = false" @accept-risk="acceptProviderRisk" @rotate-order="rotateProviderOrder" @login="loginProvider" @logout="logoutProvider" />
    </OverlayDialog>
  </section>
</template>

<script setup lang="ts">
import type { AmbientSourceId, LibraryRootSummary, LocalPlaylistItem, LocalPlaylistSummary, MissingTrack, ProviderId, QueueItem, RadioStation, Track } from "@studyroom/contracts";
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import VirtualTrackList from "../components/sound/VirtualTrackList.vue";
import AppSkeleton from "../components/states/AppSkeleton.vue";
import StatePanel from "../components/states/StatePanel.vue";
import { sceneAssetCatalog } from "../scenes/sceneAssetCatalog";
import { featureFlags } from "../config/features";
import { radioStationTrack } from "../services/radio";
import { temporaryWebTrack } from "../services/webLocalAudio";
import { useCapabilitiesStore } from "../stores/capabilities";
import { usePlayerStore } from "../stores/player";
import { useQueueStore } from "../stores/queue";
import { useShellStore } from "../stores/shell";
import { useSoundStore } from "../stores/sound";
import { useAuthStore } from "../stores/auth";
import { useRoute, useRouter } from "vue-router";
import { useProvidersStore } from "../stores/providers";
import { useRadioStore } from "../stores/radio";
import AmbientLibrary from "./sound/AmbientLibrary.vue";
import SoundContextPanel from "./sound/SoundContextPanel.vue";
import SoundSourceRail from "./sound/SoundSourceRail.vue";
import RadioLibrary from "./sound/RadioLibrary.vue";
import ProviderAccounts from "./sound/ProviderAccounts.vue";
import ProviderLoginPrompt from './sound/ProviderLoginPrompt.vue';
import ProviderLibrary from "./sound/ProviderLibrary.vue";
import OverlayDialog from "../components/controls/OverlayDialog.vue";
import { providerErrorText, useProviderLibraryStore } from "../stores/providerLibrary";
const ListeningStage = defineAsyncComponent(() => import('./sound/ListeningStage.vue'));

const capabilities = useCapabilitiesStore();
const player = usePlayerStore();
const queue = useQueueStore();
const shell = useShellStore();
const sound = useSoundStore();
const auth = useAuthStore(), router = useRouter();
const providers = useProvidersStore();
const providerLibrary = useProviderLibraryStore();
const radio = useRadioStore();
const tracks = ref<Track[]>([]);
const recentTracks = ref<Track[]>([]);
const favoriteTracks = ref<Track[]>([]);
const playlists = ref<LocalPlaylistSummary[]>([]);
const playlistItems = ref<LocalPlaylistItem[]>([]);
const roots = ref<LibraryRootSummary[]>([]);
const missingTracks = ref<MissingTrack[]>([]);
const webTrack = ref<Track>();
const query = ref("");
const loading = ref(true);
const scanning = ref(false);
const relocatingId = ref("");
const error = ref("");
const activeSource = ref(window.studyRoomDesktop ? "library" : "web-file");
const contextOpen = ref(false);
const stageOpen = ref(useRoute().query.stage==='1');
const stageButton = ref<HTMLButtonElement>();
const consoleButton = ref<HTMLButtonElement>();
const webFileInput = ref<HTMLInputElement>();
const renamingPlaylist = ref(false);
const providerAccountsOpen = ref(false);
const renameValue = ref("");
const canImport = computed(() => capabilities.capabilities.localLibrary && Boolean(window.studyRoomDesktop));
const isDesktop = computed(() => Boolean(window.studyRoomDesktop));
const canOpenTemporaryFile = computed(() => capabilities.capabilities.temporaryFilePlayback && !isDesktop.value);
const showRadio = computed(() => featureFlags.publicRadio && capabilities.capabilities.publicRadio);
const showProviders = computed(() => featureFlags.providers && capabilities.capabilities.providerLogin);
const soundPageStyle = { "--sound-background": `url(${sceneAssetCatalog.library.afternoon.large.webp})` };
const favoriteTrackIds = computed(() => favoriteTracks.value.map(({ id }) => id));
const selectedPlaylist = computed(() => activeSource.value.startsWith("playlist:") ? playlists.value.find(({ id }) => id === activeSource.value.slice(9)) : undefined);
const isProviderSource = computed(() => activeSource.value.startsWith("provider:"));
const activeTracks = computed(() => activeSource.value === "web-file" ? (webTrack.value ? [webTrack.value] : []) : activeSource.value === "radio" ? radio.stations.map(radioStationTrack) : isProviderSource.value ? (providerLibrary.view === 'search' ? providers.tracks : providerLibrary.tracks) : activeSource.value === "recent" ? recentTracks.value : activeSource.value === "favorites" ? favoriteTracks.value : selectedPlaylist.value ? playlistItems.value.map(({ track }) => track) : tracks.value);
const visibleTrackCount = computed(() => canImport.value ? tracks.value.length : webTrack.value ? 1 : 0);
const filteredTracks = computed(() => { const needle = query.value.toLocaleLowerCase(); return needle ? activeTracks.value.filter((track) => `${track.title} ${track.artist} ${track.album || ""}`.toLocaleLowerCase().includes(needle)) : activeTracks.value; });
const sourceTitle = computed(() => activeSource.value === "web-file" ? "临时音频" : activeSource.value === "radio" ? "公开电台" : isProviderSource.value ? providerSourceTitle(activeSource.value) : activeSource.value === "ambient" ? "环境声音" : activeSource.value === "favorites" ? "我喜欢的" : activeSource.value === "recent" ? "最近播放" : selectedPlaylist.value?.name || "本地曲库");
const sourceDescription = computed(() => activeSource.value === "web-file" ? "不上传 · 不保存路径 · 刷新后失效" : activeSource.value === "radio" ? "无需登录 · 固定审核目录 · 仅个人收听" : isProviderSource.value ? "双重登录 · 本机凭据 · 不绕过平台权益" : activeSource.value === "ambient" ? "雨声、空间声与实时噪音" : activeSource.value === "recent" ? "最近 100 首，不重复显示" : selectedPlaylist.value ? `${selectedPlaylist.value.trackCount} 首音乐` : "MP3 · FLAC · WAV · M4A · AAC · OGG · OPUS");
const emptyTitle = computed(() => activeTracks.value.length ? "没有匹配的音乐" : activeSource.value === "recent" ? "还没有播放记录" : activeSource.value === "favorites" ? "还没有喜欢的音乐" : selectedPlaylist.value ? "这个列表还是空的" : "本地曲库还是空的");
const emptyDescription = computed(() => activeTracks.value.length ? "换一个关键词试试。" : selectedPlaylist.value ? "可从本地曲库将音乐加入这个列表。" : activeSource.value === "favorites" ? "点击曲目旁的爱心即可收藏。" : activeSource.value === "recent" ? "开始播放本地音乐后，会在这里留下记录。" : "选择音乐文件或文件夹，扫描结果只写入本机数据库。");

async function loadLibrary() {
  error.value = ""; loading.value = true;
  try {
    if (window.studyRoomDesktop) {
      [tracks.value, recentTracks.value, missingTracks.value, roots.value, favoriteTracks.value, playlists.value] = await Promise.all([
        window.studyRoomDesktop.listTracks(), window.studyRoomDesktop.listRecentTracks(), window.studyRoomDesktop.listMissingTracks(), window.studyRoomDesktop.listLibraryRoots(),
        window.studyRoomDesktop.listFavoriteTracks?.() ?? Promise.resolve([]), window.studyRoomDesktop.listPlaylists?.() ?? Promise.resolve([])
      ]);
      if (selectedPlaylist.value) await loadPlaylist(selectedPlaylist.value.id);
    } else { tracks.value = []; recentTracks.value = []; favoriteTracks.value = []; playlists.value = []; missingTracks.value = []; roots.value = []; }
  } catch (reason) { error.value = reason instanceof Error ? reason.message : "无法读取本地曲库"; }
  finally { loading.value = false; }
}

async function loadPlaylist(playlistId: string) { playlistItems.value = window.studyRoomDesktop?.listPlaylistItems ? await window.studyRoomDesktop.listPlaylistItems({ playlistId }) : []; }
async function selectSource(source: string) {
  activeSource.value = source;
  query.value = "";
  renamingPlaylist.value = false;
  if (source.startsWith("playlist:")) await loadPlaylist(source.slice(9));
  if (source === "radio") {
    await radio.load();
    await Promise.all(radio.stations.map(({ id }) => radio.refresh(id)));
  }
  if (source.startsWith("provider:")) await providers.loadStatuses();
}
function providerSourceTitle(source: string) {
  const id = source.slice(9);
  return id === "all" ? "聚合搜索" : id === "netease" ? "网易云音乐" : id === "qq" ? "QQ 音乐" : "酷狗音乐";
}
async function playRadio(station: RadioStation) {
  await playTrack(radioStationTrack(station));
}
function openProviderAccounts() {
  providerAccountsOpen.value = true;
  void providers.loadStatuses();
}
async function acceptProviderRisk() {
  try { await providers.acceptRisk(); shell.toast("实验风险确认已保存在本机", "success"); }
  catch (reason) { shell.toast(message(reason, "无法保存风险确认"), "error"); }
}
async function rotateProviderOrder() {
  const [first, ...rest] = providers.preferredOrder;
  if (!first) return;
  try { await providers.setOrder([...rest, first]); }
  catch (reason) { shell.toast(message(reason, "无法保存来源顺序"), "error"); }
}
async function loginProvider(providerId: ProviderId) {
  providers.invalidateIdentity();
  try { await window.studyRoomDesktop?.openProviderLogin({ providerId }); await providers.loadStatuses(); }
  catch (reason) { shell.toast(providerErrorText(reason), "error"); }
}
async function logoutProvider(providerId: ProviderId) {
  providers.invalidateIdentity();
  if(player.currentItem?.track.source.kind==='provider'&&player.currentItem.track.source.providerId===providerId)player.pause();
  try { await window.studyRoomDesktop?.logoutProvider({ providerId }); await providers.loadStatuses(); }
  catch (reason) { shell.toast(message(reason, "退出没有完成"), "error"); }
}
async function playProviderSource(track: Track, providerId: ProviderId) {
  const candidate = track.providerCandidates?.find((entry) => entry.providerId === providerId);
  if (!candidate?.isAvailable || candidate.rights !== "available") {
    shell.toast("当前账号无权使用这个来源", "error");
    return;
  }
  await playTrack({ ...track, artworkUrl:candidate.artworkUrl, source: { kind: "provider", providerId, trackId: candidate.trackId }, selectedProviderId: providerId });
}
async function createPlaylist(name: string) { if (!window.studyRoomDesktop?.createPlaylist) { shell.toast("播放列表仅在 Windows 客户端可用", "info"); return; } try { const created = await window.studyRoomDesktop.createPlaylist({ name }); playlists.value = await window.studyRoomDesktop.listPlaylists(); await selectSource(`playlist:${created.id}`); shell.toast("播放列表已创建", "success"); } catch (reason) { shell.toast(message(reason, "无法创建播放列表"), "error"); } }
function startRename() { if (!selectedPlaylist.value) return; renameValue.value = selectedPlaylist.value.name; renamingPlaylist.value = true; }
async function commitRename() { if (!selectedPlaylist.value || !renameValue.value || !window.studyRoomDesktop?.renamePlaylist) return; try { await window.studyRoomDesktop.renamePlaylist({ playlistId: selectedPlaylist.value.id, name: renameValue.value }); playlists.value = await window.studyRoomDesktop.listPlaylists(); renamingPlaylist.value = false; } catch (reason) { shell.toast(message(reason, "无法重命名播放列表"), "error"); } }
async function deletePlaylist() { const playlist = selectedPlaylist.value; if (!playlist || !window.studyRoomDesktop?.deletePlaylist) return; try { await window.studyRoomDesktop.deletePlaylist({ playlistId: playlist.id }); playlists.value = await window.studyRoomDesktop.listPlaylists(); await selectSource("library"); shell.toast("播放列表已删除", "success"); } catch (reason) { shell.toast(message(reason, "无法删除播放列表"), "error"); } }
async function toggleFavorite(track: Track) { if (!window.studyRoomDesktop?.setTrackFavorite) return; const favorite = !favoriteTrackIds.value.includes(track.id); try { await window.studyRoomDesktop.setTrackFavorite({ trackId: track.id, favorite }); favoriteTracks.value = await window.studyRoomDesktop.listFavoriteTracks(); } catch (reason) { shell.toast(message(reason, "收藏状态没有保存"), "error"); } }
async function addToPlaylist(track: Track, playlistId: string) { if (!window.studyRoomDesktop?.addPlaylistTrack) return; try { await window.studyRoomDesktop.addPlaylistTrack({ playlistId, trackId: track.id }); playlists.value = await window.studyRoomDesktop.listPlaylists(); shell.toast(`已将《${track.title}》加入播放列表`, "success"); } catch (reason) { shell.toast(message(reason, "无法加入播放列表"), "error"); } }
async function removeFromPlaylist(track: Track) { if (!selectedPlaylist.value || !window.studyRoomDesktop?.removePlaylistTrack) return; try { playlistItems.value = await window.studyRoomDesktop.removePlaylistTrack({ playlistId: selectedPlaylist.value.id, trackId: track.id }); playlists.value = await window.studyRoomDesktop.listPlaylists(); } catch (reason) { shell.toast(message(reason, "无法移出播放列表"), "error"); } }
async function toggleAmbient(sourceId: AmbientSourceId) { const existing = sound.settings.ambientTracks.find((track) => track.sourceId === sourceId); try { if (existing) sound.removeAmbient(existing.id); else await sound.addAmbient(sourceId); if (window.innerWidth < 1440) openContext(); } catch (reason) { const copy = reason instanceof Error && reason.message === "AMBIENT_TRACK_LIMIT" ? "最多同时开启 6 种环境声音，请先移除一条。" : message(reason, "环境声音没有启动，请稍后重试。"); shell.toast(copy, "error"); } }
function openContext() { contextOpen.value = true; }
async function closeStage() { stageOpen.value = false; await nextTick(); stageButton.value?.focus(); }
function closeContext() { contextOpen.value = false; }
function message(reason: unknown, fallback: string) { return reason instanceof Error ? reason.message : fallback; }
function importMessage(result: { imported: number; addedLocations: number; updated: number; failed: number; metadataWarnings: number; limitReached: boolean }) { return `曲库已更新：新增 ${result.imported}${result.addedLocations ? `，合并副本 ${result.addedLocations}` : ""}，更新 ${result.updated}${result.failed ? `，失败 ${result.failed}` : ""}${result.metadataWarnings ? `，${result.metadataWarnings} 首使用文件名信息` : ""}${result.limitReached ? "，已达到导入上限" : ""}`; }
async function importFiles() { if (!window.studyRoomDesktop || scanning.value) return; scanning.value = true; try { const result = await window.studyRoomDesktop.selectAndImportMusicFiles(); if (!result.canceled) { await loadLibrary(); shell.toast(importMessage(result), result.failed ? "info" : "success"); } } catch (reason) { error.value = message(reason, "文件导入没有完成"); } finally { scanning.value = false; } }
async function importDirectory() { if (!window.studyRoomDesktop || scanning.value) return; scanning.value = true; try { const selected = await window.studyRoomDesktop.selectMusicDirectory(); if (!selected.canceled && selected.directoryToken) { const result = await window.studyRoomDesktop.scanMusicDirectory({ directoryToken: selected.directoryToken }); await loadLibrary(); shell.toast(`${importMessage(result)}，失效 ${result.missing}`, result.failed ? "info" : "success"); } } catch (reason) { error.value = message(reason, "扫描没有完成"); } finally { scanning.value = false; } }
async function rescanRoot(rootId: string) { if (!window.studyRoomDesktop || scanning.value) return; scanning.value = true; try { const result = await window.studyRoomDesktop.rescanLibraryRoot({ rootId }); await loadLibrary(); shell.toast(`${importMessage(result)}，失效 ${result.missing}`, result.failed ? "info" : "success"); } catch (reason) { shell.toast(message(reason, "文件夹扫描没有完成"), "error"); } finally { scanning.value = false; } }
async function relocate(trackId: string) { if (!window.studyRoomDesktop || relocatingId.value) return; relocatingId.value = trackId; try { const result = await window.studyRoomDesktop.relocateMissingTrack({ trackId }); if (!result.canceled) { await loadLibrary(); shell.toast("音乐文件已重新定位", "success"); } } catch (reason) { shell.toast(message(reason, "无法重新定位音乐"), "error"); } finally { relocatingId.value = ""; } }
async function playTrack(track: Track) { const selectedIndex = activeTracks.value.findIndex(({ id }) => id === track.id); if (selectedIndex < 0) return; const startIndex = Math.min(selectedIndex, Math.max(0, activeTracks.value.length - 10_000)); const items: QueueItem[] = activeTracks.value.slice(startIndex, startIndex + 10_000).map((entry) => ({ id: `queue:${entry.id}`, track: entry.id === track.id ? track : entry, queuedAt: Date.now() })); try { await queue.replace(items); const selected = items.find((item) => item.track.id === track.id); if (selected) player.load(selected, 0, true); } catch (reason) { shell.toast(message(reason, "播放队列没有更新"), "error"); } }
async function playNext(track: Track) { try { await queue.insertNext({ id: `queue:${track.id}:${crypto.randomUUID()}`, track, queuedAt: Date.now() }, player.playback.currentItemId); shell.toast(`已将《${track.title}》加入下一首`, "success"); } catch (reason) { shell.toast(message(reason, "无法加入下一首"), "error"); } }
async function selectTemporaryFile(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    webTrack.value = temporaryWebTrack(file);
    activeSource.value = "web-file";
    await playTrack(webTrack.value);
  } catch (reason) {
    const code = reason instanceof Error ? reason.message : "";
    shell.toast(code === "WEB_AUDIO_FILE_SIZE_INVALID" ? "请选择 1GB 以内的音频文件。" : "无法识别这个音频文件。", "error");
  }
}

function handleWindowKeydown(event: KeyboardEvent) { if (event.key === "Escape" && contextOpen.value) closeContext(); }
onMounted(() => { window.addEventListener("keydown", handleWindowKeydown); void loadLibrary(); });
onBeforeUnmount(() => window.removeEventListener("keydown", handleWindowKeydown));
</script>

<style scoped>
.sound-page { position:relative; isolation:isolate; display:flex; flex-direction:column; height:100%; min-height:0; padding:24px var(--sr-page-gutter); overflow:hidden; background:var(--sr-color-canvas); color:var(--sr-color-text); box-sizing:border-box; }
.sound-page::before,.sound-page::after { position:absolute; inset:0; content:""; pointer-events:none; }
.sound-page::before { z-index:-2; background:var(--sound-background) center/cover; }
.sound-page::after { z-index:-1; background:linear-gradient(90deg,rgba(9,12,16,.66),rgba(15,18,23,.48)); }
.sound-page__header { flex:0 0 auto; display:flex; align-items:center; justify-content:space-between; gap:20px; padding-bottom:20px; }
.sound-page__header p { margin:0 0 8px; color:var(--sr-color-text-muted); font-size:11px; letter-spacing:.1em; }
.sound-page__header h1 { margin:0; font:600 30px/1.25 var(--sr-font-sans); letter-spacing:-.03em; }
.sound-page__header span { display:block; margin-top:8px; color:var(--sr-color-text-muted); font-size:13px; line-height:1.5; }
.sound-page__actions { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
.sound-page__actions button,.library-head__tools button,.playlist-rename button { min-height:44px; padding:10px 14px; border:1px solid var(--sr-color-line); border-radius:var(--sr-radius-control,12px); background:var(--sr-color-surface-raised); color:var(--sr-color-text); font-size:12px; font-weight:600; white-space:nowrap; cursor:pointer; }
.sound-page__actions .primary { border-color:transparent; background:var(--sr-color-accent); color:var(--sr-color-accent-ink); }
.sound-page__console-button { display:none; }
.sound-page__workspace { flex:1; min-height:0; display:grid; grid-template-columns:184px minmax(0,1fr) 296px; gap:20px; }
.sound-page__main { min-width:0; min-height:0; display:flex; flex-direction:column; overflow:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-gutter:stable; padding:20px; border:1px solid var(--sr-color-line); border-radius:var(--sr-radius-panel,20px); }
.library-head { flex-shrink:0; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:14px; margin-bottom:20px; }
.library-head h2 { margin:0; font-size:20px; font-weight:600; letter-spacing:-.02em; }
.library-head span { display:block; margin-top:6px; color:var(--sr-color-text-muted); font-size:11px; line-height:1.5; }
.library-head__tools { display:flex; flex-wrap:wrap; align-items:center; gap:8px; max-width:100%; }
.library-head__tools input,.playlist-rename input { min-width:0; width:min(230px,100%); min-height:44px; padding:10px 12px; border:1px solid var(--sr-color-line); border-radius:var(--sr-radius-control,12px); background:var(--sr-color-surface-raised); color:var(--sr-color-text); font-size:13px; }
.library-head__tools .danger { color:var(--sr-color-danger); }
.playlist-rename { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
.missing-tracks { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; padding:12px; border:1px solid #d2b58350; border-radius:12px; background:#49371955; }
.missing-tracks>div { display:grid; gap:6px; min-width:0; }.missing-tracks strong { font-size:13px; }.missing-tracks span { color:var(--sr-color-text-muted); font-size:12px; line-height:1.5; }
.missing-tracks button { flex:0 0 auto; min-height:44px; padding:8px; border:0; background:transparent; color:var(--sr-color-text); font-size:12px; cursor:pointer; }
.sound-page__floating-console { width:min(390px,100%); padding:24px; }
.sound-page__file-input { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
@media(max-width:1439px) { .sound-page__workspace { grid-template-columns:184px minmax(0,1fr); }.sound-page__context { display:none; }.sound-page__console-button { display:block; } }
@media(max-width:1099px) { .sound-page { padding:18px 24px; }.sound-page__header span { display:none; }.sound-page__workspace { grid-template-columns:1fr; grid-template-rows:auto minmax(0,1fr); gap:12px; }.sound-page__main { padding:16px; } }
@media(max-width:680px) { .sound-page { padding:16px 12px; }.sound-page__header { flex-wrap:wrap; gap:12px; padding-bottom:14px; }.sound-page__header h1 { font-size:26px; }.sound-page__header p { font-size:10px; }.sound-page__actions { width:100%; justify-content:flex-start; gap:6px; }.sound-page__actions button { flex:1; padding:8px 10px; }.library-head { align-items:stretch; flex-direction:column; margin-bottom:14px; gap:12px; }.library-head__tools input { width:100%; }.sound-page__main { padding:14px 12px; } }
@media(prefers-reduced-motion:reduce) { .drawer-enter-active,.drawer-leave-active,.drawer-enter-active :deep(.context-panel),.drawer-leave-active :deep(.context-panel) { transition:none; } }
</style>
