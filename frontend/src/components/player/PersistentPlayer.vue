<template>
  <footer ref="root" class="player" :class="{ 'sr-glass': !inline, 'player--expanded': expanded, 'player--avoid-panel': avoidRightPanel, 'player--inline': inline }" aria-label="播放器">
    <button class="player__identity" type="button" :aria-expanded="expanded" :aria-label="expanded ? '收起播放器' : inline ? '打开音乐' : '展开播放器'" @click="toggleExpanded">
      <span class="player__cover" aria-hidden="true"><TrackArtwork :track="currentItem?.track" resolve /></span>
      <span class="player__copy"><strong>{{ currentItem?.track.title || "还没有播放内容" }}</strong><small :class="{ 'player__status-copy': hasFailure || player.buffering }" :role="!expanded && (hasFailure || player.buffering) ? 'status' : undefined">{{ hasFailure ? '音源无法播放 · 点击查看原因' : player.buffering ? '正在缓冲 · 可点击暂停' : currentItem ? currentItem.track.artist : emptyDescription }}</small></span>
    </button>

    <div class="player__transport" aria-label="播放控制">
      <button type="button" aria-label="上一首" :disabled="!currentItem" @click="player.previous"><TransportGlyph kind="previous" /></button>
      <button class="player__play" type="button" :aria-label="playIntent ? '暂停' : '播放'" :disabled="!currentItem || (!playIntent && retryDisabled)" @click="player.toggle"><TransportGlyph :kind="playIntent ? 'pause' : 'play'" /></button>
      <button type="button" aria-label="下一首" :disabled="!currentItem" @click="player.next()"><TransportGlyph kind="next" /></button>
    </div>

    <div v-if="inline" class="player__quick-volumes">
      <VolumeControl label="音乐" :value="sound.settings.musicBus.volume" :muted="sound.settings.musicBus.muted" @change="sound.setMusicBus($event, false)" @mute="sound.setMusicBus(sound.settings.musicBus.volume, !sound.settings.musicBus.muted)" />
      <VolumeControl label="环境音" :value="sound.settings.ambientBus.volume" :muted="sound.settings.ambientBus.muted" @change="sound.setAmbientBus($event, false)" @mute="sound.setAmbientBus(sound.settings.ambientBus.volume, !sound.settings.ambientBus.muted)" />
    </div>
    <component :is="inline ? OverlayDialog : 'div'" v-bind="inline ? {} : { class: 'player__panel-host' }" :open="expanded" label="音乐与环境音" @close="closeExpanded()">
    <Transition v-bind="inline ? { css: false } : panelMotion">
      <section v-if="inline || expanded" class="player__panel sr-glass sr-glass--floating" :class="{ 'player__panel--inline': inline }" aria-label="播放器详情">
        <header v-if="inline" class="player__panel-head"><strong>音乐与环境音</strong><button type="button" aria-label="关闭声音面板" @click="closeExpanded()">关闭</button></header>
        <div v-if="inline" class="player__tabs" role="tablist" aria-label="声音控制分类" @keydown="moveTab">
          <button role="tab" type="button" :aria-selected="activeTab === 'music'" :tabindex="activeTab === 'music' ? 0 : -1" @click="activeTab = 'music'">音乐与队列</button>
          <button role="tab" type="button" :aria-selected="activeTab === 'ambient'" :tabindex="activeTab === 'ambient' ? 0 : -1" @click="activeTab = 'ambient'">白噪音与环境音</button>
        </div>
        <div v-show="!inline || activeTab === 'music'" class="player__detail-content">
        <div v-if="inline" class="player__detail-now">
          <span class="player__cover"><TrackArtwork :track="currentItem?.track" resolve /></span>
          <div class="player__copy"><strong>{{ currentItem?.track.title || '还没有播放内容' }}</strong><small>{{ currentItem?.track.artist || '从声音页选择音乐或歌单' }}</small></div>
          <div class="player__transport">
            <button type="button" aria-label="上一首" :disabled="!currentItem" @click="player.previous"><TransportGlyph kind="previous" /></button>
            <button class="player__play" type="button" :aria-label="playIntent ? '暂停' : '播放'" :disabled="!currentItem || (!playIntent && retryDisabled)" @click="player.toggle"><TransportGlyph :kind="playIntent ? 'pause' : 'play'" /></button>
            <button type="button" aria-label="下一首" :disabled="!currentItem" @click="player.next()"><TransportGlyph kind="next" /></button>
          </div>
        </div>
        <div v-if="hasFailure" class="player__error">
          <div role="status"><strong>{{ failure.title }}</strong><p>{{ failure.reason }}</p><small v-if="cooldownSeconds">客户端将在 {{ cooldownSeconds }} 秒后允许手动重试。</small><small v-if="loginHint">{{ loginHint }}</small></div>
          <button v-if="failure.action === 'login'" type="button" :disabled="loginPending" @click="relogin">{{ loginPending ? '等待登录' : '重新登录' }}</button>
          <button v-else-if="failure.action !== 'none'" type="button" :disabled="!currentItem || retryDisabled" @click="player.retry">{{ cooldownSeconds ? '等待冷却' : '重试' }}</button>
        </div>
        <p v-else-if="player.buffering" class="player__buffering" role="status">正在缓冲，进度已保留。可随时暂停。</p>

        <label class="player__progress">
          <span>{{ formatTime(player.playback.positionMs) }}</span>
          <input type="range" min="0" :max="Math.max(1, player.playback.durationMs)" :value="player.playback.positionMs" :disabled="!currentItem" aria-label="播放进度" @input="seek" />
          <span>{{ formatTime(player.playback.durationMs) }}</span>
        </label>

        <div class="player__settings">
          <button type="button" :class="{ active: player.playback.shuffle }" :aria-pressed="player.playback.shuffle" @click="player.setShuffle(!player.playback.shuffle)">随机</button>
          <button type="button" :aria-label="`循环模式：${repeatLabel}`" @click="cycleRepeat">{{ repeatLabel }}</button>
          <VolumeControl class="player__volume" label="音乐" :value="sound.settings.musicBus.volume" :muted="sound.settings.musicBus.muted" @change="sound.setMusicBus($event, false)" @mute="sound.setMusicBus(sound.settings.musicBus.volume, !sound.settings.musicBus.muted)" />
          <span class="player__platform">{{ platformLabel }}</span>
        </div>

        <div class="player__queue-head"><strong>播放队列 · {{ queue.items.length.toLocaleString() }}</strong><button type="button" :disabled="!queue.items.length" @click="clearQueue">清空</button></div>
        <PlayerQueueList v-if="queue.items.length" :items="queue.items" :current-item-id="player.playback.currentItemId" @select="selectQueueItem" @remove="removeQueueItem" />
        <p v-else class="player__empty">还没有播放队列，请在声音页选择音乐或歌单。</p>
        <button v-if="inline" class="player__manage" type="button" @click="manageMusic">在声音页管理音乐</button>
        </div>
        <template v-if="inline && activeTab === 'ambient'">
          <section class="player__ambient-add" aria-label="添加环境音"><strong>白噪音与环境音</strong><div><button v-for="entry in AMBIENT_CATALOG" :key="entry.id" type="button" :disabled="ambientPending || sound.settings.ambientTracks.some(track => track.sourceId === entry.id)" @click="addAmbient(entry.id)">{{ entry.name }}</button></div><p v-if="ambientError" role="alert">{{ ambientError }}</p></section>
          <AmbientMixerPanel />
        </template>
      </section>
    </Transition>
    </component>
  </footer>
</template>

<script setup lang="ts">
import type { AmbientSourceId, QueueItem, RepeatMode } from "@studyroom/contracts";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useCapabilitiesStore } from "../../stores/capabilities";
import { usePlayerStore } from "../../stores/player";
import { useQueueStore } from "../../stores/queue";
import TrackArtwork from "../sound/TrackArtwork.vue";
import PlayerQueueList from "./PlayerQueueList.vue";
import TransportGlyph from './TransportGlyph.vue';
import { playbackFailure } from '../../audio/state/playbackFailure';
import { useProvidersStore } from '../../stores/providers';

import VolumeControl from '../sound/VolumeControl.vue';
import OverlayDialog from '../controls/OverlayDialog.vue';
import AmbientMixerPanel from '../../pages/sound/AmbientMixerPanel.vue';
import { AMBIENT_CATALOG } from '../../audio/ambient/ambientCatalog';
import { useSoundStore } from '../../stores/sound';
import { useRouter } from 'vue-router';
import { useMotionTransition } from '../../motion/transitions';
const panelMotion = useMotionTransition('panel');
const props = defineProps<{ avoidRightPanel?: boolean; inline?: boolean }>();
const sound = useSoundStore(), router = useRouter();
const ambientPending = ref(false), ambientError = ref('');
async function addAmbient(sourceId: AmbientSourceId) {
  if (ambientPending.value) return;
  ambientPending.value = true; ambientError.value = '';
  try { await sound.addAmbient(sourceId); }
  catch (error) { ambientError.value = error instanceof Error && error.message === 'AMBIENT_TRACK_LIMIT' ? '最多同时添加 6 种声音，请先移除一条。' : '环境音未能启动，请稍后重试。'; }
  finally { ambientPending.value = false; }
}
function manageMusic() { closeExpanded(false); void router.push({ name: 'sound' }); }

const capabilitiesStore = useCapabilitiesStore();
const player = usePlayerStore();
const queue = useQueueStore();
const currentItem = computed(() => player.currentItem);
const expanded = ref(false);
const activeTab = ref<'music' | 'ambient'>('music');
function moveTab(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  activeTab.value = event.key === 'Home' ? 'music' : event.key === 'End' ? 'ambient' : activeTab.value === 'music' ? 'ambient' : 'music';
  const list = event.currentTarget as HTMLElement;
  void nextTick(() => list.querySelector<HTMLButtonElement>('[aria-selected=true]')?.focus());
}
const root = ref<HTMLElement>();
const localLibraryAvailable = computed(() => capabilitiesStore.capabilities.localLibrary);
const platformLabel = computed(() => localLibraryAvailable.value ? "本地模式" : "网页模式");
const emptyDescription = computed(() => localLibraryAvailable.value ? "打开声音页选择音乐" : "可使用内置环境音");
const repeatLabel = computed(() => ({ off: "顺序", all: "列表循环", one: "单曲循环" })[player.playback.repeatMode]);
const hasFailure = computed(() => player.playback.status === 'error');
const failure = computed(() => playbackFailure(player.playback.errorCode));
const playIntent = computed(() => player.wantsPlayback || player.playback.status === 'playing');
const clockNow = ref(Date.now());
let cooldownTimer: ReturnType<typeof setInterval> | undefined;
const cooldownSeconds = computed(() => Math.max(0, Math.ceil((player.retryNotBefore - clockNow.value) / 1000)));
const retryDisabled = computed(() => cooldownSeconds.value > 0 || (hasFailure.value && ['login', 'none'].includes(failure.value.action)));
const loginPending = ref(false), loginHint = ref('');
watch(() => player.retryNotBefore, (until) => {
  if (cooldownTimer) clearInterval(cooldownTimer);
  cooldownTimer = undefined; clockNow.value = Date.now();
  if (until > clockNow.value) cooldownTimer = setInterval(() => {
    clockNow.value = Date.now();
    if (clockNow.value >= until) { clearInterval(cooldownTimer); cooldownTimer = undefined; }
  }, 1000);
}, { immediate: true });
watch(() => [player.playback.currentItemId, player.playback.errorCode], () => { loginHint.value = ''; });
async function relogin() {
  const source = currentItem.value?.track.source, itemId = currentItem.value?.id, operation = player.loadOperation;
  if (source?.kind !== 'provider' || !window.studyRoomDesktop || loginPending.value) return;
  loginPending.value = true; loginHint.value = '';
  try {
    const providers = useProvidersStore(); providers.invalidateIdentity();
    await window.studyRoomDesktop.openProviderLogin({ providerId: source.providerId });
    await providers.loadStatuses();
    if (itemId === currentItem.value?.id && operation === player.loadOperation && providers.statuses.some(s => s.providerId === source.providerId && s.state === 'signed-in')) player.pause();
  } catch {
    if (itemId === currentItem.value?.id && operation === player.loadOperation) loginHint.value = '登录未完成，请在官方窗口确认，或稍后重新登录。';
  } finally { loginPending.value = false; }
}

function formatTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function seek(event: Event) { player.seek(Number((event.currentTarget as HTMLInputElement).value)); }
function cycleRepeat() {
  const sequence: RepeatMode[] = ["off", "all", "one"];
  const current = sequence.indexOf(player.playback.repeatMode);
  player.setRepeat(sequence[(current + 1) % sequence.length]);
}
function toggleExpanded() { expanded.value = !expanded.value; }
function closeExpanded(restoreFocus = true) {
  expanded.value = false;
  if (restoreFocus) void nextTick(() => root.value?.querySelector<HTMLButtonElement>(".player__identity")?.focus());
}
function selectQueueItem(item: QueueItem) { player.load(item, 0, true); }

async function removeQueueItem(itemId: string) {
  const removedIndex = queue.items.findIndex((item) => item.id === itemId);
  const removingCurrent = itemId === player.playback.currentItemId;
  const resume = player.playback.status === "playing";
  await queue.remove(itemId);
  if (!removingCurrent) return;
  const replacement = queue.items[Math.min(Math.max(0, removedIndex), queue.items.length - 1)];
  if (replacement) player.load(replacement, 0, resume);
  else player.clear();
}

async function clearQueue() {
  await queue.clear();
  player.clear();
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.inline && event.key === "Escape" && expanded.value) closeExpanded();
}
function handlePointerDown(event: PointerEvent) {
  if (!props.inline && expanded.value && root.value && !event.composedPath().includes(root.value)) closeExpanded(false);
}

onMounted(() => {
  document.addEventListener("keydown", handleKeydown);
  document.addEventListener("pointerdown", handlePointerDown);
});
onBeforeUnmount(() => {
  if (cooldownTimer) clearInterval(cooldownTimer);
  document.removeEventListener("keydown", handleKeydown);
  document.removeEventListener("pointerdown", handlePointerDown);
});
</script>

<style scoped>
.player { position: fixed; z-index: var(--sr-layer-player); right: var(--sr-page-gutter); bottom: 26px; width: var(--sr-floating-player-width); display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 9px; border:1px solid var(--sr-color-line); border-radius: var(--sr-radius-panel,20px); transition: opacity var(--sr-motion-medium) ease, transform var(--sr-motion-medium) ease, background var(--sr-motion-medium) ease; }
.player--expanded { width: min(460px, calc(100vw - 48px)); }
.player__identity { min-width: 0; display: flex; align-items: center; gap: 10px; padding: 0; border: 0; background: transparent; color: #fff; text-align: left; cursor: pointer; }
.player__cover { flex: 0 0 auto; width: 42px; height: 42px; display: grid; place-items: center; border: 1px solid rgba(255, 255, 255, .16); border-radius: 13px; background: var(--sr-color-surface-raised); color: rgba(255, 255, 255, .7); }
.player__copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.player__copy strong, .player__copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.player__copy strong { font-size: 12px; }
.player__copy small { color: rgba(255, 255, 255, .58); font-size: 10px; }
.player__transport { display: flex; align-items: center; gap: 2px; }
.player__transport button, .player__panel button { border: 0; background: transparent; color: rgba(255, 255, 255, .78); cursor: pointer; }
.player__transport button { width: 30px; height: 30px; border-radius: 50%; font-size: 17px; }
.player__transport button:hover { background: var(--sr-color-surface-raised); color: #fff; }
.player__transport button:disabled, .player__panel button:disabled { opacity: .38; cursor: not-allowed; }
.player__transport .player__play { width: 36px; height: 36px; background: rgba(255, 255, 255, .16); font-size: 11px; }
.player__panel { grid-column: 1 / -1; display: grid; gap: 10px; padding: 11px 5px 3px; border-radius:var(--sr-radius-panel); }
.player__error { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 10px; border: 1px solid rgba(216, 112, 93, .36); border-radius: 10px; background: rgba(116, 42, 31, .28); color: #ffd5cd; font-size: 10px; }
.player__error button { flex: 0 0 auto; text-decoration: underline; }
.player__error > div { min-width:0; overflow-wrap:anywhere; }
.player__error p { margin:4px 0; }
.player__error small { display:block; }
.player__buffering { margin:0; font-size:12px; color:var(--sr-color-text-muted); }
.player__progress { display: grid; grid-template-columns: 32px 1fr 32px; align-items: center; gap: 6px; color: rgba(255, 255, 255, .52); font-size: 9px; text-align: center; font-variant-numeric: tabular-nums; }
.player__progress input, .player__volume input { width: 100%; height: 3px; accent-color: #f4f4f0; }
.player__settings { display: grid; grid-template-columns: auto auto minmax(110px, 1fr) auto; align-items: center; gap: 8px; color: rgba(255, 255, 255, .56); font-size: 9px; }
.player__settings > button { min-height: 26px; padding: 0 8px; border-radius: 99px; background: var(--sr-color-surface-raised); font-size: 9px; }
.player__settings > button.active { background:var(--sr-color-selected); color: #fff; }
.player__volume { display: grid; grid-template-columns: 28px 1fr; align-items: center; gap: 6px; }
.player__platform { text-align: right; }
.player__queue-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; color: rgba(255, 255, 255, .72); font-size: 10px; }
.player__queue-head button { font-size: 9px; }
.player__empty { min-height: 70px; display: grid; place-items: center; margin: 0; padding: 14px; border-block: 1px solid var(--sr-color-surface-raised); color: rgba(255, 255, 255, .46); font-size: 10px; text-align: center; }
.player-panel-enter-active, .player-panel-leave-active { transition: opacity 180ms ease, transform 220ms ease; }
.player-panel-enter-from, .player-panel-leave-to { opacity: 0; transform: translateY(-5px); }
.player--avoid-panel { right: calc(var(--sr-page-gutter) + min(30vw, 420px)); }

@media (max-width: 1365px), (max-height: 760px) {
  .player { right: 24px; bottom: 10px; width: 320px; padding: 6px; border-radius: 16px; }
  .player--avoid-panel { right: 448px; }
  .player--expanded { width: min(420px, calc(100vw - 48px)); }
  .player--expanded.player--avoid-panel { right: 448px; }
  .player__cover { width: 34px; height: 34px; border-radius: 10px; }
  .player__copy small { display: none; }
  .player__transport button { width: 27px; height: 27px; }
  .player__transport .player__play { width: 32px; height: 32px; }
}
.player__transport button,.player__transport .player__play{display:grid;place-items:center;width:44px;height:44px;min-width:44px}.player__transport .player__play{background:var(--sr-color-accent);color:var(--sr-color-accent-ink)}.player__transport button:focus-visible,.player__identity:focus-visible,.player__panel button:focus-visible{outline:2px solid var(--sr-color-focus,#b6d7bd);outline-offset:2px}.player__identity{min-height:44px}.player__copy strong{font-size:13px}.player__copy small{font-size:11px;color:var(--sr-color-text-muted)}.player__panel{gap:14px;padding:16px}.player__progress{font-size:11px;grid-template-columns:40px 1fr 40px}.player__progress input,.player__volume input{min-height:24px}.player__settings{font-size:11px;gap:8px;grid-template-columns:auto auto minmax(100px,1fr)}.player__settings>button{min-height:44px;padding:8px 12px;font-size:12px;border-radius:12px}.player__platform{grid-column:1/-1;font-size:11px}.player__queue-head{font-size:12px}.player__queue-head button{min-height:44px;font-size:12px}.player__empty,.player__error{font-size:12px;line-height:1.6}.player__error button{min-height:44px}.player-panel-enter-active,.player-panel-leave-active{transition:opacity 160ms ease,transform 180ms var(--sr-ease-out)}
@media(hover:none){.player__transport button:hover{background:transparent}.player__transport .player__play:hover{background:var(--sr-color-accent)}}
@media(max-width:420px){.player__transport{gap:0}.player__copy strong{font-size:12px}.player__panel{padding:12px}.player__settings{grid-template-columns:auto auto}.player__volume{grid-column:1/-1}.player__platform{text-align:left}}
.player__copy small.player__status-copy { display:block; color:#ffd5cd; }

.player__volume{display:flex;grid-column:1/-1}.player__panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.player__panel-head button{min-height:44px;padding:8px 12px}
.player--inline{position:relative!important;inset:auto!important;transform:none!important;width:min(430px,100%)!important;border:0;box-shadow:none;background:transparent!important;backdrop-filter:none;padding:0!important;border-radius:0;gap:4px 12px}
.player--inline .player__copy small{display:block}.player--inline .player__cover{width:36px;height:36px}.player__quick-volumes{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:12px}
.player__panel--inline{width:min(560px,100%);max-height:calc(100dvh - 32px);overflow:auto;padding:20px;gap:16px;background:var(--sr-color-surface-solid,#1b2521)}
.player__ambient-add{display:grid;gap:10px;border-top:1px solid var(--sr-color-line);padding-top:16px}.player__ambient-add>div{display:flex;flex-wrap:wrap;gap:6px}.player__ambient-add button,.player__manage{min-height:44px;padding:8px 12px;border-radius:12px!important;background:var(--sr-color-surface-raised)!important}.player__ambient-add p{margin:0;font-size:12px;color:#ffd5cd}.player__ambient-add strong{font-size:14px}
@media(max-width:480px){.player__quick-volumes{grid-template-columns:1fr;gap:0}.player__panel--inline{padding:14px}}
.player__panel-host{display:contents}

.player__detail-content{display:grid;gap:14px;min-width:0}.player__detail-content[style*="display: none"]{display:none}
.player__tabs{display:flex;gap:6px;background:var(--sr-color-surface-raised);padding:4px;border-radius:14px}.player__tabs button{flex:1;padding:10px 12px;min-height:44px;font-size:13px;border-radius:10px}.player__tabs [aria-selected=true]{background:var(--sr-color-selected);color:var(--sr-color-text)}
.player__detail-now{display:flex;align-items:center;gap:12px;min-width:0}.player__detail-now .player__copy{flex:1}.player__detail-now .player__cover{width:44px;height:44px}.player__panel--inline .player__copy strong{font-size:14px}.player__panel--inline .player__copy small{display:block;font-size:12px}
.player__panel--inline .player__platform{display:none}.player__panel--inline .player__queue-head{font-size:13px}.player__panel--inline .player__settings{font-size:12px}.player__panel--inline .player__progress{font-size:12px}
.player--inline{display:grid!important}
@media(max-width:420px){.player__detail-now{flex-wrap:wrap}.player__detail-now .player__transport{width:100%;justify-content:center}}
</style>
