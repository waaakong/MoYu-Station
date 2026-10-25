import {describe,it,expect} from 'vitest';
import {ActivitySampler} from '../src/activity/sampler';
describe('activity evidence sampler',()=>{
  it('closes relaxation immediately on leaving the page and counts no sleep gap',()=>{
    const s=new ActivitySampler();s.sample(10000,0,'ONLINE');
    expect(s.sample(11000,1000,'RELAX')?.state).toBe('ONLINE');
    expect(s.sample(12000,2000,'ONLINE')?.state).toBe('RELAX');
    expect(s.sample(13000,3000,'ONLINE')?.state).toBe('ONLINE');
    expect(s.sample(30000,20000,'RELAX')).toBeUndefined();
  });
  it('same-millisecond timer and focus events do not mark a complete day partial',()=>{
    const s=new ActivitySampler();s.sample(10000,0,false);
    expect(s.sample(10000,.3,true)).toBeUndefined();expect(s.partial).toBe(false);
    expect(s.sample(11000,1000,true)).toEqual({startMs:10000,endMs:11000,state:'FOCUS'});
  });
  it('counts previous state through a transition, including focus pauses',()=>{const s=new ActivitySampler();expect(s.sample(10000,0,false)).toBeUndefined();expect(s.sample(11000,1000,true)).toEqual({startMs:10000,endMs:11000,state:'IDLE'});expect(s.sample(12500,2500,false)).toEqual({startMs:11000,endMs:12500,state:'FOCUS'});expect(s.sample(13000,3000,false)?.state).toBe('IDLE');});
  it('does not extrapolate sleep, stalled timers or clock jumps',()=>{const s=new ActivitySampler();s.sample(10000,0,true);expect(s.sample(30000,1000,true)).toBeUndefined();expect(s.partial).toBe(true);expect(s.sample(31000,2000,false)?.startMs).toBe(30000);s.suspend();expect(s.sample(90000,50000,false)).toBeUndefined();});
  it('does not count backwards wall time',()=>{const s=new ActivitySampler();s.sample(10000,100,true);expect(s.sample(9000,1100,false)).toBeUndefined();expect(s.partial).toBe(true);});
});
