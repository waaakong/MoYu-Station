import {describe,it,expect} from 'vitest';
import {StageClock} from '../src/audio/lyrics/stageClock';
describe('observed playback stage clock',()=>{
  it('interpolates playing observations but freezes paused and buffering positions',()=>{
    const c=new StageClock();c.observe({positionMs:1000,playing:true,rate:1,observedAt:100});
    expect(c.query(350)).toBe(1250);c.observe({positionMs:1200,playing:false,rate:1,observedAt:350});
    expect(c.query(9000)).toBe(1200);
  });
  it('anchors seeks immediately and bounds extrapolation during lost observations',()=>{
    const c=new StageClock();c.observe({positionMs:90000,playing:true,rate:2,observedAt:100});
    expect(c.query(200)).toBe(90200);c.observe({positionMs:500,playing:true,rate:1,observedAt:200});
    expect(c.query(200)).toBe(500);expect(c.query(9000)).toBe(1500);
    c.reset();expect(c.query(9001)).toBe(0);
  });
  it('normalizes invalid inputs without inventing playback or negative time',()=>{
    const c=new StageClock();c.observe({positionMs:NaN,playing:true,rate:Infinity,observedAt:NaN});
    expect(c.query(Infinity)).toBe(0);expect(c.query(-10)).toBe(0);
  });
});
