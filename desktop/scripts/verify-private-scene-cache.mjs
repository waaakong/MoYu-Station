import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';

const root=resolve(import.meta.dirname,'../..');
const evidence=await mkdtemp(join(tmpdir(),'studyroom-electron-scene-cache-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const id='11111111-1111-4111-8111-111111111111';
const png=await sharp({create:{width:600,height:1000,channels:4,background:'#557766'}}).png().toBuffer();
const picture={assetId:id,fit:'contain',focalX:.5,focalY:.5,zoom:1,dim:.2};
const snapshot={version:4,deleted:false,config:{name:'桌面隔离窗景',defaultImage:picture,periods:{}},media:[{assetId:id,width:600,height:1000,bytes:20000,clearUrl:`/api/media/assets/${id}/clear`,displayUrl:`/api/media/assets/${id}/display`,thumbUrl:`/api/media/assets/${id}/thumb`}]};
let app;const errors=[];
try{
  // DNS is blocked from process startup. All HTTPS below is an in-process fixture, not production or TLS acceptance.
  app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[join(root,'desktop'),`--user-data-dir=${join(evidence,'isolated-user')}`,'--host-resolver-rules=MAP * ~NOTFOUND'],env,timeout:30000});
  await app.evaluate(({session},data)=>{
    const cloud=session.fromPartition('persist:studyroom-cloud-v1');
    globalThis.sceneCacheOffline=false;
    cloud.protocol.handle('https',request=>{
      if(globalThis.sceneCacheOffline)return new Response(null,{status:503});
      const path=new URL(request.url).pathname;
      if(path.startsWith('/api/media/assets/'))return new Response(Buffer.from(data.png,'base64'),{headers:{'content-type':'image/png'}});
      const result=path.endsWith('/auth/me')?{id:'2104509220480131074',username:'fixture',nickname:'隔离测试',userType:'NORMAL'}:path.endsWith('/media/capabilities')?{scene:true}:path.endsWith('/scenes/custom')?data.snapshot:[];
      return new Response(JSON.stringify({success:true,data:result}),{headers:{'content-type':'application/json'}});
    });
  },{snapshot,png:png.toString('base64')});
  const page=await app.firstWindow();page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'关闭窗口',exact:true}).waitFor();
  await page.reload();await page.evaluate(()=>{location.hash='#/scene';});
  await expect(page.getByLabel('使用私人场景')).toBeVisible();await page.getByLabel('使用私人场景').check();
  await expect(page.locator('.private-background .image')).toHaveAttribute('src',/^blob:/);
  const directory=await app.evaluate(({app})=>app.getPath('userData'));
  const file=join(directory,'private-scene-cache','2104509220480131074','record.json');
  expect(JSON.parse(await readFile(file,'utf8')).snapshot.version).toBe(4);
  expect(await page.evaluate(async()=>{try{await window.studyRoomDesktop.cloud.sceneCache({action:'read',owner:'2104509220480131075'});return false;}catch{return true;}})).toBe(true);
  await app.evaluate(()=>{globalThis.sceneCacheOffline=true;});
  for(const [width,height] of [[1440,900],[1280,720],[1080,640]]){
    await app.evaluate(({BrowserWindow},size)=>{const window=BrowserWindow.getAllWindows()[0];window.unmaximize();window.setSize(...size);},[width,height]);
    await expect.poll(()=>page.locator('.private-background .image').evaluate(image=>image.naturalHeight)).toBe(1000);
    await page.screenshot({path:join(evidence,`offline-${width}.png`),animations:'disabled'});
  }
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('studyroom:session-ended',{detail:{code:'AUTH_SESSION_EXPIRED'}})));
  await expect(page.locator('[data-private-scene]')).toHaveCount(0);
  await expect.poll(async()=>{try{await readFile(file);return false;}catch(error){return error.code==='ENOENT';}}).toBe(true);
  expect(errors).toEqual([]);
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,errors,viewports:[1440,1280,1080],backend:'in-process HTTPS fixture; not real TLS/Redis/MySQL'},null,2));
  console.log(JSON.stringify({passed:true,evidence,errors}));
}finally{await app?.close();}
