import type { QueueItem } from "@studyroom/contracts";
import { AudioGraph, type MusicDeckRoute } from "../graph/audioGraph";
import { disconnectNode } from "../graph/audioNodeFactory";
import { sharedAudioGraph } from "../runtime/audioRuntime";
import { scheduleEqualPowerCrossfade } from "./crossfade";

export interface MusicDeckListeners {
  ready(durationMs: number): void;
  time(positionMs: number, durationMs: number): void;
  ended(): void;
  error(code: string): void;
  buffering?(active: boolean): void;
  transitioned?(item: QueueItem, durationMs: number): void;
}

interface MusicDeck {
  audio: HTMLAudioElement;
  item?: QueueItem;
  route?: MusicDeckRoute;
  pendingPositionMs: number;
  operation: number;
}

export interface MusicDeckManagerOptions {
  graph?: AudioGraph;
  createAudio?: () => HTMLAudioElement;
  setTimer?: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

function sourceUrl(item: QueueItem): string {
  const source = item.track.source;
  if (source.kind === "local") return `studyroom-media://track/${encodeURIComponent(source.fileToken)}`;
  if (source.kind === "builtin") return source.assetId;
  throw new Error("SOURCE_NOT_PLAYABLE");
}

function safeDurationMs(audio: HTMLAudioElement): number {
  return Number.isFinite(audio.duration) ? Math.max(0, audio.duration * 1000) : 0;
}

function safePositionMs(audio: HTMLAudioElement): number {
  return Number.isFinite(audio.currentTime) ? Math.max(0, audio.currentTime * 1000) : 0;
}

export class MusicDeckManager {
  readonly graph: AudioGraph;
  private readonly decks: [MusicDeck, MusicDeck];
  private readonly setTimer: NonNullable<MusicDeckManagerOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<MusicDeckManagerOptions["clearTimer"]>;
  private activeIndex = 0;
  private nextItem?: QueueItem;
  private crossfadeSeconds = 4;
  private lowPerformance = false;
  private crossfading = false;
  private cleanupTimer?: ReturnType<typeof setTimeout>;
  private volume = 0.8;
  private muted = false;
  private duckFactor = 1;
  private playbackOperation = 0;
  private wantsPlayback = false;
  private bufferTimer?: ReturnType<typeof setTimeout>;
  private bufferingDeck?: MusicDeck;

  constructor(private readonly listeners: MusicDeckListeners, options: MusicDeckManagerOptions = {}) {
    this.graph = options.graph ?? sharedAudioGraph;
    const createAudio = options.createAudio ?? (() => new Audio());
    this.setTimer = options.setTimer ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
    this.decks = [this.createDeck(createAudio), this.createDeck(createAudio)];
  }

  load(item: QueueItem, positionMs = 0): void {
    this.playbackOperation += 1;
    this.wantsPlayback = false;
    this.clearBufferWait();
    this.cancelCrossfade();
    this.nextItem = undefined;
    const active = this.decks[this.activeIndex];
    const inactive = this.decks[1 - this.activeIndex];
    this.clearDeck(inactive);
    this.loadDeck(active, item, positionMs);
  }

  prepareNext(item?: QueueItem): void {
    if (this.lowPerformance || this.crossfadeSeconds === 0) {
      this.nextItem = undefined;
      if (!this.crossfading) this.clearDeck(this.decks[1 - this.activeIndex]);
      return;
    }
    this.nextItem = item;
    if (this.crossfading) return;
    const inactive = this.decks[1 - this.activeIndex];
    if (!item) {
      this.clearDeck(inactive);
      return;
    }
    if (inactive.item?.id === item.id) return;
    this.loadDeck(inactive, item, 0, true);
  }

  async play(): Promise<void> {
    const active = this.decks[this.activeIndex];
    if (!active.item) return;
    const operation = ++this.playbackOperation;
    this.wantsPlayback = true;
    const routed = this.ensureRoute(active);
    const resumed = !routed || await this.graph.resume();
    if (operation !== this.playbackOperation) return;
    if (!resumed) throw new Error("AUDIO_CONTEXT_SUSPENDED");
    const playing = active.audio.play();
    if (active.audio.readyState < 3) this.handleBufferWait(active);
    await playing;
  }

  pause(): void {
    this.playbackOperation += 1;
    this.wantsPlayback = false;
    this.clearBufferWait();
    this.decks.forEach((deck) => deck.audio.pause());
    this.cancelCrossfade();
  }

  clear(): void {
    this.playbackOperation += 1;
    this.wantsPlayback = false;
    this.clearBufferWait();
    this.cancelCrossfade();
    this.nextItem = undefined;
    this.decks.forEach((deck) => this.clearDeck(deck));
  }

  seek(positionMs: number): void {
    this.decks[this.activeIndex].audio.currentTime = Math.max(0, positionMs) / 1000;
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.applyVolume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyVolume();
  }

  setDuckingFactor(factor: number): void {
    this.duckFactor = Math.min(1, Math.max(0, Number.isFinite(factor) ? factor : 1));
    this.graph.setMusicDucking(this.duckFactor);
    this.applyVolume();
  }

  configureCrossfade(seconds: number, lowPerformance: boolean): void {
    this.crossfadeSeconds = Math.min(12, Math.max(0, seconds));
    this.lowPerformance = lowPerformance;
    if (lowPerformance) this.prepareNext(undefined);
  }

  positionMs(): number { return safePositionMs(this.decks[this.activeIndex].audio); }
  durationMs(): number { return safeDurationMs(this.decks[this.activeIndex].audio); }

  async destroy(): Promise<void> {
    this.clear();
    this.decks.forEach((deck) => {
      disconnectNode(deck.route?.source);
      disconnectNode(deck.route?.gain);
      deck.route = undefined;
    });
    await this.graph.destroy();
  }

  private createDeck(createAudio: () => HTMLAudioElement): MusicDeck {
    const audio = createAudio();
    audio.preload = "auto";
    audio.volume = this.volume;
    const deck: MusicDeck = { audio, pendingPositionMs: 0, operation: 0 };
    audio.addEventListener("loadedmetadata", () => this.handleReady(deck));
    audio.addEventListener("timeupdate", () => this.handleTime(deck));
    audio.addEventListener("ended", () => this.handleEnded(deck));
    audio.addEventListener("error", () => this.handleError(deck));
    audio.addEventListener("waiting", () => this.handleBufferWait(deck));
    audio.addEventListener("stalled", () => this.handleBufferWait(deck));
    audio.addEventListener("playing", () => {
      if (deck !== this.decks[this.activeIndex]) return;
      if (!this.wantsPlayback) { audio.pause(); return; }
      this.clearBufferWait();
    });
    return deck;
  }

  private loadDeck(deck: MusicDeck, item: QueueItem, positionMs: number, preloadOnly = false): void {
    deck.operation += 1;
    deck.item = item;
    deck.pendingPositionMs = Math.max(0, positionMs);
    try {
      const url = sourceUrl(item);
      // The token-backed desktop protocol is cross-origin from file://.
      // Request CORS before assigning src, otherwise Web Audio outputs silence.
      if (url.startsWith("studyroom-media://")) deck.audio.crossOrigin = "anonymous";
      else deck.audio.removeAttribute("crossorigin");
      deck.audio.src = url;
      this.ensureRoute(deck);
      if (deck.route) deck.route.gain.gain.value = preloadOnly ? 0 : 1;
      deck.audio.load();
    } catch (error) {
      if (!preloadOnly) this.listeners.error(error instanceof Error ? error.message : "SOURCE_NOT_PLAYABLE");
      else this.clearDeck(deck);
    }
  }

  private ensureRoute(deck: MusicDeck): MusicDeckRoute | undefined {
    if (deck.route) return deck.route;
    deck.route = this.graph.createMusicDeckRoute(deck.audio);
    if (deck.route) {
      deck.audio.volume = 1;
      deck.audio.muted = false;
      this.graph.setMusicBus({ volume: this.volume, muted: this.muted });
    }
    return deck.route;
  }

  private handleReady(deck: MusicDeck): void {
    if (deck.pendingPositionMs > 0) {
      deck.audio.currentTime = deck.pendingPositionMs / 1000;
      deck.pendingPositionMs = 0;
    }
    if (deck === this.decks[this.activeIndex]) {
      const durationMs = safeDurationMs(deck.audio);
      this.listeners.ready(durationMs);
      if (durationMs === 0) this.prepareNext(undefined);
    }
  }

  private handleTime(deck: MusicDeck): void {
    if (deck !== this.decks[this.activeIndex]) return;
    if (this.bufferingDeck === deck && deck.audio.readyState >= 3 && !deck.audio.paused) this.clearBufferWait();
    const positionMs = safePositionMs(deck.audio);
    const durationMs = safeDurationMs(deck.audio);
    this.listeners.time(positionMs, durationMs);
    if (this.shouldCrossfade(deck, positionMs, durationMs)) void this.startCrossfade(deck, durationMs - positionMs);
  }

  private shouldCrossfade(deck: MusicDeck, positionMs: number, durationMs: number): boolean {
    return !this.crossfading
      && !this.lowPerformance
      && this.crossfadeSeconds > 0
      && Boolean(this.nextItem)
      && Boolean(deck.route)
      && !deck.audio.paused
      && durationMs > 0
      && durationMs - positionMs <= this.crossfadeSeconds * 1000;
  }

  private async startCrossfade(outgoing: MusicDeck, remainingMs: number): Promise<void> {
    const incoming = this.decks[1 - this.activeIndex];
    const nextItem = this.nextItem;
    if (!nextItem || incoming.item?.id !== nextItem.id || !outgoing.route || !this.ensureRoute(incoming)) return;
    this.crossfading = true;
    const operation = incoming.operation;
    const playbackOperation = this.playbackOperation;
    const current = () => playbackOperation === this.playbackOperation
      && incoming.operation === operation && incoming.item?.id === nextItem.id;
    try {
      const resumed = await this.graph.resume();
      if (!current()) return;
      if (!resumed) throw new Error("AUDIO_CONTEXT_SUSPENDED");
      await incoming.audio.play();
      if (!current()) return;
      const context = this.graph.audioContext();
      if (!context || !incoming.route) return;
      const durationSeconds = Math.max(0.05, Math.min(this.crossfadeSeconds, remainingMs / 1000));
      scheduleEqualPowerCrossfade(outgoing.route.gain.gain, incoming.route.gain.gain, context.currentTime, durationSeconds);
      this.activeIndex = 1 - this.activeIndex;
      this.nextItem = undefined;
      this.listeners.transitioned?.(nextItem, safeDurationMs(incoming.audio));
      this.cleanupTimer = this.setTimer(() => {
        this.clearDeck(outgoing);
        this.crossfading = false;
        this.cleanupTimer = undefined;
        if (this.nextItem) this.loadDeck(outgoing, this.nextItem, 0, true);
      }, Math.ceil(durationSeconds * 1000) + 50);
    } catch {
      if (!current()) return;
      this.clearDeck(incoming);
      this.crossfading = false;
    }
  }

  private handleEnded(deck: MusicDeck): void {
    if (deck !== this.decks[this.activeIndex]) {
      this.clearDeck(deck);
      return;
    }
    this.clearBufferWait();
    if (!this.crossfading) this.listeners.ended();
  }

  private handleError(deck: MusicDeck): void {
    if (deck === this.decks[this.activeIndex]) {
      this.clearBufferWait();
      const code = deck.audio.error?.code;
      this.listeners.error(code === 2 ? "MEDIA_NETWORK_ERROR" : code === 3 ? "MEDIA_DECODE_ERROR" : code === 4 ? "MEDIA_SOURCE_UNSUPPORTED" : "MEDIA_LOAD_FAILED");
    }
    else this.clearDeck(deck);
  }

  private clearBufferWait(): void {
    if (this.bufferTimer !== undefined) this.clearTimer(this.bufferTimer);
    this.bufferTimer = undefined;
    if (this.bufferingDeck) this.listeners.buffering?.(false);
    this.bufferingDeck = undefined;
  }

  private handleBufferWait(deck: MusicDeck): void {
    if (!this.wantsPlayback || !deck.item || deck !== this.decks[this.activeIndex] || deck.audio.readyState >= 3) return;
    if (this.bufferingDeck === deck) return;
    this.clearBufferWait();
    this.bufferingDeck = deck;
    this.listeners.buffering?.(true);
    const operation = this.playbackOperation, deckOperation = deck.operation;
    this.bufferTimer = this.setTimer(() => {
      this.bufferTimer = undefined;
      if (operation !== this.playbackOperation || deckOperation !== deck.operation || !this.wantsPlayback) { this.clearBufferWait(); return; }
      if (deck.audio.readyState >= 3 && !deck.audio.paused) { this.clearBufferWait(); return; }
      this.pause();
      this.listeners.error('MEDIA_BUFFER_TIMEOUT');
    }, 15_000);
  }

  private applyVolume(): void {
    if (this.graph.status().state === "ready") {
      this.graph.setMusicBus({ volume: this.volume, muted: this.muted });
      return;
    }
    this.decks.forEach((deck) => {
      deck.audio.volume = this.volume * this.duckFactor;
      deck.audio.muted = this.muted;
    });
  }

  private cancelScheduledGains(): void {
    const context = this.graph.audioContext();
    if (!context) return;
    this.decks.forEach((deck, index) => {
      const gain = deck.route?.gain.gain;
      if (!gain) return;
      gain.cancelScheduledValues(context.currentTime);
      gain.setValueAtTime(index === this.activeIndex ? 1 : 0, context.currentTime);
    });
  }

  private cancelCrossfade(): void {
    if (this.cleanupTimer) this.clearTimer(this.cleanupTimer);
    this.cleanupTimer = undefined;
    this.crossfading = false;
    this.cancelScheduledGains();
  }

  private clearDeck(deck: MusicDeck): void {
    if (this.bufferingDeck === deck) this.clearBufferWait();
    deck.operation += 1;
    deck.audio.pause();
    deck.audio.removeAttribute("src");
    deck.audio.load();
    deck.item = undefined;
    deck.pendingPositionMs = 0;
    if (deck.route) deck.route.gain.gain.value = deck === this.decks[this.activeIndex] ? 1 : 0;
  }
}
