import {test,expect} from '@playwright/test';
test('six lyric styles persist independently of three stage layouts',async({page})=>{
  await page.goto('/e2e/fixtures/listening-stage.html');
  await page.getByRole('tab', { name: '沉浸歌词',exact:true}).click();
  await page.getByRole('button',{name:'视觉设置',exact:true}).click();
  for(const [label,id] of [['平滑滚动','scroll'],['居中聚焦','focus'],['阶梯错落','steps'],['超大文字','giant'],['对话气泡','chat'],['文字分镜','story']]){
    await page.getByRole('combobox',{name:'设置中的歌词样式',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click();
    await expect(page.locator('.stage-lyrics')).toHaveClass(new RegExp(`stage-lyrics--${id}`));
  }
  await page.getByRole('button',{name:'关闭视觉设置',exact:true}).click();
  await page.getByRole('tab', { name: '纯视觉',exact:true}).click();await page.getByRole('button',{name:'视觉设置',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'设置中的歌词样式',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'关闭视觉设置',exact:true}).click();await page.getByRole('tab', { name: '沉浸歌词',exact:true}).click();
  await expect(page.locator('.stage-lyrics')).toHaveClass(/stage-lyrics--story/);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('moyu-stage-fixture-v2')||'{}').visualizer?.stage?.preferences?.lyricStyle)).toBe('story');
  await page.reload();await expect(page.locator('.stage-lyrics')).toHaveClass(/stage-lyrics--story/);
  await expect(page.locator('[data-word]')).toHaveCount(0);
});
test('empty and failed lyrics recover, unsaved preference can retry',async({page})=>{
  await page.goto('/e2e/fixtures/listening-stage.html');
  await page.getByRole('button',{name:'无歌词',exact:true}).click();await expect(page.getByText('此曲目暂无同步歌词。',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'无歌词',exact:true}).click();await page.getByRole('button',{name:'读取故障',exact:true}).click();
  await expect(page.getByRole('button',{name:'重试读取歌词',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'读取故障',exact:true}).click();await expect(page.locator('.stage-lyrics__lines')).toBeVisible();
  await page.getByRole('button',{name:'保存故障',exact:true}).click();await page.getByRole('button',{name:'视觉设置',exact:true}).click();
  await page.getByRole('combobox',{name:'设置中的歌词样式',exact:true}).click();await page.getByRole('option',{name:'超大文字',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('设置尚未保存');await expect(page.locator('.stage-lyrics')).toHaveClass(/stage-lyrics--giant/);
  await page.getByRole('button',{name:'关闭视觉设置',exact:true}).click();await page.getByRole('button',{name:'保存故障',exact:true}).click();
  await page.getByRole('button',{name:'视觉设置',exact:true}).click();await page.getByRole('button',{name:'重试保存',exact:true}).click();await expect(page.getByRole('alert')).toHaveCount(0);
});
for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]){
  test(`stage remains reachable with long lyrics at ${viewport.width}x${viewport.height}`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/e2e/fixtures/listening-stage.html');
    await page.getByRole('tab', { name: '沉浸歌词',exact:true}).click();await page.getByRole('button',{name:'长句',exact:true}).click();
    await expect(page.locator('.stage-lyrics .is-current.is-long')).toBeVisible();await expect(page.getByRole('button',{name:'返回声音',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'减少动态',exact:true}).click();await expect(page.locator('.listening-stage__body')).toHaveClass(/is-reduced/);
    await expect(page.locator('.stage-lyrics')).not.toHaveAttribute('data-sr-motion');
  });
}
