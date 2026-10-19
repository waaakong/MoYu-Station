import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: { success: true, data: null } }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

test('time controls share a light material and retain time/follow behavior', async ({ page }, info) => {
  await page.setViewportSize({ width:1440, height:900 });
  await page.goto('/scene');
  const times = page.getByRole('group',{name:'场景时段',exact:true});
  const modes = page.getByRole('group',{name:'时间跟随模式',exact:true});
  await times.getByRole('button',{name:'上午',exact:true}).click();
  await expect(times.getByRole('button',{name:'上午',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(modes.getByRole('button',{name:'手动',exact:true})).toHaveAttribute('aria-pressed','true');
  await modes.getByRole('button',{name:'智能跟随',exact:true}).click();
  await expect(page.locator('.scene-time-controls__hint')).toContainText('锁定');
  await modes.getByRole('button',{name:'始终跟随',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(modes.getByRole('button',{name:'始终跟随',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.scene-time-controls__hint')).toContainText('系统时间');
  await times.getByRole('button',{name:'上午',exact:true}).click();
  const activeTime = times.locator('[aria-pressed=true]');
  const activeMode = modes.locator('[aria-pressed=true]');
  expect(await activeTime.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(await activeMode.evaluate(el=>getComputedStyle(el).backgroundColor));
  await page.locator('.time-panel').screenshot({path:info.outputPath('time-panel.png'),animations:'disabled'});
});

for (const [width,height] of [[1440,900],[1080,640],[900,720],[820,720],[390,844]]) {
  test(`grouped player and quick focus alignment ${width}`, async ({ page }, info) => {
    await page.setViewportSize({width,height});
    await page.goto('/scene');
    const summary = page.locator('.quick-focus__summary>span');
    const label = page.locator('.quick-focus__duration>span:first-child');
    expect(Math.abs((await summary.boundingBox())!.y-(await label.boundingBox())!.y)).toBeLessThan(1);
    const select = await page.locator('.quick-focus').getByRole('combobox').boundingBox();
    const action = await page.locator('.quick-focus__action').boundingBox();
    expect(Math.abs(select!.y-action!.y)).toBeLessThan(1);
    expect(Math.abs(select!.height-action!.height)).toBeLessThan(1);
    await page.locator('.quick-focus').screenshot({path:info.outputPath(`quick-${width}.png`),animations:'disabled'});
    await page.getByRole('navigation',{name:'快捷入口'}).getByRole('link',{name:'专注',exact:true}).click();
    const player = page.getByRole('region',{name:'专注控制条'});
    const scene = await page.getByRole('group',{name:'场景与时间控制'}).boundingBox();
    const audio = await page.getByRole('group',{name:'声音与播放控制'}).boundingBox();
    const outer = await player.boundingBox();
    if(width === 900 || width === 820 || width === 390) {
      expect(audio!.y).toBeGreaterThanOrEqual(scene!.y+scene!.height);
      for(const box of [scene!,audio!]) expect(Math.abs(box.x+box.width/2-outer!.x-outer!.width/2)).toBeLessThan(1);
    } else expect(Math.abs(scene!.y-audio!.y)).toBeLessThan(1);
    const audioButtons = await page.locator('.player__audio-group button').evaluateAll(buttons=>buttons.map(el=>el.getBoundingClientRect().y));
    expect(Math.max(...audioButtons)-Math.min(...audioButtons)).toBeLessThan(1);
    await player.screenshot({path:info.outputPath(`player-${width}.png`),animations:'disabled'});
    await page.screenshot({path:info.outputPath(`focus-${width}.png`),animations:'disabled'});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}

test('integrated minute stepper keeps direct input, bounds and disabled session controls', async ({ page }, info) => {
  await page.goto('/focus');
  const input=page.getByRole('spinbutton',{name:'自定义专注分钟'});
  const minus=page.getByRole('button',{name:'减少一分钟'});
  const plus=page.getByRole('button',{name:'增加一分钟'});
  await input.fill('1'); await expect(minus).toBeDisabled();
  await plus.focus(); await page.keyboard.press('Enter'); await expect(input).toHaveValue('2');
  await input.fill('180'); await expect(plus).toBeDisabled();
  await minus.click(); await expect(input).toHaveValue('179');
  await input.fill('30'); await page.getByRole('button',{name:'设置',exact:true}).click();
  await expect(page.locator('.focus-card .timer')).toHaveText('30:00');
  await page.locator('.custom-row').screenshot({path:info.outputPath('minute-stepper.png'),animations:'disabled'});
  await page.getByRole('button',{name:/开始专注/}).click();
  await expect(input).toBeDisabled(); await expect(minus).toBeDisabled(); await expect(plus).toBeDisabled();
});
