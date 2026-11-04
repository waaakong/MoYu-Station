import {test,expect} from '@playwright/test';
test('line-only lyrics progress by character, freeze paused, seek and preserve color controls',async({page})=>{
  await page.goto('/e2e/fixtures/listening-stage.html');await expect(page.getByText('按句内进度估算',{exact:true})).toBeVisible();
  const words=page.locator('.stage-lyrics [data-word]');await expect(words).toHaveCount(7);
  await expect(words.nth(0)).toHaveCSS('--word-fill','100%');await expect(words.nth(1)).toHaveCSS('--word-fill','75%');
  const fill=()=>words.evaluateAll(nodes=>nodes.map(n=>(n as HTMLElement).style.getPropertyValue('--word-fill')));
  const before=await fill();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));expect(await fill()).toEqual(before);
  await page.getByRole('button',{name:'播放合成时钟',exact:true}).click();await expect.poll(fill).not.toEqual(before);await page.getByRole('button',{name:'暂停合成时钟',exact:true}).click();await page.getByRole('button',{name:'跳回第2秒',exact:true}).click();await expect(words.nth(1)).toHaveCSS('--word-fill','75%');
  await page.getByRole('button',{name:'减少动态',exact:true}).click();await expect(words.nth(1)).toHaveCSS('--word-fill','75%');
});
test('stage button states, tips, minimum targets and queue focus return work',async({page})=>{
  await page.goto('/e2e/fixtures/listening-stage.html');const queue=page.getByRole('button',{name:'播放队列',exact:true});await queue.click();await expect(queue).toHaveAttribute('aria-pressed','true');await page.keyboard.press('Escape');await expect(queue).toBeFocused();await expect(queue).toHaveAttribute('aria-pressed','false');
  const mute=page.getByRole('button',{name:'音乐静音',exact:true});await mute.click();await expect(page.getByRole('button',{name:'取消音乐静音',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('slider',{name:'音乐音量',exact:true})).toHaveValue('0');await page.getByRole('button',{name:'取消音乐静音',exact:true}).click();await expect(page.getByRole('slider',{name:'音乐音量',exact:true})).not.toHaveValue('0');
  await page.getByRole('button',{name:'随机播放',exact:true}).click();await expect(page.getByRole('button',{name:'随机播放',exact:true})).toHaveAttribute('aria-pressed','true');
  const labels=await page.locator('.stage-action-button:visible').evaluateAll(buttons=>buttons.map(b=>({name:b.getAttribute('aria-label'),w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height})));expect(labels.length).toBeGreaterThan(6);for(const b of labels){expect(b.name).toBeTruthy();expect(b.w).toBeGreaterThanOrEqual(44);expect(b.h).toBeGreaterThanOrEqual(44);}
});
test('memo saves task and notes, reports persistence failure, and never loses input',async({page})=>{
  await page.route('**/api/**',r=>r.fulfill({json:{success:true,data:null}}));await page.routeWebSocket('**/ws/**',s=>s.close());await page.goto('/focus');await page.getByRole('button',{name:'打开备忘录',exact:true}).click();const memo=page.getByRole('complementary',{name:'备忘录'});
  await memo.getByPlaceholder('输入任务，按 Enter 添加').fill('合成备忘录任务');await memo.getByRole('button',{name:'添加任务',exact:true}).click();await memo.getByLabel('随手记',{exact:true}).fill('合成输入，不含私人记录');await expect(memo.getByRole('status')).toHaveText('已保存到本机');await page.reload();await page.getByRole('button',{name:'打开备忘录',exact:true}).click();await expect(memo.getByLabel('随手记',{exact:true})).toHaveValue('合成输入，不含私人记录');
  await page.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.includes('workspace'))throw new DOMException('Synthetic quota','QuotaExceededError');return original.call(this,key,value);};});await memo.getByLabel('随手记',{exact:true}).fill('保存失败时仍然保留的合成内容');await expect(memo.getByRole('alert')).toContainText('保存失败');await expect(memo.getByLabel('随手记',{exact:true})).toHaveValue('保存失败时仍然保留的合成内容');await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'打开备忘录',exact:true})).toBeFocused();
});

test('memo remains in view with independent scrolling at four sizes',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',r=>r.fulfill({json:{success:true,data:null}}));await page.routeWebSocket('**/ws/**',s=>s.close());await page.goto('/focus');await page.getByRole('button',{name:'打开备忘录',exact:true}).click();const memo=page.getByRole('complementary',{name:'备忘录'});
  for(let i=0;i<8;i++){await memo.getByPlaceholder('输入任务，按 Enter 添加').fill(`合成任务 ${i+1}：检查滚动范围和换行`);await memo.getByRole('button',{name:'添加任务',exact:true}).click();}
  await expect(memo.getByRole('status')).toHaveText('已保存到本机');
  for(const [width,height]of [[1440,900],[1280,720],[1080,640],[390,844]]){await page.setViewportSize({width,height});const box=(await memo.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(height);await expect(memo.getByRole('button',{name:'关闭备忘录',exact:true})).toBeInViewport();await memo.getByLabel('随手记',{exact:true}).scrollIntoViewIfNeeded();await expect(memo.getByLabel('随手记',{exact:true})).toBeInViewport();await page.screenshot({path:info.outputPath(`memo-${width}.png`),animations:'disabled'});}
  await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'打开备忘录',exact:true})).toBeFocused();expect(errors).toEqual([]);
});
