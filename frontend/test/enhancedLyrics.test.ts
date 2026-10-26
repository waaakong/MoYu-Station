import {describe,it,expect} from 'vitest';
import {parseLrc} from '../src/audio/lyrics/lrcParser';
describe('real enhanced LRC timing',()=>{
  it('keeps original word timestamps and never invents an end for the final word',()=>{
    const line=parseLrc('[00:01]<00:01.20>你<00:02.50>好').lines[0]!;
    expect(line.text).toBe('你好');expect(line.words).toEqual([{text:'你',timeMs:1200,endMs:2500},{text:'好',timeMs:2500}]);
  });
  it('does not fake per-word timing for normal LRC or backwards word markers',()=>{
    expect(parseLrc('[00:01]普通歌词').lines[0]?.words).toBeUndefined();
    expect(parseLrc('[00:01]<00:03>你<00:02>好').lines[0]?.words).toBeUndefined();
  });
  it('preserves English spaces and refuses ambiguous multi-line reuse of word markers',()=>{
    expect(parseLrc('[00:01]<00:01>Hello <00:02>world').lines[0]?.words?.map(w=>w.text).join('')).toBe('Hello world');
    expect(parseLrc('[00:01][00:20]<00:01>你好').lines.every(l=>!l.words)).toBe(true);
  });
});
