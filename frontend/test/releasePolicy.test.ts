import {beforeEach,it,expect,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {ApiError} from '../src/services/http';
const api=vi.hoisted(()=>({fetchReleasePage:vi.fn(),fetchClientRelease:vi.fn(),fetchMemberPage:vi.fn(),fetchUpdateMember:vi.fn(),setUpdateMember:vi.fn(),updateClientRelease:vi.fn()}));
vi.mock('../src/services/clientUpdates',()=>api);
import {useAdminStore} from '../src/stores/admin';
import {useAuthStore} from '../src/stores/auth';
const release=()=>({id:'2104509220480131074',releaseId:'stable-0.3.1',version:'0.3.1',channel:'stable',status:'PILOT' as const,rolloutPercentage:0,mandatory:false,minimumSupportedVersion:null,releaseNotes:null,policyVersion:'0',createdAt:'2026-09-29T10:00:00'});
const patch=()=>({status:'FULL',rolloutPercentage:100,reason:'明确发布'} as any);
beforeEach(()=>{setActivePinia(createPinia());vi.resetAllMocks();useAuthStore().user={id:'1',username:'admin',userType:'ADMIN'} as any;api.fetchReleasePage.mockResolvedValue({items:[],nextCursor:null,versionedPolicyEnabled:true});api.fetchMemberPage.mockResolvedValue({items:[],nextCursor:null,versionedWrites:true});useAdminStore().releasePolicyEnabled=true;});
it('freezes the selected release and reason, and coalesces double confirmation',async()=>{
  const store=useAdminStore(),row=release(),intent=patch();let finish!:()=>void;api.updateClientRelease.mockImplementation(()=>new Promise<void>(r=>finish=r));
  store.changeRelease(row,intent);row.id='2';intent.reason='changed';const first=store.submitRelease();await store.submitRelease();
  expect(api.updateClientRelease).toHaveBeenCalledTimes(1);expect(api.updateClientRelease.mock.calls[0][0].id).toBe('2104509220480131074');expect(api.updateClientRelease.mock.calls[0][1].reason).toBe('明确发布');finish();await first;expect(store.releaseIntent).toBeNull();
});
it('preserves conflict intention and requires two explicit decisions before resubmitting',async()=>{
  const store=useAdminStore();store.changeRelease(release(),patch());api.updateClientRelease.mockRejectedValueOnce(new ApiError('conflict',{code:'RELEASE_VERSION_CONFLICT'}));await store.submitRelease();
  expect(store.releaseIntent?.state).toBe('conflict');api.fetchClientRelease.mockResolvedValue({...release(),status:'PAUSED',policyVersion:'1'});await store.inspectRelease();await store.submitRelease();expect(api.updateClientRelease).toHaveBeenCalledTimes(1);
  store.rebaseRelease();expect(store.releaseIntent?.patch.status).toBe('FULL');expect(api.updateClientRelease).toHaveBeenCalledTimes(1);await store.submitRelease();expect(api.updateClientRelease.mock.calls[1][0].policyVersion).toBe('1');
});
it('unknown outcome only reads the original target, never automatically retries',async()=>{
  const store=useAdminStore();store.changeRelease(release(),patch());api.updateClientRelease.mockRejectedValueOnce(new ApiError('lost',{code:'CLOUD_REQUEST_FAILED'}));await store.submitRelease();expect(store.releaseIntent?.state).toBe('unknown');
  api.fetchClientRelease.mockResolvedValue({...release(),status:'FULL',rolloutPercentage:100,policyVersion:'1'});await store.inspectRelease();expect(api.fetchClientRelease.mock.calls[0][0]).toBe(release().id);expect(api.updateClientRelease).toHaveBeenCalledTimes(1);expect(store.releaseIntent?.message).toContain('不证明原请求一定成功');
});
it('withdrawn current state cannot rebase or submit',async()=>{
  const store=useAdminStore();store.changeRelease({...release(),status:'WITHDRAWN'},patch());expect(store.releaseIntent).toBeNull();store.changeRelease(release(),patch());
  api.fetchClientRelease.mockResolvedValue({...release(),status:'WITHDRAWN',policyVersion:'1'});await store.inspectRelease();store.rebaseRelease();await store.submitRelease();expect(api.updateClientRelease).not.toHaveBeenCalled();
});
it('late successful response cannot refresh or change the next account state',async()=>{
  let resolve!:(v:unknown)=>void;api.updateClientRelease.mockImplementation(()=>new Promise(r=>resolve=r));const store=useAdminStore();store.changeRelease(release(),patch());const flight=store.submitRelease();useAuthStore().clearLocalSession();useAuthStore().user={id:'2',userType:'ADMIN'} as any;resolve({});await flight;expect(store.releaseMessage).toBe('');expect(api.fetchReleasePage).not.toHaveBeenCalled();
});
it('refresh ignores an older reverse-order response',async()=>{
  let resolve!:(v:unknown)=>void;api.fetchReleasePage.mockImplementationOnce(()=>new Promise(r=>resolve=r));const store=useAdminStore();const old=store.load('releases');await store.load('releases');resolve({items:[release()],nextCursor:'old',versionedPolicyEnabled:true});await old;expect(store.releases).toEqual([]);expect(store.releaseCursor).toBeNull();
});
it('refresh invalidates an in-flight next page and deduplicates repeated IDs',async()=>{
  const store=useAdminStore();store.releases=[release()];store.releaseCursor='cursor';api.fetchReleasePage.mockResolvedValueOnce({items:[release(),{...release(),id:'2'}],nextCursor:'next',versionedPolicyEnabled:true});await store.loadMoreReleases();expect(store.releases).toHaveLength(2);
  let resolve!:(v:unknown)=>void;api.fetchReleasePage.mockImplementationOnce(()=>new Promise(r=>resolve=r));const old=store.loadMoreReleases();await store.load('releases');resolve({items:[release()],nextCursor:'old',versionedPolicyEnabled:true});await old;expect(store.releases).toEqual([]);expect(store.releaseMoreBusy).toBe(false);
});
it('disabled capability cannot create a pending policy action',()=>{const store=useAdminStore();store.releasePolicyEnabled=false;store.changeRelease(release(),patch());expect(store.releaseIntent).toBeNull();});
