import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, freeze = false) {
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
  await page.goto('/scene');
  await expect(page.locator('#scene-title')).toBeVisible();
  if (freeze) await page.evaluate(async () => { const path = '/src/motion/runtime.ts'; const { gsap } = await import(path); gsap.globalTimeline.timeScale(0); });
}
async function engine(page: Page, action: 'resume' | 'midpoint' | 'exists') {
  return page.evaluate(async action => {
    const path = '/src/motion/runtime.ts'; const { gsap } = await import(path);
    if (action === 'resume') gsap.globalTimeline.timeScale(1);
    if (action === 'midpoint') gsap.getById('sr-page-enter')?.progress(0.45);
    return Boolean(gsap.getById('sr-page-enter'));
  }, action);
}

test('entrance releases styles and keeps permanent backdrop/player instances', async ({ page }) => {
  await setup(page, true);
  const backdrop = await page.locator('.desktop-shell__backdrop').elementHandle();
  const player = await page.locator('.desktop-shell__player-slot').elementHandle();
  for (const [label, selector] of [['专注', '.focus-page'], ['声音', '.sound-page'], ['片刻放松', '.entertainment-page']]) {
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page.locator(selector)).toHaveAttribute('data-sr-motion', 'sr-page-enter');
    await engine(page, 'midpoint');
    expect(await page.locator(selector).evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    expect(await backdrop!.evaluate(el => el.isConnected)).toBe(true);
    expect(await player!.evaluate(el => el.isConnected)).toBe(true);
    expect(await page.locator('.desktop-shell__backdrop [data-sr-motion]').count()).toBe(0);
  }
  await engine(page, 'resume');
  await expect(page.locator('.entertainment-page')).not.toHaveAttribute('data-sr-motion', /.+/);
  await expect(page.locator('.entertainment-page [data-motion-group]').first()).toHaveCSS('transform', 'none');
  expect(await engine(page, 'exists')).toBe(false);
});

test('keyboard, reduced motion and new input interrupt immediately', async ({ page }) => {
  await setup(page, true);
  await page.getByRole('link', { name: '专注', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.focus-card')).toBeVisible(); expect(await engine(page, 'exists')).toBe(false);
  await page.getByRole('link', { name: '场景', exact: true }).click();
  await expect(page.locator('.scene-page')).toHaveAttribute('data-sr-motion', 'sr-page-enter');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.scene-page')).not.toHaveAttribute('data-sr-motion', /.+/);
  await page.getByRole('link', { name: '专注', exact: true }).click(); expect(await engine(page, 'exists')).toBe(false);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.getByRole('link', { name: '场景', exact: true }).click();
  await expect(page.locator('.scene-page')).toHaveAttribute('data-sr-motion', 'sr-page-enter');
  await page.getByRole('button', { name: '账号菜单', exact: true }).click();
  await expect(page.locator('.scene-page')).not.toHaveAttribute('data-sr-motion', /.+/);
});

test('auth transitions move only content, with no retained previous page', async ({ page }) => {
  await setup(page, true);
  await page.getByRole('button', { name: '账号菜单', exact: true }).click();
  await page.getByRole('link', { name: '登录', exact: true }).click();
  await expect(page.getByLabel('用户名', { exact: true })).toBeVisible();
  await engine(page, 'midpoint');
  await expect(page.locator('.auth-page')).toHaveCSS('transform', 'none');
  await expect(page.locator('.auth-page .bg')).toHaveCSS('transform', 'none');
  await page.getByRole('button', { name: '创建一个', exact: true }).click();
  await expect(page).toHaveURL(/register/); expect(await page.locator('main').count()).toBe(1);
});

test('query-only navigation does not replay the whole page', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
  await page.route('**/api/auth/me', route => route.fulfill({ json: { success: true, data: { id: 12, username: 'motion-review', nickname: '隔离样本', userType: 'NORMAL' } } }));
  await page.goto('/profile');
  await page.getByRole('button', { name: /客户端版本/ }).click();
  await expect(page).toHaveURL(/module=client/); expect(await engine(page, 'exists')).toBe(false);
});

test('low performance navigates and opens panels without moving effects', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('studyroom-shell-preferences-v2', JSON.stringify({ lowPerformance: true })));
  await setup(page);
  await page.getByRole('link', { name: '专注', exact: true }).click(); expect(await engine(page, 'exists')).toBe(false);
  await page.getByRole('button', { name: '外观与性能', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '外观与性能' })).toBeVisible();
  expect(await page.locator('[data-sr-motion]').count()).toBe(0);
});
