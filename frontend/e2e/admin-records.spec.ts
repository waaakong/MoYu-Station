import {test,expect,type Page} from '@playwright/test';
const ok=(data:unknown)=>({success:true,code:'OK',data});
async function fixture(page:Page){
  await page.routeWebSocket('**/ws/chat', socket => { socket.onMessage(() => {}); });
  const calls:any[]=[],queries:string[]=[];let feedback={id:'2104509220480131074',author:'隔离成员',title:'播放建议',content:'这是隔离接口数据，不会修改真实反馈。',status:'PENDING',adminVersion:'0',createdAt:'2026-09-29 10:00'};
  const user=(id:string,type='NORMAL')=>({id,username:'member-'+id,nickname:type==='MUTED'?'服务端筛选结果':'成员 '+id,userType:type,adminVersion:'0',todayFocusMinutes:20});
  const logs:string[]=[];page.on('pageerror',e=>logs.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))logs.push(m.text());});
  await page.route('**/api/**',async route=>{const url=new URL(route.request().url()),path=url.pathname;let data:any=[];
    if(path.endsWith('/admin/dashboard/stream'))return route.fulfill({contentType:'text/event-stream',body:': isolated fixture\n\n'});
    if(path.endsWith('/auth/me')||path.endsWith('/profile/me'))data={id:'1',username:'fixture-admin',userType:'ADMIN'};
    else if(path.endsWith('/auth/csrf'))data={token:'fixture-token'};
    else if(path.endsWith('/admin/pages/users')){queries.push(url.search);const role=url.searchParams.get('role');data={items:role==='MUTED'?[user('99','MUTED')]:url.searchParams.has('cursor')?[user('3'),user('4')]:[user('2'),user('3')],nextCursor:role==='MUTED'||url.searchParams.has('cursor')?null:'cGFnZQ',versionedWrites:true};}
    else if(path.endsWith('/admin/pages/feedback'))data={items:[feedback],nextCursor:null,versionedWrites:true};
    else if(path.endsWith('/admin/pages/posts'))data={items:[],nextCursor:null,versionedWrites:false};
    else if(path.endsWith(`/admin/feedback/${feedback.id}/status`)){
      const body=route.request().postDataJSON();calls.push(body);
      if(calls.length===1){feedback={...feedback,status:'PROCESSING',adminVersion:'1'};return route.fulfill({json:{success:false,code:'ADMIN_VERSION_CONFLICT',message:'记录已变化'}});}
      feedback={...feedback,status:body.status,adminVersion:'2'};data=null;
    }
    await route.fulfill({json:ok(data)});
  });return {calls,queries,logs};
}
for(const [width,height] of [[1440,900],[1280,720],[1080,640],[390,844]])test(`admin records conflict pagination ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:'reduce'});const f=await fixture(page);await page.goto('/admin');const nav=page.getByRole('navigation',{name:'管理模块'});
  await nav.getByRole('button',{name:/^用户/}).click();await expect(page.locator('.admin-list article')).toHaveCount(2);await page.getByRole('button',{name:'加载更多记录'}).click();await expect(page.locator('.admin-list article')).toHaveCount(3);
  await page.getByRole('group',{name:'筛选用户角色'}).getByRole('button',{name:'禁言',exact:true}).click();await expect(page.locator('.admin-list strong')).toHaveText(['服务端筛选结果']);expect(f.queries.some(q=>q.includes('role=MUTED'))).toBe(true);
  await nav.getByRole('button',{name:/^反馈/}).click();let select=page.getByRole('combobox',{name:'播放建议 的状态'});await select.click();await page.getByRole('option',{name:'已解决',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('原操作');await expect(select).toContainText('待处理');expect(f.calls).toHaveLength(1);await page.getByRole('alert').scrollIntoViewIfNeeded();
  await page.screenshot({path:info.outputPath(`records-conflict-${width}.png`),animations:'disabled'});
  await page.getByRole('button',{name:'刷新',exact:true}).click();await expect(select).toContainText('处理中');await select.click();await page.getByRole('option',{name:'已解决',exact:true}).click();await expect(page.getByText('操作已保存。',{exact:true})).toBeVisible();await expect(select).toContainText('已解决');expect(f.calls.map(c=>c.expectedVersion)).toEqual(['0','1']);expect(f.calls.map(c=>c.status)).toEqual(['RESOLVED','RESOLVED']);
  expect(f.logs).toEqual([]);expect(await page.title()).toBeTruthy();await expect(page.locator('vite-error-overlay')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
