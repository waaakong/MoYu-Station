import type { EntityId } from "./entityId";
/** No URL, cookies, arbitrary headers or local file paths cross this bridge. */
export interface MediaDescriptor {
  assetId: string;
  purpose: "social" | "sticker" | "scene";
  width: number;
  height: number;
  thumbnailUrl: string;
  clearUrl: string;
  mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  animated: boolean;
  /** Static first-frame preview; only present for qualified animated media. */
  posterUrl?: string | null;
}

export interface CloudRequest {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  json?: string;
  binary?: { type: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; bytes: Uint8Array };
  form?: Array<{ name: string; value?: string; file?: { name: string; type: string; bytes: Uint8Array } }>;
}

export interface CloudResponse {
  status: number;
  data: unknown;
  retryAfter: string;
}

export type CloudStreamKind = "chat" | "notifications" | "dashboard";
export type ChatCapabilities = { reliableText: boolean; bidirectionalHistory: boolean; conversationPages: boolean; boundedRead?: boolean; privateMessageDeletion?: boolean };
export type ChatConversationSummary = {
  conversationId: EntityId; userId: EntityId; username: string; nickname: string | null; avatarUrl: string | null;
  onlineStatus: string; available: boolean; lastMessageId: EntityId; preview: string; updatedAt: string; unreadCount: number;
};
export type ChatConversationPage = { items: ChatConversationSummary[]; nextCursor: string | null };
export type MediaCapabilities = { social: boolean; sticker: boolean; scene: boolean };
export type StickerFavorite = { id: string; assetId: string; clearUrl: string; thumbUrl: string; mime: MediaDescriptor['mime']; width: number; height: number };
export type StickerCollection = { version: number; items: StickerFavorite[] };
export interface CloudStreamEvent {
  id: string;
  type: "open" | "message" | "error" | "close";
  event?: string;
  data?: string;
}

export interface DesktopCloudBridge {
  sceneCache?(request: import('./sceneCache').SceneCacheRequest): Promise<import('./sceneCache').SceneCacheRecord | null>;
  readonly origin: string;
  request(request: CloudRequest): Promise<CloudResponse>;
  openStream(request: { id: string; kind: CloudStreamKind }): Promise<void>;
  closeStream(id: string): Promise<void>;
  sendChat(request: { id: string; data: string }): Promise<void>;
  onStreamEvent(listener: (event: CloudStreamEvent) => void): () => void;
}
