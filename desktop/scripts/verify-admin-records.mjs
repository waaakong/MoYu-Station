import {_electron as electron,expect} from '@playwright/test';import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),evidence=await mkdtemp(join(tmpdir(),'studyroom-electron-admin-records-'));const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app;const errors=[],consoleMessages=[];
try{
  app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[join(root,'desktop'),`--user-data-dir=${join(evidence,'isolated-user')}`,'--host-resolver-rules=MAP * ~NOTFOUND'],env,timeout:30000});
  await app.evaluate(({session})=>{
    const row={id:'2104509220480131074',author:'隔离成员',title:'播放建议',content:'Electron 实际 IPC 验收，不会修改真实反馈。',status:'PENDING',adminVersion:'0'},calls=[];globalThis.recordFixture={calls};
    session.fromPartition('persist:studyroom-cloud-v1').protocol.handle('https',async request=>{
      const path=new URL(request.url).pathname;let data=[];
      if(path.endsWith('/auth/me')||path.endsWith('/profile/me'))data={id:'1',username:'fixture-admin',userType:'ADMIN'};
      else if(path.endsWith('/auth/csrf'))data={token:'fixture-token'};
      else if(path.endsWith('/admin/dashboard/stream'))return new Response(': fixture\n\n',{headers:{'content-type':'text/event-stream'}});
      else if(path.endsWith('/admin/pages/users'))data={items:[],nextCursor:null,versionedWrites:true};
      else if(path.endsWith('/admin/pages/feedback'))data={items:[row],nextCursor:null,versionedWrites:true};
      else if(path.endsWith(`/admin/feedback/${row.id}/status`)){
        const body=await request.json();calls.push(body);
        if(calls.length===1){Object.assign(row,{status:'PROCESSING',adminVersion:'1'});return new Response(JSON.stringify({success:false,code:'ADMIN_VERSION_CONFLICT',message:'记录已变化'}),{headers:{'content-type':'application/json'}});}
        if(body.expectedVersion!=='1')throw new Error('wrong revision');Object.assign(row,{status:body.status,adminVersion:'2'});data=null;
      }
      return new Response(JSON.stringify({success:true,data}),{headers:{'content-type':'application/json'}});
    });
  });
  const page=await app.firstWindow();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))consoleMessages.push(m.text());});
  await page.getByRole('button',{name:'关闭窗口',exact:true}).waitFor();await page.reload();await page.evaluate(()=>{location.hash='#/scene';});await expect(page.getByRole('button',{name:'账号菜单'})).toContainText('我的');
  await page.evaluate(()=>{location.hash='#/admin';});await page.getByRole('navigation',{name:'管理模块'}).getByRole('button',{name:/^反馈/}).click();
  const select=page.getByRole('combobox',{name:'播放建议 的状态'});await select.click();await page.getByRole('option',{name:'RESOLVED',exact:true}).click();await expect(page.getByRole('alert')).toContainText('原操作');await expect(select).toContainText('PENDING');
  for(const [width,height] of [[1440,900],[1280,720],[1080,640]]){await app.evaluate(({BrowserWindow},size)=>{const w=BrowserWindow.getAllWindows()[0];w.unmaximize();w.setSize(...size);},[width,height]);await page.getByRole('alert').scrollIntoViewIfNeeded();await page.screenshot({path:join(evidence,`records-${width}.png`),animations:'disabled'});}
  expect(await app.evaluate(()=>globalThis.recordFixture.calls.length)).toBe(1);await page.getByRole('button',{name:'刷新',exact:true}).click();await expect(select).toContainText('PROCESSING');await select.click();await page.getByRole('option',{name:'RESOLVED',exact:true}).click();await expect(page.getByText('操作已保存。',{exact:true})).toBeVisible();await expect(select).toContainText('RESOLVED');
  expect(await app.evaluate(()=>globalThis.recordFixture.calls.map(c=>c.expectedVersion))).toEqual(['0','1']);expect(errors).toEqual([]);expect(consoleMessages).toEqual([]);expect(await page.title()).toBeTruthy();
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,errors,consoleMessages,viewports:[1440,1280,1080],backend:'in-process HTTPS fixture; not genuine TLS/MySQL/Redis'},null,2));console.log(JSON.stringify({passed:true,evidence}));
}catch(error){if(app){const p=await app.firstWindow();await p.screenshot({path:join(evidence,'failure.png')});console.log(JSON.stringify({evidence,text:await p.locator('body').innerText()}));}throw error;}finally{await app?.close();}
