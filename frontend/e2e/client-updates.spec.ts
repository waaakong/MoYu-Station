import { expect, test } from '@playwright/test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('authorized update UI: notice, download progress, cancel, recheck and preference', async ({page}) => {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.emulateMedia({reducedMotion:'reduce'});
  // This fixture has no real account or backend: keep notification sockets local to Playwright too.
  await page.routeWebSocket(/\/ws\//, socket=>{socket.onMessage(()=>{});});
  await page.addInitScript(() => {
    localStorage.setItem('studyroom-shell-preferences-v2',JSON.stringify({startupAnimation:false}));
    const w=window as any;
    let listener=(_event:any)=>{};
    let status:any={state:'available',currentVersion:'0.2.0',availableVersion:'0.3.0',channel:'stable',automaticUpdates:true,automaticChecks:true,installEnabled:true,canInstall:false,canRetry:true,message:'发现可用更新。',releaseNotes:'更新界面、取消下载和安装前授权复核。'};
    const change=(patch:any)=>{status={...status,...patch};listener({status});return status;};
    let completeDownload:((s:any)=>void)|undefined;
    let authenticated=false;
    w.__updateFixture={};
    w.studyRoomDesktop={
      getCapabilities:async()=>({platform:'electron',localLibrary:true,localFocusDatabase:true,autoUpdate:true}),
      readQueue:async()=>[],replaceQueue:async()=>{},recordPlaybackEvent:async()=>{},
      readSoundSettings:async()=>undefined,saveSoundSettings:async()=>{},listSoundSnapshots:async()=>[],
      onMediaCommand:()=>()=>{},onSourceSwitch:()=>()=>{},onDesktopLifecycle:()=>()=>{},
      readLocalProfileSummary:async()=>({status:'desktop-required'}),
      onUpdateStatus:(fn:any)=>{listener=fn;return()=>{};},
      setUpdaterAuthState:async(input:any)=>{authenticated=input.authenticated;return authenticated?status:{...status,state:'unauthorized'};},
      setUpdaterActivityState:async()=>authenticated?status:{...status,state:'unauthorized'},
      checkForUpdates:async()=>change({state:'available',message:'发现可用更新。'}),
      setAutomaticUpdateChecks:async(enabled:boolean)=>{w.__updateFixture.automaticChecks=enabled;return change({automaticChecks:enabled});},
      downloadUpdate:async()=>{change({state:'downloading',progressPercent:42,canRetry:false,message:'正在安全下载更新。'});return new Promise(resolve=>{completeDownload=resolve;});},
      cancelUpdateDownload:async()=>{const next=change({state:'idle',canRetry:true,progressPercent:undefined,message:'已取消下载，当前版本可继续使用。重新检查后可重试。'});completeDownload?.(next);return next;},
      installUpdate:async()=>{w.__updateFixture.installed=true;}
    };
  });
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const user={id:'2',username:'fixture',nickname:'Fixture',userType:'NORMAL',passwordChangeRequired:false};
    const data=path.endsWith('/auth/me')||path.endsWith('/profile/me')?user:path.endsWith('/auth/csrf')?{token:'synthetic-csrf'}:path.endsWith('/private-scene')?null:[];
    return route.fulfill({json:{success:true,data}});
  });
  await page.goto('/#/scene');
  const notice=page.getByRole('dialog',{name:'发现新版本'});
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('不会自动安装');
  await notice.getByRole('button',{name:'查看更新'}).click();
  const panel=page.locator('section[aria-labelledby="profile-updates-title"]');
  await expect(panel.getByRole('heading',{name:'客户端版本'})).toBeVisible();
  await expect(page).toHaveURL(/profile\?module=client/);
  await expect(page).toHaveTitle(/墨屿/);
  await expect(panel.getByText('0.3.0',{exact:true})).toBeVisible();
  for(const size of [{width:1440,height:900},{width:1080,height:640}]){
    await page.setViewportSize(size);
    await expect(panel.getByRole('button',{name:'下载更新'})).toBeInViewport();
    await page.screenshot({path:join(tmpdir(),`moyu-updates-${size.width}.png`)});
  }
  await panel.getByRole('button',{name:'下载更新'}).click();
  await expect(panel.getByRole('progressbar')).toHaveAttribute('aria-valuenow','42');
  await panel.getByRole('button',{name:'取消下载'}).click();
  await expect(panel).toContainText('已取消下载');
  await expect(panel.getByRole('button',{name:'保存并重启安装'})).toHaveCount(0);
  await panel.getByRole('button',{name:'重新检查'}).click();
  await expect(panel.getByRole('button',{name:'下载更新'})).toBeVisible();
  await panel.getByRole('checkbox',{name:'自动检查更新（不自动安装）'}).uncheck();
  expect(await page.evaluate(()=>(window as any).__updateFixture.automaticChecks)).toBe(false);
  expect(await page.evaluate(()=>(window as any).__updateFixture.installed)).toBeUndefined();
  await page.reload();
  await expect(panel.getByRole('heading',{name:'客户端版本'})).toBeVisible();
  await expect(page.getByRole('dialog',{name:'发现新版本'})).toBeHidden();
  expect(errors).toEqual([]);
});
