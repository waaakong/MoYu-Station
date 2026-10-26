import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { corners, corruptPngPixels, exif, orientJpeg, orientWebp, pngInsert, solid } from "../test/helpers/candidateFixtures";

test.beforeEach(async ({ page }) => {
  // Blank local harness, not the app: no auth, API, database or production calls.
  await page.route("**/candidate-fixture", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Local candidate qualification</title>" }));
  await page.route("**/api/**", route => route.abort());
  await page.goto("/candidate-fixture");
});

async function run(page: Page, bytes: Buffer, mime: string) {
  return page.evaluate(async ({ encoded, mime }) => {
    const { prepareCandidate } = await import("/src/media/prepareCandidate.ts");
    const source = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const start = performance.now();
    try {
      const result = await prepareCandidate(new File([source], "fixture-private-name", { type: mime }), new AbortController().signal);
      const bitmap = await createImageBitmap(result.file), canvas = new OffscreenCanvas(bitmap.width, bitmap.height), ctx = canvas.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0); bitmap.close();
      const sample = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data];
      const pixels = [[.125,.125], [.875,.125], [.125,.875], [.875,.875]].map(([x, y]) => sample(Math.floor(x * canvas.width), Math.floor(y * canvas.height)));
      const out = new Uint8Array(await result.file.arrayBuffer()); let raw = ""; for (const byte of out) raw += String.fromCharCode(byte);
      canvas.width = canvas.height = 0;
      return { ok: true, width: result.width, height: result.height, bytes: result.outputBytes, mime: result.file.type, name: result.file.name,
        pixels, base64: btoa(raw), elapsedMs: performance.now() - start };
    } catch (error) { return { ok: false, code: (error as any).code, message: String(error), elapsedMs: performance.now() - start }; }
  }, { encoded: bytes.toString("base64"), mime });
}

test("ordinary, long, panorama and tiny images preserve bounded dimensions", async ({ page }, info) => {
  const metrics = [];
  for (const [w, h, expectedW, expectedH] of [[4000,2000,2560,1280], [1000,8000,512,4096], [9001,3000,4096,1365], [4,2,4,2]]) {
    const result = await run(page, await solid(w, h), "image/png");
    expect(result.ok, result.message).toBe(true); expect([result.width, result.height]).toEqual([expectedW, expectedH]);
    expect(result.bytes).toBeLessThanOrEqual(2 * 1024 * 1024); metrics.push({ input: [w, h], output: [result.width, result.height], bytes: result.bytes, elapsedMs: result.elapsedMs });
  }
  await info.attach("candidate-metrics", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
});

test("transparent PNG and WebP preserve transparent and semi-transparent pixels", async ({ page }) => {
  const pixels = Buffer.alloc(64 * 64 * 4);
  for (let y = 16; y < 64; y++) for (let x = 16; x < 64; x++) pixels.set([224,32,64,128], (y * 64 + x) * 4);
  for (const format of ["png", "webp"] as const) {
    const image = sharp(pixels, { raw: { width: 64, height: 64, channels: 4 } });
    const bytes = await (format === "png" ? image.png() : image.webp({ lossless: true })).toBuffer();
    const result = await run(page, bytes, `image/${format}`);
    expect(result.ok, result.message).toBe(true); expect(result.mime).toBe("image/png");
    expect(result.pixels![0][3]).toBe(0); expect(result.pixels![3][3]).toBe(128);
    expect(result.name).toBe("image.png");
    const metadata = await sharp(Buffer.from(result.base64!, "base64")).metadata();
    expect(metadata.exif).toBeUndefined(); expect(metadata.icc).toBeUndefined();
  }
});

test("all eight JPEG PNG and WebP EXIF orientations are applied once and metadata removed", async ({ page }) => {
  const mappings = [[0,1,2,3], [1,0,3,2], [3,2,1,0], [2,3,0,1], [0,2,1,3], [2,0,3,1], [3,1,2,0], [1,3,0,2]];
  const palette = [[240,10,10], [10,240,10], [10,10,240], [240,240,10]];
  for (const format of ["jpeg", "png", "webp"] as const) {
    const source = format === "webp" ? await sharp(await corners("png")).webp({ lossless: true }).toBuffer() : await corners(format);
    for (let orientation = 1; orientation <= 8; orientation++) {
      const input = format === "jpeg" ? orientJpeg(source, orientation) : format === "webp" ? await orientWebp(source, orientation) : pngInsert(source, "eXIf", exif(orientation));
      const result = await run(page, input, `image/${format}`);
      expect(result.ok, result.message).toBe(true); expect([result.width, result.height]).toEqual(orientation >= 5 ? [40,80] : [80,40]);
      for (let i = 0; i < 4; i++) for (let channel = 0; channel < 3; channel++) {
        expect(Math.abs(result.pixels![i][channel] - palette[mappings[orientation - 1][i]][channel])).toBeLessThan(22);
      }
      const metadata = await sharp(Buffer.from(result.base64!, "base64")).metadata();
      expect(metadata.exif).toBeUndefined(); expect(metadata.icc).toBeUndefined();
    }
  }
});

test("high-detail noise refuses oversize output instead of silently shrinking further", async ({ page }, info) => {
  // This case isolates the 2 MiB output rejection, not the worker's CPU budget
  // at maximum dimensions (covered separately by bounded-dimension tests).
  // 2048px noise still exceeds the output cap after every supported encoding.
  const width = 2048, height = 2048, raw = Buffer.alloc(width * height * 3); let seed = 123456789;
  for (let i = 0; i < raw.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; raw[i] = seed & 255; }
  const source = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  expect(source.length).toBeLessThanOrEqual(20 * 1024 * 1024);
  expect(source.length).toBeGreaterThan(2 * 1024 * 1024);
  const result = await run(page, source, "image/png");
  expect(result).toMatchObject({ ok: false, code: "MEDIA_OUTPUT_SIZE" });
  await info.attach("high-detail-refusal", { body: JSON.stringify({ inputBytes: source.length, ...result }), contentType: "application/json" });
});

test("animation, fake MIME, corrupt pixels and unqualified colors fail without fallback upload", async ({ page }) => {
  const png = await solid();
  const samples = [
    { bytes: pngInsert(png, "acTL", Buffer.from([0,0,0,2,0,0,0,0])), mime: "image/png", code: "MEDIA_ANIMATED" },
    { bytes: png, mime: "image/jpeg", code: "MEDIA_TYPE" },
    { bytes: png.subarray(0, -5), mime: "image/png", code: "MEDIA_INVALID" },
    { bytes: corruptPngPixels(png), mime: "image/png", code: "MEDIA_INVALID" },
    { bytes: await sharp(png).withIccProfile("p3").png().toBuffer(), mime: "image/png", code: "MEDIA_COLOR" }
  ];
  for (const sample of samples) { const result = await run(page, sample.bytes, sample.mime); expect(result).toMatchObject({ ok: false, code: sample.code }); }
});

test("real worker cancellation does not block the next queued candidate", async ({ page }) => {
  const encoded = (await solid(2000, 2000)).toString("base64");
  const result = await page.evaluate(async encoded => {
    const { prepareCandidate } = await import("/src/media/prepareCandidate.ts");
    const file = new File([Uint8Array.from(atob(encoded), c => c.charCodeAt(0))], "cancel.png", { type: "image/png" });
    const controller = new AbortController(); const first = prepareCandidate(file, controller.signal).then(() => "unexpected", (error: Error) => error.name);
    const second = prepareCandidate(file, new AbortController().signal); controller.abort();
    return { first: await first, second: (await second).width };
  }, encoded);
  expect(result).toEqual({ first: "AbortError", second: 2000 });
});

test("browser candidates pass the actual isolated Java worker without a second lossy encode", async ({ page }, info) => {
  test.skip(!process.env.MEDIA_WORKER_JAR || !process.env.MEDIA_JAVA_BINARY, "Explicit local worker jar and Java binary required; no server or database is started.");
  const jar = resolve(process.env.MEDIA_WORKER_JAR!);
  const metrics = [];
  for (const format of ["png", "jpeg", "webp"] as const) {
    const source = await solid(1000, 4000, format);
    const candidate = await run(page, source, `image/${format}`); expect(candidate.ok, candidate.message).toBe(true);
    const bytes = Buffer.from(candidate.base64!, "base64"), mime = Buffer.from(candidate.mime!);
    const header = Buffer.alloc(2 + mime.length + 4); header.writeUInt16BE(mime.length); header.set(mime, 2); header.writeInt32BE(bytes.length, mime.length + 2);
    const output = execFileSync(process.env.MEDIA_JAVA_BINARY!, ["-Xms32m", "-Xmx256m", "-XX:MaxDirectMemorySize=32m", "-Djava.awt.headless=true",
      "-Dloader.main=com.studyroom.media.ImageWorker", `-Dloader.config.location=jar:${pathToFileURL(jar).href}!/BOOT-INF/classes/media-worker-loader.properties`,
      "-Dloader.path=", "-Dloader.args=", "-Dloader.system=false", "-cp", jar, "org.springframework.boot.loader.PropertiesLauncher"], {
      input: Buffer.concat([header, bytes]), timeout: 15000, maxBuffer: 6 * 1024 * 1024,
      env: Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(SystemRoot|WINDIR|TEMP|TMP|LANG|LC_ALL)$/i.test(key)))
    });
    expect(output[0], `worker response for ${format}: ${output.subarray(0, 100).toString()}`).toBe(1);
    let p = 1;
    const variant = () => {
      const n = output.readUInt16BE(p); p += 2; const mime = output.toString("utf8", p, p + n); p += n;
      const width = output.readInt32BE(p), height = output.readInt32BE(p + 4), length = output.readInt32BE(p + 8); p += 12;
      const bytes = output.subarray(p, p + length); p += length; return { mime, width, height, bytes };
    };
    const clear = variant(), thumb = variant();
    expect(p).toBe(output.length); expect(clear.bytes).toEqual(bytes);
    expect([clear.width, clear.height]).toEqual([candidate.width, candidate.height]);
    expect(Math.max(thumb.width, thumb.height)).toBeLessThanOrEqual(512);
    expect((await sharp(thumb.bytes).metadata()).format).toBe("png");
    metrics.push({ inputFormat: format, candidateMime: clear.mime, clearBytes: clear.bytes.length, thumbBytes: thumb.bytes.length });
  }
  await info.attach("java-worker-roundtrip", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" });
});
