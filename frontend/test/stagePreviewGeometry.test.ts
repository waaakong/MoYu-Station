import {describe,it,expect} from 'vitest';
import {lyricRowPose} from '../src/pages/sound/stage/lyricStyles';
describe('approved stage row geometry',()=>{
 it('keeps the current row centered and gives all six presentations independent geometry',()=>{
  expect(lyricRowPose('scroll',2,1,400,false)).toMatchObject({y:82,scale:.92,opacity:.35});
  expect(lyricRowPose('focus',0,1,400,false).opacity).toBe(0);
  expect(lyricRowPose('focus',1,1,400,false).scale).toBe(1.05);
  expect(lyricRowPose('steps',2,1,400,false)).toMatchObject({x:52,y:84});
  expect(lyricRowPose('giant',2,1,400,false)).toMatchObject({y:190,opacity:.1});
  expect(lyricRowPose('chat',1,1,400,false)).toMatchObject({x:36,y:0,scale:1});
 });
 it('adapts spacing for short screens and keeps distant lines hidden',()=>{
  expect(lyricRowPose('scroll',2,1,200,true).y).toBe(59);
  expect(lyricRowPose('chat',1,0,200,true)).toMatchObject({x:24,y:68});
  expect(lyricRowPose('scroll',8,0,400,false).opacity).toBe(0);
 });
});
