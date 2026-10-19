import {describe,it,expect,vi} from 'vitest';
import {CloudClient} from '../src/main/cloud/client';
import {ProviderApplicationAccess} from '../src/providers/core/applicationAccess';
import {ProviderCoordinator} from '../src/providers/core/providerCoordinator';
import type {ProviderAdapter} from '../src/providers/core/providerAdapter';

function setup(){
  let user: unknown = {id:'1',userType:'USER'};
  const fetcher=vi.fn(async()=>new Response(JSON.stringify({success:true,data:user})));
  const cloud=new CloudClient('https://test.example',fetcher,async()=>{},()=>{});
  const bindings=new Map();
  const access=new ProviderApplicationAccess(cloud,id=>bindings.get(id),(id,owner)=>bindings.set(id,owner));
  return {cloud,access,bindings,fetcher,setUser:(value:unknown)=>{user=value;}};
}
describe('main-process MoYu + platform authorization',()=>{
 it('rejects guest and unbound platform, permits login and then binds exact owner',async()=>{
  const s=setup();s.setUser(null);
  await expect(s.access.authorize('netease','login')).rejects.toMatchObject({code:'PROVIDER_APP_LOGIN_REQUIRED'});
  s.setUser({id:'1'});
  await expect(s.access.authorize('netease','use')).rejects.toMatchObject({code:'PROVIDER_LOGIN_REQUIRED'});
  const assert=await s.access.authorize('netease','login');assert();s.access.bind('netease');
  expect(s.access.bound('netease')).toBe(true);expect(s.access.bound('qq')).toBe(false);
  (await s.access.authorize('netease','use'))();
 });
 it('does not share a binding with another MoYu user or late operations after logout',async()=>{
  const s=setup();await s.access.authorize('qq','login');s.access.bind('qq');
  const assert=await s.access.authorize('qq','use');s.cloud.dispose();
  expect(assert).toThrow('PROVIDER_APP_LOGIN_REQUIRED');
  s.setUser({id:'2'});
  await expect(s.access.authorize('qq','refresh')).rejects.toMatchObject({code:'PROVIDER_LOGIN_REQUIRED'});
 });
 it('rechecks server auth and clears revoked or banned identities',async()=>{
  const s=setup();await s.access.authorize('qq','login');s.access.bind('qq');
  s.fetcher.mockImplementationOnce(async()=>new Response(JSON.stringify({success:false,code:'AUTH_REQUIRED'}),{status:401}));
  await expect(s.access.authorize('qq','use')).rejects.toMatchObject({code:'PROVIDER_APP_LOGIN_REQUIRED'});
  expect(s.cloud.authenticatedOwner).toBeNull();s.setUser({id:'1',userType:'BANNED'});
  await expect(s.access.authorize('qq','login')).rejects.toMatchObject({code:'PROVIDER_APP_LOGIN_REQUIRED'});
 });
 it('requires real platform account even for search, never starts operation for signed-out state',async()=>{
  const search=vi.fn(async()=>[]),account=vi.fn(async()=>undefined);
  const adapter={providerId:'netease',capabilities:['search'],search,accountSummary:account,dispose:async()=>{}} as unknown as ProviderAdapter;
  const c=new ProviderCoordinator({experimentalBuild:true,consentGranted:true,enabledProviders:{netease:true},requireLogin:true,authorize:async()=>()=>{}});
  c.register('netease',()=>adapter);
  await expect(c.searchProvider('netease','test',1)).rejects.toMatchObject({code:'PROVIDER_LOGIN_REQUIRED'});expect(search).not.toHaveBeenCalled();
  await c.dispose();
 });
 it('rejects a completed platform request if MoYu identity changes while pending',async()=>{
  let finish!:(value:[])=>void;
  const s=setup();await s.access.authorize('netease','login');s.access.bind('netease');
  const c=new ProviderCoordinator({experimentalBuild:true,consentGranted:true,enabledProviders:{netease:true},requireLogin:true,authorize:(id,mode)=>s.access.authorize(id,mode)});
  s.cloud.onIdentityChanged(()=>c.invalidateApplicationSession());
  c.register('netease',()=>({providerId:'netease',capabilities:['search'],accountSummary:async()=>({state:'signed-in'}),search:()=>new Promise(r=>finish=r),dispose:async()=>{}} as unknown as ProviderAdapter));
  const pending=c.searchProvider('netease','test',1);const rejected=expect(pending).rejects.toThrow();
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));s.cloud.dispose();finish([]);await rejected;await c.dispose();
 });
});
