import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';

const root=resolve(import.meta.dirname,'../..'),evidence=await mkdtemp(join(tmpdir(),'studyroom-electron-message-delete-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const id='2104509220480131074',next='2104509220480131075';let app;const errors=[];
try{
  app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[join(root,'desktop'),`--user-data-dir=${join(evidence,'isolated-user')}`,'--host-resolver-rules=MAP * ~NOTFOUND'],env,timeout:30000});
  await app.evaluate(({session},{id,next})=>{
    const hidden=new Set(),calls=[];globalThis.deletionFixture={hidden,calls};
    session.fromPartition('persist:studyroom-cloud-v1').protocol.handle('https',request=>{
      const url=new URL(request.url),path=url.pathname;let data=[];
      if(path.endsWith('/auth/me'))data={id:'2104509220480131073',username:'fixture',nickname:'隔离测试',userType:'NORMAL'};
      else if(path.endsWith('/auth/csrf'))data={token:'test-token'};
      else if(path.endsWith('/chat/capabilities'))data={privateMessageDeletion:true,reliableText:true,bidirectionalHistory:true,boundedRead:true};
      else if(path.endsWith('/chat/conversations'))data={items:[],nextCursor:null};
      else if(path.endsWith('/chat/online-users'))data=[{id:'2104509220480131074',nickname:'成员 A'},{id:'2104509220480131075',nickname:'成员 B'}];
      else if(path.endsWith('/messages/visibility'))data={visibleIds:(url.searchParams.get('ids')||'').split(',').filter(id=>!hidden.has(id))};
      else if(path.endsWith('/private/2104509220480131074/messages'))data=[{id,content:'待删除的私信'},{id:next,content:'相邻 ID 仍然保留'}].filter(item=>!hidden.has(item.id)).map(item=>({...item,senderId:'2104509220480131074',receiverId:'2104509220480131073',messageType:'TEXT',channelType:'PRIVATE',senderName:'成员 A',mine:false}));
      else if(path.includes('/private/messages/')&&request.method==='DELETE'){const target=path.split('/').at(-1);hidden.add(target);calls.push(target);data={messageId:target,status:'deleted'};}
      return new Response(JSON.stringify({success:true,data}),{headers:{'content-type':'application/json'}});
    });
  },{id,next});
  const page=await app.firstWindow();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'关闭窗口',exact:true}).waitFor();await page.reload();
  await page.evaluate(()=>{location.hash='#/scene';});
  await expect(page.getByRole('button',{name:'账号菜单'})).toContainText('我的');
  await page.evaluate(()=>{location.hash='#/chat';});
  await page.getByRole('button',{name:/成员 A/}).click();await expect(page.getByText('待删除的私信',{exact:true})).toBeVisible();
  for(const [width,height] of [[1440,900],[1280,720],[1080,640]]){
    await app.evaluate(({BrowserWindow},size)=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setSize(...size);},[width,height]);
    await page.locator(`[data-message-id="${id}"]`).getByRole('button',{name:'删除这条记录'}).click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
    await page.screenshot({path:join(evidence,`delete-${width}.png`),animations:'disabled'});await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  }
  await page.locator(`[data-message-id="${id}"]`).getByRole('button',{name:'删除这条记录'}).click();await page.getByRole('button',{name:'确认删除',exact:true}).click();
  await expect(page.getByRole('dialog')).toBeHidden();await expect(page.locator(`[data-message-id="${id}"]`)).toHaveCount(0);await expect(page.locator(`[data-message-id="${next}"]`)).toHaveCount(1);
  expect(await app.evaluate(()=>globalThis.deletionFixture.calls)).toEqual([id]);expect(errors).toEqual([]);
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,errors,viewports:[1440,1280,1080],backend:'in-process HTTPS fixture, not real TLS/MySQL/Redis'},null,2));console.log(JSON.stringify({passed:true,evidence,errors}));
}catch(error){if(app){const page=await app.firstWindow();await page.screenshot({path:join(evidence,'failure.png')});console.log(JSON.stringify({evidence,url:page.url(),auth:await page.evaluate(async()=>{try{return await window.studyRoomDesktop.cloud.request({method:'GET',path:'/auth/me'});}catch(e){return String(e);}}),text:await page.locator('body').innerText()}));}throw error;}finally{await app?.close();}
