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
    const chrome=page.locator('.desktop-shell > .window-chrome');
    const metrics=await page.evaluate(()=>{
      const stage=document.querySelector('.listening-stage')!;
      const background=stage.querySelector('.parity-backgrounds')!;
      const chrome=document.querySelector('.desktop-shell > .window-chrome')!;
      const topbar=stage.querySelector('.topbar')!;
      return {stageY:stage.getBoundingClientRect().y,backgroundY:background.getBoundingClientRect().y,
        chromeBottom:chrome.getBoundingClientRect().bottom,contentY:topbar.getBoundingClientRect().y,
        chromeBackground:getComputedStyle(chrome).backgroundColor,
        drag:getComputedStyle(chrome).getPropertyValue('-webkit-app-region'),
        noDrag:getComputedStyle(chrome.querySelector('.window-chrome__controls')!).getPropertyValue('-webkit-app-region'),
        overflow:document.documentElement.scrollWidth>innerWidth};
    });
    expect(metrics.stageY).toBe(0);expect(metrics.backgroundY).toBe(0);
    expect(metrics.contentY).toBeGreaterThanOrEqual(metrics.chromeBottom);
    expect(metrics.chromeBackground).toBe('rgba(0, 0, 0, 0)');
    expect(metrics.drag).toBe('drag');expect(metrics.noDrag).toBe('no-drag');expect(metrics.overflow).toBe(false);
    for(const [name,flag] of [['最小化窗口','__stageMinimized'],['最大化窗口','__stageMaximized'],['关闭窗口','__stageClosed']]){
      const button=chrome.getByRole('button',{name,exact:true});
      await expect(button).toBeInViewport();await button.click();
      expect(await page.evaluate(key=>(window as any)[key],flag)).toBe(true);
    }
    await stage.getByRole('button',{name:'我的',exact:true}).click();
    const menu=stage.getByLabel('我的菜单');await expect(menu).toBeVisible();
    expect((await menu.boundingBox())!.y).toBeGreaterThanOrEqual(metrics.chromeBottom);
    await page.screenshot({path:info.outputPath(`stage-titlebar-${viewport.width}.png`)});
    await stage.getByRole('button',{name:'返回声音',exact:true}).first().click();
    await expect(stage).toHaveCount(0);
    await expect(page.locator('.app-chrome--desktop')).toBeVisible();
    expect(errors).toEqual([]);
  });
}
