import type {
  AmbientBusState,
  AmbientSourceId,
  AmbientTrackState
} from "@studyroom/contracts";
import { AudioGraph } from "../graph/audioGraph";
import { disconnectNode, rampAudioParam } from "../graph/audioNodeFactory";
import { sharedAudioGraph } from "../runtime/audioRuntime";
import { ambientCatalogEntry } from "./ambientCatalog";
import { createNoiseBuffer, sourceIdToNoiseColor } from "./noiseGenerator";

interface AmbientRuntime {
  audio?: HTMLAudioElement;
  source: AudioNode;
  scheduledSource?: AudioBufferSourceNode;
  panner: StereoPannerNode;
  gain: GainNode;
  stopTimer?: ReturnType<typeof setTimeout>;
}

export interface AmbientMixerOptions {
  graph?: AudioGraph;
  createAudio?: () => HTMLAudioElement;
  random?: () => number;
  setTimer?: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  onChange?: (tracks: AmbientTrackState[]) => void;
}

const MAX_AMBIENT_TRACKS = 6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stoppedState(sourceId: AmbientSourceId): AmbientTrackState {
  return {
    id: crypto.randomUUID(),
    sourceId,
    volume: 0.45,
    pan: 0,
    muted: false,
    solo: false,
    fadeInMs: 800,
    fadeOutMs: 800,
    randomStart: true,
    status: "stopped"
  };
}

export class AmbientMixer {
  readonly graph: AudioGraph;
  private readonly tracks = new Map<string, AmbientTrackState>();
  private readonly runtimes = new Map<string, AmbientRuntime>();
  private readonly createAudio: () => HTMLAudioElement;
  private readonly random: () => number;
  private readonly setTimer: NonNullable<AmbientMixerOptions["setTimer"]>;
  private readonly clearTimer: NonNullable<AmbientMixerOptions["clearTimer"]>;
  private readonly onChange?: AmbientMixerOptions["onChange"];
  private bus: AmbientBusState = { volume: 0.45, muted: false };

  constructor(options: AmbientMixerOptions = {}) {
    this.graph = options.graph ?? sharedAudioGraph;
    this.createAudio = options.createAudio ?? (() => new Audio());
    this.random = options.random ?? Math.random;
    this.setTimer = options.setTimer ?? ((callback, milliseconds) => setTimeout(callback, milliseconds));
    this.clearTimer = options.clearTimer ?? ((timer) => clearTimeout(timer));
    this.onChange = options.onChange;
  }

  list(): AmbientTrackState[] {
    return [...this.tracks.values()].map((track) => ({ ...track }));
  }

  restore(states: AmbientTrackState[]): void {
    this.destroyTracks();
    for (const state of states.slice(0, MAX_AMBIENT_TRACKS)) {
      if (this.hasSource(state.sourceId) || this.tracks.has(state.id)) continue;
      this.tracks.set(state.id, { ...state, status: "stopped", errorCode: undefined });
    }
    this.emit();
  }

  add(sourceId: AmbientSourceId): AmbientTrackState {
    ambientCatalogEntry(sourceId);
    if (this.hasSource(sourceId)) throw new Error("AMBIENT_SOURCE_ALREADY_ADDED");
    if (this.tracks.size >= MAX_AMBIENT_TRACKS) throw new Error("AMBIENT_TRACK_LIMIT");
    const state = stoppedState(sourceId);
    this.tracks.set(state.id, state);
    this.emit();
    return { ...state };
  }

  remove(trackId: string): void {
    if (!this.tracks.has(trackId)) throw new Error("AMBIENT_TRACK_NOT_FOUND");
    this.releaseRuntime(trackId);
    this.tracks.delete(trackId);
    this.applyEffectiveGains();
    this.emit();
  }

  setBus(state: AmbientBusState): void {
    this.bus = { volume: clamp(state.volume, 0, 1), muted: state.muted };
    this.graph.setAmbientBus(this.bus);
  }

  update(trackId: string, update: Partial<Pick<AmbientTrackState,
    "volume" | "pan" | "muted" | "solo" | "fadeInMs" | "fadeOutMs" | "randomStart">>): AmbientTrackState {
    const current = this.requireTrack(trackId);
    const next: AmbientTrackState = {
      ...current,
      ...update,
      volume: clamp(update.volume ?? current.volume, 0, 1),
      pan: clamp(update.pan ?? current.pan, -1, 1),
      fadeInMs: Math.round(clamp(update.fadeInMs ?? current.fadeInMs, 0, 30_000)),
      fadeOutMs: Math.round(clamp(update.fadeOutMs ?? current.fadeOutMs, 0, 30_000))
    };
    this.tracks.set(trackId, next);
    const runtime = this.runtimes.get(trackId);
    if (runtime) rampAudioParam(runtime.panner.pan, next.pan, this.requireContext());
    this.applyEffectiveGains();
    this.emit();
    return { ...next };
  }

  async start(trackId: string): Promise<void> {
    const track = this.requireTrack(trackId);
    if (track.status === "playing" || track.status === "loading") return;
    this.releaseRuntime(trackId);
    this.setState(trackId, { status: "loading", errorCode: undefined });
    try {
      if (!this.graph.initialize()) throw new Error("WEB_AUDIO_UNAVAILABLE");
      const context = this.requireContext();
      const runtime = this.createRuntime(track, context);
      this.runtimes.set(trackId, runtime);
      runtime.gain.gain.value = 0;
      runtime.panner.pan.value = track.pan;
      if (!await this.graph.resume()) throw new Error("AUDIO_CONTEXT_SUSPENDED");
      if (runtime.audio) {
        if (track.randomStart) {
          const chooseRandomStart = () => {
            if (runtime.audio && Number.isFinite(runtime.audio.duration) && runtime.audio.duration > 0) {
              runtime.audio.currentTime = this.random() * runtime.audio.duration;
            }
          };
          if (Number.isFinite(runtime.audio.duration) && runtime.audio.duration > 0) chooseRandomStart();
          else runtime.audio.addEventListener("loadedmetadata", chooseRandomStart, { once: true });
        }
        await runtime.audio.play();
      } else if (runtime.scheduledSource) {
        const duration = runtime.scheduledSource.buffer?.duration ?? 0;
        runtime.scheduledSource.start(0, track.randomStart && duration > 0 ? this.random() * duration : 0);
      }
      this.setState(trackId, { status: "playing", errorCode: undefined });
      this.applyEffectiveGains(track.fadeInMs / 1000);
    } catch (error) {
      this.releaseRuntime(trackId);
      this.setState(trackId, {
        status: "error",
        errorCode: error instanceof Error ? error.message : "AMBIENT_START_FAILED"
      });
      this.applyEffectiveGains();
    }
  }

  stop(trackId: string, immediate = false): void {
    const track = this.requireTrack(trackId);
    const runtime = this.runtimes.get(trackId);
    if (!runtime) {
      this.setState(trackId, { status: "stopped", errorCode: undefined });
      return;
    }
    if (runtime.stopTimer) this.clearTimer(runtime.stopTimer);
    const seconds = immediate ? 0 : track.fadeOutMs / 1000;
    rampAudioParam(runtime.gain.gain, 0, this.requireContext(), seconds);
    this.setState(trackId, { status: "stopped", errorCode: undefined });
    this.applyEffectiveGains(0.03, trackId);
    if (seconds === 0) {
      this.releaseRuntime(trackId);
      return;
    }
    runtime.stopTimer = this.setTimer(() => this.releaseRuntime(trackId), Math.ceil(seconds * 1000) + 20);
  }

  async toggle(trackId: string): Promise<void> {
    if (this.requireTrack(trackId).status === "playing") this.stop(trackId);
    else await this.start(trackId);
  }

  async destroy(): Promise<void> {
    this.destroyTracks();
    await this.graph.destroy();
  }

  private createRuntime(track: AmbientTrackState, context: AudioContext): AmbientRuntime {
    const panner = context.createStereoPanner();
    const gain = context.createGain();
    let source: AudioNode | undefined;
    let audio: HTMLAudioElement | undefined;
    try {
      const color = sourceIdToNoiseColor(track.sourceId);
      if (color) {
        const scheduledSource = context.createBufferSource();
        source = scheduledSource;
        scheduledSource.buffer = createNoiseBuffer(context, color);
        scheduledSource.loop = true;
        scheduledSource.connect(panner);
        panner.connect(gain);
        if (!this.graph.connectAmbientSource(gain)) throw new Error("AMBIENT_ROUTE_FAILED");
        return { source: scheduledSource, scheduledSource, panner, gain };
      }

      const entry = ambientCatalogEntry(track.sourceId);
      if (!entry.assetUrl) throw new Error("AMBIENT_ASSET_MISSING");
      audio = this.createAudio();
      audio.src = entry.assetUrl;
      audio.preload = "auto";
      audio.loop = true;
      source = context.createMediaElementSource(audio);
      source.connect(panner);
      panner.connect(gain);
      if (!this.graph.connectAmbientSource(gain)) throw new Error("AMBIENT_ROUTE_FAILED");
      return { audio, source, panner, gain };
    } catch (error) {
      audio?.pause();
      if (audio) audio.removeAttribute("src");
      disconnectNode(source);
      disconnectNode(panner);
      disconnectNode(gain);
      throw error;
    }
  }

  private applyEffectiveGains(seconds = 0.03, skipTrackId?: string): void {
    const context = this.graph.audioContext();
    if (!context) return;
    const hasSolo = [...this.tracks.values()].some((track) => track.solo && track.status === "playing");
    for (const [trackId, runtime] of this.runtimes) {
      if (trackId === skipTrackId) continue;
      const track = this.tracks.get(trackId);
      if (!track) continue;
      const audible = track.status === "playing" && !track.muted && (!hasSolo || track.solo);
      rampAudioParam(runtime.gain.gain, audible ? track.volume : 0, context, seconds);
    }
  }

  private requireContext(): AudioContext {
    const context = this.graph.audioContext();
    if (!context) throw new Error("WEB_AUDIO_UNAVAILABLE");
    return context;
  }

  private requireTrack(trackId: string): AmbientTrackState {
    const track = this.tracks.get(trackId);
    if (!track) throw new Error("AMBIENT_TRACK_NOT_FOUND");
    return track;
  }

  private hasSource(sourceId: AmbientSourceId): boolean {
    return [...this.tracks.values()].some((track) => track.sourceId === sourceId);
  }

  private setState(trackId: string, update: Partial<AmbientTrackState>): void {
    const track = this.requireTrack(trackId);
    this.tracks.set(trackId, { ...track, ...update });
    this.emit();
  }

  private releaseRuntime(trackId: string): void {
    const runtime = this.runtimes.get(trackId);
    if (!runtime) return;
    if (runtime.stopTimer) this.clearTimer(runtime.stopTimer);
    runtime.audio?.pause();
    if (runtime.audio) {
      runtime.audio.removeAttribute("src");
      runtime.audio.load();
    }
    try { runtime.scheduledSource?.stop(); } catch { /* already stopped */ }
    disconnectNode(runtime.source);
    disconnectNode(runtime.panner);
    disconnectNode(runtime.gain);
    this.runtimes.delete(trackId);
  }

  private destroyTracks(): void {
    [...this.runtimes.keys()].forEach((trackId) => this.releaseRuntime(trackId));
    this.tracks.clear();
  }

  private emit(): void {
    this.onChange?.(this.list());
  }
}
