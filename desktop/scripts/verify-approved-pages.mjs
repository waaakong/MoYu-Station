import { _electron as electron, expect } from '@playwright/test';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const evidence = await mkdtemp(join(tmpdir(), 'moyu-approved-pages-'));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const results = [], errors = [], diagnostics = [];
let phase = 'launch';
let app;
try {
  app = await electron.launch({ executablePath:join(root,'node_modules/electron/dist/electron.exe'), args:[join(root,'desktop'),`--user-data-dir=${join(evidence,'isolated-user')}`], env, timeout:30000 });
  app.process().stderr?.on('data', chunk => diagnostics.push(String(chunk)));
  app.process().stdout?.on('data', chunk => diagnostics.push(String(chunk)));
  phase = 'first-window';
  const page = await app.firstWindow(); page.setDefaultTimeout(10000);
  phase = 'network-isolation';
  await app.evaluate(({ session }) => {
    for (const s of [session.defaultSession,session.fromPartition('persist:studyroom-cloud-v1')]) s.webRequest.onBeforeRequest({urls:['https://*/*','http://*/*']},(_request,callback)=>callback({cancel:true}));
  });
  page.on('pageerror',error=>errors.push(error.message));
  await page.getByRole('button',{name:'关闭窗口',exact:true}).waitFor();
  await page.emulateMedia({reducedMotion:'reduce'});
  async function capture(name,width,height) {
    // Local cover decoding can lag route visibility; don't record an unfinished frame.
    await page.locator('.tool-card img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(page.getByRole('button',{name:'关闭窗口',exact:true})).toBeVisible();
    const accessible = await page.getByRole('button',{name:'关闭窗口',exact:true}).evaluate(button=>{
      const b=button.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);
      return {hit:button===hit||button.contains(hit),y:b.y,bottom:b.bottom};
    });
    expect(accessible.hit,`${name}: close control must not be covered`).toBe(true);
    expect(accessible.y).toBeGreaterThanOrEqual(0);
    expect(accessible.bottom).toBeLessThanOrEqual(64);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (await page.locator('.desktop-shell').count()) {
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      expect(await page.locator('.desktop-shell__backdrop').boundingBox()).toEqual({x:0,y:0,...viewport});
      await expect(page.locator('.app-chrome')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
      await expect(page.locator('.desktop-shell__player-slot')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
      await expect(page.locator('.scene-background')).toHaveCount(1);
    }
    await page.screenshot({path:join(evidence,`${name}-${width}.png`),animations:'disabled',timeout:10000});
    results.push({name,width,height});
  }
  for (const [width,height] of [[1440,900],[1280,720],[1080,640]]) {
    phase = `size-${width}`;
    await app.evaluate(({BrowserWindow},size)=>{const w=BrowserWindow.getAllWindows()[0];w.unmaximize();w.setSize(...size);},[width,height]);
    for (const [name,path,selector] of [['space','scene','#scene-title'],['focus','focus','[data-focus-lock]'],['sound','sound','.sound-page'],['profile','profile','.profile-panel'],['relax','entertainment','.hub-shell'],['login','login','input[type=text]'],['register','register','input[type=text]']]) {
      phase = `${name}-${width}`;
      await page.evaluate(path=>{location.hash=`#/${path}`;},path);
      await expect(page.locator(selector).first()).toBeVisible(); await capture(name,width,height);
      if (path==='space' || path==='scene') {
        await page.getByRole('button',{name:'外观与性能',exact:true}).click();
        await page.getByRole('checkbox',{name:/沉浸模式/}).check();
        await page.getByRole('button',{name:'关闭面板',exact:true}).click();
        await expect(page.locator('.window-chrome--floating')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
        await expect(page.getByRole('button',{name:'关闭窗口',exact:true})).toBeVisible();
        await capture('immersive',width,height);
        await page.getByRole('button',{name:'退出沉浸模式',exact:true}).click();
      }
      if (path==='sound') { await page.getByRole('button',{name:'听歌舞台',exact:true}).click(); await expect(page.getByRole('region',{name:'完整音乐视觉模式'})).toBeVisible(); await capture('listening-stage',width,height); }
      if (path==='entertainment') {
        for (const label of ['扫雷','蜘蛛纸牌']) {
          await page.getByRole('region',{name:'放松工具'}).getByRole('button',{name:new RegExp(label)}).click();
          await expect(page.locator('.board-viewport')).toBeVisible();
          await expect.poll(()=>page.locator('.board-viewport').evaluate(view=>{const outer=view.getBoundingClientRect();return [...view.querySelectorAll('.playing-card,.mines-grid button')].every(item=>{const b=item.getBoundingClientRect();return b.left>=outer.left-1&&b.right<=outer.right+1&&b.top>=outer.top-1&&b.bottom<=outer.bottom+1;});})).toBe(true);
          await capture(label==='扫雷'?'mines':'spider',width,height);
          await page.getByRole('button',{name:'返回',exact:true}).click();
        }
      }
    }
  }
  expect(errors).toEqual([]);
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:true,evidence,results,errors,scope:'Real Electron, isolated local data, blocked cloud; no physical Snap/HiDPI or installer verification.'},null,2));
  console.log(JSON.stringify({passed:true,evidence,screenshots:results.length,errors}));
} catch(error) {
  await writeFile(join(evidence,'result.json'),JSON.stringify({passed:false,evidence,phase,results,errors,error:String(error),diagnostics},null,2));
  console.error(JSON.stringify({passed:false,evidence,phase,error:String(error),diagnostics})); process.exitCode=1;
} finally { await app?.close().catch(()=>{}); }
