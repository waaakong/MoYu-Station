import { expect,test } from '@playwright/test';

test('web welcome and auth pages remain full height without desktop controls',async({page})=>{
  await page.route('**/api/**',async route=>route.fulfill({json:{success:true,data:null}}));
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]){
  await page.setViewportSize(viewport);
  for(const path of ['/','/login','/register']){
    await page.goto(path);
    await expect(page.locator('.window-chrome')).toHaveCount(0);
    await expect(page.locator('.standalone-desktop')).toHaveCount(0);
    await expect(page.getByRole('button',{name:path==='/'?'登录':path==='/login'?'进入墨屿':'创建墨屿账号',exact:true})).toBeVisible();
    expect(await page.locator('main').first().evaluate(node=>node.getBoundingClientRect().top)).toBe(0);
    expect(await page.locator('main').first().evaluate(node=>node.getBoundingClientRect().height)).toBe(viewport.height);
  }
  }
});

test('local space renders while cloud authentication remains pending',async({page})=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
  await page.route('**/api/auth/me',async route=>{await gate;await route.fulfill({json:{success:true,data:null}});});
  await page.route('**/api/auth/csrf',async route=>route.fulfill({json:{success:true,data:{token:'local'}}}));
  try{await page.goto('/scene');await expect(page.locator('#scene-title')).toBeVisible({timeout:3000});await expect(page.getByRole('button',{name:'关闭窗口'})).toHaveCount(0);}
  finally{release();}
});

test('saved reduced motion skips curtain and Enter respects focused login button',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('studyroom-shell-preferences-v2',JSON.stringify({reducedMotion:true})));
  await page.route('**/api/**',async route=>route.fulfill({json:{success:true,data:null}}));
  await page.goto('/');await page.getByRole('button',{name:'登录',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/login/);await expect(page.getByLabel('用户名',{exact:true})).toBeVisible();
  await page.goto('/');await page.clock.install();await page.getByRole('button',{name:'进入本地空间 →'}).click();
  // No 820 ms timeout is advanced: navigation must not depend on the animation timer.
  await expect(page).toHaveURL(/\/scene/);await expect(page.locator('#scene-title')).toBeVisible();
});

test('space and detailed focus share one session across navigation and four viewports',async({page},info)=>{
  await page.clock.install({time:new Date('2026-09-22T08:00:00Z')});
  await page.route('**/api/**',async route=>route.fulfill({json:{success:true,data:null}}));
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/scene');
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]){
    await page.setViewportSize(viewport);await expect(page.getByRole('link',{name:'空间',exact:true})).toBeVisible();
    const quick=page.getByRole('region',{name:'空间快捷专注'});await quick.getByRole('button',{name:'开始专注',exact:true}).scrollIntoViewIfNeeded();
    await expect(quick).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const main=await page.locator('#main-stage').boundingBox(),player=await page.locator('.desktop-shell__player-slot').boundingBox();expect(main!.y+main!.height).toBeLessThanOrEqual(player!.y+1);
    await page.screenshot({path:info.outputPath(`space-${viewport.width}.png`),animations:'disabled'});
  }
  await page.setViewportSize({width:1280,height:720});await page.clock.pauseAt(new Date('2026-09-22T08:01:00Z'));
  const quick=page.getByRole('region',{name:'空间快捷专注'});await quick.getByRole('button',{name:'开始专注',exact:true}).click();
  await expect(quick.getByRole('button',{name:'暂停',exact:true})).toBeEnabled();
  const first=await page.evaluate(()=>JSON.parse(localStorage.getItem('studyroom-focus-session-v2')!));
  await quick.getByRole('link',{name:'详细专注'}).click();await expect(page.locator('[data-focus-lock]')).toHaveAttribute('data-focus-lock',first.clientRecordId);
  await page.clock.fastForward(61000);
  await page.getByRole('link',{name:'空间',exact:true}).click();await expect(quick.locator('strong')).toHaveText('23:59');
  const second=await page.evaluate(()=>JSON.parse(localStorage.getItem('studyroom-focus-session-v2')!));expect(second.clientRecordId).toBe(first.clientRecordId);
  await quick.getByRole('button',{name:'暂停',exact:true}).click();
  await expect(quick.getByRole('button',{name:'继续',exact:true})).toBeVisible();
  const pausedDisplay=await quick.locator('strong').innerText();
  await page.clock.fastForward(10000);await expect(quick.locator('strong')).toHaveText(pausedDisplay);
});
