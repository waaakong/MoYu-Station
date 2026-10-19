import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { MessageNotificationClick, MessageNotificationResult } from '@studyroom/contracts';

const id = z.string().regex(/^[1-9][0-9]{0,18}$/);
const contextSchema = z.object({ owner: id.nullable(), scope: z.string().min(1).max(100), suppressed: z.boolean() }).strict();
const showSchema = z.object({ token: z.string().uuid(), peer: id.nullable(), key: z.string().min(1).max(4096), summary: z.boolean() }).strict();
const dismissSchema = showSchema.pick({ token: true, key: true }).strict();
type NativeNotice = { show(): void; close(): void; on(event: string, callback: () => void): unknown };
type Dependencies = {
  identity: () => { owner: string | null; epoch: number };
  foreground: () => boolean;
  supported: () => boolean;
  create: (summary: boolean) => NativeNotice;
  activate: (value: MessageNotificationClick) => void;
  now?: () => number;
};

/** Main owns visibility, verified cloud identity and notification lifetime; no URLs or content enter IPC. */
export class MessageNotificationService {
  private context: { owner: string; epoch: number; scope: string; token: string; suppressed: boolean } | null = null;
  private notices = new Map<NativeNotice, string>();
  private seen = new Set<string>();
  private lastShown = -Infinity;
  constructor(private readonly deps: Dependencies) {}
  clear() {
    this.context = null; this.seen.clear(); this.lastShown = -Infinity;
    this.closeNotices();
  }
  private closeNotices(key?: string) {
    for (const [notice, noticeKey] of this.notices) {
      if (key !== undefined && key !== noticeKey) continue;
      this.notices.delete(notice);
      try { notice.close(); } catch { /* Already closed by the OS. */ }
    }
  }
  dismiss(input: unknown): void {
    const value = dismissSchema.parse(input), context = this.context, identity = this.deps.identity();
    if (!context || context.token !== value.token || context.owner !== identity.owner || context.epoch !== identity.epoch) throw new Error('NOTIFICATION_SESSION_REJECTED');
    this.closeNotices(value.key);
  }
  configure(input: unknown): string | null {
    const value = contextSchema.parse(input), identity = this.deps.identity();
    if (!value.owner) { this.clear(); return null; }
    if (value.owner !== identity.owner) { this.clear(); throw new Error('NOTIFICATION_SESSION_REJECTED'); }
    if (this.context?.owner !== identity.owner || this.context?.epoch !== identity.epoch || this.context?.scope !== value.scope) {
      this.clear();
      this.context = { owner: value.owner, epoch: identity.epoch, scope: value.scope, token: randomUUID(), suppressed: value.suppressed };
    }
    this.context!.suppressed = value.suppressed;
    if (value.suppressed) this.closeNotices();
    return this.context!.token;
  }
  async show(input: unknown): Promise<MessageNotificationResult> {
    const value = showSchema.parse(input), context = this.context, identity = this.deps.identity();
    if (!context || context.token !== value.token || context.owner !== identity.owner || context.epoch !== identity.epoch) throw new Error('NOTIFICATION_SESSION_REJECTED');
    if (context.suppressed) return 'suppressed';
    if (this.deps.foreground()) return 'foreground';
    if (this.seen.has(value.key)) return 'shown';
    const now = this.deps.now?.() ?? Date.now();
    if (!this.deps.supported() || now - this.lastShown < 1500) return 'unavailable';
    try {
      this.closeNotices();
      const notice = this.deps.create(value.summary);
      // Keep a reference even after OS timeout: it can still be present in Action Center.
      let finish!: (result: MessageNotificationResult) => void;
      const shown = new Promise<MessageNotificationResult>(resolve => { finish = resolve; });
      const timeout = setTimeout(() => { try { notice.close(); } catch {} finish('unavailable'); }, 2000);
      notice.on('show', () => { clearTimeout(timeout); finish('shown'); });
      notice.on('failed', () => { clearTimeout(timeout); this.seen.delete(value.key); finish('unavailable'); });
      notice.on('click', () => {
        const current = this.deps.identity();
        if (!this.notices.has(notice) || this.context !== context || context.suppressed || current.owner !== context.owner || current.epoch !== context.epoch) return;
        this.closeNotices(value.key);
        this.deps.activate({ token: context.token, peer: value.peer });
      });
      this.notices.set(notice, value.key);
      notice.show();
      this.seen.add(value.key); if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value!);
      this.lastShown = now;
      const result = await shown;
      if (result !== 'shown') this.seen.delete(value.key);
      return result;
    } catch { return 'unavailable'; }
  }
}
