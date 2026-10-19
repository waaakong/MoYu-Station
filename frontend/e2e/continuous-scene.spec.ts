import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
});

for (const [width, height] of [[1440,900],[1280,720],[1080,640],[390,844]]) {
  test(`continuous scene and floating controls ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.goto('/scene');
    const backdrop = page.locator('.desktop-shell__backdrop');
    await expect(backdrop.locator('.scene-background')).toHaveCount(1);
    await expect(page.locator('.scene-background')).toHaveCount(1);
    await expect.poll(() => backdrop.locator('img').first().evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const box = await backdrop.boundingBox();
    expect(box).toEqual({ x: 0, y: 0, width, height });
    for (const selector of ['.app-chrome','.desktop-shell__stage','.desktop-shell__player-slot','.scene-page']) {
      await expect(page.locator(selector)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(page.locator(selector)).toHaveCSS('background-image', 'none');
    }
    for (const selector of ['.app-nav--primary','.app-nav--secondary','.scene-panel','.time-panel','.desktop-shell__player-slot .player']) {
      expect(await page.locator(selector).evaluate(el => getComputedStyle(el).backdropFilter)).toContain('blur');
    }
    const player = await page.locator('.desktop-shell__player-slot .player').boundingBox();
    expect(player!.width).toBeLessThanOrEqual(820);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`continuous-scene-${width}.png`), animations: 'disabled' });
    // Route changes keep the same image element, rather than restarting its loader.
    const image = await backdrop.locator('.scene-background').elementHandle();
    await page.getByRole('navigation',{ name:'快捷入口' }).getByRole('link',{name:'专注', exact:true}).click();
    await expect(page.locator('.focus-card')).toBeVisible();
    expect(await image!.evaluate(el => el.isConnected)).toBe(true);
    await expect(page.locator('.scene-background')).toHaveCount(1);
    await expect(page.locator('.minute-stepper')).toHaveClass(/sr-glass-control/);
    await page.screenshot({ path: info.outputPath(`continuous-focus-${width}.png`), animations: 'disabled' });
    await page.getByRole('link',{name:'片刻放松',exact:true}).click();
    await page.getByRole('button',{name:'实色背景',exact:true}).click();
    await expect(page.locator('.scene-background')).toHaveCount(0);
    await page.getByRole('button',{name:'实色背景',exact:true}).click();
    await expect(page.locator('.scene-background')).toHaveCount(1);
  });
}
