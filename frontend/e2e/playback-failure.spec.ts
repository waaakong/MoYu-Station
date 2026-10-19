import { expect, test } from '@playwright/test';

for (const viewport of [{width:1440,height:900},{width:1080,height:640},{width:390,height:844}]) {
  test(`playback reasons stay visible and a user retry recovers ${viewport.width}`, async ({page}, info) => {
    await page.setViewportSize(viewport);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/**',route=>route.fulfill({json:{success:true,data:null}}));
    await page.goto('/sound');
    await page.getByRole('button',{name:'听歌舞台',exact:true}).waitFor();
    await page.evaluate(async()=>{
      const playerPath='/src/stores/player.ts',queuePath='/src/stores/queue.ts';
      const {usePlayerStore}=await import(playerPath),{useQueueStore}=await import(queuePath);
      const rate=8000,count=rate*30,buffer=new ArrayBuffer(44+count*2),v=new DataView(buffer);
      const text=(offset:number,s:string)=>[...s].forEach((c,i)=>v.setUint8(offset+i,c.charCodeAt(0)));
      text(0,'RIFF');v.setUint32(4,36+count*2,true);text(8,'WAVE');text(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);text(36,'data');v.setUint32(40,count*2,true);
      const url=URL.createObjectURL(new Blob([buffer],{type:'audio/wav'}));
      const item={id:'failure-e2e',queuedAt:1,track:{id:'failure-e2e',title:'隔离播放测试',artist:'本地测试音频',source:{kind:'builtin',assetId:url}}};
      const p=usePlayerStore();await useQueueStore().replace([item]);await p.load(item,3000);
      p.failPlayback('MEDIA_BUFFER_TIMEOUT');Object.assign(window,{failureQA:{p,url}});
    });
    const player=page.locator('footer.player');
    await expect(player.getByText('音源无法播放 · 点击查看原因',{exact:true})).toBeVisible();
    await player.getByRole('button',{name:'展开播放器',exact:true}).click();
    await expect(player.locator('.player__error')).toContainText('音频持续 15 秒无法继续缓冲');
    expect(await player.locator('.player__error').boundingBox()).toBeTruthy();
    const bounds=await player.locator('.player__error').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(viewport.width);
    await page.screenshot({path:info.outputPath('buffer-error.png'),animations:'disabled'});
    await player.getByRole('button',{name:'重试',exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>(window as any).failureQA.p.playback.status)).toBe('playing');
    await expect(player.locator('.player__error')).toHaveCount(0);
    await expect.poll(()=>page.evaluate(()=>(window as any).failureQA.p.playback.positionMs)).toBeGreaterThan(3000);
    await player.getByRole('button',{name:'暂停',exact:true}).click();
    await page.evaluate(()=>{(window as any).failureQA.p.failPlayback({name:'PROVIDER_RATE_LIMITED',message:'private secret must not render'});});
    await expect(player.getByRole('button',{name:'等待冷却'})).toBeDisabled();
    await expect(player.getByRole('button',{name:'播放',exact:true})).toBeDisabled();
    await expect(player).not.toContainText('private secret');
    await page.evaluate(()=>{(window as any).failureQA.p.failPlayback('PROVIDER_SESSION_EXPIRED');});
    await expect(player.getByRole('button',{name:'重新登录',exact:true})).toBeVisible();
    await expect(player.locator('.player__error')).toContainText('官方窗口');
    await expect(player.getByRole('button',{name:'重试',exact:true})).toHaveCount(0);
    await player.getByRole('button',{name:'收起播放器',exact:true}).focus();await page.keyboard.press('Escape');
    await expect(player.getByRole('button',{name:'展开播放器',exact:true})).toBeFocused();
    expect(await page.title()).toContain('声音');expect(page.url()).toContain('/sound');
    expect(await page.locator('vite-error-overlay').count()).toBe(0);expect(errors).toEqual([]);
    await page.evaluate(()=>{const q=(window as any).failureQA;q.p.clear();URL.revokeObjectURL(q.url);delete (window as any).failureQA});
  });
}
