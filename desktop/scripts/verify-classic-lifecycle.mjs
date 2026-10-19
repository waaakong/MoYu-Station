import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..'), evidence = await mkdtemp(join(tmpdir(), 'studyroom-classic-lifecycle-'));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const ids = ['puzzle', 'game2048', 'minesweeper', 'spider'];
const names = ['风景拼图', '2048', '扫雷', '蜘蛛纸牌'];
let app, page; const errors = [], saved = {};
async function launch() {
  app = await electron.launch({ executablePath: join(root, 'node_modules/electron/dist/electron.exe'), args: [join(root, 'desktop'), `--user-data-dir=${join(evidence, 'isolated-user')}`, '--host-resolver-rules=MAP * ~NOTFOUND'], env });
  page = await app.firstWindow(); page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: '关闭窗口', exact: true }).waitFor();
  await page.evaluate(() => { location.hash = '#/entertainment'; });
  await page.bringToFront(); await expect(page.getByRole('heading', { name: '休息一下', exact: true })).toBeVisible();
}
const read = id => page.evaluate(async id => (await window.studyRoomDesktop.readEntertainmentState({ toolId: id }))?.state, id);
async function quitNormally() {
  await page.evaluate(() => window.studyRoomDesktop.setWindowCloseBehavior('ask'));
  await page.getByRole('button', { name: '关闭窗口', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '关闭窗口', exact: true });
  await dialog.getByRole('radio', { name: /退出程序/ }).check();
  const ended = app.waitForEvent('close', { timeout: 20000 });
  await dialog.getByRole('button', { name: '确定', exact: true }).click(); await ended; app = undefined;
}
try {
  await launch();
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index];
    await page.getByRole('region', { name: '放松工具' }).getByRole('button', { name: new RegExp(names[index]) }).click();
    await expect.poll(async () => !!await read(id)).toBe(true);
    if (id === 'puzzle') { await page.locator('.puzzle-grid button').nth(0).click(); await page.locator('.puzzle-grid button').nth(1).click(); }
    if (id === 'game2048') { await page.getByRole('button', { name: '向左移动' }).click(); await page.getByRole('button', { name: '向下移动' }).click(); }
    if (id === 'minesweeper') await page.locator('.mines-grid button').first().click();
    if (id === 'spider') await page.getByRole('button', { name: /发一排牌/ }).click();
    await expect.poll(async () => (await read(id)).revision).toBeGreaterThan(0);
    saved[id] = await read(id);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await expect(page.locator('.classic-scroll')).toHaveAttribute('inert', '');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('button', { name: '老板模式', exact: true }).click();
    await expect(page.getByRole('region', { name: '老板模式' })).toBeVisible();
    await page.getByRole('button', { name: '返回娱乐空间' }).click();
    await expect(page.locator('.classic-game')).toBeVisible();
    expect(await read(id)).toEqual(saved[id]);
    await page.getByRole('button', { name: '返回', exact: true }).click();
  }
  await quitNormally(); await launch();
  for (let index = 0; index < ids.length; index++) {
    const id = ids[index]; expect(await read(id)).toEqual(saved[id]);
    await page.getByRole('region', { name: '放松工具' }).getByRole('button', { name: new RegExp(names[index]) }).click();
    await expect(page.locator('.classic-game')).toBeVisible();
    if (id === 'spider') {
      for (const size of [[1440, 900], [1280, 720], [1080, 640]]) {
        await app.evaluate(({ BrowserWindow }, size) => { const window = BrowserWindow.getAllWindows()[0]; window.unmaximize(); window.setSize(...size); }, size);
        await expect(page.getByRole('button', { name: /撤销/ })).toBeInViewport();
        await page.screenshot({ path: join(evidence, `resumed-spider-${size[0]}.png`), animations: 'disabled' });
      }
      // Deliver the real application's lifecycle IPC (not a physical sleep claim).
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('app:desktop-lifecycle', { type: 'suspend' }));
      // Channel name is verified against the shared contract before running this script.
      await expect(page.locator('.classic-scroll')).toHaveAttribute('inert', '');
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('app:desktop-lifecycle', { type: 'resume' }));
      await expect(page.locator('.classic-scroll')).not.toHaveAttribute('inert', '');
      await page.getByRole('button', { name: /撤销/ }).click();
      await expect.poll(async () => (await read(id)).stock.length).toBe(50);
    }
    await page.getByRole('button', { name: '返回', exact: true }).click();
  }
  await quitNormally(); expect(errors).toEqual([]);
  await writeFile(join(evidence, 'result.json'), JSON.stringify({ passed: true, evidence, errors, savedRevisions: Object.fromEntries(ids.map(id => [id, saved[id].revision])), scope: 'Real Electron, isolated SQLite, normal quit and process restart; synthetic suspend/resume IPC, not physical sleep or installed-client acceptance.' }, null, 2));
  console.log(JSON.stringify({ passed: true, evidence, errors }));
} catch (error) {
  await page?.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {});
  console.error(evidence); throw error;
} finally { await app?.close(); }
