import {describe,it,expect,vi} from 'vitest';
import {createRemoteMediaResponse,RemoteMediaSessionRegistry,type RemoteMediaSource} from '../src/audio/protocol/remoteMediaProtocol';
function fixture(){
  let now=1000;
  const registry=new RemoteMediaSessionRegistry(()=>now);
  const source:RemoteMediaSource={kind:'provider',ownerId:'kugou',trackId:'same-recording',playbackSessionId:'same-play',accountScope:'same-account',url:new URL('https://media.example.invalid/recording.mp3?grant=first'),expiresAt:61000,allowedHosts:['media.example.invalid']};
  const fresh=()=>({...source,url:new URL('https://media.example.invalid/recording.mp3?grant=renewed'),expiresAt:now+60000});
  const request=(id:string,range='bytes=4-7')=>new Request(`studyroom-media://provider/${id}`,{headers:{Range:range}});
  return{registry,source,fresh,request,expire:()=>{now=62000;},idle:()=>{now=400000;}};
}
const audio=(tag='"recording-v1"',total=8)=>new Response('abcd',{status:206,headers:{'content-type':'audio/mpeg','content-range':`bytes 4-7/${total}`,etag:tag}});
describe('same-account remote media renewal',()=>{
  it('reauthorizes after the 60-second URL lease and continues the same byte range',async()=>{
    const f=fixture(),refresh=vi.fn(async()=>f.fresh()),token=f.registry.issue(f.source,refresh);
    await createRemoteMediaResponse(f.request(token),f.registry,async()=>audio());f.expire();
    const fetcher=vi.fn(async(url:unknown,init?:RequestInit)=>{
      expect(String(url)).toContain('grant=renewed');
      expect(new Headers(init?.headers).get('range')).toBe('bytes=4-7');
      expect(new Headers(init?.headers).get('if-range')).toBe('"recording-v1"');return audio();
    });
    const response=await createRemoteMediaResponse(f.request(token),f.registry,fetcher as typeof fetch);
    expect(response.status).toBe(206);expect(await response.text()).toBe('abcd');expect(refresh).toHaveBeenCalledOnce();
  });
  it('coalesces concurrent expired ranges into one authorization',async()=>{
    const f=fixture();let finish!:(value:RemoteMediaSource)=>void;
    const refresh=vi.fn(()=>new Promise<RemoteMediaSource>(resolve=>{finish=resolve;})),token=f.registry.issue(f.source,refresh);f.expire();
    const a=createRemoteMediaResponse(f.request(token),f.registry,async()=>audio()),b=createRemoteMediaResponse(f.request(token),f.registry,async()=>audio());
    expect(refresh).toHaveBeenCalledOnce();finish(f.fresh());expect((await a).status).toBe(206);expect((await b).status).toBe(206);
  });
  it('denies a revoked grant without contacting the media server',async()=>{
    const f=fixture(),token=f.registry.issue(f.source,async()=>{throw new Error('RIGHTS_RESTRICTED');}),fetcher=vi.fn();f.expire();
    expect((await createRemoteMediaResponse(f.request(token),f.registry,fetcher)).status).toBe(404);expect(fetcher).not.toHaveBeenCalled();
  });
  it('cannot revive a session invalidated while authorization is pending',async()=>{
    const f=fixture();let finish!:(value:RemoteMediaSource)=>void,signal!:AbortSignal;
    const token=f.registry.issue(f.source,s=>{signal=s;return new Promise(resolve=>{finish=resolve;});}),fetcher=vi.fn();f.expire();
    const pending=createRemoteMediaResponse(f.request(token),f.registry,fetcher);f.registry.invalidateOwner('kugou');
    expect(signal.aborted).toBe(true);finish(f.fresh());expect((await pending).status).toBe(404);expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(['ownerId','trackId','playbackSessionId','accountScope'] as const)('rejects a replacement %s',async field=>{
    const f=fixture(),token=f.registry.issue(f.source,async()=>({...f.fresh(),[field]:'different'})),fetcher=vi.fn();f.expire();
    expect((await createRemoteMediaResponse(f.request(token),f.registry,fetcher)).status).toBe(404);expect(fetcher).not.toHaveBeenCalled();
  });
  it('rejects a changed path without an existing strong entity validator',async()=>{
    const f=fixture(),token=f.registry.issue(f.source,async()=>({...f.fresh(),url:new URL('https://media.example.invalid/other.mp3')})),fetcher=vi.fn();f.expire();
    expect((await createRemoteMediaResponse(f.request(token),f.registry,fetcher)).status).toBe(404);expect(fetcher).not.toHaveBeenCalled();
  });
  it('permits a renewed signed path only when the same strong entity and length are returned',async()=>{
    const f=fixture(),token=f.registry.issue(f.source,async()=>({...f.fresh(),url:new URL('https://media.example.invalid/new-signature/recording.mp3')}));
    await createRemoteMediaResponse(f.request(token),f.registry,async()=>audio());f.expire();
    const response=await createRemoteMediaResponse(f.request(token),f.registry,async()=>audio());
    expect(response.status).toBe(206);expect(await response.text()).toBe('abcd');
  });
  it.each(['http://media.example.invalid/recording.mp3','https://other.example.invalid/recording.mp3','https://media.example.invalid:8443/recording.mp3'])(
    'rejects an unsafe or different media origin %s',async address=>{
      const f=fixture(),token=f.registry.issue(f.source,async()=>({...f.fresh(),url:new URL(address)})),fetcher=vi.fn();f.expire();
      expect((await createRemoteMediaResponse(f.request(token),f.registry,fetcher)).status).toBe(404);expect(fetcher).not.toHaveBeenCalled();
    });
  it.each([['"different"',8],['"recording-v1"',9]] as const)('never appends changed content (%s, %s)',async(tag,total)=>{
    const f=fixture(),token=f.registry.issue(f.source,async()=>f.fresh());
    await createRemoteMediaResponse(f.request(token),f.registry,async()=>audio());f.expire();
    expect((await createRemoteMediaResponse(f.request(token),f.registry,async()=>audio(tag,total))).status).toBe(502);
  });
  it('does not authorize malformed ranges, cancelled requests, or long-idle handles',async()=>{
    const f=fixture(),refresh=vi.fn(async()=>f.fresh()),token=f.registry.issue(f.source,refresh),fetcher=vi.fn();f.expire();
    expect((await createRemoteMediaResponse(f.request(token,'bytes=0-1,5-6'),f.registry,fetcher)).status).toBe(416);
    const controller=new AbortController();controller.abort();
    expect((await createRemoteMediaResponse(new Request(`studyroom-media://provider/${token}`,{signal:controller.signal}),f.registry,fetcher)).status).toBe(404);
    f.idle();expect((await createRemoteMediaResponse(f.request(token),f.registry,fetcher)).status).toBe(404);
    expect(refresh).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
  });
});
