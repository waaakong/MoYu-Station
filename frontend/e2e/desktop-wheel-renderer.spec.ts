import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import sharp from 'sharp';

test('native wheel renders approved translucent sectors and handles fresh, stale and malformed frames',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:480,height:480});await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('**/wheel-fixture/*',async route=>{
    const name=new URL(route.request().url()).pathname.split('/').pop()!;
    if(!['wheel.html','wheel.js','wheel.css','gsap.min.js'].includes(name))return route.abort();
    const file=name==='gsap.min.js'?resolve('../node_modules/gsap/dist/gsap.min.js'):resolve('../desktop/src/renderer',name);
    return route.fulfill({body:await readFile(file),contentType:name.endsWith('html')?'text/html':name.endsWith('css')?'text/css':'application/javascript'});
  });
  await page.addInitScript(()=>{(window as any).moyuWheel={onFrame:(cb:any)=>{(window as any).wheelFrame=cb;return()=>{(window as any).wheelDisposed=true;};}};});
  await page.goto('/wheel-fixture/wheel.html');
  const slots=['play-pause','next','focus','sound','space','lyrics','mute','previous'];
  const send=async(sequence:number,selected:number,commands=slots)=>page.evaluate(frame=>(window as any).wheelFrame(frame),{sequence,selected,slots:commands});
  await send(1,-1);
  await expect(page.locator('.sector-base')).toHaveCount(8);await expect(page.locator('.sector-hot')).toHaveCount(8);
  await expect(page.locator('#center strong')).toHaveText('移向操作');
  for(let i=0;i<8;i++){
    await send(1,i);await expect(page.locator(`#command-${i}`)).toHaveClass(/hot/);
    expect(await page.locator('.sector-hot').evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).opacity==='1').length)).toBe(1);
  }
  // Snapshot of the actual SVG: sample an icon-free radial segment. The
  // approved ring must really fade to alpha zero, not cover a solid disc.
  const shot=await page.screenshot({omitBackground:true,style:'#wheel{filter:none!important}'});
  const {data,info:png}=await sharp(shot).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const pixels=[100,160,210,230].map(r=>{const a=-70*Math.PI/180,x=Math.round(240+Math.cos(a)*r),y=Math.round(240+Math.sin(a)*r);return data[(y*png.width+x)*4+3];});
  expect(pixels[0]).toBeGreaterThan(pixels[1]);expect(pixels[1]).toBeGreaterThan(pixels[2]);expect(pixels[3]).toBe(0);
  await send(2,1,[...slots].reverse());await expect(page.locator('#center strong')).toHaveText('音乐静音');
  await send(1,0);await expect(page.locator('#wheel')).toHaveAttribute('data-sequence','2');
  await send(3,0,Array(8).fill('next'));await expect(page.locator('#wheel')).toHaveAttribute('data-sequence','2');
  await send(3,-1);await expect(page.locator('#center strong')).toHaveText('移向操作');
  await page.screenshot({path:info.outputPath('native-wheel-gradient.png'),omitBackground:true});
  await page.emulateMedia({reducedMotion:'no-preference'});await send(4,2);
  expect(await page.evaluate(()=>(window as any).gsap.getTweensOf(document.querySelector('#wheel')).length)).toBe(1);
  await page.evaluate(()=>{(window as any).gsap.getTweensOf(document.querySelector('#wheel'))[0].totalProgress(1);});
  await send(4,3);
  expect(await page.evaluate(()=>(window as any).gsap.getTweensOf(document.querySelector('#wheel')).length)).toBe(0);
  await page.emulateMedia({reducedMotion:'reduce'});await send(5,-1);
  expect(await page.evaluate(()=>(window as any).gsap.getTweensOf(document.querySelector('#wheel')).length)).toBe(0);
  expect(errors).toEqual([]);
});

test('shared native fixture loads the local animation asset and forwards wheel frames',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/e2e/fixtures/native-music.html');
  const wheel=page.frameLocator('#wheel');
  await expect(wheel.locator('.sector-base')).toHaveCount(8);
  await page.locator('#selection').click();
  await expect(wheel.locator('#center strong')).toHaveText('播放／暂停');
  await expect(wheel.locator('#wheel')).toHaveAttribute('data-sequence','1');
  expect(errors).toEqual([]);
});
