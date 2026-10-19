import { _electron as electron, expect } from "@playwright/test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const evidence = await mkdtemp(join(tmpdir(), "moyu-window-chrome-"));
const userData = join(evidence, "isolated-user");
const errors = [];
let application;
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await electron.launch({
    executablePath: join(root, "node_modules/electron/dist/electron.exe"),
    args: [join(root, "desktop"), `--user-data-dir=${userData}`], env, timeout: 30000
  });
  await application.evaluate(({ session }) => {
    for (const s of [session.defaultSession, session.fromPartition("persist:studyroom-cloud-v1")]) {
      s.webRequest.onBeforeRequest({ urls: ["https://*/*", "http://*/*"] }, (_details, done) => done({ cancel: true }));
    }
  });
  const page = await application.firstWindow();
  page.on("pageerror", error => errors.push(error.message));
  await page.getByRole("button", { name: "关闭窗口", exact: true }).waitFor();
  return page;
}
async function show() {
  await application.evaluate(({ BrowserWindow }) => { const w = BrowserWindow.getAllWindows()[0]; w.restore(); w.show(); w.focus(); });
}
async function isVisible() { return application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()); }
async function setSize(width, height) {
  await application.evaluate(({ BrowserWindow }, [w, h]) => { const window = BrowserWindow.getAllWindows()[0]; window.unmaximize(); window.setSize(w, h); }, [width, height]);
}
const state = page => page.evaluate(() => window.studyRoomDesktop.readWindowState());
try {
  let page = await launch();
  await page.screenshot({ path: join(evidence, "welcome.png") });
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "关闭窗口", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("不再提示", { exact: false })).not.toBeChecked();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  expect((await state(page)).closeBehavior).toBe("ask");

  await page.evaluate(() => { location.hash = "#/scene"; });
  await page.getByRole("link", { name: "空间", exact: true }).waitFor();
  for (const [width, height] of [[1440,900],[1280,720],[1080,640]]) {
    await setSize(width, height);
    await expect(page.locator(".app-chrome .window-chrome")).toBeVisible();
    await page.screenshot({ path: join(evidence, `scene-${width}.png`) });
    const geometry = await page.getByRole("button", { name: "关闭窗口", exact: true }).boundingBox();
    expect(geometry.x).toBeGreaterThan(width - 100);
    expect(geometry.y).toBeLessThan(20);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "最大化窗口", exact: true }).click();
  await expect(page.getByRole("button", { name: "还原窗口", exact: true })).toBeVisible();
  const bounds = await application.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0], b = window.getBounds();
    return { bounds: b, content: window.getContentBounds(), area: screen.getDisplayMatching(b).workArea, maximized: window.isMaximized() };
  });
  expect(bounds.maximized).toBe(true);
  // DWM resize margins may extend a few DIP beyond workArea; content must respect taskbar.
  expect(bounds.bounds.height).toBeLessThanOrEqual(bounds.area.height + 16);
  expect(bounds.content.x).toBeGreaterThanOrEqual(bounds.area.x);
  expect(bounds.content.y).toBeGreaterThanOrEqual(bounds.area.y);
  expect(bounds.content.x + bounds.content.width).toBeLessThanOrEqual(bounds.area.x + bounds.area.width);
  expect(bounds.content.y + bounds.content.height).toBeLessThanOrEqual(bounds.area.y + bounds.area.height);
  await page.getByRole("button", { name: "还原窗口", exact: true }).click();
  await expect(page.getByRole("button", { name: "最大化窗口", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "最小化窗口", exact: true }).click();
  expect(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMinimized())).toBe(true);
  await show();

  await page.getByRole("button", { name: "外观与性能", exact: true }).click();
  await page.getByRole("combobox", { name: "关闭主窗口时", exact: true }).click();
  await page.getByRole("option", { name: "退出程序", exact: true }).click();
  await expect.poll(async () => (await state(page)).closeBehavior).toBe("quit");
  await page.getByRole("combobox", { name: "关闭主窗口时", exact: true }).click();
  await page.getByRole("option", { name: "每次询问", exact: true }).click();
  await page.getByRole("button", { name: "关闭面板", exact: true }).click();

  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.screenshot({ path: join(evidence, "close-choice.png") });
  await dialog.getByRole("button", { name: "确定", exact: true }).click();
  await expect.poll(isVisible).toBe(false);
  await show();
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("不再提示", { exact: false }).check();
  await dialog.getByRole("button", { name: "确定", exact: true }).click();
  await expect.poll(isVisible).toBe(false);
  await show();
  expect((await state(page)).closeBehavior).toBe("tray");
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  await expect.poll(isVisible).toBe(false);
  await show();

  // Real process restart; remembered tray behavior is persisted in isolated SQLite.
  await application.close();
  page = await launch();
  expect((await state(page)).closeBehavior).toBe("tray");
  await page.evaluate(() => window.studyRoomDesktop.setWindowCloseBehavior("ask"));
  await page.getByRole("button", { name: "关闭窗口", exact: true }).click();
  const reopened = page.getByRole("dialog", { name: "关闭窗口", exact: true });
  await reopened.getByRole("radio", { name: /退出程序/ }).check();
  const exited = application.waitForEvent("close");
  await reopened.getByRole("button", { name: "确定", exact: true }).click();
  const saveFailure = page.locator(".close-error[role=alert]").waitFor({ state: "visible", timeout: 20000 })
    .then(async () => { throw new Error(await page.locator(".close-error[role=alert]").innerText()); })
    .catch(error => { if (page.isClosed()) return exited; throw error; });
  await Promise.race([exited, saveFailure]);
  expect(errors).toEqual([]);
  await writeFile(join(evidence, "result.json"), JSON.stringify({ passed: true, evidence, bounds, errors,
    unverified: ["physical Snap / double-click / Alt+F4", "multiple physical displays and DPI changes", "installed package and all-page redesign"] }, null, 2));
  console.log(JSON.stringify({ passed: true, evidence }));
} catch (error) {
  const diagnostic = await application?.windows()[0]?.evaluate(async () => ({
    state: await window.studyRoomDesktop.readWindowState(),
    dialogs: [...document.querySelectorAll("dialog")].map(d => ({ open: d.open, text: d.innerText }))
  })).catch(() => null);
  await application?.windows()[0]?.screenshot({ path: join(evidence, "failure.png") }).catch(() => {});
  await writeFile(join(evidence, "result.json"), JSON.stringify({ passed: false, evidence, error: String(error), errors, diagnostic }, null, 2));
  console.error(evidence, error);
  process.exitCode = 1;
} finally {
  if (application) await application.close().catch(() => {});
}
