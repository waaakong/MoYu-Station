import {describe,it,expect,vi} from 'vitest';
import {retryAfterMs} from '../src/providers/core/retryAfter';
import {CircuitBreaker} from '../src/providers/core/circuitBreaker';
import {ProviderCoordinator} from '../src/providers/core/providerCoordinator';
import {ProviderError} from '../src/providers/core/providerErrors';
import {ProviderWorkerRuntime} from '../src/providers/core/providerWorkerRuntime';
import type {ProviderAdapter} from '../src/providers/core/providerAdapter';
const adapter=(search:ProviderAdapter['search']):ProviderAdapter=>({providerId:'qq',capabilities:['search'],search,accountSummary:async()=>undefined,recommendations:async()=>({providerId:'qq',items:[],fromCache:false}),playlists:async()=>({providerId:'qq',items:[],fromCache:false}),favorites:async()=>({providerId:'qq',items:[],fromCache:false}),playlistTracks:async()=>({providerId:'qq',items:[],fromCache:false}),lyrics:async()=>undefined,resolvePlayback:async()=>{throw Error('unused')},logout:async()=>{},dispose:async()=>{}});
describe('rate limit cooldown and expiry propagation',()=>{
 it('accepts seconds and HTTP date, bounds untrusted headers',()=>{
  expect(retryAfterMs('120',0)).toBe(120000);expect(retryAfterMs('Thu, 01 Oct 2026 00:02:00 GMT',Date.parse('2026-10-01T00:00:00Z'))).toBe(120000);expect(retryAfterMs('not-a-date')).toBe(60000);expect(retryAfterMs('999999999')).toBe(7*86400_000);expect(retryAfterMs('0')).toBe(1000);
 });
 it('does not let an already-running successful request erase the platform cooldown',()=>{
  let now=1000;const breaker=new CircuitBreaker({now:()=>now});breaker.defer(120000);breaker.succeed();expect(breaker.acquire()).toBe(false);expect(breaker.retryAt()).toBe(121000);now=121000;expect(breaker.acquire()).toBe(true);
 });
 it('blocks following calls for Retry-After, then permits explicit recovery',async()=>{
  let now=1000;const search=vi.fn().mockRejectedValueOnce(new ProviderError('PROVIDER_RATE_LIMITED','PROVIDER_RATE_LIMITED',true,120000)).mockResolvedValue([]),coordinator=new ProviderCoordinator({experimentalBuild:true,consentGranted:true,enabledProviders:{qq:true},now:()=>now});coordinator.register('qq',()=>adapter(search));await expect(coordinator.searchProvider('qq','test',1)).rejects.toMatchObject({code:'PROVIDER_RATE_LIMITED'});await expect(coordinator.searchProvider('qq','test',1)).rejects.toMatchObject({code:'PROVIDER_CIRCUIT_OPEN'});expect(search).toHaveBeenCalledTimes(1);expect(coordinator.statuses(['qq'])[0]?.retryAt).toBe(121000);now=121000;expect(await coordinator.searchProvider('qq','test',1)).toEqual([]);await coordinator.dispose();
 });
 it('expires the platform and cancels concurrent late replies',async()=>{
  const notify=vi.fn();let finish!:(value:unknown[])=>void;const search=vi.fn().mockImplementationOnce(()=>new Promise(r=>finish=r)).mockRejectedValueOnce(new ProviderError('PROVIDER_SESSION_EXPIRED'));const coordinator=new ProviderCoordinator({experimentalBuild:true,consentGranted:true,enabledProviders:{qq:true},onSessionExpired:notify});coordinator.register('qq',()=>adapter(search));const pending=coordinator.searchProvider('qq','old',1),rejected=expect(pending).rejects.toMatchObject({name:'AbortError'});await new Promise(r=>setTimeout(r,0));await expect(coordinator.searchProvider('qq','next',1)).rejects.toMatchObject({code:'PROVIDER_SESSION_EXPIRED'});finish([]);await rejected;expect(notify).toHaveBeenCalledWith('qq');expect(coordinator.statuses(['qq'])[0]?.state).toBe('expired');await coordinator.dispose();
 });
 it('carries only bounded retry metadata through the worker boundary',async()=>{
  const reply=vi.fn(),runtime=new ProviderWorkerRuntime(async()=>{throw new ProviderError('PROVIDER_RATE_LIMITED','private upstream text',true,120000)},reply,()=>{});await runtime.receive({requestId:crypto.randomUUID(),providerId:'qq',operation:'search',payload:{}});expect(reply.mock.calls[0]?.[0]).toMatchObject({errorCode:'PROVIDER_RATE_LIMITED',retryAfterMs:120000});expect(JSON.stringify(reply.mock.calls)).not.toContain('private');
 });
});
