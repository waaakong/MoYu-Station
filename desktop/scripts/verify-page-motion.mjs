import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root=resolve(import.meta.dirname,'../..');
const evidence=await mkdtemp(join(tmpdir(),'moyu-page-motion-'));
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const errors=[],results=[];
let app;
try {
  app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[join(root,'desktop'),`--user-data-dir=${join(evidence,'isolated-user')}`],env});
  await app.evaluate(({session})=>{
    for(const s of [session.defaultSession,session.fromPartition('persist:studyroom-cloud-v1')])
      s.webRequest.onBeforeRequest({urls:['https://*/*','http://*/*']},(_request,done)=>done({cancel:true}));
  });
  const page=await app.firstWindow(); page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('button',{name:'关闭窗口',exact:true}).waitFor();
  await page.evaluate(()=>{location.hash='#/scene';});
  await expect(page.locator('#scene-title')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a.id==='sr-page-enter').length)).toBe(0);
  await page.evaluate(()=>{
    const animate=Element.prototype.animate;
    window.__motions=[];
    Element.prototype.animate=function(frames,options){
      const animation=animate.call(this,frames,options);
      if(Array.isArray(frames)&&(frames[0]?.opacity===.65 || frames[0]?.transform==='translateY(6px)')){
        const entry={animation,target:this,finished:false}; window.__motions.push(entry);
        if(window.__freezeMotion) animation.pause();
        void animation.finished.then(()=>{entry.finished=true;},()=>{});
      }
      return animation;
    };
  });
  const backdrop=await page.locator('.desktop-shell__backdrop').elementHandle();
  const player=await page.locator('.desktop-shell__player-slot').elementHandle();
  for(const [width,height] of [[1440,900],[1280,720],[1080,640]]){
    await app.evaluate(({BrowserWindow},{width,height})=>{const win=BrowserWindow.getAllWindows()[0];win.unmaximize();win.setSize(width,height);},{width,height});
    await page.getByRole('link',{name:'专注',exact:true}).click();
    await expect(page.locator('.focus-page')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>window.__motions.at(-1)?.finished)).toBe(true);
    await expect(page.locator('.focus-page')).toHaveCSS('transform','none');
    await expect(page.locator('.focus-page')).toHaveCSS('opacity','1');
    expect(await backdrop.evaluate(el=>el.isConnected)).toBe(true);
    expect(await player.evaluate(el=>el.isConnected)).toBe(true);
    await page.screenshot({path:join(evidence,`focus-settled-${width}.png`)});
    await page.evaluate(()=>{window.__freezeMotion=true;});
    await page.getByRole('link',{name:'场景',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.__motions.at(-1)?.animation.playState)).toBe('paused');
    await page.evaluate(()=>{window.__motions.at(-1).animation.currentTime=80;});
    await page.screenshot({path:join(evidence,`scene-midframe-${width}.png`)});
    const timing=await page.evaluate(()=>window.__motions.at(-1).animation.effect.getTiming());
    expect(timing.duration).toBe(220);
    await page.evaluate(()=>{window.__freezeMotion=false;window.__motions.at(-1).animation.play();});
    await expect.poll(()=>page.evaluate(()=>window.__motions.at(-1).finished)).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    results.push({width,height,duration:timing.duration,naturalCompletion:true,persistentShell:true});
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  const before=await page.evaluate(()=>window.__motions.length);
  await page.getByRole('link',{name:'声音',exact:true}).click();
  await expect(page.locator('.sound-page')).toBeVisible();
  expect(await page.evaluate(()=>window.__motions.length)).toBe(before);
  expect(errors).toEqual([]);
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,results,errors,reducedMotion:true,scope:'Isolated Electron candidate, no cloud access or installed client changes. Physical HiDPI, touch and low-end hardware not verified.'},null,2));
  console.log(JSON.stringify({passed:true,evidence,screenshots:6}));
} catch(error){
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:false,results,errors,error:String(error)},null,2));
  console.error(JSON.stringify({passed:false,evidence,error:String(error)}));process.exitCode=1;
} finally {await app?.close().catch(()=>{});}
