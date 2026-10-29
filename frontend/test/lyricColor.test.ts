import {describe,it,expect} from 'vitest';
import {normalizeLyricColor,hexToHsv,hsvToHex} from '../src/utils/lyricColor';
describe('bounded lyric colors',()=>{
  it('normalizes six digit colors and rejects CSS and incomplete values',()=>{
    expect(normalizeLyricColor(' A8D5F0 ')).toBe('#a8d5f0');
    for(const value of ['red','#fff','#gg0011','url(x)','#123456;opacity:0'])expect(normalizeLyricColor(value)).toBeNull();
  });
  it('round trips neutral, primary and custom colors',()=>{
    for(const color of ['#000000','#ffffff','#ff0000','#00ff00','#0000ff','#a8d5f0','#edc7a5'])expect(hsvToHex(hexToHsv(color))).toBe(color);
  });
});
