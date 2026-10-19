import { describe, expect, it } from "vitest";
import { radioStationTrack } from "../src/services/radio";
import { aggregatedTrackToQueueTrack } from "../src/stores/providers";
import { RADIO_RECONNECT_DELAYS } from "../src/stores/radio";

describe("online audio renderer models", () => {
  it("keeps provider queue items free of remote locations", () => {
    const track = aggregatedTrackToQueueTrack({
      id: "aggregate:1", title: "Quiet", artists: ["Moyu"], matchConfidence: "high",
      candidates: [
        { id: "n:1", providerId: "netease", trackId: "1", title: "Quiet", artists: ["Moyu"], versionTags: [], quality: "high", rights: "available", isAvailable: true, matchScore: 1 },
        { id: "q:1", providerId: "qq", trackId: "2", title: "Quiet", artists: ["Moyu"], versionTags: [], quality: "standard", rights: "available", isAvailable: true, matchScore: 0.97 }
      ]
    }, ["qq", "netease", "kugou"]);
    expect(track.source).toEqual({ kind: "provider", providerId: "qq", trackId: "2" });
    expect(JSON.stringify(track)).not.toMatch(/https?:\/\/|authorization|cookie|headers/i);
  });

  it("models audited stations as live queue tracks and uses bounded reconnects", () => {
    const track = radioStationTrack({ id: "station", name: "Station", category: "Focus", format: "mp3", artworkToken: "groove-salad" });
    expect(track.source).toEqual({ kind: "radio", stationId: "station" });
    expect(track.artworkUrl).toMatch(/groove-salad|data:image/);
    expect(RADIO_RECONNECT_DELAYS).toEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
  });
});
