import { expect, test, type Page } from '@playwright/test';

async function preview(page: Page) {
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
  await page.goto('/motion-preview.html');
  await expect(page.getByRole('button', { name: '重播开屏', exact: true })).toBeVisible();
}
async function freeze(page: Page, value: boolean) {
  await page.evaluate(async value => { const path='/src/motion/runtime.ts'; const {gsap}=await import(path); gsap.globalTimeline.timeScale(value?0:1); }, value);
}
async function seek(page: Page, id: string, progress: number) {
  await page.evaluate(async ({id,progress}) => { const path='/src/motion/runtime.ts'; const {gsap}=await import(path); gsap.getById(id)?.progress(progress); }, {id,progress});
}

for (const [width,height] of [[1440,900],[390,844]]) test(`overlay covers ${width}×${height}, retains content until exit and restores focus`, async ({page},info) => {
  await page.setViewportSize({width,height}); await preview(page); await freeze(page,true);
  await page.getByRole('button',{name:'侧栏',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'侧栏动效预览'});
  await expect(dialog).toHaveAttribute('data-sr-motion','sr-dialog-enter');
  await seek(page,'sr-dialog-enter',0.5);
  expect(await dialog.boundingBox()).toEqual({x:0,y:0,width,height});
  const alpha=await dialog.evaluate(el=>Number(getComputedStyle(el,'::backdrop').opacity)); expect(alpha).toBeGreaterThan(0); expect(alpha).toBeLessThanOrEqual(1);
  await seek(page,'sr-dialog-enter',1);
  await page.screenshot({path:info.outputPath(`sidebar-${width}.png`)});
  await dialog.getByRole('button',{name:'关闭侧栏预览'}).click();
  await expect(dialog).toHaveAttribute('data-sr-motion','sr-dialog-leave');
  await expect(dialog.getByRole('heading',{name:'留一点余地'})).toBeVisible();
  await seek(page,'sr-dialog-leave',1); await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button',{name:'侧栏',exact:true})).toBeFocused();
  expect(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth)).toBe(true);
});

test('reopening a closing overlay cancels old cleanup; reducing motion settles it immediately',async({page})=>{
  await preview(page); await freeze(page,true);
  await page.getByRole('button',{name:'居中弹窗'}).click(); await seek(page,'sr-dialog-enter',1);
  const dialog=page.getByRole('dialog',{name:'居中动效预览'});
  await dialog.getByRole('button',{name:'关闭居中预览'}).click();
  await expect(dialog).toHaveAttribute('data-sr-motion','sr-dialog-leave');
  await seek(page,'sr-dialog-leave',0.4);
  const before=await dialog.locator('.preview-panel').evaluate(el=>getComputedStyle(el).transform);
  // Synthesize a new external state while modal UI is leaving (e.g. a queued app command).
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent==='居中弹窗')!.click());
  await expect(dialog).toBeVisible(); await expect(dialog).not.toHaveAttribute('data-sr-motion','sr-dialog-leave');
  expect(await dialog.locator('.preview-panel').evaluate(el=>getComputedStyle(el).transform)).toBe(before);
  await seek(page,'sr-dialog-leave',1); await expect(dialog).toBeVisible();
  await dialog.getByRole('button',{name:'关闭居中预览'}).click();
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(el=>el.textContent?.startsWith('减少动态：'))!.click());
  await expect(dialog).not.toBeVisible(); expect(await page.locator('[data-sr-motion]').count()).toBe(0);
});

test('native scene editor Escape, select keyboard and account invalidation remain functional',async({page})=>{
  await preview(page);
  const app=page.frameLocator('iframe');
  await app.getByRole('button',{name:'自定义场景',exact:true}).click();
  await expect(app.getByRole('dialog',{name:'自定义分时窗景'})).toBeVisible();
  await page.keyboard.press('Escape'); await expect(app.getByRole('dialog',{name:'自定义分时窗景'})).not.toBeVisible();
  await app.getByRole('button',{name:'账号菜单'}).click(); await expect(app.getByLabel('账号与偏好')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(app.getByLabel('账号与偏好')).not.toBeVisible();
  await page.getByRole('button',{name:'居中弹窗'}).click();
  const select=page.getByRole('combobox',{name:'菜单交互'});
  await select.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('End'); await page.keyboard.press('Enter');
  await expect(select).toContainText('林间的风'); await expect(select).toHaveAttribute('aria-expanded','false');
  await page.evaluate(async()=>{const path='/src/stores/auth.ts';const {useAuthStore}=await import(path);useAuthStore().sessionGeneration++;});
  await expect(page.getByRole('dialog',{name:'居中动效预览'})).not.toBeVisible();
});

test('startup replay uses the real GSAP surface and releases the page gate',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await preview(page); await page.getByRole('button',{name:'重播开屏'}).click();
  await expect(page.locator('#moyu-startup')).toHaveAttribute('data-motion-engine','gsap');
  await seek(page,'sr-startup-brand',0.58);
  await page.screenshot({path:info.outputPath('startup-rich.png')});
  await expect(page.locator('#moyu-startup')).toHaveCount(0);
  expect(await page.locator('#app').evaluate(el=>(el as HTMLElement).inert)).toBe(false);
  await page.getByRole('button',{name:'重播开屏'}).click();
  await page.getByRole('button',{name:'跳过动画'}).click(); await expect(page.locator('#moyu-startup')).toHaveCount(0);
  expect(errors).toEqual([]);
});
