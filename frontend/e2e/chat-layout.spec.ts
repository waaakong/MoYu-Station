import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Isolated responses only. Never uses production accounts or sends a real message.
test('WeChat-inspired chat retains full editor, message alignment and image controls', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
  await page.addInitScript(() => {
    class Socket extends EventTarget {
      static OPEN = 1; readyState = 0;
      constructor() { super(); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
      send() {} close() { this.readyState = 3; }
    }
    Object.defineProperty(window, 'WebSocket', { value: Socket });
  });
  let uploads = 0;
  const assetId = '00000000-0000-4000-8000-000000000001';
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/auth/me')) data = { id: 2, username: 'tester', nickname: '本地验收', userType: 'NORMAL' };
    if (path.endsWith('/auth/csrf')) data = { token: 'fixture-csrf' };
    if (path.endsWith('/chat/capabilities')) data = { reliableText: true, boundedRead: true };
    if (path.endsWith('/chat/private/unread')) data = [{ senderId: '4', unreadCount: 101 }];
    if (path.endsWith('/chat/conversations')) data = { items: [
      { userId: '3', nickname: '山间来信', preview: '今天也给自己留一点时间。', updatedAt: '2026-09-30T16:20:00', unreadCount: 2 },
      { userId: '4', nickname: '一个很长很长的会话名称用于检查截断', preview: '这是一条很长的消息摘要，不能把会话列表撑宽。', unreadCount: 101 }
    ], nextCursor: null };
    if (path.endsWith('/chat/private/3/messages')) data = [
      { id: '1', senderName: '山间来信', content: '今天也给自己留一点时间。', messageType: 'TEXT', createdAt: '2026-09-30T16:20:00' },
      { id: '2', senderName: '本地验收', content: '好，听一会儿音乐，再读完这一章。', messageType: 'TEXT', mine: true, createdAt: '2026-09-30T16:21:00' },
      { id: '3', senderName: '山间来信', content: '图片消息', messageType: 'IMAGE', mediaUrl: '/brand/app-192.png', createdAt: '2026-09-30T16:22:00' }
    ];
    if (path === '/api/media/assets') {
      uploads++;
      data = { status: 'ready', asset: { id: assetId, width: 192, height: 192, bytes: 12000, mime: 'image/png', expiresAt: Date.now() + 3600000, clearUrl: `/api/media/assets/${assetId}/clear`, thumbUrl: `/api/media/assets/${assetId}/thumb` } };
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.goto('/chat');
  await expect(page).toHaveURL(/\/chat$/);
  expect(await page.title()).not.toBe('');
  await page.getByRole('button', { name: /山间来信/ }).click();
  await expect(page.getByText('好，听一会儿音乐，再读完这一章。')).toBeVisible();
  const editor = page.getByPlaceholder('发送私信...');
  for (const [width, height] of [[1440, 900], [1280, 720], [1080, 640], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await expect(editor).toBeVisible();
    const send = page.getByRole('button', { name: '发送', exact: true });
    const box = (await send.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    const composerBox = (await page.locator('.composer-shell').boundingBox())!;
    expect(composerBox.x + composerBox.width - box.x - box.width).toBeLessThan(20);
    expect(await editor.evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
    await expect(page.getByRole('region', { name: '图片附件' })).toBeHidden();
    await expect(page.getByText('图片消息', { exact: true })).toHaveCount(0);
    await expect(page.locator('.message-time')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const incoming = (await page.locator('[data-message-id="1"] .chat-avatar').boundingBox())!;
    const outgoing = (await page.locator('[data-message-id="2"] .chat-avatar').boundingBox())!;
    expect(outgoing.x).toBeGreaterThan(incoming.x);
    await page.screenshot({ path: info.outputPath(`chat-${width}.png`), animations: 'disabled' });
  }
  await editor.fill('保留输入法草稿');
  await editor.dispatchEvent('compositionstart');
  await editor.press('Enter');
  await expect(editor).toHaveValue(/保留输入法草稿/);
  await editor.dispatchEvent('compositionend');
  await editor.fill('第一行');
  await editor.press('Shift+Enter');
  await editor.press('a');
  await expect(editor).toHaveValue('第一行\na');
  await page.getByRole('button', { name: '表情', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '表情面板' })).toBeVisible();
  await page.keyboard.press('Escape');
  const add = page.getByRole('button', { name: '添加图片', exact: true });
  if (await add.isEnabled()) {
    const chooser = page.waitForEvent('filechooser');
    await add.click();
    await (await chooser).setFiles({ name: 'fixture.png', mimeType: 'image/png', buffer: await readFile(resolve('frontend/public/brand/app-192.png')) });
    await expect(page.getByText('已就绪', { exact: true })).toBeVisible();
    expect(uploads).toBe(1);
    await expect(page.getByRole('region', { name: '图片附件' })).toBeVisible();
    const remove = (await page.getByRole('button', { name: '删除第 1 张图片', exact: true }).boundingBox())!;
    const grid = (await page.locator('.attachment-grid').boundingBox())!;
    expect(remove.y + remove.height).toBeLessThanOrEqual(grid.y + grid.height);
    await page.screenshot({ path: info.outputPath('chat-attachment-390.png'), animations: 'disabled' });
    await page.getByRole('button', { name: '删除第 1 张图片', exact: true }).click();
    await expect(page.getByRole('region', { name: '图片附件' })).toBeHidden();
    await expect(editor).toHaveValue('第一行\na');
  } else {
    expect(uploads).toBe(0);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.getByRole('button', { name: '返回会话' }).click();
  await expect(page.getByRole('complementary', { name: '会话列表' })).toBeVisible();
  await expect(page.getByRole('button', { name: /101 条未读/ })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
});
