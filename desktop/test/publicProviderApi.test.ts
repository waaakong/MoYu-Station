import { describe, expect, it, vi } from 'vitest';
import { QQPublicApi } from '../src/providers/adapters/qq/publicApi';
import { KugouPublicApi } from '../src/providers/adapters/kugou/publicApi';
import { PublicDesktopAdapter } from '../src/providers/adapters/publicDesktopAdapter';
import { ProviderCoordinator } from '../src/providers/core/providerCoordinator';
import type { PublicWebTransport } from '../src/providers/adapters/publicWebTransport';
import type { ProviderWorkerSupervisor } from '../src/providers/core/providerWorkerSupervisor';

const id='0026XoN00Y92BW',signal=()=>new AbortController().signal;
const detail=(pay=0)=>({code:0,req:{code:0,data:{track_info:{mid:id,name:'Breaktime',singer:[{name:'Kevin MacLeod'}],interval:126,pay:{pay_play:pay}}}}});
const playback=(purl='C4000026XoN00Y92BW.m4a?vkey=opaque',sip='http://aqqmusic.tc.qq.com/')=>({code:0,req:{code:0,data:{retcode:0,expiration:80400,sip:[sip],midurlinfo:[{songmid:id,result:0,purl,pneed:0,pneedbuy:0,ekey:''}]}}});
const input={trackId:id,playbackSessionId:'session',accountScope:'public'};

describe('bounded public provider APIs',()=>{
  it.each([{status:0,error_code:20028,data:'login required'},{status:0,data:{'SSA-CODE':'challenge'}}])('Kugou classifies official verification without bypass attempts',async response=>{
    const transport=vi.fn<PublicWebTransport>().mockResolvedValue(response);
    await expect(new KugouPublicApi(transport).execute('search',{query:'test',pageSize:5},signal())).rejects.toMatchObject({code:'PROVIDER_LOGIN_REQUIRED'});
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('QQ searches full metadata and revalidates before obtaining a bounded HTTPS free source',async()=>{
    const transport=vi.fn<PublicWebTransport>().mockResolvedValueOnce({code:0,'music.search.SearchCgiService':{code:0,data:{meta:{is_filter:0,sum:1},body:{song:{list:[detail().req.data.track_info]}}}}}).mockResolvedValueOnce(detail()).mockResolvedValueOnce(playback());
    const api=new QQPublicApi(transport,()=>1000);
    expect(await api.search({query:'Breaktime',pageSize:5},signal())).toMatchObject([{providerId:'qq',trackId:id,isAvailable:true}]);
    const source=await api.playback(input,signal());
    expect(source.expiresAt).toBe(301000);expect(new URL(source.url).protocol).toBe('https:');
    expect(transport.mock.calls.every(call=>!JSON.stringify(call[1]).includes('Cookie'))).toBe(true);
  });
  it('QQ rejects paid metadata before requesting an audio URL',async()=>{
    const transport=vi.fn<PublicWebTransport>().mockResolvedValue(detail(1));
    await expect(new QQPublicApi(transport).playback(input,signal())).rejects.toMatchObject({code:'PROVIDER_RIGHTS_RESTRICTED'});
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it.each(['https://127.0.0.1/a.m4a','https://aqqmusic.tc.qq.com.evil.test/a.m4a','/preview/30s.m4a','/C400abc.enc'])('QQ rejects foreign, preview or encrypted sources: %s',async purl=>{
    const transport=vi.fn<PublicWebTransport>().mockResolvedValueOnce(detail()).mockResolvedValueOnce(playback(purl));
    await expect(new QQPublicApi(transport).playback(input,signal())).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
  });
  it('rejects malformed responses and unsupported pagination rather than claiming empty results',async()=>{
    const api=new QQPublicApi(async()=>({code:0,'music.search.SearchCgiService':{code:0,data:{meta:{is_filter:0,sum:1},body:{song:{list:[{mid:'wrong'}]}}}}}));
    await expect(api.search({query:'x',pageSize:5},signal())).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
    await expect(api.search({query:'x',pageSize:5,cursor:'next'},signal())).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
  });
  it('Kugou search does not invent playback rights or credentials',async()=>{
    const transport=vi.fn<PublicWebTransport>().mockResolvedValue({status:1,error_code:0,data:{lists:[{EMixSongID:'thi7s0a',SongName:'Breaktime',SingerName:'Kevin MacLeod',Duration:126}]}});
    const api=new KugouPublicApi(transport,()=>1000);
    expect(await api.execute('search',{query:'Breaktime',pageSize:5},signal())).toMatchObject([{providerId:'kugou',isAvailable:false,rights:'unavailable'}]);
    expect(transport.mock.calls[0]?.[1]).toMatchObject({mid:'0',userid:'0',token:''});
    await expect(api.execute('resolvePlayback',input,signal())).rejects.toMatchObject({code:'PROVIDER_DISABLED'});
  });
  it('drops a late public result after cancellation',async()=>{
    const abort=new AbortController();const api=new QQPublicApi(async()=>{abort.abort();return detail();});
    await expect(api.trackDetails({trackId:id},abort.signal)).rejects.toMatchObject({name:'AbortError'});
  });
  it('does not advertise login or dispatch unsupported private capabilities',async()=>{
    const worker={request:vi.fn(),dispose:vi.fn()} as unknown as ProviderWorkerSupervisor;
    const coordinator=new ProviderCoordinator({experimentalBuild:true,consentGranted:true,enabledProviders:{qq:true,kugou:true}});
    coordinator.register('qq',()=>new PublicDesktopAdapter('qq',worker));
    coordinator.register('kugou',()=>new PublicDesktopAdapter('kugou',worker));
    expect(coordinator.statuses(['qq','kugou'])).toMatchObject([{supportsLogin:false,capabilities:['search','playback']},{supportsLogin:false,capabilities:['search']}]);
    await expect(coordinator.playlists('qq')).rejects.toMatchObject({code:'PROVIDER_DISABLED'});
    await expect(coordinator.withLoginAdapter('qq',async()=>true)).rejects.toMatchObject({code:'PROVIDER_DISABLED'});
    expect(worker.request).not.toHaveBeenCalled();await coordinator.dispose();
  });
});
