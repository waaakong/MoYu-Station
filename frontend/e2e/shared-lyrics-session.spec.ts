import {test,expect} from '@playwright/test';
test('panels and desktop publishing share reads, offsets and track identity',async({page})=>{
  await page.goto('/e2e/fixtures/shared-lyrics.html');
  const summary=page.getByLabel('共享会话状态'),frame=page.getByLabel('桌面发布帧');
  await expect(summary).toContainText('歌词读取次数：1');
  await expect(page.locator('.lyrics-panel__lines .current')).toHaveText(['A · 把时间留给山海','A · 把时间留给山海']);
  await expect(frame).toContainText('1500ms ／ 暂停');
  await page.getByRole('button',{name:'定位到 3.5 秒',exact:true}).click();
  await expect(page.locator('.lyrics-panel__lines .current')).toHaveText(['A · 让此刻慢一点','A · 让此刻慢一点']);
  await page.getByRole('button',{name:'偏移延后半秒',exact:true}).click();await expect(frame).toContainText('3000ms');
  await page.getByRole('button',{name:'移除第二面板',exact:true}).click();
  await page.getByRole('button',{name:'恢复第二面板',exact:true}).click();await expect(summary).toContainText('歌词读取次数：1');
  await page.getByRole('button',{name:'切换到 B',exact:true}).click();await expect(summary).toContainText('歌词读取次数：2');
  await expect(frame).toContainText('B · 让此刻慢一点');
  await page.getByRole('button',{name:'切换合成账号',exact:true}).click();await expect(summary).toContainText('歌词读取次数：3');
});
