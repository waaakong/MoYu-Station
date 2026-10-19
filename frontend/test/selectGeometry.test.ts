import {describe,it,expect} from 'vitest';
import {placeSelect} from '../src/components/controls/selectGeometry';
describe('select placement',()=>{
  it('flips up at the bottom and keeps narrow menus inside the viewport',()=>{
    const p=placeSelect({left:350,top:750,bottom:794,width:80},{width:390,height:844},400);
    expect(p.up).toBe(true);expect(p.left+p.width).toBeLessThanOrEqual(382);expect(p.top).toBe(424);expect(p.maxHeight).toBe(320);
  });
  it('respects a visual viewport offset and limits tall lists',()=>{
    const p=placeSelect({left:20,top:50,bottom:94,width:500},{width:300,height:400,left:10,top:20},1000);
    expect(p.left).toBe(18);expect(p.width).toBe(284);expect(p.top).toBe(100);expect(p.maxHeight).toBe(312);
  });
});
