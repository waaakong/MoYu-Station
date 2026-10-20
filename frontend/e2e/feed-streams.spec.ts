import { test,expect } from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.addInitScript(()=>{
    (window as any).__sockets=[];
    class Socket extends EventTarget{static OPEN=1;readyState=0;constructor(){super();(window as any).__sockets.push(this);queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}send(){}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}}
    Object.defineProperty(window,'WebSocket',{value:Socket});
  });
  let following=false,version=0;
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;let data:any=[];
    if(path.endsWith('/auth/me'))data={id:2,username:'tester',nickname:'测试员',userType:'NORMAL'};
    else if(path.endsWith('/auth/csrf'))data={token:'local-csrf'};
    else if(path.endsWith('/feed/capabilities'))data={dualFeed:true};
    else if(path.endsWith('/feed/posts')){
      const isFollowing=url.searchParams.get('stream')==='following';
      data={items:Array.from({length:isFollowing?following?8:0:30},(_,i)=>({id:30-i,authorId:3,authorName:'山间来信',content:`${i+1} 今日片刻`,sceneName:'森林',createdAt:'2026-09-22',likeCount:0,commentCount:0,imageUrls:[]})),nextCursor:isFollowing?null:'next-page',relationshipVersion:version,followingIds:following?[3]:[]};
    }else if(path.endsWith('/feed/follows/3')){following=route.request().method()==='PUT';version++;data={userId:3,following,version};}
    await route.fulfill({json:{success:true,data}});
  });
  await page.setViewportSize({width:1440,height:900});await page.goto('/feed');
});

test('stream tabs share glass material and keep sticky switching accessible',async({page},info)=>{
  const tabs=page.getByRole('navigation',{name:'动态信息流'});
  await expect(page.locator('.post-card')).toHaveCount(30);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await page.locator('.feed-list').evaluate(node=>node.scrollTop=0);
    const material=await tabs.evaluate(node=>{const s=getComputedStyle(node);return {fill:s.backgroundColor,blur:s.backdropFilter,radius:parseFloat(s.borderRadius)};});
    expect(material.fill).toMatch(/^rgba\(/);expect(material.fill).not.toBe('rgb(41, 44, 43)');
    expect(material.blur).toContain('blur(');expect(material.radius).toBeGreaterThan(0);
    await tabs.getByRole('button',{name:'关注',exact:true}).focus();await page.keyboard.press('Enter');
    await expect(tabs.getByRole('button',{name:'关注',exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(tabs.locator('.sr-glass-control')).toHaveCount(1);
    await tabs.getByRole('button',{name:'广场',exact:true}).click();
    await expect(page.locator('.post-card')).toHaveCount(30);
    await page.locator('.feed-list').evaluate(node=>node.scrollTop=640);
    await expect(tabs.getByRole('button',{name:'广场',exact:true})).toBeVisible();
    const listTop=await page.locator('.feed-list').evaluate(node=>node.getBoundingClientRect().top);
    expect((await tabs.boundingBox())!.y).toBeGreaterThanOrEqual(listTop);
    expect(await tabs.evaluate(node=>{const r=node.getBoundingClientRect();return document.elementFromPoint(r.left+30,r.top+25)?.closest('.stream-tabs')===node;})).toBe(true);
    await page.locator('.feed-list').evaluate(node=>node.scrollTop=0);
    await page.screenshot({path:info.outputPath(`feed-glass-${viewport.width}.png`),animations:'disabled'});
  }
  await page.evaluate(()=>document.documentElement.classList.add('sr-reduced-transparency'));
  expect(await tabs.evaluate(node=>getComputedStyle(node).backdropFilter)).toBe('none');
  expect(await tabs.evaluate(node=>getComputedStyle(node).backgroundColor)).toBe('rgb(41, 44, 43)');
  await expect(tabs.getByRole('button',{name:'广场',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>document.documentElement.classList.remove('sr-reduced-transparency'));
  expect(errors).toEqual([]);
});

test('modal draft survives closing and navigation; following is separate and restores square anchor',async({page},info)=>{
  await expect(page.locator('.post-card')).toHaveCount(30);
  await page.getByRole('button',{name:'写动态',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'发布动态'});
  await dialog.locator('textarea').fill('只保留在当前账号会话');
  await dialog.getByRole('button',{name:'表情',exact:true}).click();
  const emojis=page.getByRole('dialog',{name:'表情面板'});
  await expect(emojis.getByRole('button',{name:'我的收藏',exact:true})).toHaveCount(0);
  await emojis.getByRole('button',{name:'插入 📚',exact:true}).click();
  await emojis.getByRole('button',{name:'关闭',exact:true}).click();
  await expect(emojis).not.toBeVisible();
  await expect(dialog.locator('textarea')).toHaveValue('只保留在当前账号会话📚');
  await dialog.locator('textarea').fill('只保留在当前账号会话');
  await expect(dialog.getByRole('button',{name:'@ 好友'})).toHaveCount(0);
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button',{name:'写动态',exact:true})).toBeFocused();
  await page.locator('.app-nav').getByRole('link',{name:'聊天',exact:true}).click();
  await page.locator('.app-nav').getByRole('link',{name:'动态',exact:true}).click();
  await page.getByRole('button',{name:'写动态',exact:true}).click();await expect(dialog.locator('textarea')).toHaveValue('只保留在当前账号会话');await page.keyboard.press('Escape');
  await page.locator('.post-card').first().getByRole('button',{name:'关注',exact:true}).click();
  await expect(page.locator('.post-card').first().getByRole('button',{name:'已关注',exact:true})).toBeVisible();
  await page.locator('.feed-list').evaluate(node=>node.scrollTop=920);await page.waitForTimeout(120);
  const before=await page.locator('.feed-list').evaluate(node=>node.scrollTop);
  await page.locator('.stream-tabs').getByRole('button',{name:'关注',exact:true}).click();await expect(page.locator('.post-card')).toHaveCount(8);
  await page.locator('.stream-tabs').getByRole('button',{name:'广场',exact:true}).click();
  await expect.poll(()=>page.locator('.feed-list').evaluate(node=>node.scrollTop)).toBeCloseTo(before,0);
  await page.screenshot({path:info.outputPath('feed-anchor-desktop.png'),animations:'disabled'});
});

test('each entry requests a new first page and a failed refresh retains cached rows',async({page})=>{
  await expect(page.locator('.post-card')).toHaveCount(30);
  let entries=0;
  await page.route('**/api/feed/posts?*',async route=>{
    entries++;
    await route.fulfill({status:503,json:{success:false,code:'FEED_UNAVAILABLE',message:'测试：列表暂时不可用'}});
  });
  await page.locator('.app-nav').getByRole('link',{name:'聊天',exact:true}).click();
  await expect(page.locator('.chat-page')).toBeVisible();
  await page.locator('.app-nav').getByRole('link',{name:'动态',exact:true}).click();
  await expect.poll(()=>entries).toBe(1);
  await expect(page.locator('.post-card')).toHaveCount(30);
  await expect(page.getByRole('alert')).toContainText('测试：列表暂时不可用');
});

test('new content does not jump reading position and four viewports keep editor usable',async({page},info)=>{
  await expect(page.locator('.post-card')).toHaveCount(30);
  await page.locator('.feed-list').evaluate(node=>node.scrollTop=700);await page.waitForTimeout(100);
  await page.evaluate(()=>{for(const socket of (window as any).__sockets)socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type:'MEDIA_PUBLICATION_COMMITTED',payload:{kind:'POST'}})}));});
  await expect(page.locator('.new-content')).toHaveCount(1);expect(await page.locator('.feed-list').evaluate(node=>node.scrollTop)).toBeGreaterThan(650);
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.locator('.feed-list').evaluate(node=>node.scrollTop=0);
    await page.getByRole('button',{name:'写动态',exact:true}).click();const dialog=page.getByRole('dialog',{name:'发布动态'});
    await expect(dialog).toBeVisible();await dialog.locator('textarea').fill('四档验收');await dialog.getByRole('button',{name:'发布',exact:true}).scrollIntoViewIfNeeded();
    await expect(dialog).not.toHaveAttribute('data-sr-motion', /.+/);
    const box=await dialog.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.width).toBeLessThanOrEqual(viewport.width);expect(box!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({path:info.outputPath(`feed-editor-${viewport.width}.png`),animations:'disabled'});
    await dialog.getByRole('button',{name:'表情',exact:true}).click();
    const picker=page.getByRole('dialog',{name:'表情面板'}); await expect(picker).toBeVisible();
    await expect(picker).not.toHaveAttribute('data-sr-motion', /.+/);
    const pickerBox=await picker.boundingBox(); expect(pickerBox!.x).toBeGreaterThanOrEqual(0);expect(pickerBox!.y).toBeGreaterThanOrEqual(0);expect(pickerBox!.x+pickerBox!.width).toBeLessThanOrEqual(viewport.width);expect(pickerBox!.y+pickerBox!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({path:info.outputPath(`feed-emoji-${viewport.width}.png`),animations:'disabled'});
    await page.keyboard.press('Escape');await expect(picker).not.toBeVisible();await expect(dialog.getByRole('button',{name:'表情',exact:true})).toBeFocused();
    await page.keyboard.press('Escape');
  }
});

test('unknown text submission queries same ID without another publish and keeps content locked',async({page})=>{
  let count=0,requestId='';
  await page.route('**/api/feed/posts',async route=>{if(route.request().method()!=='POST')return route.fallback();count++;requestId=route.request().postData()!.match(/name="clientRequestId"\r\n\r\n([^\r]+)/)![1]!;await route.abort('failed');});
  await page.route('**/api/feed/publications/*',async route=>{expect(route.request().url()).toContain(requestId);await route.fulfill({json:{success:true,data:{status:'committed',targetId:999}}});});
  await page.getByRole('button',{name:'写动态',exact:true}).click();const dialog=page.getByRole('dialog',{name:'发布动态'});
  await dialog.locator('textarea').fill('原任务');await dialog.getByRole('button',{name:'发布',exact:true}).click();
  await expect(dialog.locator('textarea')).toBeDisabled();await expect(dialog.getByRole('button',{name:'查询并重试原任务'})).toBeEnabled();
  await dialog.getByRole('button',{name:'查询并重试原任务'}).click();await expect(dialog).not.toBeVisible();expect(count).toBe(1);
  await page.getByRole('button',{name:'写动态',exact:true}).click();await expect(dialog.locator('textarea')).toHaveValue('');
});

test('delete completion removes frozen target even after cancelling its modal',async({page})=>{
  await page.route('**/api/feed/posts?*',async route=>route.fulfill({json:{success:true,data:{items:[11,12].map(id=>({id,authorId:2,authorName:'测试员',content:`我的 ${id}`,imageUrls:[]})),nextCursor:null,relationshipVersion:0,followingIds:[]}}}));
  await page.getByRole('button',{name:'刷新',exact:true}).click();await expect(page.locator('.post-card')).toHaveCount(2);
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/feed/posts/11',async route=>{await gate;await route.fulfill({json:{success:true,data:null}});});
  try{await page.locator('[data-post-id="11"]').getByRole('button',{name:'删除',exact:true}).click();
    await page.getByRole('dialog',{name:'删除动态',exact:true}).getByRole('button',{name:'确认删除'}).click();await page.keyboard.press('Escape');
    release();await expect(page.locator('[data-post-id="11"]')).toHaveCount(0);await expect(page.locator('[data-post-id="12"]')).toBeVisible();
  }finally{release();}
});
