import { opendir, stat } from "node:fs/promises";
import { extname, parse, resolve } from "node:path";
import { pruneArtworkCache, readAudioMetadata, type AudioMetadataResult } from "./metadata";
import { quickContentSignature } from "./contentFingerprint";

export const SUPPORTED_AUDIO_EXTENSIONS = new Set([".mp3", ".flac", ".wav", ".m4a", ".aac", ".ogg", ".opus"]);
const MAX_TRACKS = 50_000;

export interface ScannedAudioFile {
  path: string;
  title: string;
  artist: string;
  quickSignature: string;
  size: number;
  modifiedAt: number;
  album?: string;
  durationMs?: number;
  artwork?: AudioMetadataResult["artwork"];
  lyrics?: string;
  lyricsSource?: AudioMetadataResult["lyricsSource"];
  metadataWarning?: boolean;
}

export interface ScanSummary {
  rootPath: string;
  files: ScannedAudioFile[];
  skipped: number;
  failed: number;
  metadataWarnings: number;
  limitReached: boolean;
  complete: boolean;
}

export interface ScanAudioDirectoryOptions {
  signal?: AbortSignal;
  cacheDirectory?: string;
  readMetadata?: typeof readAudioMetadata;
}

export async function scanAudioFile(path: string, cacheDirectory?: string): Promise<ScannedAudioFile> {
  const fullPath = resolve(path);
  if (!SUPPORTED_AUDIO_EXTENSIONS.has(extname(fullPath).toLowerCase())) throw new Error("UNSUPPORTED_AUDIO_FILE");
  const details = await stat(fullPath);
  if (!details.isFile()) throw new Error("UNSUPPORTED_AUDIO_FILE");
  const name = parse(fullPath).name;
  const [fallbackArtist, ...titleParts] = name.split(" - ").map((part) => part.trim()).filter(Boolean);
  const hasArtist = titleParts.length > 0;
  const quickSignature = await quickContentSignature(fullPath, details.size);
  const metadata = await readAudioMetadata(fullPath, quickSignature, cacheDirectory);
  return {
    path: fullPath,
    title: metadata.title || (hasArtist ? titleParts.join(" - ") : name),
    artist: metadata.artist || (hasArtist ? (fallbackArtist || "未知艺术家") : "未知艺术家"),
    album: metadata.album,
    durationMs: metadata.durationMs,
    artwork: metadata.artwork,
    lyrics: metadata.lyrics,
    lyricsSource: metadata.lyricsSource,
    metadataWarning: metadata.parseFailed,
    quickSignature,
    size: details.size,
    modifiedAt: Math.floor(details.mtimeMs)
  };
}

export async function scanAudioDirectory(rootPath: string, input?: AbortSignal | ScanAudioDirectoryOptions): Promise<ScanSummary> {
  const root = resolve(rootPath);
  const options: ScanAudioDirectoryOptions = input instanceof AbortSignal ? { signal: input } : (input || {});
  const signal = options.signal;
  const metadataReader = options.readMetadata || readAudioMetadata;
  const files: ScannedAudioFile[] = [];
  let skipped = 0;
  let failed = 0;
  let metadataWarnings = 0;
  const pending = [root];

  while (pending.length && files.length < MAX_TRACKS) {
    if (signal?.aborted) throw new Error("LIBRARY_SCAN_CANCELED");
    const directoryPath = pending.pop()!;
    try {
      const directory = await opendir(directoryPath);
      for await (const entry of directory) {
        if (signal?.aborted) throw new Error("LIBRARY_SCAN_CANCELED");
        const fullPath = resolve(directoryPath, entry.name);
        if (entry.isDirectory()) {
          pending.push(fullPath);
          continue;
        }
        if (!entry.isFile() || !SUPPORTED_AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
          skipped += 1;
          continue;
        }
        try {
          const details = await stat(fullPath);
          const name = parse(entry.name).name;
          const [artist, ...titleParts] = name.split(" - ").map((part) => part.trim()).filter(Boolean);
          const hasArtist = titleParts.length > 0;
          const quickSignature = await quickContentSignature(fullPath, details.size);
          const metadata = await metadataReader(fullPath, quickSignature, options.cacheDirectory);
          files.push({
            path: fullPath,
            title: metadata.title || (hasArtist ? titleParts.join(" - ") : name),
            artist: metadata.artist || (hasArtist ? (artist || "未知艺术家") : "未知艺术家"),
            album: metadata.album,
            durationMs: metadata.durationMs,
            artwork: metadata.artwork,
            lyrics: metadata.lyrics,
            lyricsSource: metadata.lyricsSource,
            metadataWarning: metadata.parseFailed,
            quickSignature,
            size: details.size,
            modifiedAt: Math.floor(details.mtimeMs)
          });
          if (metadata.parseFailed) metadataWarnings += 1;
          if (files.length >= MAX_TRACKS) break;
        } catch {
          failed += 1;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === "LIBRARY_SCAN_CANCELED") throw error;
      failed += 1;
    }
  }
  if (options.cacheDirectory) await pruneArtworkCache(options.cacheDirectory);
  const limitReached = files.length >= MAX_TRACKS;
  return { rootPath: root, files, skipped, failed, metadataWarnings, limitReached, complete: failed === 0 && !limitReached };
}
