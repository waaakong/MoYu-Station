import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
  await page.goto('/sound');
  await page.getByRole('button', { name: '听歌舞台', exact: true }).waitFor();
  await page.evaluate(async () => {
    const playerPath = '/src/stores/player.ts', queuePath = '/src/stores/queue.ts', soundPath = '/src/stores/sound.ts';
    const { usePlayerStore } = await import(playerPath), { useQueueStore } = await import(queuePath), { useSoundStore } = await import(soundPath);
    const count = 8000 * 90, buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
    const text = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, count * 2, true);
    for (let i = 0; i < count; i++) view.setInt16(44 + i * 2, Math.sin(i / 8000 * Math.PI * 440) * 400, true);
    const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    const items = ['窗边阅读', '午后书页', '夜间书桌'].map((title, i) => ({ id: `shared-${i}`, queuedAt: i + 1,
      track: { id: `shared-${i}`, title, artist: '隔离生成音频', durationMs: 90000, source: { kind: 'builtin', assetId: url } } }));
    const player = usePlayerStore(), queue = useQueueStore(), sound = useSoundStore();
    await queue.replace(items); await player.load(items[0]);
    Object.assign(window, { testAudio: { player, queue, sound, url } });
  });
}

test('real music and ambient stay independent and synchronized across sound and focus', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await prepare(page);
  const globalPlayer = page.locator('.desktop-shell__player-slot');
  await globalPlayer.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.player.playback.positionMs)).toBeGreaterThan(0);
  await page.getByRole('link', { name: '专注', exact: true }).click();
  const bar = page.getByRole('region', { name: '专注控制条' });
  await expect(bar).toContainText('窗边阅读');
  await expect(bar.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await bar.getByRole('slider', { name: '音乐音量', exact: true }).fill('0.32');
  await bar.getByRole('slider', { name: '环境音音量', exact: true }).fill('0.21');
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.player.playback.volume)).toBe(.32);
  await expect(bar.getByRole('slider', { name: '音乐音量', exact: true })).toHaveAttribute('aria-valuetext', '32%');
  await bar.getByRole('button', { name: '打开音乐' }).click();
  const dialog = page.getByRole('dialog', { name: '音乐与环境音' });
  await expect(dialog.getByRole('list', { name: '播放队列' }).getByRole('listitem')).toHaveCount(3);
  await dialog.getByRole('tab', { name: '白噪音与环境音' }).click();
  await dialog.getByRole('button', { name: '白噪音', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '暂停 白噪音', exact: true })).toBeVisible();
  await dialog.getByRole('slider', { name: '白噪音音量' }).fill('0.13');
  await page.screenshot({ path: info.outputPath('ambient-controls.png') });
  await dialog.getByRole('tab', { name: '音乐与队列' }).click();
  await dialog.getByRole('slider', { name: '播放进度', exact: true }).fill('20000');
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.player.playback.positionMs)).toBeGreaterThanOrEqual(20000);
  await dialog.getByRole('button', { name: '随机', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '随机', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByRole('button', { name: '循环模式：顺序', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '循环模式：列表循环', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '播放 午后书页', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.player.currentItem?.track.title)).toBe('午后书页');
  await dialog.getByRole('button', { name: '随机', exact: true }).click();
  await dialog.getByRole('button', { name: '下一首', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.player.currentItem?.track.title)).toBe('夜间书桌');
  await dialog.getByRole('button', { name: '上一首', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.player.currentItem?.track.title)).toBe('午后书页');
  await dialog.getByRole('button', { name: '从队列移除 夜间书桌', exact: true }).click();
  await expect(dialog.getByRole('list', { name: '播放队列' }).getByRole('listitem')).toHaveCount(2);
  await page.screenshot({ path: info.outputPath('shared-controls.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(bar.getByRole('button', { name: '打开音乐' })).toBeFocused();
  await bar.getByRole('button', { name: '暂停', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.sound.settings.ambientTracks[0].status)).toBe('playing');
  await bar.getByRole('button', { name: '静音音乐', exact: true }).click();
  await expect(bar.getByRole('slider', { name: '音乐音量', exact: true })).toHaveAttribute('aria-valuetext', '0%，已静音');
  await expect(bar.getByRole('slider', { name: '音乐音量', exact: true })).toHaveValue('0');
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.sound.settings.musicBus.volume)).toBe(.32);
  await page.getByRole('link', { name: '声音', exact: true }).click();
  await globalPlayer.getByRole('button', { name: '展开播放器' }).click();
  await expect(globalPlayer.getByRole('slider', { name: '音乐音量', exact: true })).toHaveValue('0.32');
  await globalPlayer.getByRole('slider', { name: '音乐音量', exact: true }).fill('0.44');
  await page.getByRole('link', { name: '专注', exact: true }).click();
  await expect(bar).toContainText('午后书页');
  await expect(bar.getByRole('slider', { name: '音乐音量', exact: true })).toHaveValue('0.44');
  await expect(bar.getByRole('slider', { name: '环境音音量', exact: true })).toHaveValue('0.21');
  await bar.getByRole('button', { name: '打开音乐' }).click();
  await dialog.getByRole('tab', { name: '白噪音与环境音' }).click();
  await dialog.getByRole('button', { name: '暂停 白噪音', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '播放 白噪音', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.player.playback.status)).toBe('paused');
  await dialog.getByRole('tab', { name: '音乐与队列' }).click();
  await dialog.getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.player.playback.status)).toBe('playing');
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.sound.settings.ambientTracks[0].status)).toBe('stopped');
  await dialog.getByRole('button', { name: '清空', exact: true }).click();
  await expect(dialog.getByRole('list', { name: '播放队列' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('focus retains playback failure details and allows explicit recovery', async ({ page }) => {
  await prepare(page);
  await page.getByRole('link', { name: '专注', exact: true }).click();
  // Fault injection covers error presentation, not a claim of real network or platform failure.
  await page.evaluate(() => (window as any).testAudio.player.failPlayback('MEDIA_NETWORK_ERROR'));
  await page.getByRole('button', { name: '打开音乐' }).click();
  const dialog = page.getByRole('dialog', { name: '音乐与环境音' });
  await expect(dialog).toContainText('音频传输中断，请检查网络后重试。');
  await dialog.getByRole('button', { name: '重试', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).testAudio.player.playback.status)).toBe('playing');
  await page.evaluate(() => (window as any).testAudio.player.failPlayback('PROVIDER_RIGHTS_RESTRICTED'));
  await expect(dialog).toContainText('不会绕过会员或版权限制');
  await expect(dialog.getByRole('button', { name: '重试', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '播放', exact: true })).toBeDisabled();
});

for (const [width, height] of [[1440, 900], [1280, 720], [1080, 640], [390, 844]]) {
  test(`focus sound controls and modal fit ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height }); await prepare(page);
    await page.getByRole('link', { name: '专注', exact: true }).click();
    const bar = page.getByRole('region', { name: '专注控制条' });
    await bar.scrollIntoViewIfNeeded();
    const box = await bar.boundingBox();
    const timerBox = await page.locator('.focus-stack').boundingBox();
    expect(timerBox!.y + timerBox!.height).toBeLessThanOrEqual(box!.y);
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    for (const label of ['音乐音量', '环境音音量']) {
      const slider = bar.getByRole('slider', { name: label, exact: true });
      await expect(slider).toBeInViewport({ ratio: 1 });
      const sliderBox = await slider.boundingBox();
      expect(sliderBox!.y + sliderBox!.height).toBeLessThanOrEqual(box!.y + box!.height);
    }
    await page.screenshot({ path: info.outputPath(`bar-${width}.png`) });
    await bar.getByRole('button', { name: '打开音乐' }).click();
    const dialog = page.getByRole('dialog', { name: '音乐与环境音' });
    expect(await dialog.evaluate(el => el.matches(':modal'))).toBe(true);
    await expect(dialog.getByRole('button', { name: '关闭声音面板' })).toBeInViewport();
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`panel-${width}.png`) });
    await dialog.getByRole('button', { name: '关闭声音面板' }).click();
  });
}
