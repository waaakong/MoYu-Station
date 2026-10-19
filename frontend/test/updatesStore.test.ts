import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useUpdatesStore } from "../src/stores/updates";
import { hasVolatileWork, prepareLocalQuit } from '../src/window/quitPreparation';
vi.mock('../src/window/quitPreparation',()=>({hasVolatileWork:vi.fn(()=>false),prepareLocalQuit:vi.fn(async()=>{})}));

describe("private updater renderer boundary", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("window", {});
    vi.mocked(hasVolatileWork).mockReturnValue(false);
    vi.mocked(prepareLocalQuit).mockResolvedValue(undefined);
  });

  it('refuses installation with unsaved work and saves before the main-process authorization check', async()=>{
    const installUpdate=vi.fn().mockResolvedValue(undefined);
    window.studyRoomDesktop={installUpdate} as never;
    const store=useUpdatesStore();store.status={state:'downloaded',currentVersion:'0.2.0',channel:'stable',canInstall:true};
    vi.mocked(hasVolatileWork).mockReturnValue(true);
    await store.install();expect(installUpdate).not.toHaveBeenCalled();expect(store.actionError).toContain('草稿');
    vi.mocked(hasVolatileWork).mockReturnValue(false);
    await store.install();expect(installUpdate).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prepareLocalQuit).mock.invocationCallOrder.at(-1)!).toBeLessThan(installUpdate.mock.invocationCallOrder[0]!);
  });

  it('does not install after a local save failure and never exposes raw IPC error data',async()=>{
    const installUpdate=vi.fn();window.studyRoomDesktop={installUpdate} as never;
    const store=useUpdatesStore();store.status={state:'downloaded',currentVersion:'0.2.0',channel:'stable',canInstall:true};
    vi.mocked(prepareLocalQuit).mockRejectedValueOnce(new Error('synthetic secret path'));
    await store.install();expect(installUpdate).not.toHaveBeenCalled();expect(store.actionError).toContain('安装未开始');
    expect(store.actionError).not.toContain('secret');
  });

  it("degrades to an inert web status without inventing an update", async () => {
    const store = useUpdatesStore();
    await store.initialize(true);
    expect(store.status).toMatchObject({ state: "disabled", currentVersion: "web", canRetry: false });
  });

  it("passes only authentication and activity booleans to Main", async () => {
    const setUpdaterAuthState = vi.fn().mockResolvedValue({ state: "not-available", currentVersion: "1.0.0", channel: "stable" });
    const setUpdaterActivityState = vi.fn().mockResolvedValue({ state: "not-available", currentVersion: "1.0.0", channel: "stable" });
    const onUpdateStatus = vi.fn().mockReturnValue(() => undefined);
    window.studyRoomDesktop = { setUpdaterAuthState, setUpdaterActivityState, onUpdateStatus } as never;
    const store = useUpdatesStore();
    await store.initialize(true);
    await store.setActivity(true, false);
    expect(setUpdaterAuthState).toHaveBeenCalledWith({ authenticated: true });
    expect(setUpdaterActivityState).toHaveBeenCalledWith({ focusActive: true, audioActive: false });
  });
});
