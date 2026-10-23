import { test, expect } from '@playwright/test';

// Renderer-only verification. No installer is executed and no production service is used.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    const data = path.endsWith('/auth/me') ? { id: '2', username: 'fixture-update', userType: 'NORMAL' }
      : path.endsWith('/auth/csrf') ? { token: 'fixture-only' } : null;
    return route.fulfill({ json: { success: true, data } });
  });
  await page.routeWebSocket('**/ws/chat', socket => { socket.onMessage(() => {}); });
  await page.addInitScript(() => {
    const w = window as any;
    let revision = 1;
    let status: any = { revision, state: 'available', currentVersion: '0.2.0', availableVersion: '0.3.0', channel: 'stable',
      trustMode: 'manifest-signed', oneClickEnabled: true, installEnabled: true, automaticUpdates: true, canRetry: true };
    let statusListener = (_event: any) => {}, prepareListener = (_event: any) => {};
    const calls: any[] = [];
    const emit = (patch: any) => { status = { ...status, ...patch, revision: ++revision }; statusListener({ status }); return status; };
    w.updateFixture = { calls, emit, prepare: (id: string) => prepareListener({ id }) };
    w.studyRoomDesktop = {
      getCapabilities: async () => ({ platform: 'electron', localLibrary: false, persistentQueue: true, localFocusDatabase: true }),
      readQueue: async () => [], replaceQueue: async () => {},
      readSoundSettings: async () => undefined, saveSoundSettings: async () => {}, listSoundSnapshots: async () => [],
      onMediaCommand: () => () => {}, onSourceSwitch: () => () => {}, onDesktopLifecycle: () => () => {},
      onUpdateStatus: (listener: any) => { statusListener = listener; return () => {}; },
      onUpdatePreparation: (listener: any) => { prepareListener = listener; return () => {}; },
      setUpdaterAuthState: async (value: any) => { calls.push({ auth: value }); return status; },
      setUpdaterActivityState: async (value: any) => { calls.push({ activity: value }); return status; },
      checkForUpdates: async () => { calls.push({ check: true }); return emit({ state: 'available', updateIntent: false, errorCode: undefined, message: '已检查，新版本可用。' }); },
      startUpdate: async (...args: any[]) => { calls.push({ startArgs: args }); return emit({ state: 'countdown', updateIntent: true, countdownSeconds: 5, message: '5 秒后保存并重启，可取消。' }); },
      cancelUpdateDownload: async () => { calls.push({ cancel: true }); return emit({ state: 'idle', updateIntent: false }); },
      completeUpdatePreparation: async (result: any) => { calls.push({ prepared: result }); },
    };
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('one explicit button starts without a free-form argument; countdown cancel works at four viewports', async ({ page }, info) => {
  await page.goto('/#/profile?module=client');
  const start = page.getByRole('button', { name: '更新并重启（未签名安装包）', exact: true });
  await expect(start).toBeVisible();
  for (const [width, height] of [[1440, 900], [1280, 720], [1080, 640], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await start.click();
    const notice = page.getByLabel('更新进度', { exact: true });
    await expect(notice).toBeVisible();
    expect(await notice.evaluate(element => element.matches(':popover-open'))).toBe(true);
    const box = (await notice.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: info.outputPath(`update-countdown-${width}.png`), animations: 'disabled' });
    await notice.getByRole('button', { name: '取消本次更新' }).focus(); await page.keyboard.press('Enter');
    await expect(notice).toHaveCount(0);
    await page.evaluate(() => (window as any).updateFixture.emit({ state: 'available' }));
  }
  const starts = await page.evaluate(() => (window as any).updateFixture.calls.filter((call: any) => call.startArgs));
  expect(starts).toEqual(Array.from({ length: 4 }, () => ({ startArgs: [] })));
});

test('save acknowledgement excludes unrelated storage and cancellation releases renderer input', async ({ page }) => {
  await page.goto('/#/profile?module=client');
  await page.getByRole('button', { name: '更新并重启（未签名安装包）', exact: true }).click();
  await page.evaluate(() => {
    localStorage.setItem('unrelated-fixture-key', 'must-not-back-up');
    (window as any).updateFixture.emit({ state: 'preparing', message: '正在保存并备份本机数据…' });
    (window as any).updateFixture.prepare('11111111-1111-4111-8111-111111111111');
  });
  await expect.poll(() => page.evaluate(() => (window as any).updateFixture.calls.find((call: any) => call.prepared)?.prepared.ready)).toBe(true);
  expect(await page.locator('#app').evaluate(element => (element as HTMLElement).inert)).toBe(true);
  const result = await page.evaluate(() => (window as any).updateFixture.calls.find((call: any) => call.prepared).prepared);
  expect(result.rendererState['unrelated-fixture-key']).toBeUndefined();
  await page.getByLabel('更新进度', { exact: true }).getByRole('button', { name: '取消本次更新' }).click();
  expect(await page.locator('#app').evaluate(element => (element as HTMLElement).inert)).toBe(false);
  await expect(page.getByLabel('更新进度', { exact: true })).toHaveCount(0);
});

test('terminal error stays across routes at four viewports; dismissal does not authorize or retry', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#/profile?module=client');
  const start = page.getByRole('button', { name: '更新并重启（未签名安装包）', exact: true });
  const notice = page.getByLabel('更新进度', { exact: true });
  for (const [width, height] of [[1440, 900], [1280, 720], [1080, 640], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await start.click();
    await page.evaluate(() => (window as any).updateFixture.emit({ state: 'error', updateIntent: false,
      errorCode: 'UPDATE_DISK_INSUFFICIENT', message: '磁盘空间不足，请释放空间后重新检查。', canRetry: true }));
    await expect(notice.getByRole('alert')).toContainText('磁盘空间不足');
    await expect(notice).toContainText('UPDATE_DISK_INSUFFICIENT');
    await expect(notice.getByRole('button', { name: '取消本次更新' })).toHaveCount(0);
    await page.evaluate(() => { location.hash = '/sound'; });
    await expect(page).toHaveURL(/#\/sound$/);
    await expect(page.getByRole('heading', { name: '声音', exact: true })).toBeVisible();
    await expect(notice).toBeVisible();
    expect(await notice.evaluate(element => element.matches(':popover-open'))).toBe(true);
    const box = (await notice.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width); expect(box.y + box.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: info.outputPath(`update-failure-${width}.png`), animations: 'disabled' });
    await notice.getByRole('button', { name: '关闭更新提示', exact: true }).focus(); await page.keyboard.press('Enter');
    await expect(notice).toHaveCount(0);
    await page.evaluate(() => (window as any).updateFixture.emit({ state: 'error', updateIntent: false }));
    await expect(notice).toHaveCount(0);
    await page.evaluate(() => { location.hash = '/profile?module=client'; (window as any).updateFixture.emit({ state: 'available', errorCode: undefined }); });
    await expect(start).toBeVisible();
  }
  const calls = await page.evaluate(() => (window as any).updateFixture.calls);
  expect(calls.filter((call: any) => call.startArgs)).toHaveLength(4);
  expect(calls.filter((call: any) => call.check || call.cancel)).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('retry only checks, a new attempt can fail again, and non-retryable errors remain dismissible', async ({ page }) => {
  await page.goto('/#/profile?module=client');
  const start = page.getByRole('button', { name: '更新并重启（未签名安装包）', exact: true });
  const notice = page.getByLabel('更新进度', { exact: true });
  await start.click();
  const existingControl = page.getByRole('checkbox', { name: '自动检查更新（不自动安装）', exact: true });
  await existingControl.focus();
  await page.evaluate(() => (window as any).updateFixture.emit({ state: 'error', updateIntent: false, errorCode: 'UPDATE_NETWORK_ERROR', message: '连接失败，请检查网络。', canRetry: true }));
  await expect(existingControl).toBeFocused();
  await notice.getByRole('button', { name: '重新检查', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(notice).toHaveCount(0); await expect(start).toBeVisible();
  let calls = await page.evaluate(() => (window as any).updateFixture.calls);
  expect(calls.filter((call: any) => call.startArgs)).toHaveLength(1); expect(calls.filter((call: any) => call.check)).toHaveLength(1);
  await start.click();
  await page.evaluate(() => (window as any).updateFixture.emit({ state: 'error', updateIntent: false, errorCode: 'UPDATE_SIGNATURE_INVALID', message: '更新签名校验失败，未安装。', canRetry: false }));
  await expect(notice.getByRole('alert')).toContainText('签名校验失败');
  await expect(notice.getByRole('button', { name: '重新检查', exact: true })).toHaveCount(0);
  await notice.getByRole('button', { name: '关闭更新提示', exact: true }).click(); await expect(notice).toHaveCount(0);
  calls = await page.evaluate(() => (window as any).updateFixture.calls);
  expect(calls.filter((call: any) => call.startArgs)).toHaveLength(2); expect(calls.filter((call: any) => call.cancel)).toHaveLength(0);
});
