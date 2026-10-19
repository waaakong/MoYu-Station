import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";

const SAMPLE_BYTES = 64 * 1024;

async function readSample(path: string, position: number, length: number): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function quickContentSignature(path: string, knownSize?: number): Promise<string> {
  const size = knownSize ?? (await stat(path)).size;
  const offsets = [...new Set([
    0,
    Math.max(0, Math.floor(size / 2) - Math.floor(SAMPLE_BYTES / 2)),
    Math.max(0, size - SAMPLE_BYTES)
  ])];
  const hash = createHash("sha256").update(String(size));
  for (const offset of offsets) hash.update(await readSample(path, offset, Math.min(SAMPLE_BYTES, Math.max(0, size - offset))));
  return hash.digest("hex");
}

export async function fullContentHash(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path, { highWaterMark: 256 * 1024 })) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
