import { entityId, sameEntityId, type EntityId } from "@studyroom/contracts";
export type SendState = 'sending' | 'unconfirmed' | 'failed';
export type TextTarget = Readonly<{ channelType: 'HALL' | 'PRIVATE'; receiverId?: EntityId }>;
export type PendingText = {
  id: string; clientMessageId: string; senderId: EntityId; channelType: 'HALL' | 'PRIVATE'; receiverId?: EntityId;
  content: string; messageType: 'TEXT'; mine: true; senderName: string; createdAt: string; sendState: SendState;
};
export type TextFrame = { type: string; payload: { clientMessageId: string; receiverId?: EntityId; messageType: 'TEXT'; content: string } };
type Receipt = { id?: string | number; clientMessageId?: string; senderId?: EntityId; receiverId?: EntityId | null; channelType?: string };

/** Memory only. A socket write is not delivery; no background or reconnect retransmission. */
export class ReliableOutbox {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(readonly items: PendingText[]) {}

  enqueue(senderId: EntityId, target: TextTarget, content: string, dispatch: (frame: TextFrame) => boolean, id: string = crypto.randomUUID()) {
    entityId(senderId);
    const text = content.trim();
    if (!text || text.length > 1000) throw new Error('消息应为 1–1000 个字符。');
    if (this.items.length >= 100) throw new Error('待处理消息已达 100 条，请先确认原任务。');
    if (this.items.some(item => item.clientMessageId === id)) throw new Error('消息 ID 已存在。');
    if (target.channelType === 'PRIVATE' && (!entityId(target.receiverId) || sameEntityId(target.receiverId, senderId))) throw new Error('请选择私聊用户。');
    this.items.push({ id: `pending:${id}`, clientMessageId: id, senderId, channelType: target.channelType, receiverId: target.receiverId,
      content: text, messageType: 'TEXT', mine: true, senderName: '我', createdAt: '', sendState: 'sending' });
    this.attempt(id, dispatch);
    return id;
  }

  retry(id: string, dispatch: (frame: TextFrame) => boolean) {
    const item = this.items.find(item => item.clientMessageId === id);
    if (!item || item.sendState === 'sending') return;
    this.attempt(id, dispatch);
  }

  acknowledge(receipt: Receipt) {
    if (!receipt.id || !receipt.clientMessageId) return false;
    const index = this.items.findIndex(item => item.clientMessageId === receipt.clientMessageId && sameEntityId(item.senderId, receipt.senderId)
      && item.channelType === receipt.channelType && (item.channelType === 'HALL' ? receipt.receiverId == null : sameEntityId(item.receiverId, receipt.receiverId)));
    if (index < 0) return false;
    this.cancelTimer(receipt.clientMessageId);
    this.items.splice(index, 1);
    return true;
  }

  reject(id: string) {
    const item = this.items.find(item => item.clientMessageId === id);
    if (item) { this.cancelTimer(id); item.sendState = 'failed'; }
  }

  clear() { for (const timer of this.timers.values()) clearTimeout(timer); this.timers.clear(); this.items.splice(0); }
  private cancelTimer(id: string) { clearTimeout(this.timers.get(id)); this.timers.delete(id); }
  private attempt(id: string, dispatch: (frame: TextFrame) => boolean) {
    const item = this.items.find(item => item.clientMessageId === id);
    if (!item) return;
    this.cancelTimer(id); item.sendState = 'sending';
    // Freeze the request's identity/content/recipient independently of the currently selected conversation.
    const frame = { type: item.channelType === 'HALL' ? 'HALL_MESSAGE_SEND' : 'PRIVATE_MESSAGE_SEND', payload: Object.freeze({
      clientMessageId: item.clientMessageId, ...(item.receiverId != null ? { receiverId: item.receiverId } : {}), messageType: 'TEXT' as const, content: item.content
    }) };
    try {
      if (!dispatch(frame)) { item.sendState = 'failed'; return; }
    } catch { item.sendState = 'unconfirmed'; return; }
    if (!this.items.includes(item)) return; // A synchronous receipt may already have settled it.
    this.timers.set(id, setTimeout(() => {
      this.timers.delete(id);
      if (this.items.includes(item) && item.sendState === 'sending') item.sendState = 'unconfirmed';
    }, 12_000));
  }
}
