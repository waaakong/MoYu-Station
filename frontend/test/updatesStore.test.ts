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

  const active = { state: 'countdown', revision: 20, currentVersion: '0.2.0', channel: 'stable', updateIntent: true } as const;
  const diskFailure = { ...active, state: 'error', revision: 21, updateIntent: false, errorCode: 'UPDATE_DISK_INSUFFICIENT', message: '磁盘空间不足，请释放空间后重试。', canRetry: true } as const;

  it('keeps the terminal reason independent of revoked installation intent and later background states', () => {
    const store = useUpdatesStore(); store.acceptStatus(active); store.acceptStatus(diskFailure);
    expect(store.failureNotice).toMatchObject({ errorCode: diskFailure.errorCode, message: diskFailure.message, canRetry: true });
    expect(store.status.updateIntent).toBe(false);
    store.acceptStatus({ ...diskFailure, state: 'checking', revision: 22 });
    expect(store.failureNotice?.errorCode).toBe(diskFailure.errorCode);
  });

  it('dismisses only the notice, without IPC or redisplaying a duplicate terminal status', () => {
    const startUpdate=vi.fn(),checkForUpdates=vi.fn(),cancelUpdateDownload=vi.fn();
    window.studyRoomDesktop={startUpdate,checkForUpdates,cancelUpdateDownload} as never;
    const store=useUpdatesStore();store.acceptStatus(active);store.acceptStatus(diskFailure);store.dismissFailureNotice();
    store.acceptStatus({ ...diskFailure, revision: 22 });
    expect(store.failureNotice).toBeUndefined();expect(store.status.updateIntent).toBe(false);
    expect(startUpdate).not.toHaveBeenCalled();expect(checkForUpdates).not.toHaveBeenCalled();expect(cancelUpdateDownload).not.toHaveBeenCalled();
  });

  it('shows the same error again after a genuinely new explicit attempt', async () => {
    window.studyRoomDesktop={startUpdate:vi.fn().mockResolvedValue({...diskFailure,revision:22})} as never;
    const store=useUpdatesStore();store.acceptStatus(active);store.acceptStatus(diskFailure);store.dismissFailureNotice();
    await store.start();expect(store.failureNotice?.errorCode).toBe(diskFailure.errorCode);expect(store.status.updateIntent).toBe(false);
  });

  it('does not promote an unrelated background error to a persistent operation notice', () => {
    const store=useUpdatesStore();store.acceptStatus(diskFailure);expect(store.failureNotice).toBeUndefined();
  });

  it('never lets a stale IPC error replace the active operation or its notification', () => {
    const store=useUpdatesStore();store.acceptStatus(active);store.acceptStatus({...diskFailure,revision:19});
    expect(store.failureNotice).toBeUndefined();expect(store.status.updateIntent).toBe(true);
  });

  it('rechecks explicitly without granting installation or calling download/start', async () => {
    const checkForUpdates=vi.fn().mockResolvedValue({...active,state:'available',revision:22,updateIntent:false});
    const startUpdate=vi.fn(),downloadUpdate=vi.fn();window.studyRoomDesktop={checkForUpdates,startUpdate,downloadUpdate} as never;
    const store=useUpdatesStore();store.acceptStatus(active);store.acceptStatus(diskFailure);await store.check();
    expect(checkForUpdates).toHaveBeenCalledOnce();expect(store.failureNotice).toBeUndefined();expect(store.status.updateIntent).toBe(false);
    expect(startUpdate).not.toHaveBeenCalled();expect(downloadUpdate).not.toHaveBeenCalled();
  });

  it('uses a safe reason for rejected IPC instead of leaking raw exception data', async () => {
    window.studyRoomDesktop={startUpdate:vi.fn().mockRejectedValue(new Error('synthetic-private-path'))} as never;
    const store=useUpdatesStore();await store.start();expect(store.failureNotice?.message).toContain('更新未开始');
    expect(store.failureNotice?.message).not.toContain('private');
  });

  it('clears notifications on logout, account-session replacement and disposal', () => {
    const store=useUpdatesStore();store.synchronizeNoticeIdentity(true,'member-2:epoch-1');
    store.acceptStatus(active);store.acceptStatus(diskFailure);store.synchronizeNoticeIdentity(true,'member-2:epoch-1');
    expect(store.failureNotice).toBeDefined();store.synchronizeNoticeIdentity(true,'member-3:epoch-1');expect(store.failureNotice).toBeUndefined();
    store.acceptStatus({...active,revision:22});store.acceptStatus({...diskFailure,revision:23});store.synchronizeNoticeIdentity(false);expect(store.failureNotice).toBeUndefined();
    store.acceptStatus({...active,revision:24});store.acceptStatus({...diskFailure,revision:25});store.dispose();expect(store.failureNotice).toBeUndefined();
  });

  it('does not rebuild an old account notice from an auth reply after identity has been cleared', async () => {
    window.studyRoomDesktop={setUpdaterAuthState:vi.fn().mockResolvedValue(diskFailure)} as never;
    const store=useUpdatesStore();store.synchronizeNoticeIdentity(true,'member-2:epoch-1');store.acceptStatus(active);
    await store.setAuthenticated(false);expect(store.failureNotice).toBeUndefined();expect(store.status.updateIntent).toBe(false);
  });

  it('ignores a rejected operation after logout instead of restoring its old account notice', async () => {
    let reject!: (reason?: unknown) => void;
    const pending=new Promise<never>((_resolve,fail)=>{reject=fail;});
    window.studyRoomDesktop={startUpdate:vi.fn().mockReturnValue(pending)} as never;
    const store=useUpdatesStore();store.synchronizeNoticeIdentity(true,'member-2:epoch-1');
    const started=store.start();store.synchronizeNoticeIdentity(false);reject(new Error('late'));await started;
    expect(store.failureNotice).toBeUndefined();expect(store.actionError).toBe('');
  });

  it('does not reopen a dismissed notice when the same operation promise rejects late', async () => {
    let reject!: (reason?: unknown) => void;
    const pending=new Promise<never>((_resolve,fail)=>{reject=fail;});
    window.studyRoomDesktop={startUpdate:vi.fn().mockReturnValue(pending)} as never;
    const store=useUpdatesStore();const started=store.start();store.acceptStatus(active);store.acceptStatus(diskFailure);
    store.dismissFailureNotice();reject(new Error('late'));await started;
    expect(store.failureNotice).toBeUndefined();expect(store.status.updateIntent).toBe(false);
  });
});
