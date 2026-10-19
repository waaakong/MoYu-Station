import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root=resolve(import.meta.dirname,'../..');
const evidence=await mkdtemp(join(tmpdir(),'moyu-focus-controls-'));
const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE;
const errors=[], results=[];
let app;
try {
  app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[join(root,'desktop'),`--user-data-dir=${join(evidence,'isolated-user')}`],env});
  await app.evaluate(({session})=>{
    for(const s of [session.defaultSession,session.fromPartition('persist:studyroom-cloud-v1')]) s.webRequest.onBeforeRequest({urls:['https://*/*','http://*/*']},(_request,done)=>done({cancel:true}));
  });
  const page=await app.firstWindow(); page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.getByRole('button',{name:'关闭窗口',exact:true}).waitFor();
  const shot=async(name)=>{
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:join(evidence,`${name}.png`),animations:'disabled'});
  };
  for(const [width,height,playerWidth] of [[1440,900,0],[1280,720,0],[1080,640,0],[1080,900,788]]) {
    const label=`${width}-${playerWidth || 'normal'}`;
    await app.evaluate(({BrowserWindow},{width,height})=>{
      const win=BrowserWindow.getAllWindows()[0]; win.unmaximize(); win.setSize(width,height);
    },{width,height});
    await page.evaluate(()=>{location.hash='#/scene';});
    await expect(page.locator('.quick-focus')).toBeVisible();
    const combobox=await page.locator('.quick-focus').getByRole('combobox').boundingBox();
    const action=await page.locator('.quick-focus__action').boundingBox();
    expect(Math.abs(combobox.y-action.y)).toBeLessThan(1);
    expect(Math.abs(combobox.height-action.height)).toBeLessThan(1);
    await page.getByRole('group',{name:'场景时段',exact:true}).getByRole('button',{name:'上午',exact:true}).click();
    await expect(page.getByRole('group',{name:'场景时段',exact:true}).getByRole('button',{name:'上午',exact:true})).toHaveAttribute('aria-pressed','true');
    await shot(`space-${label}`);
    await page.getByRole('navigation',{name:'快捷入口'}).getByRole('link',{name:'专注',exact:true}).click();
    await expect(page.locator('.minute-stepper')).toBeVisible();
    if(playerWidth) await page.getByRole('region',{name:'专注控制条'}).evaluate((el,width)=>{el.style.width=`${width}px`;},playerWidth);
    const input=page.getByRole('spinbutton',{name:'自定义专注分钟'});
    await input.fill('35');
    const plus=page.getByRole('button',{name:'增加一分钟',exact:true});
    const minus=page.getByRole('button',{name:'减少一分钟',exact:true});
    const hit=await plus.evaluate(button=>{const box=button.getBoundingClientRect(),target=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);return button===target||button.contains(target);});
    expect(hit).toBe(true);
    await plus.click();
    await expect(input).toHaveValue('36');
    await minus.click();
    await expect(input).toHaveValue('35');
    const scene=await page.locator('.player__scene-group').boundingBox();
    const audio=await page.locator('.player__audio-group').boundingBox();
    const player=await page.getByRole('region',{name:'专注控制条'}).boundingBox();
    if(playerWidth) {
      expect(audio.y).toBeGreaterThanOrEqual(scene.y+scene.height);
      for(const group of [scene,audio]) expect(Math.abs(group.x+group.width/2-player.x-player.width/2)).toBeLessThan(1);
    } else expect(Math.abs(audio.y-scene.y)).toBeLessThan(1);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await shot(`focus-${label}`);
    results.push({width,height,playerWidth,scene,audio,player,hit,pointerTested:true});
  }
  expect(errors).toEqual([]);
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,results,errors,scope:'Isolated Electron. Three normal windows plus a 788px component constraint; not software zoom, physical HiDPI or multi-display verification.'},null,2));
  console.log(JSON.stringify({passed:true,evidence,screenshots:8}));
} catch(error) {
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:false,results,errors,error:String(error)},null,2));
  console.error(JSON.stringify({passed:false,evidence,error:String(error)})); process.exitCode=1;
} finally { await app?.close().catch(()=>{}); }
