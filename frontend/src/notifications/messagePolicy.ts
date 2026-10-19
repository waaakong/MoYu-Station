export type MessageNotice = { key: string; peer: string | null; text: string; summary: boolean };
export type NoticeContext = { owner: string; suppressed: boolean; foreground: boolean; visiblePeer: string | null };
export const entityId = (value: unknown): value is string => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value);

/** Session-local delivery policy. It never changes message bodies or server read markers. */
export class MessageNoticePolicy {
  private seen = new Set<string>();
  private summarySignature = '';
  pending = false;
  messageRevision = 0;

  receive(value: any, context: NoticeContext): MessageNotice | null {
    if (!entityId(value?.id) || !entityId(value?.senderId) || value.senderId === context.owner
      || value.mine || value.receiverId !== context.owner || this.seen.has(value.id)) return null;
    this.seen.add(value.id);
    if (this.seen.size > 1000) this.seen.delete(this.seen.values().next().value!);
    this.messageRevision++;
    if (context.suppressed) { this.pending = true; return null; }
    if (context.foreground && context.visiblePeer === value.senderId) return null;
    return { key: value.id, peer: value.senderId, text: `${String(value.senderName || '有人').slice(0, 60)} 发来私信`, summary: false };
  }

  summary(rows: any[], context: NoticeContext): MessageNotice | null {
    if (context.suppressed) { this.pending = true; return null; }
    const unread = rows.filter(row => entityId(row?.senderId) && row.senderId !== context.owner
      && Number.isSafeInteger(row.unreadCount) && row.unreadCount > 0);
    const signature = unread.map(row => `${row.senderId}:${row.unreadCount}:${row.createdAt || ''}`).sort().join('|');
    const visible = unread.filter(row => !(context.foreground && context.visiblePeer === row.senderId));
    this.pending = false;
    if (signature === this.summarySignature) return null;
    this.summarySignature = signature;
    if (!visible.length) return null;
    const count = visible.reduce((sum, row) => sum + row.unreadCount, 0);
    return { key: `summary:${signature}`, peer: visible.length === 1 ? visible[0].senderId : null,
      text: `你有 ${count} 条未读私信，来自 ${visible.length} 个会话`, summary: true };
  }

  defer() { this.pending = true; this.summarySignature = ''; }
}
