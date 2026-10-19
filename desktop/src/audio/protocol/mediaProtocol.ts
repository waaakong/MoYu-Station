import { createReadStream, statSync } from "node:fs";
import { extname } from "node:path";
import { Readable } from "node:stream";
import { protocol } from "electron";
import type { LocalDatabaseStore } from "../../database/database";
import { SUPPORTED_AUDIO_EXTENSIONS } from "../library/scanner";
import { createRemoteMediaResponse, type RemoteMediaSessionRegistry } from "./remoteMediaProtocol";
import { audioCorsHeaders } from "./audioCors";

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg", ".flac": "audio/flac", ".wav": "audio/wav",
  ".m4a": "audio/mp4", ".aac": "audio/aac", ".ogg": "audio/ogg", ".opus": "audio/ogg"
};
const ARTWORK_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: "studyroom-media", privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, corsEnabled: true } }]);
}

function parseRange(value: string | null, size: number): { start: number; end: number } | undefined {
  if (!value) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) throw new Error("INVALID_RANGE");
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || end >= size) throw new Error("INVALID_RANGE");
  return { start, end };
}

export function createMediaResponse(request: Request, database: LocalDatabaseStore): Response {
  try {
    const url = new URL(request.url);
    const token = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("Not found", { status: 404 });
    if (url.hostname === "artwork") {
      const artwork = database.resolveArtworkFile(token);
      if (!artwork) return new Response("Not found", { status: 404 });
      const details = statSync(artwork.path);
      if (!details.isFile() || details.size > 2 * 1024 * 1024 || !ARTWORK_MIME_TYPES.has(artwork.mimeType)) return new Response("Not found", { status: 404 });
      const stream = Readable.toWeb(createReadStream(artwork.path)) as ReadableStream;
      return new Response(stream, { headers: {
        "Content-Type": artwork.mimeType,
        "Content-Length": String(details.size),
        "Cache-Control": "private, max-age=31536000, immutable"
      } });
    }
    if (url.hostname !== "track") return new Response("Not found", { status: 404 });
    const path = database.resolveLocalFile(token);
    if (!path) return new Response("Not found", { status: 404 });
    const extension = extname(path).toLowerCase();
    const details = statSync(path);
    if (!details.isFile() || !SUPPORTED_AUDIO_EXTENSIONS.has(extension)) return new Response("Not found", { status: 404 });
    const range = parseRange(request.headers.get("range"), details.size);
    const start = range?.start ?? 0;
    const end = range?.end ?? details.size - 1;
    const headers = new Headers({
      ...audioCorsHeaders(request),
      "Accept-Ranges": "bytes",
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Content-Length": String(end - start + 1),
      "Cache-Control": "private, no-store"
    });
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${details.size}`);
    const stream = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
    return new Response(stream, { status: range ? 206 : 200, headers });
  } catch (error) {
    return new Response(error instanceof Error && error.message === "INVALID_RANGE" ? "Invalid range" : "Not found", { status: error instanceof Error && error.message === "INVALID_RANGE" ? 416 : 404 });
  }
}

export function installMediaProtocol(database: LocalDatabaseStore, remoteRegistry?: RemoteMediaSessionRegistry, cloudMedia?: (path: string) => Promise<Response>, providerArtwork?: (request:Request)=>Promise<Response>): () => void {
  protocol.handle("studyroom-media", (request) => {
    const host = new URL(request.url).hostname;
    if(host==='provider-artwork'&&providerArtwork)return providerArtwork(request);
    if (host === "cloud" && cloudMedia) {
      const url = new URL(request.url);
      if (request.method !== "GET" || url.username || url.password || url.port || url.search || url.hash) return new Response(null, { status: 404 });
      return cloudMedia(url.pathname).catch(() => new Response(null, { status: 404 }));
    }
    if ((host === "provider" || host === "radio") && remoteRegistry) {
      return createRemoteMediaResponse(request, remoteRegistry);
    }
    return createMediaResponse(request, database);
  });
  return () => { if (protocol.isProtocolHandled("studyroom-media")) protocol.unhandle("studyroom-media"); };
}
