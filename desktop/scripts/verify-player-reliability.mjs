import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const evidence = await mkdtemp(join(tmpdir(), 'studyroom-electron-player-'));
const file = join(evidence, 'isolated-tone.wav');
const rate = 8000, samples = rate * 30, bytes = Buffer.alloc(44 + samples * 2);
bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + samples * 2, 4); bytes.write('WAVEfmt ', 8);
bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.round(Math.sin(i / rate * Math.PI * 880) * 1000), 44 + i * 2);
await writeFile(file, bytes);
await writeFile(join(evidence, 'isolated-tone.lrc'), '[00:00.00]Generated first line\n[00:03.00]Generated second line\n[00:08.00]Generated last line');
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let app; const errors = [];
try {
  app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [join(root, 'desktop'), `--user-data-dir=${join(evidence, 'isolated-user')}`, '--host-resolver-rules=MAP * ~NOTFOUND'], env });
  await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
  const page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: '关闭窗口', exact: true }).waitFor();
  await page.evaluate(() => { location.hash = '#/sound'; });
  await page.getByRole('button', { name: '导入文件', exact: true }).click();
  const track = page.getByRole('button', { name: '播放 isolated-tone', exact: true });
  await expect(track).toBeVisible();
  // Hold the first real media play acknowledgement; keep native media and IPC intact.
  await page.evaluate(() => {
    globalThis.releaseAudioPlay = undefined;
    const originalPlay = HTMLMediaElement.prototype.play;
    globalThis.mediaPlayCalls = 0;
    HTMLMediaElement.prototype.play = function () {
      globalThis.mediaPlayCalls++;
      const playing = originalPlay.call(this);
      if (globalThis.mediaPlayCalls > 1) return playing;
      const result = playing.then(() => null, error => error);
      return new Promise((resolve, reject) => { globalThis.releaseAudioPlay = () => result.then(error => error ? reject(error) : resolve()); });
    };
  });
  await track.click();
  await expect.poll(() => page.evaluate(() => typeof globalThis.releaseAudioPlay)).toBe('function');
  // Pause through this app's real store while its play acknowledgement is in flight.
  await page.evaluate(() => {
    const player = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('player');
    player.pause(); globalThis.releaseAudioPlay();
  });
  const controls = page.locator('.desktop-shell__player-slot');
  await expect(controls.getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => globalThis.mediaPlayCalls)).toBe(1);
  await controls.getByRole('button', { name: '播放', exact: true }).click();
  await expect(controls.getByRole('button', { name: '暂停', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('player').playback.positionMs)).toBeGreaterThan(0);
  await controls.getByRole('button', { name: '暂停', exact: true }).click();
  for (const size of [[1440, 900], [1280, 720], [1080, 640]]) {
    await app.evaluate(({ BrowserWindow }, size) => { const window = BrowserWindow.getAllWindows()[0]; window.unmaximize(); window.setSize(...size); }, size);
    await expect(controls.getByRole('button', { name: '播放', exact: true })).toBeInViewport();
    await page.screenshot({ path: join(evidence, `paused-${size[0]}.png`), animations: 'disabled' });
  }
  const queue = await page.evaluate(() => window.studyRoomDesktop.readQueue());
  expect(queue).toHaveLength(1); expect(queue[0].track.title).toBe('isolated-tone');
  await page.getByRole('button', { name: '听歌舞台', exact: true }).click();
  await page.getByRole('button', { name: '歌词舞台', exact: true }).click();
  await expect(page.locator('.lyrics-panel__lines')).toContainText('Generated first line');
  await page.evaluate(() => document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('player').seek(3500));
  await expect(page.locator('.lyrics-panel__lines .current')).toHaveText('Generated second line');
  await page.getByRole('button', { name: '歌词延后半秒' }).click();
  await expect.poll(async () => (await page.evaluate(id => window.studyRoomDesktop.getTrackLyricOffset({ trackId: id }), queue[0].track.id)).offsetMs).toBe(500);
  await page.getByRole('button', { name: '视觉设置', exact: true }).click();
  await page.getByRole('combobox', { name: '色调', exact: true }).click();
  await page.getByRole('option', { name: '余烬暖铜', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await page.evaluate(() => window.studyRoomDesktop.readSoundSettings())).visualizer.stage.tone).toBe('ember');
  await page.screenshot({ path: join(evidence, 'stage-lyrics-persisted.png'), animations: 'disabled' });
  await app.close();
  app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [join(root, 'desktop'), `--user-data-dir=${join(evidence, 'isolated-user')}`, '--host-resolver-rules=MAP * ~NOTFOUND'], env });
  const reopened = await app.firstWindow(); reopened.on('pageerror', error => errors.push(error.message));
  await reopened.getByRole('button', { name: '关闭窗口', exact: true }).waitFor();
  await expect(reopened.locator('#main-stage')).toBeVisible();
  await reopened.evaluate(() => { location.hash = '#/sound'; });
  await reopened.getByRole('button', { name: '听歌舞台', exact: true }).click();
  await expect(reopened.getByRole('region', { name: '完整音乐视觉模式' })).toHaveClass(/listening-stage--ember/);
  await expect(reopened.getByRole('button', { name: '歌词舞台', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(reopened.getByRole('button', { name: '+0.5s', exact: true })).toBeVisible();
  await expect(reopened.locator('.desktop-shell__player-slot').getByRole('button', { name: '播放', exact: true })).toBeVisible();
  await reopened.screenshot({ path: join(evidence, 'stage-restored-after-restart.png'), animations: 'disabled' });
  expect(errors).toEqual([]);
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ passed: true, evidence, errors, queueItems: queue.length, scope: 'Real isolated library import, IPC, SQLite queue, local media and sidecar LRC, offset/stage preferences retained across process restart; delayed play acknowledgement injected. Not physical media-key, speaker, installed package or sleep acceptance.' }, null, 2));
  console.log(JSON.stringify({ passed: true, evidence, errors }));
} catch (error) {
  const current = app?.windows()[0];
  await current?.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {});
  const diagnostic = await current?.evaluate(() => ({ href: location.href, text: document.body.innerText.slice(0, 2500) })).catch(() => null);
  await writeFile(join(evidence, 'failure.json'), JSON.stringify({ error: String(error), diagnostic, errors }, null, 2));
  console.error(evidence, diagnostic); throw error;
} finally { await app?.close(); }
