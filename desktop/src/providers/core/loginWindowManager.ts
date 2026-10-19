import { BrowserWindow, session, type Session } from "electron";
import type { ProviderId } from "@studyroom/contracts";
import { isAllowedProviderLoginUrl, providerLoginConfig, PROVIDER_LOGIN_WINDOW_OPTIONS } from "./providerLoginConfig";

export interface LoginCompletion {
  signal: AbortSignal;
  verify(session: Session, signal: AbortSignal): Promise<boolean>;
}

export class LoginWindowManager {
  private active?: { providerId: ProviderId; window: BrowserWindow; partition: string; providerSession: Session };
  private readonly dirtySessions = new Set<Session>();
  private readonly cleaning = new Map<Session, Promise<void>>();

  async open(providerId: ProviderId, completion?: LoginCompletion): Promise<void> {
    await this.retryCleanup();
    completion?.signal.throwIfAborted();
    if (this.active) throw new Error("PROVIDER_LOGIN_IN_PROGRESS");
    const config = providerLoginConfig(providerId);
    const partition = `studyroom-provider-login-${providerId}-${Date.now()}`;
    const providerSession = session.fromPartition(partition, { cache: false });
    providerSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    providerSession.on("will-download", (event) => event.preventDefault());
    const window = new BrowserWindow({
      ...PROVIDER_LOGIN_WINDOW_OPTIONS,
      title: `${providerId} 实验登录`,
      webPreferences: { ...PROVIDER_LOGIN_WINDOW_OPTIONS.webPreferences, session: providerSession }
    });
    this.active = { providerId, window, partition, providerSession };
    const lifetime=new AbortController();
    const signal=completion?AbortSignal.any([completion.signal,lifetime.signal]):lifetime.signal;
    let finish!:()=>void, fail!:(reason:unknown)=>void;
    const completed=new Promise<void>((resolve,reject)=>{finish=resolve;fail=reject;});
    // Subscribe before loadURL: close/navigation can settle completion during page loading.
    void completed.catch(()=>undefined);
    let checking=false,dirty=false,acceptedLogin=false,checkTimer:ReturnType<typeof setTimeout>|undefined;
    const check=async()=>{
      if(!completion||checking||signal.aborted||window.isDestroyed())return;
      checking=true;dirty=false;
      try{
        const accepted=await completion.verify(providerSession,signal);
        signal.throwIfAborted();
        if(accepted&&this.active?.window===window){acceptedLogin=true;await this.closeAndClear();finish();}
      }catch(error){
        if(!signal.aborted){fail(error);if(this.active?.window===window)await this.closeAndClear().catch(()=>undefined);}
      }finally{checking=false;if(dirty&&!signal.aborted)scheduleCheck();}
    };
    const scheduleCheck=()=>{
      dirty=true;if(checking||checkTimer||signal.aborted)return;
      checkTimer=setTimeout(()=>{checkTimer=undefined;void check();},250);
    };
    const abortLogin=()=>{if(this.active?.window===window)void this.closeAndClear().catch(fail);};
    completion?.signal.addEventListener("abort",abortLogin,{once:true});
    if(completion)providerSession.cookies.on("changed",scheduleCheck);
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    const guardNavigation = (event: Electron.Event, url: string) => {
      if (isAllowedProviderLoginUrl(config, url)) return;
      event.preventDefault();
      void this.closeAndClear().catch(() => { /* Retained for cleanup retry; new login stays blocked. */ });
    };
    window.webContents.on("will-navigate", guardNavigation);
    window.webContents.on("will-redirect", guardNavigation);
    window.once("ready-to-show", () => { if (!window.isDestroyed()) window.show(); });
    window.once("closed", () => {
      lifetime.abort();
      if(checkTimer)clearTimeout(checkTimer);
      completion?.signal.removeEventListener("abort",abortLogin);
      if(completion)providerSession.cookies.removeListener("changed",scheduleCheck);
      if (this.active?.window === window) this.active = undefined;
      void this.clearSession(providerSession).then(()=>{
        if(completion&&!acceptedLogin)fail(new DOMException("Login cancelled","AbortError"));else finish();
      },fail);
    });
    try {
      await window.loadURL(config.startUrl);
      if(completion){scheduleCheck();await completed;}
    } catch (error) {
      if(this.active?.window===window)await this.closeAndClear();
      throw error;
    }
  }

  async closeAndClear(): Promise<void> {
    const current = this.active;
    this.active = undefined;
    if (current) {
      this.dirtySessions.add(current.providerSession);
      if (!current.window.isDestroyed()) current.window.destroy();
    }
    await this.retryCleanup();
  }

  private async retryCleanup(): Promise<void> {
    const results = await Promise.allSettled([...this.dirtySessions].map(providerSession => this.clearSession(providerSession)));
    if (results.some(result => result.status === "rejected")) throw new Error("PROVIDER_LOGIN_CLEANUP_FAILED");
  }

  private clearSession(providerSession: Session): Promise<void> {
    const current = this.cleaning.get(providerSession);
    if (current) return current;
    this.dirtySessions.add(providerSession);
    const cleanup = Promise.allSettled([
      Promise.resolve().then(() => providerSession.clearStorageData()),
      Promise.resolve().then(() => providerSession.clearCache()),
      Promise.resolve().then(() => providerSession.clearAuthCache())
    ]).then(results => {
      if (results.some(result => result.status === "rejected")) throw new Error("PROVIDER_LOGIN_CLEANUP_FAILED");
      this.dirtySessions.delete(providerSession);
    }).finally(() => this.cleaning.delete(providerSession));
    this.cleaning.set(providerSession, cleanup);
    return cleanup;
  }
}
