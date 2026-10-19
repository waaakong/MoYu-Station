import { expect, test, type Page } from "@playwright/test";

const ok = (data: unknown) => JSON.stringify({ success: true, code: "OK", message: "ok", data });

async function routeAuth(page: Page, onLogin?: (body: Record<string, unknown>, headers: Record<string, string>) => void) {
  await page.route("**/api/monitor/heartbeat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: ok(null) }));
  await page.route("**/api/auth/**", async (route) => {
    const url = route.request().url();
    if (url.endsWith("/api/auth/csrf")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: ok({ token: "test-csrf-token" }) });
      return;
    }
    if (url.endsWith("/api/auth/login")) {
      onLogin?.(route.request().postDataJSON(), route.request().headers());
      await route.fulfill({ status: 200, contentType: "application/json", body: ok({ id: 2, username: "member", nickname: "Member", userType: "NORMAL", passwordChangeRequired: false }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: ok(null) });
  });
}

async function fillRegistration(page: Page) {
  await page.getByLabel("邀请码").fill("private-invitation");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码", { exact: true }).fill("long-password");
  await page.getByLabel("确认密码").fill("long-password");
}

for (const path of ["/login", "/register"]) {
  test(`${path} username pattern works with Chromium Unicode sets`, async ({ page }) => {
    await routeAuth(page);
    await page.goto(path);
    const validity = await page.getByLabel("用户名").evaluate((element) => {
      const input = element as HTMLInputElement;
      const pattern = new RegExp(`^(?:${input.pattern})$`, "v");
      return ["valid_name-2", "bad!", "a", "a".repeat(33)].map((value) => {
        input.value = value;
        return { regex: pattern.test(value), valid: !input.validity.patternMismatch };
      });
    });
    expect(validity).toEqual([
      { regex: true, valid: true },
      { regex: false, valid: false },
      { regex: false, valid: false },
      { regex: false, valid: false }
    ]);
  });
}

test("web login hides remember-me and submits a non-persistent session", async ({ page }) => {
  let loginBody: Record<string, unknown> = {};
  let loginHeaders: Record<string, string> = {};
  await routeAuth(page, (body, headers) => { loginBody = body; loginHeaders = headers; });
  await page.goto("/login");

  await expect(page.getByRole("switch", { name: /保持登录/ })).toHaveCount(0);
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码", { exact: true }).fill("long-password");
  await page.getByRole("button", { name: "进入墨屿" }).click();

  await expect(page).toHaveURL(/\/scene$/);
  expect(loginBody).toMatchObject({ username: "member", password: "long-password", rememberMe: false });
  expect(loginHeaders["x-csrf-token"]).toBe("test-csrf-token");
  expect(await page.evaluate(() => localStorage.getItem("studyroom:autoLogin"))).toBeNull();
});

test("login supports keyboard order, password visibility and caps-lock feedback", async ({ page }) => {
  await routeAuth(page);
  await page.goto("/login");
  await page.getByLabel("用户名").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("密码", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "显示密码" }).click();
  await expect(page.getByLabel("密码", { exact: true })).toHaveAttribute("type", "text");
  await page.getByLabel("密码", { exact: true }).focus();
  await page.getByLabel("密码", { exact: true }).evaluate((input) => {
    const event = new KeyboardEvent("keyup", { key: "A", bubbles: true });
    Object.defineProperty(event, "getModifierState", { value: (key: string) => key === "CapsLock" });
    input.dispatchEvent(event);
  });
  await expect(page.getByText("大写锁定已开启")).toBeVisible();
});

test("desktop login exposes remember-me and sends the explicit choice", async ({ page }) => {
  await page.addInitScript(() => {
    const updateStatus = { state: "disabled", currentVersion: "0.1.0", channel: "stable", progress: 0, canRetry: false, message: "disabled" };
    Object.defineProperty(window, "studyRoomDesktop", { value: {
      getCapabilities: async () => ({ platform: "electron", localLibrary: true, persistentQueue: true, secureCredentials: true, mediaKeys: true, systemTray: true, autoUpdate: true, localFocusDatabase: true, publicRadio: true, providerLogin: true, providerPlayback: true }),
      readQueue: async () => [], replaceQueue: async () => undefined,
      readSoundSettings: async () => undefined, listSoundSnapshots: async () => [],
      onMediaCommand: () => () => undefined, onSourceSwitch: () => () => undefined,
      onUpdateStatus: () => () => undefined, setUpdaterAuthState: async () => updateStatus,
      setUpdaterActivityState: async () => updateStatus
    } });
  });
  let loginBody: Record<string, unknown> = {};
  await routeAuth(page, (body) => { loginBody = body; });
  await page.goto("/#/login");

  const remember = page.getByRole("switch", { name: /保持登录/ });
  await expect(remember).toBeVisible();
  await remember.click();
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码", { exact: true }).fill("long-password");
  await page.getByRole("button", { name: "进入墨屿" }).click();

  await expect(page).toHaveURL(/#\/scene$/);
  expect(loginBody).toMatchObject({ rememberMe: true });
});

test("a forced password change opens the profile security flow", async ({ page }) => {
  await page.route("**/api/monitor/heartbeat", (route) => route.fulfill({ status: 200, contentType: "application/json", body: ok(null) }));
  await page.route("**/api/auth/**", async (route) => {
    const data = route.request().url().endsWith("/api/auth/csrf")
      ? { token: "test-csrf-token" }
      : { id: 2, username: "legacy-admin", nickname: "Admin", userType: "ADMIN", passwordChangeRequired: true };
    await route.fulfill({ status: 200, contentType: "application/json", body: ok(data) });
  });
  await page.route("**/api/profile/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: ok({}) }));
  await page.goto("/login");
  await page.getByLabel("用户名").fill("legacy-admin");
  await page.getByLabel("密码", { exact: true }).fill("legacy-password");
  await page.getByRole("button", { name: "进入墨屿" }).click();

  await expect(page).toHaveURL(/\/profile\?module=security/);
  await expect(page.getByRole("heading", { name: "修改密码" })).toBeVisible();
});

test("invitation is required before registration can reach the server", async ({ page }) => {
  let registrationCalls = 0;
  await page.route("**/api/auth/**", async (route) => {
    if (route.request().url().endsWith("/api/auth/csrf")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: ok({ token: "test-csrf-token" }) });
      return;
    }
    if (route.request().url().endsWith("/api/auth/register")) registrationCalls += 1;
    await route.fulfill({ status: 200, contentType: "application/json", body: ok(null) });
  });
  await page.goto("/register");
  await page.getByLabel("用户名").fill("member");
  await page.getByLabel("密码", { exact: true }).fill("long-password");
  await page.getByLabel("确认密码").fill("long-password");
  await page.getByRole("button", { name: "创建墨屿账号" }).click();

  await expect(page.locator("#register-invitation-error")).toHaveText("请输入邀请码。");
  await expect(page.getByLabel("邀请码")).toBeFocused();
  expect(registrationCalls).toBe(0);
});

test("rate limits expose a countdown without replaying the registration write", async ({ page }) => {
  let registrationCalls = 0;
  await page.route("**/api/auth/**", async (route) => {
    if (route.request().url().endsWith("/api/auth/csrf")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: ok({ token: "test-csrf-token" }) });
      return;
    }
    registrationCalls += 1;
    await route.fulfill({
      status: 429,
      headers: { "Retry-After": "37" },
      contentType: "application/json",
      body: JSON.stringify({ success: false, code: "AUTH_RATE_LIMITED", message: "尝试次数过多，请稍后再试。", data: null })
    });
  });
  await page.goto("/register");
  await fillRegistration(page);
  await page.getByRole("button", { name: "创建墨屿账号" }).click();

  await expect(page.getByRole("alert")).toContainText("37 秒后可重试");
  expect(registrationCalls).toBe(1);
});

test("CSRF bootstrap failures use the same rate-limit error without sending the write", async ({ page }) => {
  let registrationCalls = 0;
  await page.route("**/api/auth/**", async (route) => {
    if (route.request().url().endsWith("/api/auth/csrf")) {
      await route.fulfill({
        status: 429,
        headers: { "Retry-After": "19" },
        contentType: "application/json",
        body: JSON.stringify({ success: false, code: "AUTH_RATE_LIMITED", message: "安全会话请求过于频繁。", data: null })
      });
      return;
    }
    registrationCalls += 1;
    await route.fulfill({ status: 500, contentType: "application/json", body: ok(null) });
  });
  await page.goto("/register");
  await fillRegistration(page);
  await page.getByRole("button", { name: "创建墨屿账号" }).click();

  await expect(page.getByRole("alert")).toContainText("安全会话请求过于频繁");
  await expect(page.getByRole("alert")).toContainText("19 秒后可重试");
  expect(registrationCalls).toBe(0);
});

test("an invalid CSRF token is reported without replaying the business write", async ({ page }) => {
  let registrationCalls = 0;
  await page.route("**/api/auth/**", async (route) => {
    if (route.request().url().endsWith("/api/auth/csrf")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: ok({ token: "stale-token" }) });
      return;
    }
    registrationCalls += 1;
    await route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ success: false, code: "AUTH_CSRF_INVALID", message: "请求验证已失效，请刷新后重试。", data: null })
    });
  });
  await page.goto("/register");
  await fillRegistration(page);
  await page.getByRole("button", { name: "创建墨屿账号" }).click();

  await expect(page.getByRole("alert")).toContainText("请求验证已失效");
  expect(registrationCalls).toBe(1);
});

for (const scenario of [
  ["INVITATION_EXPIRED", "邀请码已过期"],
  ["INVITATION_EXHAUSTED", "邀请码使用次数已耗尽"],
  ["AUTH_USERNAME_TAKEN", "用户名已被使用"]
] as const) {
  test(`${scenario[0]} is bound to the actionable field`, async ({ page }) => {
    await page.route("**/api/auth/**", async (route) => {
      if (route.request().url().endsWith("/api/auth/csrf")) {
        await route.fulfill({ status: 200, contentType: "application/json", body: ok({ token: "test-csrf-token" }) });
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({ success: false, code: scenario[0], message: scenario[1], data: null })
      });
    });
    await page.goto("/register");
    await fillRegistration(page);
    await page.getByRole("button", { name: "创建墨屿账号" }).click();

    const field = scenario[0] === "AUTH_USERNAME_TAKEN" ? page.getByLabel("用户名") : page.getByLabel("邀请码");
    await expect(field).toBeFocused();
    await expect(page.getByText(scenario[1]).first()).toBeVisible();
  });
}

test("banned page keeps local tools available", async ({ page }) => {
  await page.goto("/banned");
  await expect(page.getByText("本机场景、声音、专注计时和娱乐工具仍可继续使用")).toBeVisible();
  for (const name of ["场景", "声音", "专注", "娱乐"]) {
    await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  }
});

test("a banned account can enter local routes but not cloud routes", async ({ page }) => {
  await page.route("**/api/auth/csrf", (route) => route.fulfill({ status: 200, contentType: "application/json", body: ok({ token: "test-csrf-token" }) }));
  await page.route("**/api/monitor/heartbeat", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ success: false, code: "AUTH_ACCOUNT_BANNED", message: "账号已封禁", data: null }) }));
  await page.route("**/api/auth/me", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: ok({ id: 3, username: "restricted", nickname: "Restricted", userType: "BANNED", passwordChangeRequired: false })
  }));
  await page.goto("/scene");
  await expect(page).toHaveURL(/\/scene$/);
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/banned$/);
});
