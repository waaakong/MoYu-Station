import { describe, expect, it, vi } from "vitest";
import { NeteaseDesktopAdapter } from "../src/providers/adapters/netease/desktopAdapter";
import type { ProviderWorkerSupervisor } from "../src/providers/core/providerWorkerSupervisor";
import type { CredentialVault } from "../src/storage/credentialVault";
import { ProviderError } from "../src/providers/core/providerErrors";

function setup(){
  const worker={request:vi.fn(),dispose:vi.fn()},vault={readSession:vi.fn(),storeSession:vi.fn()};
  const adapter=new NeteaseDesktopAdapter(worker as unknown as ProviderWorkerSupervisor,vault as unknown as CredentialVault);
  return{adapter,worker,vault};
}
const context=()=>({signal:new AbortController().signal,correlationId:"test"});
describe("NetEase desktop account lifecycle",()=>{
  it("saves credentials only after server verification and emits a sanitized summary",async()=>{
    const {adapter,worker,vault}=setup();worker.request.mockResolvedValue({accountId:"12",displayName:"Test"});
    await adapter.acceptLogin({MUSIC_U:"secret-for-test"},context().signal);
    expect(vault.storeSession).toHaveBeenCalledOnce();
    expect(adapter.cachedAccount()).toMatchObject({state:"signed-in",displayName:"Test"});
    expect(JSON.stringify(adapter.cachedAccount())).not.toContain("secret-for-test");
    expect(JSON.stringify(adapter.cachedAccount())).not.toContain("accountId");
  });
  it("never commits an unverified or cancelled login",async()=>{
    const {adapter,worker,vault}=setup();worker.request.mockResolvedValue(undefined);
    await expect(adapter.acceptLogin({MUSIC_U:"test"},context().signal)).rejects.toMatchObject({code:"PROVIDER_SESSION_EXPIRED"});
    const controller=new AbortController();worker.request.mockImplementation(async()=>{controller.abort();return{accountId:"12",displayName:"Test"};});
    await expect(adapter.acceptLogin({MUSIC_U:"test"},controller.signal)).rejects.toMatchObject({name:"AbortError"});
    expect(vault.storeSession).not.toHaveBeenCalled();
  });
  it("clears account memory on expiration and revokes pending requests on logout",async()=>{
    const {adapter,worker}=setup();worker.request.mockResolvedValue({accountId:"12",displayName:"Test"});
    await adapter.acceptLogin({MUSIC_U:"test"},context().signal);
    worker.request.mockRejectedValue(new ProviderError("PROVIDER_SESSION_EXPIRED"));
    await expect(adapter.accountSummary(context())).rejects.toMatchObject({code:"PROVIDER_SESSION_EXPIRED"});
    expect(adapter.cachedAccount()).toMatchObject({state:"expired",displayName:undefined});
    const calls=worker.request.mock.calls.length;
    await expect(adapter.search({query:'rain',pageSize:30},context())).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});
    expect(worker.request).toHaveBeenCalledTimes(calls);
    worker.request.mockResolvedValue({accountId:'12',displayName:'Test'});
    await adapter.acceptLogin({MUSIC_U:'test-new'},context().signal);
    let finish!:(value:unknown)=>void;
    worker.request.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const pending=adapter.search({query:"rain",pageSize:30},context());await adapter.logout();finish([]);
    await expect(pending).rejects.toMatchObject({name:"AbortError"});expect(worker.dispose).toHaveBeenCalledOnce();
  });
  it("does not report login success when encrypted storage fails",async()=>{
    const {adapter,worker,vault}=setup();worker.request.mockResolvedValue({accountId:"12",displayName:"Test"});
    vault.storeSession.mockImplementation(()=>{throw new Error("SECURE_STORAGE_UNAVAILABLE");});
    await expect(adapter.acceptLogin({MUSIC_U:"test"},context().signal)).rejects.toThrow("SECURE_STORAGE_UNAVAILABLE");
    expect(adapter.cachedAccount().state).toBe("signed-out");
  });
  it("does not let an old request expire the newly verified account",async()=>{
    const {adapter,worker}=setup();let fail!:(error:unknown)=>void;
    worker.request.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{fail=reject;}));
    const old=adapter.search({query:"rain",pageSize:1},context());
    const rejected=expect(old).rejects.toMatchObject({name:"AbortError"});
    worker.request.mockResolvedValue({accountId:"22",displayName:"New"});
    await adapter.acceptLogin({MUSIC_U:"new-test"},context().signal);
    fail(new ProviderError("PROVIDER_SESSION_EXPIRED"));await rejected;
    expect(adapter.cachedAccount()).toMatchObject({state:"signed-in",displayName:"New"});
  });
});
