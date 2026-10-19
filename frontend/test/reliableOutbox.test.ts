import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReliableOutbox, type PendingText } from '../src/chat/reliableOutbox';
describe('session text outbox', () => {
  afterEach(() => vi.useRealTimers());
  it('times out at 12 seconds, never auto retries, and freezes original target/content/id', () => {
    vi.useFakeTimers(); const items: PendingText[] = [], box = new ReliableOutbox(items), send = vi.fn(() => true);
    box.enqueue(1, { channelType: 'PRIVATE', receiverId: 2 }, 'hello', send, 'id');
    vi.advanceTimersByTime(11999); expect(items[0].sendState).toBe('sending');
    vi.advanceTimersByTime(1); expect(items[0].sendState).toBe('unconfirmed');
    vi.advanceTimersByTime(60000); expect(send).toHaveBeenCalledTimes(1);
    box.retry('id', send); expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(items).toHaveLength(1); box.clear(); expect(vi.getTimerCount()).toBe(0);
  });
  it('only settles a matching sender, channel and recipient; duplicate receipts are harmless', () => {
    vi.useFakeTimers(); const items: PendingText[] = [], box = new ReliableOutbox(items);
    box.enqueue(1, { channelType: 'PRIVATE', receiverId: 2 }, 'hello', () => true, 'id');
    const receipt = { id: 99, clientMessageId: 'id', senderId: 1, receiverId: 2, channelType: 'PRIVATE' };
    expect(box.acknowledge({ ...receipt, receiverId: 3 })).toBe(false);
    expect(box.acknowledge({ ...receipt, senderId: 3 })).toBe(false);
    expect(box.acknowledge({ ...receipt, channelType: 'HALL' })).toBe(false);
    expect(box.acknowledge(receipt)).toBe(true); expect(box.acknowledge(receipt)).toBe(false);
    expect(items).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('disconnected writes fail visibly; clearing a session cancels all delayed work', () => {
    vi.useFakeTimers(); const items: PendingText[] = [], box = new ReliableOutbox(items);
    box.enqueue(1, { channelType: 'HALL' }, 'hello', () => false, 'id');
    expect(items[0].sendState).toBe('failed'); expect(vi.getTimerCount()).toBe(0);
    box.retry('id', () => true); box.clear(); vi.runAllTimers();
    expect(items).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  });
  it('does not treat a thrown transport call as proof of non-delivery', () => {
    const items: PendingText[] = [], box = new ReliableOutbox(items);
    box.enqueue(1, { channelType: 'HALL' }, 'hello', () => { throw Error('unknown'); }, 'id');
    expect(items[0].sendState).toBe('unconfirmed');
  });
});
