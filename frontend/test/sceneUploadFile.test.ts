import {describe,it,expect} from 'vitest';
import {sceneUploadFile} from '../src/scenes/sceneUploadFile';
describe('scene upload content type',()=>{
  const png=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
  it('normalizes absent or misleading OS MIME without trusting the extension',async()=>{
    for(const type of ['', 'application/octet-stream','image/jpg']){
      const file=await sceneUploadFile(new File([png],'photo.jpg',{type}));
      expect(file.type).toBe('image/png');expect(new Uint8Array(await file.arrayBuffer())).toEqual(png);
    }
  });
  it('rejects renamed unsupported content and distinguishes size errors',async()=>{
    await expect(sceneUploadFile(new File(['not a png'],'photo.png',{type:'image/png'}))).rejects.toThrow('文件内容');
    await expect(sceneUploadFile(new File([],'empty.png'))).rejects.toThrow('图片为空');
    await expect(sceneUploadFile(new File([new Uint8Array(20*1024*1024+1)],'big.png'))).rejects.toThrow('超过 20 MiB');
  });
  it('recognizes JPEG and WebP signatures',async()=>{
    expect((await sceneUploadFile(new File([new Uint8Array([255,216,255,224])],'a'))).type).toBe('image/jpeg');
    expect((await sceneUploadFile(new File(['RIFF0000WEBP'],'a'))).type).toBe('image/webp');
  });
});
