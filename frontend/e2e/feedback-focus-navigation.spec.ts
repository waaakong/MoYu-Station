import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route('**/api/**',route=>route.fulfill({json:{success:true,data:null}}));
  await page.emulateMedia({reducedMotion:'reduce'});
});
test('committed navigation pauses focus and reload preserves only observed progress',async({page},info)=>{
  await page.goto('/focus');
  await page.getByRole('button',{name:'开始专注',exact:true}).click();
  const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('studyroom-focus-session-v2')||'null'));
  await expect.poll(async()=>(await saved())?.state).toBe('running');
  const original=(await saved()).clientRecordId;
  await page.locator('.app-nav').getByRole('link',{name:'声音',exact:true}).click();
  await expect.poll(async()=>(await saved())?.state).toBe('running');
  await page.locator('.app-nav').getByRole('link',{name:'片刻放松',exact:true}).click();
  await expect.poll(async()=>(await saved())?.state).toBe('paused');
  expect((await saved()).clientRecordId).toBe(original);
  await page.locator('.app-nav').getByRole('link',{name:'空间',exact:true}).click();
  await page.locator('.app-nav').getByRole('link',{name:'专注',exact:true}).click();
  await expect(page.getByRole('button',{name:'继续专注',exact:true})).toBeVisible();
  expect((await saved()).state).toBe('paused');
  await page.getByRole('button',{name:'继续专注',exact:true}).click();
  await expect.poll(async()=>(await saved()).observedAt).toBeGreaterThan((await saved()).startedAt);
  await page.reload();
  await expect(page.getByRole('button',{name:'继续专注',exact:true})).toBeVisible();
  expect((await saved()).clientRecordId).toBe(original);
  await page.screenshot({path:info.outputPath('focus-restored-paused.png'),animations:'disabled'});
});
