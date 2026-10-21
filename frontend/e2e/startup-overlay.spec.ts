import { expect, test, type Page } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function desktop(page: Page, options: { fail?: boolean; disabled?: boolean; low?: boolean } = {}) {
  await page.addInitScript(options => {
    const w = window as any;
    if (options.disabled || options.low) localStorage.setItem('studyroom-shell-preferences-v2', JSON.stringify({ startupAnimation: !options.disabled, lowPerformance: !!options.low }));
    let release: () => void;
    const queue = new Promise<void>(resolve => { release = resolve; });
    w.testBoot = { release: () => release(), reads: 0, closes: 0, keys: 0 };
    const snapshot: any = { revision: 0, focused: true, maximized: false, closeBehavior: 'ask', trayAvailable: true };
    let windowListener = (_s: any) => {};
    w.studyRoomDesktop = {
      getCapabilities: async () => ({ platform: 'electron', localLibrary: true, localFocusDatabase: true }),
      readQueue: async () => { w.testBoot.reads++; await queue; if (options.fail) throw Error('private secret'); return []; },
      replaceQueue: async () => {}, readSoundSettings: async () => undefined, listSoundSnapshots: async () => [], saveSoundSettings: async () => {},
      onMediaCommand: () => () => {}, onSourceSwitch: () => () => {}, onDesktopLifecycle: () => () => {},
      setUpdaterActivityState: async () => ({ state: 'disabled' }), setUpdaterAuthState: () => new Promise(() => {}), onUpdateStatus: () => () => {},
      onWindowState: (fn: any) => { windowListener = fn; return () => {}; }, readWindowState: async () => snapshot,
      closeWindow: async () => { w.testBoot.closes++; snapshot.revision++; snapshot.closeRequest = { id: 'test-close', phase: 'choose' }; windowListener({ ...snapshot }); },
      resolveWindowClose: async () => { snapshot.revision++; delete snapshot.closeRequest; windowListener({ ...snapshot }); },
      cloud: { request: async () => ({ status: 401, data: { success: false, message: '离线验收' } }) },
    };
    document.addEventListener('keydown', () => w.testBoot.keys++);
  }, options);
}

test('web never gets desktop overlay or animation preference', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 200, json: { success: true, data: null } }));
  await page.goto('/scene');
  await expect(page.locator('#scene-title')).toBeVisible();
  await expect(page.locator('#moyu-startup')).toHaveCount(0);
  expect(await page.locator('#app').evaluate(el => (el as HTMLElement).inert)).toBe(false);
  await page.getByRole('button', { name: '外观与性能', exact: true }).click();
  await expect(page.getByText('启动开屏动画', { exact: true })).toHaveCount(0);
});

test('first-frame coverage, focus isolation, skip, automatic exit and no route replay', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await desktop(page);
  await page.goto('/');
  const overlay = page.locator('#moyu-startup');
  await expect(overlay).toContainText('正在恢复播放队列');
  expect(await page.locator('#app').evaluate(el => (el as HTMLElement).inert)).toBe(true);
  for (const [width, height] of [[1440, 900], [1280, 720], [1080, 640]]) {
    await page.setViewportSize({ width, height });
    expect(await overlay.boundingBox()).toEqual({ x: 0, y: 0, width, height });
    expect(await overlay.evaluate(el => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true);
    await page.screenshot({ path: join(tmpdir(), `moyu-startup-${width}.png`) });
  }
  await page.keyboard.press('Tab');
  expect(await overlay.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('k');
  expect(await page.evaluate(() => (window as any).testBoot.keys)).toBe(0);
  await page.getByRole('button', { name: '跳过动画' }).click();
  await expect(overlay).toHaveAttribute('data-static', 'true');
  await expect(overlay).toBeVisible(); // Skip must not bypass the blocked queue read.
  await page.evaluate(() => (window as any).testBoot.release());
  await expect(overlay).toHaveCount(0);
  await expect(page.getByRole('button', { name: /进入本地空间/ })).toBeVisible();
  expect(await page.locator('#app').evaluate(el => (el as HTMLElement).inert)).toBe(false);
  await page.getByRole('button', { name: /进入本地空间/ }).click();
  await expect(page.locator('#moyu-startup')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).testBoot.reads)).toBe(1);
  expect(errors).toEqual([]);
});

test('close confirmation stays above startup and cancellation preserves the gate', async ({ page }) => {
  await desktop(page); await page.goto('/');
  await expect(page.locator('#moyu-startup')).toContainText('正在恢复播放队列');
  await page.locator('#moyu-startup').getByRole('button', { name: '关闭窗口' }).click();
  const dialog = page.getByRole('dialog', { name: '关闭窗口' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#moyu-startup')).toBeVisible();
  expect(await page.evaluate(() => (window as any).testBoot.closes)).toBe(1);
});

test('queue failure does not reveal content or private exception', async ({ page }) => {
  await desktop(page, { fail: true }); await page.goto('/');
  await expect(page.locator('#moyu-startup')).toContainText('正在恢复播放队列');
  await page.evaluate(() => (window as any).testBoot.release());
  await expect(page.locator('#moyu-startup')).toHaveAttribute('data-state', 'failed');
  await expect(page.locator('#moyu-startup')).toContainText('正在恢复播放队列未完成');
  await expect(page.locator('#moyu-startup')).not.toContainText('private secret');
  expect(await page.locator('#app').evaluate(el => (el as HTMLElement).inert)).toBe(true);
  await page.evaluate(() => window.moyuStartupOverlay?.ready());
  await expect(page.locator('#moyu-startup')).toHaveAttribute('data-state', 'failed');
  await page.screenshot({ path: join(tmpdir(), 'moyu-startup-failed.png') });
});

for (const mode of ['disabled', 'low', 'system'] as const) test(`${mode} removes decorative animation but keeps real readiness`, async ({ page }) => {
  if (mode === 'system') await page.emulateMedia({ reducedMotion: 'reduce' });
  await desktop(page, { disabled: mode === 'disabled', low: mode === 'low' }); await page.goto('/');
  const overlay = page.locator('#moyu-startup');
  await expect(overlay).toHaveAttribute('data-static', 'true');
  await expect(overlay.locator('h1')).toHaveCSS('animation-name', 'none');
  await page.evaluate(() => (window as any).testBoot.release());
  await expect(overlay).toHaveCount(0);
});

test('slow boot exposes wait and safe retry, late readiness still enters', async ({ page }) => {
  await desktop(page); await page.clock.install(); await page.goto('/');
  const overlay = page.locator('#moyu-startup');
  await expect(overlay).toContainText('正在恢复播放队列');
  await page.clock.fastForward(16000);
  await expect(overlay).toContainText('启动尚未完成');
  await expect(overlay.getByRole('button', { name: '保存并重新加载' })).toBeVisible();
  await overlay.getByRole('button', { name: '继续等待' }).click();
  await expect(overlay).toContainText('正在恢复播放队列');
  await page.evaluate(() => (window as any).testBoot.release());
  await page.clock.runFor(1000);
  await expect(overlay).toHaveCount(0);
});

test('desktop preference is saved and applied on next renderer launch', async ({ page }) => {
  await desktop(page); await page.goto('/');
  await page.evaluate(() => (window as any).testBoot.release());
  await expect(page.locator('#moyu-startup')).toHaveCount(0);
  await page.getByRole('button', { name: /进入本地空间/ }).click();
  await page.getByRole('button', { name: '外观与性能', exact: true }).click();
  await page.getByRole('checkbox', { name: /启动开屏动画/ }).uncheck();
  await page.reload();
  await expect(page.locator('#moyu-startup')).toHaveAttribute('data-static', 'true');
});

test('fast initialization preserves readable brand sequence and duplicate ready cannot extend it', async ({ page }) => {
  await desktop(page);
  // install() alone keeps ticking between Playwright commands. On a loaded CI
  // runner, locator/IPC round trips can consume the brand hold before runFor().
  // Freeze before navigation so only the explicit elapsed intervals count.
  const epoch = new Date('2026-10-21T00:00:00Z');
  await page.clock.install({ time: epoch });
  await page.clock.pauseAt(epoch);
  await page.goto('/');
  const overlay = page.locator('#moyu-startup');
  await expect(overlay).toContainText('正在恢复播放队列');
  await page.evaluate(() => (window as any).testBoot.release());
  // Boot's last step awaits rendering frames. Advance only those frames until
  // genuine readiness; freezing time must not prevent initialization itself.
  await expect.poll(async () => {
    await page.clock.runFor(16);
    return overlay.locator('[role="status"]').textContent();
  }).toBe('本地空间已就绪');
  expect(await overlay.evaluate(el => performance.now() - Number((el as HTMLElement).dataset.startedAt))).toBeLessThan(500);
  await page.clock.runFor(1000);
  await expect(overlay).toContainText('本地空间已就绪');
  await expect(overlay).toBeVisible();
  await page.evaluate(() => { window.moyuStartupOverlay?.ready(); window.moyuStartupOverlay?.stage('过期阶段'); });
  await expect(overlay).not.toContainText('过期阶段');
  await page.clock.runFor(500);
  await expect(overlay).toHaveAttribute('data-state', 'preparing');
  await page.clock.runFor(2000);
  await expect(overlay).toHaveCount(0);
});

for (const trigger of ['skip', 'system'] as const) test(`${trigger} cancels brand hold after initialization`, async ({ page }) => {
  await desktop(page); await page.clock.install(); await page.goto('/');
  const overlay = page.locator('#moyu-startup');
  await expect(overlay).toContainText('正在恢复播放队列');
  await page.evaluate(() => (window as any).testBoot.release());
  await expect(overlay).toContainText('本地空间已就绪');
  if (trigger === 'skip') await overlay.getByRole('button', { name: '跳过动画' }).click();
  else await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.runFor(400);
  await expect(overlay).toHaveCount(0);
  await page.clock.runFor(4000);
  await expect(overlay).toHaveCount(0);
});

test('failure during decorative hold cancels pending reveal immediately', async ({ page }) => {
  await desktop(page); await page.clock.install(); await page.goto('/');
  const overlay = page.locator('#moyu-startup');
  await expect(overlay).toContainText('正在恢复播放队列');
  await page.evaluate(() => (window as any).testBoot.release());
  await expect(overlay).toContainText('本地空间已就绪');
  await page.evaluate(() => window.moyuStartupOverlay?.fail('初始化失败'));
  await expect(overlay).toHaveAttribute('data-state', 'failed');
  await expect(overlay.getByRole('button', { name: '关闭后重试' })).toBeVisible();
  await page.clock.runFor(5000);
  await expect(overlay).toBeVisible();
  expect(await page.locator('#app').evaluate(el => (el as HTMLElement).inert)).toBe(true);
});
