import { beforeEach, describe, expect, it, vi } from "vitest";
import { readLocalProfileSummary } from "../src/services/localProfile";

describe("local profile adapter", () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: globalThis });
    delete window.studyRoomDesktop;
  });

  it("reports an explicit desktop requirement on the web", async () => {
    await expect(readLocalProfileSummary()).resolves.toEqual({ status: "desktop-required" });
  });

  it("returns only the summary supplied by the desktop bridge", async () => {
    const summary = {
      status: "available" as const,
      trackCount: 3,
      queueItemCount: 2,
      playlistCount: 1,
      focusRecordCount: 4,
      latestFocusAt: 1_789_200_000_000,
      hasEntertainmentSettings: true,
      storageBytes: 4096
    };
    const read = vi.fn().mockResolvedValue(summary);
    window.studyRoomDesktop = { readLocalProfileSummary: read } as never;

    await expect(readLocalProfileSummary()).resolves.toEqual(summary);
    expect(read).toHaveBeenCalledOnce();
  });
});
