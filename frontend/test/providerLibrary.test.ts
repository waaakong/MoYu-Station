import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {createPinia,setActivePinia} from 'pinia';
import {useProviderLibraryStore,providerErrorText} from '../src/stores/providerLibrary';
import {useProvidersStore} from '../src/stores/providers';
const bridge={listProviderPlaylists:vi.fn(),listProviderFavorites:vi.fn(),listProviderPlaylistTracks:vi.fn(),listProviderStatuses:vi.fn()};
describe('private provider library',()=>{
 beforeEach(()=>{setActivePinia(createPinia());vi.resetAllMocks();vi.stubGlobal('window',{studyRoomDesktop:bridge});});
 afterEach(()=>vi.unstubAllGlobals());
 it('pages and deduplicates playlists without looping a repeated cursor',async()=>{
  const library=useProviderLibraryStore();library.reset('netease');
  bridge.listProviderPlaylists.mockResolvedValueOnce({providerId:'netease',items:[{id:'1',name:'First'}],nextCursor:'30'}).mockResolvedValueOnce({providerId:'netease',items:[{id:'1',name:'First'},{id:'2',name:'Second'}],nextCursor:'30'});
  await library.open('playlists');await library.load(true);expect(library.playlists).toHaveLength(2);expect(library.nextCursor).toBeUndefined();
 });
 it('drops private data and delayed results immediately on account invalidation',async()=>{
  const library=useProviderLibraryStore();library.reset('netease');let finish!:(v:unknown)=>void;
  bridge.listProviderFavorites.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const request=library.open('favorites');library.reset();finish({providerId:'netease',items:[{id:'private'}]});await request;
  expect(library.tracks).toEqual([]);expect(library.loading).toBe(false);
 });
 it('prevents stale playlist responses overwriting another provider',async()=>{
  const library=useProviderLibraryStore();library.reset('netease');let finish!:(v:unknown)=>void;
  bridge.listProviderPlaylists.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
  const request=library.open('playlists');library.reset('qq');finish({providerId:'netease',items:[{id:'private'}]});await request;
  expect(library.playlists).toEqual([]);expect(library.providerId).toBe('qq');
 });
 it('retains the first page on paging failure and supports explicit retry',async()=>{
  const library=useProviderLibraryStore();library.reset('netease');
  bridge.listProviderFavorites.mockResolvedValueOnce({providerId:'netease',items:[{id:'1'}],nextCursor:'30'}).mockRejectedValueOnce(new Error('PROVIDER_TIMEOUT')).mockResolvedValueOnce({providerId:'netease',items:[{id:'2'}]});
  await library.open('favorites');await library.load(true);expect(library.tracks).toHaveLength(1);expect(library.error).toContain('超时');
  await library.load(true);expect(library.tracks).toHaveLength(2);expect(library.error).toBe('');
 });
 it('uses the exact selected playlist ID and rejects cross-provider replies',async()=>{
  const library=useProviderLibraryStore();library.reset('netease');bridge.listProviderPlaylistTracks.mockResolvedValue({providerId:'qq',items:[]});
  await library.open('playlist',{providerId:'netease',id:'9007199254740993',name:'Mine'});
  expect(bridge.listProviderPlaylistTracks.mock.calls[0][0].playlistId).toBe('9007199254740993');expect(library.error).toContain('接口发生变化');
 });
 it('removes already displayed private items if the session expires during paging',async()=>{
  const library=useProviderLibraryStore();library.reset('netease');
  const expired=new Error('平台登录已过期，请重新登录');expired.name='PROVIDER_SESSION_EXPIRED';
  bridge.listProviderFavorites.mockResolvedValueOnce({providerId:'netease',items:[{id:'private'}],nextCursor:'30'}).mockRejectedValueOnce(expired);
  await library.open('favorites');await library.load(true);
  expect(library.tracks).toEqual([]);expect(library.nextCursor).toBeUndefined();expect(library.error).toContain('登录已失效');
 });
 it('does not revive signed-in status from a reply predating logout',async()=>{
  const providers=useProvidersStore();let finish!:(v:unknown)=>void;
  bridge.listProviderStatuses.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce([{providerId:'netease',state:'signed-out'}]);
  const beforeLogout=providers.loadStatuses();providers.invalidateIdentity();await providers.loadStatuses();
  finish([{providerId:'netease',state:'signed-in'}]);await beforeLogout;
  expect(providers.statuses[0].state).toBe('signed-out');
 });
 it('uses localized IPC error names without exposing upstream text',()=>{
  const timeout=new Error('localized or private upstream copy');timeout.name='PROVIDER_TIMEOUT';
  expect(providerErrorText(timeout)).toContain('超时');expect(providerErrorText(timeout)).not.toContain('private');
  expect(providerErrorText(new Error('[PROVIDER_SESSION_EXPIRED] 平台登录已过期'))).toContain('登录已失效');
  expect(providerErrorText(new Error('[AbortError] 操作已取消'))).toContain('已取消');
 });
});
