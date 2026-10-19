import { expect, test, type Page, type Route } from "@playwright/test";

const ok = (data: unknown) => JSON.stringify({ success: true, data });

async function installRealtimeStub(page: Page) {
  await page.addInitScript(() => {
    class LocalSocket extends EventTarget {
      static OPEN = 1;
      readyState = 0;
      constructor() {
        super();
        queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); });
      }
      send() {}
      close() { this.readyState = 3; this.dispatchEvent(new CloseEvent("close")); }
    }
    Object.defineProperty(window, "WebSocket", { configurable: true, value: LocalSocket });
  });
}

async function routeCloudApis(page: Page, override?: (route: Route) => Promise<boolean>) {
  await page.route("**/api/**", async (route) => {
    if (override && await override(route)) return;
    const url = route.request().url();
    let data: unknown = {};
    if (url.endsWith("/api/auth/csrf")) data = { token: "e2e-csrf-token" };
    else if (url.endsWith("/api/auth/me")) data = { id: 2, username: "tester", nickname: "Tester", role: "USER", userType: "NORMAL" };
    else if (url.includes("/api/chat/online-users")) data = [{ id: 3, username: "peer", nickname: "Peer", onlineStatus: "IDLE" }];
    else if (url.includes("/api/chat/private/unread")) data = [];
    else if (url.includes("/api/chat/hall/messages")) data = [{ id: 7, senderName: "Peer", content: "真实大厅消息", messageType: "TEXT", mine: false }];
    else if (url.includes("/api/feed/posts")) data = [{ id: 11, authorId: 3, authorName: "Peer", content: "#真实话题 今天读完一章", sceneName: "图书馆", imageUrls: [], likeCount: 0, commentCount: 0 }];
    else if (url.includes("/api/feed/notifications")) data = [];
    await route.fulfill({ status: 200, contentType: "application/json", body: ok(data) });
  });
}

test.beforeEach(async ({ page }) => {
  await installRealtimeStub(page);
  await routeCloudApis(page);
});

test("feed renders actual text and only built-in composer themes", async ({ page }) => {
  await page.goto("/feed");
  await expect(page.getByText("#真实话题 今天读完一章", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /自定义/ })).toHaveCount(0);
  await expect(page.getByText("木子点赞了你的学习报告。")).toHaveCount(0);
  await page.locator('.activity-notices summary').click();
  await expect(page.getByText("暂无互动通知")).toBeVisible();
  await page.getByRole('button',{name:'写动态',exact:true}).click();
  await expect(page.getByRole('region',{name:'动态背景主题'})).toBeVisible();
});

test("feed reports API failure instead of rendering demo content", async ({ page }) => {
  await page.unroute("**/api/**");
  await routeCloudApis(page, async (route) => {
    if (route.request().url().includes("/api/feed/posts")) {
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ success: false, code: "UPSTREAM_DOWN", message: "动态服务不可用" }) });
      return true;
    }
    return false;
  });
  await page.goto("/feed");
  await expect(page.getByText("动态服务不可用")).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" }).first()).toBeVisible();
});

test("chat loads its cursor baseline with one active conversation and narrow back navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/chat");
  await expect(page.getByText("真实大厅消息")).toBeVisible();
  await expect(page.getByRole('complementary',{name:'会话列表'})).toBeVisible();
  await expect(page.locator('.active-conversation')).toHaveCount(1);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('complementary',{name:'会话列表'})).toBeVisible();
  await page.getByRole('button',{name:/大厅公共频道/}).click();
  await expect(page.getByRole('button',{name:'返回会话'})).toBeVisible();
  await expect(page.getByRole('complementary',{name:'会话列表'})).toBeHidden();
  await page.getByRole('button',{name:'返回会话'}).click();
  await expect(page.getByRole('complementary',{name:'会话列表'})).toBeVisible();
});
