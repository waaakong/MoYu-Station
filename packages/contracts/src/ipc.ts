import type {
  AggregatedSearchPage,
  FallbackReason,
  LocalPlaylistItem,
  LocalPlaylistSummary,
  MissingTrack,
  ProviderId,
  ProviderPlaylistPage,
  ProviderPlaybackDescriptor,
  ProviderRuntimeStatus,
  ProviderSearchPage,
  PlaybackDescriptor,
  QueueItem,
  RadioNowPlaying,
  RadioStationPage,
  SoundSettings,
  SoundSnapshot,
  SourceSwitchEvent,
  Track,
  TrackLyrics
} from "./audio";
import type { RuntimeCapabilities } from "./platform";
import type { DesktopCloudBridge } from "./cloud";
import type {
  DesktopLifecycleEvent,
  EntertainmentStateRecord,
  EntertainmentStateRequest,
  SaveEntertainmentStateRequest
} from "./entertainment";

export const IPC_CHANNELS = {
  notificationConfigure: 'notifications:configure',
  notificationShow: 'notifications:show',
  notificationDismiss: 'notifications:dismiss',
  notificationClick: 'notifications:click',
  cloudRequest: "cloud:request",
  sceneCache: "cloud:scene-cache",
  cloudStreamOpen: "cloud:stream-open",
  cloudStreamClose: "cloud:stream-close",
  cloudChatSend: "cloud:chat-send",
  cloudStreamEvent: "cloud:stream-event",
  getCapabilities: "app:get-capabilities",
  readLocalProfileSummary: "profile:read-local-summary",
  selectMusicDirectory: "files:select-music-directory",
  scanMusicDirectory: "library:scan-music-directory",
  selectAndImportMusicFiles: "library:select-and-import-music-files",
  listTracks: "library:list-tracks",
  listRecentTracks: "library:list-recent-tracks",
  listLibraryRoots: "library:list-roots",
  setLibraryRootWatching: "library:set-root-watching",
  rescanLibraryRoot: "library:rescan-root",
  listMissingTracks: "library:list-missing-tracks",
  relocateMissingTrack: "library:relocate-missing-track",
  getTrackLyrics: "library:get-track-lyrics",
  getTrackLyricOffset: "library:get-track-lyric-offset",
  saveTrackLyricOffset: "library:save-track-lyric-offset",
  listFavoriteTracks: "library:list-favorite-tracks",
  setTrackFavorite: "library:set-track-favorite",
  listPlaylists: "playlists:list",
  createPlaylist: "playlists:create",
  renamePlaylist: "playlists:rename",
  deletePlaylist: "playlists:delete",
  listPlaylistItems: "playlists:list-items",
  addPlaylistTrack: "playlists:add-track",
  removePlaylistTrack: "playlists:remove-track",
  replaceQueue: "queue:replace",
  readQueue: "queue:read",
  recordPlaybackEvent: "history:record-playback-event",
  readSoundSettings: "sound:read-settings",
  saveSoundSettings: "sound:save-settings",
  listSoundSnapshots: "sound:list-snapshots",
  saveSoundSnapshot: "sound:save-snapshot",
  renameSoundSnapshot: "sound:rename-snapshot",
  deleteSoundSnapshot: "sound:delete-snapshot",
  saveFocusRecord: "focus:save-record",
  listFocusRecords: "focus:list-records",
  listPendingFocusRecords: "focus:list-pending-records",
  readFocusWorkspace: "focus:read-workspace",
  saveFocusWorkspace: "focus:save-workspace",
  readEntertainmentState: "entertainment:read-state",
  saveEntertainmentState: "entertainment:save-state",
  desktopLifecycle: "app:desktop-lifecycle",
  listProviderStatuses: "providers:list-statuses",
  openProviderLogin: "providers:open-login",
  logoutProvider: "providers:logout",
  searchProviderTracks: "providers:search-tracks",
  listProviderRecommendations: "providers:list-recommendations",
  listProviderPlaylists: "providers:list-playlists",
  listProviderFavorites: "providers:list-favorites",
  listProviderPlaylistTracks: "providers:list-playlist-tracks",
  getProviderLyrics: "providers:get-lyrics",
  getProviderArtwork: "providers:get-artwork",
  getProviderPlaylistArtwork: "providers:get-playlist-artwork",
  searchAggregatedTracks: "providers:search-aggregated",
  prepareProviderPlayback: "providers:prepare-playback",
  setPreferredProviderOrder: "providers:set-preferred-order",
  setProviderConsent: "providers:set-consent",
  providerSearchProgress: "providers:search-progress",
  sourceSwitch: "providers:source-switch",
  providerStatusChanged: "providers:status-changed",
  listRadioStations: "radio:list-stations",
  refreshRadioNowPlaying: "radio:refresh-now-playing",
  prepareRadioPlayback: "radio:prepare-playback",
  openExternal: "shell:open-external",
  checkForUpdates: "updater:check",
  downloadUpdate: "updater:download",
  startUpdate: "updater:start",
  prepareUpdate: "updater:prepare",
  completeUpdatePreparation: "updater:prepared",
  cancelUpdateDownload: "updater:cancel-download",
  setAutomaticUpdateChecks: "updater:automatic-checks",
  deferUpdate: "updater:defer",
  setUpdaterAuthState: "updater:set-auth-state",
  setUpdaterActivityState: "updater:set-activity-state",
  updateStatusChanged: "updater:status-changed",
  installUpdate: "updater:install",
  mediaCommand: "media:command",
  desktopMusicRead: "desktop-music:read",
  desktopMusicSave: "desktop-music:save",
  desktopWheelRecording: "desktop-wheel:recording",
  desktopLyricsRecover: "desktop-music:recover-lyrics",
  desktopMusicState: "desktop-music:state",
  desktopLyricsSettingsOpen:"desktop-lyrics:open-settings",
  desktopLyricsPublish: "desktop-music:lyrics",
  desktopLyricsAction: "desktop-lyrics:action",
  desktopWheelCommand: "desktop-wheel:command",
  windowMinimize: "window:minimize",
  windowToggleMaximize: "window:toggle-maximize",
  windowClose: "window:close",
  windowState: "window:state",
  windowStateChanged: "window:state-changed",
  windowCloseBehavior: "window:close-behavior",
  windowCloseDecision: "window:close-decision",
  windowQuitReady: "window:quit-ready"
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export interface DirectorySelection {
  canceled: boolean;
  directoryToken?: string;
}

export interface AvailableLocalProfileSummary {
  status: "available";
  trackCount: number;
  queueItemCount: number;
  playlistCount: number;
  focusRecordCount: number;
  latestFocusAt?: number;
  hasEntertainmentSettings: boolean;
  storageBytes: number;
}

export interface DesktopRequiredLocalProfileSummary {
  status: "desktop-required";
}

export type LocalProfileSummary = AvailableLocalProfileSummary | DesktopRequiredLocalProfileSummary;

export interface LibraryScanRequest {
  directoryToken: string;
}

export interface LibraryScanResult {
  imported: number;
  addedLocations: number;
  updated: number;
  skipped: number;
  failed: number;
  missing: number;
  metadataWarnings: number;
  limitReached: boolean;
}

export interface FileImportResult extends LibraryScanResult {
  canceled: boolean;
}

export interface LibraryRootSummary {
  id: string;
  displayName: string;
  watchEnabled: boolean;
  watchState: "off" | "watching" | "attention";
  lastScanAt?: number;
}

export interface LibraryRootRequest { rootId: string }

export interface SetLibraryRootWatchingRequest extends LibraryRootRequest { enabled: boolean }

export interface PlaybackHistoryEvent {
  sessionId: string;
  trackId: string;
  state: "started" | "completed";
  playedAt: number;
}

export interface TrackRequest { trackId: string }

export interface TrackLyricOffset {
  trackId: string;
  offsetMs: number;
}

export interface TrackFavoriteRequest extends TrackRequest {
  favorite: boolean;
}

export interface PlaylistRequest { playlistId: string }

export interface PlaylistNameRequest { name: string }

export interface RenamePlaylistRequest extends PlaylistRequest, PlaylistNameRequest {}

export interface PlaylistTrackRequest extends PlaylistRequest, TrackRequest {}

export interface SoundSettingsRequest { settings: SoundSettings }

export interface SoundSnapshotRequest { snapshot: Omit<SoundSnapshot, "updatedAt"> }

export interface SoundSnapshotIdRequest { snapshotId: string }

export interface RenameSoundSnapshotRequest extends SoundSnapshotIdRequest { name: string }

export interface TrackRelocationResult {
  canceled: boolean;
  track?: Track;
}

export interface FocusRecordDraft {
  activitySessionId?: string;
  clientRecordId: string;
  startedAt: number;
  finishedAt?: number;
  plannedMinutes: number;
  completedMinutes: number;
  completedSeconds?: number;
  sceneCode?: string;
  timeKey?: string;
  status: "active" | "completed" | "canceled";
  syncStatus: "local" | "pending" | "synced" | "failed";
  syncPolicy?: "automatic" | "manual-only";
  accountScope?: string;
  cloudRecordId?: string | number;
  syncError?: string;
}

export interface FocusTodoItem {
  id: string;
  text: string;
  done: boolean;
  updatedAt: number;
}

export interface FocusWorkspace {
  version: 1;
  accountScope: string;
  todos: FocusTodoItem[];
  memoText: string;
  updatedAt: number;
}

export interface FocusRecordListRequest {
  syncPolicy?: "automatic" | "manual-only";
  limit?: number;
}

export interface FocusWorkspaceRequest {
  accountScope: string;
}

export interface ProviderIdRequest {
  providerId: ProviderId;
}

export interface ProviderPageRequest extends ProviderIdRequest {
  cursor?: string;
  pageSize?: number;
}

export interface ProviderSearchRequest extends ProviderPageRequest {
  query: string;
}

export interface ProviderPlaylistTracksRequest extends ProviderPageRequest {
  playlistId: string;
}

export interface ProviderLyricsRequest extends ProviderIdRequest {
  trackId: string;
}

export interface AggregatedSearchRequest {
  query: string;
  providers?: ProviderId[];
  pageSize?: number;
}

export interface ProviderPlaybackRequest extends ProviderIdRequest {
  trackId: string;
  providerTrackId: string;
  playbackSessionId: string;
  fallbackReason?: FallbackReason;
  fromProviderId?: ProviderId;
}

export interface PreferredProviderOrderRequest {
  providerIds: ProviderId[];
}

export interface ProviderConsentRequest {
  version: 1;
  accepted: boolean;
}

export interface ProviderSearchProgressEvent {
  queryId: string;
  providerId: ProviderId;
  page?: ProviderSearchPage;
  errorCode?: string;
}

export interface SourceSwitchChangedEvent {
  change: SourceSwitchEvent;
}

export interface RadioStationListRequest {
  category?: string;
  query?: string;
  cursor?: string;
  pageSize?: number;
}

export interface RadioStationRequest {
  stationId: string;
}

export interface ProviderStatusChangedEvent {
  status: ProviderRuntimeStatus;
}

export type UpdateChannel = "stable" | "beta" | "provider-experimental";

export type UpdateState =
  | "idle"
  | "disabled"
  | "unauthorized"
  | "checking"
  | "available"
  | "downloading"
  | "countdown"
  | "preparing"
  | "installing"
  | "downloaded"
  | "scheduled"
  | "required"
  | "manual-update-available"
  | "not-available"
  | "error";

export type UpdateErrorCode =
  | "UPDATE_LOGIN_REQUIRED"
  | "UPDATE_UNAUTHORIZED"
  | "UPDATE_CHANNEL_MISMATCH"
  | "UPDATE_MANIFEST_SIGNATURE_INVALID"
  | "UPDATE_MANIFEST_INVALID"
  | "UPDATE_ARTIFACT_HASH_FAILED"
  | "UPDATE_CODE_SIGNATURE_REQUIRED"
  | "UPDATE_CODE_SIGNATURE_INVALID"
  | "UPDATE_RELEASE_WITHDRAWN"
  | "UPDATE_TOKEN_EXPIRED"
  | "UPDATE_NETWORK_FAILED"
  | "UPDATE_RATE_LIMITED"
  | "UPDATE_DISK_INSUFFICIENT"
  | "UPDATE_INSTALL_FAILED"
  | "UPDATE_SAVE_UNAVAILABLE"
  | "UPDATE_NOT_AVAILABLE"
  | "UPDATE_REQUIRED_CANNOT_DEFER";

export interface UpdateStatus {
  revision?: number;
  state: UpdateState;
  currentVersion: string;
  availableVersion?: string;
  channel: UpdateChannel;
  progressPercent?: number;
  mandatory?: boolean;
  releaseNotes?: string;
  checkedAt?: number;
  deferredUntil?: number;
  errorCode?: UpdateErrorCode;
  canRetry?: boolean;
  message?: string;
  downloadPageUrl?: string;
  automaticUpdates?: boolean;
  automaticChecks?: boolean;
  installEnabled?: boolean;
  trustMode?: 'disabled' | 'trusted' | 'manifest-signed';
  oneClickEnabled?: boolean;
  updateIntent?: boolean;
  waitReasons?: Array<'focus' | 'audio' | 'drafts'>;
  countdownSeconds?: number;
  canInstall?: boolean;
  downloadSource?: 'github' | 'server';
}

export interface UpdateActivityState {
  focusActive: boolean;
  audioActive: boolean;
  draftsActive?: boolean;
}

export interface UpdaterAuthState {
  authenticated: boolean;
  accountSession?: string;
}

export interface UpdateStatusChangedEvent {
  status: UpdateStatus;
}

export interface UpdatePreparationRequest { id: string }
export interface UpdatePreparationResult { id: string; ready: boolean; rendererState?: Record<string, string> }

export type MediaCommand = "play-pause" | "next" | "previous";

export type WindowCloseBehavior = "ask" | "tray" | "quit";
export interface DesktopWindowState {
  revision: number;
  maximized: boolean;
  focused: boolean;
  closeBehavior: WindowCloseBehavior;
  trayAvailable: boolean;
  closeRequest?: { id: string; phase: "choose" | "prepare" };
  error?: string;
}
export interface WindowCloseDecision {
  id: string;
  action: "cancel" | "tray" | "quit";
  remember: boolean;
}

export interface StudyRoomDesktopBridge {
  getDesktopMusic():Promise<import('./desktopMusic').DesktopMusicState>;
  saveDesktopMusic(settings:import('./desktopMusic').DesktopMusicSettings):Promise<import('./desktopMusic').DesktopMusicState>;
  setDesktopWheelRecording(active:boolean):Promise<void>;
  resetDesktopLyricsPosition():Promise<void>;
  publishDesktopLyrics(frame:import('./desktopMusic').DesktopLyricsFrame):Promise<void>;
  onDesktopMusicState(listener:(state:import('./desktopMusic').DesktopMusicState)=>void):()=>void;
  onDesktopLyricsSettingsOpen(listener:()=>void):()=>void;
  notifications?: import('./notifications').DesktopNotificationsBridge;
  cloud?: DesktopCloudBridge;
  getCapabilities(): Promise<RuntimeCapabilities>;
  readLocalProfileSummary(): Promise<AvailableLocalProfileSummary>;
  selectMusicDirectory(): Promise<DirectorySelection>;
  scanMusicDirectory(request: LibraryScanRequest): Promise<LibraryScanResult>;
  selectAndImportMusicFiles(): Promise<FileImportResult>;
  listTracks(): Promise<Track[]>;
  listRecentTracks(): Promise<Track[]>;
  listLibraryRoots(): Promise<LibraryRootSummary[]>;
  setLibraryRootWatching(request: SetLibraryRootWatchingRequest): Promise<LibraryRootSummary>;
  rescanLibraryRoot(request: LibraryRootRequest): Promise<LibraryScanResult>;
  listMissingTracks(): Promise<MissingTrack[]>;
  relocateMissingTrack(request: TrackRequest): Promise<TrackRelocationResult>;
  getTrackLyrics(request: TrackRequest): Promise<TrackLyrics | undefined>;
  getTrackLyricOffset(request: TrackRequest): Promise<TrackLyricOffset>;
  saveTrackLyricOffset(request: TrackLyricOffset): Promise<TrackLyricOffset>;
  listFavoriteTracks(): Promise<Track[]>;
  setTrackFavorite(request: TrackFavoriteRequest): Promise<boolean>;
  listPlaylists(): Promise<LocalPlaylistSummary[]>;
  createPlaylist(request: PlaylistNameRequest): Promise<LocalPlaylistSummary>;
  renamePlaylist(request: RenamePlaylistRequest): Promise<LocalPlaylistSummary>;
  deletePlaylist(request: PlaylistRequest): Promise<void>;
  listPlaylistItems(request: PlaylistRequest): Promise<LocalPlaylistItem[]>;
  addPlaylistTrack(request: PlaylistTrackRequest): Promise<LocalPlaylistItem[]>;
  removePlaylistTrack(request: PlaylistTrackRequest): Promise<LocalPlaylistItem[]>;
  replaceQueue(items: QueueItem[]): Promise<void>;
  readQueue(): Promise<QueueItem[]>;
  recordPlaybackEvent(event: PlaybackHistoryEvent): Promise<void>;
  readSoundSettings(): Promise<SoundSettings | undefined>;
  saveSoundSettings(request: SoundSettingsRequest): Promise<void>;
  listSoundSnapshots(): Promise<SoundSnapshot[]>;
  saveSoundSnapshot(request: SoundSnapshotRequest): Promise<SoundSnapshot>;
  renameSoundSnapshot(request: RenameSoundSnapshotRequest): Promise<SoundSnapshot>;
  deleteSoundSnapshot(request: SoundSnapshotIdRequest): Promise<void>;
  saveFocusRecord(record: FocusRecordDraft): Promise<void>;
  listFocusRecords(request?: FocusRecordListRequest): Promise<FocusRecordDraft[]>;
  listPendingFocusRecords(): Promise<FocusRecordDraft[]>;
  readFocusWorkspace(request: FocusWorkspaceRequest): Promise<FocusWorkspace | undefined>;
  saveFocusWorkspace(workspace: FocusWorkspace): Promise<void>;
  readEntertainmentState(request: EntertainmentStateRequest): Promise<EntertainmentStateRecord | undefined>;
  saveEntertainmentState(request: SaveEntertainmentStateRequest): Promise<void>;
  onDesktopLifecycle(listener: (event: DesktopLifecycleEvent) => void): () => void;
  listProviderStatuses(): Promise<ProviderRuntimeStatus[]>;
  openProviderLogin(request: ProviderIdRequest): Promise<void>;
  logoutProvider(request: ProviderIdRequest): Promise<void>;
  searchProviderTracks(request: ProviderSearchRequest): Promise<ProviderSearchPage>;
  listProviderRecommendations(request: ProviderPageRequest): Promise<ProviderSearchPage>;
  listProviderPlaylists(request: ProviderPageRequest): Promise<ProviderPlaylistPage>;
  listProviderFavorites(request: ProviderPageRequest): Promise<ProviderSearchPage>;
  listProviderPlaylistTracks(request: ProviderPlaylistTracksRequest): Promise<ProviderSearchPage>;
  getProviderLyrics(request: ProviderLyricsRequest): Promise<TrackLyrics | undefined>;
  getProviderArtwork(request: ProviderLyricsRequest): Promise<string | undefined>;
  getProviderPlaylistArtwork(request: ProviderPlaylistTracksRequest): Promise<string | undefined>;
  searchAggregatedTracks(request: AggregatedSearchRequest): Promise<AggregatedSearchPage>;
  prepareProviderPlayback(request: ProviderPlaybackRequest): Promise<ProviderPlaybackDescriptor>;
  setPreferredProviderOrder(request: PreferredProviderOrderRequest): Promise<ProviderId[]>;
  setProviderConsent(request: ProviderConsentRequest): Promise<ProviderRuntimeStatus[]>;
  listRadioStations(request?: RadioStationListRequest): Promise<RadioStationPage>;
  refreshRadioNowPlaying(request: RadioStationRequest): Promise<RadioNowPlaying | undefined>;
  prepareRadioPlayback(request: RadioStationRequest): Promise<PlaybackDescriptor>;
  onProviderStatusChanged(listener: (event: ProviderStatusChangedEvent) => void): () => void;
  onProviderSearchProgress(listener: (event: ProviderSearchProgressEvent) => void): () => void;
  onSourceSwitch(listener: (event: SourceSwitchChangedEvent) => void): () => void;
  openExternal(url: string): Promise<void>;
  checkForUpdates(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateStatus>;
  startUpdate(): Promise<UpdateStatus>;
  completeUpdatePreparation(result: UpdatePreparationResult): Promise<void>;
  onUpdatePreparation(listener: (request: UpdatePreparationRequest) => void): () => void;
  cancelUpdateDownload(): Promise<UpdateStatus>;
  setAutomaticUpdateChecks(enabled: boolean): Promise<UpdateStatus>;
  deferUpdate(): Promise<UpdateStatus>;
  setUpdaterAuthState(state: UpdaterAuthState): Promise<UpdateStatus>;
  setUpdaterActivityState(state: UpdateActivityState): Promise<UpdateStatus>;
  installUpdate(): Promise<void>;
  onUpdateStatus(listener: (event: UpdateStatusChangedEvent) => void): () => void;
  onMediaCommand(listener: (command: MediaCommand) => void): () => void;
  onWheelCommand?(listener: (command: import('./desktopMusic').DesktopWheelCommand) => void): () => void;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<boolean>;
  closeWindow(): Promise<void>;
  readWindowState(): Promise<DesktopWindowState>;
  setWindowCloseBehavior(behavior: WindowCloseBehavior): Promise<DesktopWindowState>;
  resolveWindowClose(decision: WindowCloseDecision): Promise<void>;
  completeWindowQuit(request: { id: string; ready: boolean | "waiting" | "working" }): Promise<void>;
  onWindowState(listener: (state: DesktopWindowState) => void): () => void;
}
