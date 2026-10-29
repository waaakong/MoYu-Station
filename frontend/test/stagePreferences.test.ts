import {describe,it,expect} from 'vitest';
import {normalizeStagePreferences,readStagePreferences} from '../src/pages/sound/stage/stagePreferences';
import {lyricWindow,storyVariant,wordProgress} from '../src/pages/sound/stage/lyricStyles';
describe('versioned stage preferences',()=>{
  it('maps legacy layout, background and quality without changing its input',()=>{
    const old={mode:'waveform',quality:'high',stage:{composition:'lyrics',tone:'moon',cameraX:2,cameraY:0}};
    const before=JSON.stringify(old);expect(readStagePreferences(old)).toMatchObject({version:2,layout:'lyrics',background:'wave',quality:60});
    expect(JSON.stringify(old)).toBe(before);
  });
  it('normalizes damaged, future and unknown options and bounds intensity/depth',()=>{
    expect(normalizeStagePreferences('{bad')).toMatchObject({layout:'cover',lyricStyle:'scroll'});
    expect(normalizeStagePreferences({version:99,layout:'visual'}).layout).toBe('cover');
    expect(normalizeStagePreferences({version:2,layout:'visual',lyricStyle:'bad',background:'url',quality:120,intensity:9,depth:-1})).toMatchObject({layout:'visual',lyricStyle:'scroll',background:'cover',quality:'auto',intensity:1,depth:0});
  });
  it('restores v2 preferences independently of stale legacy values',()=>{
    expect(readStagePreferences({mode:'off',stage:{composition:'cover',preferences:{version:2,layout:'visual',lyricStyle:'chat',background:'particles',quality:24,intensity:.2,depth:.3}}})).toMatchObject({layout:'visual',lyricStyle:'chat',background:'particles',quality:24});
  });
});
describe('bounded lyric rendering inputs',()=>{
  it('keeps a bounded neighbor window even with ten thousand lines',()=>{
    expect(lyricWindow(10000,9000,'scroll')).toEqual([8998,8999,9000,9001,9002]);
    expect(lyricWindow(10000,9000,'giant')).toEqual([9000,9001]);
    expect(lyricWindow(0,-1,'story')).toEqual([]);
  });
  it('uses a stable track/line seed for story composition',()=>{
    expect(storyVariant('track',42)).toBe(storyVariant('track',42));
    expect(storyVariant('track',42)).toBeGreaterThanOrEqual(0);expect(storyVariant('track',42)).toBeLessThan(3);
  });
  it('does not manufacture word timing from line length',()=>{
    expect(wordProgress({text:'word',timeMs:1000},1200)).toBeUndefined();
    expect(wordProgress({text:'word',timeMs:1000,endMs:2000},1500)).toBe(.5);
    expect(wordProgress({text:'word',timeMs:1000,endMs:2000},2500)).toBe(1);
  });
});
