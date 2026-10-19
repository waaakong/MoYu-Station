import { describe,expect,it,vi } from 'vitest';
import { QQAccountApi } from '../src/providers/adapters/qq/accountApi';
import { QQDesktopAdapter } from '../src/providers/adapters/qq/desktopAdapter';
import { selectQQSession } from '../src/providers/adapters/qq/session';
import type { QQWebTransport } from '../src/providers/adapters/publicWebTransport';
import type { CredentialVault } from '../src/storage/credentialVault';
import type { ProviderWorkerSupervisor } from '../src/providers/core/providerWorkerSupervisor';
import { ProviderError } from '../src/providers/core/providerErrors';

const session={qqmusic_uin:'123456',qqmusic_key:'test-only-not-a-real-key'};
const profile={code:0,data:{creator:{uin:'123456',nick:'Test account'},mymusic:[{type:1,id:'98765'}]}};
const signal=()=>new AbortController().signal;
const context=()=>({signal:signal(),correlationId:'test'});
function fixture(request=vi.fn()){
  const vault={readSession:vi.fn(),storeSession:vi.fn()} as unknown as CredentialVault;
  const worker={request,dispose:vi.fn()} as unknown as ProviderWorkerSupervisor;
  return{vault,worker,adapter:new QQDesktopAdapter(worker,vault)};
}
describe('QQ own-account and read-only collections',()=>{
  it('accepts current official uin cookies but rejects contradictory identities',()=>{
    expect(selectQQSession([{name:'uin',value:'o00123456'},{name:'qqmusic_key',value:session.qqmusic_key},{name:'login_type',value:'1'}])).toMatchObject({qqmusic_uin:'123456',uin:'o00123456'});
    expect(selectQQSession([{name:'uin',value:'654321'},...Object.entries(session).map(([name,value])=>({name,value}))])).toBeUndefined();
  });
  it('requires a server-verified matching own account, never a public profile target',async()=>{
    const transport=vi.fn<QQWebTransport>().mockResolvedValue(profile);
    expect(await new QQAccountApi(transport).account(session,signal())).toEqual({accountId:'123456',displayName:'Test account'});
    expect(transport.mock.calls[0]?.[1]).toMatchObject({userid:'0'});
    transport.mockResolvedValue({code:0,data:{creator:{uin:'654321',nick:'Other'}}});
    await expect(new QQAccountApi(transport).account(session,signal())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
  });
  it.each([1000,-1000])('maps expiry %s without anonymous retry',async code=>{
    const transport=vi.fn<QQWebTransport>().mockResolvedValue({code,data:{}});
    await expect(new QQAccountApi(transport).execute('search',{input:{query:'x',pageSize:5},session},signal())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('accepts redacted identity only on a verified own-account response',async()=>{
    const transport=vi.fn<QQWebTransport>();const api=new QQAccountApi(transport);
    transport.mockResolvedValue({code:0,data:{creator:{uin:0,nick:'Test',ishost:1,encrypt_uin:'opaque_test_123'}}});
    await expect(api.account(session,signal())).resolves.toMatchObject({accountId:'123456'});
    for(const creator of [{uin:0,nick:'Test'},{uin:0,nick:'Test',ishost:0,encrypt_uin:'opaque_test_123'},{uin:'123456',nick:'Test',ishost:0}]){
      transport.mockResolvedValue({code:0,data:{creator}});
      await expect(api.account(session,signal())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
    }
  });
  it('uses stable playlist offsets and keeps large IDs as strings',async()=>{
    const transport=vi.fn<QQWebTransport>().mockResolvedValueOnce(profile).mockResolvedValueOnce({code:0,data:{totoal:3,disslist:[{tid:'9007199254740993',dirid:1,diss_name:'Test',song_cnt:'2'}]}});
    expect(await new QQAccountApi(transport).playlists({pageSize:1,cursor:'1'},session,signal())).toMatchObject({items:[{id:'9007199254740993',trackCount:2}],nextCursor:'2'});
    expect(transport.mock.calls[1]?.[1]).toMatchObject({hostuin:'123456',sin:'1',size:'1'});
  });
  it('uses only the verified favorite collection and read RPC',async()=>{
    const transport=vi.fn<QQWebTransport>().mockResolvedValueOnce(profile).mockResolvedValueOnce({code:0,req:{code:0,data:{total_song_num:0,songlist:[]}}});
    expect(await new QQAccountApi(transport).collection('favorites',{pageSize:5},session,signal())).toMatchObject({items:[],nextCursor:undefined});
    expect(transport.mock.calls[1]?.[2]).toMatchObject({req:{module:'music.srfDissInfo.aiDissInfo',method:'uniform_get_Dissinfo',param:{disstid:98765}}});
  });
  it('omits unsupported purchase/upload entries without changing the server cursor',async()=>{
    const entry={diss_name:'Special',song_cnt:0};
    const transport=vi.fn<QQWebTransport>().mockResolvedValueOnce(profile).mockResolvedValueOnce({code:0,data:{totoal:4,disslist:[{...entry,tid:0,dirid:205},{...entry,tid:'98765',dirid:201},{...entry,tid:0,dirid:206}]}});
    await expect(new QQAccountApi(transport).playlists({pageSize:3},session,signal())).resolves.toMatchObject({items:[{id:'98765'}],nextCursor:'3'});
  });
  it('never rounds a playlist ID to fit a numeric RPC parameter',async()=>{
    const transport=vi.fn<QQWebTransport>().mockResolvedValue(profile);
    await expect(new QQAccountApi(transport).collection('playlistTracks',{playlistId:'9007199254740993',pageSize:5},session,signal())).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('does not treat an inner RPC error as an empty successful collection',async()=>{
    const transport=vi.fn<QQWebTransport>().mockResolvedValueOnce(profile).mockResolvedValueOnce({code:0,req:{code:0,data:{code:1000,total_song_num:0,songlist:[]}}});
    await expect(new QQAccountApi(transport).collection('favorites',{pageSize:5},session,signal())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
  });
  it('ignores non-playlist section IDs but strictly validates favorites',async()=>{
    const transport=vi.fn<QQWebTransport>().mockResolvedValue({code:0,data:{...profile.data,mymusic:[{type:5,id:''},{type:1,id:'98765'},{type:2,id:'not-a-playlist'}]}});
    await expect(new QQAccountApi(transport).account(session,signal())).resolves.toMatchObject({accountId:'123456'});
    for(const favoriteId of ['', 'invalid', '0', 9007199254740992]){
      transport.mockResolvedValue({code:0,data:{...profile.data,mymusic:[{type:1,id:favoriteId}]}});
      await expect(new QQAccountApi(transport).collection('favorites',{pageSize:5},session,signal())).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
    }
  });
  it('does not turn malformed/unknown collections into empty success',async()=>{
    const transport=vi.fn<QQWebTransport>().mockResolvedValue({code:0,data:{creator:{uin:'123456',nick:'Test'}}});
    await expect(new QQAccountApi(transport).collection('favorites',{pageSize:5},session,signal())).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
    await expect(new QQAccountApi(transport).playlists({pageSize:5},undefined,signal())).rejects.toMatchObject({code:'PROVIDER_LOGIN_REQUIRED'});
  });
  it('does not accept injected headers, unrelated cookies or a WeChat identity',()=>{
    expect(selectQQSession([{name:'qqmusic_uin',value:'123456'},{name:'qqmusic_key',value:'bad\r\nCookie: other'}])).toBeUndefined();
    expect(selectQQSession([...Object.entries(session).map(([name,value])=>({name,value})),{name:'login_type',value:'2'}])).toBeUndefined();
    expect(selectQQSession([...Object.entries(session).map(([name,value])=>({name,value})),{name:'unrelated',value:'discard'}])).toEqual(session);
  });
  it('persists only after verification, keeps account values out of status',async()=>{
    const f=fixture(vi.fn().mockResolvedValue({accountId:'123456',displayName:'Test'}));
    await f.adapter.acceptLogin(session,signal());expect(f.vault.storeSession).toHaveBeenCalledTimes(1);
    expect(f.adapter.cachedAccount()).toMatchObject({state:'signed-in'});
    expect(JSON.stringify(f.adapter.cachedAccount())).not.toContain(session.qqmusic_key);
  });
  it('does not commit a canceled login or a mismatching account',async()=>{
    let finish!:(v:unknown)=>void;const f=fixture(vi.fn().mockImplementation(()=>new Promise(done=>finish=done)));
    const pending=f.adapter.acceptLogin(session,signal());const rejection=expect(pending).rejects.toMatchObject({name:'AbortError'});
    await f.adapter.logout();finish({accountId:'123456',displayName:'Test'});await rejection;expect(f.vault.storeSession).not.toHaveBeenCalled();
    const mismatch=fixture(vi.fn().mockResolvedValue({accountId:'654321',displayName:'Other'}));
    await expect(mismatch.adapter.acceptLogin(session,signal())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});expect(mismatch.vault.storeSession).not.toHaveBeenCalled();
  });
  it('drops a late private collection after logout',async()=>{
    let finish!:(v:unknown)=>void;const request=vi.fn().mockResolvedValueOnce({accountId:'123456',displayName:'Test'}).mockImplementationOnce(()=>new Promise(done=>finish=done));const f=fixture(request);
    await f.adapter.acceptLogin(session,signal());const pending=f.adapter.playlists({pageSize:5},context());const rejection=expect(pending).rejects.toMatchObject({name:'AbortError'});
    await f.adapter.logout();finish({providerId:'qq',items:[],fromCache:false});await rejection;
  });
  it('expired saved sessions cannot silently fall back to anonymous playback',async()=>{
    const request=vi.fn().mockRejectedValue(new ProviderError('PROVIDER_SESSION_EXPIRED')),f=fixture(request);
    vi.mocked(f.vault.readSession).mockReturnValue({version:1,values:session});
    await expect(f.adapter.accountSummary(context())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
    await expect(f.adapter.search({query:'x',pageSize:5},context())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
    expect(request).toHaveBeenCalledTimes(1);expect(f.adapter.cachedAccount().state).toBe('expired');
  });
});
