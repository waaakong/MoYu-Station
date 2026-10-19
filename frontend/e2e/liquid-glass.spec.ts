import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
});

test('account chevron and glass menu preserve keyboard behavior at four sizes', async ({ page }, info) => {
  await page.goto('/scene');
  const trigger = page.getByRole('button', { name: '账号菜单', exact: true });
  const chevron = trigger.locator('svg.app-account__chevron');
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1080, height: 640 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(chevron).toBeVisible();
    await expect(chevron).toHaveAttribute('aria-hidden', 'true');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('.app-chrome')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect(await page.locator('.app-nav--primary').evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur');
    await page.screenshot({ path: info.outputPath(`glass-space-${viewport.width}.png`), animations: 'disabled' });
    await trigger.screenshot({ path: info.outputPath(`account-closed-${viewport.width}.png`), animations: 'disabled' });
    await trigger.focus(); await page.keyboard.press('ArrowDown');
    await expect(chevron).toHaveClass(/is-open/);
    await expect(page.getByRole('link', { name: '个人空间', exact: true })).toBeFocused();
    const panel = page.locator('#account-panel');
    await expect(panel).toBeVisible();
    const rect = await panel.boundingBox();
    expect(rect!.x).toBeGreaterThanOrEqual(0);
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width + 1);
    await page.screenshot({ path: info.outputPath(`glass-account-open-${viewport.width}.png`), animations: 'disabled' });
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(chevron).not.toHaveClass(/is-open/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('transparency, low performance and motion preferences remove costly or moving material', async ({ page }, info) => {
  await page.goto('/scene');
  await page.getByRole('button', { name: '外观与性能', exact: true }).click();
  await page.getByRole('checkbox', { name: /减少透明度/ }).check();
  await expect(page.locator('.context-drawer')).toHaveCSS('backdrop-filter', 'none');
  await expect(page.locator('.context-drawer')).toHaveCSS('background-image', 'none');
  await expect(page.locator('.scene-panel')).toHaveCSS('backdrop-filter', 'none');
  await page.screenshot({ path: info.outputPath('glass-solid-fallback.png'), animations: 'disabled' });
  await page.getByRole('checkbox', { name: /减少透明度/ }).uncheck();
  await page.getByRole('checkbox', { name: /低性能模式/ }).check();
  await expect(page.locator('.scene-panel')).toHaveCSS('backdrop-filter', 'none');
  await page.getByRole('checkbox', { name: /低性能模式/ }).uncheck();
  await page.keyboard.press('Escape');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // The shared reduced-motion guard uses 0.01ms to preserve transition-end hooks.
  expect(await page.locator('.app-account__chevron').evaluate(el =>
    Math.max(...getComputedStyle(el).transitionDuration.split(',').map(value => parseFloat(value))))).toBeLessThanOrEqual(0.00001);
  await page.getByRole('button', { name: '账号菜单' }).click();
  await expect(page.locator('#account-panel')).toHaveCSS('animation-name', 'none');
});

test('high contrast uses solid materials with readable text', async ({ page }, info) => {
  await page.emulateMedia({ contrast: 'more' });
  await page.goto('/scene');
  await expect(page.locator('.app-chrome')).toHaveCSS('backdrop-filter', 'none');
  await expect(page.locator('.scene-panel')).toHaveCSS('background-image', 'none');
  await page.getByRole('button', { name: '账号菜单' }).click();
  await expect(page.locator('#account-panel')).toHaveCSS('background-color', 'rgb(41, 44, 43)');
  await page.screenshot({ path: info.outputPath('glass-high-contrast.png'), animations: 'disabled' });
});
