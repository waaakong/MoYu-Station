import { expect, test, type Page } from "@playwright/test";

const sceneViewports = [
  { width: 1280, height: 720 },
  { width: 1366, height: 768 },
  { width: 1600, height: 900 },
  { width: 1920, height: 1080 }
] as const;
const focusViewports = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 }
] as const;

async function preparePage(page: Page) {
  await page.clock.install({ time: new Date("2026-09-14T10:30:00+08:00") });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("studyroom-scene-preferences-v3", JSON.stringify({
      version: 3,
      sceneKey: "mountain",
      timeKey: "forenoon",
      timeMode: "manual"
    }));
    localStorage.setItem("studyroom-shell-preferences-v2", JSON.stringify({
      compact: false,
      reducedMotion: true,
      reducedTransparency: false,
      lowPerformance: false
    }));
  });
  await page.route("**/api/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const data = pathname.endsWith("/auth/csrf")
      ? { token: "e2e-csrf-token" }
      : pathname.endsWith("/focus/today")
      ? { checkedIn: false, level: 1, exp: 0, nextLevelExp: 10, levelProgress: 0 }
      : null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data })
    });
  });
}

async function settleScene(page: Page) {
  await expect(page.locator(".scene-background__layer--active:not(.scene-background__layer--placeholder)")).toBeVisible();
  await page.addStyleTag({
    content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}.scene-page__grain{display:none!important}"
  });
  await page.locator(".scene-picker__thumb img").evaluateAll(async (images: HTMLImageElement[]) => {
    await Promise.all(images.map(async (image) => {
      if (!image.complete) await new Promise<void>((resolve) => image.addEventListener("load", () => resolve(), { once: true }));
      await image.decode();
    }));
  });
  await page.evaluate(() => document.fonts.ready);
}

for (const viewport of sceneViewports) {
  test(`scene visual baseline ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await preparePage(page);
    await page.setViewportSize(viewport);
    await page.goto("/scene");
    await settleScene(page);

    await expect(page.getByRole("navigation", { name: "主要功能" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /先选一扇窗/ })).toBeVisible();
    await expect(page.getByRole("list", { name: "内置场景" }).getByRole("button")).toHaveCount(6);
    await expect(page.getByRole("button", { name: "进入这个场景" })).toBeVisible();
    await expect(page.getByRole("group", { name: "场景时段" }).getByRole("button")).toHaveCount(7);
    await expect(page.getByRole("group", { name: "时间跟随模式" }).getByRole("button")).toHaveCount(3);
    await expect(page.locator('[aria-label="播放器"]')).toBeVisible();

    const filename = `phase7-scene-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: testInfo.outputPath(filename), animations: "disabled" });
    await expect(page).toHaveScreenshot(filename, { animations: "disabled" });
  });
}

for (const viewport of focusViewports) {
  test(`focus visual baseline ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await preparePage(page);
    await page.setViewportSize(viewport);
    await page.goto("/focus");
    await settleScene(page);

    await expect(page.getByRole("navigation", { name: "主要功能" })).toBeVisible();
    await expect(page.locator(".timer")).toHaveText("25:00");
    await expect(page.locator('[aria-label="专注控制条"]')).toBeVisible();
    await expect(page.getByRole("button", { name: "沉浸模式" })).toBeVisible();
    await page.getByRole("button", { name: "沉浸模式" }).click();
    await expect(page.getByRole("button", { name: "退出沉浸" })).toBeVisible();
    await page.getByRole("button", { name: "退出沉浸" }).click();

    const filename = `phase7-focus-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: testInfo.outputPath(filename), animations: "disabled" });
    await expect(page).toHaveScreenshot(filename, { animations: "disabled" });
  });
}
