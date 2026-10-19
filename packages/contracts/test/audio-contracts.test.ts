import { describe, expect, it } from "vitest";
import {
  IPC_CHANNELS,
  PROVIDER_IDS,
  type ProviderAccountSummary,
  type AggregatedTrack,
  type SourceCandidate,
  type SoundSettings,
  type SoundSnapshot,
  type TrackSource
} from "../src";

const settings: SoundSettings = {
  version: 1,
  musicBus: { volume: 0.8, muted: false },
  ambientBus: { volume: 0.45, muted: false },
  ambientTracks: [{
    id: "ambient-1",
    sourceId: "rain",
    volume: 0.35,
    pan: 0,
    muted: false,
    solo: false,
    fadeInMs: 800,
    fadeOutMs: 800,
    randomStart: true,
    status: "stopped"
  }],
  equalizer: {
    enabled: false,
    presetId: "flat",
    bands: [31, 62, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000]
      .map((frequencyHz) => ({ frequencyHz, gainDb: 0 }))
  },
  masterProcessing: {
    normalizationEnabled: false,
    lowVolumeCompensationEnabled: false,
    compressorEnabled: true
  },
  crossfadeSeconds: 4,
  visualizer: { mode: "spectrum", quality: "low" },
  outputDeviceId: "default"
};

describe("sound center contracts", () => {
  it("serializes sound settings and snapshots without native objects", () => {
    const snapshot: SoundSnapshot = {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Rain focus",
      state: {
        musicBus: settings.musicBus,
        ambientBus: settings.ambientBus,
        ambientTracks: settings.ambientTracks,
        equalizer: settings.equalizer,
        masterProcessing: settings.masterProcessing,
        crossfadeSeconds: settings.crossfadeSeconds,
        visualizer: settings.visualizer
      },
      updatedAt: 1_789_200_000_000
    };

    expect(JSON.parse(JSON.stringify({ settings, snapshot }))).toEqual({ settings, snapshot });
  });

  it("keeps every IPC channel explicit and unique", () => {
    const channels = Object.values(IPC_CHANNELS);
    expect(new Set(channels).size).toBe(channels.length);
    expect(channels).not.toContain("database:query");
    expect(channels).not.toContain("settings:set-any");
  });

  it("uses only the three reviewed provider identifiers", () => {
    expect(PROVIDER_IDS).toEqual(["netease", "qq", "kugou"]);
  });

  it("serializes provider audio metadata without secrets or remote locations", () => {
    const source: TrackSource = { kind: "provider", providerId: "kugou", trackId: "track-42" };
    const candidate: SourceCandidate = {
      id: "candidate-1",
      source,
      quality: "lossless",
      codec: "flac",
      bitrateKbps: 1_411,
      rights: "subscription-required",
      isAvailable: false,
      unavailableReason: "PROVIDER_RIGHTS_RESTRICTED"
    };
    const account: ProviderAccountSummary = {
      providerId: "kugou",
      state: "signed-in",
      displayName: "墨屿用户",
      avatarToken: "provider-artwork-token",
      capabilities: ["search", "playlists", "playback"]
    };
    const serialized = JSON.stringify({ candidate, account });

    expect(serialized).not.toMatch(/credential|cookie|authorization|headers/i);
    expect(serialized).not.toMatch(/https?:\/\//i);
    expect(JSON.parse(serialized)).toEqual({ candidate, account });
  });

  it("does not expose the retired renderer credential channels", () => {
    const channels = Object.values(IPC_CHANNELS) as string[];
    expect(channels).not.toContain("credentials:store-provider-session");
    expect(channels).not.toContain("credentials:has-provider-session");
    expect(channels).not.toContain("credentials:clear-provider-session");
  });

  it("keeps aggregated search metadata safe for renderer and queue persistence", () => {
    const aggregated: AggregatedTrack = {
      id: "aggregate:quiet-rain",
      title: "Quiet Rain",
      artists: ["Moyu"],
      matchConfidence: "high",
      candidates: [{
        id: "netease:1", providerId: "netease", trackId: "1", title: "Quiet Rain", artists: ["Moyu"],
        versionTags: [], quality: "high", rights: "available", isAvailable: true,
        matchBasis: "metadata", matchScore: 0.97
      }]
    };
    const serialized = JSON.stringify(aggregated);
    expect(serialized).not.toMatch(/https?:\/\/|authorization|cookie|headers/i);
    expect(aggregated.candidates[0]?.matchScore).toBeGreaterThanOrEqual(0.95);
  });
});
