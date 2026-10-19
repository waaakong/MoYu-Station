import {expect,test} from '@playwright/test';
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>localStorage.clear());
  await page.route('**/api/**',route=>route.fulfill({json:{success:true,data:null}}));
});
test('minute select: real options, numeric model, keyboard, focus and four viewport edges',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/scene');
  const select=page.getByRole('combobox',{name:'分钟',exact:true});
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]){
    await page.setViewportSize(viewport);await expect(select).toContainText('25');
    await select.click();const list=page.getByRole('listbox',{name:'分钟',exact:true});await expect(list).toBeVisible();
    const bounds=await list.boundingBox();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(viewport.width);expect(bounds!.y+bounds!.height).toBeLessThanOrEqual(viewport.height);
    expect(await list.evaluate(el=>el.scrollHeight-el.clientHeight)).toBeLessThanOrEqual(0);
    await page.screenshot({path:info.outputPath(`select-space-${viewport.width}.png`),animations:'disabled'});
    await page.keyboard.press('End');await page.keyboard.press('Enter');await expect(select).toContainText('60');await expect(page.locator('.quick-focus strong')).toHaveText('60:00');await expect(select).toBeFocused();
    await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');await page.keyboard.press('Escape');await expect(select).toContainText('60');await expect(select).toBeFocused();
    await select.click();await page.getByRole('option',{name:'25',exact:true}).click();await expect(select).toHaveAttribute('aria-expanded','false');
  }
  expect(errors).toEqual([]);
});
test('select inside modal consumes first Escape, reduced motion stops animation',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/sound');
  await page.getByRole('button',{name:'听歌舞台',exact:true}).click();await page.getByRole('button',{name:'视觉设置',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'视觉设置'}),select=page.getByRole('combobox',{name:'色调',exact:true});
  await select.click();await expect(page.getByRole('listbox',{name:'色调',exact:true})).toHaveCSS('animation-name','none');
  await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await expect(select).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});
test('dynamic options, numeric values, disabled choices, rollback and native form validation',async({page})=>{
  await page.goto('/scene');
  await page.evaluate(async()=>{const path='/e2e/fixtures/selectHarness.ts';await (await import(/* @vite-ignore */ path)).mountSelectHarness();});
  const number=page.getByRole('combobox',{name:'数字选择'});
  await number.focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await expect(number).toHaveText('Four');await expect(page.getByLabel('值与类型')).toHaveText('4:number');
  await page.getByRole('button',{name:'更新选项'}).click();await number.click();await page.keyboard.press('End');await page.keyboard.press('Enter');await expect(number).toHaveText('Five');
  await number.click();await page.keyboard.press('o');await page.keyboard.press('Enter');await expect(number).toHaveText('One');
  await number.click();await page.keyboard.press('End');await page.keyboard.press('Enter');
  await number.click();await page.getByRole('option',{name:'Disabled',exact:true}).click({force:true});await expect(number).toHaveText('Five');
  await page.keyboard.press('Tab');await expect(number).toHaveAttribute('aria-expanded','false');
  const pref=page.getByRole('combobox',{name:'异步偏好'});await pref.click();await page.getByRole('option',{name:'退出程序',exact:true}).click();await expect(page.getByRole('status',{name:'表单反馈'})).toHaveText('保存失败');await expect(pref).toHaveText('每次询问');
  await page.getByRole('button',{name:'提交表单'}).click();const required=page.getByRole('combobox',{name:'必选项'});await expect(required).toBeFocused();await expect(required).toHaveAttribute('aria-expanded','true');
  await page.getByRole('option',{name:'Okay'}).click();await page.getByRole('button',{name:'提交表单'}).click();await expect(page.getByRole('status',{name:'表单反馈'})).toHaveText('submitted');
  await page.getByRole('button',{name:'重置表单'}).click();await expect(required).toHaveText('请选择');await expect(number).toHaveText('Five');
  await number.click();await page.getByRole('button',{name:'更新选项'}).click();await expect(number).toHaveAttribute('aria-expanded','false');
});
