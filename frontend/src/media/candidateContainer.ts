/** Bounded container preflight, not a substitute for native decoding or server validation. */
export const CANDIDATE_LIMITS = Object.freeze({ inputBytes: 20 * 1024 * 1024, outputBytes: 2 * 1024 * 1024,
  sourceEdge: 12000, sourcePixels: 40_000_000, edge: 2560, longEdge: 4096 });
export type CandidateCode = "MEDIA_INVALID" | "MEDIA_TYPE" | "MEDIA_SIZE" | "MEDIA_DIMENSIONS" | "MEDIA_ANIMATED"
  | "MEDIA_COLOR" | "MEDIA_OUTPUT_SIZE" | "MEDIA_UNSUPPORTED" | "MEDIA_TIMEOUT";
export class CandidateError extends Error {
  constructor(readonly code: CandidateCode) {
    super(({ MEDIA_INVALID: "图片结构不完整或无法解码，请重新选择。", MEDIA_TYPE: "仅支持真实 JPEG、PNG、静态 WebP。",
      MEDIA_SIZE: "请选择非空且不超过 20 MiB 的图片。", MEDIA_DIMENSIONS: "图片不能超过 12000px 或 4000 万像素。",
      MEDIA_ANIMATED: "此入口不支持动图，请使用静态图片。", MEDIA_COLOR: "此图片的色彩配置暂不支持，请先导出为标准 sRGB 的 8 位图片。",
      MEDIA_OUTPUT_SIZE: "保持清晰度处理后仍超过 2 MiB，请换图或分图。", MEDIA_UNSUPPORTED: "当前设备不支持安全图片处理，请更新浏览器或客户端。",
      MEDIA_TIMEOUT: "图片处理超时，请换图后重试。" })[code]);
  }
}
const requireValid = (condition: unknown) => { if (!condition) throw new CandidateError("MEDIA_INVALID"); };
export function checkSourceDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0
    || Math.max(width, height) > CANDIDATE_LIMITS.sourceEdge || width * height > CANDIDATE_LIMITS.sourcePixels) throw new CandidateError("MEDIA_DIMENSIONS");
}
export function candidateDimensions(width: number, height: number) {
  checkSourceDimensions(width, height);
  const edge = Math.max(width, height) >= 3 * Math.min(width, height) ? CANDIDATE_LIMITS.longEdge : CANDIDATE_LIMITS.edge;
  const scale = Math.min(1, edge / Math.max(width, height));
  const result = { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  // Rounding near 3:1 must not produce a >2560 candidate that the server classifies as ordinary.
  if (Math.max(result.width, result.height) > CANDIDATE_LIMITS.edge && Math.max(result.width, result.height) < 3 * Math.min(result.width, result.height)) {
    if (result.width > result.height) result.height = Math.max(1, Math.floor(result.width / 3));
    else result.width = Math.max(1, Math.floor(result.height / 3));
  }
  return result;
}
export type InspectedImage = { bytes: Uint8Array<ArrayBuffer>; mime: string; width: number; height: number; orientation: number };
const crcTable = new Uint32Array(256).map((_, n) => { for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff; for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0;
}
function join(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const result = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; } return result;
}

export function inspectCandidateSource(bytes: Uint8Array, declaredMime: string): InspectedImage {
  if (!bytes.length || bytes.length > CANDIDATE_LIMITS.inputBytes) throw new CandidateError("MEDIA_SIZE");
  const num = (offset: number, size: number, little = false): number => {
    requireValid(offset >= 0 && offset + size <= bytes.length);
    let value = 0; for (let i = 0; i < size; i++) value = value * 256 + bytes[offset + (little ? size - 1 - i : i)]; return value;
  };
  const ascii = (offset: number, size: number) => String.fromCharCode(...bytes.subarray(offset, offset + size));
  const orientationAt = (offset: number, length: number) => {
    if (ascii(offset, 6) === "Exif\0\0") { offset += 6; length -= 6; }
    requireValid(length >= 8);
    const little = ascii(offset, 2) === "II";
    requireValid(little || ascii(offset, 2) === "MM");
    const read = (p: number, size: number) => { requireValid(p >= 0 && p + size <= length); return num(offset + p, size, little); };
    requireValid(read(2, 2) === 42);
    const ifd = read(4, 4); requireValid(ifd >= 8);
    const count = read(ifd, 2); requireValid(count <= 1024 && ifd + 2 + count * 12 + 4 <= length);
    let orientation = 1, found = false;
    for (let i = 0; i < count; i++) {
      const p = ifd + 2 + i * 12;
      if (read(p, 2) === 274) { requireValid(!found && read(p + 2, 2) === 3 && read(p + 4, 4) === 1); found = true; orientation = read(p + 8, 2); }
    }
    requireValid(orientation >= 1 && orientation <= 8); return orientation;
  };
  let width = 0, height = 0, orientation = 1, mime = "";
  const parts: Uint8Array[] = [];
  if (num(0, Math.min(2, bytes.length)) === 0xffd8) {
    mime = "image/jpeg"; parts.push(bytes.subarray(0, 2));
    let p = 2, scan = false, ended = false, exif = false;
    while (p < bytes.length) {
      const start = p; requireValid(bytes[p++] === 255);
      while (bytes[p] === 255) p++;
      const marker = bytes[p++]; requireValid(marker !== undefined);
      if (marker === 0xd9) { requireValid(scan && p === bytes.length); parts.push(bytes.subarray(start, p)); ended = true; break; }
      requireValid(marker !== 0 && marker !== 0xd8 && marker !== 1 && !(marker >= 0xd0 && marker <= 0xd7));
      const size = num(p, 2), d = p + 2, end = p + size;
      requireValid(size >= 2 && end <= bytes.length);
      let keep = true;
      if (marker >= 0xe0 && marker <= 0xef || marker === 0xfe) {
        keep = false;
        if (marker === 0xe1 && size >= 8 && ascii(d, 6) === "Exif\0\0") { requireValid(!exif); exif = true; orientation = orientationAt(d, size - 2); }
        if (marker === 0xe2 && ascii(d, 12) === "ICC_PROFILE\0") throw new CandidateError("MEDIA_COLOR");
        if (marker === 0xee && ascii(d, 5) === "Adobe") { requireValid(size === 14); if (bytes[d + 11] > 1) throw new CandidateError("MEDIA_COLOR"); keep = true; }
        if (marker === 0xe0 && ascii(d, 5) === "JFIF\0") parts.push(new Uint8Array([255,224,0,16,74,70,73,70,0,1,2,0,0,1,0,1,0,0]));
      } else if (marker === 0xc0 || marker === 0xc2) {
        requireValid(!width && size >= 8); if (bytes[d] !== 8 || ![1, 3].includes(bytes[d + 5])) throw new CandidateError("MEDIA_COLOR");
        requireValid(size === 8 + bytes[d + 5] * 3);
        height = num(d + 1, 2); width = num(d + 3, 2); checkSourceDimensions(width, height);
      } else requireValid([0xc4, 0xdb, 0xdd, 0xda].includes(marker));
      if (keep) parts.push(bytes.subarray(start, end)); p = end;
      if (marker === 0xda) {
        requireValid(width && height); scan = true; const entropyStart = p;
        while (p < bytes.length) {
          if (bytes[p] !== 255) { p++; continue; }
          let next = p + 1; while (bytes[next] === 255) next++;
          requireValid(next < bytes.length); const code = bytes[next];
          if (code === 0 || code >= 0xd0 && code <= 0xd7) p = next + 1; else break;
        }
        parts.push(bytes.subarray(entropyStart, p));
      }
    }
    requireValid(ended);
  } else if (ascii(0, 8) === "\x89PNG\r\n\x1a\n") {
    mime = "image/png"; parts.push(bytes.subarray(0, 8));
    let p = 8, data = false, dataEnded = false, ended = false, palette = false, color = -1;
    const seen = new Set<string>();
    while (p < bytes.length) {
      requireValid(!ended && p + 12 <= bytes.length);
      const size = num(p, 4), d = p + 8, end = d + size + 4, type = ascii(p + 4, 4);
      requireValid(end <= bytes.length && /^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type));
      requireValid(crc32(bytes.subarray(p + 4, d + size)) === num(d + size, 4));
      if (p === 8) requireValid(type === "IHDR");
      if (type !== "IDAT") { requireValid(!seen.has(type) || !["IHDR", "PLTE", "IEND", "tRNS", "eXIf", "sRGB", "gAMA", "cHRM"].includes(type)); seen.add(type); }
      if (data && type !== "IDAT") dataEnded = true;
      if (["acTL", "fcTL", "fdAT"].includes(type)) throw new CandidateError("MEDIA_ANIMATED");
      if (["iCCP", "cICP", "mDCV", "cLLI"].includes(type)) throw new CandidateError("MEDIA_COLOR");
      switch (type) {
        case "IHDR": {
          requireValid(p === 8 && size === 13); width = num(d, 4); height = num(d + 4, 4); checkSourceDimensions(width, height);
          const depth = bytes[d + 8]; color = bytes[d + 9]; if (depth === 16) throw new CandidateError("MEDIA_COLOR");
          requireValid(([0, 3].includes(color) && [1, 2, 4, 8].includes(depth) || [2, 4, 6].includes(color) && depth === 8)
            && bytes[d + 10] === 0 && bytes[d + 11] === 0 && bytes[d + 12] <= 1); break;
        }
        case "PLTE": requireValid(!data && size > 0 && size <= 768 && size % 3 === 0 && ![0, 4].includes(color)); palette = true; break;
        case "tRNS": requireValid(!data && (color === 0 && size === 2 || color === 2 && size === 6 || color === 3 && palette && size <= 256)); break;
        case "IDAT": requireValid(!dataEnded && (color !== 3 || palette)); data = true; break;
        case "IEND": requireValid(data && size === 0 && end === bytes.length); ended = true; break;
        case "eXIf": orientation = orientationAt(d, size); break;
        case "sRGB": requireValid(!data && size === 1 && bytes[d] <= 3); break;
        case "gAMA": if (size !== 4 || num(d, 4) !== 45455) throw new CandidateError("MEDIA_COLOR"); break;
        case "cHRM": if (size !== 32 || [31270,32900,64000,33000,30000,60000,15000,6000].some((v, i) => num(d + i * 4, 4) !== v)) throw new CandidateError("MEDIA_COLOR"); break;
        default: requireValid(type[0] === type[0].toLowerCase());
      }
      if (["IHDR", "PLTE", "tRNS", "IDAT", "IEND"].includes(type)) parts.push(bytes.subarray(p, end));
      p = end;
    }
    requireValid(ended);
  } else if (ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    mime = "image/webp"; requireValid(num(4, 4, true) === bytes.length - 8); parts.push(bytes.subarray(0, 12));
    let p = 12, extended = false, pixels = false, alpha = false, exif = false, xmp = false, flags = 0, canvasW = 0, canvasH = 0;
    while (p < bytes.length) {
      requireValid(p + 8 <= bytes.length);
      const type = ascii(p, 4), size = num(p + 4, 4, true), d = p + 8, end = d + size + (size & 1);
      requireValid(end <= bytes.length && (!(size & 1) || bytes[end - 1] === 0));
      if (["ANIM", "ANMF"].includes(type)) throw new CandidateError("MEDIA_ANIMATED");
      if (type === "ICCP") throw new CandidateError("MEDIA_COLOR");
      if (type === "VP8X") {
        requireValid(p === 12 && !extended && size === 10); extended = true; flags = bytes[d];
        if (flags & 2) throw new CandidateError("MEDIA_ANIMATED"); if (flags & 32) throw new CandidateError("MEDIA_COLOR");
        requireValid(!(flags & 0xc1) && num(d + 1, 3, true) === 0);
        canvasW = num(d + 4, 3, true) + 1; canvasH = num(d + 7, 3, true) + 1; checkSourceDimensions(canvasW, canvasH);
        const header = bytes.slice(p, end); header[8] &= 16; parts.push(header);
      } else if (type === "ALPH") { requireValid(extended && !pixels && !alpha && size > 0); alpha = true; parts.push(bytes.subarray(p, end)); }
      else if (type === "VP8 " || type === "VP8L") {
        requireValid(!pixels); pixels = true;
        if (type === "VP8L") {
          requireValid(!alpha && size >= 5 && bytes[d] === 47); const bits = num(d + 1, 4, true); requireValid(bits >>> 29 === 0);
          width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1; alpha = !!(bits & (1 << 28));
        } else {
          requireValid(size >= 10 && !(bytes[d] & 1) && ascii(d + 3, 3) === "\x9d\x01\x2a");
          width = num(d + 6, 2, true) & 0x3fff; height = num(d + 8, 2, true) & 0x3fff;
        }
        checkSourceDimensions(width, height); parts.push(bytes.subarray(p, end));
      } else if (type === "EXIF") { requireValid(extended && pixels && !exif); exif = true; orientation = orientationAt(d, size); }
      else if (type === "XMP ") { requireValid(extended && pixels && !xmp); xmp = true; }
      p = end;
    }
    requireValid(pixels);
    if (extended) requireValid(width === canvasW && height === canvasH && !!(flags & 16) === alpha && !!(flags & 8) === exif && !!(flags & 4) === xmp);
  } else throw new CandidateError("MEDIA_TYPE");
  if (mime !== declaredMime) throw new CandidateError("MEDIA_TYPE");
  checkSourceDimensions(width, height);
  const clean = join(parts);
  if (mime === "image/webp") new DataView(clean.buffer).setUint32(4, clean.length - 8, true);
  return { bytes: clean, mime, width, height, orientation };
}
