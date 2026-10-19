import sharp from "sharp";
import { crc32 } from "../../src/media/candidateContainer";

export function pngChunk(type: string, data: Uint8Array) {
  const output = Buffer.alloc(data.length + 12); output.writeUInt32BE(data.length);
  output.write(type, 4, "ascii"); output.set(data, 8); output.writeUInt32BE(crc32(output.subarray(4, -4)), output.length - 4); return output;
}
export function pngInsert(png: Uint8Array, type: string, data: Uint8Array) {
  return Buffer.concat([png.subarray(0, 33), pngChunk(type, data), png.subarray(33)]);
}
export function corruptPngPixels(png: Buffer) {
  const output = Buffer.from(png);
  for (let p = 8; p < output.length;) {
    const n = output.readUInt32BE(p);
    if (output.toString("ascii", p + 4, p + 8) === "IDAT") {
      output.fill(0, p + 8, p + 8 + n); output.writeUInt32BE(crc32(output.subarray(p + 4, p + 8 + n)), p + 8 + n); return output;
    }
    p += n + 12;
  }
  throw new Error("Fixture has no pixel payload");
}
export function exif(orientation: number) {
  const bytes = Buffer.alloc(26); bytes.write("II"); bytes.writeUInt16LE(42, 2); bytes.writeUInt32LE(8, 4);
  bytes.writeUInt16LE(1, 8); bytes.writeUInt16LE(274, 10); bytes.writeUInt16LE(3, 12);
  bytes.writeUInt32LE(1, 14); bytes.writeUInt16LE(orientation, 18); return bytes;
}
export function orientJpeg(jpeg: Uint8Array, orientation: number) {
  const payload = Buffer.concat([Buffer.from("Exif\0\0"), exif(orientation)]);
  const header = Buffer.from([255, 225, 0, payload.length + 2]);
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}
export async function orientWebp(webp: Buffer, orientation: number) {
  const metadata = await sharp(webp).metadata();
  let chunks = Buffer.from(webp.subarray(12));
  if (chunks.toString("ascii", 0, 4) === "VP8X") chunks[8] |= 8;
  else {
    const header = Buffer.alloc(18); header.write("VP8X"); header.writeUInt32LE(10, 4); header[8] = (metadata.hasAlpha ? 16 : 0) | 8;
    header.writeUIntLE(metadata.width! - 1, 12, 3); header.writeUIntLE(metadata.height! - 1, 15, 3); chunks = Buffer.concat([header, chunks]);
  }
  const payload = exif(orientation), exifHeader = Buffer.alloc(8); exifHeader.write("EXIF"); exifHeader.writeUInt32LE(payload.length, 4);
  const result = Buffer.concat([webp.subarray(0, 12), chunks, exifHeader, payload]); result.writeUInt32LE(result.length - 8, 4); return result;
}
export async function solid(width = 64, height = 32, format: "png" | "jpeg" | "webp" = "png") {
  return sharp({ create: { width, height, channels: 4, background: { r: 224, g: 32, b: 64, alpha: .5 } } })[format]().toBuffer();
}
export async function corners(format: "png" | "jpeg" = "jpeg") {
  const width = 80, height = 40, pixels = Buffer.alloc(width * height * 3);
  const colors = [[240, 10, 10], [10, 240, 10], [10, 10, 240], [240, 240, 10]];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set(colors[(y >= height / 2 ? 2 : 0) + (x >= width / 2 ? 1 : 0)], (y * width + x) * 3);
  return sharp(pixels, { raw: { width, height, channels: 3 } })[format]().toBuffer();
}
