import {it,expect,vi,afterEach} from 'vitest';
import {FeedPostSync} from '../src/feed/postSync';
afterEach(()=>vi.useRealTimers());
it('coalesces invalidations and drops a stale read when another event arrives',async()=>{
  vi.useFakeTimers();let resolve!:(v:unknown)=>void;const apply=vi.fn();const fetch=vi.fn().mockImplementationOnce(()=>new Promise(r=>resolve=r)).mockResolvedValue({likes:2});
  const sync=new FeedPostSync({known:()=>true,busy:()=>false,revision:()=>0,fetch,apply,error:vi.fn()});sync.start();sync.invalidate('1');sync.invalidate('1');await vi.advanceTimersByTimeAsync(250);sync.invalidate('1');resolve({likes:1});await vi.advanceTimersByTimeAsync(600);
  expect(fetch).toHaveBeenCalledTimes(2);expect(apply).toHaveBeenCalledExactlyOnceWith('1',{likes:2});sync.stop();
});
it('does not apply after leaving, or fetch unrelated ids',async()=>{
  vi.useFakeTimers();let resolve!:(v:unknown)=>void;const apply=vi.fn(),fetch=vi.fn(()=>new Promise(r=>resolve=r));
  const sync=new FeedPostSync({known:id=>id==='1',busy:()=>false,revision:()=>0,fetch,apply,error:vi.fn()});sync.start();sync.invalidate('2');sync.invalidate('1');await vi.advanceTimersByTimeAsync(250);sync.stop();resolve({});await vi.advanceTimersByTimeAsync(1000);expect(fetch).toHaveBeenCalledTimes(1);expect(apply).not.toHaveBeenCalled();
});
it('waits for local writes and rechecks changed entity revisions',async()=>{
  vi.useFakeTimers();let busy=true,revision=0;const apply=vi.fn(),fetch=vi.fn(async()=>{revision++;return {};});
  const sync=new FeedPostSync({known:()=>true,busy:()=>busy,revision:()=>revision,fetch,apply,error:vi.fn()});sync.start();sync.invalidate('1');await vi.advanceTimersByTimeAsync(250);expect(fetch).not.toHaveBeenCalled();busy=false;await vi.advanceTimersByTimeAsync(250);expect(apply).not.toHaveBeenCalled();sync.stop();
});
