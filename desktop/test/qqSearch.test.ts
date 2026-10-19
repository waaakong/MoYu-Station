import {describe,it,expect,vi} from 'vitest';
import {QQPublicApi} from '../src/providers/adapters/qq/publicApi';
import {QQAccountApi} from '../src/providers/adapters/qq/accountApi';
import type {PublicWebTransport,QQWebTransport} from '../src/providers/adapters/publicWebTransport';
const key='music.search.SearchCgiService',signal=()=>new AbortController().signal;
const song={mid:'0026XoN00Y92BW',name:'Test song',singer:[{name:'Test artist'}],interval:126,pay:{pay_play:0}};
const response=(list:unknown[]=[song],sum=3,filter=0)=>({code:0,[key]:{code:0,data:{meta:{sum,is_filter:filter},body:{song:{list}}}}});
describe('QQ full authenticated search',()=>{
 it('uses the verified module envelope without comm; carries the real next page',async()=>{
  const transport=vi.fn<PublicWebTransport>().mockResolvedValue(response());const api=new QQPublicApi(transport);
  const page=await api.searchPage({query:'test',pageSize:1,cursor:'2'},signal());
  expect(transport.mock.calls[0]?.[2]).toEqual({[key]:{module:key,method:'DoSearchForQQMusicDesktop',param:{search_type:0,query:'test',page_num:2,num_per_page:1}}});
  expect(page).toMatchObject({providerId:'qq',nextCursor:'3',items:[{source:{providerId:'qq',trackId:song.mid}}]});
  transport.mockResolvedValue(response([song],3));expect((await api.searchPage({query:'test',pageSize:1,cursor:'3'},signal())).nextCursor).toBeUndefined();
 });
 it.each([-9,-12,1])('does not turn filtered %s into empty success or suggestion fallback',async filter=>{
  const transport=vi.fn<PublicWebTransport>().mockResolvedValue(response([],0,filter));await expect(new QQPublicApi(transport).searchPage({query:'test',pageSize:1},signal())).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});expect(transport).toHaveBeenCalledTimes(1);
 });
 it('distinguishes genuine empty, missing rows, and unknown rights',async()=>{
  const transport=vi.fn<PublicWebTransport>().mockResolvedValue(response([],0)),api=new QQPublicApi(transport);
  expect((await api.searchPage({query:'test',pageSize:1},signal())).items).toEqual([]);
  transport.mockResolvedValue(response([],2));await expect(api.searchPage({query:'test',pageSize:1},signal())).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
  transport.mockResolvedValue(response([{...song,pay:undefined}],1));await expect(api.searchPage({query:'test',pageSize:1},signal())).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
  transport.mockResolvedValue(response([{...song,pay:{pay_play:1}}],1));expect((await api.search({query:'test',pageSize:1},signal()))[0]).toMatchObject({isAvailable:false,rights:'subscription-required'});
 });
 it('requires the own account and retains cookies without adding incompatible comm',async()=>{
  const transport=vi.fn<QQWebTransport>().mockResolvedValueOnce({code:0,data:{creator:{uin:'123456',nick:'Test'}}}).mockResolvedValueOnce(response());
  const session={qqmusic_uin:'123456',qqmusic_key:'test-only-key'};
  await new QQAccountApi(transport).execute('searchPage',{input:{query:'test',pageSize:1},session},signal());
  expect(transport.mock.calls[1]?.[3]).toEqual(session);expect(transport.mock.calls[1]?.[2]).not.toHaveProperty('comm');
  await expect(new QQAccountApi(transport).execute('searchPage',{input:{query:'test',pageSize:1}},signal())).rejects.toMatchObject({code:'PROVIDER_LOGIN_REQUIRED'});
 });
 it('rejects expired and canceled search replies',async()=>{
  const transport=vi.fn<PublicWebTransport>().mockResolvedValue({code:0,[key]:{code:1000}});await expect(new QQPublicApi(transport).searchPage({query:'test',pageSize:1},signal())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
  const controller=new AbortController();transport.mockImplementation(async()=>{controller.abort();return response()});await expect(new QQPublicApi(transport).searchPage({query:'test',pageSize:1},controller.signal)).rejects.toMatchObject({name:'AbortError'});
 });
});
