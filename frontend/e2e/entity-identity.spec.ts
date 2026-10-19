import {test,expect} from '@playwright/test';
const owner='2104509220480131073', a='2104509220480131074', b='2104509220480131075';

test('adjacent 19-digit contacts remain distinct through history, draft and exact text send',async({page},info)=>{
  const errors:string[]=[],requested:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    (window as any).__sent=[];
    class Socket extends EventTarget{static OPEN=1;readyState=0;constructor(){super();queueMicrotask(()=>{this.readyState=1;this.dispatchEvent(new Event('open'));});}send(value:string){(window as any).__sent.push(JSON.parse(value));}close(){this.readyState=3;this.dispatchEvent(new Event('close'));}}
    Object.defineProperty(window,'WebSocket',{value:Socket});
  });
  await page.route('**/api/**',async route=>{
    const path=new URL(route.request().url()).pathname;let data:unknown=[];
    if(path.endsWith('/auth/me'))data={id:owner,username:'exact-owner',nickname:'精确账号',userType:'NORMAL'};
    else if(path.endsWith('/auth/csrf'))data={token:'isolated'};
    else if(path.endsWith('/chat/capabilities'))data={reliableText:true,bidirectionalHistory:true,boundedRead:true};
    else if(path.endsWith('/chat/online-users'))data=[{id:a,nickname:'相邻成员甲'},{id:b,nickname:'相邻成员乙'}];
    else if(path.endsWith('/chat/conversations'))data={items:[{conversationId:a,userId:a,nickname:'相邻成员甲',lastMessageId:'10',unreadCount:0},{conversationId:b,userId:b,nickname:'相邻成员乙',lastMessageId:'11',unreadCount:0}],nextCursor:null};
    else if(path.endsWith(`/private/${a}/messages`)||path.endsWith(`/private/${b}/messages`)){const peer=path.split('/').at(-2)!;requested.push(peer);data=[{id:peer,senderId:peer,receiverId:owner,mine:false,channelType:'PRIVATE',messageType:'TEXT',senderName:peer===a?'甲':'乙',content:peer===a?'甲的历史':'乙的历史'}];}
    await route.fulfill({json:{success:true,data}});
  });
  await page.goto('/chat');await expect(page).toHaveURL(/\/chat/);expect(await page.title()).not.toBe('');
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.getByRole('button',{name:/相邻成员甲/}).click();await expect(page.getByText('甲的历史',{exact:true})).toBeVisible();
  await page.getByPlaceholder('发送私信...').fill('只给甲的草稿');
  await page.getByRole('button',{name:/相邻成员乙/}).click();await expect(page.getByText('乙的历史',{exact:true})).toBeVisible();await expect(page.getByPlaceholder('发送私信...')).toHaveValue('');
  await page.getByPlaceholder('发送私信...').fill('只给乙的消息');await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__sent.filter((frame:any)=>frame.type==='PRIVATE_MESSAGE_SEND').length)).toBe(1);
  expect(await page.evaluate(()=>(window as any).__sent.find((frame:any)=>frame.type==='PRIVATE_MESSAGE_SEND').payload.receiverId)).toBe(b);
  await page.getByRole('button',{name:/相邻成员甲/}).click();await expect(page.getByPlaceholder('发送私信...')).toHaveValue('只给甲的草稿');await expect(page.getByText('只给乙的消息',{exact:true})).toHaveCount(0);
  expect(new Set(requested)).toEqual(new Set([a,b]));
  for(const [width,height]of [[1440,900],[1280,720],[1080,640],[390,844]]){await page.setViewportSize({width,height});await expect(page.getByPlaceholder('发送私信...')).toBeVisible();await page.screenshot({path:info.outputPath(`exact-chat-${width}.png`),animations:'disabled'});}
  expect(errors).toEqual([]);
});
