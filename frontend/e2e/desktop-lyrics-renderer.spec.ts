import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
test('real lyric renderer slides adjacent rows, cancels seeks and uses only supplied word times',async({page},info)=>{
  await page.route('**/lyric-fixture/*',async route=>{const name=new URL(route.request().url()).pathname.split('/').pop()!;if(!['lyrics.html','lyrics.js','lyrics.css'].includes(name))return route.abort();return route.fulfill({body:await readFile(resolve('../desktop/src/renderer',name)),contentType:name.endsWith('html')?'text/html':name.endsWith('css')?'text/css':'application/javascript'});});
  await page.addInitScript(()=>{(window as any).lyricActions=[];(window as any).moyuLyrics={onFrame:(listener:any)=>{(window as any).acceptLyricFrame=listener;},action:async(action:string)=>{(window as any).lyricActions.push(action);}};});
  await page.goto('/lyric-fixture/lyrics.html');
  const base={title:'Synthetic',line:'第一句',nextLine:'第二句',status:'已暂停',trackKey:'synthetic:1',lineKey:'synthetic:1:0',positionMs:1500,playing:false,locked:false,style:{fontSize:38,highlight:'#deefaa',rows:2}};
  await page.evaluate(frame=>(window as any).acceptLyricFrame(frame),base);await expect(page.locator('#line')).toHaveText('第一句');
  await expect(page.locator('#status')).toBeHidden();
  await page.evaluate(frame=>(window as any).acceptLyricFrame({...frame,playing:true,status:'播放中'}),base);
  await expect(page.locator('#status')).toBeHidden();
  await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeAttached();
  await page.evaluate(frame=>(window as any).acceptLyricFrame(frame),base);
  const count=await page.evaluate(frame=>{(window as any).acceptLyricFrame({...frame,playing:true,line:'第二句',nextLine:'第三句',lineKey:'synthetic:1:1'});return document.getAnimations().length;},base);expect(count).toBeGreaterThanOrEqual(3);
  const afterSeek=await page.evaluate(frame=>{(window as any).acceptLyricFrame({...frame,jump:true});return document.getAnimations().filter(a=>a.playState==='running').length;},base);expect(afterSeek).toBe(0);
  await page.evaluate(frame=>(window as any).acceptLyricFrame({...frame,line:'你好',words:[{text:'你',timeMs:1000,endMs:2000},{text:'好',timeMs:2000}]}),base);
  expect(await page.locator('.ink').first().getAttribute('style')).toContain('50%');
  await page.locator('#surface').hover();
  await page.getByRole('button',{name:'播放',exact:true}).click();expect(await page.evaluate(()=>(window as any).lyricActions)).toEqual(['play-pause']);
  await page.emulateMedia({reducedMotion:'reduce'});expect(await page.evaluate(frame=>{(window as any).acceptLyricFrame({...frame,lineKey:'synthetic:1:2',line:'第三句'});return document.getAnimations().filter(a=>a.playState==='running').length;},base)).toBe(0);
  await page.screenshot({path:info.outputPath('desktop-lyrics-renderer.png')});
});

for(const scale of [1,1.25,1.5])test(`lyric toolbar icons and close target stay centered at ${scale}x`,async({browser},info)=>{
  const page=await browser.newPage({viewport:{width:920,height:220},deviceScaleFactor:scale});
  try{
    await page.route('**/lyric-fixture/*',async route=>{const name=new URL(route.request().url()).pathname.split('/').pop()!;if(!['lyrics.html','lyrics.js','lyrics.css'].includes(name))return route.abort();return route.fulfill({body:await readFile(resolve('../desktop/src/renderer',name)),contentType:name.endsWith('html')?'text/html':name.endsWith('css')?'text/css':'application/javascript'});});
    await page.addInitScript(()=>{(window as any).lyricActions=[];(window as any).moyuLyrics={onFrame:()=>{},action:async(action:string)=>{(window as any).lyricActions.push(action);}};});
    await page.goto('/lyric-fixture/lyrics.html');await page.locator('#surface').hover();await expect(page.locator('header')).toHaveCSS('opacity','1');
    const geometry=await page.locator('nav button').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect(),s=button.querySelector('svg')!.getBoundingClientRect();return {width:r.width,height:r.height,dx:Math.abs(r.x+r.width/2-s.x-s.width/2),dy:Math.abs(r.y+r.height/2-s.y-s.height/2),left:r.x,right:r.right,top:r.y,bottom:r.bottom};}));
    expect(geometry).toHaveLength(6);for(let i=0;i<geometry.length;i++){const r=geometry[i];expect(r.width).toBe(28);expect(r.height).toBe(28);expect(r.dx).toBeLessThan(.1);expect(r.dy).toBeLessThan(.1);expect(r.top).toBeGreaterThanOrEqual(0);expect(r.bottom).toBeLessThanOrEqual(220);if(i)expect(r.left).toBeGreaterThan(geometry[i-1].right);}
    await page.screenshot({path:info.outputPath(`lyrics-toolbar-${scale}.png`)});
    await page.getByRole('button',{name:'关闭歌词窗口',exact:true}).click();expect(await page.evaluate(()=>(window as any).lyricActions)).toEqual(['close']);
  }finally{await page.close();}
});
