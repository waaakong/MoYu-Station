import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { width: 1280, height: 720, scaleLabel: "150pct-equivalent" },
  { width: 1920, height: 1080, scaleLabel: "100pct" }
] as const;
const surfaces = [
  { path: "/", key: "welcome", heading: /给今天留一间/ },
  { path: "/login", key: "login", heading: "登录" },
  { path: "/register", key: "register", heading: "注册" },
  { path: "/profile", key: "profile", heading: "云端账号" },
  { path: "/admin", key: "admin", heading: "运行概览" }
] as const;

async function prepare(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("studyroom-shell-preferences-v2", JSON.stringify({ compact: false, reducedMotion: true, reducedTransparency: false, lowPerformance: false }));
    Object.defineProperty(window, "EventSource", { value: undefined, configurable: true });
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const account = { id: 1, username: "admin", nickname: "墨屿管理员", userType: "ADMIN", onlineStatus: "IDLE", passwordChangeRequired: false, createdAt: "2026-09-12" };
    let data: unknown = null;
    if (path.endsWith("/auth/me") || path.endsWith("/profile/me")) data = account;
    else if (path.endsWith("/auth/csrf")) data = { token: "identity-visual-token" };
    else if (path.endsWith("/profile/stats")) data = { todayFocusMinutes: 45, streakDays: 3, totalFocusHours: 12 };
    else if (path.endsWith("/profile/posts") || path.endsWith("/profile/calendar")) data = [];
    else if (path.endsWith("/profile/share-card")) data = { title: "本周专注", focusMinutes: 180 };
    else if (path.endsWith("/admin/dashboard")) data = { onlineUsers: 2, todayPosts: 1, pendingFeedback: 1, systemStatus: "STABLE", sampledAt: "2026-09-17T00:00:00Z", cpuUsage: 21, jvmMemoryUsage: 38, systemMemoryUsage: 54, diskUsage: 29, diskFreeSpace: "28 GB", diskTotalSpace: "40 GB", activeThreads: 18, peakThreads: 26, dbActiveConnections: 2, dbTotalConnections: 10, dbThreadsAwaitingConnection: 0, dbStatus: "STABLE", redisStatus: "UNAVAILABLE", sections: { system: { status: "AVAILABLE" }, database: { status: "AVAILABLE" }, redis: { status: "UNAVAILABLE", errorCode: "REDIS_METRICS_UNAVAILABLE" }, http: { status: "AVAILABLE" } } };
    else if (path.endsWith("/admin/pages/users")) data = {items:[{ id:'2',adminVersion:'0', username:'member',nickname:'圈内成员',userType:'NORMAL',onlineStatus:'IDLE',todayFocusMinutes:20}],nextCursor:null,versionedWrites:true};
    else if (path.endsWith("/capabilities")) data = {};
    else data = [];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, code: "OK", data }) });
  });
}

for (const viewport of viewports) {
  for (const surface of surfaces) {
    test(`${surface.key} identity visual baseline ${viewport.width}x${viewport.height} ${viewport.scaleLabel}`, async ({ page }, testInfo) => {
      await prepare(page);
      await page.setViewportSize(viewport);
      await page.goto(surface.path);
      await expect(page.getByRole("heading", { name: surface.heading }).first()).toBeVisible();
      if (surface.key === "profile") await expect(page.locator(".profile-topbar")).toBeHidden();
      if (surface.key === "admin") await expect(page.locator(".admin-topbar")).toBeHidden();
      await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}" });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
      expect(overflow).toBe(false);
      const filename = `phase11-${surface.key}-${viewport.width}x${viewport.height}-${viewport.scaleLabel}.png`;
      await page.screenshot({ path: testInfo.outputPath(filename), animations: "disabled" });
      await expect(page).toHaveScreenshot(filename, { animations: "disabled" });
    });
  }
}
