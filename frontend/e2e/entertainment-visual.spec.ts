import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

for (const viewport of [{ width: 1280, height: 720 }, { width: 1600, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`entertainment visual baseline ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("studyroom-scene-preferences-v3", JSON.stringify({ version: 3, sceneKey: "mountain", timeKey: "dusk", timeMode: "manual" }));
      localStorage.setItem("studyroom-shell-preferences-v2", JSON.stringify({ compact: false, reducedMotion: true, reducedTransparency: false, lowPerformance: false }));
    });
    await page.route("**/api/**", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: route.request().url().endsWith("/api/auth/csrf") ? { token: "e2e-csrf-token" } : null }) }));
    await page.goto("/entertainment");
    await expect(page.locator(".scene-background__layer--active:not(.scene-background__layer--placeholder)")).toBeVisible();
    await expect(page.getByRole("region", { name: "放松工具" }).getByRole("button")).toHaveCount(5);
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
    await page.evaluate(() => document.fonts.ready);
    const filename = `phase10-entertainment-${viewport.width}x${viewport.height}.png`;
    await page.screenshot({ path: testInfo.outputPath(filename), animations: "disabled" });
    await expect(page).toHaveScreenshot(filename, { animations: "disabled" });
  });
}
