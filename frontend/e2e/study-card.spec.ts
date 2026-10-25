import {expect,test,type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

async function setup(page:Page){
  await page.routeWebSocket('**/ws/**',socket=>socket.close());
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;let data:unknown=[];
    if(path.endsWith('/auth/me')||path.endsWith('/profile/me'))data={id:2,username:'fixture',nickname:'山间读者',userType:'NORMAL'};
    else if(path.endsWith('/profile/stats'))data={todayFocusMinutes:35,totalFocusHours:2,fishMinutes:0,favoriteScene:'高山湖泊'};
    else if(path.endsWith('/profile/share-card'))data={title:'今日学习报告',statDate:new URL(route.request().url()).searchParams.get('date')||'2026-09-28',timeZone:'Asia/Shanghai',focusMinutes:35,fishMinutes:0,fakeEffortIndex:1.5,favoriteScene:'高山湖泊'};
    await route.fulfill({json:{success:true,data}});
  });
  await page.goto('/profile?module=stats');await page.getByRole('button',{name:'预览学习卡片'}).click();await expect(page.getByRole('status')).toContainText('预览与 PNG 内容一致');
}
test('eight metric combinations export actual PNG bytes identical to the visible canvas',async({page},info)=>{
  await setup(page);const dialog=page.getByRole('dialog',{name:'学习卡片'});
  for(let mask=0;mask<8;mask++){
    for(const [bit,name] of [[1,'专注分钟'],[2,'摸鱼分钟'],[4,'假努力指数']] as const)await dialog.getByRole('checkbox',{name,exact:true}).setChecked(!!(mask&bit));
    const encoded=await page.locator('canvas[aria-label="学习卡片图片预览"]').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL('image/png').split(',')[1]);
    const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'保存 PNG',exact:true}).click();const result=await download;
    const path=info.outputPath(`card-${mask}.png`);await result.saveAs(path);const bytes=await readFile(path);
    expect(bytes.subarray(1,4).toString()).toBe('PNG');expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBe(675);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(createHash('sha256').update(Buffer.from(encoded,'base64')).digest('hex'));
    await expect(dialog.getByRole('status')).toContainText('已发起');
  }
});
test('encoding failure retries the same quote; cancellation and session end discard late blobs',async({page})=>{
  await setup(page);const dialog=page.getByRole('dialog',{name:'学习卡片'}),quote=dialog.locator('.study-card-quote');const originalQuote=await quote.textContent();
  await page.evaluate(()=>{(window as any).__encode=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback){callback(null);};});
  await dialog.getByRole('button',{name:'保存 PNG'}).click();await expect(dialog.getByRole('alert')).toContainText('生成失败');await expect(quote).toHaveText(originalQuote!);
  await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=(window as any).__encode;});const downloaded=page.waitForEvent('download');await dialog.getByRole('button',{name:'重试生成 PNG'}).click();await downloaded;await expect(quote).toHaveText(originalQuote!);
  let downloads=0;page.on('download',()=>downloads++);
  for(const endSession of [false,true]){
    await page.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=function(callback,type){(window as any).__finish=()=>new Promise<void>(resolve=>(window as any).__encode.call(this,(blob:Blob)=>{callback(blob);resolve();},type));};});
    await dialog.getByRole('button',{name:'保存 PNG'}).click();await expect(dialog.getByRole('button',{name:'随机一句'})).toBeDisabled();
    if(endSession)await page.evaluate(()=>window.dispatchEvent(new CustomEvent('studyroom:session-ended')));else await dialog.getByRole('button',{name:'取消生成'}).click();
    await page.evaluate(()=>(window as any).__finish());expect(downloads).toBe(0);
  }await expect(dialog).toHaveCount(0);
});
test('random quote does not repeat and the dialog works at four viewports',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await setup(page);const dialog=page.getByRole('dialog',{name:'学习卡片'}),quote=dialog.locator('.study-card-quote');
  for(let i=0;i<10;i++){const before=await quote.textContent();await dialog.getByRole('button',{name:'随机一句'}).click();await expect(quote).not.toHaveText(before!);}
  for(const [width,height]of [[1440,900],[1280,720],[1080,640],[390,844]]){await page.setViewportSize({width,height});const save=dialog.getByRole('button',{name:'保存 PNG'});await expect(save).toBeInViewport();await page.screenshot({path:info.outputPath(`editor-${width}.png`),animations:'disabled'});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
  const before=await quote.textContent();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await page.getByRole('button',{name:'预览学习卡片'}).click();await expect(quote).toHaveText(before!);expect(errors).toEqual([]);
});

test('historical date races and failures never export a different date snapshot',async({page})=>{
  await setup(page);const dialog=page.getByRole('dialog',{name:'学习卡片'});
  async function chooseDate(year:string){
    await dialog.getByRole('button',{name:'选择报告日期'}).click();
    await dialog.getByLabel('年份',{exact:true}).selectOption(year);
    await dialog.getByLabel('月份',{exact:true}).selectOption('1');
    await dialog.getByRole('button',{name:`${year}-01-01`,exact:true}).click();
  }
  let release!:()=>void,requested!:()=>void;const arrived=new Promise<void>(resolve=>requested=resolve),held=new Promise<void>(resolve=>release=resolve);let fail=true;
  await page.route('**/api/profile/share-card?*',async route=>{
    const selected=new URL(route.request().url()).searchParams.get('date');
    if(selected==='2020-01-01'){requested();await held;}
    if(selected==='2022-01-01'&&fail){await route.fulfill({status:503,json:{success:false,message:'fixture unavailable'}});return;}
    await route.fulfill({json:{success:true,data:{statDate:selected,timeZone:'Asia/Shanghai',focusMinutes:12,fishMinutes:3,fakeEffortIndex:1.2}}});
  });
  await chooseDate('2020');await arrived;
  await chooseDate('2021');await expect(dialog.locator('#study-card-transcript')).toContainText('2021-01-01');
  release();await expect(dialog.locator('#study-card-transcript')).not.toContainText('2020-01-01');
  await chooseDate('2022');await expect(dialog.getByRole('alert')).toContainText('未使用其他日期');await expect(dialog.locator('#study-card-transcript')).not.toContainText('2021-01-01');
  fail=false;await dialog.getByRole('button',{name:'重试生成 PNG'}).click();await expect(dialog.locator('#study-card-transcript')).toContainText('2022-01-01');
  const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'保存 PNG',exact:true}).click();expect((await download).suggestedFilename()).toContain('2022-01-01');
});

test('custom calendar supports keyboard, bounded dates and four viewport layouts',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
  const dialog=page.getByRole('dialog',{name:'学习卡片'}),trigger=dialog.getByRole('button',{name:'选择报告日期'});
  for(const [width,height] of [[1440,900],[1280,720],[1080,640],[390,844]]){
    await page.setViewportSize({width,height});await trigger.click();
    const calendar=dialog.getByRole('region',{name:'报告日期日历'});
    await expect(calendar).toBeVisible();
    const box=await calendar.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);expect(box!.y+box!.height).toBeLessThanOrEqual(height);
    await page.screenshot({path:info.outputPath(`calendar-${width}.png`),animations:'disabled'});
    await page.keyboard.press('Escape');await expect(calendar).toBeHidden();await expect(dialog).toBeVisible();await expect(trigger).toBeFocused();
  }
  await trigger.click();await page.keyboard.press('ArrowLeft');await expect(dialog.locator('[data-date="2026-09-27"]')).toBeFocused();
  await page.keyboard.press('Enter');await expect(trigger).toContainText('2026 / 09 / 27');
  await trigger.click();await dialog.getByLabel('年份',{exact:true}).selectOption('2000');await dialog.getByLabel('月份',{exact:true}).selectOption('1');
  await expect(dialog.getByRole('button',{name:'1999-12-31',exact:true})).toBeDisabled();
  await dialog.getByRole('button',{name:'今天',exact:true}).click();await trigger.click();await expect(dialog.getByRole('button',{name:'下个月',exact:true})).toBeDisabled();
  await page.emulateMedia({reducedMotion:'reduce'});await expect(dialog.getByRole('grid')).toBeVisible();expect(errors).toEqual([]);
});
