import type { ProviderTrackRef } from "@studyroom/contracts";
import type { RawProviderTrack } from "./providerAdapter";
import { artworkSource } from './artworkSource';

const VERSION_TAGS = ["live", "remix", "cover", "acoustic", "instrumental"] as const;

export function normalizeText(value: string): string {
  return value.normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractVersionTags(...values: Array<string | undefined>): string[] {
  const text = normalizeText(values.filter(Boolean).join(" "));
  return VERSION_TAGS.filter((tag) => new RegExp(`(?:^|\\s)${tag}(?:$|\\s)`, "i").test(text));
}

export function normalizeProviderTrack(raw: RawProviderTrack): ProviderTrackRef {
  const title = raw.title.normalize("NFKC").trim();
  const artists = raw.artists.map((artist) => artist.normalize("NFKC").trim()).filter(Boolean).slice(0, 20);
  if (!title || !artists.length) throw new Error("PROVIDER_INVALID_TRACK");
  return {
    id: `${raw.providerId}:${raw.trackId}`,
    providerId: raw.providerId,
    trackId: raw.trackId,
    title,
    artists,
    album: raw.album?.normalize("NFKC").trim() || undefined,
    artworkUrl: artworkSource(raw.providerId, raw.artworkUrl),
    durationMs: raw.durationMs,
    isrc: raw.isrc?.replace(/[^a-z0-9]/gi, "").toUpperCase() || undefined,
    versionTags: extractVersionTags(raw.title, raw.album),
    quality: raw.quality ?? "unknown",
    rights: raw.rights ?? "unavailable",
    badges: raw.badges,
    isAvailable: raw.available ?? raw.rights === "available",
    unavailableReason: raw.available === false ? "PROVIDER_UNAVAILABLE" : undefined
  };
}
