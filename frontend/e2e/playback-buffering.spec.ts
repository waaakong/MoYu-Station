import { expect, test } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';

test('real Chromium media exhausts a controlled stream, reports timeout and only resumes on retry', async ({page}, info) => {
  test.setTimeout(65000);
  // Real HTTP bytes / native media events; controlled transport, NOT a platform outage.
  const wav=await readFile(new URL('../src/assets/audio/ambient/waves.ogg',import.meta.url));
  let recovered=false,requests=0;const ranges:string[]=[],logs:string[]=[];
  page.on('console',m=>{if(m.type()==='error')logs.push(m.text())});
  const server=createServer((req,res)=>{
    requests++;ranges.push(req.headers.range||'none');res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','audio/ogg');res.setHeader('Accept-Ranges','bytes');
    const match=/bytes=(\d+)-(\d*)/.exec(req.headers.range||'');
    const start=match?Number(match[1]):0,end=match?.[2]?Math.min(Number(match[2]),wav.length-1):wav.length-1;
    res.statusCode=match?206:200;if(match)res.setHeader('Content-Range',`bytes ${start}-${end}/${wav.length}`);
    res.setHeader('Content-Length',end-start+1);
    // Chromium probes the final Ogg page for duration before starting. Allow that
    // metadata probe while leaving a large unbuffered middle region.
    if(recovered || start>=wav.length-131072){res.end(wav.subarray(start,end+1));return;}
    // Ogg supports incremental decoding; the previous PCM fixture stayed at initial load.
    if(start<262144)res.write(wav.subarray(start,Math.min(end+1,262144)));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const port=(server.address() as {port:number}).port;
  try {
    await page.route('**/api/**',route=>route.fulfill({json:{success:true,data:null}}));
    await page.goto('/sound');await page.getByRole('button',{name:'听歌舞台',exact:true}).waitFor();
    await page.evaluate(async url=>{
      const pp='/src/stores/player.ts',qp='/src/stores/queue.ts';const{usePlayerStore}=await import(pp),{useQueueStore}=await import(qp);
      const item={id:'real-buffer',queuedAt:1,track:{id:'real-buffer',title:'受控流缓冲测试',artist:'隔离 HTTP 音频',source:{kind:'builtin',assetId:url}}};
      const p=usePlayerStore();await useQueueStore().replace([item]);await p.load(item);
      Object.assign(window,{bufferQA:p});
    },`http://127.0.0.1:${port}/stream.ogg`);
    const player=page.locator('footer.player');await player.getByRole('button',{name:'播放',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).bufferQA.playback.positionMs),{timeout:15000}).toBeGreaterThan(1000);
    await expect(player.getByText('正在缓冲 · 可点击暂停',{exact:true})).toBeVisible({timeout:15000});
    await expect(player.getByText('音源无法播放 · 点击查看原因',{exact:true})).toBeVisible({timeout:20000});
    const failed=await page.evaluate(()=>{const p=(window as any).bufferQA;return{code:p.playback.errorCode,position:p.playback.positionMs,wantsPlayback:p.wantsPlayback,status:p.playback.status}});
    expect(failed.code).toBe('MEDIA_BUFFER_TIMEOUT');expect(failed.position).toBeGreaterThan(1000);expect(failed.wantsPlayback).toBe(false);
    await player.getByRole('button',{name:'展开播放器',exact:true}).click();
    await page.screenshot({path:info.outputPath('actual-buffer-timeout.png'),animations:'disabled'});
    const requestCount=requests;recovered=true;await page.waitForTimeout(1200);
    expect(requests).toBe(requestCount);expect(await page.evaluate(()=>(window as any).bufferQA.playback.status)).toBe('error');
    await player.getByRole('button',{name:'重试',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).bufferQA.playback.status)).toBe('playing');
    await expect.poll(()=>page.evaluate(()=>(window as any).bufferQA.playback.positionMs)).toBeGreaterThan(failed.position+500);
    await player.getByRole('button',{name:'暂停',exact:true}).click();
    await page.evaluate(()=>{(window as any).bufferQA.clear();delete (window as any).bufferQA});
  } finally {
    await writeFile(info.outputPath('controlled-stream.json'),JSON.stringify({requests,ranges,logs,state:await page.evaluate(()=>{const p=(window as any).bufferQA;return p?{status:p.playback.status,error:p.playback.errorCode,position:p.playback.positionMs,buffering:p.buffering}:null}).catch(()=>null)},null,2));
    server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));
  }
});
