import {expect,test} from '@playwright/test';

for(const solid of [false,true]){
  test(`stage overlays share ${solid?'solid accessibility fallback':'frosted glass'} material`,async({page},info)=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(value=>localStorage.setItem('studyroom-shell-preferences-v2',JSON.stringify({reducedTransparency:value})),solid);
    await page.goto('/e2e/fixtures/listening-stage.html?reference=1');
    const stage=page.locator('.listening-stage');
    const material=async(selector:string)=>page.locator(selector).evaluate(el=>{
      const s=getComputedStyle(el);return {fill:s.backgroundColor,blur:s.backdropFilter,image:s.backgroundImage,edge:s.borderTopColor};
    });
    await stage.getByRole('button',{name:'我的',exact:true}).click();
    await expect(stage.getByLabel('我的菜单')).toBeVisible();
    const account=await material('.account-menu');
    await page.screenshot({path:info.outputPath('account.png')});
    await stage.getByRole('button',{name:'我的',exact:true}).click();
    const results=[account];
    for(const [open,name,close] of [['视觉设置','舞台设置','关闭视觉设置'],['播放队列','播放队列','关闭播放队列']]){
      const opener=stage.getByRole('button',{name:open,exact:true});await opener.click();
      const dialog=page.getByRole('dialog',{name,exact:true});await expect(dialog).toBeVisible();
      results.push(await dialog.evaluate(el=>{const s=getComputedStyle(el);return {fill:s.backgroundColor,blur:s.backdropFilter,image:s.backgroundImage,edge:s.borderTopColor};}));
      if(name==='舞台设置'){
        await dialog.getByRole('combobox',{name:'色调',exact:true}).click();
        await page.getByRole('option',{name:'余烬暖铜',exact:true}).click();
        await expect(dialog.getByRole('combobox',{name:'色调',exact:true})).toContainText('余烬暖铜');
      }
      await page.screenshot({path:info.outputPath(name==='舞台设置'?'settings.png':'queue.png')});
      await dialog.getByRole('button',{name:close,exact:true}).click();
      await expect(opener).toBeFocused();
    }
    expect(results[1]).toEqual(account);expect(results[2]).toEqual(account);
    if(solid){expect(account.blur).toBe('none');expect(account.fill).toBe('rgb(41, 44, 43)');}
    else {expect(account.blur).toContain('blur(28px)');expect(account.fill).toBe('rgba(23, 35, 33, 0.52)');expect(account.image).toContain('linear-gradient');}
  });
}
