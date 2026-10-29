import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
});

test('listening stage fits four viewports and restores modal and pure-mode focus', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/sound');
  await page.getByRole('button', { name: '听歌舞台', exact: true }).click();
  const stage = page.getByRole('region', { name: '完整音乐视觉模式' });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1080, height: 640 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect(stage).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const bounds = await stage.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width + 1);
    await page.screenshot({ path: info.outputPath(`listening-stage-${viewport.width}.png`), animations: 'disabled' });
    await page.getByRole('button', { name: '视觉设置', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '舞台设置' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '视觉设置', exact: true })).toBeFocused();
  }
  await page.getByRole('tab', { name: '沉浸歌词', exact: true }).click();
  await expect(page.getByRole('tab', { name: '沉浸歌词', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '纯净模式', exact: true }).click();
  await expect(page.getByRole('button', { name: '显示控制', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '返回声音', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '听歌舞台', exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test('real mixed audio drives canvas; off and reduced motion clear it without stopping ambient sound', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/sound');
  await page.getByRole('navigation', { name: '声音中心导航' }).getByRole('button', { name: /环境声音/ }).click();
  await page.getByRole('button', { name: '播放 棕噪音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止 棕噪音', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '听歌舞台', exact: true }).click();
  const canvas = page.locator('.listening-stage__visual');
  const painted = () => canvas.evaluate((element: HTMLCanvasElement) => {
    const pixels = element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data;
    return pixels.some((value, index) => index % 4 === 3 && value > 0);
  });
  await expect.poll(painted).toBe(true);
  await page.getByRole('button', { name: '视觉设置', exact: true }).click();
  await page.getByRole('combobox', { name: '视觉效果', exact: true }).click();
  await page.getByRole('option', { name: '关闭', exact: true }).click();
  await expect.poll(painted).toBe(false);
  await page.getByRole('combobox', { name: '视觉效果', exact: true }).click();
  await page.getByRole('option', { name: '封面星云', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(painted).toBe(true);
  await page.screenshot({ path: info.outputPath('stage-real-mixed-particles-1440.png'), animations: 'disabled' });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(painted).toBe(false);
  await page.getByRole('button', { name: '返回声音', exact: true }).click();
  await expect(page.getByRole('button', { name: '停止 棕噪音', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '停止 棕噪音', exact: true }).click();
});

test('space settings and detailed focus actions remain reachable above the player at four sizes', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1080, height: 640 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/scene');
    const privateScene = page.getByRole('button', { name: '自定义场景', exact: true });
    await privateScene.scrollIntoViewIfNeeded();
    const target = await privateScene.boundingBox(), main = await page.locator('#main-stage').boundingBox();
    expect(target!.y).toBeGreaterThanOrEqual(main!.y);
    expect(target!.y + target!.height).toBeLessThanOrEqual(main!.y + main!.height + 1);
    await privateScene.click();
    await expect(page.getByRole('dialog', { name: '自定义分时窗景' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.goto('/focus');
    const action = page.locator('.focus-card .primary-action');
    await action.scrollIntoViewIfNeeded();
    const actionRect = await action.boundingBox(), focusMain = await page.locator('#main-stage').boundingBox();
    expect(actionRect!.y).toBeGreaterThanOrEqual(focusMain!.y);
    expect(actionRect!.y + actionRect!.height).toBeLessThanOrEqual(focusMain!.y + focusMain!.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`focus-polish-${viewport.width}.png`), animations: 'disabled' });
  }
});

test('empty-library action scrolls inside the sound panel and is not covered by the player', async ({ page }, info) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1080, height: 640 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/sound');
    const action = page.locator('.sound-page__main .state-panel button');
    await expect(action).toBeVisible();
    await action.scrollIntoViewIfNeeded();
    const target = await action.boundingBox(), panel = await page.locator('.sound-page__main').boundingBox(), player = await page.locator('.desktop-shell__player-slot').boundingBox();
    expect(target!.y).toBeGreaterThanOrEqual(panel!.y);
    expect(target!.y + target!.height).toBeLessThanOrEqual(panel!.y + panel!.height + 1);
    expect(target!.y + target!.height).toBeLessThanOrEqual(player!.y + 1);
    expect(await action.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
    })).toBe(true);
    await page.screenshot({ path: info.outputPath(`sound-empty-reachable-${viewport.width}.png`), animations: 'disabled' });
  }
});
