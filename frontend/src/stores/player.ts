import type { FallbackReason, PlaybackState, QueueItem, RepeatMode } from "@studyroom/contracts";
import { defineStore } from "pinia";
import { AudioEngine } from "../audio/core/audioEngine";
import { nextQueueIndex } from "../audio/core/queue";
import { INITIAL_PLAYBACK_STATE, transitionPlayback } from "../audio/state/playbackMachine";
import { useQueueStore } from "./queue";
import { useShellStore } from "./shell";
import { resolveRadioPlaybackUrl } from "../services/radio";
import { RADIO_RECONNECT_DELAYS } from "./radio";
import {useProvidersStore} from './providers';
import { normalizePlaybackError, playbackFailure } from '../audio/state/playbackFailure';

const SETTINGS_KEY = "studyroom-playback-settings-v2";
let engine: AudioEngine | undefined;
let removeMediaListener: (() => void) | undefined;
let removeSourceSwitchListener: (() => void) | undefined;
let removeProviderStatusListener:(()=>void)|undefined;
let playbackSession: { id: string; trackId: string; started: boolean } | undefined;
let radioReconnectTimer: ReturnType<typeof setTimeout> | undefined;

const FALLBACK_REASON_LABELS: Record<FallbackReason, string> = {
  timeout: "请求超时",
  "temporary-network": "临时网络错误",
  "rate-limited": "平台限流",
  "circuit-open": "平台暂时熔断",
  "address-refresh-failed": "临时地址刷新失败"
};

function savedState(): PlaybackState {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    const savedVolume = Number(saved.volume);
    return {
      ...INITIAL_PLAYBACK_STATE,
      status: "idle",
      currentItemId: saved.currentItemId,
      positionMs: Number(saved.positionMs) || 0,
      volume: Number.isFinite(savedVolume) ? Math.min(1, Math.max(0, savedVolume)) : INITIAL_PLAYBACK_STATE.volume,
      muted: Boolean(saved.muted),
      shuffle: Boolean(saved.shuffle),
      repeatMode: ["off", "all", "one"].includes(saved.repeatMode) ? saved.repeatMode : "off"
    };
  } catch {
    return { ...INITIAL_PLAYBACK_STATE };
  }
}

export const usePlayerStore = defineStore("player", {
  state: () => ({
    playback: savedState(),
    initialized: false,
    visited: new Set<string>(),
    preparedQueueRevision: -1,
    preparedForItemId: undefined as string | undefined,
    loadOperation: 0,
    wantsPlayback: false,
    buffering: false,
    retryNotBefore: 0,
    loadedItemId: undefined as string | undefined,
    triedProviders: new Set<string>(),
    activeProviderId: undefined as string | undefined,
    radioReconnectAttempt: 0
  }),
  getters: {
    currentItem(state): QueueItem | undefined {
      return useQueueStore().items.find((item) => item.id === state.playback.currentItemId);
    }
  },
  actions: {
    initialize() {
      if (this.initialized) return;
      engine = new AudioEngine({
        ready: (durationMs) => {
          this.playback = transitionPlayback(this.playback, { type: "READY", durationMs });
          if (this.currentItem?.track.source.kind === "radio") {
            this.radioReconnectAttempt = 0;
            if (radioReconnectTimer) clearTimeout(radioReconnectTimer);
            radioReconnectTimer = undefined;
          }
        },
        time: (positionMs, durationMs) => {
          this.playback = transitionPlayback(this.playback, { type: "TIME", positionMs, durationMs });
          this.prepareNextCandidate();
          this.persistSettings();
        },
        ended: () => void this.handleEnded(),
        error: (code) => { void this.handlePlaybackError(code); },
        buffering: (active) => { this.buffering = active && this.wantsPlayback; },
        transitioned: (item, durationMs) => void this.handleCrossfadeTransition(item, durationMs)
      });
      engine.setVolume(this.playback.volume);
      engine.setMuted(this.playback.muted);
      const restored = this.currentItem;
      if (restored?.track.source.kind === 'provider') {
        // Restored platform queues stay paused. Resolve a fresh, authorized URL only on play.
        this.playback = transitionPlayback(this.playback, { type: 'LOAD', itemId: restored.id, positionMs: this.playback.positionMs, durationMs: restored.track.durationMs });
        this.playback = transitionPlayback(this.playback, { type: 'PAUSE' });
      } else if (restored) void this.load(restored, this.playback.positionMs, false);
      removeMediaListener = window.studyRoomDesktop?.onMediaCommand((command) => {
        if (window.moyuStartupOverlay?.active) return;
        if (command === "play-pause") void this.toggle();
        if (command === "next") void this.next();
        if (command === "previous") void this.previous();
      });
      removeSourceSwitchListener = window.studyRoomDesktop?.onSourceSwitch((event) => {
        useShellStore().toast(`播放源已从 ${event.change.fromProviderId} 切换到 ${event.change.toProviderId}：${FALLBACK_REASON_LABELS[event.change.reason]}`, "info");
      });
      removeProviderStatusListener=window.studyRoomDesktop?.onProviderStatusChanged?.(({status})=>{
        useProvidersStore().acceptStatus(status);
        if(status.state==='expired'&&this.currentItem?.track.source.kind==='provider'&&this.currentItem.track.source.providerId===status.providerId){
          this.failPlayback(status.errorCode === 'PROVIDER_APP_LOGIN_REQUIRED' ? status.errorCode : 'PROVIDER_SESSION_EXPIRED');
        }
        if (status.state === 'signed-in' && this.currentItem?.track.source.kind === 'provider' && this.currentItem.track.source.providerId === status.providerId
          && this.playback.status === 'error' && playbackFailure(this.playback.errorCode).action === 'login') this.pause();
      });
      this.initialized = true;
    },
    applicationIdentityChanged(authenticated: boolean) {
      if (this.currentItem?.track.source.kind !== 'provider') return;
      this.loadedItemId = undefined;
      if (authenticated) this.pause();
      else this.failPlayback('PROVIDER_APP_LOGIN_REQUIRED');
    },
    dispose() {
      this.loadOperation += 1;
      this.wantsPlayback = false;
      this.loadedItemId = undefined;
      playbackSession = undefined;
      removeMediaListener?.();
      removeMediaListener = undefined;
      removeSourceSwitchListener?.();
      removeSourceSwitchListener = undefined;
      removeProviderStatusListener?.();removeProviderStatusListener=undefined;
      void engine?.destroy();
      engine = undefined;
      if (radioReconnectTimer) clearTimeout(radioReconnectTimer);
      radioReconnectTimer = undefined;
      this.initialized = false;
    },
    async load(item: QueueItem, positionMs = 0, autoplay = false, fallbackFrom?: string, radioRetry = false) {
      if (this.currentItem?.track.source.kind === 'provider' && item.track.source.kind === 'provider'
        && this.currentItem.track.source.providerId === item.track.source.providerId && this.retryNotBefore > Date.now()) return;
      const operation = ++this.loadOperation;
      this.wantsPlayback = autoplay;
      this.buffering = false;
      this.retryNotBefore = 0;
      this.loadedItemId = undefined;
      engine?.pause();
      if (!radioRetry) {
        if (radioReconnectTimer) clearTimeout(radioReconnectTimer);
        radioReconnectTimer = undefined;
        this.radioReconnectAttempt = 0;
      }
      playbackSession = { id: crypto.randomUUID(), trackId: item.track.id, started: false };
      this.triedProviders = new Set(fallbackFrom ? [fallbackFrom] : []);
      if (item.track.source.kind === "provider") {
        this.triedProviders.add(item.track.source.providerId);
        this.activeProviderId = item.track.source.providerId;
      } else this.activeProviderId = undefined;
      this.playback = transitionPlayback(this.playback, { type: "LOAD", itemId: item.id, positionMs, durationMs: item.track.durationMs });
      if (item.track.source.kind === 'provider') {
        const providerId = item.track.source.providerId;
        const status = useProvidersStore().statuses.find(s => s.providerId === providerId);
        if (status?.retryAt && status.retryAt > Date.now()) { this.failPlayback(status.errorCode || 'PROVIDER_RATE_LIMITED'); return; }
      }
      try {
        const runtimeItem = await this.runtimeItem(item, playbackSession.id, fallbackFrom);
        if (operation !== this.loadOperation) return;
        engine?.load(runtimeItem, positionMs);
        if (operation !== this.loadOperation) return;
        this.loadedItemId = engine ? item.id : undefined;
        if (autoplay) await this.play();
      } catch (error) {
        if (operation !== this.loadOperation) return;
        const code = normalizePlaybackError(error);
        if (item.track.source.kind === "radio" && this.scheduleRadioReconnect(item, code)) return;
        this.failPlayback(code);
      }
      if (operation !== this.loadOperation) return;
      this.prepareNextCandidate(true);
      this.persistSettings();
    },
    async play() {
      const item = this.currentItem;
      if (!item || !engine) return;
      if (this.playback.status === 'error') {
        const failure = playbackFailure(this.playback.errorCode);
        if (failure.action === 'none' || failure.action === 'login') return;
      }
      if (this.loadedItemId !== item.id || this.playback.status === "error") {
        await this.load(item, this.playback.positionMs, true);
        return;
      }
      this.wantsPlayback = true;
      const operation = this.loadOperation;
      const session = playbackSession;
      try {
        await engine.play();
        if (operation !== this.loadOperation || !this.wantsPlayback || session !== playbackSession) return;
        this.playback = transitionPlayback(this.playback, { type: "PLAY" });
        if (playbackSession && !playbackSession.started) {
          playbackSession.started = true;
          void window.studyRoomDesktop?.recordPlaybackEvent?.({
            sessionId: playbackSession.id,
            trackId: playbackSession.trackId,
            state: "started",
            playedAt: Date.now()
          }).catch(() => undefined);
        }
      } catch (error) {
        if (operation !== this.loadOperation || !this.wantsPlayback) return;
        const code = normalizePlaybackError(error);
        this.failPlayback(code === 'SOURCE_NOT_PLAYABLE' ? 'PLAYBACK_REJECTED' : code);
      }
    },
    pause() {
      this.loadOperation += 1;
      this.wantsPlayback = false;
      this.buffering = false;
      if (radioReconnectTimer) clearTimeout(radioReconnectTimer);
      radioReconnectTimer = undefined;
      this.radioReconnectAttempt = 0;
      engine?.pause();
      this.playback = transitionPlayback(this.playback, { type: "PAUSE" });
      this.persistSettings();
    },
    async toggle() { if (this.wantsPlayback || this.playback.status === "playing") this.pause(); else await this.play(); },
    retry() { return this.play(); },
    failPlayback(error: unknown) {
      const code = normalizePlaybackError(error);
      this.pause();
      this.loadedItemId = undefined;
      if (playbackFailure(code).action === 'wait') {
        const source = this.currentItem?.track.source;
        const status = source?.kind === 'provider' ? useProvidersStore().statuses.find(s => s.providerId === source.providerId) : undefined;
        this.retryNotBefore = Math.max(status?.retryAt || 0, this.retryNotBefore > Date.now() ? this.retryNotBefore : Date.now() + 60_000);
      }
      this.playback = transitionPlayback(this.playback, { type: 'FAIL', code });
    },
    clear() {
      this.loadOperation += 1;
      this.wantsPlayback = false;
      this.loadedItemId = undefined;
      engine?.clear();
      this.playback = transitionPlayback(this.playback, { type: "CLEAR" });
      this.visited.clear();
      this.preparedQueueRevision = -1;
      this.preparedForItemId = undefined;
      playbackSession = undefined;
      this.activeProviderId = undefined;
      if (radioReconnectTimer) clearTimeout(radioReconnectTimer);
      radioReconnectTimer = undefined;
      this.radioReconnectAttempt = 0;
      this.persistSettings();
    },
    seek(positionMs: number) { engine?.seek(positionMs); this.playback = transitionPlayback(this.playback, { type: "SEEK", positionMs }); this.persistSettings(); },
    setVolume(volume: number) { engine?.setVolume(volume); this.playback = transitionPlayback(this.playback, { type: "VOLUME", volume }); this.persistSettings(); },
    setRuntimeMusicDuck(factor: number) { engine?.setDuckingFactor(factor); },
    setMuted(muted: boolean) {
      this.playback = transitionPlayback(this.playback, { type: "MUTE", muted });
      engine?.setMuted(this.playback.muted);
      this.persistSettings();
    },
    toggleMute() { this.playback = transitionPlayback(this.playback, { type: "MUTE" }); engine?.setMuted(this.playback.muted); this.persistSettings(); },
    setShuffle(enabled: boolean) {
      this.playback = transitionPlayback(this.playback, { type: "SHUFFLE", enabled });
      this.prepareNextCandidate(true);
      this.persistSettings();
    },
    setRepeat(mode: RepeatMode) {
      this.playback = transitionPlayback(this.playback, { type: "REPEAT", mode });
      this.prepareNextCandidate(true);
      this.persistSettings();
    },
    async next(fromEnded = false) {
      const queue = useQueueStore();
      const currentIndex = queue.items.findIndex((item) => item.id === this.playback.currentItemId);
      if (this.playback.currentItemId) this.visited.add(this.playback.currentItemId);
      const index = nextQueueIndex(queue.items, currentIndex, { shuffle: this.playback.shuffle, repeatMode: this.playback.repeatMode, visited: this.visited });
      if (index < 0) { if (fromEnded) this.pause(); return; }
      await this.load(queue.items[index], 0, true);
    },
    async handleEnded() {
      if (!this.wantsPlayback) return;
      const operation = this.loadOperation;
      const completed = playbackSession;
      if (completed?.started) {
        await window.studyRoomDesktop?.recordPlaybackEvent?.({
          sessionId: completed.id,
          trackId: completed.trackId,
          state: "completed",
          playedAt: Date.now()
        }).catch(() => undefined);
      }
      if (operation === this.loadOperation && this.wantsPlayback && completed === playbackSession) await this.next(true);
    },
    handleCrossfadeTransition(item: QueueItem, durationMs: number) {
      if (!this.wantsPlayback) return;
      this.loadOperation += 1;
      this.loadedItemId = item.id;
      const completed = playbackSession;
      if (completed?.started) {
        void window.studyRoomDesktop?.recordPlaybackEvent?.({
          sessionId: completed.id,
          trackId: completed.trackId,
          state: "completed",
          playedAt: Date.now()
        }).catch(() => undefined);
      }
      if (this.playback.currentItemId) this.visited.add(this.playback.currentItemId);
      playbackSession = { id: crypto.randomUUID(), trackId: item.track.id, started: true };
      this.playback = transitionPlayback(this.playback, { type: "LOAD", itemId: item.id, durationMs });
      this.playback = transitionPlayback(this.playback, { type: "READY", durationMs });
      this.playback = transitionPlayback(this.playback, { type: "PLAY" });
      void window.studyRoomDesktop?.recordPlaybackEvent?.({
        sessionId: playbackSession.id,
        trackId: playbackSession.trackId,
        state: "started",
        playedAt: Date.now()
      }).catch(() => undefined);
      this.prepareNextCandidate(true);
      this.persistSettings();
    },
    async runtimeItem(item: QueueItem, playbackSessionId: string, fallbackFrom?: string): Promise<QueueItem> {
      const source = item.track.source;
      if (source.kind === "local" || source.kind === "builtin") return item;
      if (source.kind === "radio") {
        const runtimeUrl = await resolveRadioPlaybackUrl(source.stationId);
        return { ...item, track: { ...item.track, source: { kind: "builtin", assetId: runtimeUrl } } };
      }
      if (!window.studyRoomDesktop) throw new Error("桌面客户端专属实验能力");
      const descriptor = await window.studyRoomDesktop.prepareProviderPlayback({
        providerId: source.providerId,
        trackId: item.track.id,
        providerTrackId: source.trackId,
        playbackSessionId,
        fallbackReason: fallbackFrom ? "temporary-network" : undefined,
        fromProviderId: fallbackFrom as typeof source.providerId | undefined
      });
      return {
        ...item,
        track: { ...item.track, source: { kind: "builtin", assetId: `studyroom-media://provider/${encodeURIComponent(descriptor.mediaToken)}` } }
      };
    },
    async handlePlaybackError(code: string) {
      if (!this.wantsPlayback) return;
      this.loadedItemId = undefined;
      const item = this.currentItem;
      if (item?.track.source.kind === "radio" && code === "MEDIA_NETWORK_ERROR" && this.scheduleRadioReconnect(item, code)) return;
      // A network failure does not authorize sending this listening request to another platform.
      // Keep the selected source and require an explicit user choice before switching providers.
      this.failPlayback(code);
    },
    scheduleRadioReconnect(item: QueueItem, code: string): boolean {
      if (!this.wantsPlayback) return false;
      const operation = this.loadOperation;
      const delay = RADIO_RECONNECT_DELAYS[this.radioReconnectAttempt];
      if (delay == null) return false;
      this.radioReconnectAttempt += 1;
      if (radioReconnectTimer) clearTimeout(radioReconnectTimer);
      this.playback = transitionPlayback(this.playback, { type: "FAIL", code: `RADIO_RECONNECTING_${this.radioReconnectAttempt}` });
      useShellStore().toast(`电台连接中断，${delay / 1000} 秒后重试（${this.radioReconnectAttempt}/5）`, "info");
      radioReconnectTimer = setTimeout(() => {
        radioReconnectTimer = undefined;
        if (operation === this.loadOperation && this.wantsPlayback && this.currentItem?.id === item.id) void this.load(item, 0, true, undefined, true);
      }, delay);
      return true;
    },
    prepareNextCandidate(force = false) {
      const queue = useQueueStore();
      if (!force
        && this.preparedQueueRevision === queue.revision
        && this.preparedForItemId === this.playback.currentItemId) return;
      this.preparedQueueRevision = queue.revision;
      this.preparedForItemId = this.playback.currentItemId;
      const currentIndex = queue.items.findIndex((item) => item.id === this.playback.currentItemId);
      if (currentIndex < 0) {
        engine?.prepareNext(undefined);
        return;
      }
      const index = nextQueueIndex(queue.items, currentIndex, {
        shuffle: this.playback.shuffle,
        repeatMode: this.playback.repeatMode,
        visited: this.visited
      });
      const nextItem = index >= 0 ? queue.items[index] : undefined;
      engine?.prepareNext(nextItem && (nextItem.track.source.kind === "local" || nextItem.track.source.kind === "builtin") ? nextItem : undefined);
    },
    configureAudioEnhancements(crossfadeSeconds: number, lowPerformance: boolean) {
      engine?.configureCrossfade(crossfadeSeconds, lowPerformance);
      this.prepareNextCandidate(true);
    },
    async previous() {
      if (this.playback.positionMs > 5000) { this.seek(0); return; }
      const queue = useQueueStore();
      const index = queue.items.findIndex((item) => item.id === this.playback.currentItemId);
      const previous = index > 0 ? index - 1 : (this.playback.repeatMode === "all" ? queue.items.length - 1 : -1);
      if (previous >= 0) await this.load(queue.items[previous], 0, true);
    },
    persistSettings() {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        currentItemId: this.playback.currentItemId,
        positionMs: Math.round(this.playback.positionMs),
        volume: this.playback.volume,
        muted: this.playback.muted,
        shuffle: this.playback.shuffle,
        repeatMode: this.playback.repeatMode
      }));
    }
  }
});
