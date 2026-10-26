import {expect,test} from '@playwright/test';

const viewports=[{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}];
test.beforeEach(async({page})=>{
  await page.route('**/api/**',r=>r.fulfill({json:{success:true,data:null}}));
});

test('boss clock ticks without shifting the date, return button or keyboard hint',async({page})=>{
  await page.clock.install({time:new Date('2026-09-30T09:33:00+08:00')});
  await page.goto('/entertainment');
  await page.getByRole('button',{name:'老板模式',exact:true}).click();
  const panel=page.getByRole('region',{name:'老板模式'});
  await expect(panel).toBeVisible();await page.evaluate(()=>document.fonts.ready);
  const positions=()=>panel.locator('p,button,small').evaluateAll(elements=>elements.map(el=>{
    const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};
  }));
  for(const size of viewports){
    await page.setViewportSize(size);
    const baseline=await positions(),times=new Set<string>();
    for(let second=0;second<60;second++){
      await page.clock.runFor(1000);
      times.add(await panel.locator('time').innerText());
      expect(await positions()).toEqual(baseline);
    }
    expect(times.size).toBe(60);
    const centered=await panel.evaluate(el=>{
      const panelBox=el.getBoundingClientRect(),button=el.querySelector('button')!.getBoundingClientRect();
      return Math.abs((panelBox.left+panelBox.right-button.left-button.right)/2);
    });
    expect(centered).toBeLessThan(1);
  }
  await page.getByRole('button',{name:'返回娱乐空间'}).click();
  await expect(panel).toHaveCount(0);
  await page.getByRole('button',{name:'老板模式',exact:true}).click();await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('account popup paints and receives input above the contextual glass controls',async({page})=>{
  await page.goto('/scene');
  for(const size of viewports){
    await page.setViewportSize(size);
    const trigger=page.getByRole('button',{name:'账号菜单'});
    await trigger.click();await expect(page.locator('#account-panel')).toBeVisible();
    await page.getByRole('link',{name:'个人空间',exact:true}).hover();
    const covering=await page.locator('#account-panel').evaluate(panel=>{
      const menu=panel.getBoundingClientRect(),button=document.querySelector('.app-appearance')!.getBoundingClientRect();
      const left=Math.max(menu.left,button.left),right=Math.min(menu.right,button.right);
      const top=Math.max(menu.top,button.top),bottom=Math.min(menu.bottom,button.bottom);
      return right>left && bottom>top && panel.contains(document.elementFromPoint((left+right)/2,(top+bottom)/2));
    });
    expect(covering).toBe(true);
    await page.keyboard.press('Escape');await expect(trigger).toBeFocused();
  }
});

test('glass select host and trigger share rounded corners without clipping its popup',async({page})=>{
  await page.goto('/entertainment');await page.getByRole('button',{name:/风景拼图/}).click();
  const select=page.getByRole('combobox',{name:'难度'});
  for(const size of viewports){
    await page.setViewportSize(size);
    const corners=await select.evaluate(el=>({outer:getComputedStyle(el.parentElement!).borderRadius,inner:getComputedStyle(el).borderRadius}));
    expect(parseFloat(corners.outer)).toBeGreaterThan(0);expect(corners.outer).toBe(corners.inner);
    await select.click();const list=page.getByRole('listbox',{name:'难度'});await expect(list).toBeVisible();
    await page.getByRole('option',{name:'普通 · 4 × 4',exact:true}).click();await expect(select).toContainText('4 × 4');
  }
});

test('2048 keeps sixteen equal square cells before and after keyboard moves and resize',async({page})=>{
  await page.goto('/entertainment');await page.getByRole('button',{name:/2048/}).click();
  const board=page.locator('.board-2048');await expect(board.locator(':scope > div')).toHaveCount(16);
  for(const size of viewports){
    await page.setViewportSize(size);
    for(const key of ['ArrowDown','ArrowLeft']){
      await board.focus();await page.keyboard.press(key);
      const cells=await board.locator(':scope > div').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect();return{width:r.width,height:r.height};}));
      for(const cell of cells){expect(Math.abs(cell.width-cell.height)).toBeLessThan(1);expect(Math.abs(cell.height-cells[0]!.height)).toBeLessThan(1);}
    }
  }
});
