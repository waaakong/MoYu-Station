import {expect,test,type Page} from '@playwright/test';

async function setup(page:Page){
  const now=Date.now(),date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
  const intervals:any[]=[{startMs:now-60000,endMs:now,state:'ONLINE'},{startMs:now-30000,endMs:now,state:'RELAX'}];
  const receipts=new Map<string,unknown>();
  await page.routeWebSocket('**/ws/**',socket=>socket.close());
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;let data:unknown=[];
    if(path==='/api/auth/me'||path==='/api/profile/me')data={id:'2',username:'fixture',nickname:'测试用户',userType:'NORMAL'};
    else if(path==='/api/activity/capabilities')data={version:2,relaxTimingVersion:1};
    else if(path==='/api/activity/live')data={date,timeZone:'Asia/Shanghai',segments:intervals,partial:false,hasLegacy:false};
    else if(path==='/api/activity/intervals'){
      const batch=route.request().postDataJSON();data={status:'committed',requestId:batch.requestId,sequence:batch.sequence};
      if(!receipts.has(batch.requestId))intervals.push(...batch.segments);receipts.set(batch.requestId,data);
    }else if(path.startsWith('/api/activity/requests/'))data=receipts.get(path.split('/').at(-1)!)||{status:'unconfirmed'};
    else if(path==='/api/profile/stats')data={todayFocusMinutes:0,onlineMinutes:999,fishMinutes:999,fakeEffortIndex:99,coverage:'CONFIRMED',fishTimingBasis:'RELAX_PAGE'};
    else if(path==='/api/profile/share-card')data={statDate:date,timeZone:'Asia/Shanghai',focusMinutes:0,fishMinutes:0,fishTimingBasis:'RELAX_PAGE'};
    await route.fulfill({json:{success:true,data}});
  });
  await page.goto('/profile?module=stats');await expect(page.getByRole('heading',{name:'学习统计'})).toBeVisible();
}
test('profile uses second-level live intervals, counts only relaxation and deduplicates uploaded copies',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
  const fish=page.locator('.profile-stat-grid article').filter({has:page.getByText('今日摸鱼',{exact:true})});
  const online=page.locator('.profile-stat-grid article').filter({has:page.getByText('今日在线',{exact:true})});
  const effort=page.locator('.profile-stat-grid article').filter({has:page.getByText('假努力指数',{exact:true})});
  await expect(fish.locator('strong')).toHaveText('0 分 30 秒');await expect(effort.locator('strong')).not.toHaveText('99.00');
  const seconds=async()=>{const text=await online.locator('strong').innerText();const match=text.match(/(\d+) 分 (\d+) 秒/);return match?Number(match[1])*60+Number(match[2]):-1;};
  const before=await seconds();await expect.poll(seconds).toBeGreaterThan(before);await expect(fish.locator('strong')).toHaveText('0 分 30 秒');
  await page.getByRole('link',{name:'片刻放松',exact:true}).click();await expect(page.getByRole('heading',{name:'休息一下',exact:true})).toBeVisible();
  await expect.poll(async()=>page.evaluate(async()=>{
    return new Promise<number>((resolve,reject)=>{const req=indexedDB.open('moyu-activity-v2',1);req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,q=db.transaction('outbox').objectStore('outbox').getAll();q.onsuccess=()=>{resolve(q.result.flatMap(r=>r.batch.segments).filter(s=>s.state==='RELAX').reduce((n,s)=>n+s.endMs-s.startMs,0));db.close();};};});
  })).toBeGreaterThan(1000);
  await page.getByRole('button',{name:'账号菜单'}).click();await page.getByRole('link',{name:'个人空间',exact:true}).click();await page.getByRole('button',{name:/学习统计/}).click();
  const fishSeconds=async()=>{const text=await fish.locator('strong').innerText(),m=text.match(/(\d+) 分 (\d+) 秒/);return m?Number(m[1])*60+Number(m[2]):-1;};
  await expect.poll(fishSeconds).toBeGreaterThan(30);expect(await fishSeconds()).toBeLessThan(50);
  const after=await fishSeconds(),onlineBefore=await seconds();await expect.poll(seconds).toBeGreaterThan(onlineBefore+1);expect(await fishSeconds()).toBe(after);
  for(const [width,height] of [[1440,900],[1280,720],[1080,640],[390,844]]){
    await page.setViewportSize({width,height});await expect(fish).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath(`live-${width}.png`),animations:'disabled'});
  }
  expect(errors).toEqual([]);
});
