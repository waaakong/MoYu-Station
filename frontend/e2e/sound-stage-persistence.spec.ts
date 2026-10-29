import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
});
test('stage composition, tone and view survive reopening/reload; failed storage can retry', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/sound'); await page.getByRole('button', { name: '听歌舞台', exact: true }).click();
  const stage = page.getByRole('region', { name: '完整音乐视觉模式' });
  await page.getByRole('button', { name: '封面舞台', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: '歌词舞台', exact: true }).click();
  await page.getByRole('button', { name: '视觉设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '视觉设置' });
  await dialog.getByRole('combobox', { name: '色调', exact: true }).click();
  await page.getByRole('option', { name: '月白', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('studyroom-sound-settings-v1') || '{}').visualizer?.stage)).toEqual({ composition: 'lyrics', tone: 'moon', cameraX: 2, cameraY: 0 });
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '纯净模式', exact: true }).click();
  await page.reload(); await page.getByRole('button', { name: '听歌舞台', exact: true }).click();
  await expect(stage).toHaveClass(/listening-stage--moon/);
  await expect(page.getByRole('button', { name: '歌词舞台', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '返回声音', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '视觉设置', exact: true }).click();
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    (window as any).restoreSoundStorage = () => { Storage.prototype.setItem = original; };
    Storage.prototype.setItem = function (key, value) { if (key === 'studyroom-sound-settings-v1') throw new DOMException('test quota', 'QuotaExceededError'); return original.call(this, key, value); };
  });
  await dialog.getByRole('combobox', { name: '色调', exact: true }).click(); await page.getByRole('option', { name: '余烬暖铜', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('设置尚未保存');
  await page.screenshot({ path: info.outputPath('stage-save-failed.png'), animations: 'disabled' });
  await page.evaluate(() => (window as any).restoreSoundStorage());
  await dialog.getByRole('button', { name: '重试保存' }).click(); await expect(dialog.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('studyroom-sound-settings-v1')!).visualizer.stage.tone)).toBe('ember');
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '视角回正', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('studyroom-sound-settings-v1')!).visualizer.stage.cameraX)).toBe(0);
  expect(errors).toEqual([]);
});

test('a late failed lyric request cannot clear a newly selected track; failure exposes retry', async ({ page }) => {
  await page.goto('/sound'); await page.getByRole('button', { name: '听歌舞台', exact: true }).waitFor();
  await page.evaluate(async () => {
    const path = '/src/stores/player.ts', queuePath = '/src/stores/queue.ts';
    const { usePlayerStore } = await import(path), { useQueueStore } = await import(queuePath);
    const player = usePlayerStore(), queue = useQueueStore();
    queue.items = ['old', 'new'].map(id => ({ id, queuedAt: 1, track: { id, title: id, artist: 'Test', source: { kind: 'local', fileToken: `fixture-${id}` } } }));
    player.playback.currentItemId = 'old';
    let retry = false;
    Object.assign(window, { lyricPlayer: player, rejectOldLyrics: undefined });
    (window as any).studyRoomDesktop = {
      getTrackLyrics: ({ trackId }: { trackId: string }) => trackId === 'old'
        ? new Promise((_, reject) => { (window as any).rejectOldLyrics = reject; })
        : !retry ? Promise.reject(new Error('READ_FAILED')) : Promise.resolve({ trackId, content: '[00:00]已恢复歌词\n[00:03]当前第三秒', source: 'sidecar' }),
      getTrackLyricOffset: async () => ({ offsetMs: 0 }),
      saveTrackLyricOffset: async () => undefined
    };
    (window as any).retryLyrics = () => { retry = true; };
    const runtimePath = '/src/audio/lyrics/sharedLyricsRuntime.ts';
    const { startSharedLyricsSession } = await import(runtimePath);
    (window as any).stopSyntheticLyrics = startSharedLyricsSession();
  });
  await page.getByRole('button', { name: '听歌舞台', exact: true }).click();
  await page.getByRole('button', { name: '歌词舞台', exact: true }).click();
  await expect(page.getByText('正在读取歌词…', { exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).lyricPlayer.playback.currentItemId = 'new'; });
  await expect(page.getByRole('button', { name: '重试读取歌词' })).toBeVisible();
  await page.evaluate(() => (window as any).retryLyrics()); await page.getByRole('button', { name: '重试读取歌词' }).click();
  await expect(page.locator('.lyrics-panel__lines')).toContainText('已恢复歌词');
  await page.evaluate(() => { (window as any).rejectOldLyrics(new Error('OLD_FAILURE')); (window as any).lyricPlayer.playback.positionMs = 3500; });
  await expect(page.locator('.lyrics-panel__lines .current')).toHaveText('当前第三秒');
  await page.getByRole('button', { name: '歌词延后半秒' }).click();
  await expect(page.getByRole('button', { name: '+0.5s', exact: true })).toBeVisible();
  await page.evaluate(() => { (window as any).stopSyntheticLyrics(); delete (window as any).studyRoomDesktop; });
});
