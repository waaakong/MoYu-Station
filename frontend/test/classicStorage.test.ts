import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newPuzzle, swapPuzzle } from '@studyroom/contracts';
const quit = vi.hoisted(() => ({ saves: new Set<() => Promise<void>>() }));
vi.mock('../src/window/quitPreparation', () => ({ registerQuitSaver: (save: () => Promise<void>) => { quit.saves.add(save); return () => quit.saves.delete(save); } }));
import { ClassicStorage } from '../src/entertainment/classicStorage';
const key = 'studyroom-entertainment-v1:puzzle';
const first = () => newPuzzle(3, '11111111-1111-4111-8111-111111111111', () => .4);
const second = () => newPuzzle(4, '22222222-2222-4222-8222-222222222222', () => .4);
let values: Map<string, string>;
beforeEach(() => {
  values = new Map(); quit.saves.clear();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } });
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', { locks: { request: (_key: string, _options: unknown, callback: (lock: object) => Promise<void>) => callback({}) } });
});
afterEach(() => vi.unstubAllGlobals());

describe('classic persistence lifecycle', () => {
  it('serializes a move followed by a new round and rejects an obsolete revision', async () => {
    const storage = new ClassicStorage('puzzle'); await storage.open();
    const a = first(); const b = swapPuzzle(a, 0, 1); const fresh = second();
    await Promise.all([storage.save(a), storage.save(b), storage.save(fresh)]);
    expect(JSON.parse(values.get(key)!)).toEqual(fresh);
    await expect(storage.save(b)).rejects.toThrow('GAME_REVISION_CONFLICT');
    expect(JSON.parse(values.get(key)!)).toEqual(fresh);
    expect(storage.writable).toBe(false); await storage.close();
  });

  it.each(['{broken', '{"version":999,"toolId":"puzzle"}', 'x'.repeat(32769)])('preserves unreadable original data', async text => {
    values.set(key, text); const storage = new ClassicStorage('puzzle');
    expect(await storage.open()).toBeUndefined(); expect(storage.writable).toBe(false);
    await storage.save(first()); expect(values.get(key)).toBe(text); await storage.close();
  });

  it('disk failure prevents later queued writes and is reported to normal quit', async () => {
    const storage = new ClassicStorage('puzzle'); await storage.open(); const game = first(); await storage.save(game);
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('QUOTA_EXCEEDED'); });
    await expect(storage.save(swapPuzzle(game, 0, 1))).rejects.toThrow('QUOTA_EXCEEDED');
    await expect([...quit.saves][0]!()).rejects.toThrow('游戏保存异常');
    expect(JSON.parse(values.get(key)!)).toEqual(game);
    await storage.close(); expect(quit.saves.size).toBe(0);
    await expect(storage.save(second())).rejects.toThrow('GAME_SESSION_CLOSED');
  });

  it('closing waits for queued IPC writes and unregisters the quit saver', async () => {
    let finish!: () => void;
    const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    vi.stubGlobal('window', { studyRoomDesktop: { readEntertainmentState: async () => undefined, saveEntertainmentState: save } });
    const storage = new ClassicStorage('puzzle'); await storage.open();
    const writing = storage.save(first()); await Promise.resolve();
    let closed = false; const closing = storage.close().then(() => { closed = true; });
    await Promise.resolve(); expect(closed).toBe(false); expect(quit.saves.size).toBe(1);
    finish(); await writing; await closing;
    expect(closed).toBe(true); expect(quit.saves.size).toBe(0);
  });

  it('a denied web lock or missing locks never writes', async () => {
    for (const locks of [undefined, { request: async (_key: string, _options: unknown, callback: (lock: null) => Promise<void>) => callback(null) }]) {
      vi.stubGlobal('navigator', { locks });
      const storage = new ClassicStorage('puzzle'); await storage.open(); await storage.save(first());
      expect(storage.writable).toBe(false); expect(values.has(key)).toBe(false); await storage.close();
    }
  });
});
