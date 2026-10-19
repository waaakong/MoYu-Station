import { describe, expect, it } from "vitest";
import type { ProviderTrackRef } from "@studyroom/contracts";
import { aggregateProviderTracks } from "../src/providers/core/searchOrchestrator";
import { matchTracks } from "../src/providers/core/trackMatcher";
import { normalizeProviderTrack } from "../src/providers/core/trackNormalizer";

function track(providerId: ProviderTrackRef["providerId"], overrides: Partial<ProviderTrackRef> = {}): ProviderTrackRef {
  return {
    id: `${providerId}:1`, providerId, trackId: "1", title: "Quiet Rain", artists: ["Moyu"],
    album: "Night Study", durationMs: 180_000, versionTags: [], quality: "high",
    rights: "available", isAvailable: true, ...overrides
  };
}

describe("track normalization and matching", () => {
  it("normalizes unicode metadata and version tags", () => {
    const result = normalizeProviderTrack({
      providerId: "netease", trackId: "1", title: "  Ｑｕｉｅｔ Rain (Live) ", artists: [" Moyu "],
      album: "Concert", isrc: "cn-a01-24-00001", rights: "available", available: true
    });
    expect(result.title).toBe("Quiet Rain (Live)");
    expect(result.isrc).toBe("CNA012400001");
    expect(result.versionTags).toContain("live");
  });

  it("uses exact ISRC and rejects different recording versions", () => {
    expect(matchTracks(track("netease", { isrc: "CNA012400001" }), track("qq", { isrc: "CNA012400001" }))).toMatchObject({ confidence: "exact", score: 1 });
    expect(matchTracks(track("netease", { versionTags: ["live"] }), track("qq"))).toMatchObject({ confidence: "separate", score: 0 });
    expect(matchTracks(track("netease", { isrc: "CNA012400001", versionTags: ["live"] }), track("qq", { isrc: "CNA012400001" }))).toMatchObject({ confidence: "separate", score: 0 });
  });

  it("groups high-confidence results but keeps uncertain results separate", () => {
    const items = aggregateProviderTracks([
      track("netease"),
      track("qq", { id: "qq:2", trackId: "2", durationMs: 180_400 }),
      track("kugou", { id: "kugou:3", trackId: "3", title: "Another Song" })
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.candidates).toHaveLength(2);
    expect(items[0]?.matchConfidence).toBe("high");
  });

  it("marks possible matches without combining their sources", () => {
    const items = aggregateProviderTracks([
      track("netease"),
      track("qq", { id: "qq:2", trackId: "2", album: "Other release", durationMs: 182_000 })
    ]);
    expect(items).toHaveLength(2);
    expect(items[1]?.matchConfidence).toBe("possible");
    expect(items[1]?.candidates).toHaveLength(1);
  });
});
