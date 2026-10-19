import { describe, it, expect } from 'vitest';
import { MessageNoticePolicy, type NoticeContext } from '../src/notifications/messagePolicy';
const context: NoticeContext = { owner: '2', suppressed: false, foreground: true, visiblePeer: null };
const message = { id: '9007199254740993', senderId: '3', receiverId: '2', senderName: '同学', mine: false };
const unread = [{ senderId: '3', unreadCount: 2, createdAt: '2026-10-05T10:00:00' }];
describe('message reminder policy', () => {
  it('keeps exact IDs and deduplicates live events', () => {
    const policy = new MessageNoticePolicy();
    expect(policy.receive(message, context)?.peer).toBe('3');
    expect(policy.receive(message, context)).toBeNull();
    expect(policy.receive({ ...message, id: 123 }, context)).toBeNull();
  });
  it('never notifies own messages or messages for another owner', () => {
    const policy = new MessageNoticePolicy();
    expect(policy.receive({ ...message, mine: true }, context)).toBeNull();
    expect(policy.receive({ ...message, receiverId: '4' }, context)).toBeNull();
    expect(policy.receive({ ...message, senderId: '2' }, context)).toBeNull();
  });
  it('mutes running and paused sessions without replaying individual messages', () => {
    const policy = new MessageNoticePolicy();
    expect(policy.receive(message, { ...context, suppressed: true })).toBeNull();
    expect(policy.pending).toBe(true);
    expect(policy.summary(unread, { ...context, suppressed: true })).toBeNull();
    expect(policy.summary(unread, context)?.summary).toBe(true);
    expect(policy.summary(unread, context)).toBeNull();
    expect(policy.receive(message, context)).toBeNull();
  });
  it('does not summarize messages already read on another client', () => {
    const policy = new MessageNoticePolicy(); policy.defer();
    expect(policy.summary([], context)).toBeNull(); expect(policy.pending).toBe(false);
  });
  it('visible conversation suppresses foreground but not background reminders', () => {
    expect(new MessageNoticePolicy().receive(message, { ...context, visiblePeer: '3' })).toBeNull();
    expect(new MessageNoticePolicy().receive(message, { ...context, visiblePeer: '3', foreground: false })).not.toBeNull();
    expect(new MessageNoticePolicy().summary(unread, { ...context, visiblePeer: '3' })).toBeNull();
  });
  it('failed delivery can be recovered with a fresh authoritative summary', () => {
    const policy = new MessageNoticePolicy(); expect(policy.summary(unread, context)).not.toBeNull();
    policy.defer(); expect(policy.summary(unread, context)).not.toBeNull();
  });
});
