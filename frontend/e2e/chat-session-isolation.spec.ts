import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__sent = [];
    class Socket extends EventTarget {
      static OPEN = 1; readyState = 0;
      constructor() { super(); (window as any).__socket = this; queueMicrotask(() => { this.readyState = 1; this.dispatchEvent(new Event("open")); }); }
      send(value: string) { (window as any).__sent.push(JSON.parse(value)); }
      close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
    }
    Object.defineProperty(window, "WebSocket", { value: Socket });
  });
  await page.route("**/api/**", async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path.endsWith("/auth/me")) data = { id: 2, username: "tester", nickname: "测试员", userType: "NORMAL" };
    if (path.endsWith("/auth/csrf")) data = { token: "isolated-csrf" };
    if (path.endsWith('/chat/capabilities')) data = { reliableText: true, bidirectionalHistory: true, boundedRead: true };
    if (path.endsWith('/chat/conversations')) data = { items: [{ conversationId: 9, userId: 5, nickname: '离线旧联系人', onlineStatus: 'OFFLINE', preview: '昨天的消息', unreadCount: 0 }], nextCursor: null };
    if (path.endsWith("/online-users")) data = [{ id: 3, nickname: "成员 A" }, { id: 4, nickname: "成员 B" }];
    if (/\/private\/[34]\/messages$/.test(path) && route.request().method() === "GET") {
      data = [{ id: path.includes("/3/") ? 30 : 40, senderName: "成员", content: path.includes("/3/") ? "A 的历史" : "B 的历史", messageType: "TEXT" }];
    }
    await route.fulfill({ json: { success: true, data } });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/chat");
});

test("private drafts remain scoped to the recipient", async ({ page }) => {
  await page.getByRole("button", { name: /成员 A/ }).click();
  await page.getByPlaceholder("发送私信...").fill("只给 A 的草稿");
  await page.getByRole("button", { name: /成员 B/ }).click();
  await expect(page.getByPlaceholder("发送私信...")).toHaveValue("");
  await page.getByPlaceholder("发送私信...").fill("只给 B 的草稿");
  await page.getByRole("button", { name: /成员 A/ }).click();
  await expect(page.getByPlaceholder("发送私信...")).toHaveValue("只给 A 的草稿");
  await page.getByRole("button", { name: /成员 B/ }).click();
  await expect(page.getByPlaceholder("发送私信...")).toHaveValue("只给 B 的草稿");
});

test("private images stay gated while plaintext remains usable", async ({ page }) => {
  await page.getByRole("button", { name: /成员 A/ }).click();
  await expect(page.locator('.dm-panel').getByRole('button', { name: '添加图片' })).toBeDisabled();
  await page.getByPlaceholder('发送私信...').fill('本地文字验收');
  await page.locator('.dm-panel').getByRole('button', { name: '发送', exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__sent.filter((frame: any) => frame.type === 'PRIVATE_MESSAGE_SEND'))).toEqual([
    { type: 'PRIVATE_MESSAGE_SEND', payload: { receiverId: 3, messageType: 'TEXT', content: '本地文字验收', clientMessageId: expect.any(String) } }
  ]);
});

test("deleting A history while switching to B does not clear B history", async ({ page }) => {
  let release!: () => void; let started!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const deleting = new Promise<void>(resolve => { started = resolve; });
  await page.route("**/api/chat/private/3/messages", async route => {
    if (route.request().method() !== "DELETE") return route.fallback();
    started(); await gate; await route.fulfill({ json: { success: true, data: null } });
  });
  try {
    await page.getByRole("button", { name: /成员 A/ }).click();
    await expect(page.getByText("A 的历史")).toBeVisible();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "删除记录" }).click();
    await deleting;
    await page.getByRole("button", { name: /成员 B/ }).click();
    await expect(page.getByText("B 的历史")).toBeVisible();
    release();
    await expect(page.getByText("聊天记录已删除")).toBeVisible();
    await expect(page.getByText("B 的历史")).toBeVisible();
  } finally { release(); }
});

test('timeout and explicit retry keep the original recipient and merge ACK plus push once', async ({ page }, info) => {
  await page.clock.install();
  await page.getByRole('button', { name: /成员 A/ }).click();
  await page.getByPlaceholder('发送私信...').fill('冻结 A 的消息');
  await page.locator('.dm-panel').getByRole('button', { name: '发送', exact: true }).click();
  await expect(page.getByText('发送中', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /成员 B/ }).click();
  await expect(page.getByText('冻结 A 的消息', { exact: true })).toHaveCount(0);
  await page.clock.fastForward(12001);
  await page.getByRole('button', { name: /成员 A/ }).click();
  await expect(page.getByText('结果未确认，请勿重新输入发送')).toBeVisible();
  await page.clock.runFor(250);
  await page.screenshot({ path: info.outputPath('chat-unconfirmed.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '重试原消息' }).click();
  const frames = await page.evaluate(() => (window as any).__sent.filter((f: any) => f.type === 'PRIVATE_MESSAGE_SEND'));
  expect(frames).toHaveLength(2); expect(frames[1]).toEqual(frames[0]);
  await page.evaluate(frame => {
    const payload = { id: 88, senderId: 2, receiverId: 3, channelType: 'PRIVATE', mine: true, senderName: '我', ...frame.payload };
    for (const type of ['MESSAGE_ACK', 'PRIVATE_MESSAGE_RECEIVE', 'MESSAGE_ACK']) {
      (window as any).__socket.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ type, payload }) }));
    }
  }, frames[0]);
  await expect(page.locator('.dm-panel .bubble').getByText('冻结 A 的消息', { exact: true })).toHaveCount(1);
  await expect(page.getByText('已发送', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '重试原消息' })).toHaveCount(0);
});

test('text draft and outbox survive route changes but a refresh does not restore memory outbox', async ({ page }) => {
  await page.getByPlaceholder('在大厅说点什么...').fill('待确认大厅消息');
  await page.locator('.hall-panel').getByRole('button', { name: '发送', exact: true }).click();
  await page.getByPlaceholder('在大厅说点什么...').fill('保留文字草稿');
  await page.getByRole('link', { name: '动态', exact: true }).click();
  await page.getByRole('link', { name: '聊天', exact: true }).click();
  await expect(page.getByPlaceholder('在大厅说点什么...')).toHaveValue('保留文字草稿');
  await expect(page.getByText('待确认大厅消息', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByPlaceholder('在大厅说点什么...')).toHaveValue('');
  await expect(page.getByText('待确认大厅消息', { exact: true })).toHaveCount(0);
});

test('offline conversations and mobile two-level navigation use one active composer', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  for (const viewport of [{ width:1440,height:900 },{ width:1280,height:720 },{ width:1080,height:640 },{ width:390,height:844 }]) {
    await page.setViewportSize(viewport);
    if (viewport.width < 800) { await page.getByRole('button', { name:'返回会话' }).click(); await expect(page.locator('.active-conversation')).not.toBeVisible(); }
    await page.getByRole('button', { name:/离线旧联系人/ }).click();
    await expect(page.getByPlaceholder('发送私信...')).toBeVisible();
    await expect(page.getByPlaceholder('在大厅说点什么...')).toHaveCount(0);
    if (viewport.width < 800) {
      await expect(page.getByRole('complementary', { name:'会话列表' })).not.toBeVisible();
      await page.getByRole('button', { name:'返回会话' }).click();
      await expect(page.getByRole('complementary', { name:'会话列表' })).toBeVisible();
      await page.getByRole('button', { name:/大厅公共频道/ }).click();
      await expect(page.getByPlaceholder('在大厅说点什么...')).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path:info.outputPath(`conversation-${viewport.width}.png`),animations:'disabled' });
  }
  expect(errors).toEqual([]);
});

test('older history keeps its visible anchor and route navigation restores it', async ({ page }) => {
  await page.route('**/api/chat/private/3/messages*', async route => {
    const before=new URL(route.request().url()).searchParams.get('beforeId');
    const data=Array.from({length:80},(_,index)=>({id:index+1+(before?0:80),senderName:'成员 A',messageType:'TEXT',content:`历史-${index+1+(before?0:80)}`,mine:false}));
    await route.fulfill({json:{success:true,data}});
  });
  await page.getByRole('button',{name:/成员 A/}).click();
  const list=page.locator('.private-messages');
  await expect(list.locator('[data-message-id]')).toHaveCount(80);
  await list.evaluate(el=>{el.scrollTop=0;});
  const first=list.locator('[data-message-id="81"]'); const before=(await first.boundingBox())!.y;
  await page.getByRole('button',{name:'加载更早消息'}).click();
  await expect(list.locator('[data-message-id]')).toHaveCount(160);
  await expect.poll(async()=>Math.abs((await first.boundingBox())!.y-before)).toBeLessThan(5);
  await page.getByRole('link',{name:'动态',exact:true}).click();
  await page.getByRole('link',{name:'聊天',exact:true}).click();
  await expect(first).toBeVisible();
  await expect.poll(async()=>Math.abs((await first.boundingBox())!.y-before)).toBeLessThan(5);
});

test('bounded read waits for focus and never uses an ACK or a hidden conversation', async ({ page }) => {
  const reads:any[]=[];
  await page.evaluate(()=>Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>false}));
  await page.route('**/api/chat/private/*/read',async route=>{reads.push({path:new URL(route.request().url()).pathname,...route.request().postDataJSON()});await route.fulfill({json:{success:true,data:null}});});
  await page.getByRole('button',{name:/成员 A/}).click();
  await expect(page.getByText('A 的历史')).toBeVisible();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(reads).toHaveLength(0);
  await page.evaluate(()=>{Object.defineProperty(document,'hasFocus',{configurable:true,value:()=>true});window.dispatchEvent(new Event('focus'));});
  await expect.poll(()=>reads.length).toBe(1);expect(reads[0]).toEqual({path:'/api/chat/private/3/read',throughId:'30'});
  await page.evaluate(()=>{(window as any).__socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'MESSAGE_ACK',payload:{id:91,senderId:2,receiverId:4,channelType:'PRIVATE',mine:true,content:'ACK'}})}));});
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  expect(reads).toHaveLength(1);
});

test('emoji replaces the current selection, preserves focus and offers four explicit categories',async({page},info)=>{
  const input=page.getByPlaceholder('在大厅说点什么...');await input.fill('前面中间后面');
  await input.evaluate((el:HTMLTextAreaElement)=>{el.focus();el.setSelectionRange(2,4);});
  await page.getByRole('button',{name:'表情',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'表情面板'});await expect(dialog).toBeVisible();
  for(const name of ['最近','Emoji','内置','我的收藏'])await expect(dialog.getByRole('button',{name,exact:true})).toBeVisible();
  await dialog.getByRole('button',{name:'插入 😊',exact:true}).click();await expect(input).toHaveValue('前面😊后面');await expect(input).toBeFocused();
  await page.getByRole('button',{name:'表情',exact:true}).click();await dialog.getByRole('button',{name:'最近',exact:true}).click();await expect(dialog.getByRole('button',{name:'插入 😊',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('emoji-panel.png'),animations:'disabled'});await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
