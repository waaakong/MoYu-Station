import type { QueueItem } from "@studyroom/contracts";
import { describe, expect, it, vi } from "vitest";
import { temporaryWebTrack } from "../src/services/webLocalAudio";
import { persistentWebQueue } from "../src/stores/queue";

describe("web production temporary audio", () => {
  it("creates a transient playable track without exposing a file path", () => {
    vi.stubGlobal("window", { addEventListener: vi.fn() });
    vi.stubGlobal("crypto", { randomUUID: () => "temporary-id" });
    const track = temporaryWebTrack(
      { name: "quiet-room.flac", size: 1024, type: "audio/flac" },
      () => "blob:https://moyustation.xyz/local-audio",
      vi.fn()
    );
    expect(track).toMatchObject({
      id: "web-file:temporary-id",
      title: "quiet-room",
      source: { kind: "builtin", assetId: "blob:https://moyustation.xyz/local-audio" }
    });
    expect(JSON.stringify(track)).not.toContain("C:\\");
  });

  it("rejects a disguised non-audio file", () => {
    expect(() => temporaryWebTrack(
      { name: "notes.txt", size: 12, type: "text/plain" },
      () => "blob:https://moyustation.xyz/not-audio",
      vi.fn()
    )).toThrow("WEB_AUDIO_FILE_TYPE_UNSUPPORTED");
  });

  it("removes blob-backed tracks from the persistent web queue", () => {
    const transient = {
      id: "queue:temporary",
      queuedAt: 1,
      track: { id: "web-file:1", title: "临时", artist: "本机", source: { kind: "builtin", assetId: "blob:https://moyustation.xyz/1" } }
    } as QueueItem;
    const ambient = {
      id: "queue:builtin",
      queuedAt: 2,
      track: { id: "builtin:1", title: "内置", artist: "墨屿", source: { kind: "builtin", assetId: "/assets/rain.ogg" } }
    } as QueueItem;
    expect(persistentWebQueue([transient, ambient])).toEqual([ambient]);
  });
});
