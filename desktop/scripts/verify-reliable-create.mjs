import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const root=resolve(import.meta.dirname,'../..'),evidence=await mkdtemp(join(tmpdir(),'studyroom-electron-reliable-create-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app;const errors=[],consoleMessages=[];
try {
  app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[join(root,'desktop'),`--user-data-dir=${join(evidence,'isolated-user')}`,'--host-resolver-rules=MAP * ~NOTFOUND'],env,timeout:30000});
  await app.evaluate(({session})=>{
    const receipts=new Map(),calls=[];globalThis.createFixture={calls};
    session.fromPartition('persist:studyroom-cloud-v1').protocol.handle('https',async request=>{
      const path=new URL(request.url).pathname;let data=[],status=200;
      const user={id:'2104509220480131074',username:'fixture',nickname:'隔离测试',userType:'ADMIN'};
      if(path.endsWith('/auth/me') || path.endsWith('/profile/me'))data=user;
      else if(path.endsWith('/auth/csrf'))data={token:'fixture-csrf'};
      else if(path.endsWith('/operations/capabilities'))data={reliableCreate:true};
      else if(path.includes('/operations/')){const id=path.split('/').at(-1);data={status:'committed',requestId:id,targetId:receipts.get(id)};}
      else if(path.endsWith('/profile/feedback') && request.method==='POST'){const body=await request.json();calls.push(body.clientRequestId);receipts.set(body.clientRequestId,'2104509220480131075');status=503;}
      return new Response(JSON.stringify(status===200?{success:true,data}:{success:false,code:'INTERNAL_ERROR',message:'isolated lost response'}),{status,headers:{'content-type':'application/json'}});
    });
  });
  const page=await app.firstWindow();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(['error','warning'].includes(message.type()))consoleMessages.push(message.text());});
  await page.getByRole('button',{name:'关闭窗口',exact:true}).waitFor();await page.reload();await page.evaluate(()=>{location.hash='#/scene';});
  await expect(page.getByRole('button',{name:'账号菜单'})).toContainText('我的');await page.evaluate(()=>{location.hash='#/profile?module=feedback';});
  await page.getByLabel('反馈标题').fill('Electron 原请求');await page.getByLabel('详细内容').fill('实际 IPC 白名单与跨进程错误恢复');await page.getByRole('button',{name:'提交反馈',exact:true}).click();
  await expect(page.getByRole('button',{name:'核对并重试',exact:true})).toBeEnabled();
  for(const [width,height] of [[1440,900],[1280,720],[1080,640]]){
    await app.evaluate(({BrowserWindow},size)=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setSize(...size);},[width,height]);
    await page.getByRole('button',{name:'核对并重试',exact:true}).scrollIntoViewIfNeeded();
    await page.screenshot({path:join(evidence,`feedback-${width}.png`),animations:'disabled'});
  }
  await page.getByRole('button',{name:'核对并重试',exact:true}).click();await expect(page.getByText('反馈已提交。',{exact:true})).toBeVisible();await expect(page.getByLabel('反馈标题')).toHaveValue('');
  expect(await app.evaluate(()=>globalThis.createFixture.calls.length)).toBe(1);expect(errors).toEqual([]);
  expect(consoleMessages.filter(line=>!line.includes('503'))).toEqual([]);
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,errors,consoleMessages,viewports:[1440,1280,1080],backend:'in-process HTTPS fixture, not real TLS/MySQL/Redis'},null,2));console.log(JSON.stringify({passed:true,evidence,errors}));
}catch(error){if(app){const page=await app.firstWindow();await page.screenshot({path:join(evidence,'failure.png')});console.log(JSON.stringify({evidence,url:page.url(),text:await page.locator('body').innerText()}));}throw error;}finally{await app?.close();}
