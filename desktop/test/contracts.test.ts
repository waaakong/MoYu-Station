import { describe, expect, it } from "vitest";
import { ELECTRON_CAPABILITIES, IPC_CHANNELS } from "../src/index";
import {
  focusRecordSchema,
  providerIdRequestSchema,
  providerLyricsRequestSchema,
  providerPageRequestSchema,
  providerPlaylistTracksRequestSchema,
  providerSearchRequestSchema,
  entertainmentStateRequestSchema,
  saveEntertainmentStateRequestSchema,
  playlistNameRequestSchema,
  soundSettingsRequestSchema,
  soundSnapshotRequestSchema,
  trackLyricOffsetSchema
} from "../src/main/ipc/validation";

it('accepts exact decimal cloud record IDs but rejects rounded numeric and out-of-range IPC values', () => {
  const record={clientRecordId:'11111111-1111-4111-8111-111111111111',startedAt:1,plannedMinutes:25,completedMinutes:25,status:'completed',syncStatus:'synced'};
  for(const cloudRecordId of ['9223372036854775807','2104509220480131074',42])expect(focusRecordSchema.parse({...record,cloudRecordId}).cloudRecordId).toBe(cloudRecordId);
  for(const cloudRecordId of ['9223372036854775808','01',Number('2104509220480131074'),0])expect(()=>focusRecordSchema.parse({...record,cloudRecordId})).toThrow();
});

function validSoundSettings() {
  return {
    version: 1 as const,
    musicBus: { volume: 0.8, muted: false },
    ambientBus: { volume: 0.4, muted: false },
    ambientTracks: [{
      id: "rain-1",
      sourceId: "rain" as const,
      volume: 0.3,
      pan: 0,
      muted: false,
      solo: false,
      fadeInMs: 500,
      fadeOutMs: 500,
      randomStart: true,
      status: "playing" as const
    }],
    equalizer: {
      enabled: false,
      presetId: "flat" as const,
      bands: [31, 62, 125, 250, 500, 1_000, 2_000, 4_000, 8_000, 16_000]
        .map((frequencyHz) => ({ frequencyHz, gainDb: 0 }))
    },
    masterProcessing: {
      normalizationEnabled: false,
      lowVolumeCompensationEnabled: false,
      compressorEnabled: true
    },
    crossfadeSeconds: 4,
    visualizer: { mode: "spectrum" as const, quality: "low" as const }
  };
}

describe("desktop contract entrypoint", () => {
  it("exposes only named capabilities and channels", () => {
    expect(ELECTRON_CAPABILITIES.platform).toBe("electron");
    expect(IPC_CHANNELS.getCapabilities).toBe("app:get-capabilities");
  });

  it("accepts bounded sound settings and rejects a seventh ambient track", () => {
    const settings = validSoundSettings();
    expect(soundSettingsRequestSchema.parse({ settings }).settings.crossfadeSeconds).toBe(4);
    expect(() => soundSettingsRequestSchema.parse({
      settings: { ...settings, ambientTracks: Array.from({ length: 7 }, (_, index) => ({ ...settings.ambientTracks[0], id: `ambient-${index}` })) }
    })).toThrow();
    expect(() => soundSettingsRequestSchema.parse({
      settings: { ...settings, ambientTracks: [settings.ambientTracks[0], { ...settings.ambientTracks[0], id: "rain-2" }] }
    })).toThrow(/DUPLICATE_AMBIENT_SOURCE/);
  });

  it("rejects malformed EQ frequencies and unsafe offsets", () => {
    const settings = validSoundSettings();
    const invalidBands = settings.equalizer.bands.map((band, index) => index === 0 ? { ...band, frequencyHz: 30 } : band);
    expect(() => soundSettingsRequestSchema.parse({
      settings: { ...settings, equalizer: { ...settings.equalizer, bands: invalidBands } }
    })).toThrow(/INVALID_EQUALIZER_FREQUENCIES/);
    expect(() => trackLyricOffsetSchema.parse({ trackId: "track-1", offsetMs: 10_001 })).toThrow();
    expect(() => trackLyricOffsetSchema.parse({ trackId: "track-1", offsetMs: 0.5 })).toThrow();
  });

  it("accepts bounded persisted stage settings without accepting arbitrary fields", () => {
    const settings = validSoundSettings();
    const stage = { composition: 'lyrics', tone: 'moon', cameraX: 8, cameraY: -6 };
    const request = { settings: { ...settings, visualizer: { ...settings.visualizer, stage } } };
    expect(soundSettingsRequestSchema.parse(request).settings.visualizer.stage).toEqual(stage);
    for (const invalid of [{ ...stage, cameraX: 9 }, { ...stage, cameraY: Number.NaN }, { ...stage, tone: 'arbitrary' }, { ...stage, url: 'file:///test' }]) {
      expect(() => soundSettingsRequestSchema.parse({ settings: { ...settings, visualizer: { ...settings.visualizer, stage: invalid } } })).toThrow();
    }
  });

  it("trims bounded names and rejects invalid snapshot identifiers", () => {
    expect(playlistNameRequestSchema.parse({ name: "  Focus  " }).name).toBe("Focus");
    const settings = validSoundSettings();
    const { version: _version, ...state } = settings;
    expect(() => soundSnapshotRequestSchema.parse({ snapshot: { id: "unsafe", name: "Focus", state } })).toThrow();
  });

  it("accepts only reviewed providers and bounded provider requests", () => {
    expect(providerIdRequestSchema.parse({ providerId: "kugou" })).toEqual({ providerId: "kugou" });
    expect(() => providerIdRequestSchema.parse({ providerId: "spotify" })).toThrow();
    expect(providerSearchRequestSchema.parse({ providerId: "netease", query: "  rain  ", pageSize: 20 }).query).toBe("rain");
    expect(() => providerSearchRequestSchema.parse({ providerId: "qq", query: "x".repeat(201) })).toThrow();
    expect(() => providerSearchRequestSchema.parse({ providerId: "qq", query: "rain", credential: "secret" })).toThrow();
    expect(() => providerSearchRequestSchema.parse({ providerId: "qq", query: "rain", url: "https://example.invalid" })).toThrow();
    expect(() => providerPageRequestSchema.parse({ providerId: "qq", cursor: "x".repeat(501) })).toThrow();
    expect(() => providerPageRequestSchema.parse({ providerId: "qq", pageSize: 101 })).toThrow();
    expect(() => providerPlaylistTracksRequestSchema.parse({ providerId: "qq", playlistId: "x".repeat(301) })).toThrow();
    expect(() => providerLyricsRequestSchema.parse({ providerId: "qq", trackId: "x".repeat(301) })).toThrow();
  });

  it("removes renderer-writable credential IPC", () => {
    const channels = Object.values(IPC_CHANNELS) as string[];
    expect(channels).not.toContain("credentials:store-provider-session");
    expect(channels).not.toContain("credentials:has-provider-session");
    expect(channels).not.toContain("credentials:clear-provider-session");
  });

  it("exposes updater actions without renderer-controlled URLs or tokens", () => {
    expect(IPC_CHANNELS.checkForUpdates).toBe("updater:check");
    expect(IPC_CHANNELS.downloadUpdate).toBe("updater:download");
    expect(IPC_CHANNELS.updateStatusChanged).toBe("updater:status-changed");
    const channels = Object.values(IPC_CHANNELS).join(" ");
    expect(channels).not.toContain("feed-url");
    expect(channels).not.toContain("access-token");
  });

  it("accepts only bounded, matching entertainment state records", () => {
    const preferences = {
      version: 1 as const,
      toolId: "preferences" as const,
      soundEnabled: true,
      reducedMotion: false,
      solidBackground: false,
      lastToolId: "breathing" as const
    };
    expect(entertainmentStateRequestSchema.parse({ toolId: "breathing" })).toEqual({ toolId: "breathing" });
    expect(saveEntertainmentStateRequestSchema.parse({ toolId: "preferences", state: preferences }).state).toEqual(preferences);
    expect(() => entertainmentStateRequestSchema.parse({ toolId: "unknown" })).toThrow();
    expect(() => saveEntertainmentStateRequestSchema.parse({ toolId: "breathing", state: preferences })).toThrow(/ENTERTAINMENT_TOOL_MISMATCH/);
    expect(() => saveEntertainmentStateRequestSchema.parse({ toolId: "preferences", state: { ...preferences, sql: "DROP TABLE" } })).toThrow();
  });
});
