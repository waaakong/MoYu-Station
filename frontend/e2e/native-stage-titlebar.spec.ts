import {expect,test} from '@playwright/test';

for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]){
  test(`native stage background reaches top behind usable controls at ${viewport.width}x${viewport.height}`,async({page},info)=>{
    const errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/api/**',r=>r.fulfill({json:{success:true,data:null}}));
    await page.routeWebSocket(/\/ws\//,s=>s.onMessage(()=>{}));
    await page.addInitScript(()=>{
      localStorage.setItem('studyroom-shell-preferences-v2',JSON.stringify({startupAnimation:false}));
      const w=window as any;
      w.studyRoomDesktop={
        getCapabilities:async()=>({platform:'electron',localLibrary:true,localFocusDatabase:true,autoUpdate:false}),
        readQueue:async()=>[],replaceQueue:async()=>{},recordPlaybackEvent:async()=>{},
        readSoundSettings:async()=>undefined,saveSoundSettings:async()=>{},listSoundSnapshots:async()=>[],
        onMediaCommand:()=>()=>{},onSourceSwitch:()=>()=>{},onDesktopLifecycle:()=>()=>{},
        readLocalProfileSummary:async()=>({status:'desktop-required'}),
        setUpdaterActivityState:async()=>({state:'unauthorized'}),
        minimizeWindow:async()=>{w.__stageMinimized=true;},
        toggleMaximizeWindow:async()=>{w.__stageMaximized=true;},
        closeWindow:async()=>{w.__stageClosed=true;}
      };
    });
    await page.goto('/#/sound?stage=1');
    const stage=page.locator('.listening-stage');
    await expect(stage).toBeVisible();
    await expect(page.locator('#moyu-startup')).toHaveCount(0);
    await expect(page.locator('.desktop-shell > .window-chrome')).toHaveCount(0);
    const chrome=stage.locator('.topbar > .window-chrome');
    const controlBox=(await chrome.getByRole('group',{name:'窗口控制'}).boundingBox())!;
    // A 44px button plus the group's two borders must not overflow the
    // titlebar or be clipped against the native window's rounded top edge.
    expect(controlBox.y).toBeGreaterThanOrEqual(8);
    expect(controlBox.x+controlBox.width).toBe(viewport.width-(viewport.width<=700?12:8));
    expect(controlBox.height).toBe(46);
    const headerParts=[stage.locator('.brand'),stage.locator('.mode-switch'),stage.locator('.top-tools'),chrome];
    const boxes=[];
    for(const part of headerParts){await expect(part).toBeInViewport();boxes.push((await part.boundingBox())!);}
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];
      expect(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y,`header parts ${i}/${j} overlap`).toBe(false);
    }
    if(viewport.width>1000){
      const center=controlBox.y+controlBox.height/2;
      for(const box of boxes)expect(Math.abs(box.y+box.height/2-center)).toBeLessThan(0.1);
    }
    const metrics=await page.evaluate(()=>{
      const stage=document.querySelector('.listening-stage')!;
      const background=stage.querySelector('.parity-backgrounds')!;
      const chrome=stage.querySelector('.window-chrome')!;
      const topbar=stage.querySelector('.topbar')!;
      return {stageY:stage.getBoundingClientRect().y,backgroundY:background.getBoundingClientRect().y,
        chromeBottom:chrome.getBoundingClientRect().bottom,
        chromeBackground:getComputedStyle(chrome).backgroundColor,
        drag:getComputedStyle(topbar).getPropertyValue('-webkit-app-region'),
        noDrag:getComputedStyle(chrome.querySelector('.window-chrome__controls')!).getPropertyValue('-webkit-app-region'),
        overflow:document.documentElement.scrollWidth>innerWidth};
    });
    expect(metrics.stageY).toBe(0);expect(metrics.backgroundY).toBe(0);
    expect(metrics.chromeBackground).toBe('rgba(0, 0, 0, 0)');
    expect(metrics.drag).toBe('drag');expect(metrics.noDrag).toBe('no-drag');expect(metrics.overflow).toBe(false);
    for(const [name,flag] of [['最小化窗口','__stageMinimized'],['最大化窗口','__stageMaximized'],['关闭窗口','__stageClosed']]){
      const button=chrome.getByRole('button',{name,exact:true});
      const box=(await button.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(controlBox.y);
      expect(box.y+box.height).toBeLessThanOrEqual(controlBox.y+controlBox.height);
      const icon=(await button.locator('svg').boundingBox())!;
      expect(Math.abs(icon.y+icon.height/2-(box.y+box.height/2))).toBeLessThan(0.1);
      await expect(button).toBeInViewport();await button.click();
      expect(await page.evaluate(key=>(window as any)[key],flag)).toBe(true);
    }
    await stage.getByRole('button',{name:'我的',exact:true}).click();
    const menu=stage.getByLabel('我的菜单');await expect(menu).toBeVisible();
    expect((await menu.boundingBox())!.y).toBeGreaterThanOrEqual(metrics.chromeBottom);
    await page.screenshot({path:info.outputPath(`stage-titlebar-${viewport.width}.png`)});
    await stage.getByRole('button',{name:'我的',exact:true}).click();
    await stage.getByRole('button',{name:'纯净模式',exact:true}).click();
    await expect(stage.getByRole('button',{name:'显示控制',exact:true})).toBeFocused();
    await expect(stage.getByRole('button',{name:'返回声音',exact:true})).toBeHidden();
    await page.evaluate(()=>{(window as any).__stageMinimized=false;});
    await chrome.getByRole('button',{name:'最小化窗口',exact:true}).click();
    expect(await page.evaluate(()=>(window as any).__stageMinimized)).toBe(true);
    await stage.getByRole('button',{name:'显示控制',exact:true}).click();
    await stage.getByRole('button',{name:'返回声音',exact:true}).first().click();
    await expect(stage).toHaveCount(0);
    await expect(page.locator('.app-chrome--desktop')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
