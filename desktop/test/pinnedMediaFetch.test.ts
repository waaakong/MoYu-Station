import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({request:vi.fn(),lookup:vi.fn()}));
vi.mock("node:https",()=>({request:mocks.request}));
vi.mock("node:dns",()=>({lookup:mocks.lookup}));
import { pinnedMediaFetch } from "../src/audio/protocol/pinnedMediaFetch";
import { isPublicAddress } from "../src/providers/radio/ssrfGuard";

describe("pinned provider audio transport",()=>{
  beforeEach(()=>vi.clearAllMocks());
  it.each(["127.0.0.1","10.1.2.3","::ffff:7f00:1","::ffff:127.0.0.1","64:ff9b::7f00:1","ff02::1","2001:db8::1"])("rejects non-public address %s",address=>{
    expect(isPublicAddress(address)).toBe(false);
  });
  it("streams without buffering and checks the socket lookup's actual addresses",async()=>{
    let options:any;
    mocks.request.mockImplementation((_url,opts,callback)=>{
      options=opts;
      const req=Object.assign(new EventEmitter(),{setTimeout:vi.fn(),destroy:vi.fn(),end:()=>{
        const response=Object.assign(Readable.from([Buffer.from("audio")]),{statusCode:206,headers:{"content-type":"audio/mpeg","content-range":"bytes 0-4/5"}});
        callback(response);req.emit("close");
      }});return req;
    });
    const signal=new AbortController().signal;
    const response=await pinnedMediaFetch("https://m801.music.126.net/a",{signal,headers:{Range:"bytes=0-4"}});
    expect(await response.text()).toBe("audio");expect(response.status).toBe(206);
    expect(options.signal).toBe(signal);expect(options.headers.range).toBe("bytes=0-4");
    const callback=vi.fn();mocks.lookup.mockImplementation((_host,_options,done)=>done(null,[{address:"127.0.0.1",family:4}]));
    options.lookup("m801.music.126.net",{all:true},callback);expect(callback.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    mocks.lookup.mockImplementation((_host,_options,done)=>done(null,[{address:"1.1.1.1",family:4}]));
    options.lookup("m801.music.126.net",{all:false},callback);expect(callback).toHaveBeenLastCalledWith(null,"1.1.1.1",4);
  });
  it("does not follow redirects or call the network for untrusted schemes",async()=>{
    await expect(pinnedMediaFetch("http://m801.music.126.net/a")).rejects.toThrow("MEDIA_URL_REJECTED");
    expect(mocks.request).not.toHaveBeenCalled();
    mocks.request.mockImplementation((_url,_opts,callback)=>{
      const req=Object.assign(new EventEmitter(),{setTimeout:vi.fn(),destroy:vi.fn(),end:()=>{
        callback({statusCode:302,destroy:vi.fn()});req.emit("close");
      }});return req;
    });
    await expect(pinnedMediaFetch("https://m801.music.126.net/a")).rejects.toThrow("MEDIA_STATUS_REJECTED");
    expect(mocks.request).toHaveBeenCalledOnce();
  });
});
