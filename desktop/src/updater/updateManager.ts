import { net, type BrowserWindow, type Session } from "electron";
import { NsisUpdater } from "electron-updater";
import type {
  UpdateActivityState,
  UpdateChannel,
  UpdateErrorCode,
  UpdateStatus,
  UpdaterAuthState
} from "@studyroom/contracts";
import { IPC_CHANNELS } from "@studyroom/contracts";
import { requestUpdateOffer, type UpdateCheckData } from "./updateApi";
import { expectedAppId, verifySignedManifest, type ReleaseManifest } from "./updateSecurity";
import { verifyFeedResponse, verifyUpdateInfo, verifyDownloadedInstaller } from './updateArtifactBinding';
import { compareReleaseVersions, parsePublicDownloadRelease } from './manualVersionCheck';
import { canFallbackToServer, fetchUpdateFeed, isGithubFeed } from './updateTransport';
import { installUpdateNetworkGuard } from './updateNetworkGuard';
import { createHash } from 'node:crypto';
import { UpdateIntent, type UpdateTarget, type UpdateIntentView } from './updateIntent';
import { LaunchConfirmedNsisUpdater } from './launchConfirmedNsisUpdater';

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const CHECK_JITTER_MS = 15 * 60 * 1000;
const RESUME_CHECK_AGE_MS = 30 * 60 * 1000;
const DEFER_MS = 24 * 60 * 60 * 1000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 5 * 60_000] as const;

export interface UpdateManagerConfig {
  controlEnabled: boolean;
  installEnabled: boolean;
  trustMode?: 'disabled' | 'trusted' | 'manifest-signed';
  channel: UpdateChannel;
  apiBaseUrl: string;
  updateOrigin: string;
  currentVersion: string;
  publicKeys: Readonly<Record<string, string>>;
  startupCheckDelayMs?: number;
}

export interface UpdateManagerPersistence {
  readDeferUntil(): number | undefined;
  writeDeferUntil(value: number | undefined): void;
  readAutomaticChecks?(): boolean | undefined;
  writeAutomaticChecks?(enabled: boolean): void;
}

interface PreparedOffer extends UpdateCheckData {
  feedUrl: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  availableVersion: string;
  manifestJson: string;
  manifestSignature: string;
  manifestKeyId: string;
  manifest: ReleaseManifest;
}

function initialStatus(config: UpdateManagerConfig): UpdateStatus {
  return {
    state: config.controlEnabled ? "unauthorized" : "disabled",
    currentVersion: config.currentVersion,
    channel: config.channel,
    message: config.controlEnabled ? "登录后检查圈内更新。" : "启动后检查下载页是否有新版本。",
    canRetry: config.controlEnabled
  };
}

export class UpdateManager {
  private status: UpdateStatus;
  private revision = 0;
  private authenticated = false;
  private activity: UpdateActivityState = { focusActive: false, audioActive: false };
  private checkPromise?: Promise<UpdateStatus>;
  private downloadPromise?: Promise<UpdateStatus>;
  private offer?: PreparedOffer;
  private updater?: NsisUpdater;
  private pollTimer?: NodeJS.Timeout;
  private reconnectTimer?: NodeJS.Timeout;
  private socket?: WebSocket;
  private reconnectAttempt = 0;
  private lastCheckedAt = 0;
  private lastPushKey = "";
  private disposed = false;
  private generation = 0;
  private checkController?: AbortController;
  private downloadCancellation?: { cancel(): void };
  private downloaded = false;
  private bindingController?: AbortController;
  private removeNetworkGuard?: () => void;
  private cancelled = false;
  private installPromise?: Promise<void>;
  private automaticChecks: boolean;
  private installStarted = false;
  private accountSession?: string;
  private downloadedFiles?: string[];
  private prepareInstallation?: (signal: AbortSignal) => Promise<() => void>;
  private readonly intent: UpdateIntent;
  private intentView: UpdateIntentView = { phase: 'idle', waitReasons: [] };
  private intentValidationTimer?: ReturnType<typeof setTimeout>;

  /** The host must bind the shared renderer save + native consistency backup first. */
  setInstallPreparation(prepare: (signal: AbortSignal) => Promise<() => void>) { this.prepareInstallation = prepare; }
  cancelForNormalQuit(): void { if (!this.installStarted) this.intent.cancel(); }

  private intentTarget(): UpdateTarget | undefined {
    if (!this.authenticated || !this.accountSession || !this.offer) return undefined;
    return { accountSession: `${this.generation}:${this.accountSession}`, version: this.offer.availableVersion,
      manifestDigest: createHash('sha256').update(this.offer.manifestJson).digest('hex') };
  }

  async start(): Promise<UpdateStatus> {
    if (!this.config.installEnabled || !this.prepareInstallation) throw new Error('UPDATE_SAVE_UNAVAILABLE');
    if (!this.offer || !this.intentTarget()) throw new Error('UPDATE_NOT_AVAILABLE');
    this.persistence.writeDeferUntil(undefined);
    await this.intent.start();
    return this.snapshot();
  }

  private current(generation: number): boolean {
    return !this.disposed && this.authenticated && generation === this.generation;
  }

  private deferred(): number | undefined {
    const until = this.persistence.readDeferUntil();
    return until && until > Date.now() ? until : undefined;
  }

  private canInstall(): boolean {
    return !this.installStarted && this.config.installEnabled && this.current(this.generation) && this.downloaded && !!this.updater &&
      !!this.offer && Date.parse(this.offer.accessTokenExpiresAt) > Date.now() && !this.deferred() &&
      !this.activity.focusActive && !this.activity.audioActive && !this.activity.draftsActive && this.status.state !== 'checking';
  }

  private clearOffer(): void {
    this.intent?.cancel();
    this.bindingController?.abort();
    this.bindingController = undefined;
    // The library keeps its quit handler on app, not on the updater EventEmitter.
    if (this.updater) this.updater.autoInstallOnAppQuit = false;
    this.updater?.removeAllListeners();
    // A cancelled download can still emit an error after detachment.
    this.updater?.on("error", () => { /* Detached work must not crash the app or mutate the new session. */ });
    this.updater = undefined;
    this.downloadCancellation?.cancel();
    this.downloadCancellation = undefined;
    this.offer = undefined;
    this.downloaded = false;
    this.downloadedFiles = undefined;
    this.removeNetworkGuard?.();
    this.removeNetworkGuard = undefined;
  }

  private invalidateSession(): void {
    this.generation += 1;
    this.checkController?.abort();
    this.checkController = undefined;
    this.checkPromise = undefined;
    this.downloadPromise = undefined;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    this.clearOffer();
    this.closeSocket();
    this.lastPushKey = "";
    this.lastCheckedAt = 0;
    this.reconnectAttempt = 0;
  }

  constructor(
    private readonly window: BrowserWindow,
    private readonly config: UpdateManagerConfig,
    private readonly persistence: UpdateManagerPersistence,
    private readonly cloud?: { session: Session; fetcher: (url: string, init?: RequestInit) => Promise<Response> }
  ) {
    this.status = initialStatus(config);
    this.automaticChecks = persistence.readAutomaticChecks?.() !== false;
    this.intent = new UpdateIntent({
      currentTarget: () => this.intentTarget(),
      download: async signal => {
        await this.download();
        signal.throwIfAborted();
        if (!this.downloaded) throw new Error(this.status.errorCode || 'UPDATE_NOT_DOWNLOADED');
      },
      revalidate: async signal => { await this.check(true); signal.throwIfAborted(); },
      prepare: signal => {
        if (!this.prepareInstallation) throw new Error('UPDATE_SAVE_UNAVAILABLE');
        return this.prepareInstallation(signal);
      },
      verifyArtifact: async signal => {
        if (!this.offer || !this.downloadedFiles) throw new Error('UPDATE_NOT_DOWNLOADED');
        await verifyDownloadedInstaller(this.downloadedFiles, this.offer.manifest, signal);
      },
      install: async () => {
        if (!this.canInstall() || !this.updater) throw new Error('UPDATE_NOT_DOWNLOADED');
        this.installStarted = true;
        this.transition({ state: 'installing', message: '正在退出并安装更新，完成后将重新启动。', canRetry: false });
        try { this.updater.quitAndInstall(true, true); }
        catch (error) { throw nativeInstallError(error); }
      },
      changed: view => {
        this.intentView = view;
        this.scheduleIntentValidation();
        if (view.phase === 'error') this.fail(new Error(view.error || 'UPDATE_INSTALL_FAILED'));
        else if (['countdown', 'preparing'].includes(view.phase)) this.transition({ state: view.phase as 'countdown' | 'preparing',
          message: view.phase === 'countdown' ? `${view.countdownSeconds} 秒后保存并重启，可取消。` : '正在保存并备份本机数据…' });
        else if (view.phase === 'waiting') this.transition({ state: 'scheduled', message: '更新已下载，等待专注、播放和未保存草稿处理完成。' });
        else this.transition({});
      }
    });
  }

  snapshot(): UpdateStatus { return { ...this.status, revision: this.revision, canInstall: this.canInstall(),
    downloadSource: this.offer ? (isGithubFeed(this.offer.manifest, this.offer.feedUrl) ? 'github' : 'server') : undefined,
    trustMode: this.config.trustMode ?? 'disabled',
    oneClickEnabled: this.config.installEnabled && !!this.prepareInstallation,
    updateIntent: !['idle', 'error'].includes(this.intentView.phase),
    waitReasons: this.intentView.waitReasons, countdownSeconds: this.intentView.countdownSeconds,
    automaticUpdates: this.config.controlEnabled, automaticChecks: this.automaticChecks, installEnabled: this.config.installEnabled }; }

  setAutomaticChecks(enabled: boolean): UpdateStatus {
    this.persistence.writeAutomaticChecks?.(enabled);
    this.automaticChecks = enabled;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    if (!enabled) this.closeSocket();
    else if (this.authenticated && this.config.controlEnabled) { this.connectSocket(); this.scheduleCheckIn(10_000); }
    return this.transition({});
  }

  async setAuthState(input: UpdaterAuthState): Promise<UpdateStatus> {
    if (this.disposed) return this.snapshot();
    if (input.accountSession !== this.accountSession) this.invalidateSession();
    this.accountSession = input.accountSession;
    this.authenticated = input.authenticated;
    if (!this.authenticated) {
      this.invalidateSession();
      this.persistence.writeDeferUntil(undefined);
      if (!this.config.controlEnabled) return this.check();
      return this.transition({
        state: this.config.controlEnabled ? "unauthorized" : "disabled",
        message: this.config.controlEnabled ? "登录后检查圈内更新。" : "私有更新控制面尚未启用。",
        availableVersion: undefined,
        releaseNotes: undefined,
        progressPercent: undefined,
        deferredUntil: undefined,
        errorCode: undefined,
        mandatory: false,
        canRetry: this.config.controlEnabled
      });
    }
    if (!this.config.controlEnabled) return this.check();
    if (!this.automaticChecks) return this.transition({ state: 'idle', message: '自动检查已关闭，可手动检查更新。', canRetry: true });
    this.connectSocket();
    if (!this.lastCheckedAt && this.config.startupCheckDelayMs) {
      this.scheduleCheckIn(this.config.startupCheckDelayMs);
      return this.transition({ state: 'idle', message: '登录完成，将在启动准备结束后检查更新。', canRetry: true });
    }
    this.scheduleNextCheck();
    return this.check();
  }

  setActivityState(input: UpdateActivityState): UpdateStatus {
    if (this.disposed) return this.snapshot();
    this.activity = { focusActive: input.focusActive, audioActive: input.audioActive, draftsActive: input.draftsActive };
    this.intent.setBusy({ focus: input.focusActive, audio: input.audioActive, drafts: Boolean(input.draftsActive) });
    if (this.snapshot().updateIntent) return this.snapshot();
    if (this.status.state === "downloaded" && (this.activity.focusActive || this.activity.audioActive)) {
      return this.transition({ state: "scheduled", message: "更新已下载，专注和播放结束后可安装。" });
    }
    if (this.downloaded && this.status.state === "scheduled" && !this.activity.focusActive && !this.activity.audioActive && !this.deferred()) {
      return this.transition({ state: "downloaded", message: "更新已下载，点击安装后保存本机数据并重启。" });
    }
    return this.snapshot();
  }

  check(force = false): Promise<UpdateStatus> {
    if (this.disposed || this.installStarted) return Promise.resolve(this.snapshot());
    if (this.checkPromise) return this.checkPromise;
    const pending = this.performCheck(force).finally(() => {
      if (this.checkPromise === pending) {
        this.checkPromise = undefined;
        // A transient failed check must not permanently stop periodic checking.
        if (!this.pollTimer && this.config.controlEnabled) this.scheduleNextCheck();
      }
    });
    this.checkPromise = pending;
    return pending;
  }

  download(): Promise<UpdateStatus> {
    if (this.disposed) return Promise.resolve(this.snapshot());
    if (this.downloadPromise) return this.downloadPromise;
    const generation = this.generation;
    const pending = this.performDownload().catch(error => this.current(generation) ? this.fail(error) : this.snapshot())
      .finally(() => { if (this.downloadPromise === pending) this.downloadPromise = undefined; });
    this.downloadPromise = pending;
    return pending;
  }

  cancelDownload(): UpdateStatus {
    if (this.status.state !== 'downloading' && !this.snapshot().updateIntent) return this.snapshot();
    this.cancelled = true;
    this.clearOffer();
    this.downloadPromise = undefined;
    return this.transition({ state: 'idle', progressPercent: undefined, availableVersion: undefined,
      message: '已取消下载，当前版本可继续使用。重新检查后可重试。', canRetry: true, errorCode: undefined });
  }

  private async performDownload(): Promise<UpdateStatus> {
    if (!this.config.installEnabled) {
      return this.transition({
        state: "error",
        errorCode: "UPDATE_CODE_SIGNATURE_REQUIRED",
        message: "当前安装包没有受信任的发布签名，下载与安装已被安全门禁阻止。",
        canRetry: false
      });
    }
    if (!this.authenticated) throw new Error("UPDATE_LOGIN_REQUIRED");
    const generation = this.generation;
    this.cancelled = false;
    if (!this.offer || Date.parse(this.offer.accessTokenExpiresAt) <= Date.now() + 30_000) await this.check(true);
    if (!this.current(generation)) return this.snapshot();
    if (!this.offer || !this.updater) throw new Error("UPDATE_NOT_AVAILABLE");
    let updater = this.updater;
    const offer = this.offer;
    const controller = new AbortController();
    this.bindingController = controller;
    this.downloaded = false;
    this.transition({ state: "downloading", progressPercent: 0, message: "正在安全下载更新。", canRetry: false });
    try {
      {
        let response: Response;
        try {
          response = await fetchUpdateFeed((url, init) => net.fetch(url, init), offer.manifest, offer.feedUrl, offer.accessToken,
            AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]));
          if (!response.ok) throw new Error(`UPDATE_HTTP_${response.status}`);
        } catch (error) {
          if (!this.current(generation) || this.cancelled || controller.signal.aborted ||
              !isGithubFeed(offer.manifest, offer.feedUrl) || !canFallbackToServer(error)) throw error;
          // Same signed bytes only. No fallback after a manifest, hash or certificate failure.
          updater.removeAllListeners(); updater.on('error', () => {});
          this.removeNetworkGuard?.();
          offer.feedUrl = new URL(`/private-updates/releases/${offer.manifest.artifactKey}/`, this.config.updateOrigin).href;
          this.configureUpdater(offer);
          updater = this.updater!;
          this.transition({ message: 'GitHub 暂时不可达，正在使用同版本的受保护服务器副本。' });
          response = await fetchUpdateFeed((url, init) => net.fetch(url, init), offer.manifest, offer.feedUrl, offer.accessToken,
            AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]));
        }
        await verifyFeedResponse(response, offer.manifest, controller.signal);
      }
      if (!this.current(generation) || updater !== this.updater || this.cancelled) return this.snapshot();
      const checked = await updater.checkForUpdates();
      if (!this.current(generation) || updater !== this.updater) {
        checked?.cancellationToken?.cancel();
        return this.snapshot();
      }
      if (!checked) throw new Error("UPDATE_NOT_AVAILABLE");
      this.downloadCancellation = checked.cancellationToken;
      verifyUpdateInfo(checked.updateInfo, offer.manifest, offer.feedUrl);
      const files = await updater.downloadUpdate(checked.cancellationToken);
      if (!this.current(generation) || updater !== this.updater) return this.snapshot();
      await verifyDownloadedInstaller(files, offer.manifest, controller.signal);
      if (!this.current(generation) || updater !== this.updater) return this.snapshot();
      // Library events alone must never arm installation before our independent binding checks.
      this.downloaded = true;
      this.downloadedFiles = [...files];
      const deferredUntil = this.deferred(), busy = this.activity.focusActive || this.activity.audioActive;
      return this.transition({state: busy || deferredUntil ? 'scheduled' : 'downloaded', deferredUntil,
        progressPercent: 100, canRetry: true, message: busy ? '更新已下载，专注和播放结束后可安装。' : '更新已下载，点击安装后保存本机数据并重启。'});
    } catch (error) {
      if (!this.current(generation) || updater !== this.updater) return this.snapshot();
      if (!this.cancelled && !controller.signal.aborted && isGithubFeed(offer.manifest, offer.feedUrl) && canFallbackToServer(error)) {
        this.downloadCancellation?.cancel(); this.downloadCancellation = undefined;
        updater.removeAllListeners(); updater.on('error', () => {});
        this.removeNetworkGuard?.();
        offer.feedUrl = new URL(`/private-updates/releases/${offer.manifest.artifactKey}/`, this.config.updateOrigin).href;
        this.configureUpdater(offer);
        return await this.performDownload();
      }
      return this.fail(error);
    } finally {
      if (this.bindingController === controller) this.bindingController = undefined;
    }
  }

  defer(): UpdateStatus {
    if (this.disposed || !this.authenticated) return this.snapshot();
    if (this.status.mandatory) throw new Error("UPDATE_REQUIRED_CANNOT_DEFER");
    this.intent.cancel();
    const deferredUntil = Date.now() + DEFER_MS;
    this.persistence.writeDeferUntil(deferredUntil);
    this.scheduleCheckIn(DEFER_MS);
    return this.transition({ state: "scheduled", deferredUntil, message: "已延后 24 小时。", canRetry: true });
  }

  install(): Promise<void> {
    if (this.installStarted) return Promise.resolve();
    if (this.installPromise) return this.installPromise;
    const pending = this.performInstall().finally(() => { if (this.installPromise === pending) this.installPromise = undefined; });
    this.installPromise = pending;
    return pending;
  }

  private async performInstall(): Promise<void> {
    if (this.config.trustMode === 'manifest-signed') throw new Error('UPDATE_SAVE_UNAVAILABLE');
    if (!this.config.installEnabled) throw new Error("UPDATE_CODE_SIGNATURE_REQUIRED");
    if (this.disposed || !this.authenticated) throw new Error("UPDATE_LOGIN_REQUIRED");
    if (!this.downloaded || !this.updater || !this.offer) throw new Error("UPDATE_NOT_DOWNLOADED");
    if (this.activity.focusActive || this.activity.audioActive) {
      this.transition({ state: "scheduled", message: "专注或播放结束后再安装更新。" });
      return;
    }
    // Revalidate authorization, rollout and withdrawal immediately before installation.
    const before = this.offer.manifestJson, generation = this.generation;
    await this.check(true);
    if (!this.current(generation) || this.offer?.manifestJson !== before || !this.canInstall()) throw new Error("UPDATE_NOT_DOWNLOADED");
    const updater = this.updater!;
    this.installStarted = true;
    this.transition({ state: 'installing', message: '正在退出并安装更新，完成后将重新启动。', canRetry: false });
    // Keep the error listener alive until app's actual will-quit; spawning NSIS can still fail.
    try { updater.quitAndInstall(true, true); }
    catch (error) { const failure = nativeInstallError(error); this.fail(failure); throw failure; }
  }

  handleResume(): void {
    if (this.automaticChecks && (!this.config.controlEnabled || this.authenticated) && Date.now() - this.lastCheckedAt > RESUME_CHECK_AGE_MS) void this.check();
  }

  dispose(installOnNormalQuit = false): void {
    if (this.disposed) return;
    // Ordinary quitting never silently installs. Installation is an explicit, revalidated action.
    void installOnNormalQuit;
    this.disposed = true;
    this.intent.dispose();
    this.invalidateSession();
  }

  private async performCheck(force: boolean): Promise<UpdateStatus> {
    if (!this.config.controlEnabled) return this.performManualCheck();
    if (!this.authenticated) return this.transition({ state: "unauthorized", message: "登录后检查圈内更新。", canRetry: true });
    const generation = this.generation;
    const deferUntil = this.deferred();
    if (!force && deferUntil && deferUntil > Date.now()) {
      this.scheduleCheckIn(deferUntil - Date.now());
      return this.transition({ state: "scheduled", deferredUntil: deferUntil, message: "更新检查已延后。", canRetry: true });
    }
    this.transition({ state: "checking", message: "正在检查圈内更新。", canRetry: false, errorCode: undefined });
    const controller = new AbortController();
    this.checkController = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await requestUpdateOffer({
        apiBaseUrl: this.config.apiBaseUrl,
        allowedApiOrigin: this.config.apiBaseUrl,
        currentVersion: this.config.currentVersion,
        channel: this.config.channel,
        signal: controller.signal,
        fetcher: (input, init) => this.cloud ? this.cloud.fetcher(String(input), init) : net.fetch(String(input), init) as unknown as Promise<Response>
      });
      if (!this.current(generation)) return this.snapshot();
      this.lastCheckedAt = Date.now();
      this.scheduleNextCheck();
      if (response.status === "disabled" || response.status === "unauthorized" || response.status === "not-available") {
        this.clearOffer();
        return this.transition({ state: response.status, message: response.message, checkedAt: this.lastCheckedAt,
          availableVersion: undefined, releaseNotes: undefined, progressPercent: undefined, mandatory: false,
          deferredUntil: undefined, downloadPageUrl: undefined, canRetry: true });
      }
      let offer = this.prepareOffer(response);
      const sameOffer = !!this.updater && this.offer?.manifestJson === offer.manifestJson;
      if (sameOffer) {
        // Keep a verified fallback download/cache and refresh the grant captured by its network guard.
        offer = Object.assign(this.offer!, offer, { feedUrl: this.offer!.feedUrl });
      }
      if (!sameOffer) this.clearOffer();
      this.offer = offer;
      const mandatory = response.status === "required" || response.mandatory;
      const deferredUntil = mandatory ? undefined : this.deferred();
      if (!deferredUntil) this.persistence.writeDeferUntil(undefined);
      if (this.config.installEnabled) {
        if (sameOffer) {
          if (!isGithubFeed(offer.manifest, offer.feedUrl)) this.updater!.addAuthHeader(`Bearer ${offer.accessToken}`);
        } else this.configureUpdater(offer);
      }
      if (deferredUntil) this.scheduleCheckIn(deferredUntil - Date.now());
      const busy = this.activity.focusActive || this.activity.audioActive || this.activity.draftsActive;
      return this.transition({
        state: this.intentView.phase === 'countdown' ? 'countdown' : this.intentView.phase === 'preparing' ? 'preparing'
          : deferredUntil ? "scheduled" : this.downloaded ? (busy ? "scheduled" : "downloaded") : sameOffer && this.downloadPromise ? "downloading" : mandatory ? "required" : "available",
        availableVersion: offer.availableVersion,
        mandatory,
        releaseNotes: offer.releaseNotes ?? undefined,
        checkedAt: this.lastCheckedAt,
        deferredUntil,
        progressPercent: this.downloaded ? 100 : sameOffer && this.downloadPromise ? this.status.progressPercent : undefined,
        message: response.message,
        canRetry: true,
        downloadPageUrl: this.config.installEnabled ? undefined : new URL('/download', this.config.updateOrigin).href,
        errorCode: this.config.installEnabled ? undefined : "UPDATE_CODE_SIGNATURE_REQUIRED"
      });
    } catch (error) {
      if (!this.current(generation)) return this.snapshot();
      return this.fail(error);
    } finally {
      clearTimeout(timeout);
      if (this.checkController === controller) this.checkController = undefined;
    }
  }

  private async performManualCheck(): Promise<UpdateStatus> {
    const generation = this.generation;
    const current = () => !this.disposed && generation === this.generation;
    this.transition({ state: "checking", message: "正在检查下载页版本…", canRetry: false, errorCode: undefined });
    const controller = new AbortController();
    this.checkController = controller;
    const timeout = setTimeout(() => controller.abort(), 8_000);
    try {
      // The public status endpoint reveals only the same version/hash metadata shown on /download.
      // Do not send the logged-in user's cookies or follow redirects.
      const endpoint = new URL("/api/download/status", this.config.updateOrigin);
      const response = await net.fetch(endpoint.href, {
        method: "GET", cache: "no-store", credentials: "omit", redirect: "error",
        headers: { Accept: "application/json" }, signal: controller.signal
      });
      if (!response.ok) throw new Error(`UPDATE_API_HTTP_${response.status}`);
      const envelope: unknown = await response.json();
      if (!envelope || typeof envelope !== "object" || !("release" in envelope)) throw new Error("UPDATE_RELEASE_INVALID");
      const release = parsePublicDownloadRelease((envelope as { release: unknown }).release);
      if (!current()) return this.snapshot();
      this.lastCheckedAt = Date.now();
      const updateAvailable = compareReleaseVersions(release.version, this.config.currentVersion) > 0;
      return this.transition({
        state: updateAvailable ? "manual-update-available" : "not-available",
        availableVersion: updateAvailable ? release.version : undefined,
        releaseNotes: undefined,
        downloadPageUrl: updateAvailable ? new URL("/download", this.config.updateOrigin).href : undefined,
        checkedAt: this.lastCheckedAt,
        mandatory: false,
        progressPercent: undefined,
        deferredUntil: undefined,
        errorCode: undefined,
        canRetry: true,
        message: updateAvailable
          ? `发现新版本 ${release.version}。请前往下载页手动下载并安装；客户端不会自动下载或安装。`
          : "当前已是下载页提供的最新版本。"
      });
    } catch (error) {
      if (!current()) return this.snapshot();
      return this.fail(error);
    } finally {
      clearTimeout(timeout);
      if (this.checkController === controller) this.checkController = undefined;
    }
  }

  private prepareOffer(response: UpdateCheckData): PreparedOffer {
    if (!response.feedUrl || !response.accessToken || !response.accessTokenExpiresAt || !response.availableVersion ||
        !response.manifestJson || !response.manifestSignature || !response.manifestKeyId) {
      throw new Error("UPDATE_OFFER_INCOMPLETE");
    }
    if (!Number.isFinite(Date.parse(response.accessTokenExpiresAt)) || Date.parse(response.accessTokenExpiresAt) <= Date.now()) {
      throw new Error("UPDATE_TOKEN_EXPIRED");
    }
    if (compareReleaseVersions(response.availableVersion, this.config.currentVersion) <= 0) throw new Error('UPDATE_MANIFEST_DOWNGRADE_BLOCKED');
    const manifest = verifySignedManifest(
      { manifestJson: response.manifestJson, signature: response.manifestSignature, keyId: response.manifestKeyId },
      this.config.publicKeys,
      {
        channel: this.config.channel,
        version: response.availableVersion,
        appId: expectedAppId(this.config.channel),
        feedUrl: response.feedUrl,
        updateOrigin: this.config.updateOrigin
      }
    );
    return { ...response, manifest } as PreparedOffer;
  }

  private configureUpdater(offer: PreparedOffer): void {
    // Each account channel already has an isolated, versioned feed directory;
    // keep the Generic provider metadata filename at electron-builder's latest.yml default.
    const Updater = this.config.trustMode === 'manifest-signed' ? LaunchConfirmedNsisUpdater : NsisUpdater;
    const updater = new Updater({ provider: "generic", url: offer.feedUrl });
    updater.autoDownload = false;
    // Only the application's normal-quit hook may install, after its data is saved.
    updater.autoInstallOnAppQuit = false;
    updater.autoRunAppAfterInstall = true;
    updater.allowDowngrade = false;
    updater.allowPrerelease = offer.availableVersion.includes('-');
    // A signed full installer is small enough to prefer a predictable, pinned download.
    // Avoid fetching the previous release's blockmap outside the authorized release directory.
    updater.disableDifferentialDownload = true;
    updater.disableWebInstaller = true;
    if (!isGithubFeed(offer.manifest, offer.feedUrl)) updater.addAuthHeader(`Bearer ${offer.accessToken}`);
    // electron-updater uses a separate non-persistent session, never the cloud session.
    // Guard both metadata requests and the installer's redirects (not just our preflight).
    const webRequest = updater.netSession?.webRequest;
    if (webRequest) {
      this.removeNetworkGuard = installUpdateNetworkGuard(webRequest, offer.manifest, offer.feedUrl, () => offer.accessToken);
    }
    updater.logger = null;
    const generation = this.generation;
    const current = () => this.current(generation) && this.updater === updater;
    updater.on("download-progress", (progress) => {
      if (!current()) return;
      this.transition({ state: "downloading", progressPercent: Math.max(0, Math.min(100, progress.percent)), message: "正在安全下载更新。" });
    });
    // Awaited download errors are handled in performDownload, including bounded fallback.
    updater.on("error", (error) => { if (current() && this.status.state !== 'downloading') this.fail(this.installStarted ? nativeInstallError(error) : error); });
    this.updater = updater;
  }

  private transition(patch: Partial<UpdateStatus>): UpdateStatus {
    if (this.disposed) return this.snapshot();
    this.revision += 1;
    this.status = {
      ...this.status,
      ...patch,
      currentVersion: this.config.currentVersion,
      channel: this.config.channel
    };
    if (!this.window.isDestroyed()) this.window.webContents.send(IPC_CHANNELS.updateStatusChanged, { status: this.snapshot() });
    return this.snapshot();
  }

  private fail(error: unknown): UpdateStatus {
    this.installStarted = false;
    this.clearOffer();
    const code = safeUpdateErrorCode(error);
    const messages: Partial<Record<UpdateErrorCode, string>> = {
      UPDATE_RATE_LIMITED: '更新服务暂时限流，请稍后重试，不要连续点击。',
      UPDATE_NETWORK_FAILED: '更新连接中断或响应未完整接收，已取消本次安装。请检查网络后重新检查更新，当前版本仍可继续使用。',
      UPDATE_CODE_SIGNATURE_INVALID: '安装包签名无效或发布者不匹配，已阻止安装。',
      UPDATE_ARTIFACT_HASH_FAILED: '更新文件与签名清单不一致，已阻止安装。',
      UPDATE_INSTALL_FAILED: '安装程序未能启动，当前版本仍可使用。请检查系统权限、防护软件及安装目录后重试。',
      UPDATE_SAVE_UNAVAILABLE: '安装前本机保存与备份尚未就绪，已取消安装，当前版本可继续使用。'
    };
    const unauthorized = code === "UPDATE_LOGIN_REQUIRED";
    if (unauthorized) {
      this.authenticated = false;
      this.invalidateSession();
    }
    return this.transition({
      state: unauthorized ? "unauthorized" : "error",
      errorCode: code,
      availableVersion: undefined, releaseNotes: undefined, progressPercent: undefined, mandatory: false,
      message: unauthorized ? "登录状态已失效，请重新登录。" : messages[code] ?? "更新检查或下载失败，当前版本仍可继续使用。",
      canRetry: !["UPDATE_CODE_SIGNATURE_REQUIRED", "UPDATE_CODE_SIGNATURE_INVALID", "UPDATE_MANIFEST_SIGNATURE_INVALID", "UPDATE_MANIFEST_INVALID", "UPDATE_CHANNEL_MISMATCH"].includes(code)
    });
  }

  private scheduleNextCheck(): void {
    const jitter = Math.floor((Math.random() * 2 - 1) * CHECK_JITTER_MS);
    this.scheduleCheckIn(CHECK_INTERVAL_MS + jitter);
  }

  /** Discovery preferences must not disable validation of an already authorized install. */
  private scheduleIntentValidation(): void {
    if (this.disposed || !this.authenticated || !['downloading', 'waiting', 'countdown'].includes(this.intentView.phase)) {
      if (this.intentValidationTimer) clearTimeout(this.intentValidationTimer);
      this.intentValidationTimer = undefined;
      return;
    }
    // Frequent playback/draft activity reports must not postpone this deadline.
    if (this.intentValidationTimer) return;
    this.intentValidationTimer = setTimeout(() => {
      this.intentValidationTimer = undefined;
      void this.check(true).finally(() => this.scheduleIntentValidation());
    }, 15_000);
  }

  private scheduleCheckIn(delay: number): void {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (!this.authenticated || this.disposed || !this.automaticChecks) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = undefined;
      void this.check(true);
    }, Math.max(1_000, delay));
  }

  private connectSocket(): void {
    if (this.socket || !this.authenticated || this.disposed || !this.automaticChecks) return;
    const endpoint = new URL(this.config.apiBaseUrl);
    endpoint.protocol = "wss:";
    endpoint.pathname = "/ws/client-updates";
    endpoint.search = "";
    try {
      const generation = this.generation;
      const socket = new net.WebSocket(endpoint.href, this.cloud ? { session: this.cloud.session, useSessionCookies: true } : undefined) as unknown as WebSocket;
      this.socket = socket;
      const current = () => this.current(generation) && this.socket === socket;
      socket.addEventListener("open", () => {
        if (!current()) return;
        this.reconnectAttempt = 0;
        this.lastPushKey = '';
        // A policy change may have happened while this socket was disconnected.
        void this.check(true);
      });
      socket.addEventListener("message", (event) => {
        if (!current()) return;
        try {
          const envelope = JSON.parse(String(event.data));
          const pushChannel = String(envelope?.payload?.channel || "");
          const pushKey = `${String(envelope?.type)}:${pushChannel}:${String(envelope?.payload?.releaseId || "")}:${String(envelope?.payload?.policyVersion || "")}`;
          if (["CLIENT_UPDATE_AVAILABLE", "CLIENT_UPDATE_POLICY_CHANGED"].includes(envelope?.type) && pushChannel === this.config.channel && pushKey !== this.lastPushKey) {
            this.lastPushKey = pushKey;
            void this.check(true);
          }
        } catch { /* Ignore malformed push messages; polling remains authoritative. */ }
      });
      socket.addEventListener("close", () => { if (current()) { this.socket = undefined; this.scheduleReconnect(); } });
      socket.addEventListener("error", () => socket.close());
    } catch {
      this.socket = undefined;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.authenticated || this.disposed || this.reconnectTimer || !this.automaticChecks) return;
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)]!;
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connectSocket();
    }, delay);
  }

  private closeSocket(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const socket = this.socket;
    this.socket = undefined;
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  }
}

function nativeInstallError(error: unknown): Error {
  const code = safeUpdateErrorCode(error);
  // A native launch failure is not a download failure. Keep more specific
  // signature, storage and authorization errors rather than hiding their cause.
  return new Error(code === 'UPDATE_NETWORK_FAILED' ? 'UPDATE_INSTALL_FAILED' : code);
}

export function safeUpdateErrorCode(error: unknown): UpdateErrorCode {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'UPDATE_UNKNOWN_ERROR';
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  // Structured upstream codes take priority over certificate JSON containing SHA-256 etc.
  if (code === 'ERR_UPDATER_INVALID_SIGNATURE' || /UPDATE_CODE_SIGNATURE_INVALID|not signed by the application owner|incorrect certificate/i.test(raw)) return 'UPDATE_CODE_SIGNATURE_INVALID';
  if (raw === "UPDATE_LOGIN_REQUIRED") return raw;
  if (raw === "UPDATE_CODE_SIGNATURE_REQUIRED") return raw;
  if (raw === "UPDATE_NOT_AVAILABLE") return raw;
  if (raw === "UPDATE_REQUIRED_CANNOT_DEFER") return raw;
  if (raw === 'UPDATE_INSTALL_FAILED') return raw;
  if (raw === 'UPDATE_SAVE_UNAVAILABLE') return raw;
  if (/ENOSPC|SQLITE_FULL|DISK|SPACE/i.test(raw)) return "UPDATE_DISK_INSUFFICIENT";
  if (/CHECKSUM|HASH|sha(?:256|512) checksum mismatch/i.test(raw)) return "UPDATE_ARTIFACT_HASH_FAILED";
  if (/HTTP_(?:ERROR_)?429|429 Too Many Requests/i.test(raw)) return 'UPDATE_RATE_LIMITED';
  if (/HTTP_401|TOKEN|EXPIRED/i.test(raw)) return "UPDATE_TOKEN_EXPIRED";
  if (/HTTP_(404|410)|WITHDRAWN/i.test(raw)) return "UPDATE_RELEASE_WITHDRAWN";
  // Chromium uses MISMATCH for an incomplete HTTP body too. Match its exact
  // transport codes before the fail-closed manifest/channel mismatch fallback.
  const interruptedTransport = /\bERR_(?:CONTENT_LENGTH_MISMATCH|INCOMPLETE_CHUNKED_ENCODING|CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_ABORTED)\b/i;
  if (interruptedTransport.test(code) || interruptedTransport.test(raw)) return 'UPDATE_NETWORK_FAILED';
  if (/MISMATCH|PATH_INVALID|FEED_URL_BLOCKED|CHANNEL/i.test(raw)) return "UPDATE_CHANNEL_MISMATCH";
  if (/SIGNATURE|KEY_(UNKNOWN|INVALID)/i.test(raw)) return "UPDATE_MANIFEST_SIGNATURE_INVALID";
  if (/MANIFEST|OFFER_INCOMPLETE|API_URL_BLOCKED/i.test(raw)) return "UPDATE_MANIFEST_INVALID";
  if (/UNAUTHORIZED|HTTP_403/i.test(raw)) return "UPDATE_UNAUTHORIZED";
  return "UPDATE_NETWORK_FAILED";
}
