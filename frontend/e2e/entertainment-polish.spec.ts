import { expect, test, type Page } from '@playwright/test';
import { newSpider } from '@studyroom/contracts';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('studyroom-shell-preferences-v2', JSON.stringify({reducedMotion:true}));
  });
  await page.route('**/api/**', route => route.fulfill({json:{success:true,data:null}}));
});

async function assertFitted(page:Page, selector:string) {
  await expect.poll(async()=>page.locator('.board-viewport').evaluate((viewport,selector)=>{
    const outer=viewport.getBoundingClientRect();
    const bounds=[...viewport.querySelectorAll(selector)].map(item=>item.getBoundingClientRect());
    return { count:bounds.length,fit:bounds.every(rect=>rect.left>=outer.left-1 && rect.right<=outer.right+1 && rect.top>=outer.top-1 && rect.bottom<=outer.bottom+1),width:viewport.scrollWidth-viewport.clientWidth,height:viewport.scrollHeight-viewport.clientHeight,pageWidth:document.documentElement.scrollWidth-innerWidth };
  },selector).then(geometry=>geometry.count>0 && geometry.fit && geometry.width<=1 && geometry.height<=1 && geometry.pageWidth<=1)).toBe(true);
}

test('advanced mines and spider remain completely visible at four viewports',async({page},info)=>{
  await page.goto('/entertainment');
  for(const name of ['扫雷','蜘蛛纸牌']) {
    await page.getByRole('region',{name:'放松工具'}).getByRole('button',{name:new RegExp(name)}).click();
    await expect(page.locator('.board-viewport')).toBeVisible();
    if(name==='扫雷') {
      await page.getByRole('combobox',{name:'难度'}).click();await page.getByRole('option',{name:/高级/}).click();
      await page.getByRole('button',{name:'开始新局',exact:true}).click();
      await page.getByRole('button',{name:'确认替换本局'}).click();
      await expect(page.locator('.mines-grid button')).toHaveCount(480);
    }
    for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]) {
      await page.setViewportSize(viewport);
      await expect.poll(async()=>page.locator('.fitted-size').evaluate(el=>el.clientWidth)).toBeGreaterThan(10);
      await assertFitted(page,name==='扫雷'?'.mines-grid button':'.playing-card');
      await page.screenshot({path:info.outputPath(`${name==='扫雷'?'mines':'spider'}-${viewport.width}.png`),animations:'disabled'});
    }
    await page.setViewportSize({width:1280,height:720});
    await page.getByRole('button',{name:'返回',exact:true}).click();
  }
});

test('spider pointer drop commits once, can undo, and Escape cancels drag',async({page})=>{
  const state=newSpider(1,'40000000-0000-0000-0000-000000000001',()=>.42);
  const remaining=Array.from({length:104},(_,i)=>i+1).filter(card=>![5,6].includes(card));
  state.columns=[[5],[6],...Array.from({length:6},(_,i)=>remaining.slice(i*6,i*6+6)),remaining.slice(36,44),remaining.slice(44,52)];
  state.stock=remaining.slice(52); // All 104 identities retained, with a known legal 5 onto 6.
  await page.addInitScript(value=>localStorage.setItem('studyroom-entertainment-v1:spider',JSON.stringify(value)),state);
  await page.goto('/entertainment');
  await page.getByRole('region',{name:'放松工具'}).getByRole('button',{name:/蜘蛛纸牌/}).click();
  const source=page.locator('[data-column="0"] .playing-card'),target=page.locator('[data-column="1"] .playing-card');
  await source.hover(); // Native actionability waits for a visible, stable hit target.
  const a=await source.boundingBox(),b=await target.boundingBox();
  await page.mouse.move(a!.x+a!.width/2,a!.y+10);await page.mouse.down();
  await page.mouse.move(b!.x+b!.width/2,b!.y+20,{steps:8});
  await expect(page.locator('.spider-drag-ghost')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('.spider-actions')).toContainText('1 步');
  await expect(page.locator('[data-column="0"] .playing-card')).toHaveCount(0);
  await expect(page.locator('[data-column="1"] .playing-card')).toHaveCount(2);
  await page.getByRole('button',{name:/撤销/}).click();
  await expect(page.locator('.spider-actions')).toContainText('0 步');
  await source.hover();
  const restored=await source.boundingBox();
  await page.mouse.move(restored!.x+20,restored!.y+10);await page.mouse.down();await page.mouse.move(restored!.x+40,restored!.y+30);
  await expect(page.locator('.spider-drag-ghost')).toBeVisible();
  await page.keyboard.press('Escape');await page.mouse.up();
  await expect(page.locator('.spider-drag-ghost')).toHaveCount(0);
  await expect(page.locator('.spider-actions')).toContainText('0 步');
  await expect(page.locator('.playing-card.selected')).toHaveCount(0);
});

test('wooden fish uses button-scoped keys and reset stops auto rhythm',async({page})=>{
  await page.goto('/entertainment');
  await page.getByRole('button',{name:/电子木鱼/}).click();
  const fish=page.getByRole('button',{name:'敲击电子木鱼'}),count=page.locator('.wood-controls>strong');
  await fish.focus();await page.keyboard.press('Space');await expect(count).toHaveText('1');
  await page.getByRole('button',{name:'慢',exact:true}).focus();await page.keyboard.press('Space');await expect(count).toHaveText('1');
  await page.getByRole('button',{name:'开始自动节奏'}).click();
  await page.getByRole('button',{name:'归零',exact:true}).click();
  await expect(page.getByRole('button',{name:'开始自动节奏'})).toBeDisabled();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.getByRole('button',{name:'开始自动节奏'})).toBeEnabled();
});

test('first resize notification does not expose a placeholder board or cancel a valid drag',async({page})=>{
  const state=newSpider(1,'40000000-0000-0000-0000-000000000003',()=>.42);
  const rest=Array.from({length:104},(_,i)=>i+1).filter(card=>![5,6].includes(card));
  state.columns=[[5],[6],...Array.from({length:6},(_,i)=>rest.slice(i*6,i*6+6)),rest.slice(36,44),rest.slice(44,52)];state.stock=rest.slice(52);
  await page.addInitScript(value=>{
    localStorage.setItem('studyroom-entertainment-v1:spider',JSON.stringify(value));
    const NativeObserver=window.ResizeObserver;
    window.ResizeObserver=class extends NativeObserver{
      constructor(callback:ResizeObserverCallback){let held=false;super((entries,observer)=>{
        if(!held && entries.some(entry=>entry.target.classList.contains('board-viewport'))){
          held=true;(window as any).__releaseInitialBoardMeasure=()=>callback(entries,observer);return;
        }
        callback(entries,observer);
      });}
    };
  },state);
  await page.goto('/entertainment');await page.getByRole('button',{name:/蜘蛛纸牌/}).click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseInitialBoardMeasure)).toBe('function');
  const measurements=await page.locator('.spider-table').evaluate(el=>{
    const host=el.closest<HTMLElement>('.board-viewport')!;
    return {actual:new DOMMatrixReadOnly(getComputedStyle(el).transform).a,expected:Math.min(1,host.clientWidth/el.clientWidth,host.clientHeight/el.clientHeight)};
  });
  expect(measurements.actual).toBeCloseTo(measurements.expected,3);
  const source=page.locator('[data-column="0"] .playing-card'),target=page.locator('[data-column="1"] .playing-card');
  await source.hover();const a=await source.boundingBox(),b=await target.boundingBox();
  await page.mouse.move(a!.x+a!.width/2,a!.y+a!.height/2);await page.mouse.down();
  await page.mouse.move(b!.x+b!.width/2,b!.y+b!.height/2,{steps:8});
  await expect(page.locator('.spider-drag-ghost')).toBeVisible();
  await page.evaluate(()=>(window as any).__releaseInitialBoardMeasure());
  await expect(page.locator('.spider-drag-ghost')).toBeVisible();
  await page.mouse.up();await expect(page.locator('.spider-actions')).toContainText('1 步');
  await expect(page.locator('[data-column="1"] .playing-card')).toHaveCount(2);
  const moved=page.locator('[data-column="1"] .playing-card').last();await moved.hover();const c=await moved.boundingBox();
  await page.mouse.move(c!.x+c!.width/2,c!.y+10);await page.mouse.down();await page.mouse.move(c!.x+c!.width/2+15,c!.y+25);
  await expect(page.locator('.spider-drag-ghost')).toBeVisible();
  await page.setViewportSize({width:1180,height:740});await expect(page.locator('.spider-drag-ghost')).toHaveCount(0);await page.mouse.up();
  await expect(page.locator('.spider-actions')).toContainText('1 步');
});

test('long spider column remains inside the board without scrolling',async({page},info)=>{
  const state=newSpider(1,'40000000-0000-0000-0000-000000000002',()=>.42);
  state.columns=[Array.from({length:104},(_,i)=>i+1),...Array.from({length:9},()=>[])];state.stock=[];
  await page.addInitScript(value=>localStorage.setItem('studyroom-entertainment-v1:spider',JSON.stringify(value)),state);
  await page.goto('/entertainment');await page.getByRole('button',{name:/蜘蛛纸牌/}).click();
  await expect(page.locator('.playing-card')).toHaveCount(104);
  for(const viewport of [{width:1080,height:640},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    // Resizing crosses media-query layouts, then ResizeObserver updates the Vue scale.
    // Check both geometry and scale in one snapshot, and retain that same snapshot
    // as evidence after two matching animation frames, not a second racy read.
    let fitting:unknown;
    await expect.poll(async()=>{
      const frames=await page.locator('.spider-table').evaluate(async el=>{
        const read=()=>{
          const host=el.closest<HTMLElement>('.board-viewport')!;
          const outer=host.getBoundingClientRect();
          const cards=[...el.querySelectorAll('.playing-card')].map(card=>card.getBoundingClientRect());
          return {
            scale:new DOMMatrixReadOnly(getComputedStyle(el).transform).a,
            naturalHeight:el.clientHeight,renderedHeight:el.getBoundingClientRect().height,
            viewportHeight:host.clientHeight,viewportWidth:host.clientWidth,
            allCardsFit:cards.length===104 && cards.every(card=>card.left>=outer.left-1 && card.right<=outer.right+1 && card.top>=outer.top-1 && card.bottom<=outer.bottom+1),
            scrollWidth:host.scrollWidth-host.clientWidth,scrollHeight:host.scrollHeight-host.clientHeight,
          };
        };
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));const first=read();
        await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));return [first,read()] as const;
      });
      const [first,second]=frames;fitting=second;
      return frames.every(value=>value.scale>0 && value.scale<1 && value.naturalHeight===3036
        && value.renderedHeight<=value.viewportHeight+1 && value.allCardsFit && value.scrollWidth<=1 && value.scrollHeight<=1)
        && first.viewportWidth===second.viewportWidth && first.viewportHeight===second.viewportHeight
        && Math.abs(first.scale-second.scale)<.000001;
    }).toBe(true);
    await info.attach(`spider-long-fitting-${viewport.width}`,{body:JSON.stringify(fitting,null,2),contentType:'application/json'});
    await page.screenshot({path:info.outputPath(`spider-long-${viewport.width}.png`),animations:'disabled'});
  }
});

test('breathing starts still and keyboard welcome entry does not wait for animation',async({page})=>{
  await page.goto('/entertainment');await page.getByRole('button',{name:/一分钟呼吸/}).click();
  expect(await page.locator('.breath-ring').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
  await page.goto('/');await page.clock.install();await page.locator('body').click({position:{x:5,y:5}});await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/scene/);
});

test('approved local tool surfaces have responsive screenshots',async({page},info)=>{
  await page.goto('/entertainment');
  for(const viewport of [{width:1440,height:900},{width:1080,height:640},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await page.screenshot({path:info.outputPath(`hub-${viewport.width}.png`),animations:'disabled'});
    for(const [name,id] of [['一分钟呼吸','breathing'],['电子木鱼','wood'],['风景拼图','puzzle'],['2048','2048'],['声音调节','ambient'],['摸鱼翻翻牌','memory']]){
      if(['ambient','memory'].includes(id!))await page.locator('.legacy-tools summary').click();
      await page.getByRole('button',{name:new RegExp(name!)}).click();
      await expect(page.getByRole('heading',{level:1,name,exact:true})).toBeVisible();
      if(id==='memory' && await page.getByRole('button',{name:'开始一局'}).count())await page.getByRole('button',{name:'开始一局'}).click();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({path:info.outputPath(`${id}-${viewport.width}.png`),animations:'disabled'});
      await page.getByRole('button',{name:'返回',exact:true}).click();
    }
  }
});
