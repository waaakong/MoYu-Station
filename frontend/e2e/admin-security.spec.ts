import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "EventSource", { value: undefined, configurable: true }); });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/auth/me")) return route.fulfill({ json: { success: true, data: { id: 1, username: "admin", nickname: "管理员", userType: "ADMIN", passwordChangeRequired: false } } });
    if (path.endsWith("/auth/csrf")) return route.fulfill({ json: { success: true, data: { token: "csrf-test-token" } } });
    if (path.endsWith("/admin/dashboard")) return route.fulfill({ json: { success: true, data: { onlineUsers: 2, todayPosts: 1, pendingFeedback: 1, systemStatus: "STABLE", sampledAt: "2026-09-17T00:00:00Z", sections: { system: { status: "AVAILABLE" }, database: { status: "UNAVAILABLE", errorCode: "DATABASE_METRICS_UNAVAILABLE" }, redis: { status: "UNAVAILABLE", errorCode: "REDIS_METRICS_UNAVAILABLE" }, http: { status: "AVAILABLE" } } } } });
    if (path.endsWith("/admin/pages/users")) return route.fulfill({ json: { success: true, data: {items:[{ id: '2',adminVersion:'0', username: "member", nickname: "成员", userType: "NORMAL", onlineStatus: "IDLE", todayFocusMinutes: 20 }],nextCursor:null,versionedWrites:true} } });
    if (path.includes("/admin/users/2/type")) return route.fulfill({ json: { success: false, code: "ADMIN_REVERIFY_REQUIRED", message: "需要重新验证" } });
    if (path.endsWith("/admin/reverify")) return route.fulfill({ json: { success: true, data: { expiresAt: Date.now() + 60_000 } } });
    if (path.endsWith("/capabilities")) return route.fulfill({ json: { success: true, data: {} } });
    return route.fulfill({ json: { success: true, data: [] } });
  });
});

test("metrics expose unavailable dependencies without healthy zero values", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "运行概览" })).toBeVisible();
  await expect(page.getByText("当前无法读取该分区（DATABASE_METRICS_UNAVAILABLE）")).toBeVisible();
  await expect(page.getByText("当前无法读取该分区（REDIS_METRICS_UNAVAILABLE）")).toBeVisible();
});

test("cancelled reverification does not replay a role write", async ({ page }) => {
  let writes = 0;
  await page.route("**/api/admin/users/2/type", async (route) => { writes += 1; await route.fulfill({ json: { success: false, code: "ADMIN_REVERIFY_REQUIRED", message: "需要重新验证" } }); });
  await page.goto("/admin");
  await page.getByRole("button", { name: /^用户/ }).click();
  await page.getByRole("combobox", { name: "member 的角色" }).click();
  await page.getByRole("option", { name: "禁言", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "member 的角色" })).toContainText("普通用户");
  await expect(page.getByRole("heading", { name: "确认管理员身份" })).toBeVisible();
  await page.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("heading", { name: "确认管理员身份" })).toBeHidden();
  expect(writes).toBe(1);
});

test('admin confirmation covers the full window and Escape never confirms', async ({page})=>{
  await page.setViewportSize({width:1280,height:720});
  await page.route('**/api/admin/pages/feedback',r=>r.fulfill({json:{success:true,data:{items:[{id:'2',author:'隔离成员',title:'隔离反馈',content:'不执行真实删除',status:'PENDING',adminVersion:'0'}],nextCursor:null,versionedWrites:true}}}));
  let deletes=0;page.on('request',r=>{if(r.method()==='DELETE')deletes++;});
  await page.goto('/admin');await page.getByRole('navigation',{name:'管理模块'}).getByRole('button',{name:/^反馈/}).click();
  await page.getByRole('button',{name:'删除',exact:true}).click();
  const dialog=page.getByRole('alertdialog',{name:'删除反馈'});
  await expect(dialog).toBeVisible();expect(await dialog.boundingBox()).toEqual({x:0,y:0,width:1280,height:720});
  expect(await dialog.evaluate(el=>el.matches(':modal')&&el.parentElement===document.body)).toBe(true);
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();expect(deletes).toBe(0);
});
