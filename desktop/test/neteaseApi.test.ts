import { createDecipheriv, createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { NeteaseApi } from "../src/providers/adapters/netease/api";
import { encodeWeapi } from "../src/providers/adapters/netease/weapi";
import type { NeteaseTransport } from "../src/providers/adapters/netease/transport";
import { neteaseRequestEnvelope } from "../src/providers/adapters/netease/transport";

const signal=()=>new AbortController().signal;
const session={MUSIC_U:"test-session"};
const account={code:200,account:{id:12},profile:{userId:12,nickname:"Test"}};
const song=(id:number|string=1)=>({id,name:"Song",ar:[{name:"Artist"}],al:{name:"Album"},dt:120000,fee:0,privilege:{pl:128000,st:0}});
const playback=(overrides:Record<string,unknown>={})=>({code:200,data:[{id:1,url:"http://m801.music.126.net/song.mp3",code:200,expi:1200,...overrides}]});
const input={trackId:"1",playbackSessionId:"play-1",accountScope:"scope"};

describe("NetEase bounded API normalization",()=>{
  it('uses the native playback envelope with the same session and fixed HTTPS destination',()=>{
    const data={ids:'[1]',level:'standard',encodeType:'mp3'};
    const request=neteaseRequestEnvelope('playback',data,session);
    expect(request.hostname).toBe('interface.music.163.com');expect(request.path).toBe('/eapi/song/enhance/player/url/v1');
    const encoded=new URLSearchParams(request.body).get('params')!;
    const cipher=createDecipheriv('aes-128-ecb',Buffer.from('e82ckenh8dichen8'),null);
    const [path,text,digest]=Buffer.concat([cipher.update(Buffer.from(encoded,'hex')),cipher.final()]).toString().split('-36cd479b6b5-');
    expect(path).toBe('/api/song/enhance/player/url/v1');
    expect(JSON.parse(text!)).toEqual({...data,e_r:false,header:{...session,os:'pc'}});
    expect(digest).toBe(createHash('md5').update(`nobody${path}use${text}md5forencrypt`).digest('hex'));
    expect(request.headers.Cookie).toBe('MUSIC_U=test-session; os=pc');
    expect(request.body).not.toContain(session.MUSIC_U);
    expect(neteaseRequestEnvelope('account',{},session)).toMatchObject({hostname:'music.163.com',path:'/weapi/w/nuser/account/get'});
    expect(neteaseRequestEnvelope('playback',data).headers.Cookie).toBe('os=pc');
  });
  it('rejects invalid sessions, oversized native payloads and arbitrary routes before networking',()=>{
    expect(()=>neteaseRequestEnvelope('playback',{}, {MUSIC_U:'value; injected=1'})).toThrow('PROVIDER_SESSION_EXPIRED');
    expect(()=>neteaseRequestEnvelope('playback',{oversized:'x'.repeat(65536)},session)).toThrow('PROVIDER_UNAVAILABLE');
    expect(()=>neteaseRequestEnvelope('constructor' as never,{},session)).toThrow('PROVIDER_UNAVAILABLE');
  });
  it("encodes interoperable double AES form data without exposing session text",()=>{
    const secret="abcdefghijklmnop",data={csrf_token:"fake",s:"雨"};
    const encoded=encodeWeapi(data,secret);
    const decrypt=(value:string,key:string)=>{const cipher=createDecipheriv("aes-128-cbc",Buffer.from(key),Buffer.from("0102030405060708"));return Buffer.concat([cipher.update(Buffer.from(value,"base64")),cipher.final()]).toString();};
    expect(JSON.parse(decrypt(decrypt(encoded.get("params")!,secret),"0CoJUm6Qyw8W8jud"))).toEqual(data);
    expect(encoded.get("encSecKey")).toMatch(/^[0-9a-f]{256}$/);
    expect(encodeWeapi(data).toString()).not.toBe(encodeWeapi(data).toString());
    expect(()=>encodeWeapi(data,"short")).toThrow("INVALID_PROTOCOL_KEY");
  });
  it("distinguishes anonymous, expired and mismatched account responses",async()=>{
    const transport=vi.fn<NeteaseTransport>().mockResolvedValue({code:200,account:null,profile:null});
    const api=new NeteaseApi(transport);
    expect(await api.account(undefined,signal())).toBeUndefined();
    await expect(api.account(session,signal())).rejects.toMatchObject({code:"PROVIDER_SESSION_EXPIRED"});
    transport.mockResolvedValue(account);expect(await api.account(session,signal())).toEqual({accountId:"12",displayName:"Test"});
    transport.mockResolvedValue({...account,profile:{userId:13,nickname:"Other"}});
    await expect(api.account(session,signal())).rejects.toMatchObject({code:"PROVIDER_API_CHANGED"});
  });
  it("keeps large IDs as strings and requires an explicit playback privilege",async()=>{
    const transport=vi.fn<NeteaseTransport>().mockResolvedValue({code:200,result:{songCount:2,songs:[song("9007199254740993"),{...song(2),fee:1,privilege:null}]}});
    const refs=await new NeteaseApi(transport).search({query:" song ",pageSize:2},undefined,signal());
    expect(refs[0]).toMatchObject({trackId:"9007199254740993",rights:"available",isAvailable:true});
    expect(refs[1]).toMatchObject({rights:"subscription-required",isAvailable:false});
    expect(transport.mock.calls[0]?.[1]).toMatchObject({s:"song",limit:2,offset:0});
  });
  it("rejects unsafe numeric IDs and oversized search inputs",async()=>{
    const transport=vi.fn<NeteaseTransport>().mockResolvedValue({code:200,result:{songCount:1,songs:[song(Number.MAX_SAFE_INTEGER+1)]}});
    const api=new NeteaseApi(transport);
    await expect(api.search({query:"x"},undefined,signal())).rejects.toMatchObject({code:"PROVIDER_API_CHANGED"});
    transport.mockClear();
    await expect(api.search({query:"x",pageSize:100},undefined,signal())).rejects.toMatchObject({code:"PROVIDER_API_CHANGED"});
    expect(transport).not.toHaveBeenCalled();
  });
  it("derives playlist owner from the verified account and pages with a cursor",async()=>{
    const transport=vi.fn<NeteaseTransport>().mockResolvedValueOnce(account).mockResolvedValueOnce({code:200,more:true,playlist:[{id:33,name:"Mine",trackCount:3}]});
    const page=await new NeteaseApi(transport).playlists({cursor:"30",pageSize:1},session,signal());
    expect(page).toMatchObject({nextCursor:"31",items:[{id:"33",name:"Mine"}]});
    expect(transport.mock.calls[1]?.[1]).toMatchObject({uid:"12",offset:30,limit:1});
  });
  it("requires a session for private collections without issuing a request",async()=>{
    const transport=vi.fn<NeteaseTransport>(),api=new NeteaseApi(transport);
    await expect(api.collection("favorites",{},undefined,signal())).rejects.toMatchObject({code:"PROVIDER_LOGIN_REQUIRED"});
    expect(transport).not.toHaveBeenCalled();
  });
  it("keeps collection ID order, omits removed songs and obtains per-track rights",async()=>{
    const transport=vi.fn<NeteaseTransport>().mockResolvedValueOnce(account)
      .mockResolvedValueOnce({code:200,ids:[3,2,1,4]})
      .mockResolvedValueOnce({code:200,songs:[song(1),song(3)],privileges:[{id:1,pl:0,st:0},{id:3,pl:128000,st:0}]});
    const page=await new NeteaseApi(transport).collection("favorites",{pageSize:3},session,signal());
    expect(page.nextCursor).toBe("3");expect(page.items.map(t=>t.id)).toEqual(["netease:3","netease:1"]);
    expect(page.items[1]?.providerCandidates?.[0]?.isAvailable).toBe(false);
    expect(transport.mock.calls[2]?.[1]).toEqual({c:'[{"id":"3"},{"id":"2"},{"id":"1"}]'});
  });
  it("revalidates a single saved track from fresh detail privileges",async()=>{
    const transport=vi.fn<NeteaseTransport>().mockResolvedValue({code:200,songs:[song(1)],privileges:[{id:1,pl:128000,st:0}]});
    const api=new NeteaseApi(transport);
    expect(await api.execute("trackDetails",{input:{trackId:"1"},session},signal())).toMatchObject({providerId:"netease",trackId:"1",rights:"available"});
    expect(transport.mock.calls[0]?.[0]).toBe("details");
    transport.mockResolvedValue({code:200,songs:[song(1)],privileges:[]});
    expect(await api.trackDetails({trackId:"1"},session,signal())).toMatchObject({isAvailable:false});
    transport.mockResolvedValue({code:200,songs:[song(2)],privileges:[{id:2,pl:128000,st:0}]});
    expect(await api.trackDetails({trackId:"1"},session,signal())).toBeUndefined();
  });
  it.each([301,302,429,-460,500])("maps platform error %i without leaking upstream messages",async code=>{
    const api=new NeteaseApi(async()=>({code,message:"private-upstream-text"}));
    await expect(api.account(session,signal())).rejects.toMatchObject({code:[301,302].includes(code)?"PROVIDER_SESSION_EXPIRED":[429,-460].includes(code)?"PROVIDER_RATE_LIMITED":"PROVIDER_UNAVAILABLE"});
  });
  it("upgrades only the official CDN to TLS and bounds token lifetime",async()=>{
    const value=await new NeteaseApi(async()=>playback(),()=>1000).playback(input,undefined,signal());
    expect(value).toMatchObject({url:"https://m801.music.126.net/song.mp3",expiresAt:301000,allowedHosts:["m801.music.126.net"]});
  });
  it.each([
    {freeTrialInfo:{start:0,end:30}}, {url:null}, {code:403}
  ])("rejects preview/rights-limited playback %j",async value=>{
    await expect(new NeteaseApi(async()=>playback(value)).playback(input,session,signal())).rejects.toMatchObject({code:"PROVIDER_RIGHTS_RESTRICTED"});
  });
  // Construct synthetic userinfo instead of embedding a credential-shaped URL in source.
  const credentialUrl = new URL('https://m801.music.126.net/a');
  credentialUrl.username = 'test-user'; credentialUrl.password = 'test-only';
  it.each(["https://music.126.net.attacker.test/a","https://localhost/a",credentialUrl.href,"file:///a","https://m801.music.126.net:444/a"])("rejects unsafe playback URL %s",async url=>{
    await expect(new NeteaseApi(async()=>playback({url})).playback(input,session,signal())).rejects.toMatchObject({code:"PROVIDER_UNAVAILABLE"});
  });
  it("drops a reply arriving after cancellation",async()=>{
    const controller=new AbortController();
    const api=new NeteaseApi(async()=>{controller.abort();return account;});
    await expect(api.account(session,controller.signal)).rejects.toMatchObject({name:"AbortError"});
  });
  it("returns lyrics as text and rejects arbitrary worker operations and secrets",async()=>{
    const api=new NeteaseApi(async()=>({code:200,lrc:{lyric:"[00:01]line"}}));
    expect(await api.lyrics({trackId:"1"},undefined,signal())).toMatchObject({content:"[00:01]line",providerId:"netease"});
    await expect(api.execute("download",{input:{}},signal())).rejects.toMatchObject({code:"PROVIDER_DISABLED"});
    await expect(api.execute("account",{input:{},session:{MUSIC_U:"x; bad=1"}},signal())).rejects.toMatchObject({code:"PROVIDER_API_CHANGED"});
  });
});
