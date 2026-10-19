import {test,expect} from '@playwright/test';
test('confirmed effort survives pending activity and refreshes after sync',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let index:number|null=1.4,reads=0;
  const user={id:'2',username:'member',nickname:'测试成员',userType:'NORMAL',passwordChangeRequired:false};
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    let data:unknown=null;
    if(path==='/api/auth/me'||path==='/api/profile/me')data=user;
    else if(path==='/api/profile/stats'){reads++;data={todayFocusMinutes:60,totalFocusHours:1,streakDays:1,onlineMinutes:100,fishMinutes:40,fakeEffortIndex:index,coverage:index===null?'PARTIAL':'CONFIRMED'};}
    else if(path==='/api/profile/share-card')data={statDate:'2026-10-17',timeZone:'Asia/Shanghai',focusMinutes:60,fishMinutes:40,fakeEffortIndex:index};
    else if(path.includes('/calendar')||path.includes('/posts'))data=[];
    else if(path.endsWith('/capabilities'))data={version:0};
    return route.fulfill({contentType:'application/json',body:JSON.stringify({success:true,data})});
  });
  await page.goto('/profile?module=stats');
  const card=page.locator('.profile-stat-grid article').filter({has:page.locator('span',{hasText:'假努力指数'})});
  await expect(card.locator('strong')).toHaveText('1.40');
  await page.evaluate(async()=>{const {activityState}=await import('/src/activity/state.ts');activityState.pending=1;});
  await expect(card.locator('strong')).toHaveText('1.40');
  await expect(page.getByText('本机有待同步活动记录，当前显示已确认的云端部分。')).toBeVisible();
  const before=reads;index=1.5;
  await page.evaluate(async()=>{const {activityState}=await import('/src/activity/state.ts');activityState.revision++;});
  await expect(card.locator('strong')).toHaveText('1.50');expect(reads).toBeGreaterThan(before);
  // Screenshots remain local test output, never committed evidence.
  await page.screenshot({path:test.info().outputPath('stats-confirmed.png')});
  index=null;
  await page.evaluate(async()=>{const {activityState}=await import('/src/activity/state.ts');activityState.pending=0;activityState.revision++;});
  await expect(card.locator('strong')).toHaveText('暂无');
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
