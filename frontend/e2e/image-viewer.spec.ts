import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

async function setup(page: Page) {
  await page.routeWebSocket("**/*", socket => socket.close());
  let failImage = true;
  const images = await Promise.all([[2000, 1000], [600, 3000], [40, 20]].map(([width, height]) =>
    sharp({ create: { width, height, channels: 4, background: { r: 116, g: 143, b: 101, alpha: .8 } } }).png().toBuffer()));
  await page.route("**/viewer-fixture-*.png", route => {
    const id = Number(route.request().url().match(/fixture-(\d)/)?.[1]);
    return id === 3 && failImage
      ? route.fulfill({ status: 503, body: "unavailable" })
      : route.fulfill({ contentType: "image/png", body: images[id === 3 ? 0 : id] });
  });
  await page.route("**/api/**", route => {
    const url = route.request().url();
    let data: unknown = {};
    if (url.includes("/auth/csrf")) data = { token: "local-test-token" };
    else if (url.includes("/auth/me")) data = { id: 2, username: "localtester", nickname: "测试用户", role: "USER", userType: "NORMAL" };
    else if (url.includes("/feed/posts")) data = [{ id: 11, authorId: 3, authorName: "测试作者", content: "查看器回归样本", imageUrls: [0, 1, 2, 3].map(id => `/viewer-fixture-${id}.png`), likeCount: 0, commentCount: 0 }];
    else if (url.includes("/feed/notifications")) data = [];
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto("/feed");
  await expect(page.getByText("查看器回归样本")).toBeVisible();
  await page.locator(".media-tile").first().click();
  await expect(page.getByRole("dialog", { name: "图片预览" })).toBeVisible();
  await expect(page.getByRole("button", { name: "实际大小", exact: true })).toBeEnabled();
  return { recover: () => { failImage = false; } };
}

test("actual pixels, bounded zoom, non-wrapping navigation and long image top", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await setup(page);
  await expect(page.getByRole("button", { name: "上一张" })).toBeDisabled();
  await page.getByRole("button", { name: "实际大小", exact: true }).click();
  await expect(page.locator(".viewer-scale")).toHaveText("100%");
  expect((await page.locator(".viewer-stage img").boundingBox())!.width).toBeCloseTo(2000, 1);
  for (let count = 0; count < 7; count++) await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.locator(".viewer-scale")).toHaveText("400%");
  await expect(page.getByRole("button", { name: "放大", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "下一张" }).click();
  await page.getByRole("button", { name: "适应宽度" }).click();
  const stage = (await page.locator(".viewer-stage").boundingBox())!;
  const image = (await page.locator(".viewer-stage img").boundingBox())!;
  expect(image.width).toBeCloseTo(stage.width, 1);
  expect(image.y).toBeCloseTo(stage.y, 1);
  await page.getByRole("button", { name: "下一张" }).click();
  await expect(page.locator(".viewer-scale")).toHaveText("100%");
  expect((await page.locator(".viewer-stage img").boundingBox())!.width).toBe(40);
  await page.getByRole("button", { name: "下一张" }).click();
  await expect(page.locator(".viewer-state")).toContainText("图片加载失败");
  await expect(page.getByRole("button", { name: "下一张" })).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".viewer-header")).toContainText("4 / 4");
  expect(errors).toEqual([]);
});

test("load failure can retry, focus stays modal and returns to trigger without scroll", async ({ page }) => {
  const { recover } = await setup(page);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await expect(page.getByRole("button", { name: "关闭图片浏览" })).toBeFocused();
  for (let count = 0; count < 16; count++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  }
  expect(await page.getByRole('dialog', { name: '图片预览' }).evaluate(element => element.matches(":modal"))).toBe(true);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: "重试加载" })).toBeVisible();
  recover();
  await page.getByRole("button", { name: "重试加载" }).click();
  await expect(page.getByRole("button", { name: "实际大小", exact: true })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "图片预览" })).toHaveCount(0);
  await expect(page.locator(".media-tile").first()).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
});

for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }, { width: 1080, height: 640 }, { width: 390, height: 844 }]) {
  test(`viewer controls fit ${size.width}x${size.height}, resize preserves fit`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await setup(page);
    for (const button of await page.locator("dialog button:visible").all()) {
      const box = (await button.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(size.width);
      expect(box.y + box.height).toBeLessThanOrEqual(size.height);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    if (process.env.VIEWER_QA_DIR) await page.screenshot({ path: `${process.env.VIEWER_QA_DIR}/viewer-${size.width}x${size.height}.png` });
    await page.setViewportSize({ width: 760, height: 540 });
    await expect.poll(async () => {
      const image = (await page.locator(".viewer-stage img").boundingBox())!;
      const stage = (await page.locator(".viewer-stage").boundingBox())!;
      return image.width <= stage.width + 1 && image.height <= stage.height + 1;
    }).toBe(true);
  });
}

test("real touch pinch scales image and pan remains bounded", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await setup(page);
  const initial = Number((await page.locator(".viewer-scale").innerText()).replace("%", ""));
  const cdp = await context.newCDPSession(page);
  const point = (x: number, id: number) => ({ x, y: 300, id, radiusX: 2, radiusY: 2 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(160, 1), point(220, 2)] });
  for (let step = 1; step <= 6; step++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(160 - step * 10, 1), point(220 + step * 10, 2)] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  expect(Number((await page.locator(".viewer-scale").innerText()).replace("%", ""))).toBeGreaterThan(initial * 2);
  await page.getByRole("button", { name: "实际大小", exact: true }).click();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(100, 1)] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(380, 1)] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const image = (await page.locator(".viewer-stage img").boundingBox())!;
  const stage = (await page.locator(".viewer-stage").boundingBox())!;
  expect(image.x).toBeLessThanOrEqual(stage.x);
  expect(image.x + image.width).toBeGreaterThanOrEqual(stage.x + stage.width);
  await expect(page.locator(".viewer-header")).toContainText("1 / 4");
  await page.getByRole("button", { name: "适应窗口", exact: true }).click();
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(300, 1)] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point(100, 1)] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(page.locator(".viewer-header")).toContainText("2 / 4");
  await context.close();
});

test("wheel anchor and double-click use the same pixel scale", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "实际大小", exact: true }).click();
  const before = (await page.locator(".viewer-stage img").boundingBox())!;
  const stage = (await page.locator(".viewer-stage").boundingBox())!;
  const pointer = { x: stage.x + stage.width / 2 + 70, y: stage.y + stage.height / 2 + 30 };
  const pixelX = pointer.x - before.x, pixelY = pointer.y - before.y;
  await page.mouse.move(pointer.x, pointer.y);
  await page.mouse.wheel(0, -100);
  await expect(page.locator(".viewer-scale")).toHaveText("115%");
  const after = (await page.locator(".viewer-stage img").boundingBox())!;
  expect((pointer.x - after.x) / 1.15).toBeCloseTo(pixelX, 1);
  expect((pointer.y - after.y) / 1.15).toBeCloseTo(pixelY, 1);
  await page.locator(".viewer-stage").dblclick();
  await expect(page.getByRole("button", { name: "缩小", exact: true })).toBeDisabled();
  await page.locator(".viewer-stage").dblclick();
  await expect(page.locator(".viewer-scale")).toHaveText("100%");
});

test("chat uses the same viewer and restores its image trigger", async ({ page }) => {
  await setup(page);
  await page.getByRole("button", { name: "关闭图片浏览" }).click();
  await page.route("**/api/chat/**", route => {
    const data = route.request().url().includes("/hall/messages")
      ? [{ id: 7, senderName: "本地测试", content: "", mediaUrl: "/viewer-fixture-0.png", messageType: "IMAGE", mine: false }]
      : [];
    return route.fulfill({ json: { success: true, data } });
  });
  await page.goto("/chat");
  const trigger = page.locator("button").filter({ has: page.locator('img[src*="viewer-fixture-0"]') }).first();
  await trigger.click();
  await page.getByRole("button", { name: "实际大小", exact: true }).click();
  await expect(page.locator(".viewer-scale")).toHaveText("100%");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});
