import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..'),evidence=await mkdtemp(join(tmpdir(),'moyu-selects-'));
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let app;const errors=[];
try{
  app=await electron.launch({executablePath:join(root,'node_modules/electron/dist/electron.exe'),args:[join(root,'desktop'),`--user-data-dir=${join(evidence,'isolated-user')}`],env,timeout:30000});
  await app.evaluate(({session})=>{for(const s of [session.defaultSession,session.fromPartition('persist:studyroom-cloud-v1')])s.webRequest.onBeforeRequest({urls:['https://*/*','http://*/*']},(_,done)=>done({cancel:true}));});
  const page=await app.firstWindow();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  async function capture(name){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:join(evidence,name),animations:'disabled',timeout:5000});}
  await page.getByRole('button',{name:'关闭窗口',exact:true}).waitFor();
  await page.evaluate(()=>{location.hash='#/scene';window.__selectEvents=[];for(const name of ['blur','focus','scroll','resize'])window.addEventListener(name,e=>{window.__selectEvents.push({name,target:e.target?.className,time:performance.now(),expanded:document.querySelector('[role=combobox]')?.getAttribute('aria-expanded')});},true);});
  for(const [width,height] of [[1440,900],[1280,720],[1080,640]]){
    await app.evaluate(({BrowserWindow},size)=>{const w=BrowserWindow.getAllWindows()[0];w.setSize(...size);w.show();w.focus();},[width,height]);
    const minutes=page.getByRole('combobox',{name:'分钟',exact:true});await minutes.click();await expect(page.getByRole('option',{name:'45',exact:true})).toBeVisible();
    await capture(`minutes-${width}.png`);await page.getByRole('option',{name:'45',exact:true}).click();await expect(minutes).toContainText('45');await expect(minutes).toHaveAttribute('aria-expanded','false');
    await page.getByRole('button',{name:'外观与性能',exact:true}).click();const preference=page.getByRole('combobox',{name:'关闭主窗口时',exact:true});
    await preference.click();await expect(page.getByRole('option',{name:'退出程序',exact:true})).toBeVisible();await capture(`preference-${width}.png`);
    await page.getByRole('option',{name:'退出程序',exact:true}).click();await expect.poll(async()=> (await page.evaluate(()=>window.studyRoomDesktop.readWindowState())).closeBehavior).toBe('quit');
    await preference.click();await page.getByRole('option',{name:'每次询问',exact:true}).click();await expect.poll(async()=> (await page.evaluate(()=>window.studyRoomDesktop.readWindowState())).closeBehavior).toBe('ask');
    await page.getByRole('button',{name:'关闭面板',exact:true}).focus();await page.keyboard.press('Shift+Tab');await expect(preference).toBeFocused();
    await page.keyboard.press('Escape');
  }
  expect(errors).toEqual([]);await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,evidence,errors,screenshots:6},null,2));console.log(JSON.stringify({passed:true,evidence}));
}catch(error){
  const page=app?.windows()[0];const diagnostic=await page?.evaluate(()=>({events:window.__selectEvents,focus:document.hasFocus(),controls:[...document.querySelectorAll('[role=combobox]')].map(e=>e.outerHTML),menus:[...document.querySelectorAll('[role=listbox]')].map(e=>({text:e.textContent,open:e.matches(':popover-open'),box:e.getBoundingClientRect().toJSON()}))})).catch(()=>null);
  await page?.screenshot({path:join(evidence,'failure.png'),timeout:5000}).catch(()=>{});await writeFile(join(evidence,'result.json'),JSON.stringify({passed:false,evidence,error:String(error),errors,diagnostic},null,2));console.error(evidence,error);process.exitCode=1;
}finally{await app?.close().catch(()=>{});}
