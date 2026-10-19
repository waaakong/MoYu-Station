import { watch } from 'vue';
import type { Router } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { useFocusStore } from '../stores/focus';
import { createChatSocket, fetchPrivateUnread } from '../services/chat';
import { messageNotices } from './state';
import { entityId, MessageNoticePolicy, type MessageNotice } from './messagePolicy';

/** Lives above routes; subscription and all reminder state are scoped to one authenticated generation. */
export function startMessageNotifications(router: Router) {
  const auth = useAuthStore(), focus = useFocusStore(), native = window.studyRoomDesktop?.notifications;
  let cleanup = () => {};
  const stop = watch(() => [auth.user?.id, auth.sessionGeneration, auth.authTransition, auth.isBanned], () => {
    cleanup();
    messageNotices.notice = null; messageNotices.unread = 0; messageNotices.error = '';
    messageNotices.open = () => {}; messageNotices.retry = () => {};
    const owner = String(auth.user?.id || ''), generation = auth.sessionGeneration;
    const scope = `${generation}:${owner || 'guest'}`;
    const valid = () => !disposed && entityId(owner) && String(auth.user?.id || '') === owner
      && auth.sessionGeneration === generation && !auth.authTransition && !auth.isBanned;
    let disposed = false, query = 0, token: string | null = null, toastTimer = 0;
    let browserNotice: Notification | undefined;
    let activeNotice: MessageNotice | null = null;
    const policy = new MessageNoticePolicy();
    const foreground = () => document.visibilityState === 'visible' && document.hasFocus();
    const suppressed = () => focus.timerState === 'running' || focus.timerState === 'paused';
    const context = () => ({ owner, suppressed: suppressed(), foreground: foreground(), visiblePeer: messageNotices.activePeer });
    let nativeReady: Promise<unknown> = Promise.resolve();
    const configure = () => {
      const operation = native?.configure({ owner: valid() ? owner : null, scope, suppressed: suppressed() });
      nativeReady = Promise.resolve(operation).then(value => { if (valid()) token = value ?? null; }).catch(() => { token = null; });
    };
    if (!valid()) { configure(); cleanup = () => { disposed = true; }; return; }
    function dismiss(notice: MessageNotice | null) {
      if (!notice || activeNotice?.key !== notice.key) return;
      activeNotice = null;
      if (messageNotices.notice?.key === notice.key) messageNotices.notice = null;
      clearTimeout(toastTimer);
      browserNotice?.close(); browserNotice = undefined;
      const currentToken = token;
      if (currentToken) void native?.dismiss({ token: currentToken, key: notice.key }).catch(() => {});
    }
    const open = (peer: string | null) => {
      if (!valid() || (peer !== null && !entityId(peer))) return;
      dismiss(activeNotice);
      messageNotices.notice = null;
      void router.push({ name: 'chat', query: peer ? { peer } : { unread: '1' } });
    };
    messageNotices.open = open;
    function toast(notice: MessageNotice) {
      if (!valid() || suppressed()) { policy.defer(); return; }
      if (notice.peer && foreground() && notice.peer === messageNotices.activePeer) return;
      messageNotices.notice = notice;
      clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => { if (valid()) messageNotices.notice = null; }, 7000);
    }
    async function deliver(notice: MessageNotice) {
      if (!valid() || suppressed()) { policy.defer(); return; }
      activeNotice = notice;
      if (native) {
        await nativeReady;
        if (!valid() || suppressed() || activeNotice?.key !== notice.key) { policy.defer(); return; }
        try {
          if (!token) throw new Error('NOTIFICATION_NOT_READY');
          const result = await native.show({ token, peer: notice.peer, key: notice.key.slice(0, 4096), summary: notice.summary });
          if (!valid() || activeNotice?.key !== notice.key) return;
          if (result === 'foreground') toast(notice);
          else if (result !== 'shown') { policy.defer(); if (result === 'unavailable' && foreground()) toast(notice); }
        } catch { if (valid() && activeNotice?.key === notice.key) { policy.defer(); if (foreground()) toast(notice); } }
      } else if (foreground()) toast(notice);
      else if (!window.studyRoomDesktop && 'Notification' in window && Notification.permission === 'granted') {
        try {
          browserNotice?.close();
          const created = new Notification('墨屿自习室', { body: '你有新私信，点击查看。', tag: 'moyu-private-message', silent: true });
          browserNotice = created;
          created.onclick = () => { if (browserNotice === created && valid() && !suppressed()) { window.focus(); open(notice.peer); } created.close(); };
          created.onerror = () => { if (valid() && browserNotice === created) policy.defer(); };
        } catch { policy.defer(); }
      } else policy.defer();
    }
    async function refresh(announce: boolean) {
      const request = ++query, revision = policy.messageRevision, existing = activeNotice;
      try {
        const rows = await fetchPrivateUnread();
        if (!valid() || request !== query) return;
        if (!Array.isArray(rows)) throw new Error('未读消息响应无效');
        if (revision !== policy.messageRevision) return; // A newer message invalidates this snapshot, including its count.
        messageNotices.unread = rows.reduce((sum, row) => sum + (Number.isSafeInteger(row.unreadCount) && row.unreadCount > 0 ? row.unreadCount : 0), 0);
        messageNotices.error = '';
        if (existing && activeNotice?.key === existing.key) {
          const unread = rows.filter(row => entityId(row.senderId) && Number.isSafeInteger(row.unreadCount) && row.unreadCount > 0);
          if (!unread.length || existing.peer && !unread.some(row => row.senderId === existing.peer)) dismiss(existing);
          else if (existing.summary) {
            const updated = policy.summary(rows, context());
            if (updated && updated.key !== existing.key) { dismiss(existing); await deliver(updated); }
          }
        }
        if (announce && revision === policy.messageRevision) {
          const notice = policy.summary(rows, context());
          if (notice) await deliver(notice);
        }
      } catch {
        if (valid() && request === query) { messageNotices.error = '私信未读同步失败'; if (announce) policy.defer(); }
      }
    }
    configure();
    const removeClick = native?.onClick(value => { if (value.token === token && valid() && !suppressed()) open(value.peer); });
    const socket = createChatSocket({
      onOpen: () => { if (valid()) { configure(); void refresh(true); } },
      onMessage: (event: any) => {
        if (!valid()) return;
        if (event.type === 'PRIVATE_MESSAGE_RECEIVE') {
          const notice = policy.receive(event.payload, context());
          if (notice) void deliver(notice);
        } else if (event.type === 'PRIVATE_UNREAD_UPDATE' && Array.isArray(event.payload)) {
          // Events carry no revision/read boundary. Query a fresh snapshot before dismissing;
          // an old zero-count event must not remove a newer message's reminder.
          void refresh(false);
        } else if (event.type === 'PRIVATE_MESSAGE_DELETED' || event.type === 'PRIVATE_MESSAGE_RECALLED') {
          messageNotices.notice = null; void refresh(false);
        } else if (event.type === 'MEDIA_PUBLICATION_COMMITTED' && event.payload?.kind === 'PRIVATE') {
          void refresh(false);
        } else if (event.type === 'ERROR' && ['AUTH_REQUIRED','AUTH_SESSION_EXPIRED','ACCOUNT_LOGGED_IN_ELSEWHERE','AUTH_ACCOUNT_BANNED'].includes(event.payload?.code)) {
          window.dispatchEvent(new Event(event.payload.code === 'AUTH_ACCOUNT_BANNED' ? 'studyroom:account-banned' : 'studyroom:session-ended'));
        }
      }
    });
    const stopFocus = watch(() => suppressed(), (muted, wasMuted) => {
      configure();
      if (muted) { messageNotices.notice = null; browserNotice?.close(); browserNotice = undefined; }
      else if (wasMuted) void refresh(true);
    }, { flush: 'sync' });
    const foregroundChanged = () => {
      if (!valid() || !foreground()) return;
      browserNotice?.close(); browserNotice = undefined;
      // Also recovers notifications the OS silently suppressed.
      void refresh(policy.pending);
    };
    const online = () => { if (valid()) { socket.retryNow(); void refresh(true); } };
    messageNotices.retry = () => { socket.retryNow(); void refresh(true); };
    const heartbeat = window.setInterval(() => { if (valid()) socket.send({ type: 'PING' }); }, 25000);
    document.addEventListener('visibilitychange', foregroundChanged);
    window.addEventListener('focus', foregroundChanged); window.addEventListener('online', online);
    cleanup = () => {
      disposed = true; query++; token = null; stopFocus(); socket.close(); removeClick?.(); browserNotice?.close();
      clearInterval(heartbeat); clearTimeout(toastTimer);
      document.removeEventListener('visibilitychange', foregroundChanged);
      window.removeEventListener('focus', foregroundChanged); window.removeEventListener('online', online);
      void native?.configure({ owner: null, scope, suppressed: true }).catch(() => {});
    };
  }, { immediate: true, flush: 'sync' });
  return () => { stop(); cleanup(); messageNotices.notice = null; messageNotices.unread = 0; messageNotices.error = ''; };
}
