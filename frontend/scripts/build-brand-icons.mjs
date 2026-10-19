import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=await readFile(resolve(root,'frontend/public/brand/island-light.svg'),'utf8');
const out=resolve(root,'desktop/resources/brand');
await mkdir(out,{recursive:true});
const sizes=[16,20,24,32,40,48,64,128,256],images=[];
for(const size of sizes){
  const svg=size<=20?source.replace(/<path id="reflection"[^>]*\/>/,''):source;
  const png=await sharp(Buffer.from(svg)).resize(size,size).png().toBuffer();
  await writeFile(resolve(out,`app-${size}.png`),png);images.push(png);
}
const header=Buffer.alloc(6+16*sizes.length);header.writeUInt16LE(1,2);header.writeUInt16LE(sizes.length,4);
let offset=header.length;
sizes.forEach((size,i)=>{const p=6+i*16;header[p]=size===256?0:size;header[p+1]=header[p];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(images[i].length,p+8);header.writeUInt32LE(offset,p+12);offset+=images[i].length;});
await writeFile(resolve(out,'app.ico'),Buffer.concat([header,...images]));
await writeFile(resolve(root,'frontend/public/favicon.ico'),Buffer.concat([header,...images]));
for(const size of [32,180,192,512])await writeFile(resolve(root,`frontend/public/brand/app-${size}.png`),await sharp(Buffer.from(source)).resize(size,size).png().toBuffer());
await writeFile(resolve(root,'frontend/public/favicon.svg'),source.replace(/^[ \t]*<path id="reflection"[^>]*\/>\r?\n/m,''));
console.log('Island Light: web SVG/PNG and nine-size desktop ICO generated.');
