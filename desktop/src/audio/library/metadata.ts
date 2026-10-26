import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, stat, unlink, utimes, writeFile } from "node:fs/promises";
import { parse, resolve } from "node:path";
import {parseMetadataProcess} from './metadataProcess';
import type {parseFile} from 'music-metadata';

const MAX_COVER_BYTES = 2 * 1024 * 1024;
const MAX_COVER_PIXELS = 16_000_000;
const MAX_COVER_EDGE = 8_192;
const MAX_LYRICS_BYTES = 512 * 1024;
const MAX_TEXT_LENGTH = 500;
const METADATA_TIMEOUT_MS = 5_000;
const MAX_ARTWORK_CACHE_BYTES = 256 * 1024 * 1024;

export interface CachedArtwork {
  token: string;
  path: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export interface AudioMetadataResult {
  title?: string;
  artist?: string;
  album?: string;
  durationMs?: number;
  artwork?: CachedArtwork;
  lyrics?: string;
  lyricsSource?: "embedded" | "sidecar";
  parseFailed: boolean;
}

function cleanText(value: string | undefined): string | undefined {
  const cleaned = value?.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned ? cleaned.slice(0, MAX_TEXT_LENGTH) : undefined;
}

function dimensions(data: Uint8Array, mimeType: string): { width: number; height: number } | undefined {
  const view = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (mimeType === "image/png" && view.length >= 24 && view.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
  }
  if (mimeType === "image/jpeg" && view.length >= 4 && view[0] === 0xff && view[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < view.length) {
      if (view[offset] !== 0xff) { offset += 1; continue; }
      const marker = view[offset + 1]!;
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const segmentLength = view.readUInt16BE(offset + 2);
      if (segmentLength < 2 || offset + 2 + segmentLength > view.length) return undefined;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return { height: view.readUInt16BE(offset + 5), width: view.readUInt16BE(offset + 7) };
      }
      offset += 2 + segmentLength;
    }
  }
  if (mimeType === "image/webp" && view.length >= 30 && view.subarray(0, 4).toString("ascii") === "RIFF" && view.subarray(8, 12).toString("ascii") === "WEBP") {
    const kind = view.subarray(12, 16).toString("ascii");
    if (kind === "VP8X") return { width: 1 + view.readUIntLE(24, 3), height: 1 + view.readUIntLE(27, 3) };
    if (kind === "VP8 " && view.length >= 30) return { width: view.readUInt16LE(26) & 0x3fff, height: view.readUInt16LE(28) & 0x3fff };
    if (kind === "VP8L" && view.length >= 25) {
      const bits = view.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
  }
  return undefined;
}

function acceptedArtwork(data: Uint8Array, format: string): CachedArtwork["mimeType"] | undefined {
  const mimeType = format.toLowerCase() === "image/jpg" ? "image/jpeg" : format.toLowerCase();
  if (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp") return undefined;
  if (!data.length || data.length > MAX_COVER_BYTES) return undefined;
  const size = dimensions(data, mimeType);
  if (!size || size.width <= 0 || size.height <= 0 || size.width > MAX_COVER_EDGE || size.height > MAX_COVER_EDGE || size.width * size.height > MAX_COVER_PIXELS) return undefined;
  return mimeType;
}

export function isArtworkWithinLimits(data: Uint8Array, format: string): boolean {
  return acceptedArtwork(data, format) !== undefined;
}

function stableToken(fingerprint: string, data: Uint8Array): string {
  const hash = createHash("sha256").update(fingerprint).update(data).digest("hex").slice(0, 32);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20)}`;
}

async function cacheArtwork(data: Uint8Array, format: string, fingerprint: string, cacheDirectory?: string): Promise<CachedArtwork | undefined> {
  if (!cacheDirectory) return undefined;
  const mimeType = acceptedArtwork(data, format);
  if (!mimeType) return undefined;
  const token = stableToken(fingerprint, data);
  const extension = mimeType === "image/jpeg" ? ".jpg" : mimeType === "image/png" ? ".png" : ".webp";
  const directory = resolve(cacheDirectory, "artwork");
  const path = resolve(directory, `${token}${extension}`);
  await mkdir(directory, { recursive: true });
  if (!existsSync(path)) {
    await writeFile(path, data, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
  } else {
    const now = new Date();
    await utimes(path, now, now).catch(() => undefined);
  }
  return { token, path, mimeType };
}

export async function pruneArtworkCache(cacheDirectory: string): Promise<void> {
  const directory = resolve(cacheDirectory, "artwork");
  let names: string[];
  try {
    names = await readdir(directory);
  } catch {
    return;
  }
  const entries = (await Promise.all(names.map(async (name) => {
    const path = resolve(directory, name);
    if (!path.startsWith(`${directory}\\`) && !path.startsWith(`${directory}/`)) return undefined;
    try {
      const details = await stat(path);
      return details.isFile() ? { path, size: details.size, modifiedAt: details.mtimeMs } : undefined;
    } catch {
      return undefined;
    }
  }))).filter((entry): entry is { path: string; size: number; modifiedAt: number } => Boolean(entry));
  let total = entries.reduce((sum, entry) => sum + entry.size, 0);
  for (const entry of entries.sort((left, right) => left.modifiedAt - right.modifiedAt)) {
    if (total <= MAX_ARTWORK_CACHE_BYTES) break;
    await unlink(entry.path).catch(() => undefined);
    total -= entry.size;
  }
}

async function readSidecarLyrics(audioPath: string): Promise<string | undefined> {
  const parsed = parse(audioPath);
  const lrcPath = resolve(parsed.dir, `${parsed.name}.lrc`);
  try {
    const details = await stat(lrcPath);
    if (!details.isFile() || details.size <= 0 || details.size > MAX_LYRICS_BYTES) return undefined;
    const content = (await readFile(lrcPath, "utf8")).replace(/^\uFEFF/, "").trim();
    return content ? content.slice(0, MAX_LYRICS_BYTES) : undefined;
  } catch {
    return undefined;
  }
}

function embeddedLyrics(metadata: Awaited<ReturnType<typeof parseFile>>): string | undefined {
  const lyrics = metadata.common.lyrics?.[0];
  if (!lyrics) return undefined;
  const value = lyrics.text || lyrics.syncText?.map((line) => {
    const time = line.timestamp == null ? "" : `[${Math.floor(line.timestamp / 60).toString().padStart(2, "0")}:${(line.timestamp % 60).toFixed(2).padStart(5, "0")}]`;
    return `${time}${line.text}`;
  }).join("\n");
  return value?.trim().slice(0, MAX_LYRICS_BYTES) || undefined;
}

export async function readAudioMetadata(audioPath: string, fingerprint: string, cacheDirectory?: string): Promise<AudioMetadataResult> {
  const sidecar = await readSidecarLyrics(audioPath);
  let timeout: NodeJS.Timeout | undefined;
  try {
    const metadata = await parseMetadataProcess(audioPath);
    const cover = metadata.cover;
    return {
      title: cleanText(metadata.title),
      artist: cleanText(metadata.artist),
      album: cleanText(metadata.album),
      durationMs: metadata.durationMs,
      artwork: cover ? await cacheArtwork(cover.data, cover.mime, fingerprint, cacheDirectory) : undefined,
      lyrics: sidecar || metadata.lyrics,
      lyricsSource: sidecar ? "sidecar" : metadata.lyrics ? "embedded" : undefined,
      parseFailed: false
    };
  } catch {
    return { lyrics: sidecar, lyricsSource: sidecar ? "sidecar" : undefined, parseFailed: true };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
