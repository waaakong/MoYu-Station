import { join, resolve } from "node:path";
import {configureMetadataWorkerFactory,metadataEnvironment,type MetadataWorker} from '../audio/library/metadataProcess';
import { pathToFileURL } from "node:url";
import { registerCloudBridge } from "./cloud/register";
import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  Menu,
  nativeImage,
  powerMonitor,
  session,
  safeStorage,
  shell,
  Tray,
  utilityProcess
} from "electron";
import { IPC_CHANNELS, type DesktopLifecycleEvent, type MediaCommand } from "@studyroom/contracts";
import {
  DatabaseRecoveryRequiredError,
  initializeLocalDatabase,
  LocalDatabaseStore
} from "../database/database";
import { DirectoryTokenVault } from "../storage/directoryTokenVault";
import { registerIpcHandlers } from "./ipc/registerHandlers";
import { configureNavigationSecurity } from "./security/navigation";
import { configureContentSecurityPolicy, configurePermissionSecurity } from "./security/permissions";
import { configureApiRequestHeaders } from "./security/apiRequestHeaders";
import { MAIN_WINDOW_OPTIONS, MainWindowManager } from "./windowManager";
import { installMediaProtocol, registerMediaScheme } from "../audio/protocol/mediaProtocol";
import { LocalLibraryImporter } from "../audio/library/importer";
import { DirectoryWatchManager } from "../audio/library/directoryWatchManager";
import { scanAudioDirectory } from "../audio/library/scanner";
import { RemoteMediaSessionRegistry } from "../audio/protocol/remoteMediaProtocol";
import { ProviderCoordinator } from "../providers/core/providerCoordinator";
import { ProviderApplicationAccess } from '../providers/core/applicationAccess';
import { ProviderArtworkCache } from '../providers/core/artworkCache';
import { isExperimentalProviderBuild, providerCapabilityEnvironmentFlags, providerEnvironmentFlags } from "../providers/core/experimentalGate";
import { LoginWindowManager } from "../providers/core/loginWindowManager";
import { MetadataCacheRepository } from "../providers/core/metadataCacheRepository";
import { ProviderWorkerSupervisor, type ProviderWorkerProcess } from "../providers/core/providerWorkerSupervisor";
import { NeteaseDesktopAdapter } from "../providers/adapters/netease/desktopAdapter";
import { QQDesktopAdapter } from "../providers/adapters/qq/desktopAdapter";
import { KugouDesktopAdapter } from "../providers/adapters/kugou/desktopAdapter";
import { RadioService } from "../providers/radio/radioService";
import { CredentialVault } from "../storage/credentialVault";
import { PROVIDER_IDS } from "@studyroom/contracts";
import { UpdateManager } from "../updater/updateManager";
import { updaterBuildChannel, updaterBuildConfig } from "../updater/updateBuildConfig";
import { expectedAppId } from "../updater/updateSecurity";
import { LocalProfileService } from "../profile/localProfileService";
import {DesktopMusic} from './music/desktopMusic';
import { DEFAULT_DESKTOP_MUSIC } from "./music/shortcuts";
let desktopMusic:DesktopMusic|undefined;

registerMediaScheme();
configureMetadataWorkerFactory(()=>utilityProcess.fork(join(app.getAppPath(),'dist/main/metadata-worker.cjs'),[],{serviceName:'MoYu bounded metadata',execArgv:['--max-old-space-size=96'],env:metadataEnvironment()}) as unknown as MetadataWorker);

// Keep the existing on-disk identity while the user-facing product name changes.
// Explicit --user-data-dir remains authoritative for smoke tests and diagnostics.
if (!process.argv.some((argument) => argument.startsWith("--user-data-dir="))) {
  const channelDirectory = updaterBuildChannel() === "stable"
    ? "StudyRoom"
    : updaterBuildChannel() === "beta" ? "StudyRoom Beta" : "StudyRoom Provider Experimental";
  app.setPath("userData", join(app.getPath("appData"), channelDirectory));
}

const smokeTest = process.argv.includes("--smoke-test");
const gotSingleInstanceLock = app.requestSingleInstanceLock();

let windowManager: MainWindowManager | undefined;
let recoveryWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let databaseStore: LocalDatabaseStore | undefined;
let unregisterIpc: (() => void) | undefined;
let unregisterMediaProtocol: (() => void) | undefined;
let directoryWatchManager: DirectoryWatchManager | undefined;
let providerCoordinator: ProviderCoordinator | undefined;
let providerArtwork: ProviderArtworkCache | undefined;
let providerLogin: LoginWindowManager | undefined;
let updateManager: UpdateManager | undefined;
const remoteMedia = new RemoteMediaSessionRegistry();
const directoryTokens = new DirectoryTokenVault();

function rendererPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "frontend", "index.html")
    : resolve(app.getAppPath(), "..", "frontend", "dist", "index.html");
}

function recoveryPath(): string {
  return app.isPackaged
    ? join(app.getAppPath(), "dist", "renderer", "recovery.html")
    : resolve(app.getAppPath(), "dist", "renderer", "recovery.html");
}

function preloadPath(): string {
  return app.isPackaged
    ? join(app.getAppPath(), "dist", "preload", "index.cjs")
    : resolve(app.getAppPath(), "dist", "preload", "index.cjs");
}

function providerWorkerPath(): string {
  return resolve(app.getAppPath(), "dist", "providers", "worker.cjs");
}

async function verifySmokeRoutes(window: BrowserWindow): Promise<void> {
  if (!window.isVisible()) throw new Error("Electron smoke requires a visible window");
  const music = await window.webContents.executeJavaScript(
    "window.studyRoomDesktop.getDesktopMusic()", true
  ) as { settings?: { shortcutsEnabled?: boolean }; error?: string };
  if (music.settings?.shortcutsEnabled !== false || music.error) {
    throw new Error("Electron smoke music IPC unavailable or global shortcuts not isolated");
  }
  console.log("STUDYROOM_ELECTRON_MUSIC_IPC_OK");
  const routes = [
    { hash: "/scene", triggerSelector: ".start", pageSelector: ".scene-page", detailSelector: '[aria-label="内置场景"]' },
    { hash: "/focus", triggerSelector: ".enter-scene", pageSelector: ".focus-page", detailSelector: ".timer" }
  ];
  for (const route of routes) {
    const result = await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const deadline = Date.now() + 12000;
        const navigate = () => {
          const trigger = document.querySelector(${JSON.stringify(route.triggerSelector)});
          if (trigger instanceof HTMLElement) {
            trigger.click();
            inspect();
            return;
          }
          if (Date.now() >= deadline) {
            reject(new Error('Missing smoke navigation trigger: ${route.triggerSelector}'));
            return;
          }
          window.setTimeout(navigate, 40);
        };
        const inspect = () => {
          const page = document.querySelector(${JSON.stringify(route.pageSelector)});
          const detail = document.querySelector(${JSON.stringify(route.detailSelector)});
          const background = document.querySelector('.scene-background__layer--active:not(.scene-background__layer--placeholder) img');
          if (page && detail && background && background.complete && background.naturalWidth > 0) {
            resolve({ route: window.location.hash, width: background.naturalWidth, hasPage: true, hasDetail: true });
            return;
          }
          if (Date.now() >= deadline) {
            resolve({
              route: window.location.hash,
              width: background?.naturalWidth || 0,
              hasPage: Boolean(page),
              hasDetail: Boolean(detail),
              title: document.title,
              body: document.body.innerText.slice(0, 240)
            });
            return;
          }
          window.setTimeout(inspect, 40);
        };
        window.setTimeout(navigate, 200);
      })
    `, true) as { route: string; width: number; hasPage?: boolean; hasDetail?: boolean; title?: string; body?: string };
    if (result.route !== `#${route.hash}` || result.width <= 0 || !result.hasPage || !result.hasDetail) {
      throw new Error(`Electron smoke route failed: ${route.hash} (${JSON.stringify(result)})`);
    }
  }
  console.log("STUDYROOM_ELECTRON_ROUTE_OK scene focus");
}

async function createTray(): Promise<void> {
  const branded = nativeImage.createFromPath(join(app.getAppPath(), "dist/brand/app-32.png"));
  const icon = branded.isEmpty() ? await app.getFileIcon(process.execPath, { size: "small" }) : branded;
  tray = new Tray(icon);
  tray.setToolTip("墨屿自习室 · MoYu Station");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "显示墨屿自习室", click: () => windowManager?.show() },
      { label: "显示／隐藏桌面歌词", click: () => {void desktopMusic?.toggleLyrics().catch(()=>{});} },
      { label: "解锁桌面歌词", click: () => {void desktopMusic?.unlockLyrics().catch(()=>{});} },
      { label: "找回桌面歌词位置", click: () => desktopMusic?.resetLyricsPosition() },
    { type: "separator" },
    {
      label: "退出程序",
      click: () => {
        windowManager?.requestExit();
      }
    }
  ]));
  tray.on("double-click", () => windowManager?.show());
  windowManager?.setTrayAvailability(() => Boolean(tray && !tray.isDestroyed()));
}

function registerMediaShortcuts(): void {
  const shortcuts: Array<[string, MediaCommand]> = [
    ["MediaPlayPause", "play-pause"],
    ["MediaNextTrack", "next"],
    ["MediaPreviousTrack", "previous"]
  ];
  for (const [accelerator, command] of shortcuts) {
    globalShortcut.register(accelerator, () => {
      windowManager?.window.webContents.send(IPC_CHANNELS.mediaCommand, command);
    });
  }
}

function sendDesktopLifecycle(type: DesktopLifecycleEvent["type"]): void {
  const contents = windowManager?.window.webContents;
  if (contents && !contents.isDestroyed()) contents.send(IPC_CHANNELS.desktopLifecycle, { type } satisfies DesktopLifecycleEvent);
}

async function showRecoveryWindow(error: DatabaseRecoveryRequiredError): Promise<void> {
  const window = new BrowserWindow({
    ...MAIN_WINDOW_OPTIONS,
    width: 760,
    height: 520,
    show: false,
    webPreferences: {
      ...MAIN_WINDOW_OPTIONS.webPreferences,
      preload: undefined
    }
  });
  recoveryWindow = window;
  configureNavigationSecurity(window.webContents, (url) => shell.openExternal(url));
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => {
    recoveryWindow = undefined;
    app.quit();
  });
  await window.loadFile(recoveryPath());
  if (error.backupPath) window.setTitle("墨屿自习室 本机数据恢复（已有迁移前备份）");
}

async function startApplication(): Promise<void> {
  const cloudSession = session.fromPartition("persist:studyroom-cloud-v1");
  configureApiRequestHeaders(cloudSession);
  configurePermissionSecurity(session.defaultSession);
  configureContentSecurityPolicy(session.defaultSession);

  const databasePath = join(app.getPath("userData"), "studyroom.sqlite");
  let initialized;
  try {
    initialized = initializeLocalDatabase(databasePath);
  } catch (error) {
    if (error instanceof DatabaseRecoveryRequiredError) {
      await showRecoveryWindow(error);
      return;
    }
    throw error;
  }

  databaseStore = new LocalDatabaseStore(initialized.database);
  const mediaCacheDirectory = join(app.getPath("userData"), "media-cache");
  const localProfile = new LocalProfileService(databaseStore, databasePath, mediaCacheDirectory);
  const importer = new LocalLibraryImporter(databaseStore);
  directoryWatchManager = new DirectoryWatchManager(
    async (root) => {
      const summary = await scanAudioDirectory(root.localPath, { cacheDirectory: mediaCacheDirectory });
      await importer.import(summary.files, { rootPath: root.localPath, reconcile: summary.complete });
      databaseStore?.setLibraryRootWatchState(root.id, "watching");
    },
    (rootId) => databaseStore?.setLibraryRootWatchState(rootId, "attention")
  );
  // Smoke must exercise a visible, painted window too. Hidden Chromium windows
  // can defer animation frames and leave scene layers in their placeholder state.
  windowManager = new MainWindowManager(preloadPath(), databaseStore);
  const brandIcon = nativeImage.createFromPath(join(app.getAppPath(), "dist/brand/app-256.png"));
  if (!brandIcon.isEmpty()) windowManager.window.setIcon(brandIcon);
  configureNavigationSecurity(windowManager.window.webContents, (url) => shell.openExternal(url));
  const cloud = registerCloudBridge(windowManager.window, cloudSession, pathToFileURL(rendererPath()).href);

  const providerVault = new CredentialVault(join(app.getPath("userData"), "provider-vault.json"), {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (value) => safeStorage.encryptString(value),
    decrypt: (value) => safeStorage.decryptString(value)
  });
  const providerCache = new MetadataCacheRepository(databaseStore);
  const providerAccess = new ProviderApplicationAccess(cloud,
    id => databaseStore!.getSetting<string>(`provider-moyu-owner:${id}`),
    (id, owner) => databaseStore!.setSetting(`provider-moyu-owner:${id}`, owner));
  cloud.onIdentityChanged(() => {
    providerCoordinator?.invalidateApplicationSession();
    void providerLogin?.closeAndClear().catch(() => {});
    for (const id of PROVIDER_IDS) {
      remoteMedia.invalidateOwner(id); providerArtwork?.invalidate(id);
      if (!cloud.authenticatedOwner && !windowManager?.window.isDestroyed()) windowManager?.window.webContents.send(IPC_CHANNELS.providerStatusChanged,
        {status:{providerId:id,enabled:true,state:'expired',capabilities:[],errorCode:'PROVIDER_APP_LOGIN_REQUIRED'}});
    }
  });
  providerArtwork = new ProviderArtworkCache({directory:join(mediaCacheDirectory,'provider-artwork-v1'),scope:id=>{
    if (!providerAccess.bound(id)) return undefined;
    const status=providerCoordinator?.statuses([id])[0];
    if(!status?.enabled||status.state==='expired'||status.errorCode==='PROVIDER_SESSION_EXPIRED')return undefined;
    if(status.account?.state==='signed-in')return providerVault.readSession(id)?.accountScopeHash;
    return providerVault.has(id)?undefined:'public';
  }});
  unregisterMediaProtocol = installMediaProtocol(databaseStore, remoteMedia, path => cloud.media(path),request=>providerArtwork!.response(request));
  providerLogin = new LoginWindowManager();
  providerCoordinator = new ProviderCoordinator({
    authorize: (id, mode) => providerAccess.authorize(id, mode),
    accountBound: id => providerAccess.bound(id),
    requireLogin: true,
    experimentalBuild: isExperimentalProviderBuild(),
    consentGranted: databaseStore.getSetting<boolean>("provider-risk-consent-v1") === true,
    enabledProviders: providerEnvironmentFlags(),
    enabledCapabilities: providerCapabilityEnvironmentFlags(),
    mapMetadata:(id,value)=>providerArtwork!.metadata(id,value),
    onInvalidate:id=>providerArtwork?.invalidate(id),
    onProgress: (event) => windowManager?.window.webContents.send(IPC_CHANNELS.providerSearchProgress, event),
    onSessionExpired:(providerId)=>{
      remoteMedia.invalidateOwner(providerId);
      providerArtwork?.invalidate(providerId);
      const status=providerCoordinator?.statuses([providerId])[0];
      if(status&&!windowManager?.window.isDestroyed())windowManager?.window.webContents.send(IPC_CHANNELS.providerStatusChanged,{status});
    }
  });
  const preferredOrder = databaseStore.getSetting<typeof PROVIDER_IDS[number][]>("provider-order-v1");
  if (preferredOrder?.length === 3) {
    try { providerCoordinator.setPreferredOrder(preferredOrder); } catch { /* Invalid legacy preference is ignored. */ }
  }
  for (const providerId of PROVIDER_IDS) {
    providerCoordinator.register(providerId, () => {
      const worker = new ProviderWorkerSupervisor(providerId, () => utilityProcess.fork(
        providerWorkerPath(),
        [],
        { serviceName: `StudyRoom ${providerId} provider` }
      ) as unknown as ProviderWorkerProcess);
      return providerId === "netease" ? new NeteaseDesktopAdapter(worker, providerVault) : providerId === 'qq' ? new QQDesktopAdapter(worker, providerVault) : new KugouDesktopAdapter(worker, providerVault);
    });
  }
  const radio = new RadioService(remoteMedia);
  // Keep deferral in memory as well: the database closes during the normal quit sequence.
  let updateDeferUntil = databaseStore?.getSetting<number>("updater-defer-until-v1");
  updateManager = new UpdateManager(
    windowManager.window,
    { ...updaterBuildConfig(app.getVersion(), app.isPackaged), startupCheckDelayMs: 10_000 },
    {
      readDeferUntil: () => updateDeferUntil,
        readAutomaticChecks: () => databaseStore?.getSetting<boolean>('updater-automatic-checks-v1'),
        writeAutomaticChecks: value => databaseStore?.setSetting('updater-automatic-checks-v1', value),
      writeDeferUntil: (value) => {
        if (!databaseStore?.isUpdateFrozen()) databaseStore?.setSetting("updater-defer-until-v1", value ?? 0);
        updateDeferUntil = value;
      }
    },
    { session: cloudSession, fetcher: (url, init) => cloud.updateCheck(url, init) }
  );

  unregisterIpc = registerIpcHandlers({
    window: windowManager.window,
    windowManager,
    database: databaseStore,
    directories: directoryTokens,
    mediaCacheDirectory,
    importer,
    watchers: directoryWatchManager,
    providers: providerCoordinator,
    radio,
    providerLogin,
    providerMedia: remoteMedia,
    providerVault,
    providerCache,
    providerArtwork,
    bindProviderAccount: id => providerAccess.bind(id),
    updater: updateManager,
    localProfile,
    updateBackupDirectory: join(app.getPath('userData'), 'update-backups')
  });
  windowManager.window.on('close', () => updateManager?.cancelForNormalQuit());

  for (const root of databaseStore.listEnabledLibraryRootEntries()) {
    const started = directoryWatchManager.start(root);
    databaseStore.setLibraryRootWatchState(root.id, started ? "watching" : "attention");
  }

  // Keep the real IPC surface in smoke tests without taking global media keys
  // from another application. Smoke always uses its own temporary user data.
  if (smokeTest) databaseStore.setSetting("music.desktop-v1", {
    ...structuredClone(DEFAULT_DESKTOP_MUSIC), shortcutsEnabled: false,wheel:{...structuredClone(DEFAULT_DESKTOP_MUSIC.wheel!),enabled:false}
  });
    desktopMusic = new DesktopMusic(windowManager.window, databaseStore);
  // An HTML document can load successfully even when its module bundle is missing.
  // Native recovery is allowed only before App setup binds the save-aware runtime.
  if (!smokeTest) {
    const manager = windowManager, window = manager.window;
    let timer: NodeJS.Timeout | undefined, generation = 0, showingRecovery = false;
    const untouchedRenderer = async () => !window.isDestroyed() && await window.webContents.executeJavaScript(
      "Boolean(document.getElementById('app') && !document.getElementById('app').children.length && !window.moyuStartupOverlay?.runtimeBound)"
    ).catch(() => false);
    window.webContents.on('did-start-loading', () => { generation++; clearTimeout(timer); });
    window.webContents.on('did-finish-load', () => {
      const current = generation;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (showingRecovery || current !== generation || !await untouchedRenderer()) return;
        showingRecovery = true;
        try {
          const { response } = await dialog.showMessageBox(window, {
            type: 'error', title: '墨屿启动未完成', message: '本地界面尚未启动',
            detail: '界面资源可能未完整加载。本机数据没有被清除；可以重新加载，或退出后重新安装同版本安装包。',
            buttons: ['重新加载', '退出', '继续等待'], defaultId: 0, cancelId: 2, noLink: true
          });
          // Do not discard work if the renderer became ready while the dialog was open.
          if (current !== generation || !await untouchedRenderer()) return;
          if (response === 0) window.webContents.reload();
          else if (response === 1) { manager.setQuitting(true); app.quit(); }
        } finally { showingRecovery = false; }
      }, 15000);
    });
    window.once('closed', () => { generation++; clearTimeout(timer); });
  }
  // If the HTML cannot load, the renderer cannot display its own startup error UI.
  // Retry only the document, never recreate database/music/IPC services.
  for (;;) {
    try { await windowManager.window.loadFile(rendererPath()); break; }
    catch (error) {
      if (smokeTest) throw error;
      const { response } = await dialog.showMessageBox(windowManager.window, {
        type: 'error', title: '墨屿启动未完成',
        message: '无法加载本地界面',
        detail: '本机数据未被清除。可以重新加载界面，或退出后重新打开客户端。',
        buttons: ['重新加载', '退出'], defaultId: 0, cancelId: 1, noLink: true
      });
      if (response === 1) { windowManager.setQuitting(true); app.quit(); return; }
    }
  }
  if (smokeTest) {
    windowManager.window.show();
    await verifySmokeRoutes(windowManager.window);
    console.log("STUDYROOM_ELECTRON_SMOKE_OK");
    windowManager.setQuitting(true);
    app.quit();
    return;
  }

  try { await createTray(); }
  catch { console.warn("System tray unavailable; window hiding remains disabled."); }
  powerMonitor.on("suspend", () => sendDesktopLifecycle("suspend"));
  powerMonitor.on("resume", () => {
    sendDesktopLifecycle("resume");
    updateManager?.handleResume();
  });
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.setAppUserModelId(expectedAppId(updaterBuildChannel()));
  app.on("second-instance", () => windowManager?.show());
  app.whenReady().then(startApplication).catch((error) => {
    console.error("StudyRoom failed to start", error instanceof Error ? error.message : "unknown error");
    app.exit(1);
  });
}

app.on("activate", () => windowManager?.show());
app.on("before-quit", () => {
  updateManager?.cancelForNormalQuit();
  desktopMusic?.dispose();desktopMusic=undefined;
  windowManager?.setQuitting(true);
  unregisterIpc?.();
  unregisterMediaProtocol?.();
  providerArtwork?.dispose();
  remoteMedia.clear();
  void providerLogin?.closeAndClear().catch(() => { /* Login partitions are nonpersistent; shutdown must not leak a rejected promise. */ });
  void providerCoordinator?.dispose().catch(() => { /* Workers are terminated with the application. */ });
  directoryTokens.clear();
  directoryWatchManager?.stopAll();
});
app.on("will-quit", () => {
  desktopMusic?.dispose();
  globalShortcut.unregisterAll();
  tray?.destroy();
  updateManager?.dispose(true);
  databaseStore?.close();
});
