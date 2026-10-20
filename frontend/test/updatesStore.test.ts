import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useUpdatesStore } from "../src/stores/updates";
import { hasVolatileWork, prepareLocalQuit } from '../src/window/quitPreparation';
vi.mock('../src/window/quitPreparation',()=>({hasVolatileWork:vi.fn(()=>false),prepareLocalQuit:vi.fn(async()=>{}),recoverLocalQuit:vi.fn()}));

describe("private updater renderer boundary", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal("window", {});
    vi.mocked(hasVolatileWork).mockReturnValue(false);
    vi.mocked(prepareLocalQuit).mockResolvedValue(undefined);
  });
  afterEach(() => { useUpdatesStore().dispose(); vi.unstubAllGlobals(); });

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

  it("passes only account-session identity and activity flags, never credentials or draft content", async () => {
    const setUpdaterAuthState = vi.fn().mockResolvedValue({ state: "not-available", currentVersion: "1.0.0", channel: "stable" });
    const setUpdaterActivityState = vi.fn().mockResolvedValue({ state: "not-available", currentVersion: "1.0.0", channel: "stable" });
    const onUpdateStatus = vi.fn().mockReturnValue(() => undefined);
    window.studyRoomDesktop = { setUpdaterAuthState, setUpdaterActivityState, onUpdateStatus } as never;
    const store = useUpdatesStore();
    await store.initialize(true, 'member-2:epoch-1');
    await store.setActivity(true, false);
    expect(setUpdaterAuthState).toHaveBeenCalledWith({ authenticated: true, accountSession: 'member-2:epoch-1' });
    expect(setUpdaterActivityState).toHaveBeenCalledWith({ focusActive: true, audioActive: false, draftsActive: false });
  });

  it('saves through the normal quit path and includes only allowlisted local state in the backup acknowledgement', async () => {
    const root = { inert: false };
    vi.stubGlobal('document', { getElementById: () => root });
    const values = new Map([['studyroom-focus-session-v2', '{"synthetic":true}'], ['password', 'never-copy'], ['session-token', 'never-copy']]);
    vi.stubGlobal('localStorage', { length: values.size, key: (index: number) => [...values.keys()][index], getItem: (key: string) => values.get(key) ?? null });
    const completeUpdatePreparation = vi.fn(async () => {});
    window.studyRoomDesktop = { completeUpdatePreparation } as never;
    const store = useUpdatesStore(); await store.prepare({ id: 'request-1' });
    expect(root.inert).toBe(true);
    expect(prepareLocalQuit).toHaveBeenCalled();
    expect(completeUpdatePreparation).toHaveBeenCalledWith({ id: 'request-1', ready: true, rendererState: { 'studyroom-focus-session-v2': '{"synthetic":true}' } });
    store.dispose(); expect(root.inert).toBe(false);
  });

  it('rejects a save request with drafts without clearing drafts or installing', async () => {
    const root = { inert: false };
    vi.stubGlobal('document', { getElementById: () => root });
    const completeUpdatePreparation = vi.fn(async () => {});
    window.studyRoomDesktop = { completeUpdatePreparation } as never;
    vi.mocked(hasVolatileWork).mockReturnValue(true);
    const store = useUpdatesStore(); await store.prepare({ id: 'request-2' });
    expect(completeUpdatePreparation).toHaveBeenCalledWith({ id: 'request-2', ready: false });
    expect(root.inert).toBe(false); expect(store.actionError).toContain('当前版本');
  });

  it('ignores a late IPC reply that would hide the active countdown or change the verified target', () => {
    const store = useUpdatesStore();
    store.acceptStatus({ state: 'countdown', revision: 20, currentVersion: '0.2.0', channel: 'stable', availableVersion: '0.3.0', updateIntent: true, countdownSeconds: 4 });
    store.acceptStatus({ state: 'available', revision: 19, currentVersion: '0.2.0', channel: 'stable', availableVersion: '0.2.1', updateIntent: false });
    expect(store.status).toMatchObject({ revision: 20, availableVersion: '0.3.0', updateIntent: true, countdownSeconds: 4 });
  });
});
