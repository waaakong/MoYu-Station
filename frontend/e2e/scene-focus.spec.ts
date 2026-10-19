import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const data = route.request().url().endsWith("/api/auth/csrf") ? { token: "e2e-csrf-token" } : null;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data })
    });
  });
});

test("scene selection exposes six built-in scenes and three time modes", async ({ page }) => {
  await page.goto("/scene");

  await expect(page.getByRole("list", { name: "内置场景" }).getByRole("button")).toHaveCount(6);
  await expect(page.locator('.panel-head').getByRole('button', { name: '自定义场景', exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "时间跟随模式" }).getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "手动" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "智能跟随" }).click();
  await expect(page.getByRole("button", { name: "智能跟随" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("专注开始后锁定当前光线，结束后继续跟随。", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("studyroom-scene-preferences-v3") || "null").timeMode)).toBe("smart");
});

test("scene and time controls share persisted state", async ({ page }) => {
  await page.goto("/scene");

  await page.getByRole("button", { name: /森林/ }).click();
  await page.getByRole("button", { name: "黄昏", exact: true }).click();

  await expect(page.locator("[data-scene-background]")).toHaveAttribute("data-scene", "forest");
  await expect(page.locator("[data-scene-background]")).toHaveAttribute("data-time", "dusk");
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("studyroom-scene-preferences-v3") || "null");
    return `${saved.sceneKey}:${saved.timeKey}`;
  })).toBe("forest:dusk");
});

test("scene keyboard shortcuts ignore editable controls", async ({ page }) => {
  await page.goto("/scene");
  await expect(page.getByRole("button", { name: /高山湖泊/ })).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /海边沙滩/ })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("f");
  await expect(page.getByRole("button", { name: "智能跟随" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "进入这个场景" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /森林/ })).toHaveAttribute("aria-pressed", "true");

  await page.evaluate(() => {
    const input = document.createElement("input");
    input.setAttribute("aria-label", "快捷键隔离测试");
    document.body.append(input);
    input.focus();
  });
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /森林/ })).toHaveAttribute("aria-pressed", "true");
});

test("scene page only fetches the active background, six thumbnails and at most two idle neighbors", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const requests = new Set<string>();
  page.on("request", (request) => {
    if (request.resourceType() === "image" && request.url().includes("/scenes/generated/")) requests.add(new URL(request.url()).pathname);
  });
  await page.goto("/scene");
  await expect(page.locator(".scene-background__layer--active:not(.scene-background__layer--placeholder)")).toBeVisible();

  // The shell background can finish before the scene route and its thumbnails mount.
  await expect(page.locator('.scene-picker img')).toHaveCount(6);
  await expect.poll(() => page.locator('.scene-picker img').evaluateAll(images =>
    images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0)
  )).toBe(true);
  const runtimeImages = [...requests];
  expect(runtimeImages.filter((url) => url.includes("-360.webp")).length).toBe(6);
  expect(runtimeImages.filter((url) => url.includes("-1280.webp")).length).toBeLessThanOrEqual(3);
  expect(runtimeImages.some((url) => url.includes("-1672."))).toBe(false);
  expect(runtimeImages.length).toBeLessThanOrEqual(9);
});

test("idle scene prefetch never exceeds two concurrent image requests", async ({ page }) => {
  let active = 0;
  let peak = 0;
  await page.route("**/scenes/generated/**/*-1280.webp", async (route) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.continue();
    active -= 1;
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/scene");
  await expect(page.locator(".scene-background__layer--active:not(.scene-background__layer--placeholder)")).toBeVisible();
  await expect.poll(() => peak).toBeGreaterThanOrEqual(1);
  expect(peak).toBeLessThanOrEqual(2);
});

test("fifty rapid scene changes commit only the latest decoded background", async ({ page }) => {
  await page.goto("/scene");
  const buttons = page.getByRole("list", { name: "内置场景" }).getByRole("button");
  await expect(buttons).toHaveCount(6);
  await buttons.evaluateAll((items) => {
    for (let index = 0; index < 50; index += 1) (items[index % items.length] as HTMLButtonElement).click();
  });

  await expect(page.locator(".scene-background__layer--active:not(.scene-background__layer--placeholder)")).toHaveAttribute("data-layer-scene", "beach");
});

test("six warmed built-in scenes remain usable after the browser goes offline", async ({ page, context }) => {
  await page.goto("/scene");
  const sceneKeys = ["mountain", "beach", "forest", "library", "cafe", "snow"];
  const buttons = page.getByRole("list", { name: "内置场景" }).getByRole("button");
  for (let index = 0; index < sceneKeys.length; index += 1) {
    await buttons.nth(index).click();
    await expect(page.locator(".scene-background__layer--active:not(.scene-background__layer--placeholder)")).toHaveAttribute("data-layer-scene", sceneKeys[index]);
  }

  await context.setOffline(true);
  for (let index = sceneKeys.length - 1; index >= 0; index -= 1) {
    await buttons.nth(index).click();
    await expect(page.locator(".scene-background__layer--active:not(.scene-background__layer--placeholder)")).toHaveAttribute("data-layer-scene", sceneKeys[index]);
  }
});

test("JPEG is used when the preferred WebP background fails", async ({ page }) => {
  await page.route("**/scenes/generated/**/*.webp", (route) => route.abort());
  await page.goto("/scene");

  const activeLayer = page.locator(".scene-background__layer--active:not(.scene-background__layer--placeholder)");
  await expect(activeLayer.locator("source")).toHaveCount(0);
  await expect(activeLayer.locator("img")).toHaveAttribute("src", /\.jpg$/);
});

test("a failed replacement keeps the previous decoded background", async ({ page }) => {
  await page.goto("/scene");
  const activeLayer = page.locator(".scene-background__layer--active:not(.scene-background__layer--placeholder)");
  await expect(activeLayer).toHaveAttribute("data-layer-scene", "mountain");
  await page.route("**/scenes/generated/forest/**", (route) => route.abort());

  await page.getByRole("button", { name: /森林/ }).click();
  await expect(page.getByText("场景图片加载失败，已保留上一张背景。", { exact: true })).toBeVisible();
  await expect(activeLayer).toHaveAttribute("data-layer-scene", "mountain");
});

test("scene panel remains operable at the minimum viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/scene");

  await expect(page.getByRole("button", { name: "进入这个场景" })).toBeVisible();
  await expect(page.getByRole("group", { name: "时间跟随模式" })).toBeVisible();
  await page.getByRole("button", { name: /雪山窗边/ }).scrollIntoViewIfNeeded();
  await expect(page.getByRole("button", { name: /雪山窗边/ })).toBeVisible();
});

test("entering focus keeps the shared scene without query parameters", async ({ page }) => {
  await page.goto("/scene");
  await page.getByRole("button", { name: /森林/ }).click();
  await page.getByRole("button", { name: "黄昏", exact: true }).click();
  await page.getByRole("button", { name: "进入这个场景" }).click();

  await expect(page).toHaveURL(/\/focus$/);
  await expect(page.locator("[data-scene-background]")).toHaveAttribute("data-scene", "forest");
  await expect(page.locator("[data-scene-background]")).toHaveAttribute("data-time", "dusk");
});

test("focus lock starts from a local record and ends on reset", async ({ page }) => {
  await page.goto("/focus");

  await expect(page.locator(".focus-page")).toHaveAttribute("data-focus-lock", "");
  await page.getByRole("button", { name: /开始专注/ }).click();
  await expect(page.locator(".focus-page")).toHaveAttribute("data-focus-lock", /^[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "重置专注" }).click();
  await expect(page.locator(".focus-page")).toHaveAttribute("data-focus-lock", "");
});

test("focus controls expose all three modes and update the active scene snapshot", async ({ page }) => {
  await page.route("**/api/focus/start", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { id: "record-controls" } }) });
  });
  await page.goto("/focus");
  await page.getByRole("button", { name: /开始专注/ }).click();

  await page.locator(".mode-picker > button").click();
  await expect(page.getByRole("group", { name: "时间跟随模式" }).getByRole("button")).toHaveCount(3);
  await page.getByRole("group", { name: "时间跟随模式" }).getByRole("button", { name: /智能跟随/ }).click();
  await page.getByRole("button", { name: "下一个场景" }).click();
  await page.locator(".time-trigger").click();
  await page.locator(".time-menu").getByRole("button", { name: "黄昏" }).click();

  await expect(page.locator(".focus-page")).toHaveAttribute("data-focus-scene", "beach");
  await expect(page.locator(".focus-page")).toHaveAttribute("data-focus-time", "dusk");
  await expect(page.locator(".mode-picker > button")).toContainText("智能跟随");
});

test("server unavailability never blocks local focus creation", async ({ page }) => {
  await page.route("**/api/focus/start", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, message: "暂时无法创建记录" }) });
  });
  await page.goto("/focus");
  await page.getByRole("button", { name: /开始专注/ }).click();

  await expect(page.locator(".focus-page")).toHaveAttribute("data-focus-lock", /^[0-9a-f-]{36}$/);
  await expect(page.getByText(/暂时无法创建记录|暂时无法开始专注/)).toHaveCount(0);
});

test("pausing and leaving the page preserve the same focus lock", async ({ page }) => {
  await page.goto("/focus");
  await page.getByRole("button", { name: /开始专注/ }).click();
  await page.getByRole("button", { name: /暂停/ }).click();
  const recordId = await page.locator(".focus-page").getAttribute("data-focus-lock");
  expect(recordId).toMatch(/^[0-9a-f-]{36}$/);

  await page.getByRole("link", { name: "场景", exact: true }).click();
  await expect(page).toHaveURL(/\/scene$/);
  await page.getByRole("link", { name: "专注", exact: true }).click();
  await expect(page.locator(".focus-page")).toHaveAttribute("data-focus-lock", recordId!);
  await expect(page.getByRole("button", { name: /继续专注/ })).toBeVisible();
});

test("a restored focus session rebuilds its scene snapshot", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studyroom-focus-session-v2", JSON.stringify({
      version: 2,
      clientRecordId: "00000000-0000-4000-8000-000000000004",
      plannedMinutes: 45,
      startedAt: Date.now() - 300 * 1000,
      elapsedBeforeSegmentMs: 300 * 1000,
      state: "paused",
      sceneCode: "library",
      timeKey: "night",
      syncPolicy: "manual-only"
    }));
  });
  await page.goto("/focus");

  await expect(page.locator(".focus-page")).toHaveAttribute("data-focus-lock", "00000000-0000-4000-8000-000000000004");
  await expect(page.locator("[data-scene-background]")).toHaveAttribute("data-scene", "library");
  await expect(page.locator("[data-scene-background]")).toHaveAttribute("data-time", "night");
  await expect(page.getByRole("button", { name: /继续专注/ })).toBeVisible();
});

test("pre-login history is uploaded only after a range confirmation", async ({ page }) => {
  const startedAt = Date.now() - 60_000;
  await page.addInitScript(({ startedAt }) => {
    localStorage.setItem("studyroom-focus-records-v2", JSON.stringify([{
      clientRecordId: "00000000-0000-4000-8000-000000000009",
      startedAt,
      finishedAt: startedAt + 60_000,
      plannedMinutes: 1,
      completedMinutes: 1,
      completedSeconds: 60,
      sceneCode: "mountain",
      timeKey: "morning",
      status: "completed",
      syncStatus: "local",
      syncPolicy: "manual-only"
    }]));
  }, { startedAt });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data: { id: 7, username: "tester", role: "USER" } })
  }));
  let syncBody: Record<string, unknown> | undefined;
  await page.route("**/api/focus/sync", async (route) => {
    syncBody = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { results: [{
        clientRecordId: "00000000-0000-4000-8000-000000000009", status: "accepted", cloudRecordId: 9
      }] } })
    });
  });
  page.once("dialog", (dialog) => dialog.accept());

  await page.goto("/focus");
  await page.getByRole("button", { name: "打开备忘录" }).click();
  await expect(page.getByRole("region", { name: "本地专注历史导入" })).toContainText("1 条");
  await page.getByRole("button", { name: "确认导入云端" }).click();

  await expect(page.getByRole("region", { name: "本地专注历史导入" })).toHaveCount(0);
  expect(syncBody).toMatchObject({ records: [{ clientRecordId: "00000000-0000-4000-8000-000000000009" }] });
});

test("an active session restores and exits shared immersive chrome", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("studyroom-focus-session-v2", JSON.stringify({
      version: 2,
      clientRecordId: "00000000-0000-4000-8000-000000000010",
      plannedMinutes: 25,
      startedAt: Date.now(),
      elapsedBeforeSegmentMs: 0,
      state: "paused",
      sceneCode: "forest",
      timeKey: "night",
      syncPolicy: "manual-only"
    }));
    localStorage.setItem("studyroom-focus-immersive", "1");
  });

  await page.goto("/focus");
  await expect(page.getByRole("button", { name: "退出沉浸模式" })).toBeVisible();
  await page.getByRole("button", { name: "退出沉浸模式" }).click();
  await expect(page.getByRole("button", { name: /继续专注/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("studyroom-focus-immersive"))).toBeNull();
});

test("a failed cloud sync stays local and retries after connectivity returns", async ({ page }) => {
  const startedAt = Date.now() - 60_000;
  await page.addInitScript(({ startedAt }) => {
    localStorage.setItem("studyroom-focus-records-v2", JSON.stringify([{
      clientRecordId: "00000000-0000-4000-8000-000000000011",
      startedAt,
      finishedAt: startedAt + 60_000,
      plannedMinutes: 1,
      completedMinutes: 1,
      completedSeconds: 60,
      sceneCode: "forest",
      timeKey: "dusk",
      status: "completed",
      syncStatus: "pending",
      syncPolicy: "automatic",
      accountScope: "7"
    }]));
  }, { startedAt });
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, data: { id: 7, username: "tester", role: "USER" } })
  }));
  let attempts = 0;
  await page.route("**/api/focus/sync", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, message: "offline" }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { results: [{
        clientRecordId: "00000000-0000-4000-8000-000000000011", status: "duplicate", cloudRecordId: 11
      }] } })
    });
  });

  await page.goto("/focus");
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("studyroom-focus-records-v2") || "[]")[0]?.syncStatus)).toBe("failed");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("studyroom-focus-records-v2") || "[]")[0]?.syncStatus)).toBe("synced");
  expect(attempts).toBe(2);
});

test("focus audio controls use the shared sound core", async ({ page }) => {
  await page.goto("/focus");
  await page.getByRole("button", { name: "打开音乐" }).click();
  await expect(page.locator("audio")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "在声音页管理音乐" })).toBeVisible();
  await page.getByRole("button", { name: "在声音页管理音乐" }).click();
  await expect(page).toHaveURL(/\/sound$/);
});

test("profile no longer exposes custom scene management", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { id: 2, username: "tester", nickname: "测试用户", role: "USER" } }) });
  });
  await page.goto("/profile");

  await expect(page.getByRole("button", { name: /自定义场景/ })).toHaveCount(0);
  await expect(page.getByText("上传自己的七段时间光影。", { exact: true })).toHaveCount(0);
});

test("profile exposes an honest desktop update status without a web download link", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { id: 2, username: "tester", nickname: "测试用户", role: "USER" } }) });
  });
  await page.goto("/profile");
  await page.getByRole("button", { name: /客户端版本/ }).click();
  await expect(page.getByRole("heading", { name: "客户端版本" })).toBeVisible();
  await expect(page.getByText("客户端更新仅在 Windows 桌面版中可用。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "下载更新" })).toHaveCount(0);
});
