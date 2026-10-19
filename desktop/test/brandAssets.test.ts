import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';
describe('Island Light desktop assets',()=>{
  it('ships all nine ICO sizes with bounded PNG payloads',()=>{
    const ico=readFileSync(resolve('resources/brand/app.ico'));
    expect(ico.readUInt16LE(0)).toBe(0);expect(ico.readUInt16LE(2)).toBe(1);expect(ico.readUInt16LE(4)).toBe(9);
    for(const [i,size] of [16,20,24,32,40,48,64,128,256].entries()){
      const entry=6+16*i,offset=ico.readUInt32LE(entry+12),length=ico.readUInt32LE(entry+8);
      expect(ico[entry]||256).toBe(size);expect(ico[entry+1]||256).toBe(size);expect(offset).toBeGreaterThanOrEqual(150);expect(offset+length).toBeLessThanOrEqual(ico.length);
      const image=ico.subarray(offset,offset+length);expect(image.subarray(1,4).toString()).toBe('PNG');expect(image.readUInt32BE(16)).toBe(size);expect(image.readUInt32BE(20)).toBe(size);
      expect(image.equals(readFileSync(resolve(`resources/brand/app-${size}.png`)))).toBe(true);
    }
  });
});
