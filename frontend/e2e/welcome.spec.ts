import { expect, test } from "@playwright/test";

test("welcome page exposes local space as the primary action", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: null })
    });
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/墨屿自习室 · MoYu Station/);
  await expect(page.getByRole("button", { name: /进入本地空间/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "登录" })).toBeVisible();
});
