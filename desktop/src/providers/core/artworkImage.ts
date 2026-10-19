/** Inspect dimensions before any image decoder is allowed to allocate pixels. */
export function artworkImageType(b: Buffer): string | undefined {
  const valid = (w: number, h: number) => w > 0 && h > 0 && w <= 4096 && h <= 4096 && w * h <= 8_000_000;
  if (b.length >= 33 && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && b.toString('ascii',12,16)==='IHDR')
    return valid(b.readUInt32BE(16),b.readUInt32BE(20)) ? 'image/png' : undefined;
  if (b.length >= 4 && b[0]===255 && b[1]===216) {
    let offset=2;
    while (offset+4 <= b.length) {
      if (b[offset++]!==255) return;
      while (b[offset]===255) offset++;
      const marker=b[offset++];
      if (marker===0xda || marker===0xd9) return;
      if (offset+2>b.length) return;
      const length=b.readUInt16BE(offset);
      if(length<2 || offset+length>b.length)return;
      if([0xc0,0xc1,0xc2].includes(marker!)) return length>=8 && valid(b.readUInt16BE(offset+5),b.readUInt16BE(offset+3)) ? 'image/jpeg' : undefined;
      offset+=length;
    }
  }
  if (b.length>=30 && b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WEBP') {
    const type=b.toString('ascii',12,16);
    if(type==='VP8X') return !(b[20]!&2) && valid(1+b.readUIntLE(24,3),1+b.readUIntLE(27,3)) ? 'image/webp' : undefined;
    if(type==='VP8 ' && b[23]===0x9d && b[24]===1 && b[25]===0x2a) return valid(b.readUInt16LE(26)&0x3fff,b.readUInt16LE(28)&0x3fff)?'image/webp':undefined;
    if(type==='VP8L' && b[20]===0x2f) return valid(1+((b[21]!|b[22]!<<8)&0x3fff),1+((b[22]!>>6|b[23]!<<2|b[24]!<<10)&0x3fff))?'image/webp':undefined;
  }
  return;
}
