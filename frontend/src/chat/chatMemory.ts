import { reactive } from 'vue';
import { ReliableOutbox, type PendingText } from './reliableOutbox';
import { clearStickerOutbox } from './stickerOutbox';

// The lifetime is the authenticated account session, not a route or localStorage.
export type ReadingAnchor = { id: string; offset: number; bottom: boolean };
export const chatMemory = reactive({ hallDraft: '', privateDrafts: {} as Record<string, string>, pending: [] as PendingText[],
  deletedIds:new Set<string>(),
  anchors: {} as Record<string, ReadingAnchor>, hall: [] as any[], records: {} as Record<string, any[]>, activeUserId: null as string | number | null });
export const textOutbox = new ReliableOutbox(chatMemory.pending);
export function hidePrivateMessage(messageId:string,peerId:string){
  if(!/^[1-9][0-9]*$/.test(messageId)||!/^[1-9][0-9]*$/.test(peerId))return;
  chatMemory.deletedIds.add(messageId);
  const records=chatMemory.records[peerId];if(records)chatMemory.records[peerId]=records.filter(message=>String(message.id)!==messageId);
}
export function clearChatMemory() {
  clearStickerOutbox();
  chatMemory.deletedIds.clear();
  textOutbox.clear(); chatMemory.hallDraft = '';
  for (const key of Object.keys(chatMemory.privateDrafts)) delete chatMemory.privateDrafts[key];
  for (const key of Object.keys(chatMemory.anchors)) delete chatMemory.anchors[key];
  for (const key of Object.keys(chatMemory.records)) delete chatMemory.records[key];
  chatMemory.hall = []; chatMemory.activeUserId = null;
}
