import { contextBridge, ipcRenderer } from "electron";
import { STUDYROOM_CLOUD_ORIGIN } from "../main/security/cloudOrigin";
import type { CloudRequest, CloudResponse, CloudStreamEvent, CloudStreamKind } from "@studyroom/contracts";
import type { UpdatePreparationResult, UpdatePreparationRequest } from '@studyroom/contracts';
import {
  IPC_CHANNELS,
  type DesktopWindowState,
  type WindowCloseBehavior,
  type WindowCloseDecision,
  type AggregatedSearchPage,
  type AggregatedSearchRequest,
  type AvailableLocalProfileSummary,
  type DirectorySelection,
  type DesktopLifecycleEvent,
  type EntertainmentStateRecord,
  type EntertainmentStateRequest,
  type FocusRecordDraft,
  type FocusRecordListRequest,
  type FocusWorkspace,
  type FocusWorkspaceRequest,
  type FileImportResult,
  type LibraryRootRequest,
  type LibraryRootSummary,
  type LibraryScanRequest,
  type LibraryScanResult,
  type LocalPlaylistItem,
  type LocalPlaylistSummary,
  type MediaCommand,
  DESKTOP_WHEEL_COMMANDS,type DesktopWheelCommand,
  type MissingTrack,
  type PlaylistNameRequest,
  type PlaylistRequest,
  type PlaylistTrackRequest,
  type ProviderIdRequest,
  type ProviderConsentRequest,
  type ProviderLyricsRequest,
  type ProviderPageRequest,
  type ProviderPlaylistPage,
  type ProviderPlaylistTracksRequest,
  type ProviderPlaybackDescriptor,
  type ProviderPlaybackRequest,
  type ProviderRuntimeStatus,
  type ProviderSearchPage,
  type ProviderSearchRequest,
  type ProviderStatusChangedEvent,
  type ProviderSearchProgressEvent,
  type PlaybackHistoryEvent,
  type PlaybackDescriptor,
  type QueueItem,
  type RadioNowPlaying,
  type RadioStationListRequest,
  type RadioStationPage,
  type RadioStationRequest,
  type RenamePlaylistRequest,
  type RenameSoundSnapshotRequest,
  type RuntimeCapabilities,
  type PreferredProviderOrderRequest,
  type SetLibraryRootWatchingRequest,
  type SaveEntertainmentStateRequest,
  type SoundSettings,
  type SoundSettingsRequest,
  type SoundSnapshot,
  type SoundSnapshotIdRequest,
  type SoundSnapshotRequest,
  type StudyRoomDesktopBridge,
  type SourceSwitchChangedEvent,
  type Track,
  type TrackFavoriteRequest,
  type TrackLyricOffset,
  type TrackLyrics,
  type TrackRelocationResult,
  type TrackRequest,
  type UpdateActivityState,
  type UpdaterAuthState,
  type UpdateStatusChangedEvent,
  type UpdateStatus
} from "@studyroom/contracts";

interface IpcSuccess<T> { ok: true; value: T }
interface IpcFailure { ok: false; error: { code: string; message: string } }
type IpcResult<T> = IpcSuccess<T> | IpcFailure;

async function invoke<T>(channel: string, input?: unknown): Promise<T> {
  const result = await ipcRenderer.invoke(channel, input) as IpcResult<T>;
  if (!result.ok) {
    // contextBridge may recreate thrown errors without their custom name. Keep provider
    // result codes in the sanitized message so expiry/cancellation cannot become generic failures.
    const preserveCode = result.error.code.startsWith('PROVIDER_') || result.error.code === 'AbortError';
    const error = new Error(preserveCode ? `[${result.error.code}] ${result.error.message}` : result.error.message);
    error.name = result.error.code;
    throw error;
  }
  return result.value;
}

const mediaCommands = new Set<MediaCommand>(["play-pause", "next", "previous"]);
const providerIds = new Set(["netease", "qq", "kugou"]);
const providerStates = new Set(["signed-out", "signing-in", "signed-in", "expired", "cooling-down", "unavailable"]);

function isProviderStatusChangedEvent(value: unknown): value is ProviderStatusChangedEvent {
  if (!value || typeof value !== "object" || !("status" in value)) return false;
  const status = value.status;
  return Boolean(
    status
    && typeof status === "object"
    && "providerId" in status
    && providerIds.has(String(status.providerId))
    && "state" in status
    && providerStates.has(String(status.state))
  );
}

const bridge: StudyRoomDesktopBridge = Object.freeze({
  getDesktopMusic:()=>ipcRenderer.invoke(IPC_CHANNELS.desktopMusicRead),
  saveDesktopMusic:(settings:import('@studyroom/contracts').DesktopMusicSettings)=>ipcRenderer.invoke(IPC_CHANNELS.desktopMusicSave,settings),
  setDesktopWheelRecording:(active:boolean)=>ipcRenderer.invoke(IPC_CHANNELS.desktopWheelRecording,active),
  resetDesktopLyricsPosition:()=>ipcRenderer.invoke(IPC_CHANNELS.desktopLyricsRecover),
  publishDesktopLyrics:(frame:import('@studyroom/contracts').DesktopLyricsFrame)=>ipcRenderer.invoke(IPC_CHANNELS.desktopLyricsPublish,frame),
  onDesktopMusicState:(listener:(state:import('@studyroom/contracts').DesktopMusicState)=>void)=>{const wrapped=(_event:unknown,state:import('@studyroom/contracts').DesktopMusicState)=>listener(state);ipcRenderer.on(IPC_CHANNELS.desktopMusicState,wrapped);return ()=>ipcRenderer.removeListener(IPC_CHANNELS.desktopMusicState,wrapped);},
  onDesktopLyricsSettingsOpen:(listener:()=>void)=>{const wrapped=()=>listener();ipcRenderer.on(IPC_CHANNELS.desktopLyricsSettingsOpen,wrapped);return()=>ipcRenderer.removeListener(IPC_CHANNELS.desktopLyricsSettingsOpen,wrapped);},
  notifications: Object.freeze({
    configure: (request: import('@studyroom/contracts').NotificationContextRequest) => invoke<string | null>(IPC_CHANNELS.notificationConfigure, request),
    show: (request: import('@studyroom/contracts').MessageNotificationRequest) => invoke<import('@studyroom/contracts').MessageNotificationResult>(IPC_CHANNELS.notificationShow, request),
    dismiss: (request: import('@studyroom/contracts').MessageNotificationDismiss) => invoke<void>(IPC_CHANNELS.notificationDismiss, request),
    onClick: (listener: (value: import('@studyroom/contracts').MessageNotificationClick) => void) => {
      const receive = (_event: Electron.IpcRendererEvent, value: import('@studyroom/contracts').MessageNotificationClick) => {
        if (value && typeof value.token === 'string' && (value.peer === null || /^[1-9][0-9]{0,18}$/.test(value.peer))) listener(value);
      };
      ipcRenderer.on(IPC_CHANNELS.notificationClick, receive);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.notificationClick, receive);
    }
  }),
  cloud: Object.freeze({
    sceneCache: (request: import('@studyroom/contracts').SceneCacheRequest) => invoke<import('@studyroom/contracts').SceneCacheRecord | null>(IPC_CHANNELS.sceneCache, request),
    origin: STUDYROOM_CLOUD_ORIGIN,
    request: (request: CloudRequest) => invoke<CloudResponse>(IPC_CHANNELS.cloudRequest, request),
    openStream: (request: { id: string; kind: CloudStreamKind }) => invoke<void>(IPC_CHANNELS.cloudStreamOpen, request),
    closeStream: (id: string) => invoke<void>(IPC_CHANNELS.cloudStreamClose, id),
    sendChat: (request: { id: string; data: string }) => invoke<void>(IPC_CHANNELS.cloudChatSend, request),
    onStreamEvent: (listener: (event: CloudStreamEvent) => void) => {
      const receive = (_event: Electron.IpcRendererEvent, value: CloudStreamEvent) => {
        if (value && typeof value.id === "string" && ["open", "message", "error", "close"].includes(value.type)) listener(value);
      };
      ipcRenderer.on(IPC_CHANNELS.cloudStreamEvent, receive);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.cloudStreamEvent, receive);
    }
  }),
  getCapabilities: () => invoke<RuntimeCapabilities>(IPC_CHANNELS.getCapabilities),
  readLocalProfileSummary: () => invoke<AvailableLocalProfileSummary>(IPC_CHANNELS.readLocalProfileSummary),
  selectMusicDirectory: () => invoke<DirectorySelection>(IPC_CHANNELS.selectMusicDirectory),
  scanMusicDirectory: (request: LibraryScanRequest) => invoke<LibraryScanResult>(IPC_CHANNELS.scanMusicDirectory, request),
  selectAndImportMusicFiles: () => invoke<FileImportResult>(IPC_CHANNELS.selectAndImportMusicFiles),
  listTracks: () => invoke<Track[]>(IPC_CHANNELS.listTracks),
  listRecentTracks: () => invoke<Track[]>(IPC_CHANNELS.listRecentTracks),
  listLibraryRoots: () => invoke<LibraryRootSummary[]>(IPC_CHANNELS.listLibraryRoots),
  setLibraryRootWatching: (request: SetLibraryRootWatchingRequest) => invoke<LibraryRootSummary>(IPC_CHANNELS.setLibraryRootWatching, request),
  rescanLibraryRoot: (request: LibraryRootRequest) => invoke<LibraryScanResult>(IPC_CHANNELS.rescanLibraryRoot, request),
  listMissingTracks: () => invoke<MissingTrack[]>(IPC_CHANNELS.listMissingTracks),
  relocateMissingTrack: (request: TrackRequest) => invoke<TrackRelocationResult>(IPC_CHANNELS.relocateMissingTrack, request),
  getTrackLyrics: (request: TrackRequest) => invoke<TrackLyrics | undefined>(IPC_CHANNELS.getTrackLyrics, request),
  getTrackLyricOffset: (request: TrackRequest) => invoke<TrackLyricOffset>(IPC_CHANNELS.getTrackLyricOffset, request),
  saveTrackLyricOffset: (request: TrackLyricOffset) => invoke<TrackLyricOffset>(IPC_CHANNELS.saveTrackLyricOffset, request),
  listFavoriteTracks: () => invoke<Track[]>(IPC_CHANNELS.listFavoriteTracks),
  setTrackFavorite: (request: TrackFavoriteRequest) => invoke<boolean>(IPC_CHANNELS.setTrackFavorite, request),
  listPlaylists: () => invoke<LocalPlaylistSummary[]>(IPC_CHANNELS.listPlaylists),
  createPlaylist: (request: PlaylistNameRequest) => invoke<LocalPlaylistSummary>(IPC_CHANNELS.createPlaylist, request),
  renamePlaylist: (request: RenamePlaylistRequest) => invoke<LocalPlaylistSummary>(IPC_CHANNELS.renamePlaylist, request),
  deletePlaylist: (request: PlaylistRequest) => invoke<void>(IPC_CHANNELS.deletePlaylist, request),
  listPlaylistItems: (request: PlaylistRequest) => invoke<LocalPlaylistItem[]>(IPC_CHANNELS.listPlaylistItems, request),
  addPlaylistTrack: (request: PlaylistTrackRequest) => invoke<LocalPlaylistItem[]>(IPC_CHANNELS.addPlaylistTrack, request),
  removePlaylistTrack: (request: PlaylistTrackRequest) => invoke<LocalPlaylistItem[]>(IPC_CHANNELS.removePlaylistTrack, request),
  replaceQueue: (items: QueueItem[]) => invoke<void>(IPC_CHANNELS.replaceQueue, items),
  readQueue: () => invoke<QueueItem[]>(IPC_CHANNELS.readQueue),
  recordPlaybackEvent: (event: PlaybackHistoryEvent) => invoke<void>(IPC_CHANNELS.recordPlaybackEvent, event),
  readSoundSettings: () => invoke<SoundSettings | undefined>(IPC_CHANNELS.readSoundSettings),
  saveSoundSettings: (request: SoundSettingsRequest) => invoke<void>(IPC_CHANNELS.saveSoundSettings, request),
  listSoundSnapshots: () => invoke<SoundSnapshot[]>(IPC_CHANNELS.listSoundSnapshots),
  saveSoundSnapshot: (request: SoundSnapshotRequest) => invoke<SoundSnapshot>(IPC_CHANNELS.saveSoundSnapshot, request),
  renameSoundSnapshot: (request: RenameSoundSnapshotRequest) => invoke<SoundSnapshot>(IPC_CHANNELS.renameSoundSnapshot, request),
  deleteSoundSnapshot: (request: SoundSnapshotIdRequest) => invoke<void>(IPC_CHANNELS.deleteSoundSnapshot, request),
  saveFocusRecord: (record: FocusRecordDraft) => invoke<void>(IPC_CHANNELS.saveFocusRecord, record),
  listFocusRecords: (request: FocusRecordListRequest = {}) => invoke<FocusRecordDraft[]>(IPC_CHANNELS.listFocusRecords, request),
  listPendingFocusRecords: () => invoke<FocusRecordDraft[]>(IPC_CHANNELS.listPendingFocusRecords),
  readFocusWorkspace: (request: FocusWorkspaceRequest) => invoke<FocusWorkspace | undefined>(IPC_CHANNELS.readFocusWorkspace, request),
  saveFocusWorkspace: (workspace: FocusWorkspace) => invoke<void>(IPC_CHANNELS.saveFocusWorkspace, workspace),
  readEntertainmentState: (request: EntertainmentStateRequest) => invoke<EntertainmentStateRecord | undefined>(IPC_CHANNELS.readEntertainmentState, request),
  saveEntertainmentState: (request: SaveEntertainmentStateRequest) => invoke<void>(IPC_CHANNELS.saveEntertainmentState, request),
  onDesktopLifecycle: (listener: (event: DesktopLifecycleEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (payload && typeof payload === "object" && "type" in payload && (payload.type === "suspend" || payload.type === "resume")) {
        listener({ type: payload.type });
      }
    };
    ipcRenderer.on(IPC_CHANNELS.desktopLifecycle, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.desktopLifecycle, wrapped);
  },
  listProviderStatuses: () => invoke<ProviderRuntimeStatus[]>(IPC_CHANNELS.listProviderStatuses),
  openProviderLogin: (request: ProviderIdRequest) => invoke<void>(IPC_CHANNELS.openProviderLogin, request),
  logoutProvider: (request: ProviderIdRequest) => invoke<void>(IPC_CHANNELS.logoutProvider, request),
  searchProviderTracks: (request: ProviderSearchRequest) => invoke<ProviderSearchPage>(IPC_CHANNELS.searchProviderTracks, request),
  listProviderRecommendations: (request: ProviderPageRequest) => invoke<ProviderSearchPage>(IPC_CHANNELS.listProviderRecommendations, request),
  listProviderPlaylists: (request: ProviderPageRequest) => invoke<ProviderPlaylistPage>(IPC_CHANNELS.listProviderPlaylists, request),
  listProviderFavorites: (request: ProviderPageRequest) => invoke<ProviderSearchPage>(IPC_CHANNELS.listProviderFavorites, request),
  listProviderPlaylistTracks: (request: ProviderPlaylistTracksRequest) => invoke<ProviderSearchPage>(IPC_CHANNELS.listProviderPlaylistTracks, request),
  getProviderLyrics: (request: ProviderLyricsRequest) => invoke<TrackLyrics | undefined>(IPC_CHANNELS.getProviderLyrics, request),
  getProviderArtwork: (request: ProviderLyricsRequest) => invoke<string | undefined>(IPC_CHANNELS.getProviderArtwork, request),
  getProviderPlaylistArtwork: (request: ProviderPlaylistTracksRequest) => invoke<string | undefined>(IPC_CHANNELS.getProviderPlaylistArtwork, request),
  searchAggregatedTracks: (request: AggregatedSearchRequest) => invoke<AggregatedSearchPage>(IPC_CHANNELS.searchAggregatedTracks, request),
  prepareProviderPlayback: (request: ProviderPlaybackRequest) => invoke<ProviderPlaybackDescriptor>(IPC_CHANNELS.prepareProviderPlayback, request),
  setPreferredProviderOrder: (request: PreferredProviderOrderRequest) => invoke<PreferredProviderOrderRequest["providerIds"]>(IPC_CHANNELS.setPreferredProviderOrder, request),
  setProviderConsent: (request: ProviderConsentRequest) => invoke<ProviderRuntimeStatus[]>(IPC_CHANNELS.setProviderConsent, request),
  listRadioStations: (request: RadioStationListRequest = {}) => invoke<RadioStationPage>(IPC_CHANNELS.listRadioStations, request),
  refreshRadioNowPlaying: (request: RadioStationRequest) => invoke<RadioNowPlaying | undefined>(IPC_CHANNELS.refreshRadioNowPlaying, request),
  prepareRadioPlayback: (request: RadioStationRequest) => invoke<PlaybackDescriptor>(IPC_CHANNELS.prepareRadioPlayback, request),
  onProviderStatusChanged: (listener: (event: ProviderStatusChangedEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: unknown) => {
      if (isProviderStatusChangedEvent(payload)) listener(payload);
    };
    ipcRenderer.on(IPC_CHANNELS.providerStatusChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.providerStatusChanged, wrapped);
  },
  onProviderSearchProgress: (listener: (event: ProviderSearchProgressEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: ProviderSearchProgressEvent) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.providerSearchProgress, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.providerSearchProgress, wrapped);
  },
  onSourceSwitch: (listener: (event: SourceSwitchChangedEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: SourceSwitchChangedEvent) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.sourceSwitch, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.sourceSwitch, wrapped);
  },
  openExternal: (url: string) => invoke<void>(IPC_CHANNELS.openExternal, url),
  checkForUpdates: () => invoke<UpdateStatus>(IPC_CHANNELS.checkForUpdates),
  downloadUpdate: () => invoke<UpdateStatus>(IPC_CHANNELS.downloadUpdate),
  startUpdate: () => invoke<UpdateStatus>(IPC_CHANNELS.startUpdate),
  completeUpdatePreparation: (result: UpdatePreparationResult) => invoke<void>(IPC_CHANNELS.completeUpdatePreparation, result),
  onUpdatePreparation: (listener: (request: UpdatePreparationRequest) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, request: UpdatePreparationRequest) => listener(request);
    ipcRenderer.on(IPC_CHANNELS.prepareUpdate, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.prepareUpdate, wrapped);
  },
  cancelUpdateDownload: () => invoke<UpdateStatus>(IPC_CHANNELS.cancelUpdateDownload),
  setAutomaticUpdateChecks: (enabled: boolean) => invoke<UpdateStatus>(IPC_CHANNELS.setAutomaticUpdateChecks, enabled),
  deferUpdate: () => invoke<UpdateStatus>(IPC_CHANNELS.deferUpdate),
  setUpdaterAuthState: (state: UpdaterAuthState) => invoke<UpdateStatus>(IPC_CHANNELS.setUpdaterAuthState, state),
  setUpdaterActivityState: (state: UpdateActivityState) => invoke<UpdateStatus>(IPC_CHANNELS.setUpdaterActivityState, state),
  installUpdate: () => invoke<void>(IPC_CHANNELS.installUpdate),
  onUpdateStatus: (listener: (event: UpdateStatusChangedEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: UpdateStatusChangedEvent) => listener(payload);
    ipcRenderer.on(IPC_CHANNELS.updateStatusChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.updateStatusChanged, wrapped);
  },
  onMediaCommand: (listener: (command: MediaCommand) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, command: unknown) => {
      if (mediaCommands.has(command as MediaCommand)) listener(command as MediaCommand);
    };
    ipcRenderer.on(IPC_CHANNELS.mediaCommand, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.mediaCommand, wrapped);
  },
  onWheelCommand: (listener:(command:DesktopWheelCommand)=>void)=>{
    const wrapped=(_event:Electron.IpcRendererEvent,value:unknown)=>{if(typeof value==='string'&&(DESKTOP_WHEEL_COMMANDS as readonly string[]).includes(value))listener(value as DesktopWheelCommand);};
    ipcRenderer.on(IPC_CHANNELS.desktopWheelCommand,wrapped);return()=>ipcRenderer.removeListener(IPC_CHANNELS.desktopWheelCommand,wrapped);
  },
  minimizeWindow: () => invoke<void>(IPC_CHANNELS.windowMinimize),
  toggleMaximizeWindow: () => invoke<boolean>(IPC_CHANNELS.windowToggleMaximize),
  closeWindow: () => invoke<void>(IPC_CHANNELS.windowClose),
  readWindowState: () => invoke<DesktopWindowState>(IPC_CHANNELS.windowState),
  setWindowCloseBehavior: (behavior: WindowCloseBehavior) => invoke<DesktopWindowState>(IPC_CHANNELS.windowCloseBehavior, behavior),
  resolveWindowClose: (decision: WindowCloseDecision) => invoke<void>(IPC_CHANNELS.windowCloseDecision, decision),
  completeWindowQuit: (request: { id: string; ready: boolean | "waiting" | "working" }) => invoke<void>(IPC_CHANNELS.windowQuitReady, request),
  onWindowState: (listener: (state: DesktopWindowState) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, state: DesktopWindowState) => {
      if (state && Number.isSafeInteger(state.revision) && typeof state.maximized === "boolean"
        && typeof state.focused === "boolean" && typeof state.trayAvailable === "boolean"
        && ["ask", "tray", "quit"].includes(state.closeBehavior)) listener(state);
    };
    ipcRenderer.on(IPC_CHANNELS.windowStateChanged, wrapped);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.windowStateChanged, wrapped);
  }
});

contextBridge.exposeInMainWorld("studyRoomDesktop", bridge);
