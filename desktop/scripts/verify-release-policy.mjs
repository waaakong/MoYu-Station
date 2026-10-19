import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),evidence=await mkdtemp(join(tmpdir(),'studyroom-electron-release-policy-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app;const errors=[],consoleMessages=[];
try {
  app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[join(root,'desktop'),`--user-data-dir=${join(evidence,'isolated-user')}`,'--host-resolver-rules=MAP * ~NOTFOUND'],env,timeout:30000});
  await app.evaluate(({session})=>{
    const release={id:'2104509220480131074',releaseId:'stable-0.3.1',version:'0.3.1',channel:'stable',status:'PILOT',rolloutPercentage:0,mandatory:false,minimumSupportedVersion:null,releaseNotes:'隔离验收制品，不分发',policyVersion:'0',createdAt:'2026-09-29T10:00:00'};
    const calls=[];globalThis.releaseFixture={calls};
    session.fromPartition('persist:studyroom-cloud-v1').protocol.handle('https',async request=>{
      const url=new URL(request.url),path=url.pathname;let data=[];
      if(path.endsWith('/auth/me')||path.endsWith('/profile/me'))data={id:'1',username:'fixture-admin',nickname:'管理员',userType:'ADMIN'};
      else if(path.endsWith('/auth/csrf'))data={token:'fixture-csrf'};
      else if(path.includes('/admin/pages/'))data={items:[],nextCursor:null,versionedWrites:true};
      else if(path.endsWith('/admin/dashboard/stream'))return new Response(': isolated fixture\n\n',{headers:{'content-type':'text/event-stream'}});
      else if(path.endsWith('/admin/client-updates/releases/page'))data={items:url.search?[]:[release],nextCursor:url.search?null:'cGFnZQ',versionedPolicyEnabled:true};
      else if(path.endsWith(`/releases/${release.id}`)){
        if(request.method==='PATCH'){
          const body=await request.json();calls.push(body);
          if(calls.length===1){Object.assign(release,{status:'PAUSED',policyVersion:'1'});return new Response(JSON.stringify({success:false,code:'RELEASE_VERSION_CONFLICT',message:'发布策略已被其他操作修改'}),{headers:{'content-type':'application/json'}});}
          if(body.expectedVersion!==release.policyVersion)throw new Error('wrong revision');
          Object.assign(release,body,{policyVersion:'2'});
        }data=release;
      }
      return new Response(JSON.stringify({success:true,data}),{headers:{'content-type':'application/json'}});
    });
  });
  const page=await app.firstWindow();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))consoleMessages.push(m.text());});
  await page.getByRole('button',{name:'关闭窗口',exact:true}).waitFor();await page.reload();await page.evaluate(()=>{location.hash='#/scene';});await expect(page.getByRole('button',{name:'账号菜单'})).toContainText('我的');
  await page.evaluate(()=>{location.hash='#/admin';});await page.getByRole('navigation',{name:'管理模块'}).getByRole('button',{name:/客户端发布/}).click();
  await page.getByLabel('审计原因').fill('Electron 实际 IPC 隔离验收');await page.locator('.admin-list article').first().getByRole('button',{name:'全量',exact:true}).click();
  const confirm=page.getByRole('region',{name:'确认发布策略'});await expect(confirm).toBeFocused();await confirm.getByRole('button',{name:'确认提交',exact:true}).click();await expect(confirm.getByText(/操作意图已保留/)).toBeVisible();
  await confirm.getByRole('button',{name:'核对当前策略'}).click();await expect(confirm.getByText(/最新策略：PAUSED/)).toBeVisible();
  for(const [width,height] of [[1440,900],[1280,720],[1080,640]]){
    await app.evaluate(({BrowserWindow},size)=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setSize(...size);},[width,height]);
    await confirm.scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,`release-${width}.png`),animations:'disabled'});
  }
  expect(await app.evaluate(()=>globalThis.releaseFixture.calls.length)).toBe(1);
  await confirm.getByRole('button',{name:'采用最新版本，重新确认'}).click();await expect(confirm.getByRole('button',{name:'确认提交',exact:true})).toBeEnabled();expect(await app.evaluate(()=>globalThis.releaseFixture.calls.length)).toBe(1);
  await confirm.getByRole('button',{name:'确认提交',exact:true}).click();await expect(page.getByText('发布策略已保存。',{exact:true})).toBeVisible();
  expect(await app.evaluate(()=>globalThis.releaseFixture.calls.map(c=>c.expectedVersion))).toEqual(['0','1']);
  await page.getByRole('button',{name:'加载更多发布版本'}).click();await expect(page.getByRole('button',{name:'加载更多发布版本'})).toHaveCount(0);
  expect(errors).toEqual([]);expect(consoleMessages).toEqual([]);expect(await page.title()).toBeTruthy();expect(await page.locator('main').first().innerText()).not.toBe('');
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,errors,consoleMessages,viewports:[1440,1280,1080],backend:'in-process HTTPS fixture, not real TLS/MySQL/Redis'},null,2));console.log(JSON.stringify({passed:true,evidence,errors}));
}catch(error){if(app){const page=await app.firstWindow();await page.screenshot({path:join(evidence,'failure.png')});console.log(JSON.stringify({evidence,url:page.url(),text:await page.locator('body').innerText()}));}throw error;}finally{await app?.close();}
