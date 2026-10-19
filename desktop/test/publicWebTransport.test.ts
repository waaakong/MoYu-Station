import { EventEmitter } from 'node:events';
import { describe,expect,it,vi,afterEach } from 'vitest';
const mocked=vi.hoisted(()=>({request:vi.fn(),lookup:vi.fn()}));
vi.mock('node:https',()=>({request:mocked.request}));
vi.mock('node:dns',()=>({lookup:mocked.lookup}));
import { requestPublicWeb,requestQQWeb } from '../src/providers/adapters/publicWebTransport';

function fixture(status=200,headers:Record<string,string>={}){
  const response=Object.assign(new EventEmitter(),{statusCode:status,headers,destroy:vi.fn()});
  const request=Object.assign(new EventEmitter(),{end:vi.fn(),destroy:vi.fn((error:Error)=>{request.emit('error',error);request.emit('close');})});
  mocked.request.mockImplementation((_options,callback)=>{queueMicrotask(()=>callback(response));return request;});
  return{request,response,finish(data:unknown){response.emit('data',Buffer.from(JSON.stringify(data)));response.emit('end');request.emit('close');}};
}
afterEach(()=>{vi.clearAllMocks();vi.useRealTimers();});
describe('public and QQ-only authenticated HTTPS boundaries',()=>{
  it('never sends credentials on public requests and uses fixed paths',async()=>{
    const f=fixture(),pending=requestPublicWeb('qqSuggest',{key:'test'},undefined,new AbortController().signal);await Promise.resolve();
    const options=mocked.request.mock.calls[0]![0];expect(options.hostname).toBe('c.y.qq.com');expect(options.path).toMatch(/^\/splcloud\/fcgi-bin\/smartbox_new.fcg/);expect(options.headers.Cookie).toBeUndefined();
    f.finish({code:0});await expect(pending).resolves.toEqual({code:0});
  });
  it('permits QQ cookies only on exact QQ routes and rejects header injection',async()=>{
    const session={qqmusic_uin:'123456',qqmusic_key:'unit-only'};
    expect(()=>requestQQWeb('kugouSearch' as never,{},undefined,session,new AbortController().signal)).toThrow();
    expect(()=>requestQQWeb('qqAccount',{},undefined,{...session,qqmusic_key:'x\r\nAuthorization:y'},new AbortController().signal)).toThrow();
    expect(mocked.request).not.toHaveBeenCalled();
  });
  it('rejects all redirects rather than forwarding account cookies',async()=>{
    const f=fixture(302,{location:'https://other.invalid/'});
    await expect(requestQQWeb('qqAccount',{},undefined,{qqmusic_uin:'123456',qqmusic_key:'unit-only'},new AbortController().signal)).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    expect(mocked.request).toHaveBeenCalledTimes(1);expect(f.response.destroy).toHaveBeenCalled();f.request.emit('close');
  });
  it('rejects private socket DNS resolution',async()=>{
    const f=fixture(),pending=requestPublicWeb('qqSuggest',{},undefined,new AbortController().signal);await Promise.resolve();
    mocked.lookup.mockImplementation((_name,_options,callback)=>callback(null,[{address:'127.0.0.1',family:4}]));
    const callback=vi.fn();mocked.request.mock.calls[0]![0].lookup('c.y.qq.com',{all:true},callback);
    expect(callback.mock.calls[0]?.[0]).toBeInstanceOf(Error);f.finish({});await pending;
  });
  it('bounds request size before opening a connection',async()=>{
    await expect(requestPublicWeb('qqSuggest',{key:'x'.repeat(66000)},undefined,new AbortController().signal)).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});expect(mocked.request).not.toHaveBeenCalled();
  });
  it('rejects oversized response bodies and malformed JSON',async()=>{
    const f=fixture(),pending=requestPublicWeb('qqSuggest',{},undefined,new AbortController().signal);await Promise.resolve();f.response.emit('data',Buffer.alloc(2*1024*1024+1));await expect(pending).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});f.request.emit('close');
    const g=fixture(),malformed=requestPublicWeb('qqSuggest',{},undefined,new AbortController().signal);await Promise.resolve();g.response.emit('data',Buffer.from('<html>bad gateway</html>'));g.response.emit('end');g.request.emit('close');await expect(malformed).rejects.toMatchObject({code:'PROVIDER_API_CHANGED'});
  });
  it.each([[429,'PROVIDER_RATE_LIMITED'],[503,'PROVIDER_UNAVAILABLE']])('classifies HTTP %s',async(status,code)=>{
    const f=fixture(status as number);await expect(requestPublicWeb('qqSuggest',{},undefined,new AbortController().signal)).rejects.toMatchObject({code});f.request.emit('close');
  });
  it('does not try to solve platform challenge headers',async()=>{
    const f=fixture(200,{'ssa-code':'challenge'});await expect(requestPublicWeb('kugouSearch',{},undefined,new AbortController().signal)).rejects.toMatchObject({code:'PROVIDER_LOGIN_REQUIRED'});expect(mocked.request).toHaveBeenCalledTimes(1);f.request.emit('close');
  });
  it('retains bounded Retry-After metadata on a real transport rejection path',async()=>{
    const f=fixture(429,{'retry-after':'120'});await expect(requestPublicWeb('qqRpc',{},undefined,new AbortController().signal)).rejects.toMatchObject({code:'PROVIDER_RATE_LIMITED',retryAfterMs:120000});expect(mocked.request).toHaveBeenCalledTimes(1);f.request.emit('close');
  });
  it('times out the actual request and preserves cancellation after a late body',async()=>{
    vi.useFakeTimers();const f=fixture();const timeout=expect(requestPublicWeb('qqSuggest',{},undefined,new AbortController().signal)).rejects.toMatchObject({code:'PROVIDER_TIMEOUT'});await vi.advanceTimersByTimeAsync(8000);await timeout;expect(f.request.destroy).toHaveBeenCalled();
    const g=fixture(),abort=new AbortController(),pending=requestPublicWeb('qqSuggest',{},undefined,abort.signal);await Promise.resolve();abort.abort();g.finish({code:0});await expect(pending).rejects.toMatchObject({name:'AbortError'});
  });
});
