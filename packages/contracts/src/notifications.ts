export interface NotificationContextRequest { owner: string | null; scope: string; suppressed: boolean }
export interface MessageNotificationRequest { token: string; peer: string | null; key: string; summary: boolean }
export interface MessageNotificationClick { token: string; peer: string | null }
export interface MessageNotificationDismiss { token: string; key: string }
export type MessageNotificationResult = 'shown' | 'foreground' | 'unavailable' | 'suppressed';
export interface DesktopNotificationsBridge {
  configure(request: NotificationContextRequest): Promise<string | null>;
  show(request: MessageNotificationRequest): Promise<MessageNotificationResult>;
  dismiss(request: MessageNotificationDismiss): Promise<void>;
  onClick(listener: (event: MessageNotificationClick) => void): () => void;
}
