import { expect, test, type Page } from "@playwright/test";

const ok = (data: unknown) => JSON.stringify({ success: true, code: "OK", message: "ok", data });

async function auth(page: Page, user: unknown) {
  await page.route("**/api/auth/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: ok(user) }));
}

test("unauthenticated profile reads no protected cloud profile endpoint", async ({ page }) => {
  let protectedCalls = 0;
  await auth(page, null);
  await page.route("**/api/profile/**", (route) => { protectedCalls += 1; return route.fulfill({ status: 401, body: "" }); });
  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "本机空间" })).toBeVisible();
  await expect(page.getByText("网页版无法读取桌面数据")).toBeVisible();
  expect(protectedCalls).toBe(0);
});

test("authenticated profile keeps healthy modules when statistics fail", async ({ page }) => {
  await auth(page, { id: 2, username: "member", nickname: "Member", userType: "NORMAL", passwordChangeRequired: false });
  await page.route("**/api/profile/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/stats")) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, code: "STATS_UNAVAILABLE", message: "统计暂时不可用", data: null }) });
    if (url.endsWith("/me")) return route.fulfill({ status: 200, contentType: "application/json", body: ok({ id: 2, username: "member", nickname: "Member", userType: "NORMAL", passwordChangeRequired: false }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: ok(url.endsWith("/share-card") ? {} : []) });
  });
  await page.goto("/profile?module=stats");
  await expect(page.getByRole("heading", { name: "学习统计" })).toBeVisible();
  await expect(page.getByText("统计暂时不可用")).toBeVisible();
  await page.getByRole("button", { name: /云端账号/ }).click();
  await expect(page.getByText("SR-00000002")).toBeVisible();
});

test("banned account retains the local profile space", async ({ page }) => {
  await auth(page, { id: 3, username: "restricted", nickname: "Restricted", userType: "BANNED", passwordChangeRequired: false });
  await page.goto("/profile");
  await page.getByRole("button", { name: /本机空间/ }).click();
  await expect(page.getByRole("heading", { name: "本机空间" })).toBeVisible();
});

test("administrator profile exposes management without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await auth(page, { id: 1, username: "owner", nickname: "Owner", userType: "ADMIN", passwordChangeRequired: false });
  await page.route("**/api/profile/**", async (route) => {
    const data = route.request().url().endsWith("/me")
      ? { id: 1, username: "owner", nickname: "Owner", userType: "ADMIN", passwordChangeRequired: false }
      : route.request().url().endsWith("/share-card") ? {} : [];
    await route.fulfill({ status: 200, contentType: "application/json", body: ok(data) });
  });
  await page.goto("/profile");
  await page.getByRole('button', { name: '账号菜单' }).click();
  await expect(page.getByRole("link", { name: "管理", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();
});
