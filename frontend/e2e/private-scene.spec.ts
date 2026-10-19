import {test,expect} from '@playwright/test';
import sharp from 'sharp';
const id='11111111-1111-4111-8111-111111111111';
test('custom scene entry sits beside the scene title at all supported widths',async({page},info)=>{
  await page.route('**/api/**',route=>route.fulfill({json:{success:true,data:null}}));
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]){
    await page.setViewportSize(viewport);await page.goto('/scene');
    const button=page.locator('.panel-head').getByRole('button',{name:'自定义场景',exact:true});
    await expect(button).toBeVisible();
    if(viewport.width<800)await page.locator('.panel-head').scrollIntoViewIfNeeded();
    const target=await button.boundingBox(),title=await page.locator('.panel-head__title').boundingBox(),main=await page.locator('#main-stage').boundingBox();
    expect(target!.x).toBeGreaterThanOrEqual(title!.x+title!.width);
    expect(target!.y).toBeLessThan(title!.y+title!.height);
    expect(target!.y+target!.height).toBeGreaterThan(title!.y);
    expect(target!.y).toBeGreaterThanOrEqual(main!.y);
    expect(target!.y+target!.height).toBeLessThanOrEqual(main!.y+main!.height);
    expect(target!.x+target!.width).toBeLessThanOrEqual(viewport.width);
    await button.click();await expect(page.getByRole('dialog',{name:'自定义分时窗景'})).toBeVisible();
    await page.getByRole('button',{name:'关闭场景编辑器'}).click();
    await page.screenshot({path:info.outputPath(`scene-entry-${viewport.width}.png`),animations:'disabled'});
  }
});
test('guest scene editor offers login with a return to the scene page',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({json:{success:true,data:null}}));
  await page.goto('/scene');
  await page.getByRole('button',{name:'自定义场景',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'自定义分时窗景'});
  await expect(editor.getByText('登录，保存你的窗景',{exact:true})).toBeVisible();
  await editor.getByRole('button',{name:'登录墨屿',exact:true}).click();
  await expect(page).toHaveURL(/\/login\?redirect=(?:%2F|\/)scene$/);
});

test('scene service failure is visible and can be retried instead of claiming disabled',async({page})=>{
  let available=false;
  await page.route('**/api/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/media/capabilities')&&!available)return route.fulfill({status:503,json:{success:false,code:'SCENE_TEMPORARY',message:'场景服务暂时不可用，请重试。'}});
    const data=path.endsWith('/auth/me')?{id:'2',username:'fixture',userType:'NORMAL'}:path.endsWith('/media/capabilities')?{scene:true}:path.endsWith('/scenes/custom')?{version:0,deleted:true,config:null,media:[]}:[];
    return route.fulfill({json:{success:true,data}});
  });
  await page.goto('/scene');
  await page.getByRole('button',{name:'自定义场景',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'自定义分时窗景'});
  await expect(editor.getByRole('alert')).toContainText('场景服务暂时不可用');
  await expect(editor.getByText('当前服务未启用私人场景。不会回退到公开上传。')).toHaveCount(0);
  available=true;
  await editor.getByRole('button',{name:'重新检查'}).click();
  await expect(editor.getByLabel('选择默认图')).toBeVisible();
  await expect(editor.getByRole('alert')).toHaveCount(0);
});

test('default and seven period uploads save, apply and reopen without a blank draft',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const png=await sharp({create:{width:600,height:1000,channels:4,background:'#527765'}}).png().toBuffer();
  const snapshot:any={version:0,deleted:true,config:null,media:[]};let writes=0;
  await page.addInitScript(()=>{class Socket extends EventTarget{static OPEN=1;readyState=0;constructor(){super();queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}send(){}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}}Object.defineProperty(window,'WebSocket',{value:Socket});});
  await page.route('**/api/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname;
    if(path.startsWith('/api/media/assets/'))return route.fulfill({contentType:'image/png',body:png});
    let data:any=[];
    if(path.endsWith('/auth/me'))data={id:'2',username:'fixture',userType:'NORMAL'};
    else if(path.endsWith('/auth/csrf'))data={token:'scene-regression-csrf'};
    else if(path.endsWith('/media/capabilities'))data={scene:true};
    else if(path.includes('/media/uploads/'))data={status:'missing'};
    else if(path.endsWith('/media/assets')&&req.method()==='POST'){
      expect(url.searchParams.get('purpose')).toBe('scene');
      data={status:'ready',asset:{id,purpose:'scene'}};
    }else if(path.includes('/scenes/custom/requests/'))data={status:'missing'};
    else if(path.endsWith('/scenes/custom')){
      if(req.method()==='PUT'){
        const body=req.postDataJSON();writes++;expect(body.version).toBe(0);
        Object.assign(snapshot,{version:1,deleted:false,config:body.config,media:[{assetId:id,width:600,height:1000,bytes:png.length,clearUrl:`/api/media/assets/${id}/clear`,displayUrl:`/api/media/assets/${id}/display`,thumbUrl:`/api/media/assets/${id}/thumb`}]});
        data={status:'committed',requestId:body.requestId,current:snapshot};
      }else data=snapshot;
    }
    return route.fulfill({json:{success:true,data}});
  });
  await page.goto('/scene');
  await page.getByRole('button',{name:'自定义场景',exact:true}).click();
  const editor=page.getByRole('dialog',{name:'自定义分时窗景'});
  const file={name:'portrait.png',mimeType:'image/png',buffer:png};
  await editor.getByLabel('选择默认图').setInputFiles(file);
  await expect(editor.getByLabel('场景名称')).toBeVisible();
  await editor.getByLabel('场景名称').fill('七时段自定义窗景');
  await editor.getByRole('combobox',{name:'显示方式'}).click();
  await page.getByRole('option',{name:'完整显示＋模糊补边'}).click();
  for(const time of ['早晨','上午','中午','下午','黄昏','夜晚','深夜']){
    await editor.getByRole('button',{name:time,exact:true}).click();
    await editor.getByLabel('选择时段图').setInputFiles(file);
    await expect(editor.getByRole('button',{name:time+' ·',exact:true})).toBeVisible();
  }
  await editor.getByRole('button',{name:'保存并使用',exact:true}).click();
  await expect(editor).not.toBeVisible();
  expect(writes).toBe(1);expect(Object.keys(snapshot.config.periods)).toHaveLength(7);
  expect(snapshot.config.defaultImage.fit).toBe('contain');
  await expect(page.getByLabel('使用私人场景')).toBeChecked();
  await expect(page.locator('.private-background .image')).toBeVisible();
  await page.getByRole('button',{name:'自定义场景',exact:true}).click();
  await expect(editor.getByLabel('场景名称')).toHaveValue('七时段自定义窗景');
  await expect.poll(()=>editor.evaluate(el=>el.scrollTop)).toBe(0);
  await expect.poll(()=>editor.locator('.main-preview').evaluate((img:HTMLImageElement)=>img.naturalHeight)).toBe(1000);
  await page.screenshot({path:info.outputPath('saved-custom-scene.png')});
  expect(errors).toEqual([]);
});

test('IndexedDB rejects a late write after clear and preserves separate account records',async({page})=>{
  await page.route('**/api/**',route=>route.fulfill({json:{success:true,data:null}}));
  await page.goto('/scene');
  const result=await page.evaluate(async()=>{
    const {WebSceneCache}=await import('/src/scenes/privateCacheStorage.ts');
    const cache=new WebSceneCache();
    const record={snapshot:{version:3,deleted:true,config:null,media:[]},images:[]};
    const first=await cache.read('91'),second=await cache.read('92');
    await cache.write('91',first.epoch,record,()=>true);await cache.write('92',second.epoch,record,()=>true);
    await cache.clear('91');let staleRejected=false;
    try{await cache.write('91',first.epoch,record,()=>true);}catch{staleRejected=true;}
    return{staleRejected,cleared:(await cache.read('91')).record,other:(await cache.read('92')).record.snapshot.version};
  });
  expect(result).toEqual({staleRejected:true,cleared:null,other:3});
});
test('private scene uses persistent display cache offline and erases it on logout',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const png=await sharp({create:{width:600,height:1000,channels:4,background:'#557766'}}).png().toBuffer();
  const picture={assetId:id,fit:'contain',focalX:.5,focalY:.5,zoom:1,dim:.2};
  const snapshot={version:4,deleted:false,config:{name:'缓存纵向窗景',defaultImage:picture,periods:{}},media:[{assetId:id,width:600,height:1000,bytes:20000,clearUrl:`/api/media/assets/${id}/clear`,displayUrl:`/api/media/assets/${id}/display`,thumbUrl:`/api/media/assets/${id}/thumb`}]};
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.startsWith('/api/media/assets/'))return route.fulfill({contentType:'image/png',body:png});
    const data=path.endsWith('/auth/me')?{id:2,username:'fixture',userType:'NORMAL'}:path.endsWith('/media/capabilities')?{scene:true}:path.endsWith('/scenes/custom')?snapshot:[];
    await route.fulfill({json:{success:true,data}});
  });
  await page.goto('/scene');await expect(page.getByLabel('使用私人场景')).toBeVisible();await page.getByLabel('使用私人场景').check();
  await expect(page.locator('.private-background .image')).toHaveAttribute('src',/^blob:/);
  const read=()=>page.evaluate(()=>new Promise<any>((resolve,reject)=>{
    const open=indexedDB.open('studyroom-private-scenes-v1',1);open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{const db=open.result,request=db.transaction('accounts').objectStore('accounts').get('2');request.onsuccess=()=>{resolve(request.result?{epoch:request.result.epoch,version:request.result.record?.snapshot.version??null}:null);db.close();};};
  }));
  await expect.poll(read).toMatchObject({version:4});
  await page.context().setOffline(true);
  await page.getByRole('button',{name:'自定义场景',exact:true}).click();
  await expect(page.getByRole('dialog').locator('.main-preview')).toHaveAttribute('src',/^blob:/);
  await expect.poll(()=>page.getByRole('dialog').locator('.main-preview').evaluate((image:HTMLImageElement)=>image.naturalHeight)).toBe(1000);
  await page.screenshot({path:info.outputPath('scene-offline-cache.png')});
  await page.getByRole('button',{name:'关闭场景编辑器'}).click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('studyroom:session-ended',{detail:{code:'AUTH_SESSION_EXPIRED'}})));
  await expect(page.locator('[data-private-scene]')).toHaveCount(0);
  await expect.poll(read).toMatchObject({version:null});expect(errors).toEqual([]);
});
test('saved portrait scene keeps independent selection and editor controls in four viewports',async({page},info)=>{
  const png=await sharp({create:{width:600,height:1000,channels:4,background:{r:60,g:110,b:90,alpha:.8}}}).png().toBuffer();
  const picture={assetId:id,fit:'contain',focalX:.5,focalY:.5,zoom:1,dim:.2};
  const snapshot={version:4,deleted:false,config:{name:'纵向窗景',defaultImage:picture,periods:{}},media:[{assetId:id,width:600,height:1000,bytes:20000,clearUrl:`/api/media/assets/${id}/clear`,displayUrl:`/api/media/assets/${id}/display`,thumbUrl:`/api/media/assets/${id}/thumb`}]};
  await page.addInitScript(()=>{class Socket extends EventTarget{static OPEN=1;readyState=0;constructor(){super();queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}send(){}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}}Object.defineProperty(window,'WebSocket',{value:Socket});});
  await page.route('**/api/**',async route=>{const path=new URL(route.request().url()).pathname;let data:any=[];
    if(path.endsWith('/auth/me'))data={id:2,username:'tester',nickname:'验收',userType:'NORMAL'};
    else if(path.endsWith('/media/capabilities'))data={social:true,sticker:true,scene:true};
    else if(path.endsWith('/scenes/custom'))data=snapshot;
    else if(path.startsWith('/api/media/assets/')){await route.fulfill({contentType:'image/png',body:png});return;}
    await route.fulfill({json:{success:true,data}});
  });
  await page.goto('/scene');await expect(page.getByLabel('使用私人场景')).toBeVisible();await expect(page.getByLabel('使用私人场景')).not.toBeChecked();await page.getByLabel('使用私人场景').check();
  for(const viewport of [{width:1440,height:900},{width:1280,height:720},{width:1080,height:640},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    await expect.poll(()=>page.locator('.scene-picker').evaluate(el=>el.clientHeight)).toBeGreaterThanOrEqual(90);
    await page.getByRole('button',{name:'自定义场景',exact:true}).click();const editor=page.getByRole('dialog',{name:'自定义分时窗景'});await expect(editor.locator('input[maxlength="40"]')).toHaveValue('纵向窗景');await expect.poll(()=>editor.locator('.main-preview').evaluate((img:HTMLImageElement)=>img.naturalHeight)).toBe(1000);
    await page.screenshot({path:info.outputPath(`editor-${viewport.width}.png`),animations:'disabled'});await editor.getByRole('button',{name:'关闭场景编辑器'}).click();
    const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>innerWidth+1 && getComputedStyle(e).position!=='absolute').map(e=>({tag:e.tagName,cls:e.className,right:e.getBoundingClientRect().right}))}));
    expect(overflow.scroll,JSON.stringify(overflow)).toBeLessThanOrEqual(viewport.width);await page.screenshot({path:info.outputPath(`scene-${viewport.width}.png`),animations:'disabled'});
  }
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('studyroom:session-ended',{detail:{code:'AUTH_SESSION_EXPIRED'}})));await expect(page.locator('[data-private-scene]')).toHaveCount(0);
});

test('19-digit owner retains exact IndexedDB cache identity and logout erases it',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const png=await sharp({create:{width:600,height:1000,channels:4,background:'#557766'}}).png().toBuffer();
  const picture={assetId:id,fit:'contain',focalX:.5,focalY:.5,zoom:1,dim:.2};
  const snapshot={version:4,deleted:false,config:{name:'缓存纵向窗景',defaultImage:picture,periods:{}},media:[{assetId:id,width:600,height:1000,bytes:20000,clearUrl:`/api/media/assets/${id}/clear`,displayUrl:`/api/media/assets/${id}/display`,thumbUrl:`/api/media/assets/${id}/thumb`}]};
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.startsWith('/api/media/assets/'))return route.fulfill({contentType:'image/png',body:png});
    const data=path.endsWith('/auth/me')?{id:'2104509220480131074',username:'fixture',userType:'NORMAL'}:path.endsWith('/media/capabilities')?{scene:true}:path.endsWith('/scenes/custom')?snapshot:[];
    await route.fulfill({json:{success:true,data}});
  });
  await page.goto('/scene');await expect(page.getByLabel('使用私人场景')).toBeVisible();await page.getByLabel('使用私人场景').check();
  await expect(page.locator('.private-background .image')).toHaveAttribute('src',/^blob:/);
  const read=()=>page.evaluate(()=>new Promise<any>((resolve,reject)=>{
    const open=indexedDB.open('studyroom-private-scenes-v1',1);open.onerror=()=>reject(open.error);
    open.onsuccess=()=>{const db=open.result,request=db.transaction('accounts').objectStore('accounts').get('2104509220480131074');request.onsuccess=()=>{resolve(request.result?{epoch:request.result.epoch,version:request.result.record?.snapshot.version??null}:null);db.close();};};
  }));
  await expect.poll(read).toMatchObject({version:4});
  await page.context().setOffline(true);
  await page.getByRole('button',{name:'自定义场景',exact:true}).click();
  await expect(page.getByRole('dialog').locator('.main-preview')).toHaveAttribute('src',/^blob:/);
  await expect.poll(()=>page.getByRole('dialog').locator('.main-preview').evaluate((image:HTMLImageElement)=>image.naturalHeight)).toBe(1000);
  await page.screenshot({path:info.outputPath('scene-offline-cache.png')});
  await page.getByRole('button',{name:'关闭场景编辑器'}).click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('studyroom:session-ended',{detail:{code:'AUTH_SESSION_EXPIRED'}})));
  await expect(page.locator('[data-private-scene]')).toHaveCount(0);
  await expect.poll(read).toMatchObject({version:null});expect(errors).toEqual([]);
});
