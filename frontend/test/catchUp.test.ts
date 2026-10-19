import { describe, expect, it, vi } from 'vitest';
import { catchUpMessages } from '../src/chat/catchUp';
describe('forward catch-up', () => {
  it('drains more than one page and uses the last server id', async () => {
    const fetch = vi.fn(async (after: string | number | undefined) => Number(after) < 161 ? Array.from({ length: 80 }, (_, i) => ({ id: Number(after) + i + 1 })) : [{ id: 162 }]);
    const items: number[] = [];
    await catchUpMessages(1, fetch, page => items.push(...page.map(m => m.id)), () => true);
    expect(fetch.mock.calls.map(c => c[0])).toEqual([1, 81, 161]); expect(items).toHaveLength(161);
  });
  it('ignores a late response after account invalidation', async () => {
    const apply = vi.fn(); await catchUpMessages(1, async () => [{ id: 2 }], apply, () => false); expect(apply).not.toHaveBeenCalled();
  });
  it('rejects non-progressing pages instead of looping', async () => {
    await expect(catchUpMessages(80, async () => Array.from({ length: 80 }, (_, i) => ({ id: i + 1 })), () => {}, () => true)).rejects.toThrow('游标');
  });
});
