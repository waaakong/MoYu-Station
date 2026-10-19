import { describe, expect, it } from "vitest";
import {
  fitWithin,
  IMAGE_INPUT_LIMIT,
  prepareUploadImage,
  validateImageCandidate
} from "../src/utils/imagePipeline";

describe("imagePipeline", () => {
  it("fits landscape and portrait images inside 1600px", () => {
    expect(fitWithin(4000, 2000)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(1200, 2400)).toEqual({ width: 800, height: 1600 });
  });

  it("rejects unsupported types, excessive bytes and decompression bombs", () => {
    expect(() => validateImageCandidate(new File(["x"], "x.gif", { type: "image/gif" }))).toThrow("仅支持");
    const oversized = new File([new Uint8Array(IMAGE_INPUT_LIMIT + 1)], "x.png", { type: "image/png" });
    expect(() => validateImageCandidate(oversized)).toThrow("20MB");
    expect(() => fitWithin(10_000, 10_000)).toThrow("安全限制");
  });

  it("re-encodes to WebP and strips source metadata by creating a new file", async () => {
    const original = new File(["source-with-exif"], "photo.jpg", { type: "image/jpeg" });
    const bitmap = { width: 3200, height: 1600, close() {} } as ImageBitmap;
    const contextOptions: CanvasRenderingContext2DSettings[] = [];
    const canvas = {
      getContext: (_type: string, options?: CanvasRenderingContext2DSettings) => {
        if (options) contextOptions.push(options);
        return {
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
          drawImage() {}
        };
      },
      toBlob: (callback: BlobCallback) => callback(new Blob(["webp"], { type: "image/webp" }))
    } as unknown as HTMLCanvasElement;
    const result = await prepareUploadImage(original, {
      createBitmap: async () => bitmap,
      createCanvas: () => canvas
    });
    expect(result.file.name).toBe("photo.webp");
    expect(result.file.type).toBe("image/webp");
    expect(result).toMatchObject({ width: 1600, height: 800, originalBytes: original.size, outputBytes: 4 });
    expect(contextOptions).toEqual([{ alpha: false }]);
  });

  it("keeps an alpha-capable canvas for PNG and WebP uploads", async () => {
    const contextOptions: CanvasRenderingContext2DSettings[] = [];
    let clearRectCalls = 0;
    const canvas = {
      getContext: (_type: string, options?: CanvasRenderingContext2DSettings) => {
        if (options) contextOptions.push(options);
        return {
          imageSmoothingEnabled: false,
          imageSmoothingQuality: "low",
          clearRect() { clearRectCalls += 1; },
          drawImage() {}
        };
      },
      toBlob: (callback: BlobCallback) => callback(new Blob(["webp-alpha"], { type: "image/webp" }))
    } as unknown as HTMLCanvasElement;

    for (const type of ["image/png", "image/webp"]) {
      await prepareUploadImage(new File(["transparent"], `image.${type === "image/png" ? "png" : "webp"}`, { type }), {
        createBitmap: async () => ({ width: 64, height: 64, close() {} }) as ImageBitmap,
        createCanvas: () => canvas
      });
    }

    expect(contextOptions).toEqual([{ alpha: true }, { alpha: true }]);
    expect(clearRectCalls).toBe(2);
  });
});
