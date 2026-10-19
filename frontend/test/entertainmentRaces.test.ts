import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { EntertainmentState } from '@studyroom/contracts';
const io = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('../src/entertainment/storage', () => ({ readAllEntertainmentState: io.read, saveEntertainmentState: io.write }));
import { useEntertainmentStore } from '../src/stores/entertainment';
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => { vi.useFakeTimers(); setActivePinia(createPinia()); io.read.mockReset().mockResolvedValue([]); io.write.mockReset().mockResolvedValue(undefined); });
afterEach(async () => { await useEntertainmentStore().flush(); useEntertainmentStore().dispose(); vi.useRealTimers(); });
describe('entertainment pending lifecycle work', () => {
  it('coalesces reads and refuses results after leaving the page', async () => {
    const pending = deferred<EntertainmentState[]>(); io.read.mockReturnValueOnce(pending.promise);
    const store = useEntertainmentStore(); const a = store.initialize(), b = store.initialize();
    expect(io.read).toHaveBeenCalledTimes(1); store.dispose();
    pending.resolve([{ version: 1, toolId: 'wooden-fish', count: 800, tempo: 'fast' }]); await Promise.all([a, b]);
    expect(store.woodenFish.count).toBe(0); expect(store.initialized).toBe(false);
    await store.initialize(); expect(store.initialized).toBe(true); expect(io.read).toHaveBeenCalledTimes(2);
  });
  it('does not replace user input with a late initial record', async () => {
    const pending = deferred<EntertainmentState[]>(); io.read.mockReturnValueOnce(pending.promise);
    const store = useEntertainmentStore(); const reading = store.initialize(); store.hitWoodenFish();
    pending.resolve([{ version: 1, toolId: 'wooden-fish', count: 0, tempo: 'fast' }]); await reading;
    expect(store.woodenFish.count).toBe(1); await store.flush();
    expect(io.write).toHaveBeenCalledWith('wooden-fish', expect.objectContaining({ count: 1 }));
  });
  it('serializes immutable snapshots so old writes cannot finish after a reset', async () => {
    const first = deferred<void>(); io.write.mockReturnValueOnce(first.promise);
    const store = useEntertainmentStore(); await store.initialize(); store.hitWoodenFish();
    const old = store.persist('wooden-fish'); store.resetWoodenFish(); const reset = store.persist('wooden-fish');
    await Promise.resolve(); expect(io.write).toHaveBeenCalledTimes(1);
    expect(io.write.mock.calls[0]![1].count).toBe(1);
    first.resolve(); await old; await reset;
    expect(io.write.mock.calls[1]![1].count).toBe(0); expect(store.errorCode).toBeUndefined();
  });
});
