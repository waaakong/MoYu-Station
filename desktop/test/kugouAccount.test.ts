import {describe,it,expect,vi} from 'vitest';
import {selectKugouSession} from '../src/providers/adapters/kugou/session';
import {KugouAccountApi} from '../src/providers/adapters/kugou/accountApi';
import {KugouDesktopAdapter} from '../src/providers/adapters/kugou/desktopAdapter';
import type {CredentialVault} from '../src/storage/credentialVault';
import type {ProviderWorkerSupervisor} from '../src/providers/core/providerWorkerSupervisor';
const session={userid:'1234567890',token:'a'.repeat(64),appid:'1014',clienttime:'1790830000',dfid:'testOnlyDeviceId123456789'};
const cookies=[{name:'KuGoo',value:`KugooID=${session.userid}&t=${session.token}&a_id=1014&ct=${session.clienttime}&KugooPwd=NEVER_COPY&NickName=%FF`},{name:'kg_dfid',value:session.dfid}];
const signal=()=>new AbortController().signal;
const good=()=>({body:'\n',cookies:[{name:'KugooID',value:session.userid},{name:'t',value:session.token}]});
describe('Kugou verified own-account login',()=>{
  it('selects only minimal fields without whole-cookie decoding, password or nickname',()=>{expect(selectKugouSession(cookies)).toEqual(session);expect(JSON.stringify(selectKugouSession(cookies))).not.toContain('NEVER_COPY');});
  it('rejects missing real device ID, duplicate identities and contradictory cookies',()=>{
    expect(selectKugouSession(cookies.slice(0,1))).toBeUndefined();
    expect(selectKugouSession([{...cookies[0]!,value:cookies[0]!.value+'&KugooID=222222'},cookies[1]!])).toBeUndefined();
    expect(selectKugouSession([...cookies,{name:'KugooID',value:'222222'}])).toBeUndefined();
  });
  it('requires server-issued matching ID AND token, not blank response success',async()=>{
    await expect(new KugouAccountApi(async()=>good()).account(session,signal())).resolves.toEqual({accountId:session.userid,displayName:'酷狗账号'});
    for(const response of [{body:'\n',cookies:[]},{...good(),cookies:[{name:'KugooID',value:'222222'},{name:'t',value:session.token}]},{...good(),cookies:[...good().cookies,{name:'t',value:session.token}]}])await expect(new KugouAccountApi(async()=>response).account(session,signal())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
  });
  it.each([['var error_code =20018;\n','PROVIDER_SESSION_EXPIRED'],['var error_code =123;','PROVIDER_UNAVAILABLE'],['unexpected callback()','PROVIDER_API_CHANGED']])('classifies official script without evaluation',async(body,code)=>{await expect(new KugouAccountApi(async()=>({...good(),body})).account(session,signal())).rejects.toMatchObject({code});});
  it('drops canceled response and rejects unsupported private operations',async()=>{
    const controller=new AbortController();await expect(new KugouAccountApi(async()=>{controller.abort();return good();}).account(session,controller.signal)).rejects.toMatchObject({name:'AbortError'});
    await expect(new KugouAccountApi().execute('recommendations',{input:{},session},signal())).rejects.toMatchObject({code:'PROVIDER_DISABLED'});
  });
  it('saves only after verification and restores account without exposing secrets',async()=>{
    const worker={request:vi.fn().mockResolvedValue({accountId:session.userid,displayName:'酷狗账号'}),dispose:vi.fn()};const vault={storeSession:vi.fn(),readSession:vi.fn().mockReturnValue({version:1,values:session})};
    const adapter=new KugouDesktopAdapter(worker as unknown as ProviderWorkerSupervisor,vault as unknown as CredentialVault);
    await adapter.acceptLogin(session,signal());expect(vault.storeSession).toHaveBeenCalledTimes(1);expect(adapter.capabilities).toEqual(['search','playback','lyrics','playlists','favorites']);
    const restored=new KugouDesktopAdapter(worker as unknown as ProviderWorkerSupervisor,vault as unknown as CredentialVault);
    const summary=await restored.accountSummary({signal:signal()} as never);expect(summary.state).toBe('signed-in');expect(JSON.stringify(summary)).not.toContain(session.token);
  });
  it('cannot commit a late login after logout',async()=>{
    let resolve!:(value:unknown)=>void;const worker={request:vi.fn(()=>new Promise(r=>resolve=r)),dispose:vi.fn()},vault={storeSession:vi.fn(),readSession:vi.fn()};
    const adapter=new KugouDesktopAdapter(worker as unknown as ProviderWorkerSupervisor,vault as unknown as CredentialVault);
    const pending=adapter.acceptLogin(session,signal());await adapter.logout();resolve({accountId:session.userid,displayName:'酷狗账号'});
    await expect(pending).rejects.toMatchObject({name:'AbortError'});expect(vault.storeSession).not.toHaveBeenCalled();
  });
});
