import { describe, expect, it } from "vitest";
import {
  ELECTRON_CAPABILITIES,
  ENTERTAINMENT_STATE_IDS,
  IPC_CHANNELS,
  WEB_CAPABILITIES,
  type PlaybackState,
  type QueueItem
} from "../src";

describe("shared contracts", () => {
  it("keeps web-only capabilities disabled", () => {
    expect(WEB_CAPABILITIES.platform).toBe("web");
    expect(WEB_CAPABILITIES.localLibrary).toBe(false);
    expect(WEB_CAPABILITIES.secureCredentials).toBe(false);
    expect(WEB_CAPABILITIES.publicRadio).toBe(true);
    expect(WEB_CAPABILITIES.providerLogin).toBe(false);
  });

  it("exposes desktop capabilities without generic IPC channels", () => {
    expect(ELECTRON_CAPABILITIES.localLibrary).toBe(true);
    expect(ELECTRON_CAPABILITIES.publicRadio).toBe(true);
    expect(ELECTRON_CAPABILITIES.providerLogin).toBe(true);
    expect(Object.values(IPC_CHANNELS)).not.toContain("database:query");
    expect(Object.values(IPC_CHANNELS)).not.toContain("ipc:send");
    expect(ENTERTAINMENT_STATE_IDS).toEqual(["preferences", "breathing", "wooden-fish", "memory-cards", "fish-sorting", "puzzle", "game2048", "minesweeper", "spider"]);
    expect(IPC_CHANNELS.readEntertainmentState).toBe("entertainment:read-state");
    expect(IPC_CHANNELS.saveEntertainmentState).toBe("entertainment:save-state");
  });

  it("serializes queue and playback state without native objects", () => {
    const queue: QueueItem[] = [{
      id: "queue-1",
      queuedAt: 1_789_200_000_000,
      track: {
        id: "track-1",
        title: "Rain on the window",
        artist: "Local library",
        source: { kind: "local", fileToken: "file-token-1" }
      }
    }];
    const playback: PlaybackState = {
      status: "paused",
      currentItemId: "queue-1",
      positionMs: 30_000,
      durationMs: 180_000,
      volume: 0.72,
      muted: false,
      shuffle: false,
      repeatMode: "off"
    };

    expect(JSON.parse(JSON.stringify({ queue, playback }))).toEqual({ queue, playback });
  });
});
