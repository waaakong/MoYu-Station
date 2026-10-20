import { it, expect, vi } from 'vitest';
import { FeedNotificationSync, type FeedNotice } from '../src/feed/notificationSync';
const notice = (key: string): FeedNotice => ({ key, postId: '10', createdAt: `2026-10-05T10:00:0${key}` });
function setup() {
  const pending: Array<{ resolve: (rows: FeedNotice[]) => void; reject: (error: Error) => void }> = [];
  const update = vi.fn(), error = vi.fn();
  const sync = new FeedNotificationSync({ fetch: () => new Promise((resolve, reject) => pending.push({ resolve, reject })), update, error });
  sync.start(); return { sync, pending, update, error };
}
it('snapshot retains events received during fetch and deduplicates stable keys', async () => {
  const { sync, pending, update } = setup(); const task = sync.refresh();
  sync.receive(notice('2')); sync.receive(notice('2'));
  pending[0].resolve([notice('1')]); await task;
  expect(update).toHaveBeenLastCalledWith([notice('2'), notice('1')]);
});
it('newer requests win even if an older response arrives last', async () => {
  const { sync, pending, update } = setup(); const a = sync.refresh(), b = sync.refresh();
  pending[1].resolve([notice('2')]); await b; pending[0].resolve([notice('1')]); await a;
  expect(update).toHaveBeenCalledTimes(1); expect(update).toHaveBeenLastCalledWith([notice('2')]);
});
it('leaving the page discards late responses and socket events; returning refreshes', async () => {
  const { sync, pending, update } = setup(); const a = sync.refresh(); sync.stop(); sync.receive(notice('1'));
  sync.start(); const b = sync.refresh(); pending[0].resolve([notice('1')]); await a;
  expect(update).not.toHaveBeenCalled(); pending[1].resolve([notice('2')]); await b;
  expect(update).toHaveBeenLastCalledWith([notice('2')]);
});
it('failed refresh preserves list and a later authoritative snapshot removes stale notices', async () => {
  const { sync, pending, update, error } = setup(); sync.receive(notice('1'));
  const a = sync.refresh(); pending[0].reject(new Error('断网')); await a;
  expect(update).toHaveBeenLastCalledWith([notice('1')]); expect(error).toHaveBeenLastCalledWith('断网');
  const b = sync.refresh();
  expect(error).toHaveBeenLastCalledWith('断网');
  pending[1].resolve([]); await b;
  expect(update).toHaveBeenLastCalledWith([]); expect(error).toHaveBeenLastCalledWith('');
});
it('invalid payloads are not presented as empty success', async () => {
  const { sync, pending, update, error } = setup(); const task = sync.refresh();
  pending[0].resolve([{ postId: '1' } as FeedNotice]); await task;
  expect(update).not.toHaveBeenCalled(); expect(error).toHaveBeenLastCalledWith('互动通知响应无效。');
});
