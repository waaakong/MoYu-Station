import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

for (const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:800,height:844},{width:390,height:844}]) {
  test(`native chrome keeps all controls separate at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    const errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.setViewportSize(viewport);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.route('**/api/**', route=>route.fulfill({json:{success:true,data:null}}));
    await page.routeWebSocket(/\/ws\//,socket=>socket.onMessage(()=>{}));
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
        minimizeWindow:async()=>{w.__nativeChromeMinimized=true;}
      };
    });
    await page.goto('/#/scene');
    await expect(page).toHaveTitle(/墨屿/);
    await expect(page.locator('#scene-title')).toBeVisible();
    // The page can render while the native startup gate still owns keyboard
    // focus. Wait for its real lifecycle, including the reduced-motion exit.
    await expect(page.locator('#moyu-startup')).toHaveCount(0);
    const chrome=page.locator('.app-chrome--desktop');
    const primary=chrome.getByRole('navigation',{name:'主要功能'});
    const controls=[chrome.locator('.app-brand'),...['空间','社区','片刻放松'].map(name=>primary.getByRole('link',{name,exact:true})),chrome.getByRole('button',{name:'账号菜单'}),chrome.getByRole('group',{name:'窗口控制'})];
    const boxes=[];
    for(const control of controls){
      await expect(control).toBeInViewport();
      const box=(await control.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);
      boxes.push(box);
    }
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];
      expect(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y,`controls ${i}/${j} overlap`).toBe(false);
    }
    for(const name of ['空间','社区','片刻放松'])await expect(primary.getByRole('link',{name,exact:true})).toBeInViewport();
    for(const name of ['最小化窗口','最大化窗口','关闭窗口']){
      const box=(await chrome.getByRole('button',{name,exact:true}).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
    }
    const stage=(await page.locator('#main-stage').boundingBox())!,header=(await chrome.boundingBox())!,player=(await page.getByLabel('播放器',{exact:true}).boundingBox())!;
    expect(stage.y).toBeGreaterThanOrEqual(header.y+header.height);
    expect(stage.y+stage.height).toBeLessThanOrEqual(player.y);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const account=chrome.getByRole('button',{name:'账号菜单'});
    await account.focus();await page.keyboard.press('ArrowDown');
    await expect(page.locator('#account-panel').getByRole('link',{name:'个人空间'})).toBeFocused();
    await page.keyboard.press('Escape');await expect(account).toBeFocused();
    await chrome.getByRole('button',{name:'最小化窗口'}).click();
    expect(await page.evaluate(()=>(window as any).__nativeChromeMinimized)).toBe(true);
    await page.screenshot({path:join(tmpdir(),`moyu-native-chrome-${viewport.width}.png`)});
    expect(errors).toEqual([]);
  });
}
