import {expect,test,type Page} from '@playwright/test';

const first='2104509220480131074',second='2104509220480131075',third='2104509220480131076';
const message=(id:string,content:string)=>({id,senderId:3,receiverId:2,channelType:'PRIVATE',messageType:'TEXT',content,senderName:'成员 A',mine:false});
async function setup(page:Page){
  const hidden=new Set<string>(),deletes:string[]=[],reads:unknown[]=[];
  await page.addInitScript(()=>{
    class Socket extends EventTarget{static OPEN=1;readyState=0;constructor(){super();(window as any).__socket=this;queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}send(){}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}}
    Object.defineProperty(window,'WebSocket',{value:Socket});
  });
  await page.route('**/api/**',async route=>{
    const url=new URL(route.request().url()),path=url.pathname,method=route.request().method();let data:unknown=[];
    if(path.endsWith('/auth/csrf'))data={token:'isolated-fixture'};
    else if(path.endsWith('/auth/me'))data={id:2,nickname:'测试员',userType:'NORMAL'};
    else if(path.endsWith('/chat/capabilities'))data={reliableText:true,bidirectionalHistory:true,boundedRead:true,privateMessageDeletion:true};
    else if(path.endsWith('/chat/conversations'))data={items:[],nextCursor:null};
    else if(path.endsWith('/chat/online-users'))data=[{id:3,nickname:'成员 A'},{id:4,nickname:'成员 B'}];
    else if(path.endsWith('/messages/visibility'))data={visibleIds:(url.searchParams.get('ids')||'').split(',').filter(id=>!hidden.has(id))};
    else if(path.endsWith('/private/3/messages')&&method==='GET')data=[message(first,'第一条私信'),message(second,'相邻 ID 的第二条私信')].filter(item=>!hidden.has(item.id));
    else if(path.endsWith('/private/4/messages')&&method==='GET')data=[{...message('41','B 的历史'),senderId:4}];
    else if(path.endsWith('/read')){reads.push(route.request().postDataJSON());data=null;}
    else if(method==='DELETE'&&path.includes('/private/messages/')){const id=path.split('/').at(-1)!;deletes.push(id);hidden.add(id);data={messageId:id,status:'deleted'};}
    await route.fulfill({json:{success:true,data}});
  });
  await page.goto('/chat');await page.getByRole('button',{name:/成员 A/}).click();await expect(page.getByText('第一条私信',{exact:true})).toBeVisible();
  return {hidden,deletes,reads};
}
async function push(page:Page,type:string,payload:unknown){await page.evaluate(({type,payload})=>(window as any).__socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify({type,payload})})),{type,payload});}

test('deletion retries the original ID after an unknown result and late pushes cannot resurrect it',async({page})=>{
  const state=await setup(page);let calls=0;
  await page.route(`**/api/chat/private/messages/${first}`,async route=>{
    calls++;if(calls===1){state.hidden.add(first);await route.fulfill({status:503,json:{success:false,code:'TEST_UNKNOWN',message:'结果未确认'}});}else await route.fallback();
  });
  await page.locator(`[data-message-id="${first}"]`).getByRole('button',{name:'删除这条记录'}).click();
  const dialog=page.getByRole('dialog',{name:'删除这条记录？'});await expect(dialog).toBeVisible();await expect(dialog.getByRole('button',{name:'取消',exact:true})).toBeFocused();
  await dialog.getByRole('button',{name:'确认删除'}).click();await expect(dialog.getByRole('alert')).toContainText('结果未确认');
  await dialog.getByRole('button',{name:'重试原删除'}).click();await expect(dialog).toBeHidden();
  expect(state.deletes).toEqual([first]);expect(calls).toBe(2);
  await expect(page.locator(`[data-message-id="${first}"]`)).toHaveCount(0);await expect(page.locator(`[data-message-id="${second}"]`)).toHaveCount(1);
  await push(page,'PRIVATE_MESSAGE_RECEIVE',message(first,'第一条私信'));await push(page,'MESSAGE_ACK',message(first,'第一条私信'));
  await expect(page.locator(`[data-message-id="${first}"]`)).toHaveCount(0);
  await expect.poll(()=>state.reads.some((value:any)=>value.throughId===second)).toBe(true);
});

test('same-account deletion remains effective across routes and catch-up reconciles missed events',async({page})=>{
  const state=await setup(page);await page.getByRole('link',{name:'动态',exact:true}).click();
  state.hidden.add(first);await push(page,'PRIVATE_MESSAGE_DELETED',{messageId:first,peerId:'3'});
  state.hidden.add(second); // Deliberately no push: next entry must query visibility.
  await page.getByRole('link',{name:'聊天',exact:true}).click();await page.getByRole('button',{name:/成员 A/}).click();
  await expect(page.locator('[data-message-id]')).toHaveCount(0);
  await page.getByRole('button',{name:/成员 B/}).click();await expect(page.getByText('B 的历史')).toBeVisible();
});

test('clear history freezes its watermark and leaves a newer incoming message intact',async({page})=>{
  await setup(page);let release!:()=>void,started=false,body:any;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/chat/private/3/messages',async route=>{
    if(route.request().method()!=='DELETE')return route.fallback();body=route.request().postDataJSON();started=true;await gate;await route.fulfill({json:{success:true,data:null}});
  });
  try{
    page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'删除记录',exact:true}).click();await expect.poll(()=>started).toBe(true);
    expect(body).toEqual({throughId:second});await push(page,'PRIVATE_MESSAGE_RECEIVE',message(third,'确认后到达的新消息'));release();
    await expect(page.getByText('聊天记录已删除',{exact:true})).toBeVisible();await expect(page.locator(`[data-message-id="${third}"]`)).toHaveCount(1);await expect(page.locator(`[data-message-id="${first}"]`)).toHaveCount(0);
  }finally{release();}
});

test('delete confirmation stays reachable with keyboard at four viewports',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await setup(page);
  for(const [width,height] of [[1440,900],[1280,720],[1080,640],[390,844]]){
    await page.setViewportSize({width,height});await page.locator(`[data-message-id="${first}"]`).getByRole('button',{name:'删除这条记录'}).click();
    const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();const box=await dialog.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({path:info.outputPath(`delete-${width}.png`),animations:'disabled'});await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
  }expect(errors).toEqual([]);
});
