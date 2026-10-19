import { describe, expect, it, vi } from 'vitest';
import type { BrowserWindow, Session } from 'electron';
import { IPC_CHANNELS } from '@studyroom/contracts';

const mocks = vi.hoisted(() => ({
  emit: undefined as undefined | ((event: unknown) => void),
  remove: vi.fn(),
  close: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { getPath: () => 'isolated-profile' },
  ipcMain: { handle: vi.fn(), removeHandler: mocks.remove },
}));
vi.mock('../src/main/cloud/sceneCache', () => ({ PrivateSceneCache: class { setOwner() {} } }));
vi.mock('../src/main/cloud/streams', () => ({ CloudStreams: class {
  constructor(_session: unknown, emit: (event: unknown) => void) { mocks.emit = emit; }
  closeAll() { mocks.close(); mocks.emit?.({ id: 'test', type: 'close' }); }
} }));
import { registerCloudBridge } from '../src/main/cloud/register';

describe('cloud bridge window teardown', () => {
  it('closes streams and removes handlers without touching a destroyed BrowserWindow', () => {
    let destroyed = false, contentsDestroyed = false;
    const send = vi.fn();
    const contents = { id: 1, on: vi.fn(), isDestroyed: () => contentsDestroyed, send };
    let closed!: () => void;
    const window = {
      get webContents() { if (destroyed) throw new Error('Object has been destroyed'); return contents; },
      isDestroyed: () => destroyed,
      once: (_event: string, listener: () => void) => { closed = listener; },
    } as unknown as BrowserWindow;
    registerCloudBridge(window, {} as Session, 'file:///app/index.html');
    mocks.emit?.({ id: 'test', type: 'open' });
    expect(send).toHaveBeenCalledTimes(1);
    contentsDestroyed = true;
    mocks.emit?.({ id: 'test', type: 'message' });
    expect(send).toHaveBeenCalledTimes(1);
    destroyed = true;
    expect(() => closed()).not.toThrow();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.remove.mock.calls.map(call => call[0]).sort()).toEqual([
      IPC_CHANNELS.cloudRequest, IPC_CHANNELS.sceneCache, IPC_CHANNELS.cloudStreamOpen,
      IPC_CHANNELS.cloudStreamClose, IPC_CHANNELS.cloudChatSend, IPC_CHANNELS.notificationConfigure, IPC_CHANNELS.notificationShow, IPC_CHANNELS.notificationDismiss
    ].sort());
    expect(send).toHaveBeenCalledTimes(1);
  });
});
