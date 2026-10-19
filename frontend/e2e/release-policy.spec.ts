import {test,expect,type Page} from '@playwright/test';
const ok=(data:unknown)=>({success:true,code:'OK',data});
const original={id:'2104509220480131074',releaseId:'stable-0.3.1',version:'0.3.1',channel:'stable',status:'PILOT',rolloutPercentage:0,mandatory:false,minimumSupportedVersion:null,releaseNotes:'隔离验收制品，不分发',policyVersion:'0',createdAt:'2026-09-29T10:00:00'};
async function fixture(page:Page,unknown=false){
  const calls:any[]=[];let current={...original};const logs:string[]=[];
  page.on('pageerror',e=>logs.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type())&&!m.text().includes('net::ERR_FAILED'))logs.push(m.text());});
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname;let data:any=[];
    if(path.endsWith('/admin/dashboard/stream'))return route.fulfill({contentType:'text/event-stream',body:': isolated stream fixture\n\n'});
    if(path.endsWith('/auth/me')||path.endsWith('/profile/me'))data={id:'1',username:'fixture-admin',nickname:'管理员',userType:'ADMIN'};
    else if(path.endsWith('/auth/csrf'))data={token:'fixture-only'};
    else if(path.includes('/admin/pages/'))data={items:[],nextCursor:null,versionedWrites:true};
    else if(path.endsWith('/admin/client-updates/members/page'))data={items:[],nextCursor:null,versionedWrites:true};
    else if(path.endsWith('/admin/client-updates/releases/page'))data={items:url.search?[]:[current,{...original,id:'2',version:'0.3.0',status:'WITHDRAWN'}],nextCursor:url.search?null:'cGFnZQ',versionedPolicyEnabled:true};
    else if(path.endsWith(`/releases/${original.id}`)){
      if(route.request().method()==='PATCH'){
        calls.push(route.request().postDataJSON());current={...current,status:'PAUSED',policyVersion:'1'};
        if(unknown)return route.abort('failed');
        return route.fulfill({json:{success:false,code:'RELEASE_VERSION_CONFLICT',message:'发布策略已被其他操作修改'}});
      }data=current;
    }
    await route.fulfill({json:ok(data)});
  });
  return {calls,logs};
}
async function open(page:Page){await page.goto('/admin');await page.getByRole('navigation',{name:'管理模块'}).getByRole('button',{name:/客户端发布/}).click();await expect(page.getByRole('heading',{name:'客户端发布',exact:true})).toBeVisible();}
for(const [width,height] of [[1440,900],[1280,720],[1080,640],[390,844]])test(`release fixed-target conflict ${width}`,async({page},info)=>{
  await page.setViewportSize({width,height});const f=await fixture(page);await open(page);
  const row=page.locator('.admin-list article').filter({hasText:'0.3.1'});await page.getByLabel('审计原因').fill('维护窗口内已核验');await row.getByRole('button',{name:'全量',exact:true}).click();
  const confirm=page.getByRole('region',{name:'确认发布策略'});await expect(confirm).toBeFocused();expect(f.calls).toHaveLength(0);await confirm.getByRole('button',{name:'确认提交',exact:true}).click();
  await expect(confirm.getByText(/操作意图已保留/)).toBeVisible();await confirm.getByRole('button',{name:'核对当前策略'}).click();await expect(confirm.getByText(/最新策略：PAUSED/)).toBeVisible();expect(f.calls).toHaveLength(1);expect(f.calls[0].expectedVersion).toBe('0');
  await confirm.scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath(`release-conflict-${width}.png`),animations:'disabled'});
  await confirm.getByRole('button',{name:'关闭确认'}).click();await expect(row.getByRole('button',{name:'全量',exact:true})).toBeFocused();
  const withdrawn=page.locator('.admin-list article').filter({hasText:'0.3.0'});await expect(withdrawn.getByRole('button',{name:'暂停',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'加载更多发布版本'}).click();await expect(page.getByRole('button',{name:'加载更多发布版本'})).toHaveCount(0);
  expect(f.logs).toEqual([]);expect(await page.title()).toBeTruthy();expect(await page.locator('main').first().innerText()).not.toBe('');await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('unknown result is read-only until explicit reconfirmation',async({page})=>{
  const f=await fixture(page,true);await open(page);await page.getByLabel('审计原因').fill('核对未知结果');await page.locator('.admin-list article').first().getByRole('button',{name:'全量',exact:true}).click();
  await page.getByRole('button',{name:'确认提交',exact:true}).click();await expect(page.getByText(/提交结果未确认，请核对固定版本/)).toBeVisible();await page.getByRole('button',{name:'核对当前策略'}).click();
  await expect(page.getByText(/当前状态不证明原请求一定成功/)).toBeVisible();expect(f.calls).toHaveLength(1);expect(f.logs).toEqual([]);
});
