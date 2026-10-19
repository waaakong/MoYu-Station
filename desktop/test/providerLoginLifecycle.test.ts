import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ windows: [] as any[], sessions: [] as any[], failStorage: false }));
vi.mock("electron", () => ({
  BrowserWindow: class extends EventEmitter {
    destroyed = false;
    webContents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn() });
    constructor(readonly options: unknown) { super();state.windows.push(this); }
    async loadURL() {}
    show() {}
    isDestroyed() { return this.destroyed; }
    destroy() { this.destroyed = true;this.emit("closed"); }
  },
  session: { fromPartition: () => {
    const session = Object.assign(new EventEmitter(), {
      setPermissionRequestHandler: vi.fn(),
      cookies: new EventEmitter(),
      clearStorageData: vi.fn(async () => { if(state.failStorage) throw new Error("storage failure"); }),
      clearCache: vi.fn(async () => undefined),
      clearAuthCache: vi.fn(async () => undefined)
    });state.sessions.push(session);return session;
  } }
}));
import { LoginWindowManager } from "../src/providers/core/loginWindowManager";

describe("provider login cleanup lifecycle", () => {
  beforeEach(() => { state.windows.length=0;state.sessions.length=0;state.failStorage=false; });
  it("waits for verified cookies, closes and removes listeners after acceptance",async()=>{
    const manager=new LoginWindowManager(),verify=vi.fn(async()=>true);
    await manager.open("netease",{signal:new AbortController().signal,verify});
    expect(verify).toHaveBeenCalledOnce();expect(state.windows[0].destroyed).toBe(true);
    expect(state.sessions[0].cookies.listenerCount("changed")).toBe(0);
    expect(state.sessions[0].clearStorageData).toHaveBeenCalledOnce();
  });
  it("reports cancellation rather than successful login when the user closes",async()=>{
    const manager=new LoginWindowManager();
    const pending=manager.open("netease",{signal:new AbortController().signal,verify:async()=>false});
    const assertion=expect(pending).rejects.toMatchObject({name:"AbortError"});
    await new Promise(resolve=>setTimeout(resolve,0));state.windows[0].destroy();await assertion;
  });
  it("aborts in-flight verification on close and ignores its late success",async()=>{
    const manager=new LoginWindowManager();let finish!:(accepted:boolean)=>void,verificationSignal!:AbortSignal;
    let ready!:()=>void;const started=new Promise<void>(resolve=>{ready=resolve;});
    const pending=manager.open("netease",{signal:new AbortController().signal,verify:async(_session,signal)=>{
      verificationSignal=signal;ready();return new Promise(resolve=>{finish=resolve;});
    }});
    const assertion=expect(pending).rejects.toMatchObject({name:"AbortError"});
    await started;state.windows[0].destroy();expect(verificationSignal.aborted).toBe(true);
    finish(true);await assertion;await manager.closeAndClear();expect(state.sessions[0].cookies.listenerCount("changed")).toBe(0);
  });
  it("cleans cookies, cache and HTTP auth on the native close button", async () => {
    const manager=new LoginWindowManager();await manager.open("netease");
    state.windows[0].destroy();await manager.closeAndClear();
    expect(state.sessions[0].clearStorageData).toHaveBeenCalledTimes(1);
    expect(state.sessions[0].clearCache).toHaveBeenCalledTimes(1);
    expect(state.sessions[0].clearAuthCache).toHaveBeenCalledTimes(1);
  });
  it("retains cleanup failures, refuses another login and supports explicit retry", async () => {
    const manager=new LoginWindowManager();await manager.open("netease");state.failStorage=true;
    await expect(manager.closeAndClear()).rejects.toThrow("PROVIDER_LOGIN_CLEANUP_FAILED");
    await expect(manager.open("qq")).rejects.toThrow("PROVIDER_LOGIN_CLEANUP_FAILED");expect(state.windows).toHaveLength(1);
    state.failStorage=false;await manager.closeAndClear();await manager.open("qq");
    expect(state.windows).toHaveLength(2);await manager.closeAndClear();
  });
  it("serializes simultaneous logins and rejects unsafe navigation", async () => {
    const manager=new LoginWindowManager();
    const results=await Promise.allSettled([manager.open("qq"),manager.open("netease")]);
    expect(results.map(r=>r.status).sort()).toEqual(["fulfilled","rejected"]);
    const event={preventDefault:vi.fn()};
    state.windows[0].webContents.emit("will-navigate",event,"https://attacker.invalid");
    expect(event.preventDefault).toHaveBeenCalledOnce();await manager.closeAndClear();
    expect(state.windows[0].destroyed).toBe(true);
  });
});
