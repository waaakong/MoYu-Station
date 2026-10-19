import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import { IPC_CHANNELS } from "@studyroom/contracts";
import type { LocalDatabaseStore } from "../src/database/database";
import { IpcGuard } from "../src/main/ipc/guard";
import { availableLocalProfileSummarySchema, noInputSchema } from "../src/main/ipc/validation";
import { LocalProfileService } from "../src/profile/localProfileService";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "studyroom-local-profile-"));
  temporaryDirectories.push(directory);
  return directory;
}

function fakeEvent(senderId: number, mainFrame = true): IpcMainInvokeEvent {
  const frame = {};
  return {
    sender: { id: senderId, mainFrame: frame },
    senderFrame: mainFrame ? frame : {}
  } as unknown as IpcMainInvokeEvent;
}

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("local profile summary", () => {
  it("combines aggregate counts with fixed database and cache sizes", () => {
    const directory = temporaryDirectory();
    const databasePath = join(directory, "studyroom.sqlite");
    const cacheDirectory = join(directory, "media-cache");
    mkdirSync(join(cacheDirectory, "artwork"), { recursive: true });
    writeFileSync(databasePath, Buffer.alloc(11));
    writeFileSync(`${databasePath}-wal`, Buffer.alloc(7));
    writeFileSync(join(cacheDirectory, "cover.webp"), Buffer.alloc(5));
    writeFileSync(join(cacheDirectory, "artwork", "nested.webp"), Buffer.alloc(3));
    const database = {
      readLocalProfileCounts: () => ({
        trackCount: 4,
        queueItemCount: 3,
        playlistCount: 2,
        focusRecordCount: 8,
        latestFocusAt: 1_789_200_000_000,
        hasEntertainmentSettings: true
      })
    } as unknown as LocalDatabaseStore;

    const summary = new LocalProfileService(database, databasePath, cacheDirectory).read();

    expect(summary).toEqual({
      status: "available",
      trackCount: 4,
      queueItemCount: 3,
      playlistCount: 2,
      focusRecordCount: 8,
      latestFocusAt: 1_789_200_000_000,
      hasEntertainmentSettings: true,
      storageBytes: 26
    });
    expect(JSON.stringify(summary)).not.toContain(directory);
  });

  it("accepts no renderer input and rejects extra private output fields", () => {
    expect(noInputSchema.parse(undefined)).toBeUndefined();
    expect(() => noInputSchema.parse({ path: "C:/private" })).toThrow();
    expect(() => availableLocalProfileSummarySchema.parse({
      status: "available",
      trackCount: 0,
      queueItemCount: 0,
      playlistCount: 0,
      focusRecordCount: 0,
      hasEntertainmentSettings: false,
      storageBytes: 0,
      databasePath: "C:/private/studyroom.sqlite"
    })).toThrow();
  });

  it("rejects a symbolic-link cache root instead of scanning outside app storage", () => {
    const directory = temporaryDirectory();
    const cacheTarget = join(directory, "cache-target");
    const cacheLink = join(directory, "media-cache");
    mkdirSync(cacheTarget);
    symlinkSync(cacheTarget, cacheLink, "junction");
    const database = {
      readLocalProfileCounts: () => ({
        trackCount: 0,
        queueItemCount: 0,
        playlistCount: 0,
        focusRecordCount: 0,
        hasEntertainmentSettings: false
      })
    } as unknown as LocalDatabaseStore;

    expect(() => new LocalProfileService(database, join(directory, "studyroom.sqlite"), cacheLink).read())
      .toThrow("LOCAL_PROFILE_STORAGE_UNSAFE");
  });

  it("inherits sender and per-channel frequency limits", async () => {
    let now = 100;
    const guard = new IpcGuard(7, 1, 1, () => now);
    await expect(guard.invoke(IPC_CHANNELS.readLocalProfileSummary, fakeEvent(8), () => true))
      .rejects.toThrow("IPC_SENDER_REJECTED");
    await expect(guard.invoke(IPC_CHANNELS.readLocalProfileSummary, fakeEvent(7), () => true)).resolves.toBe(true);
    await expect(guard.invoke(IPC_CHANNELS.readLocalProfileSummary, fakeEvent(7), () => true))
      .rejects.toThrow("IPC_RATE_LIMITED");
    now = 1_100;
    await expect(guard.invoke(IPC_CHANNELS.readLocalProfileSummary, fakeEvent(7), () => true)).resolves.toBe(true);
  });
});
