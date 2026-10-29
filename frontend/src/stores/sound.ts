import type {
  AmbientSourceId,
  AmbientTrackState,
  EqualizerState,
  MasterProcessingState,
  OutputDeviceSummary,
  SoundSettings,
  SoundSnapshot,
  SoundSnapshotState,
  VisualizerState
} from "@studyroom/contracts";
import { defineStore } from "pinia";
import {normalizeStagePreferences} from '../pages/sound/stage/stagePreferences';
import { AmbientMixer } from "../audio/ambient/ambientMixer";
import { EQUALIZER_FREQUENCIES } from "../audio/effects/equalizerPresets";
import { OutputDeviceManager } from "../audio/output/outputDeviceManager";
import { sharedAudioGraph } from "../audio/runtime/audioRuntime";
import { usePlayerStore } from "./player";

const WEB_SETTINGS_KEY = "studyroom-sound-settings-v1";
const WEB_SNAPSHOTS_KEY = "studyroom-sound-snapshots-v1";
const sourceIds = new Set<AmbientSourceId>([
  "white-noise", "pink-noise", "brown-noise", "rain", "cafe", "fireplace", "waves"
]);
let mixer: AmbientMixer | undefined;
let outputManager: OutputDeviceManager | undefined;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
const writes = new WeakMap<object, { tail: Promise<void>; pending: number }>();

function clamp(value: unknown, fallback: number, min = 0, max = 1): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function defaultSoundSettings(volume = 0.8, muted = false): SoundSettings {
  return {
    version: 1,
    musicBus: { volume: clamp(volume, 0.8), muted },
    ambientBus: { volume: 0.45, muted: false },
    ambientTracks: [],
    equalizer: {
      enabled: false,
      presetId: "flat",
      bands: EQUALIZER_FREQUENCIES.map((frequencyHz) => ({ frequencyHz, gainDb: 0 }))
    },
    masterProcessing: {
      normalizationEnabled: false,
      lowVolumeCompensationEnabled: false,
      compressorEnabled: true
    },
    crossfadeSeconds: 4,
    visualizer: { mode: "cover", quality: "low" }
  };
}

export function sanitizeSoundSettings(input: unknown, fallback = defaultSoundSettings()): SoundSettings {
  if (!input || typeof input !== "object" || (input as { version?: unknown }).version !== 1) return structuredClone(fallback);
  const value = input as Partial<SoundSettings>;
  const seenSources = new Set<AmbientSourceId>();
  const seenIds = new Set<string>();
  const ambientTracks = Array.isArray(value.ambientTracks) ? value.ambientTracks.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const track = raw as AmbientTrackState;
    if (!sourceIds.has(track.sourceId) || typeof track.id !== "string" || !track.id || seenSources.has(track.sourceId) || seenIds.has(track.id)) return [];
    seenSources.add(track.sourceId);
    seenIds.add(track.id);
    return [{
      id: track.id.slice(0, 100),
      sourceId: track.sourceId,
      volume: clamp(track.volume, 0.45),
      pan: clamp(track.pan, 0, -1, 1),
      muted: Boolean(track.muted),
      solo: Boolean(track.solo),
      fadeInMs: Math.round(clamp(track.fadeInMs, 800, 0, 30_000)),
      fadeOutMs: Math.round(clamp(track.fadeOutMs, 800, 0, 30_000)),
      randomStart: track.randomStart !== false,
      status: "stopped" as const
    }];
  }).slice(0, 6) : [];
  const inputBands = value.equalizer?.bands;
  const validBands = Array.isArray(inputBands)
    && inputBands.length === EQUALIZER_FREQUENCIES.length
    && inputBands.every((band, index) => band?.frequencyHz === EQUALIZER_FREQUENCIES[index]);
  const presetId = ["flat", "focus", "warm", "bright", "deep", "custom"].includes(value.equalizer?.presetId ?? "")
    ? value.equalizer!.presetId
    : "flat";
  const visualizerMode = ["cover", "spectrum", "waveform", "particles", "off"].includes(value.visualizer?.mode ?? "")
    ? value.visualizer!.mode
    : fallback.visualizer.mode;
  const visualizerQuality = ["low", "medium", "high"].includes(value.visualizer?.quality ?? "")
    ? value.visualizer!.quality
    : fallback.visualizer.quality;
  return {
    version: 1,
    musicBus: {
      volume: clamp(value.musicBus?.volume, fallback.musicBus.volume),
      muted: value.musicBus?.muted ?? fallback.musicBus.muted
    },
    ambientBus: {
      volume: clamp(value.ambientBus?.volume, fallback.ambientBus.volume),
      muted: value.ambientBus?.muted ?? fallback.ambientBus.muted
    },
    ambientTracks,
    equalizer: {
      enabled: Boolean(value.equalizer?.enabled),
      presetId,
      bands: validBands
        ? inputBands.map((band, index) => ({ frequencyHz: EQUALIZER_FREQUENCIES[index], gainDb: clamp(band.gainDb, 0, -12, 12) }))
        : structuredClone(fallback.equalizer.bands)
    },
    masterProcessing: {
      normalizationEnabled: value.masterProcessing?.normalizationEnabled ?? fallback.masterProcessing.normalizationEnabled,
      lowVolumeCompensationEnabled: value.masterProcessing?.lowVolumeCompensationEnabled ?? fallback.masterProcessing.lowVolumeCompensationEnabled,
      compressorEnabled: value.masterProcessing?.compressorEnabled ?? fallback.masterProcessing.compressorEnabled
    },
    crossfadeSeconds: clamp(value.crossfadeSeconds, fallback.crossfadeSeconds, 0, 12),
    visualizer: {
      mode: visualizerMode, quality: visualizerQuality,
      ...(value.visualizer?.stage && typeof value.visualizer.stage === 'object' ? { stage: {
        composition: ['cover', 'lyrics', 'visual'].includes(value.visualizer.stage.composition) ? value.visualizer.stage.composition : 'cover',
        tone: ['sea', 'ember', 'moon'].includes(value.visualizer.stage.tone) ? value.visualizer.stage.tone : 'sea',
        cameraX: clamp(value.visualizer.stage.cameraX, 0, -8, 8),
        cameraY: clamp(value.visualizer.stage.cameraY, 0, -6, 6),
        ...(value.visualizer.stage.preferences?{preferences:normalizeStagePreferences(value.visualizer.stage.preferences)}:{})
      } } : {})
    },
    outputDeviceId: typeof value.outputDeviceId === "string" && value.outputDeviceId.length <= 500
      ? value.outputDeviceId
      : undefined
  };
}

function snapshotState(settings: SoundSettings): SoundSnapshotState {
  const serializable = JSON.parse(JSON.stringify(settings)) as SoundSettings;
  const { version: _version, outputDeviceId: _outputDeviceId, ...state } = serializable;
  state.ambientTracks = state.ambientTracks.map((track) => ({ ...track, status: "stopped", errorCode: undefined }));
  return state;
}

function readWebJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}

export const useSoundStore = defineStore("sound", {
  state: () => ({
    settings: defaultSoundSettings(),
    snapshots: [] as SoundSnapshot[],
    outputDevices: [] as OutputDeviceSummary[],
    outputSupported: false,
    initialized: false,
    persisting: false,
    errorCode: undefined as string | undefined,
    lowPerformance: false
  }),
  actions: {
    async initialize() {
      if (this.initialized) return;
      const player = usePlayerStore();
      const fallback = defaultSoundSettings(player.playback.volume, player.playback.muted);
      let saved: unknown;
      try {
        saved = window.studyRoomDesktop
          ? await window.studyRoomDesktop.readSoundSettings()
          : readWebJson(WEB_SETTINGS_KEY, undefined);
      } catch {
        this.errorCode = "SOUND_SETTINGS_READ_FAILED";
      }
      this.settings = sanitizeSoundSettings(saved, fallback);
      mixer = new AmbientMixer({
        graph: sharedAudioGraph,
        onChange: (tracks) => {
          this.settings.ambientTracks = tracks;
          if (this.initialized) this.schedulePersist();
        }
      });
      mixer.restore(this.settings.ambientTracks);
      mixer.setBus(this.settings.ambientBus);
      sharedAudioGraph.setEqualizer(this.settings.equalizer);
      sharedAudioGraph.setMasterProcessing(this.settings.masterProcessing);
      player.setVolume(this.settings.musicBus.volume);
      player.setMuted(this.settings.musicBus.muted);
      player.configureAudioEnhancements(this.settings.crossfadeSeconds, this.lowPerformance);
      try {
        this.snapshots = window.studyRoomDesktop
          ? await window.studyRoomDesktop.listSoundSnapshots()
          : readWebJson<SoundSnapshot[]>(WEB_SNAPSHOTS_KEY, []).slice(0, 20);
      } catch {
        this.snapshots = [];
        this.errorCode = "SOUND_SNAPSHOTS_READ_FAILED";
      }
      if (window.studyRoomDesktop) await this.initializeOutputDevices();
      this.initialized = true;
    },
    async initializeOutputDevices() {
      if (!sharedAudioGraph.initialize()) return;
      const context = sharedAudioGraph.audioContext();
      if (!context) return;
      outputManager?.dispose();
      outputManager = new OutputDeviceManager(context, {
        onFallback: () => {
          this.settings.outputDeviceId = "default";
          this.errorCode = "OUTPUT_DEVICE_FALLBACK";
          this.schedulePersist();
        }
      });
      this.outputSupported = outputManager.supported();
      if (!this.outputSupported) return;
      try {
        this.outputDevices = await outputManager.list();
        outputManager.watch();
        if (this.settings.outputDeviceId && this.settings.outputDeviceId !== "default") {
          await outputManager.select(this.settings.outputDeviceId);
        }
      } catch {
        this.settings.outputDeviceId = "default";
        this.errorCode = "OUTPUT_DEVICE_FALLBACK";
      }
    },
    async selectOutputDevice(deviceId: string) {
      if (!outputManager) throw new Error("OUTPUT_DEVICE_UNAVAILABLE");
      try {
        this.settings.outputDeviceId = await outputManager.select(deviceId);
        this.errorCode = undefined;
        await this.persist();
      } catch (error) {
        this.settings.outputDeviceId = "default";
        this.errorCode = error instanceof Error ? error.message : "OUTPUT_DEVICE_SWITCH_FAILED";
        await this.persist();
        throw error;
      }
    },
    async addAmbient(sourceId: AmbientSourceId) {
      if (!mixer) throw new Error("SOUND_STORE_NOT_INITIALIZED");
      const track = mixer.add(sourceId);
      await mixer.start(track.id);
      return track.id;
    },
    async toggleAmbient(trackId: string) { await mixer?.toggle(trackId); },
    stopAmbient(trackId: string) { mixer?.stop(trackId); },
    removeAmbient(trackId: string) { mixer?.remove(trackId); },
    updateAmbient(trackId: string, update: Parameters<AmbientMixer["update"]>[1]) { return mixer?.update(trackId, update); },
    setMusicBus(volume: number, muted?: boolean) {
      this.settings.musicBus = { volume: clamp(volume, this.settings.musicBus.volume), muted: muted ?? this.settings.musicBus.muted };
      const player = usePlayerStore();
      player.setVolume(this.settings.musicBus.volume);
      player.setMuted(this.settings.musicBus.muted);
      this.schedulePersist();
    },
    setAmbientBus(volume: number, muted?: boolean) {
      this.settings.ambientBus = { volume: clamp(volume, this.settings.ambientBus.volume), muted: muted ?? this.settings.ambientBus.muted };
      mixer?.setBus(this.settings.ambientBus);
      this.schedulePersist();
    },
    setEqualizer(equalizer: EqualizerState) {
      this.settings.equalizer = equalizer;
      sharedAudioGraph.setEqualizer(equalizer);
      this.schedulePersist();
    },
    setMasterProcessing(masterProcessing: MasterProcessingState) {
      this.settings.masterProcessing = masterProcessing;
      sharedAudioGraph.setMasterProcessing(masterProcessing);
      this.schedulePersist();
    },
    setCrossfade(seconds: number) {
      this.settings.crossfadeSeconds = clamp(seconds, 4, 0, 12);
      usePlayerStore().configureAudioEnhancements(this.settings.crossfadeSeconds, this.lowPerformance);
      this.schedulePersist();
    },
    setVisualizer(visualizer: VisualizerState) {
      this.settings.visualizer = visualizer;
      this.schedulePersist();
    },
    setLowPerformance(enabled: boolean) {
      this.lowPerformance = enabled;
      usePlayerStore().configureAudioEnhancements(this.settings.crossfadeSeconds, enabled);
    },
    async saveSnapshot(name: string) {
      const safeName = name.trim();
      if (!safeName || safeName.length > 60) throw new Error("SOUND_SNAPSHOT_NAME_INVALID");
      if (this.snapshots.length >= 20) throw new Error("SOUND_SNAPSHOT_LIMIT_EXCEEDED");
      const draft = { id: crypto.randomUUID(), name: safeName, state: snapshotState(this.settings) };
      const saved = window.studyRoomDesktop
        ? await window.studyRoomDesktop.saveSoundSnapshot({ snapshot: draft })
        : { ...draft, updatedAt: Date.now() };
      this.snapshots = [saved, ...this.snapshots.filter(({ id }) => id !== saved.id)].slice(0, 20);
      if (!window.studyRoomDesktop) localStorage.setItem(WEB_SNAPSHOTS_KEY, JSON.stringify(this.snapshots));
      return saved;
    },
    async renameSnapshot(snapshotId: string, name: string) {
      const current = this.snapshots.find(({ id }) => id === snapshotId);
      if (!current) throw new Error("SOUND_SNAPSHOT_NOT_FOUND");
      const safeName = name.trim();
      if (!safeName || safeName.length > 60) throw new Error("SOUND_SNAPSHOT_NAME_INVALID");
      const renamed = window.studyRoomDesktop
        ? await window.studyRoomDesktop.renameSoundSnapshot({ snapshotId, name: safeName })
        : { ...current, name: safeName, updatedAt: Date.now() };
      this.snapshots = [renamed, ...this.snapshots.filter(({ id }) => id !== snapshotId)];
      if (!window.studyRoomDesktop) localStorage.setItem(WEB_SNAPSHOTS_KEY, JSON.stringify(this.snapshots));
      return renamed;
    },
    async deleteSnapshot(snapshotId: string) {
      if (window.studyRoomDesktop) await window.studyRoomDesktop.deleteSoundSnapshot({ snapshotId });
      this.snapshots = this.snapshots.filter(({ id }) => id !== snapshotId);
      if (!window.studyRoomDesktop) localStorage.setItem(WEB_SNAPSHOTS_KEY, JSON.stringify(this.snapshots));
    },
    applySnapshot(snapshotId: string) {
      const snapshot = this.snapshots.find(({ id }) => id === snapshotId);
      if (!snapshot) throw new Error("SOUND_SNAPSHOT_NOT_FOUND");
      this.settings = sanitizeSoundSettings({ version: 1, ...snapshot.state, outputDeviceId: this.settings.outputDeviceId }, this.settings);
      mixer?.restore(this.settings.ambientTracks);
      mixer?.setBus(this.settings.ambientBus);
      sharedAudioGraph.setEqualizer(this.settings.equalizer);
      sharedAudioGraph.setMasterProcessing(this.settings.masterProcessing);
      this.setMusicBus(this.settings.musicBus.volume, this.settings.musicBus.muted);
      this.setCrossfade(this.settings.crossfadeSeconds);
      this.schedulePersist();
    },
    schedulePersist() {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = setTimeout(() => void this.persist(), 180);
    },
    async persist() {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = undefined;
      const stored = sanitizeSoundSettings(this.settings, defaultSoundSettings());
      let writer = writes.get(this);
      if (!writer) { writer = { tail: Promise.resolve(), pending: 0 }; writes.set(this, writer); }
      writer.pending++;
      this.persisting = true;
      const operation = writer.tail.then(async () => {
        if (window.studyRoomDesktop) await window.studyRoomDesktop.saveSoundSettings({ settings: JSON.parse(JSON.stringify(stored)) as SoundSettings });
        else localStorage.setItem(WEB_SETTINGS_KEY, JSON.stringify(stored));
      });
      writer.tail = operation.catch(() => undefined);
      try {
        await operation;
        this.errorCode = undefined;
      } catch {
        this.errorCode = "SOUND_SETTINGS_WRITE_FAILED";
      } finally {
        writer.pending--;
        this.persisting = writer.pending > 0;
      }
    },
    async dispose() {
      if (persistTimer) clearTimeout(persistTimer);
      persistTimer = undefined;
      outputManager?.dispose();
      outputManager = undefined;
      await mixer?.destroy();
      mixer = undefined;
      this.initialized = false;
    }
  }
});
