import { entityId } from '@studyroom/contracts';

const keys = new Set(['id', 'userId', 'senderId', 'receiverId', 'conversationId', 'lastMessageId',
  'messageId', 'recalledById', 'postId', 'authorId', 'actorId', 'actorUserId', 'parentId',
  'replyToUserId', 'recordId', 'cloudRecordId', 'targetId', 'peerId']);
/** A rounded legacy JSON number cannot be recovered. Refuse the response before it enters UI state. */
export function assertExactEntityIds(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) { for (const item of value) assertExactEntityIds(item); return; }
  for (const [key, item] of Object.entries(value)) {
    if (keys.has(key) && typeof item === 'number') entityId(item);
    if (keys.has(key) && typeof item === 'string' && /^[0-9]+$/.test(item)) entityId(item);
    if (key === 'followingIds' || key === 'visibleIds') {
      if (Array.isArray(item)) for (const id of item) entityId(id);
    }
    assertExactEntityIds(item);
  }
}
