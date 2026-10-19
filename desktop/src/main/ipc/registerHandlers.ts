import { dialog, ipcMain, shell, type BrowserWindow } from "electron";
import {
  ELECTRON_CAPABILITIES,
  IPC_CHANNELS,
  PROVIDER_IDS,
  type AvailableLocalProfileSummary,
  type IpcChannel,
  type FileImportResult,
  type LibraryScanResult,
  type ProviderRuntimeStatus,
  type ProviderId,
  type ProviderSearchPage,
  type SoundSettings,
  type SoundSnapshot
} from "@studyroom/contracts";
import type { LocalDatabaseStore } from "../../database/database";
import type { DirectoryTokenVault } from "../../storage/directoryTokenVault";
import type { LocalLibraryImporter } from "../../audio/library/importer";
import type { DirectoryWatchManager } from "../../audio/library/directoryWatchManager";
import type { MainWindowManager } from "../windowManager";
import { IpcGuard } from "./guard";
import {
  windowCloseBehaviorSchema,
  windowCloseDecisionSchema,
  windowQuitReadySchema,
  externalUrlSchema,
  focusRecordSchema,
  focusRecordListRequestSchema,
  focusWorkspaceRequestSchema,
  focusWorkspaceSchema,
  entertainmentStateRequestSchema,
  saveEntertainmentStateRequestSchema,
  libraryScanSchema,
  libraryRootRequestSchema,
  playbackHistoryEventSchema,
  providerIdRequestSchema,
  providerConsentRequestSchema,
  providerLyricsRequestSchema,
  providerPageRequestSchema,
  providerPlaylistTracksRequestSchema,
  providerSearchRequestSchema,
  aggregatedSearchRequestSchema,
  preferredProviderOrderRequestSchema,
  providerPlaybackRequestSchema,
  radioStationListRequestSchema,
  radioStationRequestSchema,
  queueItemsSchema,
  playlistNameRequestSchema,
  playlistRequestSchema,
  playlistTrackRequestSchema,
  renamePlaylistRequestSchema,
  renameSoundSnapshotRequestSchema,
  soundSettingsSchema,
  soundSettingsRequestSchema,
  soundSnapshotIdRequestSchema,
  soundSnapshotRequestSchema,
  trackFavoriteRequestSchema,
  trackLyricOffsetSchema,
  trackRequestSchema,
  setLibraryRootWatchingSchema,
  updateActivityStateSchema,
  updaterAuthStateSchema,
  availableLocalProfileSummarySchema,
  noInputSchema
} from "./validation";
import { validateExternalUrl } from "../security/navigation";
import { scanAudioDirectory, scanAudioFile, SUPPORTED_AUDIO_EXTENSIONS } from "../../audio/library/scanner";
import { pruneArtworkCache } from "../../audio/library/metadata";
import type { ProviderCoordinator } from "../../providers/core/providerCoordinator";
import type { ProviderArtworkCache } from '../../providers/core/artworkCache';
import type { LoginWindowManager } from "../../providers/core/loginWindowManager";
import { QQDesktopAdapter } from '../../providers/adapters/qq/desktopAdapter';
import { KugouDesktopAdapter } from '../../providers/adapters/kugou/desktopAdapter';
import { selectKugouSession } from '../../providers/adapters/kugou/session';
import { selectQQSession } from '../../providers/adapters/qq/session';
import type { RadioService } from "../../providers/radio/radioService";
import type { RemoteMediaSessionRegistry } from "../../audio/protocol/remoteMediaProtocol";
import type { CredentialVault } from "../../storage/credentialVault";
import type { MetadataCacheRepository } from "../../providers/core/metadataCacheRepository";
import type { UpdateManager } from "../../updater/updateManager";
import type { LocalProfileService } from "../../profile/localProfileService";
import { NeteaseDesktopAdapter } from "../../providers/adapters/netease/desktopAdapter";

interface IpcSuccess<T> { ok: true; value: T }
interface IpcFailure { ok: false; error: { code: string; message: string } }
type IpcResult<T> = IpcSuccess<T> | IpcFailure;

interface RegisterHandlerDependencies {
  window: BrowserWindow;
  windowManager: MainWindowManager;
  database: LocalDatabaseStore;
  directories: DirectoryTokenVault;
  mediaCacheDirectory: string;
  importer: LocalLibraryImporter;
  watchers: DirectoryWatchManager;
  providers: ProviderCoordinator;
  bindProviderAccount?: (id: ProviderId) => void;
  providerArtwork?: ProviderArtworkCache;
  radio: RadioService;
  providerLogin: LoginWindowManager;
  providerMedia: RemoteMediaSessionRegistry;
  providerVault: CredentialVault;
  providerCache: MetadataCacheRepository;
  updater: UpdateManager;
  localProfile: LocalProfileService;
}

const knownErrors: Record<string, string> = {
  WINDOW_CLOSE_STALE: "关闭请求已变化，请重新操作",
  WINDOW_TRAY_UNAVAILABLE: "托盘不可用，窗口已保留",
  WINDOW_LOCAL_OPERATION_PENDING: "本机操作尚未完成，请稍后重试退出",
  CREDENTIAL_VAULT_CORRUPTED: "本机凭据存储无法读取",
  DIRECTORY_TOKEN_INVALID: "文件夹授权已过期，请重新选择",
  EXTERNAL_URL_BLOCKED: "该外部链接不在允许列表中",
  EXTERNAL_URL_INVALID: "外部链接格式无效",
  UPDATE_CODE_SIGNATURE_REQUIRED: "当前安装包没有受信任的发布签名",
  UPDATE_CODE_SIGNATURE_INVALID: "安装包签名无效或发布者不匹配，已阻止安装",
  UPDATE_LOGIN_REQUIRED: "请先登录再检查更新",
  UPDATE_NOT_AVAILABLE: "当前没有可下载的更新",
  UPDATE_NOT_DOWNLOADED: "更新尚未下载完成",
  UPDATE_REQUIRED_CANNOT_DEFER: "安全更新不能延后",
  IPC_CONCURRENCY_LIMITED: "操作过于集中，请稍后重试",
  IPC_RATE_LIMITED: "操作过于频繁，请稍后重试",
  IPC_SENDER_REJECTED: "调用来源未获授权",
  LIBRARY_SCAN_CANCELED: "本地曲库扫描已取消",
  LIBRARY_ROOT_NOT_FOUND: "找不到这个音乐文件夹",
  PLAYLIST_LIMIT_EXCEEDED: "本地播放列表已达到上限",
  PLAYLIST_NOT_FOUND: "找不到这个播放列表",
  PLAYLIST_TRACK_LIMIT_EXCEEDED: "这个播放列表的曲目已达到上限",
  QUEUE_LIMIT_EXCEEDED: "播放队列已达到上限",
  PROVIDER_DISABLED: "该第三方音乐平台尚未启用",
  PROVIDER_LOGIN_REQUIRED: "请先在平台官方窗口登录",
  PROVIDER_APP_LOGIN_REQUIRED: "请先登录墨屿账号，再登录音乐平台",
  PROVIDER_SESSION_EXPIRED: "平台登录已过期，请重新登录",
  AbortError: "操作已取消",
  PROVIDER_LOGIN_IN_PROGRESS: "已有第三方平台登录窗口打开",
  PROVIDER_LOGIN_CLEANUP_FAILED: "平台登录缓存未能清理，请重试退出",
  PROVIDER_API_CHANGED: "该平台当前不可用，已保持关闭",
  PROVIDER_UNAVAILABLE: "该平台当前不可用",
  PROVIDER_TIMEOUT: "第三方平台响应超时",
  PROVIDER_RATE_LIMITED: "第三方平台请求受限，请稍后重试",
  PROVIDER_CIRCUIT_OPEN: "第三方平台暂时熔断，请稍后重试",
  PROVIDER_RIGHTS_RESTRICTED: "当前账号无权播放此内容",
  PROVIDER_REGION_RESTRICTED: "当前内容受地区限制",
  RADIO_UNAVAILABLE: "公开电台目录尚未就绪",
  RADIO_STATION_NOT_FOUND: "找不到这个公开电台",
  RADIO_STREAM_REJECTED: "公开电台地址未通过安全校验",
  SECURE_STORAGE_UNAVAILABLE: "系统安全存储当前不可用",
  SOUND_SNAPSHOT_LIMIT_EXCEEDED: "声音快照已达到上限",
  SOUND_SNAPSHOT_NOT_FOUND: "找不到这个声音快照",
  TRACK_NOT_FOUND: "找不到这首音乐",
  TRACK_NOT_MISSING: "这首音乐不处于文件失效状态",
  ENTERTAINMENT_STATE_TOO_LARGE: "本地娱乐状态超过大小限制",
  LOCAL_PROFILE_STORAGE_SCAN_LIMIT: "本机空间统计范围超过安全上限",
  LOCAL_PROFILE_STORAGE_UNSAFE: "本机缓存目录未通过安全检查",
  UNSUPPORTED_AUDIO_FILE: "请选择受支持的音频文件"
};

function failure(error: unknown): IpcFailure {
  const raw = error instanceof Error ? (Object.hasOwn(knownErrors,error.name) ? error.name : error.message) : "UNKNOWN";
  const code = Object.hasOwn(knownErrors,raw) ? raw : "REQUEST_REJECTED";
  return { ok: false, error: { code, message: knownErrors[code] ?? "操作未完成" } };
}

function pausedSettings(settings: SoundSettings): SoundSettings {
  return {
    ...settings,
    ambientTracks: settings.ambientTracks.map((track) => ({
      ...track,
      status: "stopped",
      errorCode: undefined
    }))
  };
}

function pausedSnapshot(snapshot: Omit<SoundSnapshot, "updatedAt">): Omit<SoundSnapshot, "updatedAt"> {
  return {
    ...snapshot,
    state: {
      ...snapshot.state,
      ambientTracks: snapshot.state.ambientTracks.map((track) => ({
        ...track,
        status: "stopped",
        errorCode: undefined
      }))
    }
  };
}

export function registerIpcHandlers(dependencies: RegisterHandlerDependencies): () => void {
  const {
    window, windowManager, database, directories, mediaCacheDirectory, importer, watchers,
    providers, radio, providerLogin, providerMedia, providerVault, providerCache, updater, localProfile
  } = dependencies;
  const guard = new IpcGuard(window.webContents.id);
  const registered: IpcChannel[] = [];

  const handle = <T>(channel: IpcChannel, callback: (input: unknown) => Promise<T> | T) => {
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (event, input): Promise<IpcResult<T>> => {
      try {
        const value = await guard.invoke(channel, event, () => callback(input));
        return { ok: true, value };
      } catch (error) {
        return failure(error);
      }
    });
    registered.push(channel);
  };

  handle(IPC_CHANNELS.getCapabilities, () => ELECTRON_CAPABILITIES);
  handle<AvailableLocalProfileSummary>(IPC_CHANNELS.readLocalProfileSummary, (input) => {
    noInputSchema.parse(input);
    return availableLocalProfileSummarySchema.parse(localProfile.read());
  });
  handle(IPC_CHANNELS.selectMusicDirectory, async () => {
    const result = await dialog.showOpenDialog(window, {
      title: "选择本地音乐文件夹",
      properties: ["openDirectory"]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    return { canceled: false, directoryToken: directories.issue(result.filePaths[0]) };
  });
  handle<LibraryScanResult>(IPC_CHANNELS.scanMusicDirectory, async (input) => {
    const request = libraryScanSchema.parse(input);
    const directoryPath = directories.resolve(request.directoryToken);
    const summary = await scanAudioDirectory(directoryPath, { cacheDirectory: mediaCacheDirectory });
    const result = await importer.import(summary.files, { rootPath: summary.rootPath, reconcile: summary.complete });
    return {
      ...result,
      skipped: summary.skipped,
      failed: summary.failed + result.failed,
      metadataWarnings: summary.metadataWarnings,
      limitReached: summary.limitReached
    };
  });
  handle<FileImportResult>(IPC_CHANNELS.selectAndImportMusicFiles, async () => {
    const selected = await dialog.showOpenDialog(window, {
      title: "选择本地音乐",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "音频文件", extensions: [...SUPPORTED_AUDIO_EXTENSIONS].map((value) => value.slice(1)) }]
    });
    if (selected.canceled || !selected.filePaths.length) {
      return { canceled: true, imported: 0, addedLocations: 0, updated: 0, skipped: 0, failed: 0, missing: 0, metadataWarnings: 0, limitReached: false };
    }
    const paths = selected.filePaths.slice(0, 5_000);
    const files = [];
    let failed = 0;
    let metadataWarnings = 0;
    for (const path of paths) {
      try {
        const file = await scanAudioFile(path, mediaCacheDirectory);
        files.push(file);
        if (file.metadataWarning) metadataWarnings += 1;
      }
      catch { failed += 1; }
    }
    await pruneArtworkCache(mediaCacheDirectory);
    const result = await importer.import(files);
    return {
      canceled: false,
      ...result,
      skipped: Math.max(0, selected.filePaths.length - paths.length),
      failed: failed + result.failed,
      metadataWarnings,
      limitReached: selected.filePaths.length > paths.length || database.trackCount() >= 50_000
    };
  });
  handle(IPC_CHANNELS.listTracks, () => database.listTracks());
  handle(IPC_CHANNELS.listRecentTracks, () => database.listRecentTracks());
  handle(IPC_CHANNELS.listLibraryRoots, () => database.listLibraryRoots());
  handle(IPC_CHANNELS.setLibraryRootWatching, (input) => {
    const request = setLibraryRootWatchingSchema.parse(input);
    const root = database.getLibraryRootEntry(request.rootId);
    if (!request.enabled) {
      watchers.stop(root.id);
      return database.setLibraryRootWatching(root.id, false, "off");
    }
    const started = watchers.start(root);
    return database.setLibraryRootWatching(root.id, true, started ? "watching" : "attention");
  });
  handle<LibraryScanResult>(IPC_CHANNELS.rescanLibraryRoot, async (input) => {
    const root = database.getLibraryRootEntry(libraryRootRequestSchema.parse(input).rootId);
    const summary = await scanAudioDirectory(root.localPath, { cacheDirectory: mediaCacheDirectory });
    const result = await importer.import(summary.files, { rootPath: root.localPath, reconcile: summary.complete });
    return {
      ...result,
      skipped: summary.skipped,
      failed: summary.failed + result.failed,
      metadataWarnings: summary.metadataWarnings,
      limitReached: summary.limitReached
    };
  });
  handle(IPC_CHANNELS.listMissingTracks, () => database.listMissingTracks());
  handle(IPC_CHANNELS.getTrackLyrics, (input) => database.getTrackLyrics(trackRequestSchema.parse(input).trackId));
  handle(IPC_CHANNELS.getTrackLyricOffset, (input) => {
    const request = trackRequestSchema.parse(input);
    return { trackId: request.trackId, offsetMs: database.getTrackLyricOffset(request.trackId) };
  });
  handle(IPC_CHANNELS.saveTrackLyricOffset, (input) => {
    const request = trackLyricOffsetSchema.parse(input);
    return { trackId: request.trackId, offsetMs: database.saveTrackLyricOffset(request.trackId, request.offsetMs) };
  });
  handle(IPC_CHANNELS.listFavoriteTracks, () => database.listFavoriteTracks());
  handle(IPC_CHANNELS.setTrackFavorite, (input) => {
    const request = trackFavoriteRequestSchema.parse(input);
    return database.setTrackFavorite(request.trackId, request.favorite);
  });
  handle(IPC_CHANNELS.listPlaylists, () => database.listPlaylists());
  handle(IPC_CHANNELS.createPlaylist, (input) => database.createPlaylist(playlistNameRequestSchema.parse(input).name));
  handle(IPC_CHANNELS.renamePlaylist, (input) => {
    const request = renamePlaylistRequestSchema.parse(input);
    return database.renamePlaylist(request.playlistId, request.name);
  });
  handle(IPC_CHANNELS.deletePlaylist, (input) => database.deletePlaylist(playlistRequestSchema.parse(input).playlistId));
  handle(IPC_CHANNELS.listPlaylistItems, (input) => database.listPlaylistItems(playlistRequestSchema.parse(input).playlistId));
  handle(IPC_CHANNELS.addPlaylistTrack, (input) => {
    const request = playlistTrackRequestSchema.parse(input);
    return database.addPlaylistTrack(request.playlistId, request.trackId);
  });
  handle(IPC_CHANNELS.removePlaylistTrack, (input) => {
    const request = playlistTrackRequestSchema.parse(input);
    return database.removePlaylistTrack(request.playlistId, request.trackId);
  });
  handle(IPC_CHANNELS.relocateMissingTrack, async (input) => {
    const request = trackRequestSchema.parse(input);
    const result = await dialog.showOpenDialog(window, {
      title: "重新定位本地音乐",
      properties: ["openFile"],
      filters: [{ name: "音频文件", extensions: [...SUPPORTED_AUDIO_EXTENSIONS].map((value) => value.slice(1)) }]
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const file = await scanAudioFile(result.filePaths[0], mediaCacheDirectory);
    return { canceled: false, track: database.relocateLocalFile(request.trackId, file) };
  });
  handle(IPC_CHANNELS.replaceQueue, (input) => database.replaceQueue(queueItemsSchema.parse(input)));
  handle(IPC_CHANNELS.readQueue, () => database.readQueue());
  handle(IPC_CHANNELS.recordPlaybackEvent, (input) => database.recordPlaybackEvent(playbackHistoryEventSchema.parse(input)));
  handle(IPC_CHANNELS.readSoundSettings, () => {
    const parsed = soundSettingsSchema.safeParse(database.readSoundSettings());
    return parsed.success ? pausedSettings(parsed.data) : undefined;
  });
  handle(IPC_CHANNELS.saveSoundSettings, (input) => {
    const request = soundSettingsRequestSchema.parse(input);
    database.saveSoundSettings(pausedSettings(request.settings));
  });
  handle(IPC_CHANNELS.listSoundSnapshots, () => database.listSoundSnapshots().flatMap((snapshot) => {
    const parsed = soundSnapshotRequestSchema.safeParse({
      snapshot: { id: snapshot.id, name: snapshot.name, state: snapshot.state }
    });
    return parsed.success ? [{ ...pausedSnapshot(parsed.data.snapshot), updatedAt: snapshot.updatedAt }] : [];
  }));
  handle(IPC_CHANNELS.saveSoundSnapshot, (input) => {
    const request = soundSnapshotRequestSchema.parse(input);
    return database.saveSoundSnapshot(pausedSnapshot(request.snapshot));
  });
  handle(IPC_CHANNELS.renameSoundSnapshot, (input) => {
    const request = renameSoundSnapshotRequestSchema.parse(input);
    return database.renameSoundSnapshot(request.snapshotId, request.name);
  });
  handle(IPC_CHANNELS.deleteSoundSnapshot, (input) => database.deleteSoundSnapshot(soundSnapshotIdRequestSchema.parse(input).snapshotId));
  handle(IPC_CHANNELS.saveFocusRecord, (input) => database.saveFocusRecord(focusRecordSchema.parse(input)));
  handle(IPC_CHANNELS.listFocusRecords, (input) => database.listFocusRecords(focusRecordListRequestSchema.parse(input ?? {})));
  handle(IPC_CHANNELS.listPendingFocusRecords, () => database.listPendingFocusRecords());
  handle(IPC_CHANNELS.readFocusWorkspace, (input) => database.readFocusWorkspace(focusWorkspaceRequestSchema.parse(input).accountScope));
  handle(IPC_CHANNELS.saveFocusWorkspace, (input) => database.saveFocusWorkspace(focusWorkspaceSchema.parse(input)));
  handle(IPC_CHANNELS.readEntertainmentState, (input) => {
    const request = entertainmentStateRequestSchema.parse(input);
    const record = database.readEntertainmentState(request.toolId);
    if (!record) return undefined;
    const parsed = saveEntertainmentStateRequestSchema.safeParse({ toolId: record.toolId, state: record.state,expected:null });
    if(!parsed.success)throw new Error('ENTERTAINMENT_STATE_INVALID_PRESERVED');
    return record;
  });
  handle(IPC_CHANNELS.saveEntertainmentState, (input) => {
    const request = saveEntertainmentStateRequestSchema.parse(input);
    database.saveEntertainmentState(request.toolId, request.state, request.expected);
  });
  async function clearProviderData(providerId: ProviderId): Promise<void> {
    const results = await Promise.allSettled([
      providerLogin.closeAndClear(),
      Promise.resolve().then(() => providerVault.clear(providerId)),
      Promise.resolve().then(() => providerCache.clear(providerId)),
      dependencies.providerArtwork?.clear(providerId)
    ]);
    if (results.some(result => result.status === "rejected")) throw new Error("PROVIDER_LOGIN_CLEANUP_FAILED");
  }
  handle<ProviderRuntimeStatus[]>(IPC_CHANNELS.listProviderStatuses, async () => {
    await providers.refreshAccounts();return providers.statuses(PROVIDER_IDS);
  });
  handle(IPC_CHANNELS.openProviderLogin, async (input) => {
    const request = providerIdRequestSchema.parse(input);
    const status = providers.statuses([request.providerId])[0];
    if (!status?.enabled) throw new Error(status?.errorCode ?? "PROVIDER_DISABLED");
    await providers.withLoginAdapter(request.providerId,async(adapter,context)=>{
      if(!(adapter instanceof NeteaseDesktopAdapter)&&!(adapter instanceof QQDesktopAdapter)&&!(adapter instanceof KugouDesktopAdapter))throw new Error("PROVIDER_UNAVAILABLE");
      providerMedia.invalidateOwner(request.providerId);
      dependencies.providerArtwork?.invalidate(request.providerId);
      await providerLogin.open(request.providerId,{signal:context.signal,verify:async(session,signal)=>{
        if(adapter instanceof KugouDesktopAdapter){
          const selected=selectKugouSession(await session.cookies.get({url:'https://www.kugou.com/'}));
          signal.throwIfAborted();if(!selected)return false;
          await adapter.acceptLogin(selected,signal);return true;
        }
        if(adapter instanceof QQDesktopAdapter){
          const selected=selectQQSession(await session.cookies.get({url:'https://y.qq.com/'}));
          signal.throwIfAborted();if(!selected)return false;
          await adapter.acceptLogin(selected,signal);return true;
        }
        const cookies=await session.cookies.get({url:"https://music.163.com/"});
        signal.throwIfAborted();
        const selected:Record<string,string>={};
        for(const cookie of cookies){if(cookie.name==="MUSIC_U"||cookie.name==="__csrf")selected[cookie.name]=cookie.value;}
        if(!selected.MUSIC_U)return false;
        await adapter.acceptLogin(selected,signal);return true;
      }});
    });
    dependencies.bindProviderAccount?.(request.providerId);
  });
  handle(IPC_CHANNELS.logoutProvider, async (input) => {
    const request = providerIdRequestSchema.parse(input);
    providerMedia.invalidateOwner(request.providerId);
    await providers.logout(request.providerId, () => clearProviderData(request.providerId));
  });
  handle<ProviderSearchPage>(IPC_CHANNELS.searchProviderTracks, async (input) => {
    const request = providerSearchRequestSchema.parse(input);
    return providers.searchProviderPage(request.providerId,request.query,request.cursor,request.pageSize??30);
  });
  handle(IPC_CHANNELS.listProviderRecommendations, (input) => {
    const request = providerPageRequestSchema.parse(input);
    return providers.recommendations(request.providerId, request.cursor, request.pageSize);
  });
  handle(IPC_CHANNELS.listProviderPlaylists, (input) => {
    const request = providerPageRequestSchema.parse(input);
    return providers.playlists(request.providerId, request.cursor, request.pageSize);
  });
  handle(IPC_CHANNELS.listProviderFavorites, (input) => {
    const request = providerPageRequestSchema.parse(input);
    return providers.favorites(request.providerId, request.cursor, request.pageSize);
  });
  handle(IPC_CHANNELS.listProviderPlaylistTracks, (input) => {
    const request = providerPlaylistTracksRequestSchema.parse(input);
    return providers.playlistTracks(request.providerId, request.playlistId, request.cursor, request.pageSize);
  });
  handle(IPC_CHANNELS.getProviderLyrics, (input) => {
    const request = providerLyricsRequestSchema.parse(input);
    return providers.lyrics(request.providerId, request.trackId);
  });
  handle(IPC_CHANNELS.getProviderArtwork, (input) => {
    const request=providerLyricsRequestSchema.parse(input);
    return providers.artwork(request.providerId,request.trackId);
  });
  handle(IPC_CHANNELS.getProviderPlaylistArtwork, async (input) => {
    const request=providerPlaylistTracksRequestSchema.parse(input);
    const page=await providers.playlistTracks(request.providerId,request.playlistId,undefined,1);
    return page.items[0]?.artworkUrl;
  });
  handle(IPC_CHANNELS.searchAggregatedTracks, (input) => {
    const request = aggregatedSearchRequestSchema.parse(input);
    return providers.searchAggregated(request.query, request.providers ?? [...PROVIDER_IDS], request.pageSize);
  });
  handle(IPC_CHANNELS.prepareProviderPlayback, async (input) => {
    const request = providerPlaybackRequestSchema.parse(input);
    const queuedTrack = database.readQueue().find(item => item.track.id === request.trackId)?.track;
    const source = await providers.resolveKnownPlayback(request, queuedTrack);
    const mediaToken = providerMedia.issue({
      kind: "provider", ownerId: source.providerId, trackId: source.trackId,
      playbackSessionId: request.playbackSessionId, accountScope: source.accountScope ?? "local", url: source.url,
      expiresAt: source.expiresAt, allowedHosts: source.allowedHosts, requestHeaders: source.requestHeaders
    });
    if (request.fallbackReason && request.fromProviderId && request.fromProviderId !== source.providerId) {
      window.webContents.send(IPC_CHANNELS.sourceSwitch, {
        change: {
          trackId: request.trackId,
          fromProviderId: request.fromProviderId,
          toProviderId: source.providerId,
          reason: request.fallbackReason
        }
      });
    }
    return {
      sourceKind: "provider" as const,
      providerId: source.providerId,
      trackId: request.trackId,
      mediaToken,
      expiresAt: source.expiresAt,
      supportsRange: true
    };
  });
  handle(IPC_CHANNELS.setPreferredProviderOrder, (input) => {
    const request = preferredProviderOrderRequestSchema.parse(input);
    const order = providers.setPreferredOrder(request.providerIds);
    database.setSetting("provider-order-v1", order);
    return order;
  });
  handle(IPC_CHANNELS.setProviderConsent, async (input) => {
    const request = providerConsentRequestSchema.parse(input);
    database.setSetting("provider-risk-consent-v1", request.accepted);
    if (!request.accepted) for (const providerId of PROVIDER_IDS) providerMedia.invalidateOwner(providerId);
    await providers.setConsent(request.accepted, clearProviderData);
    return providers.statuses(PROVIDER_IDS);
  });
  handle(IPC_CHANNELS.listRadioStations, (input) => {
    return radio.list(radioStationListRequestSchema.parse(input ?? {}));
  });
  handle(IPC_CHANNELS.refreshRadioNowPlaying, (input) => {
    return radio.nowPlaying(radioStationRequestSchema.parse(input).stationId);
  });
  handle(IPC_CHANNELS.prepareRadioPlayback, (input) => {
    return radio.prepare(radioStationRequestSchema.parse(input).stationId);
  });
  handle(IPC_CHANNELS.openExternal, async (input) => {
    const url = validateExternalUrl(externalUrlSchema.parse(input));
    await shell.openExternal(url.href);
  });
  handle(IPC_CHANNELS.checkForUpdates, () => updater.check(true));
  handle(IPC_CHANNELS.downloadUpdate, () => updater.download());
  handle(IPC_CHANNELS.cancelUpdateDownload, () => updater.cancelDownload());
  handle(IPC_CHANNELS.setAutomaticUpdateChecks, (input) => {
    if (typeof input !== 'boolean') throw new Error('INVALID_UPDATE_PREFERENCE');
    return updater.setAutomaticChecks(input);
  });
  handle(IPC_CHANNELS.deferUpdate, () => updater.defer());
  handle(IPC_CHANNELS.setUpdaterAuthState, (input) => updater.setAuthState(updaterAuthStateSchema.parse(input)));
  handle(IPC_CHANNELS.setUpdaterActivityState, (input) => updater.setActivityState(updateActivityStateSchema.parse(input)));
  handle(IPC_CHANNELS.installUpdate, () => updater.install());
  handle(IPC_CHANNELS.windowMinimize, () => windowManager.minimize());
  handle(IPC_CHANNELS.windowToggleMaximize, () => windowManager.toggleMaximize());
  handle(IPC_CHANNELS.windowClose, () => windowManager.requestClose());
  handle(IPC_CHANNELS.windowState, (input) => { noInputSchema.parse(input); return windowManager.readState(); });
  handle(IPC_CHANNELS.windowCloseBehavior, (input) => windowManager.setCloseBehavior(windowCloseBehaviorSchema.parse(input)));
  handle(IPC_CHANNELS.windowCloseDecision, (input) => windowManager.resolveClose(windowCloseDecisionSchema.parse(input)));
  handle(IPC_CHANNELS.windowQuitReady, (input) => {
    const request = windowQuitReadySchema.parse(input);
    if (request.ready === true && guard.hasOtherInFlight(IPC_CHANNELS.windowQuitReady)) throw new Error("WINDOW_LOCAL_OPERATION_PENDING");
    return windowManager.completeQuit(request);
  });

  return () => {
    for (const channel of registered) ipcMain.removeHandler(channel);
  };
}
