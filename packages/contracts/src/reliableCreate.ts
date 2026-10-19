import type { EntityId } from './entityId';
export type ReliableCreateKind = 'COMMENT' | 'FEEDBACK' | 'INVITATION';
export interface ReliableCreateCapabilities { reliableCreate: boolean }
export type ReliableCreateReceipt = {status:'missing';requestId:string} | {status:'committed';requestId:string;targetId:EntityId};
