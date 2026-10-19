import {test,expect,type Page} from '@playwright/test';
const ok=(data:unknown)=>({success:true,code:'OK',data});
const user={id:'2104509220480131074',username:'fixture',nickname:'隔离测试',userType:'ADMIN'};
const logs=new WeakMap<Page,{errors:string[];console:string[]}>();
test.beforeEach(async({page})=>{const entry={errors:[] as string[],console:[] as string[]};logs.set(page,entry);page.on('pageerror',e=>entry.errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))entry.console.push(m.text());});});
test.afterEach(async({page},info)=>{
  const entry=logs.get(page)!;await info.attach('runtime-health',{body:JSON.stringify(entry,null,2),contentType:'application/json'});
  expect(entry.errors).toEqual([]);expect(entry.console.filter(line=>!line.includes('net::ERR_FAILED'))).toEqual([]);
  expect(await page.title()).toBeTruthy();expect(await page.locator('main').first().innerText()).not.toBe('');await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});
async function base(page:Page){
  await page.addInitScript(()=>{class Socket extends EventTarget{static OPEN=1;readyState=0;constructor(){super();queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}send(){}close(){this.readyState=3;}}Object.defineProperty(window,'WebSocket',{value:Socket});});
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;let data:any=[];
    if(path.endsWith('/admin/dashboard/stream'))return route.fulfill({contentType:'text/event-stream',body:': isolated stream fixture\n\n'});
    if(path.endsWith('/auth/me') || path.endsWith('/profile/me'))data=user;
    else if(path.endsWith('/auth/csrf'))data={token:'isolated-token'};
    else if(path.endsWith('/operations/capabilities'))data={reliableCreate:true};
    else if(path.endsWith('/admin/audits'))data={items:[],total:0,page:1,size:30};
    else if(path.includes('/admin/pages/'))data={items:[],nextCursor:null,versionedWrites:true};
    await route.fulfill({json:ok(data)});
  });
}
for(const [width,height] of [[1440,900],[1280,720],[1080,640],[390,844]])test(`feedback unknown result and explicit recovery ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height});await base(page);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let calls=0,id='';
  await page.route('**/api/profile/feedback',async route=>{calls++;id=route.request().postDataJSON().clientRequestId;await route.abort('failed');});
  await page.route('**/api/operations/FEEDBACK/*',route=>route.fulfill({json:ok({status:'committed',requestId:id,targetId:'2104509220480131075'})}));
  await page.goto('/profile?module=feedback');expect(await page.title()).toBeTruthy();
  await page.getByLabel('反馈标题').fill('保留原始反馈');await page.getByLabel('详细内容').fill('网络断开后核对同一任务');await page.getByRole('button',{name:'提交反馈',exact:true}).click();
  await expect(page.getByRole('button',{name:'核对并重试',exact:true})).toBeEnabled();await expect(page.getByLabel('反馈标题')).toHaveAttribute('readonly','');
  await page.getByRole('button',{name:'核对并重试',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath(`feedback-unknown-${width}.png`),animations:'disabled'});
  await page.getByRole('button',{name:'核对并重试',exact:true}).click();await expect(page.getByText('反馈已提交。',{exact:true})).toBeVisible();await expect(page.getByLabel('反馈标题')).toHaveValue('');expect(calls).toBe(1);expect(errors).toEqual([]);expect(await page.locator('vite-error-overlay').count()).toBe(0);
});
test('invitation unknown result keeps original draft and never invents another code',async({page},info)=>{
  await base(page);let count=0,id='';const record={id:'9',label:'小范围测试',status:'ACTIVE',maxUses:1,usedCount:0,codeHint:'abcd'};
  await page.route('**/api/admin/invitations',async route=>{if(route.request().method()==='POST'){count++;id=route.request().postDataJSON().clientRequestId;return route.abort('failed');}return route.fulfill({json:ok(count?[record]:[])});});
  await page.route('**/api/admin/invitations/page',route=>route.fulfill({json:ok({items:[],nextCursor:null,versionedWrites:true})}));
  await page.route('**/api/admin/invitations/9',route=>route.fulfill({json:ok({...record,adminVersion:'0'})}));
  await page.route('**/api/operations/INVITATION/*',route=>route.fulfill({json:ok({status:'committed',requestId:id,targetId:'9'})}));
  await page.goto('/admin');await page.getByRole('navigation',{name:'管理模块'}).getByRole('button',{name:/邀请码/}).click();
  await page.getByLabel('用途',{exact:true}).fill(record.label);await page.getByRole('button',{name:'创建邀请码',exact:true}).click();
  await expect(page.getByRole('button',{name:'核对并重试',exact:true})).toBeEnabled();await expect(page.getByLabel('用途',{exact:true})).toHaveValue(record.label);
  await page.getByRole('button',{name:'核对并重试',exact:true}).click();await expect(page.getByText(/已核对：原请求创建成功/)).toBeVisible();await expect(page.getByLabel('用途',{exact:true})).toHaveValue('');expect(count).toBe(1);
  await page.screenshot({path:info.outputPath('invitation-recovered.png'),animations:'disabled'});
});
test('comment lost response recovers exactly one visible row',async({page})=>{
  await base(page);let calls=0,id='';const comment={id:'21',postId:'11',authorId:user.id,authorName:user.nickname,content:'只发送一次'};
  await page.route('**/api/feed/capabilities',route=>route.fulfill({json:ok({dualFeed:true})}));
  await page.route('**/api/feed/posts?*',route=>route.fulfill({json:ok({items:[{id:'11',authorId:'3',authorName:'朋友',content:'测试动态',commentCount:0,likeCount:0,imageUrls:[]}],nextCursor:null,followingIds:[],relationshipVersion:0})}));
  await page.route('**/api/feed/posts/11/comments',async route=>{if(route.request().method()==='POST'){calls++;id=route.request().postDataJSON().clientRequestId;return route.abort('failed');}return route.fulfill({json:ok(calls?[comment]:[])});});
  await page.route('**/api/operations/COMMENT/*',route=>route.fulfill({json:ok({status:'committed',requestId:id,targetId:'21'})}));
  await page.goto('/feed');await page.getByRole('button',{name:'评论 · 0',exact:true}).click();await page.getByLabel('评论内容',{exact:true}).fill(comment.content);await page.getByRole('button',{name:'发送',exact:true}).click();
  await page.getByRole('button',{name:'核对并重试',exact:true}).click();await expect(page.locator('.comment-row')).toHaveCount(1);await expect(page.getByLabel('评论内容',{exact:true})).toHaveValue('');expect(calls).toBe(1);
});
