import { expect, test } from '@playwright/test';

test('real audio stays paused after context resume arrives late; explicit replay still works', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
  await page.goto('/sound');
  await page.getByRole('button', { name: '听歌舞台', exact: true }).waitFor();
  await page.evaluate(async () => {
    const playerPath = '/src/stores/player.ts', queuePath = '/src/stores/queue.ts', graphPath = '/src/audio/runtime/audioRuntime.ts';
    const { usePlayerStore } = await import(playerPath);
    const { useQueueStore } = await import(queuePath);
    const { sharedAudioGraph } = await import(graphPath);
    // A generated ten-second PCM tone exercises the real Chromium media element.
    const sampleRate = 8000, count = sampleRate * 10, buffer = new ArrayBuffer(44 + count * 2), view = new DataView(buffer);
    const text = (offset: number, value: string) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    text(36, 'data'); view.setUint32(40, count * 2, true);
    for (let index = 0; index < count; index++) view.setInt16(44 + index * 2, Math.sin(index / sampleRate * Math.PI * 880) * 1000, true);
    const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    const item = { id: 'test-real-tone', queuedAt: 1, track: { id: 'test-real-tone', title: '播放可靠性测试', artist: '隔离生成音频', source: { kind: 'builtin', assetId: url } } };
    const player = usePlayerStore(); await useQueueStore().replace([item]); await player.load(item);
    const originalResume = sharedAudioGraph.resume.bind(sharedAudioGraph);
    let finish!: (value: boolean) => void;
    sharedAudioGraph.resume = () => new Promise<boolean>(resolve => { finish = resolve; });
    let plays = 0;
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () { plays++; return originalPlay.call(this); };
    const pending = player.play(); player.pause(); finish(true); await pending;
    if (plays !== 0 || player.playback.status !== 'paused') throw new Error('Late context resume restarted playback');
    sharedAudioGraph.resume = originalResume;
    Object.assign(window, { reliabilityPlayer: player, reliabilityCleanup: () => { player.clear(); URL.revokeObjectURL(url); HTMLMediaElement.prototype.play = originalPlay; } });
  });
  // A real click supplies browser user activation; no autoplay security bypass.
  await page.locator('.desktop-shell__player-slot').getByRole('button', { name: '播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).reliabilityPlayer.playback.status)).toBe('playing');
  await expect.poll(() => page.evaluate(() => (window as any).reliabilityPlayer.playback.positionMs)).toBeGreaterThan(0);
  await page.locator('.desktop-shell__player-slot').getByRole('button', { name: '暂停', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).reliabilityPlayer.playback.status)).toBe('paused');
  await page.screenshot({ path: info.outputPath('real-audio-paused.png'), animations: 'disabled' });
  await page.evaluate(() => (window as any).reliabilityCleanup());
  expect(errors).toEqual([]);
});
