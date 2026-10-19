import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("studyroom-scene-preferences-v3", JSON.stringify({ version: 3, sceneKey: "mountain", timeKey: "dusk", timeMode: "manual" }));
  });
  await page.route("**/api/**", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: route.request().url().endsWith("/api/auth/csrf") ? { token: "e2e-csrf-token" } : null }) }));
});

test("entertainment hub exposes six primary tools without business writes", async ({ page }) => {
  const businessRequests: string[] = [];
  page.on("request", (request) => { if (new URL(request.url()).pathname.startsWith("/api/")) businessRequests.push(request.url()); });
  await page.goto("/entertainment");
  await expect(page.getByRole("heading", { name: "休息一下" })).toBeVisible();
  const toolButtons = page.getByRole("region", { name: "放松工具" }).getByRole("button");
  await expect(toolButtons).toHaveCount(6);
  const baselineRequests = businessRequests.length;

  await page.getByRole("button", { name: /一分钟呼吸/ }).click();
  await page.getByRole("button", { name: "开始", exact: true }).click();
  await expect(page.getByText("吸气", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();

  await page.getByRole("button", { name: /电子木鱼/ }).click();
  await page.getByRole("button", { name: "敲击电子木鱼" }).click();
  await expect(page.getByText("1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回" }).click();

  await page.locator('.legacy-tools summary').click();
  await page.getByRole("button", { name: /摸鱼翻翻牌/ }).click();
  await page.getByRole("button", { name: "开始一局" }).click();
  await expect(page.getByRole("grid", { name: "翻牌区域" }).getByRole("gridcell")).toHaveCount(12);
  expect(businessRequests).toHaveLength(baselineRequests);
});

test("boss mode pauses tools and leaves through Escape", async ({ page }) => {
  await page.goto("/entertainment");
  await page.getByRole("button", { name: /电子木鱼/ }).click();
  await page.getByRole("button", { name: "开始自动节奏" }).click();
  await page.getByRole("button", { name: "老板模式" }).click();
  await expect(page.getByRole("region", { name: "老板模式" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "电子木鱼", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "开始自动节奏" })).toBeVisible();
});

test("retired fish sorting is inaccessible without deleting its saved record", async ({ page }) => {
  const saved = JSON.stringify({ version: 1, toolId: "fish-sorting", dimension: "color", fish: Array.from({ length: 12 }, (_, i) => ({ id: `fish-${i + 1}`, color: ["coral", "gold", "mint"][i % 3], shape: ["round", "long", "triangle"][Math.floor(i / 3) % 3] })), status: "paused" });
  await page.addInitScript((value) => {
    localStorage.setItem("studyroom-entertainment-v1:fish-sorting", value);
    localStorage.setItem("studyroom-entertainment-v1:preferences", JSON.stringify({ version: 1, toolId: "preferences", soundEnabled: true, reducedMotion: false, solidBackground: false, lastToolId: "fish-sorting" }));
  }, saved);
  await page.goto("/entertainment");
  await page.locator(".legacy-tools summary").click();
  await expect(page.getByRole("button", { name: /小鱼归池/ })).toHaveCount(0);
  await expect(page.locator(".legacy-tools").getByRole("button")).toHaveCount(2);
  await page.getByRole("button", { name: /声音调节/ }).click();
  await expect(page.getByRole("heading", { name: "声音调节", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: "返回", exact: true }).click();
  await page.getByRole("button", { name: "减少动态", exact: true }).click();
  await expect(page.getByRole("button", { name: "减少动态", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("studyroom-entertainment-v1:fish-sorting"))).toBe(saved);
});
