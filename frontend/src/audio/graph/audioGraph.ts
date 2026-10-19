import type {
  AmbientBusState,
  EqualizerState,
  MasterProcessingState,
  MusicBusState
} from "@studyroom/contracts";
import { Equalizer } from "../effects/equalizer";
import { MasterProcessor } from "../effects/masterProcessor";
import {
  createBrowserAudioContext,
  disconnectNode,
  rampAudioParam,
  type AudioContextFactory
} from "./audioNodeFactory";

export type AudioGraphCapability =
  | { state: "idle" }
  | { state: "ready" }
  | { state: "unavailable"; reason: string };

export interface MusicDeckRoute {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
}

export type UiTone = "tap" | "wood" | "success" | "error";

export class AudioGraph {
  private context?: AudioContext;
  private musicBus?: GainNode;
  private ambientBus?: GainNode;
  private effectsBus?: GainNode;
  private equalizer?: Equalizer;
  private master?: MasterProcessor;
  private capability: AudioGraphCapability = { state: "idle" };
  private musicState: MusicBusState = { volume: 0.8, muted: false };
  private musicDuckFactor = 1;

  constructor(private readonly createContext: AudioContextFactory = createBrowserAudioContext) {}

  status(): AudioGraphCapability {
    return this.capability;
  }

  initialize(): boolean {
    if (this.capability.state === "ready") return true;
    if (this.capability.state === "unavailable") return false;
    try {
      const context = this.createContext();
      this.context = context;
      const musicBus = context.createGain();
      this.musicBus = musicBus;
      const ambientBus = context.createGain();
      this.ambientBus = ambientBus;
      const effectsBus = context.createGain();
      this.effectsBus = effectsBus;
      const equalizer = new Equalizer(context);
      this.equalizer = equalizer;
      const master = new MasterProcessor(context);
      this.master = master;
      musicBus.connect(equalizer.input);
      ambientBus.connect(equalizer.input);
      effectsBus.connect(equalizer.input);
      equalizer.output.connect(master.input);
      master.output.connect(context.destination);
      this.capability = { state: "ready" };
      return true;
    } catch (error) {
      void this.releaseNodes();
      this.capability = {
        state: "unavailable",
        reason: error instanceof Error ? error.message : "WEB_AUDIO_INITIALIZATION_FAILED"
      };
      return false;
    }
  }

  async resume(): Promise<boolean> {
    if (!this.initialize() || !this.context) return false;
    try {
      if (this.context.state === "suspended") await this.context.resume();
      return this.context.state === "running";
    } catch {
      return false;
    }
  }

  connectMusicSource(source: AudioNode): boolean {
    if (!this.initialize() || !this.musicBus) return false;
    source.connect(this.musicBus);
    return true;
  }

  connectAmbientSource(source: AudioNode): boolean {
    if (!this.initialize() || !this.ambientBus) return false;
    source.connect(this.ambientBus);
    return true;
  }

  createMusicMediaSource(element: HTMLMediaElement): MediaElementAudioSourceNode | undefined {
    if (!this.initialize() || !this.context) return undefined;
    const source = this.context.createMediaElementSource(element);
    return this.connectMusicSource(source) ? source : undefined;
  }

  createMusicDeckRoute(element: HTMLMediaElement): MusicDeckRoute | undefined {
    if (!this.initialize() || !this.context || !this.musicBus) return undefined;
    const gain = this.context.createGain();
    gain.gain.value = 1;
    try {
      const source = this.context.createMediaElementSource(element);
      source.connect(gain);
      gain.connect(this.musicBus);
      return { source, gain };
    } catch {
      disconnectNode(gain);
      return undefined;
    }
  }

  setMusicBus(state: MusicBusState): void {
    this.musicState = { volume: Math.min(1, Math.max(0, state.volume)), muted: state.muted };
    this.applyMusicGain();
  }

  setMusicDucking(factor: number): void {
    this.musicDuckFactor = Math.min(1, Math.max(0, Number.isFinite(factor) ? factor : 1));
    this.applyMusicGain();
  }

  setAmbientBus(state: AmbientBusState): void {
    if (!this.initialize() || !this.context || !this.ambientBus) return;
    rampAudioParam(this.ambientBus.gain, state.muted ? 0 : state.volume, this.context);
  }

  setEqualizer(state: EqualizerState): void {
    if (!this.initialize()) return;
    this.equalizer?.apply(state);
  }

  setMasterProcessing(state: MasterProcessingState): void {
    if (!this.initialize()) return;
    this.master?.apply(state);
  }

  analyserNode(): AnalyserNode | undefined {
    return this.master?.analyser;
  }

  audioContext(): AudioContext | undefined {
    return this.context;
  }

  async playUiTone(tone: UiTone): Promise<boolean> {
    if (!await this.resume() || !this.context || !this.effectsBus) return false;
    const settings = {
      tap: { frequency: 520, endFrequency: 420, duration: 0.08, gain: 0.08 },
      wood: { frequency: 220, endFrequency: 120, duration: 0.12, gain: 0.16 },
      success: { frequency: 660, endFrequency: 880, duration: 0.18, gain: 0.1 },
      error: { frequency: 180, endFrequency: 140, duration: 0.12, gain: 0.08 }
    }[tone];
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    oscillator.type = tone === "wood" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(settings.frequency, now);
    oscillator.frequency.linearRampToValueAtTime(settings.endFrequency, now + settings.duration);
    gain.gain.setValueAtTime(settings.gain, now);
    gain.gain.linearRampToValueAtTime(0, now + settings.duration);
    oscillator.connect(gain);
    gain.connect(this.effectsBus);
    oscillator.onended = () => { disconnectNode(oscillator); disconnectNode(gain); };
    oscillator.start(now);
    oscillator.stop(now + settings.duration);
    return true;
  }

  async destroy(): Promise<void> {
    await this.releaseNodes();
    this.capability = { state: "idle" };
  }

  private async releaseNodes(): Promise<void> {
    disconnectNode(this.musicBus);
    disconnectNode(this.ambientBus);
    disconnectNode(this.effectsBus);
    this.equalizer?.destroy();
    this.master?.destroy();
    const context = this.context;
    this.musicBus = undefined;
    this.ambientBus = undefined;
    this.effectsBus = undefined;
    this.equalizer = undefined;
    this.master = undefined;
    this.context = undefined;
    if (context && context.state !== "closed") {
      try {
        await context.close();
      } catch {
        // Closing a failed graph is best-effort; fallback playback remains available.
      }
    }
  }

  private applyMusicGain(): void {
    if (!this.initialize() || !this.context || !this.musicBus) return;
    const volume = this.musicState.muted ? 0 : this.musicState.volume * this.musicDuckFactor;
    rampAudioParam(this.musicBus.gain, volume, this.context);
  }
}
