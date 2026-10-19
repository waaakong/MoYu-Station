import { CANDIDATE_LIMITS, CandidateError, candidateDimensions, inspectCandidateSource } from "./candidateContainer";

export type PreparedCandidate = { file: File; width: number; height: number; originalBytes: number; outputBytes: number };
export type CandidateRuntime = {
  decode(blob: Blob): Promise<ImageBitmap>;
  canvas(width: number, height: number): OffscreenCanvas;
};
const nativeRuntime: CandidateRuntime = {
  decode: blob => createImageBitmap(blob, { imageOrientation: "none", colorSpaceConversion: "default" }),
  canvas: (width, height) => new OffscreenCanvas(width, height)
};

/** Run only inside the disposable worker. Runtime injection is for deterministic unit tests. */
export async function processCandidate(file: File, runtime: CandidateRuntime = nativeRuntime): Promise<PreparedCandidate> {
  if (!file.size || file.size > CANDIDATE_LIMITS.inputBytes) throw new CandidateError("MEDIA_SIZE");
  const source = inspectCandidateSource(new Uint8Array(await file.arrayBuffer()), file.type);
  let bitmap: ImageBitmap | undefined, canvas: OffscreenCanvas | undefined;
  try {
    bitmap = await runtime.decode(new Blob([source.bytes], { type: source.mime }));
    if (bitmap.width !== source.width || bitmap.height !== source.height) throw new CandidateError("MEDIA_INVALID");
    const swapped = source.orientation >= 5;
    const upright = { width: swapped ? source.height : source.width, height: swapped ? source.width : source.height };
    const { width, height } = candidateDimensions(upright.width, upright.height);
    canvas = runtime.canvas(width, height);
    const context = canvas.getContext("2d", { alpha: true, colorSpace: "srgb" });
    if (!context) throw new CandidateError("MEDIA_UNSUPPORTED");
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = "high";
    context.scale(width / upright.width, height / upright.height);
    const w = source.width, h = source.height;
    const transforms: Array<[number, number, number, number, number, number]> = [
      [1,0,0,1,0,0], [-1,0,0,1,w,0], [-1,0,0,-1,w,h], [1,0,0,-1,0,h],
      [0,1,1,0,0,0], [0,1,-1,0,h,0], [0,-1,-1,0,h,w], [0,-1,1,0,0,w]
    ];
    context.transform(...transforms[source.orientation - 1]); context.drawImage(bitmap, 0, 0);
    bitmap.close(); bitmap = undefined;
    let output: Blob | undefined;
    // PNG preserves text/alpha exactly when it fits. Never fall back to opaque JPEG.
    if (source.mime !== "image/jpeg") {
      const lossless = await canvas.convertToBlob({ type: "image/png" });
      if (lossless.type !== "image/png") throw new CandidateError("MEDIA_UNSUPPORTED");
      if (lossless.size <= CANDIDATE_LIMITS.outputBytes) output = lossless;
    }
    if (!output) for (const quality of [.92, .86, .8]) {
      const encoded = await canvas.convertToBlob({ type: "image/webp", quality });
      if (encoded.type !== "image/webp") throw new CandidateError("MEDIA_UNSUPPORTED");
      if (encoded.size <= CANDIDATE_LIMITS.outputBytes) { output = encoded; break; }
    }
    if (!output) throw new CandidateError("MEDIA_OUTPUT_SIZE");
    const encoded = new Uint8Array(await output.arrayBuffer());
    // Chromium's sRGB canvas WebP writer emits an ICCP chunk. Only these freshly
    // encoded sRGB pixels may drop it; source ICC profiles are rejected before decoding.
    const checked = inspectCandidateSource(output.type === "image/webp" ? withoutCanvasProfile(encoded) : encoded, output.type);
    if (checked.width !== width || checked.height !== height || checked.orientation !== 1) throw new CandidateError("MEDIA_INVALID");
    const extension = output.type === "image/png" ? "png" : "webp";
    // A generic name avoids propagating a local filename into downstream transport/storage.
    const candidate = new File([checked.bytes], `image.${extension}`, { type: output.type });
    if (!candidate.size || candidate.size > CANDIDATE_LIMITS.outputBytes) throw new CandidateError("MEDIA_OUTPUT_SIZE");
    return { file: candidate, width, height, originalBytes: file.size, outputBytes: candidate.size };
  } catch (error) {
    if (error instanceof CandidateError) throw error;
    throw new CandidateError("MEDIA_INVALID");
  } finally {
    bitmap?.close();
    if (canvas) { canvas.width = 0; canvas.height = 0; }
  }
}

function withoutCanvasProfile(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const view = new DataView(bytes.buffer);
  const text = (p: number, n: number) => String.fromCharCode(...bytes.subarray(p, p + n));
  if (bytes.length < 12 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP" || view.getUint32(4, true) !== bytes.length - 8) throw new CandidateError("MEDIA_INVALID");
  const parts = [bytes.subarray(0, 12)]; let size = 12, profile = false, flagged = false;
  for (let p = 12; p < bytes.length;) {
    if (p + 8 > bytes.length) throw new CandidateError("MEDIA_INVALID");
    const n = view.getUint32(p + 4, true), end = p + 8 + n + (n & 1), type = text(p, 4);
    if (end > bytes.length || ((n & 1) && bytes[end - 1] !== 0)) throw new CandidateError("MEDIA_INVALID");
    const chunk = bytes.slice(p, end);
    if (type === "VP8X") {
      if (p !== 12 || n !== 10) throw new CandidateError("MEDIA_INVALID");
      flagged = !!(chunk[8] & 32); chunk[8] &= ~32;
    }
    if (type === "ICCP") {
      if (profile || !flagged || n < 128) throw new CandidateError("MEDIA_INVALID");
      profile = true;
    } else { parts.push(chunk); size += chunk.length; }
    p = end;
  }
  if (profile !== flagged) throw new CandidateError("MEDIA_INVALID");
  const result = new Uint8Array(size); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  new DataView(result.buffer).setUint32(4, size - 8, true); return result;
}
