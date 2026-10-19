import { describe, expect, it } from "vitest";
import { IPC_CHANNELS, type LocalProfileSummary } from "../src";

describe("local profile contract", () => {
  it("uses one narrow read-only IPC channel", () => {
    expect(IPC_CHANNELS.readLocalProfileSummary).toBe("profile:read-local-summary");
  });

  it("serializes aggregate values without local identifiers", () => {
    const summary: LocalProfileSummary = {
      status: "available",
      trackCount: 12,
      queueItemCount: 4,
      playlistCount: 2,
      focusRecordCount: 8,
      latestFocusAt: 1_789_200_000_000,
      hasEntertainmentSettings: true,
      storageBytes: 8192
    };
    expect(Object.keys(summary).sort()).toEqual([
      "focusRecordCount",
      "hasEntertainmentSettings",
      "latestFocusAt",
      "playlistCount",
      "queueItemCount",
      "status",
      "storageBytes",
      "trackCount"
    ]);
    expect(JSON.stringify(summary)).not.toMatch(/path|file|directory|username|credential|url/i);
  });

  it("represents the web fallback without fake counts", () => {
    const summary: LocalProfileSummary = { status: "desktop-required" };
    expect(summary).toEqual({ status: "desktop-required" });
  });
});
