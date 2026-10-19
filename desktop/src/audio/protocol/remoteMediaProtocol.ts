import { randomBytes } from "node:crypto";
import type { ProviderId } from "@studyroom/contracts";
import { pinnedMediaFetch } from "./pinnedMediaFetch";
import { audioCorsHeaders } from "./audioCors";
import { verifyMp3Prefix } from './verifyMp3';

export type RemoteMediaKind = "provider" | "radio";

export interface RemoteMediaSource {
  kind: RemoteMediaKind;
  ownerId: ProviderId | string;
  trackId: string;
  playbackSessionId: string;
  accountScope: string;
  url: URL;
  expiresAt: number;
  allowedHosts: readonly string[];
  requestHeaders?: Readonly<Record<string, string>>;
}

interface RemoteMediaEntry extends RemoteMediaSource { token: string; lifetime: AbortController; verifiedMp3?:boolean }

function hostAllowed(hostname: string, allowedHosts: readonly string[]): boolean {
  const normalized = hostname.toLowerCase();
  return allowedHosts.some((host) => normalized === host || normalized.endsWith(`.${host}`));
}

export class RemoteMediaSessionRegistry {
  private readonly entries = new Map<string, RemoteMediaEntry>();

  constructor(private readonly now: () => number = Date.now, private readonly maxTtlMs = 5 * 60_000) {}

  issue(source: RemoteMediaSource): string {
    if (source.url.protocol !== "https:" || source.url.username || source.url.password || source.url.port || !hostAllowed(source.url.hostname, source.allowedHosts)) {
      throw new Error("REMOTE_MEDIA_SOURCE_REJECTED");
    }
    const expiresAt = Math.min(source.expiresAt, this.now() + this.maxTtlMs);
    if (expiresAt <= this.now()) throw new Error("REMOTE_MEDIA_SOURCE_EXPIRED");
    const token = randomBytes(32).toString("hex");
    this.entries.set(token, { ...source, expiresAt, token, lifetime:new AbortController() });
    return token;
  }

  resolve(kind: RemoteMediaKind, token: string): RemoteMediaEntry | undefined {
    if (!/^[0-9a-f]{64}$/.test(token)) return undefined;
    const entry = this.entries.get(token);
    if (!entry || entry.kind !== kind) return undefined;
    if (entry.expiresAt <= this.now()) {
      entry.lifetime.abort();
      this.entries.delete(token);
      return undefined;
    }
    return entry;
  }

  invalidateSession(playbackSessionId: string): void {
    for (const [token, entry] of this.entries) if (entry.playbackSessionId === playbackSessionId) {entry.lifetime.abort();this.entries.delete(token);}
  }

  invalidateOwner(ownerId: string): void {
    for (const [token, entry] of this.entries) if (entry.ownerId === ownerId) {entry.lifetime.abort();this.entries.delete(token);}
  }

  clear(): void { for(const entry of this.entries.values())entry.lifetime.abort();this.entries.clear(); }
}

export async function createRemoteMediaResponse(
  request: Request,
  registry: RemoteMediaSessionRegistry,
  fetcher?: typeof fetch
): Promise<Response> {
  try {
    const url = new URL(request.url);
    if (url.hostname !== "provider" && url.hostname !== "radio") return new Response("Not found", { status: 404 });
    const kind = url.hostname as RemoteMediaKind;
    const token = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const entry = registry.resolve(kind, token);
    if (!entry) return new Response("Not found", { status: 404 });
    const headers = new Headers(entry.requestHeaders);
    const requestedRange = request.headers.get("range");
    if (requestedRange) {
      if (!/^bytes=\d*-\d*$/.test(requestedRange)) return new Response("Invalid range", { status: 416 });
      headers.set("Range", requestedRange);
    }
    const signal=AbortSignal.any([request.signal,entry.lifetime.signal]);
    const upstream = await (fetcher??(kind==="provider"?pinnedMediaFetch:fetch))(entry.url, { headers, redirect: "error", signal });
    if(signal.aborted){await upstream.body?.cancel();return new Response("Not found",{status:404});}
    if (![200, 206].includes(upstream.status) || !upstream.body) return new Response("Upstream unavailable", { status: 502 });
    let contentType = upstream.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    // Kugou's authorized web CDN labels MP3 as octet-stream. Require actual
    // MPEG frames from the same scoped HTTPS URL; never trust the extension alone.
    if(contentType==='application/octet-stream'&&kind==='provider'&&entry.ownerId==='kugou'&&entry.url.hostname==='webfs.kugou.com'&&entry.url.pathname.endsWith('.mp3')){
      try{entry.verifiedMp3??=await verifyMp3Prefix(entry.url,signal,fetcher??pinnedMediaFetch);}
      catch{await upstream.body.cancel();throw new Error('MEDIA_FORMAT_UNVERIFIED');}
      if(signal.aborted){await upstream.body.cancel();return new Response('Not found',{status:404});}
      if(entry.verifiedMp3)contentType='audio/mpeg';
    }
    if (!contentType?.startsWith("audio/") && contentType !== "application/ogg") {
      await upstream.body.cancel();
      return new Response("Unsupported media", { status: 415 });
    }
    const responseHeaders = new Headers({
      ...audioCorsHeaders(request),
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "Accept-Ranges": upstream.headers.get("accept-ranges") === "bytes" ? "bytes" : "none"
    });
    for (const name of ["content-length", "content-range"] as const) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    return new Response("Upstream unavailable", { status: 502 });
  }
}
