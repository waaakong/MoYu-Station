import { expect, test, type Page } from '@playwright/test';
test.use({ actionTimeout: 10000 });

// UI-only fixtures. They never reach the configured cloud endpoint and are not
// evidence for real accounts, database consistency, or production readiness.
async function isolate(page: Page) {
  await page.addInitScript(() => {
    class LocalSocket extends EventTarget {
      static OPEN = 1; readyState = 0;
      constructor() { super(); queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event('open')); }); }
      send() {} close() { this.readyState = 3; }
    }
    Object.defineProperty(window, 'WebSocket', { value: LocalSocket, configurable: true });
    Object.defineProperty(window, 'EventSource', { value: undefined, configurable: true });
  });
  const user = { id: 1, username: 'local-review', nickname: '界面验收样本', userType: 'ADMIN', passwordChangeRequired: false };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith('/auth/csrf')) data = { token: 'isolated-review' };
    else if (path.endsWith('/auth/me') || path.endsWith('/profile/me')) data = user;
    else if (path.endsWith('/feed/capabilities')) data = { dualFeed: true };
    else if (path.endsWith('/capabilities')) data = {};
    else if (path.endsWith('/profile/stats')) data = { todayFocusMinutes: 85, streakDays: 7, totalFocusHours: 32, fishMinutes: 15, onlineMinutes: 100, favoriteScene: '图书馆' };
    else if (path.endsWith('/profile/share-card')) data = { title: '今日学习报告', focusMinutes: 85, fishMinutes: 15, quote: '把时间留给正在做的事。' };
    else if (path.endsWith('/profile/calendar')) data = [{ date: '2026-09-28', focusMinutes: 85, status: 'FOCUS' }];
    else if (path.endsWith('/admin/dashboard')) data = { onlineUsers: 2, todayPosts: 1, pendingFeedback: 0, systemStatus: '测试样本', sampledAt: '2026-09-28T12:00:00Z', sections: { system: { status: 'UNAVAILABLE' }, redis: { status: 'UNAVAILABLE' }, database: { status: 'UNAVAILABLE' }, http: { status: 'UNAVAILABLE' } } };
    else if (path.endsWith('/admin/pages/users')) data = {items:[{ id:'2',adminVersion:'0', username:'member',nickname:'本地样本',userType:'NORMAL',onlineStatus:'IDLE',todayFocusMinutes:20}],nextCursor:null,versionedWrites:true};
    else if (path.includes('/admin/audits')) data = { items: [], total: 0, page: 1, size: 30 };
    else if (path.includes('/chat/online-users')) data = [{ id: 3, username: 'peer', nickname: '测试联系人', onlineStatus: 'IDLE' }];
    else if (path.endsWith('/chat/conversations')) data = { items: [], nextCursor: null };
    else if (path.includes('/chat/hall/messages')) data = [{ id: 7, senderName: '测试联系人', content: '这是隔离界面验收消息，不会发送给真实用户。', messageType: 'TEXT', mine: false }];
    else if (path.endsWith('/feed/posts')) data = {items:[{ id: 11, authorId: 3, authorName: '测试联系人', content: '今天读完一章，留一点时间给自己。', sceneName: '图书馆', imageUrls: [], likeCount: 0, commentCount: 0 }],nextCursor:null,relationshipVersion:0,followingIds:[]};
    await route.fulfill({ json: { success: true, data } });
  });
}

async function frame(page: Page) {
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const stage = await page.locator('#main-stage').isVisible() ? await page.locator('#main-stage').boundingBox() : null;
  if (stage) {
    const nav = await page.locator('.app-chrome').boundingBox();
    expect(stage.y).toBeGreaterThanOrEqual(nav!.y + nav!.height - 1);
    expect(stage.height).toBeGreaterThan(200);
    const player = await page.locator('.desktop-shell__player-slot').isVisible() ? await page.locator('.desktop-shell__player-slot').boundingBox() : null;
    if (player) expect(stage.y + stage.height).toBeLessThanOrEqual(player.y + 1);
  }
}

for (const width of [1440, 1280, 1080, 390]) {
  const height = ({1440:900,1280:720,1080:640,390:844} as Record<number,number>)[width];
  test(`approved page families at ${width}×${height}`, async ({page}, info) => {
    test.setTimeout(120_000);
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await isolate(page); await page.setViewportSize({width,height});
    for (const [id, path, selector] of [
      ['space','/scene','#scene-title'], ['focus','/focus','[data-focus-lock]'],
      ['sound','/sound','.sound-page'], ['feed','/feed','.feed-shell'], ['chat','/chat','.chat-shell'],
      ['profile','/profile','.profile-panel'], ['admin','/admin','.admin-panel'],
      ['login','/login','input:visible'], ['register','/register','input:visible'], ['restricted','/banned','main']
    ]) {
      await page.goto(path); await expect(page.locator(selector).first()).toBeVisible();
      if (id === 'feed') await expect(page.locator('.post-card')).toHaveCount(1);
      if (id === 'chat') {
        await expect(page.getByText('测试联系人',{exact:true}).first()).toBeVisible();
        if (width > 720) await expect(page.getByText('这是隔离界面验收消息，不会发送给真实用户。',{exact:true})).toBeVisible();
      }
      await frame(page);
      await page.screenshot({path:info.outputPath(`${id}-${width}.png`),animations:'disabled'});
    }
    expect(errors).toEqual([]);
  });
}

for (const width of [1440,390]) {
  test(`personal and management modules at ${width}`, async ({page}, info) => {
    test.setTimeout(120_000); await isolate(page); await page.setViewportSize({width,height:width===390?844:900});
    for (const key of ['local','account','stats','calendar','posts','feedback','security','client']) {
      await page.goto(`/profile?module=${key}`); await expect(page.locator('.profile-panel').first()).toBeVisible(); await frame(page);
      await page.screenshot({path:info.outputPath(`profile-${key}-${width}.png`),animations:'disabled'});
    }
    await page.goto('/admin');
    for (const label of ['概览','用户','邀请码','动态','反馈','客户端发布','审计','设置']) {
      await page.getByRole('navigation',{name:'管理模块'}).getByRole('button',{name:new RegExp(`^${label}`)}).click();
      await expect(page.locator('.admin-panel')).toBeVisible(); await frame(page);
      await page.screenshot({path:info.outputPath(`admin-${label}-${width}.png`),animations:'disabled'});
    }
  });
}

test('context navigation, keyboard, global preferences and narrow drawer', async ({page},info) => {
  await isolate(page); await page.goto('/scene');
  await expect(page.getByRole('navigation',{name:'快捷入口'}).getByRole('link')).toHaveText(['场景','专注','声音']);
  await page.getByRole('link',{name:'社区',exact:true}).click();
  await expect(page.getByRole('navigation',{name:'快捷入口'}).getByRole('link')).toHaveText(['动态','聊天']);
  await page.getByRole('button',{name:'账号菜单'}).click();
  await expect(page.getByRole('link',{name:'个人空间',exact:true})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button',{name:'账号菜单'})).toBeFocused();
  await page.getByRole('link',{name:'空间',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'外观与性能'}).click();
  const dialog = page.getByRole('dialog',{name:'外观与性能'});
  await expect(dialog).toBeVisible();
  await page.getByRole('checkbox',{name:/减少透明度/}).check();
  await expect(page.locator('html')).toHaveClass(/sr-reduced-transparency/);
  await expect(page.locator('.context-drawer')).toHaveCSS('backdrop-filter','none');
  await page.getByRole('checkbox',{name:/低性能模式/}).focus(); await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'关闭面板'})).toBeFocused();
  await page.keyboard.press('Shift+Tab'); await expect(page.getByRole('checkbox',{name:/低性能模式/})).toBeFocused();
  await page.screenshot({path:info.outputPath('appearance-390.png'),animations:'disabled'});
  await page.keyboard.press('Escape'); await expect(page.getByRole('button',{name:'外观与性能'})).toBeFocused();
  await page.emulateMedia({reducedMotion:'reduce'}); await expect(page.locator('html')).toHaveClass(/sr-reduced-motion/);
  await page.getByRole('button',{name:'外观与性能'}).click();
  await page.getByRole('checkbox',{name:/沉浸模式/}).check(); await page.keyboard.press('Escape');
  await expect(page.getByRole('button',{name:'退出沉浸模式'})).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button',{name:'外观与性能'})).toBeFocused();
  await page.getByRole('button',{name:'外观与性能'}).click();
  await page.getByRole('checkbox',{name:/沉浸模式/}).check(); await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation',{name:'主要功能'})).toBeVisible();
  await expect(page.getByRole('button',{name:'外观与性能'})).toBeFocused();
});
