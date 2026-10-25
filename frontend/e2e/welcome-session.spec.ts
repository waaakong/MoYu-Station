import { expect, test } from '@playwright/test';

const rememberedUser = { id: '1', username: 'remembered-fixture', nickname: '已恢复的账号', userType: 'USER', passwordChangeRequired: false };

test.beforeEach(async ({ page }) => {
  // Keep authenticated fixtures offline; no synthetic identity reaches a real socket server.
  await page.routeWebSocket('**/ws/**', () => {});
});

test('pending account confirmation does not block keyboard entry to local space', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
  await page.route('**/api/auth/me', async route => { await gate; await route.fulfill({ json: { success: true, data: rememberedUser } }); });
  try {
    await page.goto('/');
    const pending = page.getByRole('button', { name: '正在确认账号…', exact: true });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: '登录', exact: true })).toHaveCount(0);
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/scene$/);
    await expect(page.locator('#scene-title')).toBeVisible();
  } finally { release(); }
});

for (const width of [1440, 1280, 1080, 390]) test(`remembered account is visible without a new login at ${width}`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : width === 1080 ? 640 : 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  let loginSubmissions = 0;
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().endsWith('/api/auth/login')) loginSubmissions++; });
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { success: true, data: rememberedUser } }));
  await page.goto('/');
  const account = page.getByRole('button', { name: '我的空间 · 已恢复的账号', exact: true });
  await expect(account).toBeEnabled();
  await expect(page.getByRole('button', { name: '登录', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /进入本地空间/ })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await account.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/profile$/);
  await expect(page.getByRole('heading', { name: '云端账号', exact: true })).toBeVisible();
  expect(loginSubmissions).toBe(0);
  expect(errors).toEqual([]);
});

test('an explicit guest response offers normal login and username is the nickname fallback', async ({ page }) => {
  let user: typeof rememberedUser | null = null;
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { success: true, data: user } }));
  await page.goto('/');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\/login\?redirect=scene$/);
  user = { ...rememberedUser, nickname: '' };
  await page.goto('/');
  await expect(page.getByRole('button', { name: '我的空间 · remembered-fixture', exact: true })).toBeVisible();
});

test('failed confirmation can be retried once without submitting login or hiding local access', async ({ page }) => {
  let calls = 0, loginSubmissions = 0, release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  page.on('request', request => { if (request.url().endsWith('/api/auth/login')) loginSubmissions++; });
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
  await page.route('**/api/auth/me', async route => {
    calls++;
    if (calls === 1) return route.fulfill({ status: 503, json: { success: false, code: 'SERVICE_UNAVAILABLE', message: 'fixture unavailable' } });
    await gate;
    await route.fulfill({ json: { success: true, data: rememberedUser } });
  });
  try {
    await page.goto('/');
    await page.getByRole('button', { name: '重试确认账号', exact: true }).click();
    await expect(page.getByRole('button', { name: '正在确认账号…', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: /进入本地空间/ })).toBeEnabled();
    expect(calls).toBe(2);
    release();
    await expect(page.getByRole('button', { name: '我的空间 · 已恢复的账号', exact: true })).toBeEnabled();
    expect(calls).toBe(2);
    expect(loginSubmissions).toBe(0);
  } finally { release(); }
});
