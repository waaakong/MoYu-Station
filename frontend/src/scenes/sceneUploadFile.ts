/** MIME metadata from the OS is advisory; the server still validates the full container. */
export async function sceneUploadFile(file: File): Promise<File> {
  if (!file.size) throw new Error('图片为空，请重新选择。');
  if (file.size > 20 * 1024 * 1024) throw new Error(`原图为 ${(file.size / 1024 / 1024).toFixed(1)} MiB，超过 20 MiB 上限，请先缩小图片。`);
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  const mime = [137,80,78,71,13,10,26,10].every((value, i) => bytes[i] === value) ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
    : ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP' ? 'image/webp' : '';
  if (!mime) throw new Error('文件内容不是支持的 JPEG、PNG 或 WebP。HEIC、AVIF、GIF 等请先转换为静态 PNG/JPEG，修改文件后缀无效。');
  return file.type === mime ? file : new File([file], file.name, {type: mime, lastModified: file.lastModified});
}
