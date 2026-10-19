import {EventEmitter} from 'node:events';
import {describe,it,expect,vi,afterEach} from 'vitest';
const mock=vi.hoisted(()=>({request:vi.fn(),lookup:vi.fn()}));
vi.mock('node:https',()=>({request:mock.request}));vi.mock('node:dns',()=>({lookup:mock.lookup}));
import {requestKugouAccount} from '../src/providers/adapters/kugou/accountTransport';
const session={userid:'1234567890',token:'a'.repeat(64),appid:'1014',clienttime:'1790830000',dfid:'testDeviceIdentity1234567'};
function fixture(status=200,headers:Record<string,unknown>={}){const response=Object.assign(new EventEmitter(),{statusCode:status,headers,destroy:vi.fn()});const request=Object.assign(new EventEmitter(),{end:vi.fn(),destroy:vi.fn((e:Error)=>{request.emit('error',e);request.emit('close');})});mock.request.mockImplementation((_o,cb)=>{queueMicrotask(()=>cb(response));return request;});return{response,request};}
afterEach(()=>{vi.clearAllMocks();vi.useRealTimers();});
describe('Kugou credential transport boundary',()=>{
  it('uses fixed HTTPS endpoint and retains only needed server cookie fields',async()=>{
    const f=fixture(200,{'set-cookie':['KugooID=1234567890; Secure','t=token; HttpOnly','KuGoo=DO_NOT_RETURN','UserName=PRIVATE']}),p=requestKugouAccount(session,new AbortController().signal);await Promise.resolve();
    const options=mock.request.mock.calls[0]![0];expect(options.hostname).toBe('login-user.kugou.com');expect(options.path.split('?')[0]).toBe('/v1/autologin');expect(options.port).toBe(443);expect(options.headers.Cookie).toBeUndefined();
    f.response.emit('data',Buffer.from('\n'));f.response.emit('end');f.request.emit('close');await expect(p).resolves.toEqual({body:'\n',cookies:[{name:'KugooID',value:'1234567890'},{name:'t',value:'token'}]});
  });
  it.each([[302,'PROVIDER_UNAVAILABLE'],[429,'PROVIDER_RATE_LIMITED'],[503,'PROVIDER_UNAVAILABLE']])('rejects status %s without redirect/retry',async(status,code)=>{const f=fixture(status as number,{location:'https://other.invalid'});await expect(requestKugouAccount(session,new AbortController().signal)).rejects.toMatchObject({code});expect(mock.request).toHaveBeenCalledTimes(1);f.request.emit('close');});
  it('rejects private DNS addresses and bounds response',async()=>{const f=fixture(),p=requestKugouAccount(session,new AbortController().signal);await Promise.resolve();mock.lookup.mockImplementation((_n,_o,cb)=>cb(null,[{address:'127.0.0.1',family:4}]));const cb=vi.fn();mock.request.mock.calls[0]![0].lookup('login-user.kugou.com',{all:true},cb);expect(cb.mock.calls[0]![0]).toBeInstanceOf(Error);f.response.emit('data',Buffer.alloc(16385));await expect(p).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});f.request.emit('close');});
  it('timeouts destroy network work and cancellation rejects late results',async()=>{vi.useFakeTimers();const f=fixture(),p=expect(requestKugouAccount(session,new AbortController().signal)).rejects.toMatchObject({code:'PROVIDER_TIMEOUT'});await vi.advanceTimersByTimeAsync(8000);await p;expect(f.request.destroy).toHaveBeenCalled();const g=fixture(),controller=new AbortController(),q=requestKugouAccount(session,controller.signal);await Promise.resolve();controller.abort();g.response.emit('end');g.request.emit('close');await expect(q).rejects.toMatchObject({name:'AbortError'});});
  it('rejects malformed credentials before connection',()=>{expect(()=>requestKugouAccount({...session,token:'bad\r\nHost:evil'},new AbortController().signal)).toThrow();expect(mock.request).not.toHaveBeenCalled();});
});
