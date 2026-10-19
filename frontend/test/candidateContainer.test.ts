import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { candidateDimensions, inspectCandidateSource, crc32 } from "../src/media/candidateContainer";
import { corruptPngPixels, exif, orientJpeg, pngInsert, solid } from "./helpers/candidateFixtures";

describe("candidate predecode container inspection", () => {
  it.each(["png", "jpeg", "webp"] as const)("accepts generated static %s and fully decodes the sanitized result", async format => {
    const image = inspectCandidateSource(await solid(64, 32, format), `image/${format}`);
    expect(image).toMatchObject({ width: 64, height: 32, orientation: 1 });
    const { info } = await sharp(image.bytes).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([64, 32]);
  });
  it("checks ordinary, panoramic, tiny and rounding-boundary dimensions", () => {
    expect(candidateDimensions(4000, 2000)).toEqual({ width: 2560, height: 1280 });
    expect(candidateDimensions(1000, 8000)).toEqual({ width: 512, height: 4096 });
    expect(candidateDimensions(4, 2)).toEqual({ width: 4, height: 2 });
    const rounded = candidateDimensions(9001, 3000); expect(rounded.width / rounded.height).toBeGreaterThanOrEqual(3);
    expect(() => candidateDimensions(12001, 1)).toThrow(); expect(() => candidateDimensions(8000, 8000)).toThrow();
  });
  it.each([1,2,3,4,5,6,7,8])("extracts EXIF %i and removes all metadata before native decode", async orientation => {
    const source = orientJpeg(await solid(64, 32, "jpeg"), orientation);
    const image = inspectCandidateSource(source, "image/jpeg");
    expect(image.orientation).toBe(orientation); expect(Buffer.from(image.bytes).includes(Buffer.from("Exif"))).toBe(false);
    const png = inspectCandidateSource(pngInsert(await solid(), "eXIf", exif(orientation)), "image/png");
    expect(png.orientation).toBe(orientation); expect(Buffer.from(png.bytes).includes(Buffer.from("eXIf"))).toBe(false);
  });
  it("drops text metadata without rewriting compressed PNG pixel data", async () => {
    const base = await solid();
    const inspected = inspectCandidateSource(pngInsert(base, "tEXt", Buffer.from("GPS\0private-fixture")), "image/png");
    expect(Buffer.from(inspected.bytes)).toEqual(Buffer.from(inspectCandidateSource(base, "image/png").bytes));
    expect(await sharp(inspected.bytes).raw().toBuffer()).toEqual(await sharp(base).raw().toBuffer());
  });
  it("rejects empty, fake MIME, truncation, bad CRC and trailing data", async () => {
    const png = await solid(); const badCrc = Buffer.from(png); badCrc[20] ^= 1;
    for (const bytes of [Buffer.alloc(0), png.subarray(0, -1), badCrc, Buffer.concat([png, Buffer.from([0])])]) {
      expect(() => inspectCandidateSource(bytes, "image/png")).toThrow();
    }
    expect(() => inspectCandidateSource(png, "image/jpeg")).toThrow("真实");
    expect(() => inspectCandidateSource(Buffer.from("GIF89a"), "image/png")).toThrow("真实");
  });
  it("rejects oversized dimensions from the header without decoding pixels", async () => {
    const png = Buffer.from(await solid()); png.writeUInt32BE(12001, 16); png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
    expect(() => inspectCandidateSource(png, "image/png")).toThrow("12000");
  });
  it("does not mistake successful container preflight for complete pixel decoding", async () => {
    const corrupt = inspectCandidateSource(corruptPngPixels(await solid()), "image/png");
    expect(corrupt.width).toBe(64);
    await expect(sharp(corrupt.bytes).raw().toBuffer()).rejects.toThrow();
  });
  it("rejects APNG and animated WebP instead of silently flattening", async () => {
    const png = pngInsert(await solid(), "acTL", Buffer.from([0,0,0,2,0,0,0,0]));
    expect(() => inspectCandidateSource(png, "image/png")).toThrow("动图");
    const webp = Buffer.alloc(30); webp.write("RIFF"); webp.writeUInt32LE(22, 4); webp.write("WEBPVP8X", 8);
    webp.writeUInt32LE(10, 16); webp[20] = 2;
    expect(() => inspectCandidateSource(webp, "image/webp")).toThrow("动图");
  });
  it("rejects unqualified ICC and non-sRGB gamma without stripping and misinterpreting it", async () => {
    const png = await solid();
    for (const type of ["iCCP", "cICP"]) expect(() => inspectCandidateSource(pngInsert(png, type, Buffer.from([1])), "image/png")).toThrow("色彩");
    expect(() => inspectCandidateSource(pngInsert(png, "gAMA", Buffer.from([0,0,0,1])), "image/png")).toThrow("色彩");
    const profiled = await sharp(png).withIccProfile("p3").jpeg().toBuffer();
    expect(() => inspectCandidateSource(profiled, "image/jpeg")).toThrow("色彩");
  });
  it("rejects malformed EXIF, duplicate dimensions and WebP length mismatch", async () => {
    const jpeg = await solid(20, 10, "jpeg");
    expect(() => inspectCandidateSource(orientJpeg(jpeg, 9), "image/jpeg")).toThrow();
    const png = await solid();
    expect(() => inspectCandidateSource(pngInsert(png, "IHDR", png.subarray(16, 29)), "image/png")).toThrow();
    const webp = await solid(20, 10, "webp"); webp.writeUInt32LE(1, 4);
    expect(() => inspectCandidateSource(webp, "image/webp")).toThrow();
  });
});
