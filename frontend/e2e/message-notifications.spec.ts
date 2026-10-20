import { expect, test, type Page } from '@playwright/test';
const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = []; pageErrors.set(page, errors);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    // The feed failure/retry case deliberately returns HTTP 503.
    if (['warning', 'error'].includes(message.type()) && !message.text().includes('status of 503')) errors.push(message.text());
  });
});
test.afterEach(({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

// Fixture network evidence only: never contacts real members or writes production messages.
async function prepare(page: Page, path = '/scene') {
  await page.addInitScript(() => {
    localStorage.setItem('studyroom-shell-preferences-v2', JSON.stringify({ reducedMotion: true }));
    (window as any).__noticeSockets = [];
    class Socket extends EventTarget {
      static OPEN = 1; readyState = 0; url: string;
      constructor(url: string) { super(); this.url = url; (window as any).__noticeSockets.push(this); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
      send() {} close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
    }
    Object.defineProperty(window, 'WebSocket', { configurable: true, value: Socket });
  });
  const state = { unread: [] as any[], notifications: [] as any[], notificationRequests: 0, notificationFailure: false };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname; let data: any = [];
    if (path.endsWith('/auth/me')) data = { id: '2', username: 'notification-fixture', nickname: '通知验收', userType: 'NORMAL' };
    else if (path.endsWith('/auth/csrf')) data = { token: 'notification-csrf' };
    else if (path.endsWith('/chat/online-users')) data = [{ id: '3', nickname: '同学甲', onlineStatus: 'IDLE' }];
    else if (path.endsWith('/chat/private/unread')) data = state.unread;
    else if (path.endsWith('/chat/conversations')) data = { items: [], nextCursor: null };
    else if (path.endsWith('/chat/capabilities')) data = { boundedRead: true, reliableText: true };
    else if (path.endsWith('/feed/capabilities')) data = { dualFeed: true };
    else if (path.endsWith('/feed/posts')) data = { items: [], nextCursor: null, followingIds: [], relationshipVersion: 0 };
    else if (path.endsWith('/feed/notifications')) {
      state.notificationRequests++; data = state.notifications;
      if (state.notificationFailure) { await route.fulfill({ status: 503, json: { success: false, code: 'TEMPORARY', message: '互动服务暂不可用' } }); return; }
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto(path);
  await expect.poll(() => page.evaluate(() => (window as any).__noticeSockets.filter((s: any) => s.url.endsWith('/ws/chat') && s.readyState === 1).length)).toBe(1);
  await page.bringToFront();
  await expect(page).toHaveTitle(/墨屿/);
  await expect(page.locator('.desktop-shell')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  return state;
}
async function emit(page: Page, type: string, payload: any, kind = 'chat') {
  await page.evaluate(({ type, payload, kind }) => {
    for (const socket of (window as any).__noticeSockets) if (socket.readyState === 1 && socket.url.endsWith(`/ws/${kind}`)) socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type, payload }) }));
  }, { type, payload, kind });
}
const incoming = (id: string) => ({ id, senderId: '3', receiverId: '2', senderName: '同学甲', messageType: 'TEXT', content: '正文不应出现在系统通知', mine: false });
const notice = (key: string) => ({ key, postId: '10', actorId: '3', actorName: `同学${key}`, type: 'like', createdAt: `2026-10-05T10:00:0${key}` });

test('authoritative read clears a reminder while an old zero event cannot clear a newer unread', async ({ page }) => {
  const state = await prepare(page);
  state.unread = [{ senderId: '3', unreadCount: 1, createdAt: '2026-10-09T10:00:00' }];
  await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('301'));
  await expect(page.locator('.message-notice-open')).toBeVisible();
  // A delayed zero event is not authoritative: the current server snapshot still has the new message.
  await emit(page, 'PRIVATE_UNREAD_UPDATE', []);
  await expect(page.locator('.message-notice-open')).toBeVisible();
  state.unread = [];
  await emit(page, 'PRIVATE_UNREAD_UPDATE', []);
  await expect(page.locator('.message-notice-open')).toHaveCount(0);
});

test('cross-route reminder opens the exact chat; viewed and duplicate events do not toast', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await prepare(page); await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('100'));
  const reminder = page.getByRole('button', { name: '同学甲 发来私信 点击查看聊天' });
  await expect(reminder).toBeVisible();
  await page.screenshot({ path: info.outputPath('private-reminder.png') });
  await reminder.click(); await expect(page).toHaveURL(/\/chat\?peer=3/);
  await expect(page.locator('.dm-panel h3')).toHaveText('同学甲');
  await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('100')); await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('101'));
  await expect(reminder).toHaveCount(0);
  await expect(page.locator('.dm-panel')).toContainText('正文不应出现在系统通知');
  expect(errors).toEqual([]);
});

test('focus running and paused are quiet; ending produces only one authoritative summary', async ({ page }) => {
  const state = await prepare(page, '/focus');
  await page.locator('.focus-card .primary-action').click();
  await expect(page.locator('.focus-card .primary-action')).toContainText('暂停');
  state.unread = [{ senderId: '3', senderName: '同学甲', unreadCount: 2, createdAt: '2026-10-05T10:00:00' }];
  await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('200'));
  await expect(page.locator('.message-notice-open')).toHaveCount(0);
  await page.locator('.focus-card .primary-action').click();
  await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('201'));
  await expect(page.locator('.message-notice-open')).toHaveCount(0);
  await page.getByRole('button', { name: '重置专注', exact: true }).click();
  await expect(page.locator('.message-notice-open')).toContainText('2 条未读私信');
  await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('201'));
  await expect(page.locator('.message-notice-open')).toHaveCount(1);
});

test('every feed entry refreshes independently and only visible feed subscribes', async ({ page }, info) => {
  const state = await prepare(page, '/feed');
  await expect.poll(() => state.notificationRequests).toBeGreaterThan(0);
  await page.locator('.activity-notices summary').click();
  await emit(page, 'FEED_NOTIFICATION_RECEIVE', notice('1'), 'notifications');
  await expect(page.getByRole('button', { name: '同学1 点赞了你的动态。' })).toBeVisible();
  const before = state.notificationRequests;
  await page.getByRole('link', { name: '聊天', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__noticeSockets.filter((s: any) => s.url.endsWith('/ws/notifications') && s.readyState === 1).length)).toBe(0);
  state.notifications = [notice('2')];
  await page.getByRole('link', { name: '动态', exact: true }).click();
  await expect.poll(() => state.notificationRequests).toBeGreaterThan(before);
  await page.locator('.activity-notices summary').click();
  await expect(page.getByRole('button', { name: '同学2 点赞了你的动态。' })).toBeVisible();
  await expect(page.getByRole('button', { name: '同学1 点赞了你的动态。' })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('feed-live-notices.png') });
  state.notificationFailure = true;
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect.poll(() => page.evaluate(() => (window as any).__noticeSockets.filter((s: any) => s.url.endsWith('/ws/notifications') && s.readyState === 1).length)).toBe(0);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  // Foreground entry also refreshes capabilities/posts and then notifications.
  // Wait for that actual operation before changing the fixture's server outcome.
  await expect(page.locator('.section-head').getByRole('button', { name: '刷新', exact: true })).toBeEnabled();
  await expect(page.locator('.activity-notices')).toContainText('互动服务暂不可用');
  await expect(page.getByRole('button', { name: '同学2 点赞了你的动态。' })).toBeVisible();
  state.notificationFailure = false; await page.locator('.activity-notices').getByRole('button', { name: '重试' }).click();
  await expect(page.locator('.activity-notices')).not.toContainText('互动服务暂不可用');
});

test('logout discards old reminders and late socket deliveries', async ({ page }) => {
  await prepare(page); await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('300'));
  await expect(page.locator('.message-notice-open')).toBeVisible();
  await page.evaluate(async () => { const path = '/src/stores/auth.ts'; (await import(path)).useAuthStore().clearLocalSession(); });
  await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('301'));
  await expect(page.locator('.message-notice-open')).toHaveCount(0);
});

test('narrow-screen reminder is visible and keyboard reachable', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 }); await prepare(page);
  await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('400'));
  const reminder = page.locator('.message-notice-open'); await expect(reminder).toBeVisible();
  const box = await reminder.boundingBox(); expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('private-reminder-mobile.png') });
  await reminder.focus(); await page.keyboard.press('Enter'); await expect(page).toHaveURL(/peer=3/);
});

test('browser denial keeps unread and presents a summary when returning to the foreground', async ({ page }) => {
  const state = await prepare(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    Object.defineProperty(Notification, 'permission', { configurable: true, value: 'denied' });
    (window as any).__permissionRequested = false;
    Notification.requestPermission = async () => { (window as any).__permissionRequested = true; return 'denied'; };
  });
  state.unread = [{ senderId: '3', unreadCount: 1, createdAt: '2026-10-05T10:00:01' }];
  await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('500'));
  await emit(page, 'PRIVATE_UNREAD_UPDATE', state.unread);
  await expect(page.locator('.message-notice-open')).toHaveCount(0);
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.message-notice-open')).toContainText('1 条未读私信');
  expect(await page.evaluate(() => (window as any).__permissionRequested)).toBe(false);
});

test('reconnected chat recovers unread once without replaying history as individual messages', async ({ page }) => {
  const state = await prepare(page);
  state.unread = [{ senderId: '3', unreadCount: 4, createdAt: '2026-10-05T10:00:02' }];
  await page.evaluate(() => { const socket = (window as any).__noticeSockets.find((s: any) => s.readyState === 1 && s.url.endsWith('/ws/chat')); socket.close(); });
  await expect(page.locator('.message-notice-open')).toContainText('4 条未读私信');
  await page.getByRole('button', { name: '关闭私信提醒' }).click();
  await page.evaluate(() => { const socket = (window as any).__noticeSockets.find((s: any) => s.readyState === 1 && s.url.endsWith('/ws/chat')); socket.close(); });
  await expect.poll(() => page.evaluate(() => (window as any).__noticeSockets.filter((s: any) => s.readyState === 1 && s.url.endsWith('/ws/chat')).length)).toBe(1);
  await expect(page.locator('.message-notice-open')).toHaveCount(0);
});

test('account generation change rejects an outstanding unread response and closes all old sockets', async ({ page }) => {
  await prepare(page);
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let started = false;
  await page.route('**/api/chat/private/unread', async route => { started = true; await held; await route.fulfill({ json: { success: true, data: [{ senderId: '3', unreadCount: 99, createdAt: 'old-session' }] } }); });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event('online'))); await expect.poll(() => started).toBe(true);
    await page.evaluate(async () => {
      const path = '/src/stores/auth.ts', auth = (await import(path)).useAuthStore(); auth.clearLocalSession();
      auth.user = { id: '4', username: 'second-fixture-only', userType: 'NORMAL' };
    });
    await page.unroute('**/api/chat/private/unread'); release();
    await expect(page.locator('.message-notice-open')).toHaveCount(0);
    await expect(page.locator('.message-notice-host')).not.toContainText('99');
  } finally { release(); }
});

test('a multi-conversation summary opens the mobile conversation list, not the old private thread', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const state = await prepare(page);
  await emit(page, 'PRIVATE_MESSAGE_RECEIVE', incoming('600'));
  await page.locator('.message-notice-open').click();
  await expect(page.getByRole('button', { name: '返回会话', exact: true })).toBeVisible();
  state.unread = [{ senderId: '3', unreadCount: 2, createdAt: 'later' }, { senderId: '5', unreadCount: 3, createdAt: 'later' }];
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    Object.defineProperty(Notification, 'permission', { configurable: true, value: 'denied' });
  });
  await emit(page, 'PRIVATE_MESSAGE_RECEIVE', { ...incoming('601'), senderId: '5' });
  // Return to a non-chat route so both conversations remain eligible for a summary.
  await page.evaluate(async () => { const path = '/src/router/index.js'; await (await import(path)).default.push('/scene'); });
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('.message-notice-open')).toContainText('5 条未读私信');
  await page.locator('.message-notice-open').click(); await expect(page).toHaveURL(/unread=1/);
  await expect(page.getByRole('complementary', { name: '会话列表' })).toBeVisible();
});
