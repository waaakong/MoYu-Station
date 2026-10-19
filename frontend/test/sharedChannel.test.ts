import {it,expect,vi,afterEach} from 'vitest';
const fixtures=vi.hoisted(()=>({connections:[] as any[]}));
vi.mock('../src/realtime/realtimeConnection',()=>({websocketUrl:()=>'/ws/chat',RealtimeConnection:class{state='idle';constructor(readonly options:any){fixtures.connections.push(this);}start(){this.state='open';this.options.onStateChange('open');this.options.onOpen(false);}close(){this.state='closed';}send=vi.fn(()=>true);retryNow=vi.fn();}}));
import {acquireChatChannel,closeSharedChatChannel} from '../src/chat/sharedChannel';
afterEach(()=>{closeSharedChatChannel();fixtures.connections=[];});
it('scene, feed and active chat share one physical stream until the last subscriber leaves',async()=>{
  const scene=vi.fn(),chat=vi.fn();const a=acquireChatChannel('1:7',{onMessage:scene}),b=acquireChatChannel('1:7',{onMessage:chat});await Promise.resolve();expect(fixtures.connections).toHaveLength(1);
  fixtures.connections[0].options.onMessage({type:'SCENE_INVALIDATED'});expect(scene).toHaveBeenCalledOnce();expect(chat).toHaveBeenCalledOnce();a.close();expect(b.send({type:'PING'})).toBe(true);expect(fixtures.connections[0].state).toBe('open');b.close();expect(fixtures.connections[0].state).toBe('closed');
});
it('account generations revoke old handles synchronously without closing the new account channel',()=>{
  const a=acquireChatChannel('1:7',{}),old=fixtures.connections[0];const b=acquireChatChannel('2:8',{});expect(old.state).toBe('closed');expect(a.send({type:'PING'})).toBe(false);a.close();expect(b.send({type:'PING'})).toBe(true);
});
