import { expect,test,type Page } from '@playwright/test';

// Explicit fixture-only interactions. No real account/admin mutations are issued.
async function prepare(page:Page) {
  await page.addInitScript(() => {
    localStorage.setItem('studyroom-shell-preferences-v2', JSON.stringify({ reducedMotion:true }));
    Object.defineProperty(window,'EventSource',{value:undefined,configurable:true});
    class FixtureSocket extends EventTarget{static OPEN=1;readyState=0;constructor(){super();queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}send(){}close(){this.readyState=3;}}
    Object.defineProperty(window,'WebSocket',{value:FixtureSocket,configurable:true});
  });
  await page.route('**/api/**', async route => {
    const path=new URL(route.request().url()).pathname;
    if(path.startsWith('/api/admin/')) expect(route.request().method(), 'UI review must not mutate admin data').toBe('GET');
    const account={id:1,username:'review-admin',nickname:'界面验收账号',userType:'ADMIN',onlineStatus:'IDLE',passwordChangeRequired:false};
    let data:unknown=[];
    if(path.endsWith('/auth/me')||path.endsWith('/profile/me'))data=account;
    else if(path.endsWith('/auth/csrf'))data={token:'ui-only-fixture'};
    else if(path.endsWith('/admin/pages/users')){const role=new URL(route.request().url()).searchParams.get('role');data={items:[
      {id:'2',adminVersion:'0',username:'normal-member',nickname:'普通成员样本',userType:'NORMAL',onlineStatus:'IDLE'},
      {id:'3',adminVersion:'0',username:'muted-member',nickname:'禁言成员样本',userType:'MUTED',onlineStatus:'IDLE'}
    ].filter(row=>!role||role==='ALL'||row.userType===role),nextCursor:null,versionedWrites:true};}
    else if(path.endsWith('/admin/dashboard'))data={sections:{},sampledAt:'2026-09-28T00:00:00Z'};
    else if(path.endsWith('/capabilities'))data={};
    await route.fulfill({json:{success:true,code:'OK',data}});
  });
  await page.goto('/admin');
}

test('role segments query the selected server filter; reset dialog traps focus and restores trigger',async({page})=>{
  await prepare(page);
  await page.getByRole('navigation',{name:'管理模块'}).getByRole('button',{name:/^用户/}).click();
  const filter=page.getByRole('group',{name:'筛选用户角色'});
  await filter.getByRole('button',{name:'禁言',exact:true}).click();
  await expect(page.locator('.admin-list strong')).toHaveText(['禁言成员样本']);
  await expect(filter.getByRole('button',{name:'禁言',exact:true})).toHaveAttribute('aria-pressed','true');
  await filter.getByRole('button',{name:'全部',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.locator('.admin-list strong')).toHaveCount(2);
  expect(await page.locator('.role-filter__selection').evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(.001);
  const reset=page.getByRole('button',{name:'重置密码'}).first();
  await reset.click();const dialog=page.getByRole('dialog',{name:/重置 normal-member/});
  await expect(dialog).toBeVisible();await expect(dialog.getByLabel('新密码',{exact:true})).toBeFocused();
  await page.keyboard.press('Shift+Tab');expect(await dialog.evaluate(el=>el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(reset).toBeFocused();
});

test('custom date/time picker preserves cancellation and commits only explicit confirmation',async({page},info)=>{
  await prepare(page);
  await page.getByRole('navigation',{name:'管理模块'}).getByRole('button',{name:/^邀请码/}).click();
  const trigger=page.getByRole('button',{name:'选择到期时间'});
  await expect(trigger).toHaveText('不限时间');await trigger.click();
  let dialog=page.getByRole('dialog',{name:'到期时间',exact:true});
  await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:/年.*月15日/}).click();
  const hours=dialog.getByRole('listbox',{name:'小时'}),minutes=dialog.getByRole('listbox',{name:'分钟'});
  await hours.focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');
  await minutes.focus();await page.keyboard.press('End');await page.keyboard.press('ArrowUp');
  await expect(dialog.locator('.time-label strong')).toHaveText('01 : 58');
  await page.keyboard.press('Escape');await expect(trigger).toHaveText('不限时间');await expect(trigger).toBeFocused();
  await trigger.click();dialog=page.getByRole('dialog',{name:'到期时间',exact:true});
  await dialog.getByRole('button',{name:/年.*月15日/}).click();
  await dialog.getByRole('listbox',{name:'小时'}).focus();await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');
  await dialog.getByRole('listbox',{name:'分钟'}).focus();await page.keyboard.press('End');await page.keyboard.press('ArrowUp');
  await expect(dialog.locator('.time-label strong')).toHaveText('01 : 58');
  await dialog.getByRole('button',{name:'确定',exact:true}).click();
  await expect(trigger).toHaveText(/-15 01:58$/);
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]){
    await page.setViewportSize(viewport);await trigger.click();await expect(dialog).toBeVisible();
    const box=await dialog.boundingBox();expect(box!.width).toBeLessThanOrEqual(viewport.width);expect(box!.height).toBeLessThanOrEqual(viewport.height);
    await page.screenshot({path:info.outputPath('date-picker-'+viewport.width+'.png'),animations:'disabled'});
    await dialog.getByRole('button',{name:'取消',exact:true}).click();
  }
  await trigger.click();await dialog.getByRole('button',{name:'不限时间',exact:true}).click();await expect(trigger).toHaveText('不限时间');
});

test('community panels occupy the shell stage instead of retaining legacy viewport offsets',async({page},info)=>{
  await prepare(page);
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    for(const name of ['chat','feed']){
      await page.goto('/'+name);
      const stage=page.locator('#main-stage'),panel=page.locator('.'+name+'-shell');
      await expect(panel).toBeVisible();
      const stageBox=await stage.boundingBox(),panelBox=await panel.boundingBox(),margin=viewport.width<=800?8:16;
      expect(Math.abs(panelBox!.y-stageBox!.y-margin)).toBeLessThanOrEqual(1);
      expect(Math.abs(panelBox!.height-stageBox!.height+margin*2)).toBeLessThanOrEqual(1);
      if(name==='chat'){
        if(viewport.width<=800)await page.locator('.conversation-row').first().click();
        const messageBox=await page.locator('.active-conversation .messages').boundingBox();
        expect(messageBox!.height).toBeGreaterThan(100);
        await expect(page.locator('.active-conversation textarea')).toBeInViewport();
      }
      await page.screenshot({path:info.outputPath(name+'-stage-'+viewport.width+'.png'),animations:'disabled'});
    }
  }
});
