import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {useProvidersStore} from '../src/stores/providers';
const bridge={searchProviderTracks:vi.fn(),searchAggregatedTracks:vi.fn()};
const track=(id:string)=>({id,source:{kind:'provider',providerId:'qq',trackId:id}});
describe('QQ search pages',()=>{
 beforeEach(()=>{setActivePinia(createPinia());vi.resetAllMocks();vi.stubGlobal('window',{studyRoomDesktop:bridge});});afterEach(()=>vi.unstubAllGlobals());
 it('loads separate pages and deduplicates without replaying a cursor',async()=>{
  bridge.searchProviderTracks.mockResolvedValueOnce({providerId:'qq',items:[track('1')],nextCursor:'2'}).mockResolvedValueOnce({providerId:'qq',items:[track('1'),track('2')],nextCursor:'2'});
  const store=useProvidersStore();await store.search('test','qq');await store.loadMore();expect(store.tracks).toHaveLength(2);expect(store.nextCursor).toBeUndefined();expect(bridge.searchProviderTracks.mock.calls[1][0]).toMatchObject({query:'test',cursor:'2'});expect(bridge.searchAggregatedTracks).not.toHaveBeenCalled();
 });
 it('keeps the previous page on network failure and retries that same page',async()=>{
  bridge.searchProviderTracks.mockResolvedValueOnce({providerId:'qq',items:[track('1')],nextCursor:'2'}).mockRejectedValueOnce(new Error('PROVIDER_TIMEOUT')).mockResolvedValueOnce({providerId:'qq',items:[track('2')]});const store=useProvidersStore();await store.search('test','qq');await store.loadMore();expect(store.tracks).toHaveLength(1);expect(store.error).toContain('超时');await store.retrySearch();expect(bridge.searchProviderTracks.mock.calls[2][0].cursor).toBe('2');expect(store.tracks).toHaveLength(2);
 });
 it('does not append an old page after a new query or logout',async()=>{
  let resolve!:(v:unknown)=>void;bridge.searchProviderTracks.mockResolvedValueOnce({providerId:'qq',items:[track('1')],nextCursor:'2'}).mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValueOnce({providerId:'qq',items:[track('3')]});const store=useProvidersStore();await store.search('old','qq');const pending=store.loadMore();await store.search('new','qq');resolve({providerId:'qq',items:[track('2')]});await pending;expect(store.tracks.map(t=>t.id)).toEqual(['3']);store.invalidateIdentity();expect(store.tracks).toEqual([]);
 });
 it('clears search state when the verified session expires and rejects wrong-provider replies',async()=>{
  bridge.searchProviderTracks.mockResolvedValueOnce({providerId:'qq',items:[track('1')],nextCursor:'2'}).mockRejectedValueOnce(new Error('PROVIDER_SESSION_EXPIRED'));const store=useProvidersStore();await store.search('test','qq');await store.loadMore();expect(store.tracks).toEqual([]);expect(store.nextCursor).toBeUndefined();expect(store.error).toContain('登录已失效');bridge.searchProviderTracks.mockResolvedValue({providerId:'kugou',items:[]});await store.search('x','qq');expect(store.error).toContain('接口发生变化');
 });
});
