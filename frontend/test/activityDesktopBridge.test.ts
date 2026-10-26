import {afterEach,describe,it,expect,vi} from 'vitest';
import {AxiosHeaders} from 'axios';
import {desktopCloudAdapter} from '../src/services/desktopCloud';
import {CloudClient} from '../../desktop/src/main/cloud/client';

afterEach(()=>vi.unstubAllGlobals());
describe('activity renderer to real desktop policy and cloud client',()=>{
  it('carries live reads and every legacy/new outbox state through the actual main-process boundary',async()=>{
    const fetcher=vi.fn(async(url:string,init?:RequestInit)=>{
      let data:unknown={date:'2026-10-26',timeZone:'Asia/Shanghai',segments:[],partial:false,hasLegacy:false};
      if(url.endsWith('/auth/csrf'))data={token:'fixture-csrf'};
      else if(init?.method==='POST'){const batch=JSON.parse(String(init.body));data={status:'committed',requestId:batch.requestId,sequence:batch.sequence};}
      return new Response(JSON.stringify({success:true,data}),{headers:{'content-type':'application/json'}});
    });
    const client=new CloudClient('https://cloud.invalid',fetcher,vi.fn(),vi.fn());
    vi.stubGlobal('window',{studyRoomDesktop:{cloud:{request:(request:unknown)=>client.request(request)}}});
    const headers=new AxiosHeaders({Cookie:'renderer-cookie-must-not-cross'});
    const live=await desktopCloudAdapter({method:'get',url:'/activity/live',headers});expect(live.status).toBe(200);expect((live.data as any).data.timeZone).toBe('Asia/Shanghai');
    for(const state of ['FOCUS','IDLE','FOCUS_V3','ONLINE','RELAX']){
      const data={requestId:crypto.randomUUID(),sessionId:crypto.randomUUID(),sequence:1,partial:false,segments:[{startMs:10000,endMs:11000,state}]};
      const response=await desktopCloudAdapter({method:'post',url:'/activity/intervals',data:JSON.stringify(data),headers});expect(response.status).toBe(200);expect((response.data as any).data.requestId).toBe(data.requestId);
    }
    const writes=fetcher.mock.calls.filter(([url])=>url.endsWith('/activity/intervals'));expect(writes).toHaveLength(5);
    for(const [,init] of writes){expect(init?.headers).not.toHaveProperty('Cookie');expect(init?.headers).toHaveProperty('X-CSRF-Token','fixture-csrf');}
  });
  it('rejects owner injection before any network dispatch through the renderer/main chain',async()=>{
    const fetcher=vi.fn();const client=new CloudClient('https://cloud.invalid',fetcher,vi.fn(),vi.fn());vi.stubGlobal('window',{studyRoomDesktop:{cloud:{request:(request:unknown)=>client.request(request)}}});
    await expect(desktopCloudAdapter({method:'get',url:'/activity/live',params:{ownerId:'2'},headers:new AxiosHeaders()})).rejects.toThrow();expect(fetcher).not.toHaveBeenCalled();
  });
});
