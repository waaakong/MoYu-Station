import {describe,expect,it,vi} from 'vitest';
import {QQPublicApi} from '../src/providers/adapters/qq/publicApi';
import {QQAccountApi} from '../src/providers/adapters/qq/accountApi';
import type {PublicWebTransport,QQWebTransport} from '../src/providers/adapters/publicWebTransport';
const trackId='0026XoN00Y92BW';
const signal=()=>new AbortController().signal;
const response=(lyric=Buffer.from('[00:01.00]Test line&#10;[00:02.00]Second line').toString('base64'),extra={})=>({code:0,req:{code:0,data:{crypt:0,qrc:0,lyric,...extra}}});
describe('QQ plaintext timed lyrics',()=>{
  it('uses an exact song MID and decodes bounded UTF-8 LRC',async()=>{
    const transport=vi.fn<PublicWebTransport>().mockResolvedValue(response());
    await expect(new QQPublicApi(transport).execute('lyrics',{trackId},signal())).resolves.toEqual({trackId:`qq:${trackId}`,providerId:'qq',source:'provider',content:'[00:01.00]Test line\n[00:02.00]Second line'});
    expect(transport.mock.calls[0]?.[2]).toMatchObject({req:{module:'music.musichallSong.PlayLyricInfo',method:'GetPlayLyricInfo',param:{songMID:trackId}}});
  });
  it('distinguishes an explicit empty lyric from a missing or malformed response',async()=>{
    await expect(new QQPublicApi(async()=>response('')).lyrics({trackId},signal())).resolves.toBeUndefined();
    await expect(new QQPublicApi(async()=>({code:0,req:{code:0,data:{}}})).lyrics({trackId},signal())).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
  });
  it.each(['@@@','a===',Buffer.from([0xff,0xfe]).toString('base64'),Buffer.alloc(200001,65).toString('base64')])('rejects malformed/oversized encoding',async lyric=>{
    await expect(new QQPublicApi(async()=>response(lyric)).lyrics({trackId},signal())).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
  });
  it.each([{crypt:1},{qrc:1}])('does not decrypt or mislabel QRC %j',async flags=>{
    await expect(new QQPublicApi(async()=>response('',flags)).lyrics({trackId},signal())).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
  });
  it('drops canceled responses',async()=>{
    const controller=new AbortController();
    await expect(new QQPublicApi(async()=>{controller.abort();return response();}).lyrics({trackId},controller.signal)).rejects.toMatchObject({name:'AbortError'});
  });
  it('retains authenticated transport and refuses expired account before lyrics',async()=>{
    const session={qqmusic_uin:'123456',qqmusic_key:'test-only-key'};
    const transport=vi.fn<QQWebTransport>().mockResolvedValueOnce({code:0,data:{creator:{uin:'123456',nick:'Test'}}}).mockResolvedValueOnce(response());
    await expect(new QQAccountApi(transport).execute('lyrics',{input:{trackId},session},signal())).resolves.toMatchObject({providerId:'qq'});
    expect(transport.mock.calls[1]?.[3]).toEqual(session);
    transport.mockReset().mockResolvedValue({code:1000});
    await expect(new QQAccountApi(transport).execute('lyrics',{input:{trackId},session},signal())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
