import {beforeEach,it,expect,vi} from 'vitest';import {createPinia,setActivePinia} from 'pinia';import {ApiError} from '../src/services/http';
const api=vi.hoisted(()=>({fetchAdminPage:vi.fn(),updateAdminUserType:vi.fn(),updateFeedbackStatus:vi.fn(),deleteAdminFeedback:vi.fn(),reverifyAdmin:vi.fn()}));
vi.mock('../src/services/admin',async original=>({...await original<typeof import('../src/services/admin')>(),...api}));
import {useAdminStore} from '../src/stores/admin';import {useAuthStore} from '../src/stores/auth';
const row=()=>({id:'3',username:'member',userType:'NORMAL',adminVersion:'0'});
beforeEach(()=>{setActivePinia(createPinia());vi.resetAllMocks();useAuthStore().user={id:'1',userType:'ADMIN'} as any;api.fetchAdminPage.mockResolvedValue({items:[],nextCursor:null,versionedWrites:true});});
it('server role filtering invalidates a late page and never filters only loaded rows',async()=>{
  const store=useAdminStore();let finish!:(value:unknown)=>void;api.fetchAdminPage.mockImplementationOnce(()=>new Promise(r=>finish=r));const first=store.load('users');await store.filterUsers('MUTED');finish({items:[row()],nextCursor:'old',versionedWrites:true});await first;expect(store.users).toEqual([]);expect(store.userFilter).toBe('MUTED');expect(api.fetchAdminPage.mock.calls[1][2]).toBe('MUTED');
});
it('keeps original action and displayed role on conflict without auto retry',async()=>{
  const store=useAdminStore(),user=row();store.users=[user];api.updateAdminUserType.mockRejectedValue(new ApiError('conflict',{code:'ADMIN_VERSION_CONFLICT'}));await store.changeUserType(user,'MUTED');expect(user.userType).toBe('NORMAL');expect(store.errors.action).toContain('MUTED');expect(api.updateAdminUserType.mock.calls[0].slice(0,3)).toEqual(['3','MUTED','0']);expect(api.fetchAdminPage).not.toHaveBeenCalled();
});
it('fixed target survives reverification without rebinding to a mutated row',async()=>{
  const store=useAdminStore(),user=row();api.updateAdminUserType.mockRejectedValueOnce(new ApiError('verify',{code:'ADMIN_REVERIFY_REQUIRED'})).mockResolvedValueOnce(undefined);await store.changeUserType(user,'MUTED');user.id='9';user.adminVersion='5';await store.confirmReverification('fixture');expect(api.updateAdminUserType.mock.calls[1].slice(0,3)).toEqual(['3','MUTED','0']);
});
it('account switch drops a late response and cannot populate the next account',async()=>{
  let finish!:()=>void;api.updateAdminUserType.mockImplementation(()=>new Promise<void>(r=>finish=r));const store=useAdminStore(),flight=store.changeUserType(row(),'MUTED');useAuthStore().clearLocalSession();useAuthStore().user={id:'2',userType:'ADMIN'} as any;finish();await flight;expect(store.recordMessage).toBe('');expect(api.fetchAdminPage).not.toHaveBeenCalled();
});
it('coalesces double clicks and reports unknown outcomes without marking saved',async()=>{
  let fail!:(error:unknown)=>void;api.updateAdminUserType.mockImplementation(()=>new Promise((_,r)=>fail=r));const store=useAdminStore(),user=row(),first=store.changeUserType(user,'MUTED');await store.changeUserType(user,'BANNED');expect(api.updateAdminUserType).toHaveBeenCalledTimes(1);fail(new Error('lost'));await first;expect(store.recordMessage).toBe('');expect(store.errors.action).toContain('结果未确认');
});
it('refresh discards an older next page and disabled capability prevents writes',async()=>{
  const store=useAdminStore();store.pageCursors.users='old';let finish!:(v:unknown)=>void;api.fetchAdminPage.mockImplementationOnce(()=>new Promise(r=>finish=r));const old=store.loadMoreRecords('users');await store.load('users');finish({items:[row()],nextCursor:'late',versionedWrites:true});await old;expect(store.users).toEqual([]);await store.changeUserType({...row(),adminVersion:null},'MUTED');expect(api.updateAdminUserType).not.toHaveBeenCalled();
});
