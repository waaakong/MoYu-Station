import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useSoundStore } from '../src/stores/sound';
beforeEach(() => setActivePinia(createPinia()));
afterEach(() => vi.unstubAllGlobals());
it('persists ordered sound snapshots and retains saving state until all writes settle', async () => {
  let finish!: () => void;
  const save = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
  vi.stubGlobal('window', { studyRoomDesktop: { saveSoundSettings: save } });
  const sound = useSoundStore(); sound.settings.visualizer.mode = 'particles';
  const first = sound.persist(); sound.settings.visualizer.mode = 'off'; const second = sound.persist();
  await Promise.resolve(); expect(save).toHaveBeenCalledTimes(1); expect(sound.persisting).toBe(true);
  finish(); await first; await second;
  expect(save.mock.calls.map(([request]) => request.settings.visualizer.mode)).toEqual(['particles', 'off']);
  expect(sound.persisting).toBe(false);
});
it('failed save keeps live settings and can be explicitly retried', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('DISK_FULL')).mockResolvedValue(undefined);
  vi.stubGlobal('window', { studyRoomDesktop: { saveSoundSettings: save } });
  const sound = useSoundStore(); sound.settings.visualizer.stage = { composition: 'visual', tone: 'ember', cameraX: 2, cameraY: 0 };
  await sound.persist(); expect(sound.errorCode).toBe('SOUND_SETTINGS_WRITE_FAILED');
  expect(sound.settings.visualizer.stage.tone).toBe('ember');
  await sound.persist(); expect(sound.errorCode).toBeUndefined();
  expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
});
