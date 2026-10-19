import { expect, test, type Page, type Route } from '@playwright/test';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';

const image = { name: 'scene.png', mimeType: 'image/png', buffer: Buffer.alloc(0) };
test.beforeAll(async () => { image.buffer = await sharp({ create: { width: 320, height: 180, channels: 3, background: '#718878' } }).png().toBuffer(); });
async function fixture(page: Page, override?: (route: Route) => Promise<boolean>) {
  const uploads: string[] = [], commands: any[] = [], posts: any[] = [], messages: any[] = [];
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    class Socket extends EventTarget {
      static OPEN = 1; readyState = 0;
      constructor() { super(); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
      send() {} close() { this.readyState = 3; this.dispatchEvent(new Event('close')); }
    }
    Object.defineProperty(window, 'WebSocket', { value: Socket });
  });
  await page.route('**/api/**', async route => {
    if (override && await override(route)) return;
    const url = new URL(route.request().url()), path = url.pathname;
    let data: unknown = [];
    if (path.endsWith('/auth/me')) data = { id: 2, username: 'tester', nickname: '本地验收', userType: 'NORMAL' };
    else if (path.endsWith('/auth/csrf')) data = { token: 'local-csrf' };
    else if (path.endsWith('/chat/capabilities')) data = { reliableText: true, bidirectionalHistory: true };
    else if (path.endsWith('/chat/conversations')) data = { items:[],nextCursor:null };
    else if (path.endsWith('/online-users')) data = [{ id: 3, nickname: '成员 A' }, { id: 4, nickname: '成员 B' }];
    else if (path === '/api/media/assets') {
      expect(route.request().headers()['content-type']).toBe('image/png');
      expect(route.request().postDataBuffer()!.length).toBeGreaterThan(0);
      expect(url.searchParams.get('clientUploadId')).toMatch(/^[a-f0-9-]{36}$/);
      const id = randomUUID(); uploads.push(id);
      data = receipt(id);
    } else if (/\/media\/assets\/.*\/(clear|thumb)$/.test(path)) {
      await route.fulfill({ contentType: 'image/png', body: image.buffer }); return;
    } else if (path === '/api/media/publications') {
      const command = route.request().postDataJSON(); commands.push(command);
      const targetId = 100 + commands.length;
      if (command.kind === 'POST') posts.unshift({ id: targetId, authorId: 2, authorName: '本地验收', content: command.content, imageUrls: command.assets.map((id: string) => `/api/media/assets/${id}/clear`) });
      else messages.push({ id: targetId, recipient: command.recipient, senderId: 2, senderName: '本地验收', mine: true, messageType: 'IMAGE', content: command.content, mediaUrl: `/api/media/assets/${command.assets[0]}/clear` });
      data = { kind: command.kind, targetId };
    } else if (path === '/api/feed/posts') data = posts;
    else if (/\/private\/[34]\/messages$/.test(path)) data = messages.filter(item => String(item.recipient) === path.split('/').at(-2));
    await route.fulfill({ json: { success: true, data } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  return { uploads, commands, posts, errors };
}
function receipt(id: string) { return { status: 'ready', asset: { id, width: 320, height: 180, bytes: image.buffer.length, mime: 'image/png', expiresAt: Date.now() + 3600000, clearUrl: `/api/media/assets/${id}/clear`, thumbUrl: `/api/media/assets/${id}/thumb` } }; }
const composer = (page: Page) => page.locator('.composer-panel');
async function openFeed(page:Page){await page.goto('/feed');await expect(page.getByRole('heading',{name:'片刻社区'})).toBeVisible();await page.getByRole('button',{name:'写动态',exact:true}).click();}
async function ready(page: Page, count: number) { await expect(page.getByText('已就绪', { exact: true })).toHaveCount(count); }

test('feed stages images, supports keyboard ordering, then publishes exactly once', async ({ page }, info) => {
  const state = await fixture(page); await openFeed(page);
  await composer(page).locator('input[type=file]').setInputFiles([image, { ...image, name: 'second.png' }]);
  await ready(page, 2); expect(state.commands).toHaveLength(0);
  const before = await page.locator('[data-attachment-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-attachment-id')));
  await page.getByRole('button', { name: '将第 2 张图片前移' }).focus(); await page.keyboard.press('Enter');
  expect(await page.locator('[data-attachment-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-attachment-id')))).toEqual([...before].reverse());
  await composer(page).locator('textarea').fill('两张图片的本地验收');
  await page.screenshot({ path: info.outputPath('feed-desktop.png') });
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.locator('.post-card')).toHaveCount(1);
  expect(state.commands[0].assets).toEqual([...state.uploads].reverse());
  await expect(page.locator('[data-attachment-id]')).toHaveCount(0);
  await page.getByRole('button', { name: '查看第 1 张图片，共 2 张' }).click();
  await expect(page.getByRole('dialog')).toBeVisible(); await page.keyboard.press('Escape');
  expect(state.errors).toEqual([]);
});

test('selection overflow is atomic and mobile controls remain operable', async ({ page }, info) => {
  const state = await fixture(page); await page.setViewportSize({ width: 390, height: 844 }); await openFeed(page);
  await composer(page).locator('input[type=file]').setInputFiles(Array.from({ length: 10 }, (_, i) => ({ ...image, name: `${i}.png` })));
  await expect(page.getByText(/本批未添加/)).toBeVisible(); expect(state.uploads).toHaveLength(0);
  await expect(page.locator('[data-attachment-id]')).toHaveCount(0);
  await composer(page).locator('input[type=file]').setInputFiles([image, image]); await ready(page, 2);
  await page.getByRole('button', { name: '将第 2 张图片前移' }).click();
  await page.getByRole('button', { name: '删除第 1 张图片' }).click(); await ready(page, 1);
  await page.getByRole('button', { name: '发布', exact: true }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const mobileButton = await page.getByRole('button', { name: '发布', exact: true }).boundingBox();
  expect(mobileButton!.width).toBeGreaterThan(280); expect(mobileButton!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: info.outputPath('feed-mobile.png') }); expect(state.errors).toEqual([]);
});

test('private image draft and in-flight publication remain scoped to A while B is active', async ({ page }, info) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let submitted = false;
  const state = await fixture(page, async route => {
    if (new URL(route.request().url()).pathname !== '/api/media/publications') return false;
    submitted = true; await gate; return false;
  });
  try {
    await page.goto('/chat'); await page.getByRole('button', { name: /成员 A/ }).click();
    await page.locator('.dm-panel input[type=file]').setInputFiles(image); await ready(page, 1);
    await page.getByPlaceholder('发送私信...').fill('只给 A');
    await page.getByRole('button', { name: /成员 B/ }).click(); await expect(page.locator('[data-attachment-id]')).toHaveCount(0);
    await page.getByPlaceholder('发送私信...').fill('B 的草稿'); expect(state.commands).toHaveLength(0);
    await page.getByRole('button', { name: /成员 A/ }).click(); await ready(page, 1);
    const panel = await page.locator('.dm-panel').boundingBox(), send = await page.getByRole('button', { name: '发送图片', exact: true }).boundingBox();
    expect(send!.y + send!.height).toBeLessThanOrEqual(panel!.y + panel!.height);
    await page.screenshot({ path: info.outputPath('chat-desktop.png') });
    await page.getByRole('button', { name: '发送图片', exact: true }).click(); await expect.poll(() => submitted).toBe(true);
    await page.getByRole('button', { name: /成员 B/ }).click(); release();
    await expect.poll(() => state.commands.length).toBe(1);
    expect(state.commands[0]).toMatchObject({ kind: 'PRIVATE', recipient: '3', content: '只给 A' });
    await expect(page.getByPlaceholder('发送私信...')).toHaveValue('B 的草稿');
    await page.getByRole('button', { name: /成员 A/ }).click();
    await expect(page.locator('.dm-panel [data-attachment-id]')).toHaveCount(0);
    await expect(page.locator('.dm-panel img[src*="/api/media/assets/"]')).toHaveCount(1);
    await expect(page.locator('.dm-panel .bubble').getByText('只给 A', { exact: true })).toBeVisible();
    expect(state.errors).toEqual([]);
  } finally { release(); }
});

test('a lost publication reply locks content and recovers by lookup without a duplicate POST', async ({ page }) => {
  let publications = 0, lookups = 0; const state = await fixture(page, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/media/publications') { publications++; await route.abort('failed'); return true; }
    if (path.startsWith('/api/media/publications/')) { lookups++; await route.fulfill({ json: { success: true, data: { status: 'committed', publication: { kind: 'POST', targetId: 99 } } } }); return true; }
    return false;
  });
  await openFeed(page); await composer(page).locator('input[type=file]').setInputFiles(image); await ready(page, 1);
  await page.getByRole('button', { name: '发布', exact: true }).click();
  await expect(page.getByRole('button', { name: '查询并重试原任务' })).toBeEnabled();
  await expect(composer(page).locator('textarea')).toBeDisabled();
  await expect(page.getByRole('button', { name: '删除第 1 张图片' })).toBeDisabled();
  await page.getByRole('button', { name: '查询并重试原任务' }).click();
  await expect(page.locator('[data-attachment-id]')).toHaveCount(0);
  expect(publications).toBe(1); expect(lookups).toBe(1); expect(state.errors).toEqual([]);
});

test('session end cancels a held upload and a late receipt cannot restore a draft', async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let started = false;
  await fixture(page, async route => {
    if (new URL(route.request().url()).pathname !== '/api/media/assets') return false;
    started = true; await gate;
    await route.fulfill({ json: { success: true, data: receipt(randomUUID()) } }).catch(() => {}); return true;
  });
  try {
    await openFeed(page); await composer(page).locator('input[type=file]').setInputFiles(image);
    await expect.poll(() => started).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('studyroom:session-ended', { detail: { code: 'SESSION_EXPIRED' } })));
    await expect(page).toHaveURL(/login/); release(); await expect(page.locator('[data-attachment-id]')).toHaveCount(0);
  } finally { release(); }
});

test('mobile private composer retains usable controls with nine attachments', async ({ page }, info) => {
  const state = await fixture(page); await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/chat');
  await page.getByRole('button', { name: /成员 A/ }).click();
  await page.locator('.dm-panel input[type=file]').setInputFiles(Array.from({ length: 9 }, () => image)); await ready(page, 9);
  const send = page.getByRole('button', { name: '发送图片', exact: true }); await send.scrollIntoViewIfNeeded();
  const button = await send.boundingBox(), panel = await page.locator('.dm-panel').boundingBox();
  expect(button!.height).toBeGreaterThanOrEqual(44); expect(button!.y + button!.height).toBeLessThanOrEqual(panel!.y + panel!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('chat-mobile-nine.png') });
  await send.click(); await expect.poll(() => state.commands.length).toBe(9);
  await expect(page.locator('[data-attachment-id]')).toHaveCount(0);
  expect(new Set(state.commands.map(command => command.requestId)).size).toBe(9);
  expect(state.commands.every(command => command.recipient === '3')).toBe(true); expect(state.errors).toEqual([]);
});

test('cancelled upload stays cancelled after a late receipt', async ({ page }) => {
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let started = false;
  const state = await fixture(page, async route => {
    if (new URL(route.request().url()).pathname !== '/api/media/assets') return false;
    started = true; await gate; await route.fulfill({ json: { success: true, data: receipt(randomUUID()) } }).catch(() => {}); return true;
  });
  try {
    await openFeed(page); await composer(page).locator('input[type=file]').setInputFiles(image); await expect.poll(() => started).toBe(true);
    await composer(page).getByRole('button', { name: '取消', exact: true }).click(); release();
    await expect(page.locator('.attachment-status')).toHaveText('已取消');
    await expect(page.getByRole('button', { name: '发布', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '删除第 1 张图片' }).click(); await expect(page.locator('[data-attachment-id]')).toHaveCount(0);
    expect(state.commands).toHaveLength(0);
  } finally { release(); }
});

test('malformed source never reaches image preview decoding or upload', async ({ page }) => {
  const state = await fixture(page); await openFeed(page);
  await composer(page).locator('input[type=file]').setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  await expect(page.locator('.attachment-status')).not.toContainText('处理中');
  await expect(page.locator('.no-preview')).toHaveText('无法生成预览');
  await expect(page.locator('.attachment-grid img')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '发布', exact: true })).toBeDisabled(); expect(state.uploads).toHaveLength(0);
});

test('trusted grid uses thumbnails, retries failures, and keeps single-image aspect ratio', async ({ page }) => {
  const id = randomUUID(), base = `/api/media/assets/${id}`;
  let thumbReads = 0, clearReads = 0;
  const state = await fixture(page, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/feed/posts') {
      await route.fulfill({ json: { success: true, data: [{ id:1,authorId:3,authorName:'验收样本',content:'缩略图重试验收',
        imageUrls:[base+'/clear'],media:[{assetId:id,purpose:'social',width:320,height:180,thumbnailUrl:base+'/thumb',clearUrl:base+'/clear',mime:'image/png',animated:false}] }] } }); return true;
    }
    if (path === base+'/thumb') {
      thumbReads++; await route.fulfill(thumbReads === 1 ? {status:503,body:'unavailable'} : {contentType:'image/png',body:image.buffer}); return true;
    }
    if (path === base+'/clear') { clearReads++; await route.fulfill({contentType:'image/png',body:image.buffer}); return true; }
    return false;
  });
  await page.goto('/feed');
  await page.getByRole('button',{name:'第 1 张图片加载失败，点击重试'}).click();
  const tile = page.getByRole('button',{name:'查看第 1 张图片，共 1 张'});
  await expect.poll(()=>tile.locator('img').evaluate(img=>(img as HTMLImageElement).naturalWidth)).toBe(320);
  expect(thumbReads).toBe(2); expect(clearReads).toBe(0);
  const box = (await tile.boundingBox())!;
  expect(box.width/box.height).toBeCloseTo(320/180,1);
  await tile.click(); await expect(page.locator('.viewer-stage img')).toHaveAttribute('src',base+'/clear');
  await expect.poll(()=>clearReads).toBe(1); await page.keyboard.press('Escape'); await expect(tile).toBeFocused();
  expect(state.errors).toEqual([]);
});

test('Chinese composition does not submit and desktop Shift+Enter preserves a newline', async ({ page }) => {
  await fixture(page); await page.goto('/chat');
  const input = page.getByPlaceholder('在大厅说点什么...'); await input.fill('中文输入中');
  await input.dispatchEvent('compositionstart');
  await input.dispatchEvent('keydown',{key:'Enter',code:'Enter',isComposing:true});
  await expect(input).toHaveValue('中文输入中');
  await input.dispatchEvent('compositionend');
  await input.focus(); await input.press('End'); await input.press('Shift+Enter'); await input.press('x');
  await expect(input).toHaveValue('中文输入中\nx');
});

test('touch keyboard Enter is a newline, not a send action', async ({ browser }) => {
  const context = await browser.newContext({isMobile:true,hasTouch:true,viewport:{width:390,height:844}});
  try {
    const page = await context.newPage(); await fixture(page); await page.goto('/chat');
    const input = page.getByPlaceholder('在大厅说点什么...'); await input.fill('手机输入'); await input.press('End'); await input.press('Enter');
    await expect(input).toHaveValue('手机输入\n');
  } finally { await context.close(); }
});
