import { describe, expect, it, vi } from 'vitest';
import { createStartupRunner } from '../src/startup/runner';

function surface() { return { stage: vi.fn(), ready: vi.fn(), fail: vi.fn(), bindRestart: vi.fn(), dispose: vi.fn() }; }

describe('desktop local startup', () => {
  it('runs in order and exposes readiness only after the final frame', async () => {
    const ui = surface(), calls: string[] = [], runner = createStartupRunner(ui);
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const result = runner.run([
      { label: '恢复队列', run: () => { calls.push('queue'); } },
      { label: '准备首屏', run: () => pending }
    ]);
    await vi.waitFor(() => expect(ui.stage).toHaveBeenLastCalledWith('准备首屏'));
    expect(ui.ready).not.toHaveBeenCalled();
    release(); expect(await result).toBe(true);
    expect(calls).toEqual(['queue']); expect(ui.ready).toHaveBeenCalledTimes(1);
  });
  it('deduplicates concurrent and late runs', async () => {
    const ui = surface(), runner = createStartupRunner(ui), run = vi.fn();
    const a = runner.run([{ label: '初始化', run }]);
    expect(runner.run([{ label: '重复', run }])).toBe(a);
    await a; await runner.run([{ label: '再次', run }]);
    expect(run).toHaveBeenCalledTimes(1); expect(ui.ready).toHaveBeenCalledTimes(1);
  });
  it('fails closed with a safe stage message without exposing private errors', async () => {
    const ui = surface(), later = vi.fn();
    expect(await createStartupRunner(ui).run([
      { label: '恢复播放队列', run: () => { throw new Error('private path or token'); } },
      { label: '后续', run: later }
    ])).toBe(false);
    expect(ui.fail).toHaveBeenCalledExactlyOnceWith('恢复播放队列未完成');
    expect(later).not.toHaveBeenCalled(); expect(ui.ready).not.toHaveBeenCalled();
  });
  it('ignores a late completion after cancellation', async () => {
    const ui = surface(), runner = createStartupRunner(ui), later = vi.fn();
    let release!: () => void;
    const pending = runner.run([{ label: '队列', run: () => new Promise<void>(r => { release = r; }) }, { label: '声音', run: later }]);
    runner.cancel(); release();
    expect(await pending).toBe(false); expect(later).not.toHaveBeenCalled(); expect(ui.ready).not.toHaveBeenCalled();
  });
  it('runs on web without a desktop surface', async () => {
    const run = vi.fn(); expect(await createStartupRunner().run([{ label: '本地', run }])).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
