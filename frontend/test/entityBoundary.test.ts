import { describe, it, expect } from 'vitest';
import { assertExactEntityIds } from '../src/services/entityBoundary';
import { ReliableOutbox, type PendingText } from '../src/chat/reliableOutbox';
import { freezePublication, MediaApi } from '../src/media/mediaApi';

const owner='2104509220480131073', first='2104509220480131074', second='2104509220480131075';
describe('cloud identity precision', () => {
  it('checks nested DTOs and ID lists without coercing counts, UUIDs or safe legacy IDs', () => {
    const body={data:{id:owner,items:[{id:42,authorId:first}],followingIds:[first,second],bytes:1e18,assetId:'fixture-uuid'}};
    expect(()=>assertExactEntityIds(body)).not.toThrow();expect(body.data.items[0].id).toBe(42);
    for(const value of [{id:Number(first)}, {data:[{senderId:Number(second)}]}, {followingIds:[Number(first)]}, {id:'9223372036854775808'}])expect(()=>assertExactEntityIds(value)).toThrow();
  });
  it('freezes exact text recipients and rejects a neighbouring account ACK', () => {
    const items:PendingText[]=[], box=new ReliableOutbox(items), frames:unknown[]=[];
    try {
      box.enqueue(owner,{channelType:'PRIVATE',receiverId:first},'hello',frame=>{frames.push(frame);return false;},'request');
      expect((frames[0] as any).payload.receiverId).toBe(first);
      const ack={id:'99',clientMessageId:'request',senderId:owner,channelType:'PRIVATE',receiverId:second};
      expect(box.acknowledge(ack)).toBe(false);expect(items).toHaveLength(1);
      expect(box.acknowledge({...ack,receiverId:first})).toBe(true);
      expect(()=>box.enqueue(owner,{channelType:'PRIVATE',receiverId:Number(first)},'bad',()=>true)).toThrow();
      expect(items).toHaveLength(0);
    } finally { box.clear(); }
  });
  it('keeps image publication recipients and committed target IDs precise', async () => {
    const command=freezePublication({requestId:'11111111-1111-4111-8111-111111111111',kind:'PRIVATE',recipient:second,content:'',scene:null,assets:['22222222-2222-4222-8222-222222222222']});
    const stamp={accountId:owner,generation:1};
    const api=new MediaApi(stamp,()=>stamp,async request=>{
      expect(JSON.parse(request.body as string).recipient).toBe(second);
      return {status:200,data:{success:true,data:{kind:'PRIVATE',targetId:first}}};
    });
    expect((await api.publish(command,new AbortController().signal)).targetId).toBe(first);
    expect(()=>freezePublication({...command,recipient:Number(second)})).toThrow();
  });
});
