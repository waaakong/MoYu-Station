import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..'),evidence=await mkdtemp(join(tmpdir(),'studyroom-electron-study-card-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;let app;const errors=[];
try{
  app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[join(root,'desktop'),`--user-data-dir=${join(evidence,'isolated-user')}`,'--host-resolver-rules=MAP * ~NOTFOUND'],env,timeout:30000});
  await app.evaluate(({session})=>{
    session.fromPartition('persist:studyroom-cloud-v1').protocol.handle('https',request=>{
      const path=new URL(request.url).pathname;let data=[];
      if(path.endsWith('/auth/me')||path.endsWith('/profile/me'))data={id:2,username:'fixture',nickname:'山间读者',userType:'NORMAL'};
      else if(path.endsWith('/profile/stats'))data={todayFocusMinutes:35,fishMinutes:0,favoriteScene:'高山湖泊'};
      else if(path.endsWith('/profile/share-card'))data={statDate:'2026-09-28',timeZone:'Asia/Shanghai',focusMinutes:35,fishMinutes:0,fakeEffortIndex:12.5,favoriteScene:'高山湖泊'};
      return new Response(JSON.stringify({success:true,data}),{headers:{'content-type':'application/json'}});
    });
  });
  const page=await app.firstWindow();page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'关闭窗口',exact:true}).waitFor();await page.reload();await page.evaluate(()=>{location.hash='#/scene';});await expect(page.getByRole('button',{name:'账号菜单'})).toContainText('我的');
  await page.evaluate(()=>{location.hash='#/profile?module=stats';});await page.getByRole('button',{name:'预览学习卡片'}).click();const dialog=page.getByRole('dialog',{name:'学习卡片'});await expect(dialog.getByRole('status')).toContainText('预览与 PNG 内容一致');
  for(const [width,height]of [[1440,900],[1280,720],[1080,640]]){
    await app.evaluate(({BrowserWindow},size)=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setSize(...size);},[width,height]);
    await expect(dialog.getByRole('button',{name:'保存 PNG'})).toBeInViewport();await page.screenshot({path:join(evidence,`card-${width}.png`),animations:'disabled'});
  }
  const target=join(evidence,'actual-card.png');
  await app.evaluate(({BrowserWindow},target)=>{
    globalThis.studyCardSaved='waiting';
    BrowserWindow.getAllWindows()[0].webContents.session.once('will-download',(_event,item)=>{
      // Test-only save destination; does not change installed-client preferences or native security.
      item.setSavePath(target);item.once('done',(_event,state)=>{globalThis.studyCardSaved=state;});
    });
  },target);
  const encoded=await dialog.locator('canvas').evaluate(canvas=>canvas.toDataURL('image/png').split(',')[1]);
  await dialog.getByRole('button',{name:'保存 PNG',exact:true}).click();await expect.poll(()=>app.evaluate(()=>globalThis.studyCardSaved)).toBe('completed');
  const bytes=await readFile(target),sha=createHash('sha256').update(bytes).digest('hex');expect(bytes.readUInt32BE(16)).toBe(1200);expect(bytes.readUInt32BE(20)).toBe(675);expect(sha).toBe(createHash('sha256').update(Buffer.from(encoded,'base64')).digest('hex'));
  await page.keyboard.press('Escape');await expect(dialog).toBeHidden();expect(errors).toEqual([]);
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,evidence,sha256:sha,errors,backend:'isolated HTTPS protocol fixture; test-controlled download path, not a native save-dialog acceptance'},null,2));console.log(JSON.stringify({passed:true,evidence,sha256:sha,errors}));
}finally{await app?.close();}
