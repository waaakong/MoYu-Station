import { app, BrowserWindow, screen, type BrowserWindowConstructorOptions, type Rectangle } from "electron";
import { randomUUID } from "node:crypto";
import { IPC_CHANNELS, type DesktopWindowState, type WindowCloseBehavior, type WindowCloseDecision } from "@studyroom/contracts";
import { fitWindowBounds } from "./windowGeometry";
import type { LocalDatabaseStore } from "../database/database";

const WINDOW_STATE_KEY = "window.main";

interface StoredWindowState extends Rectangle {
  maximized: boolean;
}

export const MAIN_WINDOW_OPTIONS: Readonly<BrowserWindowConstructorOptions> = Object.freeze({
  width: 1440,
  height: 900,
  minWidth: 1080,
  minHeight: 640,
  titleBarStyle: "hidden",
  frame: false,
  transparent: false,
  thickFrame: true,
  hasShadow: true,
  show: false,
  backgroundColor: "#101514",
  autoHideMenuBar: true,
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    // The application-lifetime evidence clock must also observe awake tray time.
    backgroundThrottling: false,
    spellcheck: false
  }
});

export class MainWindowManager {
  readonly window: BrowserWindow;
  private saveTimer?: NodeJS.Timeout;
  private quitting = false;
  private revision = 0;
  private closeBehavior: WindowCloseBehavior = "ask";
  private closeRequest?: DesktopWindowState["closeRequest"];
  private closeError?: string;
  private quitTimer?: NodeJS.Timeout;
  private trayAvailable = () => false;
  private readonly displaysChanged = () => {
    if (this.window.isDestroyed()) return;
    const fitted = fitWindowBounds(this.window.getNormalBounds(), screen.getAllDisplays().map(d => d.workArea));
    this.window.setMinimumSize(Math.min(1080, fitted.width), Math.min(640, fitted.height));
    if (!this.window.isMaximized() && !this.window.isFullScreen()) this.window.setBounds(fitted);
  };

  constructor(preloadPath: string, private readonly store: LocalDatabaseStore, showWindow = true) {
    let saved: StoredWindowState | undefined;
    try { saved = store.getSetting<StoredWindowState>(WINDOW_STATE_KEY); } catch { /* Use a reachable default. */ }
    const safeBounds = fitWindowBounds(saved, screen.getAllDisplays().map(d => d.workArea));
    try {
      const behavior = store.getSetting<unknown>("window.close-behavior-v1");
      if (behavior === "tray" || behavior === "quit") this.closeBehavior = behavior;
    } catch { /* Unreadable preferences must not silently close the window. */ }
    this.window = new BrowserWindow({
      ...MAIN_WINDOW_OPTIONS,
      ...safeBounds,
      minWidth: Math.min(1080, safeBounds.width),
      minHeight: Math.min(640, safeBounds.height),
      show: false,
      webPreferences: {
        ...MAIN_WINDOW_OPTIONS.webPreferences,
        preload: preloadPath
      }
    });

    if (saved?.maximized) this.window.maximize();
    this.window.once("ready-to-show", () => {
      if (showWindow) this.window.show();
    });
    this.window.on("resize", () => this.scheduleSave());
    this.window.on("move", () => this.scheduleSave());
    this.window.on("maximize", () => this.publish());
    this.window.on("unmaximize", () => this.publish());
    this.window.on("focus", () => this.publish());
    this.window.on("blur", () => this.publish());
    screen.on("display-removed", this.displaysChanged);
    screen.on("display-metrics-changed", this.displaysChanged);
    this.window.on("closed", () => {
      clearTimeout(this.saveTimer);
      clearTimeout(this.quitTimer);
      screen.removeListener("display-removed", this.displaysChanged);
      screen.removeListener("display-metrics-changed", this.displaysChanged);
    });
    this.window.on("close", (event) => {
      if (this.quitting) return;
      event.preventDefault();
      this.beginClose();
    });
    // OS session termination must never open a close-choice dialog.
    this.window.on("query-session-end", () => this.setQuitting(true));
  }

  setQuitting(value: boolean): void {
    this.quitting = value;
    if (value) {
      clearTimeout(this.quitTimer);
      this.saveNow();
    }
  }

  setTrayAvailability(check: () => boolean): void { this.trayAvailable = check; this.publish(); }

  readState(): DesktopWindowState {
    return {
      revision: this.revision, maximized: this.window.isMaximized(), focused: this.window.isFocused(),
      closeBehavior: this.closeBehavior, trayAvailable: this.trayAvailable(),
      closeRequest: this.closeRequest && { ...this.closeRequest }, error: this.closeError
    };
  }

  private publish(): void {
    this.revision += 1;
    if (!this.window.isDestroyed() && !this.window.webContents.isDestroyed()) {
      this.window.webContents.send(IPC_CHANNELS.windowStateChanged, this.readState());
    }
  }

  setCloseBehavior(value: WindowCloseBehavior): DesktopWindowState {
    this.store.setSetting("window.close-behavior-v1", value);
    this.closeBehavior = value;
    this.publish();
    return this.readState();
  }

  private beginClose(forceQuit = false): void {
    if (this.closeRequest) { this.show(); return; }
    this.closeError = undefined;
    this.closeRequest = { id: randomUUID(), phase: "choose" };
    const action = forceQuit ? "quit" : this.closeBehavior;
    if (action === "tray" && this.trayAvailable()) {
      this.closeRequest = undefined;
      this.window.hide();
    } else if (action === "quit") this.prepareQuit();
    else {
      if (action === "tray") this.closeError = "托盘不可用，请选择退出程序或取消。";
      this.show();
      this.publish();
    }
  }

  /** Explicit tray exit skips only the choice, never local-save preparation. */
  requestExit(): void {
    if (this.closeRequest?.phase === "prepare") return;
    this.closeRequest = undefined;
    this.beginClose(true);
  }

  resolveClose(decision: WindowCloseDecision): void {
    if (this.closeRequest?.id !== decision.id) throw new Error("WINDOW_CLOSE_STALE");
    if (decision.action === "cancel") {
      clearTimeout(this.quitTimer);
      this.closeRequest = undefined;
      this.closeError = undefined;
      this.publish();
      return;
    }
    if (this.closeRequest.phase !== "choose") throw new Error("WINDOW_CLOSE_STALE");
    if (decision.action === "tray" && !this.trayAvailable()) {
      this.closeError = "托盘不可用，请选择退出程序或取消。";
      this.publish();
      throw new Error("WINDOW_TRAY_UNAVAILABLE");
    }
    // Write first: a failed preference write must not hide or exit.
    if (decision.remember) this.setCloseBehavior(decision.action);
    this.closeError = undefined;
    if (decision.action === "quit") this.prepareQuit();
    else {
      this.closeRequest = undefined;
      this.publish();
      this.window.hide();
    }
  }

  private prepareQuit(): void {
    this.closeRequest = { id: randomUUID(), phase: "prepare" };
    this.show();
    this.publish();
    this.armQuitTimeout();
  }

  private armQuitTimeout(): void {
    clearTimeout(this.quitTimer);
    this.quitTimer = setTimeout(() => {
      this.closeRequest = { id: randomUUID(), phase: "choose" };
      this.closeError = "退出准备超时，窗口已保留。请重试或取消。";
      this.show();
      this.publish();
    }, 15000);
  }

  completeQuit(request: { id: string; ready: boolean | "waiting" | "working" }): void {
    if (this.closeRequest?.id !== request.id || this.closeRequest.phase !== "prepare") throw new Error("WINDOW_CLOSE_STALE");
    clearTimeout(this.quitTimer);
    if (request.ready === "waiting") return;
    if (request.ready === "working") { this.armQuitTimeout(); return; }
    if (!request.ready) {
      this.closeRequest = { id: randomUUID(), phase: "choose" };
      this.closeError = "本机数据尚未安全保存，已取消退出。请检查提示后重试。";
      this.publish();
      return;
    }
    this.saveNow();
    this.quitting = true;
    app.quit();
  }

  show(): void {
    if (this.window.isMinimized()) this.window.restore();
    this.window.show();
    this.window.focus();
  }

  minimize(): void {
    this.window.minimize();
  }

  toggleMaximize(): boolean {
    if (this.window.isMaximized()) this.window.unmaximize();
    else this.window.maximize();
    return this.window.isMaximized();
  }

  requestClose(): void {
    this.window.close();
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.saveNow(), 250);
  }

  private saveNow(): void {
    if (this.window.isDestroyed()) return;
    const bounds = this.window.isMaximized() ? this.window.getNormalBounds() : this.window.getBounds();
    this.store.setSetting(WINDOW_STATE_KEY, { ...bounds, maximized: this.window.isMaximized() });
  }
}
