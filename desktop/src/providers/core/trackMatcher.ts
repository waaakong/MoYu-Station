import type { MatchBasis, MatchConfidence, ProviderTrackRef } from "@studyroom/contracts";
import { normalizeText } from "./trackNormalizer";

export interface TrackMatch {
  basis: MatchBasis;
  confidence: MatchConfidence;
  score: number;
}

function tokens(value: string): Set<string> {
  return new Set(normalizeText(value).split(" ").filter(Boolean));
}

function similarity(left: string, right: string): number {
  const a = tokens(left);
  const b = tokens(right);
  if (!a.size && !b.size) return 1;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return (2 * shared) / Math.max(1, a.size + b.size);
}

function durationSimilarity(left?: number, right?: number): number {
  if (left == null || right == null) return 0.5;
  const difference = Math.abs(left - right);
  if (difference <= 1_500) return 1;
  if (difference >= 12_000) return 0;
  return 1 - difference / 12_000;
}

function hasVersionConflict(left: ProviderTrackRef, right: ProviderTrackRef): boolean {
  const a = new Set(left.versionTags);
  const b = new Set(right.versionTags);
  return [...a].some((tag) => !b.has(tag)) || [...b].some((tag) => !a.has(tag));
}

export function matchTracks(left: ProviderTrackRef, right: ProviderTrackRef): TrackMatch {
  if (hasVersionConflict(left, right)) {
    return { basis: "unmatched", confidence: "separate", score: 0 };
  }
  if (left.isrc && right.isrc && left.isrc === right.isrc) {
    return { basis: "isrc", confidence: "exact", score: 1 };
  }
  const score = Number((
    similarity(left.title, right.title) * 0.4
    + similarity(left.artists.join(" "), right.artists.join(" ")) * 0.3
    + durationSimilarity(left.durationMs, right.durationMs) * 0.2
    + similarity(left.album ?? "", right.album ?? "") * 0.1
  ).toFixed(4));
  if (score >= 0.95) return { basis: "metadata", confidence: "high", score };
  if (score >= 0.85) return { basis: "metadata", confidence: "possible", score };
  return { basis: "unmatched", confidence: "separate", score };
}
