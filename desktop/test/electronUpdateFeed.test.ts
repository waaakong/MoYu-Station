import { EventEmitter } from 'node:events';
import { beforeEach, expect, it, vi } from 'vitest';
const fake=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('electron',()=>({net:{request:fake.request}}));
import {fetchElectronUpdateFeedResponse} from '../src/updater/electronUpdateFeed';
let request:EventEmitter & {abort:ReturnType<typeof vi.fn>;end:ReturnType<typeof vi.fn>};
beforeEach(()=>{request=Object.assign(new EventEmitter(),{abort:vi.fn(),end:vi.fn()});fake.request.mockReset().mockReturnValue(request);});
const start=(signal?:AbortSignal)=>fetchElectronUpdateFeedResponse('https://updates.test/latest.yml',{signal,headers:{Authorization:'synthetic-grant'}});
it('exposes a native redirect without following it or transferring credentials',async()=>{
 const pending=start();request.emit('redirect',302,'GET','https://release-assets.githubusercontent.com/github-production-release-asset/synthetic',{});request.emit('error',Error('Redirect was cancelled'));
 const response=await pending;expect(response.status).toBe(302);expect(response.headers.get('location')).toContain('release-assets.githubusercontent.com');expect(request.abort).toHaveBeenCalledOnce();expect(fake.request).toHaveBeenCalledOnce();expect(fake.request.mock.calls[0]![0]).toMatchObject({redirect:'manual',credentials:'omit',useSessionCookies:false});
});
it('returns complete bounded bytes for independent feed verification',async()=>{
 const pending=start();const response=Object.assign(new EventEmitter(),{statusCode:200});request.emit('response',response);response.emit('data',Buffer.from('signed '));response.emit('data',Buffer.from('feed'));response.emit('end');expect(await (await pending).text()).toBe('signed feed');
});
it('accepts Electron request close before a later redirect or response',async()=>{
 const redirect=start();request.emit('close');request.emit('redirect',302,'GET','https://release-assets.githubusercontent.com/github-production-release-asset/synthetic',{});expect((await redirect).status).toBe(302);
 const pending=start(),response=Object.assign(new EventEmitter(),{statusCode:200});request.emit('close');request.emit('response',response);response.emit('data',Buffer.from('feed'));response.emit('end');expect(await (await pending).text()).toBe('feed');
});
it('rejects oversized and interrupted responses',async()=>{
 for(const mode of ['large','aborted']){const pending=start();const failure=expect(pending).rejects.toThrow(mode==='large'?'UPDATE_ARTIFACT_HASH_FAILED':'ERR_CONNECTION_CLOSED');const response=Object.assign(new EventEmitter(),{statusCode:200});request.emit('response',response);if(mode==='large')response.emit('data',Buffer.alloc(128*1024+1));else response.emit('aborted');await failure;expect(request.abort).toHaveBeenCalled();}
});
it('cancels once and ignores a late redirect and response',async()=>{
 const controller=new AbortController(),pending=start(controller.signal),failure=expect(pending).rejects.toThrow('cancelled');controller.abort(Error('cancelled'));request.emit('redirect',302,'GET','https://evil.test',{});request.emit('error',Error('late'));await failure;expect(request.abort).toHaveBeenCalledOnce();
});
it('does not create a request for an already cancelled attempt',async()=>{
 const controller=new AbortController();controller.abort(Error('cancelled'));await expect(start(controller.signal)).rejects.toThrow('cancelled');expect(fake.request).not.toHaveBeenCalled();
});
