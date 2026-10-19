export type TrackId = string;
export type QueueItemId = string;

export const PROVIDER_IDS = ["netease", "qq", "kugou"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ProviderCapability =
  | "search"
  | "recommendations"
  | "playlists"
  | "favorites"
  | "lyrics"
  | "playback";

export type ProviderCapabilityState =
  | "available"
  | "disabled"
  | "login-required"
  | "expired"
  | "cooling-down"
  | "externally-blocked";

export type ProviderAccountState =
  | "signed-out"
  | "signing-in"
  | "signed-in"
  | "expired"
  | "cooling-down"
  | "unavailable";

export type ProviderErrorCode =
  | "PROVIDER_APP_LOGIN_REQUIRED"
  | "PROVIDER_DISABLED"
  | "PROVIDER_LOGIN_REQUIRED"
  | "PROVIDER_SESSION_EXPIRED"
  | "PROVIDER_TIMEOUT"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_CIRCUIT_OPEN"
  | "PROVIDER_RIGHTS_RESTRICTED"
  | "PROVIDER_REGION_RESTRICTED"
  | "PROVIDER_API_CHANGED"
  | "PROVIDER_UNAVAILABLE";

export interface ProviderAccountSummary {
  providerId: ProviderId;
  state: ProviderAccountState;
  displayName?: string;
  avatarToken?: string;
  capabilities: ProviderCapability[];
}

export interface ProviderRuntimeStatus {
  supportsLogin?: boolean;
  providerId: ProviderId;
  enabled: boolean;
  state: ProviderAccountState;
  capabilities: ProviderCapability[];
  account?: ProviderAccountSummary;
  errorCode?: ProviderErrorCode;
  retryAt?: number;
  capabilityStatuses?: ProviderCapabilityStatus[];
}

export interface ProviderCapabilityStatus {
  capability: ProviderCapability;
  state: ProviderCapabilityState;
  errorCode?: ProviderErrorCode;
  verifiedAt?: number;
}

export type TrackSource =
  | { kind: "local"; fileToken: string }
  | { kind: "builtin"; assetId: string }
  | { kind: "provider"; providerId: ProviderId; trackId: string }
  | { kind: "radio"; stationId: string };

export interface Track {
  id: TrackId;
  title: string;
  artist: string;
  album?: string;
  durationMs?: number;
  artworkUrl?: string;
  source: TrackSource;
  providerCandidates?: ProviderTrackRef[];
  selectedProviderId?: ProviderId;
}

export interface MissingTrack {
  track: Track;
  lastSeenAt: number;
}

export interface TrackLyrics {
  trackId: TrackId;
  content: string;
  source: "embedded" | "sidecar" | "provider";
  providerId?: ProviderId;
}

export type AudioQuality = "low" | "standard" | "high" | "lossless" | "hi-res" | "unknown";
export type PlaybackRights =
  | "available"
  | "subscription-required"
  | "purchase-required"
  | "region-restricted"
  | "unavailable";

export interface SourceCandidate {
  id: string;
  source: TrackSource;
  quality: AudioQuality;
  codec?: string;
  bitrateKbps?: number;
  rights: PlaybackRights;
  isAvailable: boolean;
  expiresAt?: number;
  unavailableReason?: ProviderErrorCode;
}

export type MatchBasis = "isrc" | "metadata" | "manual" | "unmatched";
export type MatchConfidence = "exact" | "high" | "possible" | "separate";

/** Explicit catalog metadata, not an entitlement grant or a network-error classification. */
export type ProviderTrackBadge = "vip" | "purchase" | "no-source" | "region-restricted";

export interface ProviderTrackRef {
  id: string;
  providerId: ProviderId;
  trackId: string;
  title: string;
  artists: string[];
  album?: string;
  /** Renderer receives only a controlled local artwork protocol URL. */
  artworkUrl?: string;
  durationMs?: number;
  isrc?: string;
  versionTags: string[];
  quality: AudioQuality;
  rights: PlaybackRights;
  badges?: ProviderTrackBadge[];
  isAvailable: boolean;
  unavailableReason?: ProviderErrorCode;
  matchBasis?: MatchBasis;
  matchScore?: number;
}

export interface AggregatedTrack {
  id: string;
  title: string;
  artists: string[];
  album?: string;
  durationMs?: number;
  artworkToken?: string;
  matchConfidence: MatchConfidence;
  candidates: ProviderTrackRef[];
}

export interface AggregatedSearchPage {
  items: AggregatedTrack[];
  completedProviders: ProviderId[];
  failedProviders: Partial<Record<ProviderId, ProviderErrorCode>>;
}

export type FallbackReason =
  | "timeout"
  | "temporary-network"
  | "rate-limited"
  | "circuit-open"
  | "address-refresh-failed";

export interface SourceSwitchEvent {
  trackId: string;
  fromProviderId: ProviderId;
  toProviderId: ProviderId;
  reason: FallbackReason;
}

export interface ProviderPlaylistSummary {
  providerId: ProviderId;
  id: string;
  name: string;
  trackCount?: number;
  artworkToken?: string;
}

export interface ProviderSearchPage {
  providerId: ProviderId;
  items: Track[];
  nextCursor?: string;
  fromCache: boolean;
}

export interface ProviderPlaylistPage {
  providerId: ProviderId;
  items: ProviderPlaylistSummary[];
  nextCursor?: string;
  fromCache: boolean;
}

export type RadioFormat = "mp3" | "aac" | "opus" | "ogg" | "flac";

export interface RadioStation {
  id: string;
  name: string;
  category: string;
  region?: string;
  format: RadioFormat;
  bitrateKbps?: number;
  artworkToken?: string;
}

export interface RadioStationPage {
  items: RadioStation[];
  nextCursor?: string;
}

export interface RadioNowPlaying {
  stationId: string;
  title?: string;
  artist?: string;
  program?: string;
  updatedAt: number;
}

export type RadioConnectionState = "idle" | "connecting" | "playing" | "reconnecting" | "stopped" | "error";

export interface PlaybackDescriptor {
  sourceKind: "provider" | "radio";
  mediaToken: string;
  expiresAt?: number;
  supportsRange: boolean;
}

export interface ProviderPlaybackDescriptor extends PlaybackDescriptor {
  sourceKind: "provider";
  providerId: ProviderId;
  trackId: string;
}

export interface QueueItem {
  id: QueueItemId;
  track: Track;
  queuedAt: number;
}

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "error";
export type RepeatMode = "off" | "all" | "one";

export interface PlaybackState {
  status: PlaybackStatus;
  currentItemId?: QueueItemId;
  positionMs: number;
  durationMs: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  errorCode?: string;
}

export interface MixerChannelState {
  id: string;
  volume: number;
  muted: boolean;
}

export interface EqualizerBand {
  frequencyHz: number;
  gainDb: number;
}

export interface MixerState {
  masterVolume: number;
  channels: MixerChannelState[];
  equalizerEnabled: boolean;
  equalizerBands: EqualizerBand[];
}

export type AmbientSourceId =
  | "white-noise"
  | "pink-noise"
  | "brown-noise"
  | "rain"
  | "cafe"
  | "fireplace"
  | "waves";

export type AmbientTrackStatus = "stopped" | "loading" | "playing" | "error";

export interface AmbientTrackState {
  id: string;
  sourceId: AmbientSourceId;
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  fadeInMs: number;
  fadeOutMs: number;
  randomStart: boolean;
  status: AmbientTrackStatus;
  errorCode?: string;
}

export interface MusicBusState {
  volume: number;
  muted: boolean;
}

export interface AmbientBusState {
  volume: number;
  muted: boolean;
}

export type EqualizerPresetId = "flat" | "focus" | "warm" | "bright" | "deep" | "custom";

export interface EqualizerState {
  enabled: boolean;
  presetId: EqualizerPresetId;
  bands: EqualizerBand[];
}

export interface MasterProcessingState {
  normalizationEnabled: boolean;
  lowVolumeCompensationEnabled: boolean;
  compressorEnabled: boolean;
}

export type VisualizerMode = "cover" | "spectrum" | "waveform" | "particles" | "off";
export type VisualizerQuality = "low" | "medium" | "high";

export interface VisualizerState {
  mode: VisualizerMode;
  quality: VisualizerQuality;
  stage?: {
    composition: "cover" | "lyrics" | "visual";
    tone: "sea" | "ember" | "moon";
    cameraX: number;
    cameraY: number;
  };
}

export interface SoundSettings {
  version: 1;
  musicBus: MusicBusState;
  ambientBus: AmbientBusState;
  ambientTracks: AmbientTrackState[];
  equalizer: EqualizerState;
  masterProcessing: MasterProcessingState;
  crossfadeSeconds: number;
  visualizer: VisualizerState;
  outputDeviceId?: string;
}

export type SoundSnapshotState = Omit<SoundSettings, "version" | "outputDeviceId">;

export interface SoundSnapshot {
  id: string;
  name: string;
  state: SoundSnapshotState;
  updatedAt: number;
}

export interface OutputDeviceSummary {
  id: string;
  label: string;
  isDefault: boolean;
}

export interface LocalPlaylistSummary {
  id: string;
  name: string;
  trackCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface LocalPlaylistItem {
  playlistId: string;
  track: Track;
  position: number;
}
