import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const data = url.endsWith("/api/auth/csrf")
      ? { token: "e2e-csrf-token" }
      : url.endsWith("/api/auth/me")
      ? null
      : url.endsWith("/api/auth/login")
        ? { id: 2, username: "tester", nickname: "Tester", userType: "NORMAL", passwordChangeRequired: false }
        : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data })
    });
  });
});

test("shared shell keeps navigation and player mounted in local mode", async ({ page }) => {
  await page.goto("/scene");

  await expect(page.getByRole("navigation", { name: "主要功能" })).toBeVisible();
  await expect(page.getByRole("link", { name: "场景", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("contentinfo", { name: "播放器" })).toContainText("还没有播放内容");
  await expect(page.locator(".app-rail")).toHaveCount(0);
  const playerBox = await page.getByRole("contentinfo", { name: "播放器" }).boundingBox();
  expect(playerBox?.width).toBeGreaterThan(500);
  const scenePanelBox = await page.locator(".panel-stack").boundingBox();
  expect(Boolean(playerBox && scenePanelBox && playerBox.x < scenePanelBox.x + scenePanelBox.width && playerBox.x + playerBox.width > scenePanelBox.x && playerBox.y < scenePanelBox.y + scenePanelBox.height && playerBox.y + playerBox.height > scenePanelBox.y)).toBe(false);

  await page.getByRole("link", { name: "专注", exact: true }).click();
  await expect(page).toHaveURL(/\/focus$/);
  await expect(page.getByRole("link", { name: "专注", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("contentinfo", { name: "播放器" })).toBeHidden();
});

test("desktop startup prompts for a newer release and opens only the fixed download page", async ({ page }) => {
  const downloadUrl = "https://moyustation.xyz/download";
  await page.addInitScript((url) => {
    const status = {
      state: "manual-update-available", currentVersion: "0.2.0-trial.20261010.2",
      availableVersion: "0.2.0-trial.20261015.1", channel: "stable",
      message: "发现新版本", canRetry: true, downloadPageUrl: url
    };
    Object.defineProperty(window, "studyRoomDesktop", { value: {
      getCapabilities: async () => ({ platform: "electron", localLibrary: true, persistentQueue: true, secureCredentials: true, mediaKeys: true, systemTray: true, autoUpdate: false, localFocusDatabase: true, publicRadio: true, providerLogin: true, providerPlayback: true }),
      readQueue: async () => [], replaceQueue: async () => undefined, recordPlaybackEvent: async () => undefined,
      onMediaCommand: () => () => undefined, onSourceSwitch: () => () => undefined, onDesktopLifecycle: () => () => undefined,
      readSoundSettings: async () => undefined, listSoundSnapshots: async () => [],
      onUpdateStatus: () => () => undefined, setUpdaterAuthState: async () => status,
      openExternal: async (value) => { (window as any).__openedUrl = value; }
    }});
  }, downloadUrl);
  await page.route("**/api/**", route => route.fulfill({ json: { success: true, data: null } }));
  await page.goto("/#/scene");
  const prompt = page.getByRole("dialog", { name: "发现新版本" });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText("0.2.0-trial.20261015.1");
  await expect(prompt).toContainText("不会自动下载或安装");
  await prompt.getByRole("button", { name: "前往下载页" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__openedUrl)).toBe(downloadUrl);
  await expect(prompt).toBeHidden();
});

test("sound page degrades honestly on the web", async ({ page }) => {
  await page.goto("/sound");
  await expect(page.getByRole("heading", { name: "声音", exact: true })).toBeVisible();
  await expect(page.getByText("文件只在当前页面会话中播放，不上传服务器，也不保存路径。")).toBeVisible();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "选择音频" }).first().click();
  await (await chooser).setFiles({ name: "quiet-room.mp3", mimeType: "audio/mpeg", buffer: Buffer.from("ID3") });
  await expect(page.getByRole("button", { name: "播放 quiet-room", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "导入音乐文件夹" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("studyroom-web-queue-v2") || "")).not.toContain("blob:");
});

test("appearance drawer closes with Escape and restores focus", async ({ page }) => {
  await page.goto("/scene");
  const trigger = page.getByRole("button", { name: "外观与性能" });
  await trigger.click();

  await expect(page.getByRole("dialog", { name: "外观与性能" })).toBeVisible();
  await expect(page.locator(".drawer-layer")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.getByRole("checkbox", { name: /减少透明度/ }).check();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("studyroom-shell-preferences-v2") || "{}").reducedTransparency)).toBe(true);
  await page.keyboard.press("Escape");

  await expect(page.getByRole("dialog", { name: "外观与性能" })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("floating player expands, closes with Escape and keeps its trigger", async ({ page }) => {
  await page.goto("/scene");
  const trigger = page.getByRole("button", { name: "展开播放器" });
  await trigger.click();
  await expect(page.getByRole("slider", { name: "播放进度" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("slider", { name: "播放进度" })).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("floating player restores and manages a persistent queue", async ({ page }) => {
  await page.addInitScript(() => {
    const queue = ["White Noise", "Pink Noise"].map((title, index) => ({
      id: `queue-${index + 1}`,
      queuedAt: index + 1,
      track: {
        id: `builtin-${index + 1}`,
        title,
        artist: "StudyRoom",
        source: { kind: "builtin", assetId: "/src/assets/audio/ambient/rain.ogg" }
      }
    }));
    localStorage.setItem("studyroom-web-queue-v2", JSON.stringify(queue));
    localStorage.setItem("studyroom-playback-settings-v2", JSON.stringify({ currentItemId: "queue-1", volume: .8 }));
  });
  await page.goto("/scene");

  await expect(page.getByRole("contentinfo", { name: "播放器" })).toContainText("White Noise");
  await page.getByRole("button", { name: "展开播放器" }).click();
  await expect(page.getByRole("list", { name: "播放队列" }).getByRole("listitem")).toHaveCount(2);
  const shuffle = page.getByRole("button", { name: "随机" });
  await shuffle.click();
  await expect(shuffle).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "循环模式：顺序" }).click();
  await expect(page.getByRole("button", { name: "循环模式：列表循环" })).toBeVisible();
  await page.getByRole("slider", { name: "音乐音量", exact: true }).fill("0.35");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("studyroom-playback-settings-v2") || "{}").volume)).toBe(.35);
  await page.getByRole("button", { name: "从队列移除 Pink Noise" }).click();
  await expect(page.getByText("播放队列 · 1")).toBeVisible();
  await page.getByRole("button", { name: "清空" }).click();
  await expect(page.getByText("还没有播放队列，请在声音页选择音乐或歌单。")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("studyroom-web-queue-v2") || "[]"))).toEqual([]);
});

test("sound library virtualizes fifty thousand local tracks", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "studyRoomDesktop", {
      value: {
        getCapabilities: async () => ({ platform: "electron", localLibrary: true, persistentQueue: true, secureCredentials: true, mediaKeys: true, systemTray: true, autoUpdate: true, localFocusDatabase: true, publicRadio: true, providerLogin: true, providerPlayback: true }),
        readQueue: async () => [],
        replaceQueue: async () => undefined,
        recordPlaybackEvent: async () => undefined,
        listMissingTracks: async () => [],
        listRecentTracks: async () => [],
        listLibraryRoots: async () => [],
        listTracks: async () => Array.from({ length: 50_000 }, (_, index) => ({
          id: `track-${index + 1}`,
          title: `Track ${index + 1}`,
          artist: "Local Artist",
          source: { kind: "local", fileToken: "00000000-0000-4000-8000-000000000000" }
        })),
        onMediaCommand: () => () => undefined,
        onSourceSwitch: () => () => undefined,
        onDesktopLifecycle: () => () => undefined,
        readSoundSettings: async () => undefined,
        listSoundSnapshots: async () => [],
        saveSoundSettings: async () => undefined,
        setUpdaterActivityState: async () => ({ state: 'disabled' }),
        setUpdaterAuthState: async () => ({ state: 'disabled' }),
        onUpdateStatus: () => () => undefined
      }
    });
  });
  await page.goto("/#/sound");

  await expect(page.getByText("50,000")).toBeVisible();
  const library = page.getByRole("list", { name: "本地曲库" });
  await expect(library).toBeVisible();
  expect(await library.getByRole("listitem").count()).toBeLessThan(40);
  await library.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const lastTrack = page.getByRole("button", { name: "播放 Track 50000", exact: true });
  await expect(lastTrack).toBeVisible();
  expect(await library.getByRole("listitem").count()).toBeLessThan(40);
  await lastTrack.click();
  await expect(page.getByRole("contentinfo", { name: "播放器" })).toContainText("Track 50000");
});

test("cloud-only routes preserve the requested destination", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)chat/);
  expect(await page.evaluate(() => sessionStorage.getItem("studyroom-post-login-target"))).toBe("/chat");

  await page.getByLabel("用户名").fill("tester");
  await page.getByLabel("密码", { exact: true }).fill("password");
  await page.getByRole("button", { name: "进入墨屿" }).click();
  await expect(page).toHaveURL(/\/chat$/, { timeout: 3000 });
});

test("administrator entry is only visible after role confirmation", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { id: 1, username: "admin", nickname: "Admin", userType: "ADMIN", passwordChangeRequired: false } })
    });
  });
  await page.goto("/scene");
  await page.getByRole('button', { name: '账号菜单' }).click();
  await expect(page.getByRole("link", { name: "管理" })).toBeVisible();
});

for (const viewport of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 }
]) {
  test(`shell has no document overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/scene");
    const dimensions = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      width: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      height: document.documentElement.clientHeight
    }));
    expect(dimensions.scrollWidth).toBe(dimensions.width);
    expect(dimensions.scrollHeight).toBe(dimensions.height);
  });
}
