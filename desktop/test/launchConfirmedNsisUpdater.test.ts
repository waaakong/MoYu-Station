import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: mock.spawn }));
import { LaunchConfirmedNsisUpdater } from '../src/updater/launchConfirmedNsisUpdater';
import { NsisUpdater } from 'electron-updater';

const installer = join(tmpdir(), 'synthetic-verified-installer.exe');
const descriptor = Object.getOwnPropertyDescriptor(process, 'resourcesPath');
beforeEach(() => { mock.spawn.mockReset(); Object.defineProperty(process, 'resourcesPath', { value: tmpdir(), configurable: true }); });
afterEach(() => { if (descriptor) Object.defineProperty(process, 'resourcesPath', descriptor); else Reflect.deleteProperty(process, 'resourcesPath'); });
class FixtureUpdater extends LaunchConfirmedNsisUpdater {
  arm(admin = false) {
    // Supply already-downloaded metadata only. These tests exercise the real
    // upstream install gate and NSIS launcher, not its download verification.
    this.downloadedUpdateHelper = { file: installer, packageFile: null,
      downloadedFileInfo: { isAdminRightsRequired: admin } } as NonNullable<typeof this.downloadedUpdateHelper>;
  }
}
function setup(admin = false) {
  const quit = vi.fn(), errors: Error[] = [], child = Object.assign(new EventEmitter(), { pid: 123, unref: vi.fn() });
  mock.spawn.mockReturnValue(child);
  const updater = new FixtureUpdater(null, { version: '0.2.0', name: 'synthetic', isPackaged: true,
    appUpdateConfigPath: join(tmpdir(),'synthetic-app-update.yml'), userDataPath: tmpdir(), baseCachePath: tmpdir(),
    whenReady: async () => {}, relaunch: vi.fn(), quit, onQuit: vi.fn() });
  updater.logger = null;updater.autoInstallOnAppQuit = false;updater.on('error', e => errors.push(e));updater.arm(admin);
  return { updater, quit, errors, child };
}

it('waits for spawn, not just a PID, and invokes the real NSIS argument builder exactly once', async () => {
  const { updater, quit, child } = setup();
  updater.quitAndInstall(true,true);updater.quitAndInstall(true,true);
  expect(quit).not.toHaveBeenCalled();expect(mock.spawn).toHaveBeenCalledExactlyOnceWith(installer,['--updated','/S','--force-run'],expect.objectContaining({detached:true,shell:false}));
  child.emit('spawn');await Promise.resolve();expect(quit).toHaveBeenCalledOnce();expect(child.unref).toHaveBeenCalledOnce();
});

it.each(['EACCES','ENOEXEC','ENOENT','UNKNOWN'])('keeps the current application alive after native startup error %s', async code => {
  const {updater,quit,child,errors}=setup();updater.quitAndInstall(true,true);
  child.emit('error',Object.assign(new Error('Synthetic native startup failure'),{code}));
  await vi.waitFor(()=>expect(errors).toHaveLength(1));
  expect(quit).not.toHaveBeenCalled();expect(mock.spawn).toHaveBeenCalledOnce();
});

it('does not auto-elevate a per-user manifest release or replace the signature verifier', () => {
  const {updater,quit,errors}=setup(true);
  const original = new NsisUpdater(null,{version:'0.2.0',name:'synthetic',isPackaged:true,appUpdateConfigPath:'unused',userDataPath:tmpdir(),baseCachePath:tmpdir(),whenReady:async()=>{},relaunch:vi.fn(),quit:vi.fn(),onQuit:vi.fn()});
  expect(Object.getOwnPropertyDescriptor(LaunchConfirmedNsisUpdater.prototype,'verifyUpdateCodeSignature')).toBeUndefined();
  expect(updater.verifyUpdateCodeSignature.toString()).toBe(original.verifyUpdateCodeSignature.toString());
  updater.quitAndInstall(true,true);expect(mock.spawn).not.toHaveBeenCalled();expect(quit).not.toHaveBeenCalled();expect(errors).toHaveLength(1);
});

it('keeps the app running when native spawn throws synchronously', async () => {
  const {updater,quit,errors}=setup();mock.spawn.mockImplementationOnce(()=>{throw new Error('Synthetic spawn exception');});
  updater.quitAndInstall(true,true);await vi.waitFor(()=>expect(errors).toHaveLength(1));expect(quit).not.toHaveBeenCalled();
});

it('retains native disk exhaustion as a specific failure', async () => {
  const {updater,quit,child,errors}=setup();updater.quitAndInstall(true,true);
  child.emit('error',Object.assign(new Error('Synthetic native disk full'),{code:'ENOSPC'}));
  await vi.waitFor(()=>expect(errors).toHaveLength(1));expect(errors[0]?.message).toBe('UPDATE_DISK_INSUFFICIENT');expect(quit).not.toHaveBeenCalled();
});
