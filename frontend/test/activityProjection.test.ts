import {describe,it,expect} from 'vitest';
import type {ActivitySegment} from '@studyroom/contracts';
import {projectActivity,shanghaiDate} from '../src/activity/projection';
const t=Date.parse('2026-10-25T00:00:00+08:00');
const seg=(start:number,end:number,state:ActivitySegment['state']):ActivitySegment=>({startMs:t+start,endMs:t+end,state});
describe('live activity interval projection',()=>{
  it('deduplicates cloud, outbox and other devices while focus wins',()=>{
    const relax=seg(10000,40000,'RELAX');
    const value=projectActivity([seg(0,60000,'ONLINE'),relax,{...relax},seg(20000,30000,'FOCUS_V3')],'2026-10-25',t+60000);
    expect(value).toMatchObject({onlineMs:60000,focusMs:10000,fishMs:20000,hasLegacy:false});expect(value.index).toBeCloseTo(5/6);
  });
  it('does not call ordinary online or paused focus fishing',()=>{
    expect(projectActivity([seg(0,15000,'ONLINE')],'2026-10-25',t+15000)).toMatchObject({fishMs:0,index:0});
  });
  it('clips midnight and future time, never extrapolates the last checkpoint',()=>{
    const ranges=[seg(-5000,5000,'RELAX'),seg(5000,9000,'FOCUS_V3')];
    expect(projectActivity(ranges,'2026-10-25',t+7000)).toMatchObject({onlineMs:7000,fishMs:5000,focusMs:2000});
    expect(projectActivity(ranges,'2026-10-25',t+60000).onlineMs).toBe(9000);
    expect(shanghaiDate(t-1)).toBe('2026-10-24');
  });
  it('does not reconstruct old idle as entertainment; empty time has no index',()=>{
    expect(projectActivity([seg(0,5000,'IDLE'),seg(5000,10000,'RELAX')],'2026-10-25',t+10000)).toMatchObject({hasLegacy:true,fishMs:5000});
    expect(projectActivity([],'2026-10-25',t+10000).index).toBeNull();
  });
});
