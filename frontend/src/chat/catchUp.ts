import { lastMessageId, type IdentifiedMessage } from './messageMerge';

/** Drain forward pages; a truncated 80-row page is not proof that reconnect recovery is finished. */
export async function catchUpMessages<T extends IdentifiedMessage>(
  afterId: string | number | undefined,
  fetchPage: (afterId: string | number | undefined) => Promise<T[]>,
  applyPage: (messages: T[]) => void,
  current: () => boolean
) {
  let cursor = afterId;
  for (let page = 0; page < 100; page++) {
    const messages = await fetchPage(cursor);
    if (!current()) return;
    applyPage(messages);
    if (!cursor || messages.length < 80) return;
    const next = lastMessageId(messages);
    if (!next || BigInt(next) <= BigInt(cursor)) throw new Error('消息游标未前进，请重新加载会话。');
    cursor = next;
  }
  throw new Error('本次已补拉 8000 条消息，仍可能有新消息；请重新进入会话继续同步。');
}
